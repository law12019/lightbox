# Mark all images in a girder folder as large image viewable.


import sys
import pdb
import girder_client



def print_usage():
    print("usage:")
    print("python %s serverName folder_id"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}


    if len(sys.argv) != 3:
        print_usage()
        exit()

    server_name = sys.argv[1]
    folder_id = sys.argv[2]

    if not server_name in keys:
        print("Unknown server %s"%server_name)
        exit()

    gc = girder_client.GirderClient(apiUrl=urls[server_name])
    gc.authenticate('law12019', apiKey=keys[server_name])

    resp = gc.get('item?folderId='+folder_id+'&limit=5000');
    for item in resp:
        try:
            gc.post('item/%s/tiles?notify=true'%item['_id'])
        except Exception as inst:
            print("Large image failed " + item['_id'])















