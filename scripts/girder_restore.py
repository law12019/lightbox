# Restore the gird items and files back into a gorder server.


import sys
import os
import pdb
import girder_client
import json
import cPickle as pickle



def copy_girder_annotation(annotation):
    # make a copy of the annotation because josn has trouble with
    # u"strings"
    annot_copy = {"elements":[],"name":str(annotation["name"])}
    '''
    for e in annotation["elements"]:
        if e['type'] != 'view':
            element = {"type":str(e["type"]), \
                       "height":e["height"],"width":e["width"], \
                       "rotation":e["rotation"]}
            if "lineColor" in e:
                element["lineColor"] = str(e["lineColor"])
            if "lineWidth" in e:
                element["lineWidth"] = float(e["lineWidth"])
            #if "scalar" in e:
            #    element["scalar"] = float(e["scalar"])
            element["center"] = [e["center"][0],e["center"][1],0]
            annot_copy["elements"].append(element)
    '''
    return annot_copy






# really to convert unicode to strings.
def copy_item(item):
    if type(item) is unicode:
        return item.encode('ascii','ignore')
    elif type(item) is dict:
        return copy_dict(item)
    elif type(item) is list:
        return copy_list(item)
    else: 
        return item

# really to convert strings.
def copy_dict(obj):
    copy = {}
    for k in obj.keys():
        if type(k) is unicode:
            k = k.encode('ascii','ignore')
        copy[k] = copy_item(obj[k])
    return copy


# really to convert strings.
def copy_list(item_list):
    copy = []
    for item in item_list:
        copy.append(copy_item(item))
    return copy


def restore_annotation(gc, file_path, target_id):
    with open(file_path, 'rb') as json_data:
        annots = pickle.load(json_data)
        for annot in annots:
            annot = annot['annot']['annotation']
            if 'elements' in annot and len(annot['elements']) > 0:
                # convert unicode to strings
                #tmp = copy_dict(annot)
                tmp = copy_dict(annot)
                annot_name = tmp['name']
                # if the annotation already exists, overwrite it.
                resp = gc.get('annotation', parameters={'itemId':target_id, 'name':annot_name})
                if len(resp) > 0:
                    annot_id = resp[0]['_id']
                    gc.put('annotation/%s'%annot_id, json=tmp)
                else:
                    gc.post("annotation", parameters={"itemId":target_id}, json=tmp)



# dir_path is the disk directory containg all the folders contents.
# item_obj is the girder.json from dir_path.
# target_id is the target girder item to update. 
# Precondition: An item with this id must exist in girder.
# id will change, so the output id will be different than the input object.
def restore_item(gc, dir_path, item_obj, target_id):
    # retore the folders metadata.
    if 'meta' in item_obj:
        gc.addMetadataToItem(target_id, item_obj['meta'])

    largeImageFileId = ""
    if 'largeImage' in item_obj:
        largeImageFileId = item_obj['largeImage']['fileId'] 

    # Make a dictionary of preexisting files in the target item so we can
    # overwrite them (they will not get duplicated when restoring more
    # than once).
    files_resp = gc.get('item/%s/files'%target_id)
    file_dict = {}
    for file_obj in files_resp:
        file_dict[file_obj['name']] = file_obj['_id']


    # handle the files and annotation
    for o in os.listdir(dir_path):
        file_path = os.path.join(dir_path, o)
        if os.path.isdir(file_path):
            # item directories have no sub directories
            continue

        if o == "annotation.pickle":
            restore_annotation(gc, file_path, target_id)

        elif o != 'girder.json':
            # TODO: pass in a stomp flag. (Or compare length)
            # Stomp on any existing file with the same name.
            #if o in file_dict:
            #    gd.delete('file/%s'%file_dict[o])
            # upload a file to the item
            if not o in file_dict:
                gc.uploadFileToItem(target_id, file_path)

    # Check and set large image activation.
    # TODO: point to a specific file id (need to modify dump because all we
    # have are names.
    # TODO: This fails when aout large image is on.  Check to see if it isa
    # laready a large image.
    #if 'largeImage' in item_obj:
    #    gc.post('item/%s/tiles'%target_id, parameters={'notify': 'false'})




# dir_path is the disk directory containg all the folders contents.
# folder_obj is the girder.json from dir_path.
# target_id is the target girder folder to update.
# id will change, so the output id will be different than the input object.
def restore_folder(gc, dir_path, folder_obj, target_id):
    # retore the folders metadata.
    if 'meta' in folder_obj:
        gc.addMetadataToFolder(target_id, folder_obj['meta'])

    # handle the subdirectories
    for o in os.listdir(dir_path):
        subpath = os.path.join(dir_path, o)
        if os.path.isdir(subpath):
            restore(gc,subpath, target_id)



# Directories can be a folder or an item.
# We do not know which until we read the girder.json file.
def restore(gc, dir_path, parent_folder_id):
    # first read in the girder object that will tell us whether this directory
    # is from a girder folder or item.
    obj_path = os.path.join(dir_path, 'girder.json')
    if not os.path.isfile(obj_path):
        print("%s json missing"%dir_path)
        return
    with open(obj_path, 'r') as f:
        obj = json.load(f)
    if not 'name' in obj or not '_modelType' in obj:
        print("%s json error"%dir_path)
        return
    name = obj['name']
    if obj['_modelType'] == 'item':
        print('item %s'%name)
        # If an item with this name alreay exists, use it.
        resp = gc.get('item', parameters={'folderId':parent_folder_id,'name':name})
        if len(resp) > 0 :
            item_id = resp[0]['_id']
        else:
            item = gc.createItem(parent_folder_id, name, obj['description'])
            item_id = item['_id']
        restore_item(gc, dir_path, obj, item_id)
    elif obj['_modelType'] == 'folder':
        print('folder %s'%name)
        # If an folder with this name alreay exists, use it.
        resp = gc.get('folder', parameters={'parentId':parent_folder_id, \
                                            'name':name, 'parentType':'folder'})
        if len(resp) > 0:
            folder_id = resp[0]['_id']
        else:
            folder = gc.createFolder(parent_folder_id, name, obj['description'])
            folder_id = folder['_id']
        restore_folder(gc, dir_path, obj, folder_id)


def print_usage():
    print("usage:")
    print("python %s serverName in_path, folder_id"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}


    if len(sys.argv) != 4:
        print_usage()
        exit()

    server_name = sys.argv[1]
    in_path = sys.argv[2]
    in_path = os.path.realpath(in_path)
    containing_folder_id = sys.argv[3]

    if not server_name in keys:
        print("Unknown server %s"%server_name)
        exit()

    gc = girder_client.GirderClient(apiUrl=urls[server_name])
    gc.authenticate('law12019', apiKey=keys[server_name])

    # This is not symetric with dump.
    # directory arg is the parent of the dumped folder.
    for o in os.listdir(in_path):
        subpath = os.path.join(in_path, o)
        restore(gc, subpath, containing_folder_id)
















