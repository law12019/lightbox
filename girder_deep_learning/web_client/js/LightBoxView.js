import { apiRoot } from '@girder/core/rest';
import { restRequest } from '@girder/core/rest';
import View from '@girder/core/views/View';


// TODO: only keep one array of elements (do not keep parallel trees: annotations anc chips)



// multiple images
// Sort detection annotation rectangles (and circles) into arbitrary classes
var LightBoxView = View.extend({
  initialize: function (settings) {
    this.settings = settings;
    this.ClassNames = settings.metaData.classes;
    this.ChipSize = 92*2;
    if (settings.metaData.imageSize) {
      this.ChipSize = settings.metaData.imageSize;
    }
    this.Open = settings.metaData.open;

    if (!$('head #large_image-slideatlas-css').length) {
      $('head').prepend(
        $('<link>', {
          id: 'large_image-slideatlas-css',
          rel: 'stylesheet',
          href: '/static/built/plugins/large_image/extra/slideatlas/sa.css'
        })
      );
    }

    $.getScript(
      '/static/built/plugins/large_image/extra/slideatlas/sa-all.max.js',
      () => this.render()
    );
  },

  // Render is really initialize.
  render: function () {
    // Setup the call back to change the class of an element.
    var self = this;
    
    //console.log("render")
    // If script or metadata isn't loaded, then abort
    if (!window.SA) {
      return;
    }
    // rendered getting called multiple times (race condition sith SA)
    // TODO: Should this be in init?
    if (this.Mask) {
      return;
    }

    // Girder hanging in docker container.  I assume the cache is fragmenting
    // then thrashing.  Agressively clear the cache before loading the lightbox.
    restRequest({
      type: 'PUT',
      url: "/large_image/cache/clear",
    }).done(function (resp) {
      console.log("cache cleared");
    });
    
    // For the expanded viewer:
    // Mask is to gray out background and consume events.
    // All lightbox items in this parent will share a mask.
    this.Mask = $('<div>')
      .appendTo(this.$el)
      .addClass('sa-light-box-mask') // So it can be retrieved.
      .hide()
      .css({'position': 'fixed',
            'left': '0px',
            'top': '0px',
            'width': '100%',
            'height': '100%',
            'z-index': '99',
            'opacity': '0.5',
            'background-color': '#000'});
    this.ViewerDiv = $('<div>')
      .appendTo(this.$el)
      .hide()
      .css({'position': 'fixed',
            'left': '5%',
            'width': '90%',
            'top': '5%',
            'height': '90%',
            'background-color': '#FFF',
            'border': '1px solid #000',
            'z-index': '100'});
    SA.SAViewer(this.ViewerDiv,
                {zoomWidget: true,
                 drawWidget: false,
                 rotatable: false,
                 prefixUrl: '/static/built/plugins/large_image/extra/slideatlas/img/'});
    this.Viewer = this.ViewerDiv[0].saViewer;
    // This id is wrong.  Set it when an item is loaded.
    this.GirderGui = new SAM.LayerPanel(this.Viewer, this.settings.item.id);

    
    // This is awkward.  SlideAtlas needs to kno the path to its own images.
    SA.ImagePathUrl = '/static/built/plugins/large_image/extra/slideatlas/img/';

    // Class objects just store labels and colors.
    this.ClassObjects = [];
    for (var i = 0; i < this.ClassNames.length; ++i) {
      var classObj = {label: this.ClassNames[i],
                      index:i};
      this.ClassObjects.push(classObj);
      // assign colors to the labels
      // detections will be yellow
      // Detection class is yellow.
      if (i === 0) { // detection: orange
        classObj.color = '#FF9000'; 
      } else if (i === 1) { // Postive: green,
        classObj.color = '#00FF00';
      } else if (i === 2) { // Negative: red.
        classObj.color = '#FF00FF';
      } else {
        // the rest will range from purple to cyan
        var k = (i - 3) / (this.ClassObjects.length - 4);
        this.ClassObjects[i].color = SAM.ConvertColorToHex([k, 1 - k, 1]);
      }
    }

    this.Container = $('<div>')
      .appendTo(this.$el)
      .css({'width':'100%',
            'margin-right':'30px',
            'overflow':'auto',
            'position':'relative'});
    
    // This homes full screen, confidence slider and save button
    // I would like this to be visible all the time.  Can we put it on the page,
    // and then fix it when it starts to go off screen?
    this.ControlBar = $('<div>')
      .appendTo(this.Container)
      .css({//'position': '-webkit-sticky',
            //'position': 'sticky',
            'position': 'fixed',
            'top': '100px',
            'height': '2em',
            'left': '20%',
            'width': '60%',
            'background-color': '#BBF',
            'z-index':'200'
            //'padding': '5px',
            //font-size: 20px
           });
    // This did not work. jqueryUI must not be imported
    //this.Slider = $('<div>')
    //  .appendTo(this.ControlBar)
    //  .css({'width':'200px',
    //        'top': '2px',
    //        'right': '140px'})
    //  .slider()
    //  .on('change', function (event, ui) { console.log(self.Slider.value());});
    this.Slider = $('<input type="range" min="0" max="1000" value="0">')
      .appendTo(this.ControlBar)
      .css({'position': 'absolute',
            'width':'200px',
            'top': '2px',
            'left': '10px',
            'width': '50%'})
      .on('input', function () { self._handleSlider();});
    this.SaveButton = $('<button>')
      .appendTo(this.ControlBar)
      .css({'position': 'absolute',
            'top': '2px',
            'right': '40px'})
      .text('Save')
      .prop('title', 'Save annotations to server')
      .click( () => this._saveAnnotations() );

    SA.SAFullScreenButton(this.Container)
      .css({'position': 'absolute', 'right': '2px', 'top': '2px'});

    // We need to keep all the annotations to save changes.
    this.Tree = {'container':this.Container, imageNodes: []};    

    // Girder: Request all of the images in the folder.
    var folderId = this.parentView.model.parent.id;
    var self = this;
    console.log("request "+folderId);
    restRequest({
      type: 'GET',
      url: "/item?folderId="+folderId+"&limit=5000&offset=0&sort=lowerName&sortdir=1",
    }).done(function (resp) {
      console.log("    received "+folderId+" "+resp.length);
      // Load items with timeouts.  This should keep girder running in docker from crashing.
      // TODO: make a queue similar to loading images.  Timeouts are a poor solution.
      self._loadItems(resp, 0);
    }).error(function (d) {
      console.error("Error saving");
    });
  },

  _handleSlider: function () {
    // sigmoid
    
    var confidence_threshold = 2.0 / (1 + Math.exp(-this.Slider.val()*0.008)) - 0.999301
    console.log(confidence_threshold) 

    // loop over all image nodes
    for (var imgIdx = 0; imgIdx < this.Tree.imageNodes.length; ++imgIdx) {
      var imageNode = this.Tree.imageNodes[imgIdx];
      if (!imageNode.accordian.getOpen()) {
        continue;
      }
      // loop over all annotation nodes
      for (var nodeIdx = 0; nodeIdx < imageNode.annotationNodes.length; ++nodeIdx) {
        var annotNode = imageNode.annotationNodes[nodeIdx]
        if (!annotNode.accordian.getOpen()) {
          continue;
        }
        // Loop over all chips
        for (var chipIdx = 0; chipIdx < annotNode.chips.length; ++ chipIdx) {
          var chip = annotNode.chips[chipIdx];
          if ('user' in chip.element) {
            var user = chip.element.user;
            if ('confidence' in user) {
              if (user.confidence > confidence_threshold) {
                chip.chipDiv.show();
              } else {
                chip.chipDiv.hide();
              }
            }
          }
        }
      }
    }
  },
  
  _loadItems: function (items, idx) {
    if (idx >= items.length) {
      return;
    }
    var item = items[idx];
    if (item.largeImage) {
      this._loadImage(item);
    }
    idx += 1;
    var self = this;
    setTimeout(function(){ self._loadItems(items, idx)}, 100);
  },
  
  // Create the accordian / folder / node on demand.
  _getImageNode: function (imageItem) {
    // Find and return the existing node, if there is one.
    for (var i = 0; i < this.Tree.imageNodes.length; ++i) {
      imageNode = this.Tree.imageNodes[i];
      if (imageNode._id === imageItem._id) {
        return imageNode;
      }
    }
    // make a new node.
    var imageAccordian = SA.AccordianDiv(this.Container, imageItem.name).css({'width':'100%'})[0];
    imageAccordian.open();
    var imageNode = {'_id': imageItem._id,
                     'accordian':imageAccordian,
                     'annotationNodes': [],
                     'name': imageItem.name};
    this.Tree.imageNodes.push(imageNode);

    var self = this;
    // We need all the image meta data to make a viewer.
    // Potential race condition.  What happens if the user opens a viewer before this is loaded?
    restRequest({
      type: 'GET',
      url: "/item/"+imageItem._id+"/tiles",
    }).done(function (resp) {
      imageNode.image = resp;
    });
    
    return imageNode;
  },
  
  _loadImage: function (imageItem) {
    var self = this;

    restRequest({
      type: 'GET',
      url: "/annotation?itemId="+imageItem._id+"&limit=50&offset=0",
    }).done(function (resp) {
      // Sort the annotation to be in the same order as the classes.
      var sortedResp = [];
      for (var i = 0; i < self.ClassNames.length; ++i) {
        var className = self.ClassNames[i];
        var found = false;
        for (var j = 0; j < resp.length; ++j) {
          if (className === resp[j].annotation.name) {
            sortedResp.push(resp[j]);
            found = true;
          }
        }
        if (!found) {
          var empty = {'annotation':{'name':className, 'elements':[]}}
          sortedResp.push(empty);
        }
      }
        
      if (sortedResp.length === 0) {
        return;
      }
      var imageNode = self._getImageNode(imageItem);
      var imageAccordian = imageNode.accordian;

      for (var classIdx = 0; classIdx < sortedResp.length; ++classIdx) {
        var annotName = self.ClassNames[classIdx];
        var classObj = self.ClassObjects[classIdx];
        var annotId = undefined;
        if (sortedResp[classIdx]) {
          annotId = sortedResp[classIdx]._id;
        }
        var annotAccordian = 
          SA.AccordianDiv($(imageAccordian), 
                          classIdx+": "+annotName).css({'width':'100%'})[0];
        $(annotAccordian).css({"min-height":'10px'});
        var annotNode = {'_id': annotId,
                         'imageNode': imageNode,
                         'accordian': annotAccordian,
                         'class': classObj,
                         'chips': [],
                         'modified': false};
        // Color the label by its class.
        annotAccordian.getLabel()
          .css({'color': classObj.color,
                'cursor': 'default'});
        imageNode.annotationNodes[classIdx] = annotNode;
        self._loadAnnotationFromGirder(annotNode);
      }
    });
  },      

  _loadAnnotationFromGirder: function (annotNode) {
    var self = this;
    var annotId = annotNode._id;
    if (annotId) {
      // Find all of the image chips (rectangle and circle elements) for this annotation.
      // The previous request only returned the annots id.
      // This returns the annot object with all its rectangles and circles.
      restRequest({
        type: 'GET',
        url: "/annotation/"+annotId,
      }).done(function (resp) {
        self._loadAnnotation(annotNode, resp.annotation);
        // Load image chips on demand.
        annotNode.accordian.openCallback = () => self._renderChips(annotNode);
        if (self.Open && self.Open.includes(annotNode.class.index)) {
          annotNode.accordian.open();
        }
      });
    } else {
      // database does not have the class yet.
      // Make an empty annotation structure.
      annotNode.hiddenElements = [];
      annotNode.chips = [];
      if (self.Open && self.Open.includes(annotNode.class.index)) {
        annotNode.accordian.open();
      }
    }
  },

  //annotNode: Local structure holding all info for an annotation in an image.
  //annotations: annotation object returned by girder.
  //This method creates the chips.
  _loadAnnotation: function (annotNode, annotation) {
    annotNode.chips = [];
    // Store annotation not mapped to chips
    annotNode.hiddenElements = [];
    for (var i = 0; i < annotation.elements.length; ++i) {
	    var e = annotation.elements[i];
      if (e.type == 'rectangle') {
	      // Force the annotations to be square.
        // TODO: Get rid of this restriction.
        e.width = e.height = Math.max(e.width, e.height);
	    }
      if (e.type == 'rectangle' || e.type == 'circle') {
        var chip = {
          // User changes this to be different than annotNode.class.
          // Keep track of class reassigments without actually moving them.
          class: annotNode.class,
          // should I just changes this to a referecne to the element?
          element: e,
          // Needed to compare classes, get imageId and annot element.
          annotNode: annotNode};
        annotNode.chips.push(chip);
      } else {
        annotNode.hiddenElements.push(e);
      }
    }
  },

  _loadMoreImages: function () {
    var maxSimultaneous = 3;
    var loading = $('.lightbox_chip img.loading').length;
    if (maxSimultaneous > loading) {
      $('.lightbox_chip img[deferred-src]')
        .slice(0, maxSimultaneous - loading).each(function () {
          var img = $(this);
          img.addClass('loading');
          img.attr('src', img.attr('deferred-src'));
          img.removeAttr('deferred-src');
        });
    }
  },  

  _renderChips: function (annotNode) {
    var self = this;
    $(annotNode.accordian).empty();
    // Loading the image chips. Stop the load on open callback. 
    annotNode.accordian.openCallback = undefined;

    for (var idx = 0; idx < annotNode.chips.length; ++idx) {
      var chip = annotNode.chips[idx];
      this._createChipGui(chip);
    }
    
    // Bind actions to the annotation label.
    // Select all chips when hovering over the annotation label.
    var annotAccordian = annotNode.accordian;
    annotAccordian.getLabel()
      .attr('tabindex', '0')
      .hover(
        function () {
          // Prepare for a key to change the class of all annotations.
          $(this).focus();
          $(this).css({'background-color': '#FF0'});
          $(annotAccordian).find('.img-div').css({'border': '4px solid #FF0'});
        },
        function () {
          $(this).blur();
          $(this).css({'background-color': '#FFF'});
          // Change the elements back the their assigned colors.
          // chips are leaves.
          for (var i = 0; i < annotNode.chips.length; ++i) {
            var chip = annotNode.chips[i];
            self._updateChipBorder(chip);
          }
        })
      // This is the key binding for folders.  It is not the binding for image chips.
      .on('keydown',
          function (event) {
            var numClasses = self.ClassNames.length;
	      
	          if (event.keyCode >= 48 && event.keyCode < 48+numClasses) { // 0,1,2 ...
              // Change the class of the element.
              var newClassIdx = event.keyCode - 48;
              var newClassObj = self.ClassObjects[newClassIdx];
              for (var i = 0; i < annotNode.chips.length; ++i) {
                var chip = annotNode.chips[i]
                if(chip.chipDiv.is(":visible")) {
                  chip.class = newClassObj;
                  if (chip.element.user === undefined) {
                    chip.element.user = {};
                  }
                  chip.element.user.confidence = 1.0;
                  //chip.element.scalar = 1.0;
                  self._updateChipBorder(chip);
                  // Class changes do not take effect until reshuffling at
                  // save. No need to mark as modified here.
                }
              }
            }

            return false;
          });
  },

  _getImageUrl: function (imageId, left, top, width, height, targetHeight) {
    var magnification = 40.0 * targetHeight / height;
    if (magnification > 40) {
      magnification = 40;
    }
    return 'api/v1/item/'+imageId+'/tiles/region?magnification='+magnification+
           '&left='+left+'&top='+top+'&regionWidth='+width+'&regionHeight='+height+
           '&units=base_pixels&exact=false&encoding=JPEG&jpegQuality=95&jpegSubsampling=0';
  },

  _getChipBox: function (chip) {
    var e = chip.element;
    if (e.type === "circle") {
      var left = Math.round(e.center[0]-e.radius);
      var top  = Math.round(e.center[1]-e.radius);
      var width = e.radius*2;
      var height = e.radius*2;
      return [left, top, width, height];
    }
    if (e.type === "rectangle") {
      var left = Math.round(e.center[0]-e.width/2);
      var top  = Math.round(e.center[1]-e.height/2);
      var width = e.width;
      var height = e.height;
      return [left, top, width, height];
    }
    if (e.type === "polyline") {
      var points = e.points;
      if (points.length === 0) {
        return;
      }
      var left = points[0];
      var right = left;
      var top = points[1];
      var bottom = top;
      for (var i = 1; i < points.length; ++i) {
        var x = points[i][0]
        var y = points[i][1]
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        return [left, top, right-left, bottom-top];
      }
      return;
    }
  },


  // factor: zoom in: < 1.0, out: > 1.0 
  _zoomChip: function (chip, annotNode, factor) {
    var e = chip.element;
    if (e.type === 'circle') {
      e.radius = Math.round(e.radius * factor);
    } else if (e.type === 'rectangle') {
      e.width = Math.round(e.width * factor);
      e.height = Math.round(e.height * factor);
    }
    annotNode.modified = true;
    this.SaveButton.css({'background-color': '#F00'});
    this._updateChipGui(chip);
  },


  _translateChip: function (chip, annotNode, dx, dy) {
    var e = chip.element;
    // get the chip world bounds for coordinate system.
    var box = this._getChipBox(chip);
    if (box === undefined) {
      return;
    }

    if ( ! 'imgDiv' in chip) {
      return;
    }
    
    var dx = dx / chip.imgDiv.width();
    var dy = dy / chip.imgDiv.height()

    // This box is (left, top, width, height)
    e.center[0] = Math.round(e.center[0] - (dx * box[2]));
    e.center[1] = Math.round(e.center[1] - (dy * box[3])); 
    
    this._updateChipGui(chip);
    this.SaveButton.css({'background-color': '#F00'});
    annotNode.modified = true;
  },

  
  _centerChip: function (chip, annotNode, x, y) {
    console.log('centerChip: (' + x + ', ' + y + ')')
    if ( ! 'imgDiv' in chip) {
      return;
    }    
    var cx = chip.imgDiv.width() / 2;
    var cy = chip.imgDiv.height() / 2;
    var dx = cx - x;
    var dy = cy - y;
    this._translateChip(chip, annotNode, dx, dy);
  },


  // TODO: Change elements into an object rather than relying on closure.
  // This assumes that elements are shuffled into their home annotation.
  _createChipGui: function (chip) {
    var box = this._getChipBox(chip);
    if (box === undefined) {
      return;
    }
    var self = this;
    var classObj = chip.class;
    var annotNode = chip.annotNode;
    var e = chip.element;
    var left = Math.round(box[0]);
    var top  = Math.round(box[1]);
    var width  = Math.round(box[2]);
    var height  = Math.round(box[3]);
    // Use closure to keep track of images state?
    var imageId = annotNode.imageNode._id;
    var chipDiv = $('<div class="lightbox_chip">')
      .appendTo($(annotNode.accordian))
      .css({'display':'inline-block',
            'position':'relative'});

    var imgDiv = $('<div>')
      .appendTo(chipDiv)
      .addClass("img-div")
      .css({'height':(this.ChipSize+8).toString()+'px',
            'width':(this.ChipSize+8).toString()+'px',
            'margin':'1px',
            'cursor': 'crosshair',
            'border': '4px solid #EEE',
            'overflow':'hidden'})
      // needed to receive key events
        .attr('tabindex', '0');

    if (chip.element.type == 'circle') {
      imgDiv.css({'border-radius':'50%'})
    }

    var img = $('<img>')
      .appendTo(imgDiv)
      .addClass("img-chip")
      .css({'height':this.ChipSize.toString()+'px',
            'width':this.ChipSize.toString()+'px',
            'cursor': 'crosshair'})
      .attr('tabindex', '0');
    // _updateChipGui  sets the src.

    img.on('error', function () {
      img.removeClass('loading');
      self._loadMoreImages();
    });
    img.on('load', function () {
      img.removeClass('loading');
      self._loadMoreImages();
    });

    // This allows me to process drag events.
    img.on('dragstart', function(event) { event.preventDefault(); return false; });
    //img.on('mousemove', function(event) { event.preventDefault(); return true; });
    
    chip.chipDiv = chipDiv; // For moving the chip to a different accordian.
    chip.imgDiv = imgDiv; // We only change the border with this reference.
    chip.img = img; // For zoom a whole collection
    
    var viewerButton = $('<img>')
      .appendTo(imgDiv)
      .addClass("viewer-button")
      .css({'height': '16px',
            'width': '16px',
            'opacity':'0.4',
            'position': 'absolute',
            'top': '-5px',
            'right': '-5px',
            'cursor': 'auto',
            'z-index':'20'})
      .prop('src', SA.ImagePathUrl+'corner32.png')
      .hover(
        function () {$(this).css({'opacity':'1.0'});},
        function () {$(this).css({'opacity':'0.4'});})
      .click( () => this._expandViewer(chip));

    // Bind actions to the image chip display.
    imgDiv
      .hover(
        function () { // mouse in
          imgDiv.css({'border': '4px solid #FF0',
                      'cursor': 'crosshair'});
          // Prepare to receive key events.
          imgDiv.focus();
        },
        function () { // mouse out
          var elementClass = chip.class;
          imgDiv.css({'border': '4px solid '+elementClass.color,
                      'cursor': 'auto'});
          // Stop receiving key events.
          imgDiv.blur();
        })
      .on('keyup',
          function (event) {
            if (event.keyCode === 17) { // control key
              // Control click expands the viewer.
              imgDiv.css({'cursor': 'crosshair'});
              viewerButton.css({'opacity':'1.0'});
            }
          })
      .on('keydown',
          function (event) {
            var numClasses = self.ClassNames.length;
            if (event.keyCode === 67) { // c key: recenter at mouse
              self._centerChip(chip, annotNode, self.lastMouseX, self.lastMouseY);
            } else if (event.keyCode === 17) { // control key
              // Control click expands the viewer.
              imgDiv.css({'cursor': 'auto'});
              viewerButton.css({'opacity':'1.0'});
	          } else if (event.keyCode == 46) { // delete
              this.SaveButton.css({'background-color': '#F00'});
		          chip.annotNode.modified = true;
		          var chips = chip.annotNode.chips;
		          var c_idx = chips.indexOf(chip);
		          // Remove the chip from the image node.
		          if (c_idx > -1) {
		            chip.imgDiv.remove()
		            chips.splice(c_idx, 1);
		          }
            } else if (event.keyCode === 38) { // up arrow
              self._zoomChip(chip, annotNode, 0.9);
              return false;
            } else if (event.keyCode === 40) { // down arrow
              self._zoomChip(chip, annotNode, 1.0 / 0.9);
              return false;
            } else if (event.keyCode >= 48 && event.keyCode < 48+numClasses) { // 0,1,2 ...
              // Change the class of the element.
              var newClassIdx = event.keyCode - 48;
              var newClassObj = self.ClassObjects[newClassIdx];
              chip.class = newClassObj;
              // If the user sets the class, confidence gets set to 1.
              // e.scalar = 1.0;
              self._updateChipBorder(chip);
              // Class changes do not take effect until reshuffling at
              // save. No need to mark as modified here.
            }
            return false;
          })
      .on('mousewheel',
          function(e){
            if(e.originalEvent.wheelDelta /120 > 0) {
              self._zoomChip(chip, annotNode, 0.95);
            } else {
              self._zoomChip(chip, annotNode, 1.0/0.95)
            }
            return false;
          })
      .on('mousedown',
          function (event) {
            self.click = true;
            self.lastMouseX = event.offsetX;
            self.lastMouseY = event.offsetY;
            event.preventDefault();
            return false;
          })
      .on('mouseup',
          function (event) {
            if (self.click) {
              self._centerChip(chip, annotNode, self.lastMouseX, self.lastMouseY);
              return false;
            } else {
              return true;
            }
          })
      .on('mousemove',
          function (event) {
            var dx = event.offsetX - self.lastMouseX;
            var dy = event.offsetY - self.lastMouseY;
            self.lastMouseX = event.offsetX;
            self.lastMouseY = event.offsetY;
            //console.log('mouse: (' + self.lastMouseX + ', ' + self.lastMouseY + ')')
            if (event.which != 1) {
              return true;
            }
            if (dx != 0 || dy != 0) {
              self.click = false;
            }
            self._translateChip(chip, annotNode, dx, dy);
            event.preventDefault();
            return false;
          });

    // Update the image and boundary color.
    this._updateChipGui(chip);
  },

  
  // Recompute the image to match the chips element.
  _updateChipGui: function (chip) {
    var box = this._getChipBox(chip);
    if (box === undefined) {
      return;
    }

    var annotNode = chip.annotNode;

    var left = Math.round(box[0]);
    var top  = Math.round(box[1]);
    var width  = Math.round(box[2]);
    var height  = Math.round(box[3]);

    // Use closure to keep track of images state?
    var imageId = annotNode.imageNode._id;
    chip.img
      .attr('deferred-src', this._getImageUrl(imageId, left, top, width, height, this.ChipSize));
    this._loadMoreImages();

    this._updateChipBorder(chip);
  },

  
  // Change the obrder color to matchthe class
  _updateChipBorder: function (chip) {
    var classObj = chip.class;
    if ( ! ('imgDiv' in chip)) {
      return;
    }    
    chip.imgDiv.css({'border': '4px solid '+classObj.color});
    //if (classObj.index === annotNode.class.index) {
    //  chip.imgDiv.css({'border': '4px solid #EEE'});
    //} else {
    //  chip.imgDiv.css({'border': '4px solid '+classObj.color});
    //}
  },


  // Move chips to their correct annotNode.  (The user can change their class).
  _sortChipsByClass: function () {
    // Move the elements to their new annotation.
    for (var imgIdx = 0; imgIdx < this.Tree.imageNodes.length; ++imgIdx) {
      var imgNode = this.Tree.imageNodes[imgIdx];
      for (var annotIdx = 0; annotIdx < imgNode.annotationNodes.length; ++annotIdx) {
        var annotNode = imgNode.annotationNodes[annotIdx];
        // The only complication here is removing chips while we are iterating through them.
        var newChips = []
        for (var chipIdx = 0; chipIdx < annotNode.chips.length; ++chipIdx) {
          var chip = annotNode.chips[chipIdx];
          var elementClass = chip.class;
          var destNode = imgNode.annotationNodes[elementClass.index];
          if (elementClass != annotNode.class) {
            this.SaveButton.css({'background-color': '#F00'});
            annotNode.modified = true;
            destNode.modified = true;
            destNode.chips.push(chip)
            // Reparent the GUI too.
            chip.chipDiv.detach();
            chip.chipDiv.appendTo($(destNode.accordian))
          } else {
            newChips.push(chip);
          }
        }
        annotNode.chips = newChips
      }
    }
  },

    
  // Note: potential problem with partial saving.
  // Actually move the elements to the right annotations, then save to girder.
  _saveAnnotations: function () {
    // Move chips to the correct annotNode (if the user has changed their class).
    this._sortChipsByClass();
    
    // Save the annotations that have been modified.
    var self = this;
    this.SavingCount = 0;
    for (var imgIdx = 0; imgIdx < this.Tree.imageNodes.length; ++imgIdx) {
      var imgNode = this.Tree.imageNodes[imgIdx];
      for (var annotIdx = 0; annotIdx < imgNode.annotationNodes.length; ++annotIdx) {
        var annotNode = imgNode.annotationNodes[annotIdx];
        // Move new annotations to live.
        if (annotNode.modified) {
          this._saveAnnotation(annotNode);
        }
      }
    }
  },

  _saveAnnotation: function (annotNode) {
    var self = this;

    // default: create a new annotitons.
    var requestType = 'POST';
    var requestPath = "/annotation?itemId="+annotNode.imageNode._id;
    if (annotNode._id) {
      // Update the annotation in the database.
      requestType = 'PUT';
      requestPath = "/annotation/"+annotNode._id;
    }

    var tmpAnnotation = {'name': annotNode.class.label,
                     'elements': []};
    for (var chipIdx = 0; chipIdx < annotNode.chips.length; ++chipIdx) {
      var chip = annotNode.chips[chipIdx];
      tmpAnnotation.elements.push(chip.element);
    }
    tmpAnnotation.elements = tmpAnnotation.elements.concat(annotNode.hiddenElements);
    
    this.SavingCount += 1;
    restRequest({
      type: requestType,
      url: requestPath,
      data: JSON.stringify(tmpAnnotation),
      contentType: 'application/json'
    }).done(function (resp) {
      annotNode._id = resp._id;
      self.SavingCount -= 1;
      if (self.SavingCount === 0) {
        console.log("All finished saving");
        self.SaveButton.css({'background-color': '#FFF'});
        self._renderModifiedAnnotations();
      }
    });
  },

  _renderModifiedAnnotations: function () {
    for (var imgIdx = 0; imgIdx < this.Tree.imageNodes.length; ++imgIdx) {
      var imgNode = this.Tree.imageNodes[imgIdx];
      for (var annotIdx = 0; annotIdx < imgNode.annotationNodes.length; ++annotIdx) {
        var annotNode = imgNode.annotationNodes[annotIdx];
        // Do not change annotations until they are all saved.
        if (annotNode.modified) {
          annotNode.modified = false;
          //this._renderChips(annotNode);
        }
      }
    }
  },

  _expandViewer: function (chip) {
    // Save changes to the annotation because the viewer can edit them.
    this._saveAnnotations();
    
    // For debugging
    SA.VIEWER = this.Viewer;
    var self = this;
    var imageNode = chip.annotNode.imageNode;
    var w = imageNode.image.sizeX;
    var h = imageNode.image.sizeY;
    if (!imageNode.cache) {
      var tileSource = {
        height: h,
        width: w,
        tileSize: imageNode.image.tileWidth,
        minLevel: 0,
        maxLevel: imageNode.image.levels - 1,
        getTileUrl: (level, x, y, z) => {
          return  apiRoot + '/item/' + imageNode._id + '/tiles/zxy/' + level + '/' + x + '/' + y;
        }
      };
      imageNode.cache = SA.TileSourceToCache(tileSource);
    }
    // TODO: animate expansion.
    // Visibility before setup is important.
    // TODO: Fix this problem. (on visibility -> UpdateSize()).
    this.ViewerDiv.show();
    this.Viewer.SetCache(imageNode.cache);
    this.Viewer.SetOverViewBounds([0, w - 1, 0, h - 1]);
    var cam = this.Viewer.GetCamera();
    var rotation = 0
    var height = 10
    if (chip.element.type === 'rectangle') {
      rotation = chip.element.rotation;
      height = chip.element.height * 10;
    } else if (chip.element.type === 'circle') {
      height = chip.element.radius * 20;
    }
    this.Viewer.SetCamera(chip.element.center, rotation, height);
    this.Viewer.ConstrainCamera();

    // Took this out to try using the girder annotation panel.
    //var layer = new SAM.AnnotationLayer(this.Viewer.GetDiv());
    //this.Viewer.AddLayer(layer);
    //layer.SetViewer(this.Viewer);
    //// Lets just shallow copy the viewers camera to synchronize all layer views..
    //layer.SetCamera(this.Viewer.GetCamera());
    //layer.UpdateSize()

    //for (var i = 0; i < imageNode.annotationNodes.length; ++i) {
    //  this._loadAnnotationIntoViewer(imageNode.annotationNodes[i]);
    //}
    this.GirderGui.ChangeItem(imageNode._id);    

    // Show the mask.
    this.Mask.show();
    // Clicking outside the div will cause the div to shrink back to
    // its original size.
    this.Mask
      .attr('tabindex', '0')
      .on('mousedown.lightbox', () => this._hideViewer(imageNode));
    this.Viewer.EscapeCallback = () => this._hideViewer(imageNode);
    return false;
  },

  _hideViewer: function (imageNode) {
    // Reverse the expansion.
    // hide the mask
    this.Mask.hide();
    // remove event to shrink div.
    this.Mask.off('mousedown.lightbox');
    this.Viewer.EscapeCallback = undefined;
    //this.accordian.animate({'top': self.SavedTop,
    //      'left': self.SavedLeft,
    //      'width': self.SavedWidth,
    //      'height': self.SavedHeight,
    //      'z-index': self.SavedZIndex},
    //                         {step: function () { self.accordian.trigger('resize'); }});
    this.ViewerDiv.hide();

    // Reload the annotations for this image. They might have been modified in the viewer.
    for (var idx = 0; idx < imageNode.annotationNodes.length; ++idx) {
      var annotNode = imageNode.annotationNodes[idx];
      annotNode.chips = [];
      $(annotNode.accordian).empty();
      this._loadAnnotationFromGirder(annotNode);
    }
  }

});

export {LightBoxView};
