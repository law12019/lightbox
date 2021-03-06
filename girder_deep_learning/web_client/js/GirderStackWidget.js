// GUI to navigate a stack and manager views.
// I will try to keep loading to "on demand" as much as possible.
// Put a section transform in the camera.
// Connect section bounds to camera section transform.
// Restrict viewer to bounds of section.
// Startup in the middle of the first bounds.

// TODO: If we can, delay creating the saSection until the cache root is loaded.

// TODO: Make sure that the annotation (stored in slide coordiantes) get
// transformed to section coordinates before they are rendered.

// NOTE: Three different sections. 

//   metaSection: loaded from the girder item metadata.
//   stackSection: object internal to this class.
//   saSection: Object slide atlas uses to manage sections.
// TODO: Merge these in the future if possible.


function GirderStackWidget (parent, display, apiRoot) {
  // We need a common center to treat as the center for the stack.
  // This is used to compute the transforms from the section centers.
  this.VolumeCenter = undefined;

  this.SectionIndex = -1;
  // Stuff needs to be initialized on the first render.
  this.First = true;
  this.ApiRoot = apiRoot;
  // List of stackSections
  this.Stack = [];
  // dictionary to share caches when multiple sections on one slide
  this.Caches = {};
  this.Display = display;

  var self = this;
  this.SliderDiv = $('<div>')
    .appendTo(parent)
    .css({
      // 'background-color': '#fff',
      // 'opacity': '0.2',
      'position': 'absolute',
      'left': '0px',
      'bottom': '0px',
      'width': '100%',
      'z-index': '10'})
    .on('keyup', function (e) { self.HandleKeyUp(e); })
    .hover(
      function () {
        self.SliderDiv.focus();
        // self.SliderDiv.css({'opacity': '1'});
      },
      function () {
        self.SliderDiv.blur();
        // self.SliderDiv.css({'opacity': '0.2'});
      });
  this.SliderDiv
    .slider({
      start: function (e, ui) { self.StartCallback(ui.value); },
      slide: function (e, ui) { self.SlideCallback(ui.value); },
      stop: function (e, ui) { self.StopCallback(ui.value); }
    });

  this.SlideLabel = $('<div>')
    .appendTo(this.SliderDiv)
    .css({
      'position': 'absolute',
      'top': '-25px',
      'text-align': 'center',
      'color': '#ddf',
      'text-shadow': '2px 2px #000'})
    .hide();
  }

GirderStackWidget.prototype.StartCallback = function (value) {
  this.SlideLabel.text(this.SectionIndex.toString());
  var x = 100 * value / (this.Stack.length - 1);
  this.SlideLabel.css({'left': x + '%'});
  this.SlideLabel.show();
};

GirderStackWidget.prototype.SlideCallback = function (value) {
  // TODO: Display the thumbnail (instead of the whold slide).
  // Does rending the whole image while sliding  cause too many tiles
  // requests?
  this.SetSectionIndex(value);
  var x = 100 * value / (this.Stack.length - 1);
  this.SlideLabel.text(value.toString());
  this.SlideLabel.css({'left': x + '%'});
};

GirderStackWidget.prototype.StopCallback = function (value) {
  this.SetSectionIndex(value);
  this.SlideLabel.text(value.toString());
  this.SlideLabel.hide();
};

GirderStackWidget.prototype.HandleKeyUp = function (e) {
  if (e.keyCode === 33) {
    // page up
    this.Previous();
    return false;
  } else if (e.keyCode === 34) {
    // page down
    this.Next();
    return false;
  }
  return true;
};

GirderStackWidget.prototype.Next = function () {
  this.SetSectionIndex(this.SectionIndex + 1);
};

GirderStackWidget.prototype.Previous = function () {
  this.SetSectionIndex(this.SectionIndex - 1);
};

// Load all the images in a folder as a stack.
GirderStackWidget.prototype.LoadFolder = function (folderId) {
  var self = this;
  this.Stack = [];
  this.SectionMap = {};
  // This just gets the number of items.
  // All we need to start is the number of images in the folder.
  // However, the folder may contain non image items (like this stack).
  this.ErrorCount = 0;
  if (window.girder) {
    girder.rest.restRequest({
      url: ('folder/' + folderId + '/details'),
      method: 'GET',
      contentType: 'application/json'
    }).done(function (resp) {
      // Just serialize loading the item info
      var length = resp.nItems;
      var limit = 100;
      self.LoadFolderImageIds(folderId, 0, limit, length);
    });
  }
};

