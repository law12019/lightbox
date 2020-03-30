# dump all the annotations in the DigitalGlobe collection
# usage:
# python girder_dump_annotation out_path

# todo: Option to skip downloading / uploading file.
#       Best done as a sync script

# 2019/05/14:  Finished, but then gave an invalid item id message ....



import sys
import os
import pdb
import girder_client
import json
import urllib2
import cPickle as pickle



def ensure_path(dir_path):
    parent, name = os.path.split(dir_path)
    if name == '':
        return
    ensure_path(parent)
    ensure_dir(dir_path)

def ensure_dir(dir_path):
    if not os.path.exists(dir_path):
        os.makedirs(dir_path)



def dump_file(gc, file_id, out_path, indent=""):
    '''
    # It would be nice to get this from the client.
    GIRDER_URL = 'http://lemon'
    file_url = GIRDER_URL + "/api/v1/file/" + file_id + "/download"
    pdb.set_trace()
    req = urllib2.Request(file_url)
    req.add_header('Girder-Token', gc.token)
    try:
        resp = urllib2.urlopen(req)
        with open(out_path, 'w') as f:
            f.write(resp.read())
        #image = np.asarray(bytearray(resp.read()), dtype="uint8")
        #image = cv2.imdecode(image, cv2.IMREAD_COLOR)
        #print('image loaded')

    except urllib2.HTTPError, err:
        if err.code == 400:
            print("Bad request!")
        elif err.code == 404:
            print("Page not found!")
        elif err.code == 403:
            print("Access denied!")
        else:
            print("Something happened! Error code %d" % err.code)
    '''
    print(indent + "file: " + out_path)

    try:
        gc.downloadFile(file_id, out_path)
    except Exception as inst:
        print("---- ERROR downloading file !!!!!!!!!!!!!!!!!!")

    return None


# parent_path is the directory on disk of the containing folder.
# It must be created before this method is called.
# item_obj is an object returned by the girder api get/item call.
def dump_item(gc, item_obj, parent_path, indent=""):
    item_id = item_obj['_id']
    item_name = item_obj['name']
    # We do not use the directory name, but it is useful for
    # dubugging. However, it cannot have slashes.
    item_name = item_name.replace("/","-")
    # spaces are a pain
    item_name = item_name.replace(" ","_")
    item_path = os.path.join(parent_path,item_name)
    ensure_dir(item_path)
    print(indent + "item: " + item_path)
    indent = indent + "    "

    # Save the girder meta data for this item.
    meta_file_path = os.path.join(item_path,"girder.json")
    if not os.path.exists(meta_file_path):
        with open(meta_file_path, 'w') as f:
            json.dump(item_obj, f)

    # loop over the files in the item.
    files_resp = gc.get("item/%s/files?limit=500"%item_id)
    print(indent + item_path)
    for file in files_resp:
        file_id = file['_id']
        file_name = file['name']
        # Only save the ptifs (for transfer to lab a)
        if os.path.splitext(file_name)[1] != '.ptif':
            continue
        
        file_path = os.path.join(item_path, file_name)
        if not os.path.exists(file_path):
            dump_file(gc, file_id, file_path, indent)

    # Now download any annotation
    # We just keep all annotation associated with this item is a singe
    # pickle file.
    annot_file_path = os.path.join(item_path, 'annotation.pickle')
    if not os.path.exists(annot_file_path):
        annot_list = gc.get("annotation?itemId=%s&limit=100"%item_id)
        for annot in annot_list:
            annot_resp = gc.get("annotation/%s"%annot['_id'])
            # do we need to get rid of the view?
            # We could remove element labels.  
            # They never meant to get into the database.
            annot['annot'] = annot_resp
        if len(annot_list) > 0:
            with open(annot_file_path, 'wb') as outfile:
                pickle.dump( annot_list, outfile)

"""
# parent_path directory must exist
def dump_folder(gc, folder_obj, parent_path, indent=""):
    folder_name = folder_obj['name']
    # We do not use the directory name, but it is useful for
    # dubugging. However, it cannot have slashes.
    folder_name = folder_name.replace("/","-")
    # spaces are a pain
    folder_name = folder_name.replace(" ","_")
    folder_id = folder_obj['_id']
    folder_path = os.path.join(parent_path,folder_name)
    ensure_dir(folder_path)
    print(indent + "folder: " + folder_path)
    indent = indent + "    "

    # Save the girder meta data for this item.
    meta_file_path = os.path.join(folder_path,"girder.json")
    if not os.path.exists(folder_path):
        with open(meta_file_path, 'w') as f:
            json.dump(folder_obj, f)

    # dump all items
    items_resp = gc.get("item?folderId=%s&limit=500"%folder_id)
    for item_obj in items_resp:
        dump_item(gc, item_obj, folder_path, indent)

    # now lets get sub folders recursively.
    subfolders_resp = gc.get("folder?parentId=%s&parentType=folder&limit=500"%folder_id)
    for subfolder_obj in subfolders_resp:
        dump_folder(gc, subfolder_obj, folder_path, indent) 
"""

# parent_path directory must exist
# set_type is "collection" or "folder"
def dump(gc, obj, parent_type, parent_path, indent=""):
    name = obj['name']
    # We do not use the file system directory name, but it is useful for
    # dubugging. However, it cannot have slashes.
    name = name.replace("/","-")
    # spaces are a pain
    name = name.replace(" ","_")
    id = obj['_id']
    path = os.path.join(parent_path,name)
    ensure_dir(path)
    print("%s%s: %s"%(indent, parent_type, path))
    indent = indent + "    "

    # Save the girder meta data for this item.
    meta_file_path = os.path.join(path,"girder.json")
    if not os.path.exists(meta_file_path):
        with open(meta_file_path, 'w') as f:
            json.dump(obj, f)

    # dump all items
    if parent_type == 'folder':
        items_resp = gc.get("item?folderId=%s&limit=500"%id)
        for item_obj in items_resp:
            dump_item(gc, item_obj, path, indent)

    # now lets get sub folders recursively.
    subfolders_resp = gc.get("folder?parentId=%s&parentType=%s&limit=500"%(id, parent_type))
    for subfolder_obj in subfolders_resp:
        dump(gc, subfolder_obj, 'folder', path, indent) 



def print_usage():
    print("usage:")
    print("python %s serverName girder_id out_path"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'FrDcix7mge12uQfVEis46DuG8QuVgIY6Fn98MJJs', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}

    if len(sys.argv) != 4:
        print_usage()
        exit()

    server_name = sys.argv[1]
    if not server_name in keys:
        print("Unknown server %s"%server_name)
        exit()

    gc = girder_client.GirderClient(apiUrl=urls[server_name])
    gc.authenticate('law12019', apiKey=keys[server_name])

    girder_id = sys.argv[2]
    out_path = sys.argv[3]
    out_path = os.path.realpath(out_path)

    ensure_dir(out_path)
    try:
        # Get the collection object
        collection_obj = gc.get("collection/%s"%girder_id)
        # now save to disk
        dump(gc, collection_obj, 'collection', out_path)
    except Exception as inst:
        print("%s not a collection (%s)"%(girder_id, inst))

    try:
        # Get the folder object
        folder_obj = gc.get("folder/%s"%girder_id)
        # now save to disk
        dump(gc, folder_obj, 'folder', out_path)
    except Exception as inst:
        print("%s not a folder (%s)"%(girder_id, inst))

    try:
        # Get the item object
        item_obj = gc.get("item/%s"%girder_id)
        # now save to disk
        dump_item(gc, item_obj, out_path)
    except Exception as inst:
        print("%s not an item (%s)"%(girder_id, inst))










