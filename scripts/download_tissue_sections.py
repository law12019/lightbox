# This is a demo script.  It finds all tissue sections, crops them and downloads them as separate images.



import girder_client
import urllib2
import numpy as np
import scipy
import cv2


def load_low_res(gc, item_id, mag):
    chip_url = gc.urlBase + "item/%s/tiles/region?magnification=%f&encoding=JPEG&jpegQuality=95"%(item_id, mag)
    req = urllib2.Request(chip_url)
    req.add_header('Girder-Token', gc.token)
    try:
        resp = urllib2.urlopen(req)
        image = np.asarray(bytearray(resp.read()), dtype="uint8")
        image = cv2.imdecode(image, cv2.IMREAD_COLOR)
        return image
    except urllib2.HTTPError, err:
        if err.code == 400:
            print("Bad request!")
        elif err.code == 404:
            print("Page not found!")
        elif err.code == 403:
            print("Access denied!")
        else:
            print("Something happened! Error code %d" % err.code)
        return None



def load_high_res_region(gc, item_id, left, right, top, bottom):
    chip_url = gc.urlBase + "item/%s/tiles/region?left=%d&top=%d&right=%d&bottom=%s&units=base_pixels&magnification=10&exact=false&encoding=JPEG&jpegQuality=95&jpegSubsampling=0"%(item_id, left, top, right, bottom)
    
    req = urllib2.Request(chip_url)
    req.add_header('Girder-Token', gc.token)
    try:
        resp = urllib2.urlopen(req)
        image = np.asarray(bytearray(resp.read()), dtype="uint8")
        image = cv2.imdecode(image, cv2.IMREAD_COLOR)
        return image
    except urllib2.HTTPError, err:
        if err.code == 400:
            print("Bad request!")
        elif err.code == 404:
            print("Page not found!")
        elif err.code == 403:
            print("Access denied!")
        else:
            print("Something happened! Error code %d" % err.code)
        return None



if __name__ == '__main__':
    girder_item_id = "5915e6c3dd98b578723a0a21"
    girder_url = 'https://images.slide-atlas.org/api/v1'

    gc = girder_client.GirderClient(apiUrl=girder_url)

    # Load a low resolution version of the whole slide
    mag = 0.2
    img = load_low_res(gc, girder_item_id, mag)
    #cv2.imwrite("lowres.jpg", img);

    # Threshold the image
    grayscaled = cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    cv2.imwrite("gray.jpg", grayscaled);
    retval, threshold = cv2.threshold(grayscaled, 200, 255, cv2.THRESH_BINARY)
    cv2.imwrite("threshold.jpg", threshold);

    # Get rid of noise with morphological operations.
    kernel = np.ones((7,7),np.uint8)
    opening = cv2.morphologyEx(threshold, cv2.MORPH_OPEN, kernel)    
    cv2.imwrite("open.jpg", opening);
    closing = cv2.morphologyEx(opening, cv2.MORPH_CLOSE, kernel)
    cv2.imwrite("close.jpg", closing);

    # Use contours to segment the tissue islands
    im2, contours, hierarchy = cv2.findContours(closing, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    # This first sectionis the entire image (negating the image will porbably fix this.
    contours = contours[1:-1]

    count = 0
    for section in contours:
        print(count)
        x0 = np.min(section[...,0])
        x1 = np.max(section[...,0])+1
        y0 = np.min(section[...,1])
        y1 = np.max(section[...,1])+1
        # convert to the high res (40x) coordinate system
        x0 = int(x0 * 40/0.2)
        x1 = int(x1 * 40/0.2)
        y0 = int(y0 * 40/0.2)
        y1 = int(y1 * 40/0.2)
        region = load_high_res_region(gc, girder_item_id, x0, x1, y0, y1)
        cv2.imwrite("section%d.jpg"%count, region);
        count = count + 1

    










