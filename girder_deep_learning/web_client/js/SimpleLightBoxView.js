import { apiRoot } from '@girder/core/rest';
import { restRequest } from '@girder/core/rest';
import View from '@girder/core/views/View';


// TODO:
// 1: hover highlight does not go away.
// 2: 0->Red?????  Verify labels are being set correctly.


// Branched for LightBoxView.js
// I want a light box that explicitly lists images and regions.
// I had a simple lightbox that showed png chips, but I want links back to the
// whole large images so annotation can be corrected.

// I am changing this so you can select multiple classes.  I will explicitly add NotTarget class for IQR.




// multiple images
// Sort detection annotation rectangles into arbitrary classes
var SimpleLightBoxView = View.extend({
    /* Chrome limits the number of connections to a single domain, which means
     * that time-consuming requests for thumbnails can bind-up the web browser.
     * To avoid this, limit the maximum number of thumbnails that are requested
     * at a time.  At this time (2016-09-27), Chrome's limit is 6 connections;
     * to preserve some overhead, use a number a few lower than that. */

  initialize: function (settings) {
    this.settings = settings;
    if (Array.isArray(settings.metaData)) {
      this.Chips = settings.metaData;
    } else if (settings.metaData.chips) {
      this.Chips = settings.metaData.chips;
      if (settings.metaData.target) {
        // "Target" is a bad field / variable name.  It should really be "annotation name".
        // It is so we can matchthe chips with specific annotation elements.
        // This is to implement IQR for a single target class.
        // This is awkward because chips, as saved in the metadata, do not reference an annotation
        // to change its class.  We have to search for the annotation element
        // by location.
        this.TargetAnnotName = settings.metaData.target;
      }
      if (settings.metaData.label) {
        this.TargetLabels = [settings.metaData.label, "Not"+settings.metaData.label];
      }
      if (settings.metaData.labels) {
        this.TargetLabels = settings.metaData.labels;
      }
    } else {
      console.log("SimpleLightBox could not find chip array.")
      return
    }
    this.ChipSize = 92*2;
    this.Rendered = false;
    this.ImageNodes = {};
    
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


  _getLabelColor: function (selection) {
    if ( ! this.TargetLabels) {
      return '#EEE';
    }
    var labelIdx = selection - 1;
    var colors = ["#EEE", "#0F0", "#0FF", "#00F", "#F0F", "#F00", "#8F8", "#8FF", "#88F", "#F8F", "#F88"]
    if (labelIdx < 0 || labelIdx >= this.TargetLabels.length) {
      return '#EEE';
    }
    if (this.TargetLabels[labelIdx].search("Not") > -1) {
      return "#F00";
    }
    if (selection <= colors.length) {
      return colors[selection];
    }
    return "#000";
  },
    
  
  // Render is really initialize.
  render: function () {
    console.log("render");
    var self = this;
    // If script or metadata isn't loaded, then abort
    if (!window.SA) {
      return;
    }
    // rendered getting called multiple times (race condition sith SA)
    // TODO: Should this be in init?
    if (this.Rendered) {
      return;
    }
    this.Rendered = true;

    // Girder hanging in docker container.  I assume the cache is fragmenting
    // then thrashing.  Agressively clear the cache before loading the lightbox.
    restRequest({
      type: 'PUT',
      url: "/large_image/cache/clear",
    }).done(function (resp) {
      console.log("cache cleared");
    });

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
    this.GirderGui = new SAM.LayerPanel(this.Viewer, this.settings.item.id);

    
    // This is awkward.  SlideAtlas needs to know the path to its own images.
    SA.ImagePathUrl = '/static/built/plugins/large_image/extra/slideatlas/img/';

    this.Container = $('<div>')
      .appendTo(this.$el)
      .css({'width':'100%',
            'margin-right':'30px',
            'overflow':'auto',
            'position':'relative'});
    SA.SAFullScreenButton(this.Container)
      .css({'position': 'absolute', 'right': '2px', 'top': '2px'});
    
    if (this.TargetLabels) {
      $('<button>')
        .appendTo(this.Container)
        .css({'z-index':'10',
              'position': 'absolute',
              'top': '2px',
              'right': '40px'})
        .text('Save')
        .prop('title', 'Save annotations to server')
        .click( () => this._saveAnnotations() );

      this.LabelDiv = $('<div>')
        .appendTo(this.Container)
        .css({'width':'100%'});
      for (var idx = 0; idx < this.TargetLabels.length; ++idx) {
        var label = this.TargetLabels[idx];
        var key = idx + 1;
        $('<div>')
          .css({'color': this._getLabelColor(key)})
          .text(key.toString() + ":" + label)
          .appendTo(this.Container);
      }
    }
    
    this.ChipDiv = $('<div>')
      .appendTo(this.Container)
      .css({'width':'100%'});

    this._renderChips();

    if (this.TargetLabels) {
      // Use the Item label to mark all chips at once.
      var label = $('.g-item-name')
      label
        .attr('tabindex', '0') // needed to receive key events
        .hover(
          function () { // mouse in
            label.css({'border': '1px solid #FF0'});
            // Prepare to receive key events.
            label.focus();
          },
          function () { // mouse out
            label.css({'border': '1px solid #FFF'});
            label.blur();
          })
        .on('keydown',
            function (event) {
              alert("Not implemented");
              /*
              if (event.keyCode == 48) { // 0
                for (var idx = 0; idx < self.Chips.length; ++idx) {
                  self.Chips[idx].Selection = 'maybe';
                  self._updateChipBorder(self.Chips[idx]);
                }
              } else if (event.keyCode == 49) { // 1
                for (var idx = 0; idx < self.Chips.length; ++idx) {
                  self.Chips[idx].Selection = 'yes';
                  self._updateChipBorder(self.Chips[idx]);
                }
              } if (event.keyCode == 50) { // 2
                for (var idx = 0; idx < self.Chips.length; ++idx) {
                  self.Chips[idx].Selection = 'no';
                  self._updateChipBorder(self.Chips[idx]);
                }
              }
              */
              return false;
            });
    }
  },


  _renderChips: function (annotNode) {
    var self = this;
    this.ChipDiv.empty();
    for(var idx = 0; idx < this.Chips.length; ++idx) {
      this._renderChip(this.Chips[idx]);
    }
  },


  _getImageNode: function(imageId) {
    if (this.ImageNodes[imageId]) {
      return this.ImageNodes[imageId];
    }

    // make a new node.
    var imageNode = {'_id': imageId,
                     'annot': undefined};
    this.ImageNodes[imageId] = imageNode;
    
    // Load the image meta data from girder
    var self = this;
    // We need all the image meta data to make a viewer.
    restRequest({
      type: 'GET',
      url: "/item/"+imageId+"/tiles",
    }).done(function (resp) {
      imageNode.image = resp;
    });
    
    return imageNode;
  },
  

  _updateChipBorder: function (chip) {
    chip.imgDiv.css({'border': '4px solid '+this._getLabelColor(chip.Selection)});
  },


  _loadMoreImages: function () {
    var maxSimultaneous = 3;
    var loading = $('.lightbox_chip img.loading').length;
    if (maxSimultaneous > loading) {
      $('.lightbox_chip img.waiting')
        .slice(0, maxSimultaneous - loading).each(function () {
          var img = $(this);
          img.removeClass('waiting').addClass('loading');
          img.attr('src', img.attr('deferred-src'));
        });
    }
  },
  
  
  // TODO: Change elements into an object rather than relying on closure.
  // This assumes that elements are shuffled into their home annotation.
  _renderChip: function (chip) {
    var self = this;

    // Chips only get rendered on initialization so start all chips as "maybe" (enum: yes/no/maybe).
    chip.Selection = 0;
    // Reference the metadata for the image to chip belons to.
    chip.ImageNode = this._getImageNode(chip['imageId']);

    var left = Math.round(chip['region'][0]);
    var top  = Math.round(chip['region'][1]);
    var width  = Math.round(chip['region'][2] - chip['region'][0]);
    var height  = Math.round(chip['region'][3] - chip['region'][1]);
    // Use closure to keep track of images state?
    var imgDiv = $('<div class="lightbox_chip">')
      .appendTo(this.ChipDiv)
      .addClass("img-div")
      .css({'height':(this.ChipSize+8).toString()+'px',
            'width':(this.ChipSize+8).toString()+'px',
            'margin':'1px',
            'display':'inline-block',
            'position':'relative',
            'cursor': 'crosshair',            
            'border': '4px solid #EEE'})
      // needed to receive key events
      .attr('tabindex', '0');

    chip.imgDiv = imgDiv;
    
    if (this.TargetLabels) {
      // Create the key bindings that will mark chips as negative or positive.
      imgDiv
        .hover(
          function () { // mouse in
            imgDiv.css({'border': '4px solid #FF0'});
            // Prepare to receive key events.
            imgDiv.focus();
          },
          function () { // mouse out
            self._updateChipBorder(chip);
            imgDiv.blur();
          })
        .on('keydown',
            function (event) {
              if (event.keyCode == 87) { // w
              }
              if (event.keyCode == 70) { // f
              }
              if (event.keyCode >= 48 && event.keyCode <= 58) { // 0->9
                chip.Selection = event.keyCode - 48
                self._updateChipBorder(chip);
              }
              return false;
            });
    }
    
    var img = $('<img class=waiting>')
      .appendTo(imgDiv)
      .addClass("img-chip")
      .css({'height':this.ChipSize.toString()+'px',
            'width':this.ChipSize.toString()+'px',
            'cursor': 'crosshair'})
      .attr('tabindex', '0')
      .attr('deferred-src', self._getImageUrl(chip.imageId, left, top, width, height, this.ChipSize));

    if (chip['rotation']) {
      var rotation = Math.round(chip['rotation']);
      img.css({'transform': 'rotate('+rotation+'deg)'})
    }

    img.one('error', function () {
      img.addClass('failed-to-load');
      img.removeClass('loading waiting');
      self._loadMoreImages();
    });
    img.one('load', function () {
      img.addClass('loaded');
      img.removeClass('loading waiting');
      self._loadMoreImages();
    });
    self._loadMoreImages();

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
            'cursor': 'auto'})
      .prop('src', SA.ImagePathUrl+'corner32.png')
      .hover(
        function () {$(this).css({'opacity':'1.0'});},
        function () {$(this).css({'opacity':'0.4'});})
      .click( () => this._expandViewer(chip));
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


  // Note: potential problem with partial saving.
  // Actually move the elements to the right annotations, then save to girder.
  _saveAnnotations: function () {
    // Sort the chips into the imageNodes so we only need to save and load once.
    for (var imageId in this.ImageNodes) {
      var imageNode = this.ImageNodes[imageId];
      imageNode.chips = [];
    }
    
    for (var idx = 0; idx < this.Chips.length; ++idx) {
      var chip = this.Chips[idx];
      if (chip.Selection !== 0) {
        var imageNode = this._getImageNode(chip.imageId);
        imageNode.chips.push(chip);
      }
    }

    // now save the annotation for each image.
    for (var imageId in this.ImageNodes) {
      var imageNode = this.ImageNodes[imageId];
      if (imageNode.chips.length > 0) {
        this._saveImage(imageNode);
      }
    }
  },

  
  _saveImage: function (imageNode) {
    var self = this;

    if (imageNode.annot) {
      self._saveImageAnnotation(imageNode);
      return;
    }

    restRequest({
      type: 'GET',
      url: "/annotation?itemId="+imageNode._id+"&name="+self.TargetAnnotName,
    }).done(function (resp) {
      if (resp.length > 0){
        var annotId = resp[0]._id;
        restRequest({
          type: 'GET',
          url: "/annotation/"+annotId,
        }).done(function (resp) {
          imageNode.annot = resp.annotation;
          self._saveImageAnnotation(imageNode, annotId);
        });
      }
    });
  },


  _saveImageAnnotation: function (imageNode, annotId) {
    for (var idx = 0; idx < imageNode.chips.length; ++idx) {
      var chip = imageNode.chips[idx];
      var e = this._findChipElement(chip, imageNode.annot);
      if (e == undefined) {
        continue;
      }
      if (chip.Selection !== 0) {
        var labelIdx = chip.Selection - 1;
        if (labelIdx < this.TargetLabels.length) {
          e.label = {'value': this.TargetLabels[labelIdx]};
        }
      }
      // Should I delete labels?
      // I never initalize the labels from the database, so I don't think so.
    }
    
    restRequest({
      type: 'PUT',
      url: "/annotation/"+annotId,
      data: JSON.stringify(imageNode.annot),
      contentType: 'application/json'
    });
  },

  
  _findChipElement: function (chip, annot) {
    // Have to rely on matching the position.
    var cx = (chip.region[0] + chip.region[2]) * 0.5;
    var cy = (chip.region[1] + chip.region[3]) * 0.5;
    for (var idx = 0; idx < annot.elements.length; ++idx) {
      var e = annot.elements[idx];
      var dx = cx - e.center[0];
      var dy = cy - e.center[1];
      if (dx*dx + dy*dy < 4.0) {
        return e;
      }
    }
    return undefined;
  },
    

  _expandViewer: function (chip) {
    // For debugging
    SA.VIEWER = this.Viewer;
    var self = this;
    var imageNode = chip.ImageNode;
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
    var center = [(chip.region[0]+chip.region[2])*0.5, (chip.region[1]+chip.region[3])*0.5];

    this.Viewer.SetCamera(center, 0, (chip.region[3]-chip.region[1]) * 10);
    this.Viewer.ConstrainCamera();

    this.GirderGui.ChangeItem(chip.imageId);
    
    // Show the mask.
    this.Mask.show();
    // Clicking outside the div will cause the div to shrink back to
    // its original size.
    this.Mask
      .attr('tabindex', '0')
      .on('mousedown.lightbox', () => this._hideViewer());
    this.Viewer.EscapeCallback = () => this._hideViewer();
    return false;
  },

  _hideViewer: function () {
    // Reverse the expansion.
    // hide the mask
    this.Mask.hide();
    // remove event to shrink div.
    this.Mask.off('mousedown.lightbox');
    this.Viewer.EscapeCallback = undefined;
    this.ViewerDiv.hide();
  },

  /*
  // Copied (and modified) from girderAnnotationEditor.
  // TODO: SHare code.
  _loadAnnotationIntoViewer: function (annotNode) {
    // Put all the rectangles into one set.
    var setObj = {};
    setObj.type = 'rect_set';
    setObj.centers = [];
    setObj.widths = [];
    setObj.heights = [];
    setObj.confidences = [];
    setObj.labels = [];

    var annot = annotNode.annotation;
    for (var i = 0; i < annot.elements.length; ++i) {
      var element = annot.elements[i];
      var chip = annotNode.Cships[i];
      if (element.type === 'rectangle') {
        setObj.widths.push(element.width);
        setObj.heights.push(element.height);
        setObj.centers.push(element.center[0]);
        setObj.centers.push(element.center[1]);
        if (element.scalar === undefined) {
          element.scalar = 1.0;
        }
        setObj.confidences.push(element.scalar);
        // I want colors to be correct, even for intermediate class changes
        // (before they move annotations).
        setObj.labels.push(chip.class.label);
      }
    }

    var widget = new SAM.RectSetWidget();
    widget.Load(setObj);

    // We want to color by labels (not widget)
    var shape = widget.Shape;
    if (!shape.LabelColors) {
      shape.LabelColors = {};
      // Colors setup in contructor.
      for (i = 0; i < this.ClassObjects.length; ++i) {
        shape.LabelColors[this.ClassObjects[i].label] = this.ClassObjects[i].color;
      }
    }

    // Color by class
    //widget.Shape.SetOutlineColor(annotNode.class.color);

    this.Viewer.GetLayer(0).AddWidget(widget);
  }
  */
  
});

export {SimpleLightBoxView};
