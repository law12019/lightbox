function output = uploadToGirder()


image=zeros(300,400,3); %initialize
 image(:,1:100,1)=0.5;   %Red (dark red)
 image(:,101:200,1)=1;   %Red (maximum value)
 image(1:100,:,2)=rand(100,400);
 
imwrite(image, 'test.jpg');
 
% Read file contents
try
    fid = fopen('test.jpg', 'rb');
    data = char(fread(fid)');
    fileLength = length(data);
    fclose(fid);
catch someException
    throw(addCause(MException('uploadToGirder:unableToReadFile','Unable to read input file.'),someException));
end


% Get the auth token
url = 'http://wsi2.slide-atlas.org:8080/api/v1/api_key/token';
key = 'aQIaVPPHBzO0EwQ25cAXhsn6zOu48L0yjcJvgVyY';
result = webwrite(url, 'key', key);
token = result.authToken.token;

% create the item
url2 = 'http://wsi2.slide-atlas.org:8080/api/v1/item';
folderId = '592de9b8dd98b573dbbc39c9';
name = 'Matlab Image';
description = 'I just want to see if I can create an item from a matlab script';
reuseExisting = false;
opt = weboptions('keyName','Girder-Token', 'keyValue',token);
itemResults = webwrite(url2, ...
    'folderId', folderId, ...
    'name', name, ...
    'description', description, ...
    'reuseExisting', reuseExisting, ...
    opt);
itemId = itemResults.x_id';


% post a message that we are going to upload a file.
url3 = sprintf('http://wsi2.slide-atlas.org:8080/api/v1/file?name=%s&parentId=%s&parentType=item&size=%d', ...
               'test.jpg', itemId, fileLength);
%url3 = 'http://wsi2.slide-atlas.org:8080/api/v1/file';
data3 = webwrite(url3, opt);
uploadId = data3.x_id;




% Generate the custom header
%headerFields = {'Authorization', ['Bearer ', girderAccessToken]};
%headerFields{2,1} = 'Content-Length';
%headerFields{2,2} = string(length(data));
%headerFields = string(headerFields);

%                  'MediaType', 'application/octet-stream', ...
opt = weboptions('keyName','Girder-Token', 'keyValue',token, ...
                  'MediaType', 'image/jpeg', ...
                  'RequestMethod', 'post', ...
                  'CharacterEncoding', 'ISO-8859-1');

% Set the options for WEBWRITE
%[~,remoteFName, remoteExt] = fileparts(fileName);

% Upload the file
url4 = sprintf('http://wsi2.slide-atlas.org:8080/api/v1/file/chunk?uploadId=%s&offset=0',uploadId)
%url4 = 'http://wsi2.slide-atlas.org:8080/api/v1/file/chunk?uploadId='+string(uploadId)+'&offset=0';


try
    data4 = webwrite(url4, data, opt);
catch someException
    throw(addCause(MException('uploadToGirder:unableToUploadFile','Unable to upload file.'),someException));
end

