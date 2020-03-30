# Create a mask from annotation.  Uses the same ROI as download region.


import sys
import os
import pdb
import girder_client
import json
import urllib2
import numpy as np
import scipy
import cv2
import math


def ensure_path(dir_path):
    parent, name = os.path.split(dir_path)
    if name == '':
        return
    ensure_path(parent)
    ensure_dir(dir_path)

def ensure_dir(dir_path):
    if not os.path.exists(dir_path):
        os.makedirs(dir_path)

# first and last point should be repeated.
# scan line approach
def fill_polygon(image, points, color):
    (xdim, ydim) = image.shape;
    xmax = xdim-1
    ymax = ydim-1
    # find the bounds of the poygon.
    bds = [xmax, 0, ymax, 0]
    for pt in points:
        x = int(math.floor(pt[0]))
        if x < bds[0]:
            bds[0] = x
        x = int(math.ceil(pt[0]))
        if x > bds[1]:
            bds[1] = x
        y = int(math.floor(pt[1]))
        if y < bds[2]:
            bds[2] = y
        y = int(math.ceil(pt[1]))
        if y > bds[3]:
            bds[3] = y
    if bds[0] < 0:
        bds[0] = 0
    if bds[1] > xmax:
        bds[1] = xmax
    if bds[2] < 0:
        bds[2] = 0
    if bds[3] > ymax:
        bds[3] = ymax
                




        
# not perfect, but it will do
def draw_line_segment(image, x0, y0, x1, y1):
    (dimy, dimx) = image.shape;
    dx = x1-x0
    dy = y1-y0
    numSteps = int(math.ceil(math.sqrt(dx*dx + dy*dy)))
    if numSteps == 0:
        return
    dx = dx / numSteps
    dy = dy / numSteps
    for i in range(numSteps+1):
        x = int(round(x0))
        y = int(round(y0))
        if x >= 0 and x < dimx and y > 0 and y < dimy:
            image[y,x] = 255
        x0 += dx
        y0 += dy
                 

def draw_large_roi(gc, item_id, element, path):
    spacing = int(math.pow(2,LEVEL))
    left = round((element['center'][0] - element['width']/2) / spacing)
    top = round((element['center'][1] - element['height']/2) / spacing)
    width = int(round(element['width'] / spacing))
    height = int(round(element['height'] / spacing))

    region = np.zeros((height, width), dtype=np.uint8)
    # get the vector annotation to draw
    annot_list = gc.get("annotation?itemId=%s&name=%s&limit=50"%(item_id, MASK_ANNOT_NAME))
    if len(annot_list) == 0:
        return
    annot = annot_list[0]
    annot_resp = gc.get("annotation/%s"%annot['_id'])
    elements = annot_resp['annotation']['elements']
    for element in elements:
        if element['type'] == 'polyline':
            numPts = len(element['points'])
            #pt0 = element['points'][numPts-1] # complete the loop
            pt0 = element['points'][0]
            for pt1 in element['points']:
                draw_line_segment(region, (pt0[0]/spacing)-left, \
                                  (pt0[1]/spacing)-top, \
                                  (pt1[0]/spacing)-left, \
                                  (pt1[1]/spacing)-top)
                pt0 = pt1
                
    # now save the image as a png.
    #scipy.misc.imsave(path+'.png', region)
    cv2.imwrite(path+'.png', region)





# out_path is the directory on disk to save the images.
# It must be created before this method is called.
# item_obj is an object returned by the girder api get/item call.
def dump_item(gc, item_obj, out_path):
    item_id = item_obj['_id']
    item_name = item_obj['name']
    # We do not use the directory name, but it is useful for
    # dubugging. However, it cannot have slashes.
    item_name = item_name.replace("/","-")
    # spaces are a pain
    item_name = item_name.replace(" ","_")

    # loop over all items with name ROI
    annot_list = gc.get("annotation?itemId=%s&name=%s&limit=50"%(item_id, ROI_ANNOT_NAME))
    count = 1
    for annot in annot_list:
        annot_resp = gc.get("annotation/%s"%annot['_id'])
        elements = annot_resp['annotation']['elements']
        for element in elements:
            if element['type'] == 'rectangle':
                roi_name = os.path.join(out_path,'%s_%d'%(item_name,count))
                count += 1
                draw_large_roi(gc, item_id, element, roi_name)
                #download_roi(gc, item_id, element, roi_name)


# parent_path directory must exist
def dump_folder(gc, folder_obj, out_path):
    folder_id = folder_obj['_id']

    # dump all items
    items_resp = gc.get("item?folderId=%s&limit=500"%folder_id)
    for item_obj in items_resp:
        dump_item(gc, item_obj, out_path)



def print_usage():
    print("usage:")
    print("python %s serverName girder_id roiAnnotName maskAnnotName mag outpath"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}

    if len(sys.argv) != 7:
        print_usage()
        exit()

    server_name = sys.argv[1]
    if not server_name in keys:
        print("Unknown server %s"%server_name)
        exit()

    gc = girder_client.GirderClient(apiUrl=urls[server_name])
    gc.authenticate('law12019', apiKey=keys[server_name])

    # can be a folder id or an item id.
    girder_id = sys.argv[2]
    ROI_ANNOT_NAME = sys.argv[3]
    MASK_ANNOT_NAME = sys.argv[4]
    LEVEL = int(sys.argv[5])
    out_path = sys.argv[6]
    out_path = os.path.realpath(out_path)
        
    ensure_dir(out_path)
    try:
        # Get the folder object
        folder_obj = gc.get("folder/%s"%girder_id)
        # now save to disk
        dump_folder(gc, folder_obj, out_path)
    except Exception as inst:
        print("not a folder")

    #try:
    # Get the item object
    item_obj = gc.get("item/%s"%girder_id)
    # now save to disk
    dump_item(gc, item_obj, out_path)
    #except Exception as inst:
    #print("not an item")