// ============================================================================
// Load all the images in a folder as a stack.
// All this does is get the ids of the images in the folder.
// Image data is loaded on demand
GirderStackWidget.prototype.LoadFolderImageIds = function (folderId,
                                                           offset, limit, length) {
  var self = this;
  if (offset >= length) {
    // We have received all the ImageIds in the stack
    if (this.Stack.length > 0) {
      this.SetSectionIndex(0);
      // Get meta data for all images in the stack.
      this.ErrorCount = 0;
      this.LoadStackMetaData();
    }
    return;
  }

  // Get the next bite.
  girder.rest.restRequest({
    url: 'item?folderId=' + folderId + '&limit=' + limit +
      '&offset=' + offset + '&sort=lowerName&sortdir=1',
    method: 'GET',
    contentType: 'application/json',
    error: function (error, status) {
      self.ErrorCount += 1;
      if (self.ErrorCount < 100) {
        console.error(error.status + ' ' + error.statusText, error.responseText);
        // try again:
        self.LoadFolderImageIds(folderId, offset, limit, length);
      } else {
        console.log('Too many errors loading folder');
      }
    }
  }).done(function (resp) {
    for (var j = 0; j < resp.length; ++j) {
      var item = resp[j];
      var stackSection;
      // TODO: Handle small images too.
      if (item.largeImage) {
        if (item.meta && item.meta.sections) {
          // Add all the sections listed in the meta data.
          var metaSections = item.meta.sections;
          for (var sIdx = 0; sIdx < metaSections.length; ++sIdx) {
            var metaSection = metaSections[sIdx];
            stackSection = {imageId: item._id};
            if (metaSection.center) {
              stackSection.center = metaSection.center;
            }
            if (metaSection.bounds) {
              stackSection.bounds = metaSection.bounds;
            }
            self.Stack.push(stackSection);
          }
        } else {
          // Just add a single section (the whole slide)
          stackSection = {imageId: resp[j]._id};
          self.Stack.push(stackSection);
        }
      }
    }
    // Serialize the bites.
    self.LoadFolderImageIds(folderId, offset + limit, limit, length);
  });
};

// Does everything necessary to load the section into the viewer.
// Does nothing if the section is not loaded from the datbase yet.
GirderStackWidget.prototype.SetSectionIndex = function (index) {
  if (index >= this.Stack.length) {
    index = this.Stack.length - 1;
  }
    if (index < 0) {
      return;
    }
  if (this.SectionIndex === index) {
    return;
  }
  this.SectionIndex = index;
  this.RenderSection(this.Stack[index]);
};

// The section images must be loaded before this call.
GirderStackWidget.prototype.RenderSection = function (stackSection) {
  if (stackSection.SaSection === undefined) {
    return;
  }
  var cache = this.Caches[stackSection.imageId];
  if (cache === undefined || !cache.RootsLoaded) {
    // The load callback will render if the section is current.
    return;
  }
  // Here display is just a viewer.
  // We can only initialize the slide when all the image ids are loaded
  // and we know the length of the stack.  This will change with multiple
    // sections per image.
  if (this.First) {
    delete this.First;
    this.SliderDiv.slider('option', 'max', this.Stack.length - 1);
      // Only reset the camere on the first render.
    this.Display.SetCamera(
      [(stackSection.bounds[0] + stackSection.bounds[2]) / 2,
       (stackSection.bounds[1] + stackSection.bounds[3]) / 2],
      0, (stackSection.bounds[3] - stackSection.bounds[1]));
  }
  // Let the SlideAtlas sections deal with the transformations
  this.Display.SetSection(stackSection.SaSection);
  this.Display.EventuallyRender();
};

// ============================================================================
// Load minimal meta data for every section.  Throttle and Prioritize.
// It would be silly to make a general purpose queue when we know all the
// images that have to be loaded.  Just load them serially but compute a
// priority based on the current image index.
// Assume the stack is static.
GirderStackWidget.prototype.LoadStackMetaData = function () {
  if (this.ErrorCount > 100) {
    console.error('Too many errors loading item tile info.');
    return;
    }
  if (this.Stack.length === 0) {
    return;
  }
  // Find the next highest priority image info to load.
  var self = this;
  // Find the highest priority section whose image has not been loaded.
  var startIdx = Math.max(this.SectionIndex, 0);
  // Multi0le section can have the same image id.
  var foundSection = this.Stack[startIdx];
  if (foundSection.SaSection) {
    // already loaded
    foundSection = undefined;
  }

  var radius = 1;
  // Tolerate overshoot with startIdx+radius
  while (!foundSection && radius < this.Stack.length) {
    // Look forward.
    var idx = startIdx + radius;
    if (idx >= 0 && idx < this.Stack.length) {
      foundSection = this.Stack[idx];
      if (foundSection.SaSection) {
        // already loaded
        foundSection = undefined;
      }
    }
    // Look backward
    idx = startIdx - radius;
    if (!foundSection && idx >= 0 && idx < this.Stack.length) {
      foundSection = this.Stack[idx];
      if (foundSection.SaSection) {
        // already loaded
        foundSection = undefined;
      }
    }
    ++radius;
  }

  if (foundSection) {
    // Recursively call this method to throttle requests.
    this.CreateSaSection(foundSection,
                         function () { self.LoadStackMetaData(); });
  }
};

