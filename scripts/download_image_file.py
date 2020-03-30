# Download dna damage png and pass through a high pass filter.
# DNA pngs are 16 bit.  We loose pixel bit depth.  SOme cells are too bright.

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


        
# not perfect, but it will do
def draw_line_segment(image, x0, y0, x1, y1):
    (dimx, dimy) = image.shape;
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
            image[x,y] = 255
        x0 += dx
        y0 += dy
                 

# not perfect, but it will do
def draw_disk(image, cx, cy, radius):
    (dimy, dimx) = image.shape;
    xmin = int(math.floor(cx-radius))
    xmax = int(math.ceil(cx+radius))
    ymin = int(math.floor(cy-radius))
    ymax = int(math.ceil(cy+radius))

    if xmin < 0:
        xmin == 0
    if ymin < 0:
        ymin == 0
    if xmax > dimx:
        xmax = dimx;
    if ymax > dimy:
        ymax = dimy;

    #y,x = np.ogrid[-a:nx-a, -b:ny-b]
    #m = x*x + y*y <= r*r
    #mask = np.logical_or(mask, m)

    rad2 = radius*radius
    for x in range(xmin, xmax):
        for y in range(ymin, ymax):
            rx = x-cx
            ry = y-cy
            if rx*rx + ry*ry < rad2:
                image[y,x] = 255


# Download and save image region (tile by tile)
# then create a correspinding mask.
def process_item_roi(gc, item_id, roi, file_path_root):
    num_comps = 1

    print(file_path_root)
    
    spacing = int(math.pow(2,LEVEL))
    left = round(roi['left'] / spacing)
    top = round(roi['top'] / spacing)
    width = int(round(roi['width'] / spacing))
    height = int(round(roi['height'] / spacing)) 

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
    #region = np.zeros(((i_bds[3]-i_bds[2])*t_y, (i_bds[1]-i_bds[0])*t_x, num_comps), dtype=np.uint8)
    region = np.zeros(((i_bds[3]-i_bds[2])*t_y, (i_bds[1]-i_bds[0])*t_x), dtype=np.uint8)
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
                #image = cv2.imdecode(image, cv2.IMREAD_COLOR)
                image = cv2.imdecode(image, cv2.IMREAD_GRAYSCALE)
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
    #scipy.misc.imsave(file_path_root+'.png', region)
    cv2.imwrite(file_path_root+'.png', region)

    # And now the mask
    mask = np.zeros((height, width), dtype=np.uint8)
    # get the vector annotation to draw
    annot_list = gc.get("annotation?itemId=%s&name=%s&limit=50"%(item_id, MASK_ANNOT_NAME))
    if len(annot_list) == 0:
        return
    annot = annot_list[0]
    annot_resp = gc.get("annotation/%s"%annot['_id'])
    elements = annot_resp['annotation']['elements']
    for element in elements:
        if element['type'] == 'rectangle':
            draw_disk(mask,
                      (element['center'][0]/spacing)-left, \
                      (element['center'][1]/spacing)-top, \
                      3)
                
    # now save the image as a png.
    #scipy.misc.imsave(path+'.png', region)
    cv2.imwrite(file_path_root+'_mask.png', mask)


# out_path is the directory on disk to save the images.
# It must be created before this method is called.
# item_obj is an object returned by the girder api get/item call.
def dump_item(gc, item_obj, out_path):
    item_id = item_obj['_id']
    # change the item name into a file name.
    item_name = item_obj['name']
    item_name = item_name.replace("/","-")
    # spaces are a pain
    item_name = item_name.replace(" ","_")
    item_name = os.path.splitext(item_name)[0]
    
    file_path_root = os.path.join(out_path,'%s'%item_name)

    # Get the file.
    file_resp = gc.get("item/%s/files"%item_id)
    file_id = file_resp[0]['_id']

    tile_url = gc.urlBase+"file/%s/download"%file_id
    req = urllib2.Request(tile_url)
    req.add_header('Girder-Token', gc.token)
    resp = urllib2.urlopen(req)
    image = np.asarray(bytearray(resp.read()), dtype="uint8")
    #image = cv2.imdecode(image, cv2.IMREAD_COLOR)
    pdb.set_trace()
    image = cv2.imdecode(image, 2)
    print(image.shape)



    
# parent_path directory must exist
def dump_folder(gc, folder_obj, out_path):
    folder_id = folder_obj['_id']

    # dump all items
    items_resp = gc.get("item?folderId=%s&limit=500"%folder_id)
    for item_obj in items_resp:
        dump_item(gc, item_obj, out_path)



def print_usage():
    print("usage:")
    print("python %s serverName girder_id"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}

    if len(sys.argv) != 3:
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
    #out_path = sys.argv[5]
    out_path = os.path.realpath('~/tmp')

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
    #item_obj = gc.get("item/%s"%girder_id)
    # now save to disk
    #dump_item(gc, item_obj, out_path)
    #except Exception as inst:
    #print("not an item")










