#!python

# 5/14/2019

# Note: This does not capture the folder structure in the out directory.
# I am not sure how I would use this to restore. The folder struture is in the json files ...


# branched from downloadimages.py
# Sync disk folder with girder.
# Just store info in a flat folder structure.
# Similar to girder_dump, but uses json rather than pickle.
# Also it only saves ptifs.
# File names are item item ids.



import os
import json
from pathlib import Path
import pdb
import girder_client

def ensuredir(path):
    if path == "" or os.path.isdir(path):
        return
    ensuredir(os.path.split(path)[0])
    os.makedirs(path)




def process_file(file_id, dirpath, indent, root):
    resp = gc.get('file/%s'%file_id)
    with open(os.path.join(dirpath,'girder','file',file_id), 'w') as fp:
        json.dump(resp, fp)
    print(indent + "file: " + resp['name'])
    indent = indent + "  "

    # Down load the files.  These are large, so skip them if the exist on disk already.
    # assume the filename are unique.
    # skip the ptifs
    filename = resp['name']
    if os.path.splitext(filename)[1] == '.png':
        return
    if os.path.splitext(filename)[1] != '.ptif':
        if os.path.splitext(filename)[1] == '.tar' or os.path.splitext(filename)[1] == '':
            # Change the name of the tar file to match the png / digital globe name.
            new_filename = root+'.tar'
            if os.path.splitext(filename)[0] != root:
                gc.put('file/%s?name=%s'%(file_id, new_filename))
            filename = new_filename
        filepath = os.path.join(dirpath, 'files', filename)
        if not os.path.isfile(filepath):
            print(indent + "Downloading")
            gc.downloadFile(file_id,filepath)
        else:
            Path(filepath).touch()

    
def process_annot(annot_id, dirpath, indent):
    resp = gc.get('annotation/%s'%annot_id)
    with open(os.path.join(dirpath,'girder','annotation',annot_id), 'w') as fp:
        json.dump(resp, fp)
    print(indent + "annot: " + resp['annotation']['name'])



def process_item(item_id, dirpath, indent):
    resp = gc.get('item/%s'%item_id)
    with open(os.path.join(dirpath,'girder','item',item_id), 'w') as fp:
        json.dump(resp, fp)
    print(indent + "item: " + resp['name'])
    indent = indent + "  "
    root = resp['description']
    
    resp = gc.get('item/%s/files?limit=50'%item_id)
    for f in resp:
        process_file(f['_id'], dirpath, indent, root)

    resp = gc.get('annotation?itemId=%s&limit=5000'%item_id)
    for annot in resp:
        process_annot(annot['_id'], dirpath, indent)


    
def process_folder(folder_id, dirpath, indent):
    resp = gc.get('folder/%s'%folder_id)
    with open(os.path.join(dirpath,'girder','folder',folder_id), 'w') as fp:
        json.dump(resp, fp)
    print(indent + "folder: " + resp['name'])
    indent = indent + "  "

    resp = gc.get('folder?parentType=folder&parentId=%s&limit=5000'%folder_id)
    for sub_folder in resp:
        process_folder(sub_folder['_id'], dirpath, indent)
        
    resp = gc.get('item?folderId=%s&limit=5000'%folder_id)
    for item in resp:
        process_item(item['_id'], dirpath, indent)

        

def process_collection(collection_id, dirpath, indent):
    resp = gc.get('collection/%s'%collection_id)
    with open(os.path.join(dirpath,'girder','collection',collection_id), 'w') as fp:
        json.dump(resp, fp)
    print(indent + "collection: " + resp['name'])
    indent = indent + "  "
        
    resp = gc.get('folder?parentType=collection&parentId=%s&limit=5000'%collection_id)
    for sub_folder in resp:
        sub_dirpath = os.path.join(dirpath, sub_folder['name'])
        process_folder(sub_folder['_id'], dirpath, indent)
        
    resp = gc.get('item?folderId=%s&limit=5000'%folder_id)
    for item in resp:
        process_item(item['_id'], dirpath, indent)



if __name__ == '__main__':
    GIRDER_URL = 'http://lemon:80'
    GIRDER_USERNAME = "law12019"
    GIRDER_KEY = 'bgo3tHI6IsrbjZxWfkX5chp9FvyrKIRsJbJp9kJy'
    
    gc = girder_client.GirderClient(apiUrl= GIRDER_URL+'/api/v1')
    gc.authenticate(GIRDER_USERNAME, apiKey=GIRDER_KEY)
    
    dirpath = './lemon'
    girder_collection_id = '5c4549971841c11212b75689'

    ensuredir(os.path.join(dirpath, 'girder'))
    ensuredir(os.path.join(dirpath, 'girder/collection'))
    ensuredir(os.path.join(dirpath, 'girder/folder'))
    ensuredir(os.path.join(dirpath, 'girder/item'))
    ensuredir(os.path.join(dirpath, 'girder/annotation'))
    ensuredir(os.path.join(dirpath, 'girder/file'))
    ensuredir(os.path.join(dirpath, 'files'))
    
    process_collection(girder_collection_id, dirpath, indent = "")

    #process_folder('5c62f1ad1841c1190899e03c', dirpath, indent = "")



