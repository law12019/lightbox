# Mark all images in a girder folder as large image viewable.


import os
import sys
import pdb
import girder_client



def print_usage():
    print("usage:")
    print("python %s serverName local_folder_path girder_folder_id"%sys.argv[0])


if __name__ == '__main__':

    keys = {'lemon':'', \
            'wsi2': ''}
    urls = {'lemon':'http://lemon/api/v1', \
            'wsi2': 'http://wsi2.slide-atlas.org:8080/api/v1'}


    if len(sys.argv) != 4:
        print_usage()
        exit()

    server_name = sys.argv[1]
    folder_path = sys.argv[2]
    folder_id = sys.argv[3]

    if not server_name in keys:
        print("Unknown server %s"%server_name)
        exit()

    gc = girder_client.GirderClient(apiUrl=urls[server_name])
    gc.authenticate('law12019', apiKey=keys[server_name])

    for file_name in os.listdir(folder_path):
        girder_item = gc.createItem(folder_id, file_name, "file uploaded by script")
        girder_image = gc.uploadFileToItem(girder_item['_id'], \
                                           os.path.join(folder_path, file_name))
















