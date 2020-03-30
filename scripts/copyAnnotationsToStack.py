# a script to import annotations saved in kw18 files to girder.
# assumes the name of the kw18 file matches the item name. 


import time
from datetime import date
import girder_client
import girder as g
import sys
import os
import csv
import pdb
import csv
from pprint import pprint


def process_stack(gc, stack_id):
    # A dictionary to keep track of the output stack annotaions (indexed by the annotations name).
    stack_annotations = {}

    resp = gc.get('item/%s'%stack_id)
    folder_id = resp['folderId']
    items = gc.get('item?folderId=%s&limit=5000&offset=0&sort=lowerName&sortdir=1'%folder_id)
    stack = []
    for item in items:
        if 'largeImage' in item:
            frame_id = item['_id']
            idx = len(stack)
            print("Processing frame %d"%idx)
            stack.append(item)

            # get all the annotations ids for this image.
            resp = gc.get('annotation?itemId=%s&limit=50'%frame_id)
            for annot_info in resp:
                annot_id = annot_info['_id']

                # Get the annotation elements.
                annot_resp = gc.get('annotation/%s'%annot_id)
                annot = annot_resp['annotation']
                annot_name = annot['name']
                elements = annot['elements']
                # Set the z index of all points to contain the frame index.
                for e in elements:
                    if e['type'] == 'rectangle':
                        e['center'][2] = idx
                # Append the elements into the stack annotation
                if annot_name in stack_annotations:
                    stack_annot = stack_annotations[annot_name]
                    stack_annot['elements'] = stack_annot['elements'] + elements
                else:
                    stack_annotations[annot_name] = annot

    # Now save the annotations in the stack item
    for annot_name in stack_annotations.keys():
        annot = stack_annotations[annot_name]
        resp = gc.get("annotation?itemId=%s&name=%s" % (stack_id, annot_name))
        if len(resp) > 0:
            resp = gc.put("annotation/%s"%resp[0]['_id'], parameters={"itemId":stack_id}, json=annot)
            print("Updating annotation: %s" % resp["_id"])
        else:
            resp = gc.post("annotation", parameters={"itemId":stack_id}, json=annot)
            print("New annotation: %s" % resp["_id"])

                



if __name__ == '__main__':
    keys = {'lemon':'', \
            'images': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'images': 'https://images.slide-atlas.org/api/v1'}

    server_name = 'images'
    gc = girder_client.GirderClient(apiUrl=urls[server_name])
    gc.authenticate('law12019', apiKey=keys[server_name])

    fish_folder_id = '5b68667670aaa94f2e5bd976'
    resp = gc.get('folder?parentType=folder&parentId=%s&limit=50&sort=lowerName&sortdir=1'%fish_folder_id)

    for folder in resp:
        # Get the stack id
        resp = gc.get('item?folderId=%s&name=.stack'%folder['_id'])
        stack_id = resp[0]['_id']

        name = folder['name']
        print('folder %s'%name)
        if name == 'ehu':
            continue
        """
        if name == 'Gindai':
            continue
        if name == 'grouper1':
            continue
        if name == 'grouper2':
            continue
        if name == 'grouper3':
            continue        
        if name == 'kalekale1':
            continue        
        if name == 'kalekale2':
            continue        
        if name == 'lehi':
            continue        
        if name == 'lehi1':
            continue        
        if name == 'lehi2':
            continue 
        if name == 'onaga1':
            continue
        if name == 'onaga2':
            continue
        if name == 'onaga3':
            continue
        if name == 'paka':
            continue
        """
        #stack_id = "5b68afba70aaa94f2e5c5a07"
        process_stack(gc, stack_id)
