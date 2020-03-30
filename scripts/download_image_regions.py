# For all images in a girder folder (or for a single item id):
#   For all rectangle annotations (default name ROI) in image
#      Download cropped image.


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


def download_roi(gc, item_id, element, path):
    left = round(element['center'][0] - element['width']/2)
    top = round(element['center'][1] - element['height']/2)
    width = round(element['width'])
    height = round(element['height'])
    #right = round(left + element['width'])
    #bottom = round(top + element['height'])
    # magnification=
    chip_url = gc.urlBase + "item/" + item_id + "/tiles/region?" + \
               ("left=%d&top=%d&" % (left, top)) + \
               ("regionWidth=%d&regionHeight=%d" % (width,height)) + \
               "&units=base_pixels&encoding=JPEG&jpegQuality=95&jpegSubsampling=0"
    req = urllib2.Request(chip_url)
    req.add_header('Girder-Token', gc.token)
    print('downloading ' + path)
    try:
        resp = urllib2.urlopen(req)
        image = np.asarray(bytearray(resp.read()), dtype="uint8")
        with open(path+'.jpg', 'wb') as file:
            file.write(image)
    except urllib2.HTTPError, err:
        if err.code == 400:
            print("Bad request!")
        elif err.code == 404:
            print("Page not found!")
        elif err.code == 403:
            print("Access denied!")
        else:
            print("Something happened! Error code %d" % err.code)



# I did not like the recompression in jpeg.  Ths avoids it by download the
# actual tiles and appending them.
def download_large_roi(gc, item_id, element, path):
    spacing = int(math.pow(2,LEVEL))
    left = round((element['center'][0] - element['width']/2) / spacing)
    top = round((element['center'][1] - element['height']/2) / spacing)
    width = int(round(element['width'] / spacing))
    height = int(round(element['height'] / spacing))

    progress = [0.0,100.0]
    remaining = progress[1]-progress[0]
    # get the image meta data
    meta = gc.get("item/%s/tiles" % item_id)
    # res: integer,  1 => highest res.
    res = 1
    level = meta['levels'] - res - LEVEL
    t_x = int(meta['tileWidth'])
    t_y = int(meta['tileHeight'])
    # dimensions of the highest res tile grid
    #dim_x = int(meta['sizeX'] / t_x)
    #dim_y = int(meta['sizeY'] / t_y)

    # get the tile index bounds.
    # get the range of tiles needed.
    i_bds = [int(math.floor(left/t_x)), \
             int(math.ceil((left+width)/t_x)), \
             int(math.floor(top/t_y)), \
             int(math.ceil((top+height)/t_y))]

    total = float(i_bds[1]-i_bds[0])*(i_bds[3]-i_bds[2])
    progress_period = min(100, int(total/10))
    count1 = 0;
    count2 = 0;
    # TODO: deal with partial tiles?
    region = np.zeros(((i_bds[3]-i_bds[2])*t_y, (i_bds[1]-i_bds[0])*t_x,
    3), dtype=np.uint8)
    # Get all of the tiles and fill the region.
    print("")
    for x in range(i_bds[0], i_bds[1]):
        xo = x - i_bds[0]
        for y in range(i_bds[2], i_bds[3]):
            yo = y - i_bds[2]
            tile_url = gc.urlBase+"item/%s/tiles/zxy/%d/%d/%d"%(item_id,level,x,y)
            req = urllib2.Request(tile_url)
            req.add_header('Girder-Token', gc.token)
            count1 = count1 + 1
            count2 = count2 + 1
            try:
                resp = urllib2.urlopen(req)
                image = np.asarray(bytearray(resp.read()), dtype="uint8")
                image = cv2.imdecode(image, cv2.IMREAD_COLOR)
                # copy into region.
                #print("%d:%d, %d:%d"% (yo*t_y, (yo+1)*t_y, xo*t_x,
                #(xo+1)*t_x))
                #print(image.shape)
                region[yo*t_y:(yo+1)*t_y, xo*t_x:(xo+1)*t_x] = image
            except urllib2.HTTPError, err:
                if err.code == 400:
                    print("Bad request!")
                elif err.code == 404:
                    print("Page not found!")
                elif err.code == 403:
                    print("Access denied!")
                else:
                    print("Something happened! Error code %d" % err.code)
                break
        if count2 > progress_period:
            count2 = 0
            # move up one line so the progress appears as a single line.
            print("\033[F %0.1f finished" % (progress[0] + remaining*(count1 / total)))
            
    # crop to the requested size.
    offset_y = int(top-(i_bds[2]*t_y))
    offset_x = int(left-(i_bds[0]*t_x))
    region = region[offset_y:offset_y+height, offset_x:offset_x+width]

    # now save the image as a png.
    #scipy.misc.imsave(path+'.png', region)
    cv2.imwrite(path+'.png', region)





# out_path is the directory on disk to save the images.
# It must be created before this method is called.
# item_obj is an object returned by the girder api get/item call.
def dump_item(gc, item_obj, annot_name, out_path):
    item_id = item_obj['_id']
    item_name = item_obj['name']
    # We do not use the directory name, but it is useful for
    # dubugging. However, it cannot have slashes.
    item_name = item_name.replace("/","-")
    # spaces are a pain
    item_name = item_name.replace(" ","_")

    # loop over all items with name ROI
    annot_list = gc.get("annotation?itemId=%s&name=%s&limit=50"%(item_id, annot_name))
    count = 1
    for annot in annot_list:
        annot_resp = gc.get("annotation/%s"%annot['_id'])
        elements = annot_resp['annotation']['elements']
        for element in elements:
            if element['type'] == 'rectangle':
                roi_name = os.path.join(out_path,'image%d'%count)
                count += 1
                download_large_roi(gc, item_id, element, roi_name)
                #download_roi(gc, item_id, element, roi_name)


# parent_path directory must exist
def dump_folder(gc, folder_obj, annot_name, out_path):
    folder_id = folder_obj['_id']

    # dump all items
    items_resp = gc.get("item?folderId=%s&limit=500"%folder_id)
    for item_obj in items_resp:
        dump_item(gc, item_obj, annot_name, out_path)



def print_usage():
    print("usage:")
    print("python %s serverName girder_id annotationName mag outpath"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}

    if len(sys.argv) != 6:
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
    annot_name = sys.argv[3]
    LEVEL = int(sys.argv[4])
    out_path = sys.argv[5]
    out_path = os.path.realpath(out_path)
        
    ensure_dir(out_path)
    try:
        # Get the folder object
        folder_obj = gc.get("folder/%s"%girder_id)
        # now save to disk
        dump_folder(gc, folder_obj, annot_name, out_path)
    except Exception as inst:
        print("not a folder")

    try:
        # Get the item object
        item_obj = gc.get("item/%s"%girder_id)
        # now save to disk
        dump_item(gc, item_obj, annot_name, out_path)
    except Exception as inst:
        print("not an item")