// This gets called to create the saSection.  It may need to make a cache
// and get the image data from the server to do it.
GirderStackWidget.prototype.CreateSaSection = function (stackSection, callback) {
  var cache = this.Caches[stackSection.imageId];
  if (cache) {
    // we have the cache already
    this.CreateSaSectionFromCache(stackSection, cache);
    if (callback) {
      (callback)();
    }
    return;
  }

  // We need to request image data from the server to setup the cache.
  var self = this;
  girder.rest.restRequest({
    url: 'item/' + stackSection.imageId + '/tiles',
    method: 'GET',
    contentType: 'application/json',
    error: function (error, status) {
      console.error(error.status + ' ' + error.statusText, error.responseText);
      this.ErrorCount += 1;
      if (callback) {
        (callback())();
      }
    }
  }).done(function (resp) {
    self.LoadItem(resp, stackSection, callback);
  });
};

GirderStackWidget.prototype.LoadItem = function (resp, stackSection, callback) {
  var w = resp.sizeX;
  var h = resp.sizeY;

  // There can be multiple sections on a single slide.
  // Each needs its own region.
  // Set a default bounds to the whole slide.
  if (stackSection.bounds === undefined) {
    stackSection.bounds = [0, w - 1, 0, h - 1];
  }
  // Set a default center to the middle of the bounds.
  if (stackSection.center === undefined) {
    var bds = stackSection.bounds;
    stackSection.center = [
      (bds[0] + bds[2]) * 0.5,
      (bds[1] + bds[3]) * 0.5];
  }
  // Get / setup the cache.
  var cache = this.Caches[stackSection.imageId];
  if (! cache) {
    cache = new SA.Cache();
    this.Caches[stackSection.imageId] = cache;
  }

  if (cache.Image === undefined) {
    var tileSource = new GirderTileSource(w, h, resp.tileWidth, resp.tileHeight,
                                          0, resp.levels - 1,
                                          this.ApiRoot, stackSection.imageId);
    cache.SetTileSource(tileSource);
    // Request the lowest resolution tile from girder.
    cache.LoadRoots();
  }
  // Setup the slideAtlas section
  var saSection = new SA.Section();
  saSection.AddCache(cache);
  stackSection.SaSection = saSection;

  // If this is the current stackSection, render it.
  if (this.SectionIndex !== -1) {
    var currentSection = this.Stack[this.SectionIndex];
    if (stackSection.imageId === currentSection.imageId) {
      this.RenderSection(currentSection);
    }
  };
  cache.SetTileSource(tileSource);
  // Request the lowest resolution tile from girder.
  cache.LoadRoots(
    function () {
      cache.RootsLoaded = true;
      // If this is the current stackSection, render it.
      if (this.SectionIndex !== -1) {
        var currentSection = this.Stack[this.SectionIndex];
        if (stackSection.imageId === currentSection.imageId) {
          this.RenderSection(currentSection);
        }
      }
    });
  this.CreateSaSectionFromCache(stackSection, cache);

  // This serializes the requests. Starts loading the next after the
  // current is finished.
  if (callback) {
    (callback)();
  }
};



GirderStackWidget.prototype.CreateSaSectionFromCache = function (stackSection, cache) {
  // If the girder meta data did not set up the section defaults, do it
  // here. The center is the first pass at the transformation.
  var image = cache.GetImageData();
  if (stackSection.bounds === undefined) {
    stackSection.bounds = [0, image.dimensions[0] - 1, 0, image.dimensions[1] - 1];
  }
  // Set a default center to the middle of the bounds.
  if (stackSection.center === undefined) {
    var bds = stackSection.bounds;
    stackSection.center = [(bds[0] + bds[2]) * 0.5,
                           (bds[1] + bds[3]) * 0.5];
  }

  // Setup the slideAtlas section
  var saSection = new SA.Section();
  saSection.AddCache(cache);
  stackSection.SaSection = saSection;
  if (stackSection.bounds) {
    var bds = stackSection.bounds;
    saSection.Bounds = [bds[0], bds[2], bds[1], bds[3]];
  }
  if (stackSection.center) {
    // Find the center of the whole slide.
    // Pick an arbitrary global/world center.
    if (this.VolumeCenter === undefined) {
      this.VolumeCenter = stackSection.center;
    }
    // Transform the volume center to the slide center.
    // Global/world to slide coordinat3e system.
    saSection.SetTransform(1, 0, 0, 1,
                           stackSection.center[0] - this.VolumeCenter[0],
                           stackSection.center[1] - this.VolumeCenter[1]);
  }
};


var GirderTileSource = function (width, height,
                                 tileWidth, tileHeight,
                                 minLevel, maxLevel,
                                 apiRoot, imageId) 
{
  this.Height = height;
  this.Width = width;
  this.TileWidth = tileWidth;
  this.TileHeight = tileHeight;
  this.ApiRoot = apiRoot;
  this.ImageId = imageId;
};

GirderTileSource.prototype.GetTileUrl =  function (level, x, y, z) {
  return this.ApiRoot + '/item/' + this.ImageId +
    '/tiles/zxy/' + level + '/' + x + '/' + y;
};




export { GirderStackWidget }
