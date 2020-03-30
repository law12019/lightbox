// try layering the viewer (and make one transparent).

girder.views.DoubleView = girder.View.extend({
  events: {
    'contextmenu .g-render-target': '_ignore',
    'mousedown .g-render-target': '_ignore',
    'selectstart .g-render-target': '_ignore',
    'mousewheel .g-render-target': '_ignore',
	  'click .layer_div': '_element_callback',
  },

  _ignore: function () {
    return false;
  },

  initialize: function (settings) {
    console.log("StackView init");
    this.settings = settings;

    // Load the slide atlas package.
    if (!$('head #large_image-slideatlas-css').length) {
      $('head').prepend(
        $('<link>', {
          id: 'large_image-slideatlas-css',
          rel: 'stylesheet',
          href: staticRoot + '/built/plugins/large_image/extra/slideatlas/sa.css'
        })
      );
    }

    $.getScript(
      staticRoot + '/built/plugins/large_image/extra/slideatlas/sa-all.max.js',
      () => this.render()
    );
  },

  _element_callback: function(e) {
    // no action for now.
    this.e = e;
    var element = $(e.target)
  },

  // Render is really initialize. I believe it only gets called once.
  render: function () {
    // If script is not loaded then abort
    if (!window.SA) {
      return;
    }

    // render can get called multiple times
    if (this.Initialized) {
      return this;
    }
    this.Initialized = true;

    console.log("Load mission data");

    // Get the mission info we need from the "database"/
    girder.restRequest({
      type: 'GET',
      url: "/file/"+this.file.id+"/download"
    }).done(_.bind(function (resp) {
      this._loadMissionData(resp);
    }, this));
  },

  _getTileUrl: function (level, x, y) {
    return '/api/v1/item/' + this.itemId + '/tiles/zxy/' +
      level + '/' + x + '/' + y;
  },

  _loadMissionData: function (mission_data) {
    var self = this;
    //this.missionData = JSON.parse(mission_data);
    this.missionData = mission_data;
    this.layerViews = [];

    // Make the viewer but do not set the images yet.
    console.log("Creating viewer");
    this.viewWindow = $('<div>')
      .css({'background-color':'#FFF',
            'position':'fixed',
            'left':'0px',
            'width':'100%',
            'z-index':'100'})
      .appendTo($('body'))
      .saFullHeight();

    //this.$el.html(girder.templates.container({}));
    //$('#g_container').css({"height": "600px"});
    var control_div = $('<div id="control_div">')
      .appendTo($(this.viewWindow))
      .css({ 'position':'absolute',
             'width': '300px', 
             'height': '100%', 
             'float': 'left' });
    var hide = $('<div>')
      .appendTo(control_div)
      .text("X")
      .css({'color':'red',
            'font-size':'200%',
            'cursor':'default'})
      .click(function () {
        self.viewWindow.hide();
      });
    var viewer_div = $('<div>')
      .appendTo(this.viewWindow)
      .css({ 'position':'absolute',
             'left': '300px', 
             'right':'0px',
             'height': '100%', 
             'float': 'right' });

    // Constructs the double viewer.
    viewer_div.saViewer();
    this.sa_viewer = viewer_div[0].saViewer;
    this.sa_view_layer = this.sa_viewer.NewViewLayer(); 

    var transform = new SAM.MatrixTransformation();
    transform.InitializeWithPoints(
      [259,656], [345,261],
      [285,8896], [167,7265],
      [9406,16], [7789,306]
    );
    this.sa_view_layer.Transform = transform;


    // Put a slider in for the overlay image
    var overlay_slider_div = $('<div>')
      .appendTo(control_div)
      .css({ 'border': '1px solid #CCC', 
             'width': '100%'});

    this.overlay_slider = $('<input type="range" min="0" max="100">')
      .appendTo(overlay_slider_div)
      .on("input",
          _.bind(function () {
            var v = parseFloat(this.overlay_slider.val()) / 100;
            this.sa_view_layer.Canvas.css({'opacity':v.toString()});
            this.sa_viewer.EventuallyRender();
          }, this));


    // Have to request twice (ansynchronously)
    // TODO: Get the image ids from a separate argument.
    console.log("Load image metadata");
    var imageId1 = this.missionData.Sessions[0].detections[0].image_id;
    girder.restRequest({
      type: 'GET',
      url: "/item/"+imageId1+"/tiles",
      
    }).done(_.bind(function (resp) {
      this._loadImageTileData(0,imageId1,resp);
    }, this));

    var imageId2 = this.missionData.Sessions[0].detections[1].image_id;
    girder.restRequest({
      type: 'GET',
      url: "/item/"+imageId2+"/tiles",
      
    }).done(_.bind(function (resp) {
      this._loadImageTileData(1,imageId2,resp);
    }, this));
  },


  _loadImageTileData: function (index,imageId,image_tile_data) {
    var self = this;

    var image = {};
    image.tileUrlRoot = "/api/v1/item/"+imageId+"/tiles/zxy/";

    if (index == 0) {
      this.sa_viewer.ProcessArguments({
        zoomWidget: true,
        drawWidget: true,
        prefixUrl: 'http://lemon:8080/webgl-viewer/static/',
        tileSource: {
          height: image_tile_data.sizeY,
          width: image_tile_data.sizeX,
          tileSize: image_tile_data.tileHeight,
          minLevel: 0,
          maxLevel: image_tile_data.levels-1,
          getTileUrl:
          _.bind(function (a,b,c) {
            return this.tileUrlRoot+a+"/"+b+"/"+c;
          }, image),
          ajaxWithCredentials: true
        }});
    } else {
      if (index > 0) {
        var tileSource = {
          height: image_tile_data.sizeY,
          width: image_tile_data.sizeX,
          tileSize: image_tile_data.tileHeight,
          minLevel: 0,
          maxLevel: image_tile_data.levels-1,
          getTileUrl:
          _.bind(function (a,b,c) {
            return this.tileUrlRoot+a+"/"+b+"/"+c;
          }, image),
        };
        var cache = SA.TileSourceToCache(tileSource);
        this.sa_view_layer.SetCache(cache);
      }
      //this.sa_double_viewer.InitializeSynchronousViewsWithPoints(
      //    [259,656], [345,261],
      //    [285,8896], [167,7265],
      //    [9406,16], [7789,306]
      //);
    }
    this._initImage(index,imageId);
  },

  // To support sharing layers.
  _getLayerView: function (label) {
    for (var i = 0; i < this.layerViews.length; ++i) {
      layerView = this.layerViews[i];
      if (layerView.Label == label) {
        return layerView;
      }
    }
    // Make a new layer view.
    var layerView = new SA.LayerView($('#control_div'), label);
    this.layerViews.push(layerView);
    return layerView;
  },


  // TODO: Find all detections for this image an load it as a layer.
  // TODO: Share GUI for layers (in different images) with the same name.
  _initImage: function (viewIndex,imageId) {
    var data = this.missionData;

    console.log("Loading annotations");

    // How should I handle annotations when the viewers are in the same
    // window? When I turn off on view, the annotations should go with
    // it. SHould I allow layers to have layers?
    // Put them into the master viewer for now..
    var viewer = this.sa_viewer;

    var detections = this.missionData.Sessions[0].detections;
    for (var detection_idx = 0; detection_idx < detections.length; ++detection_idx) {
      if (detections[detection_idx].image_id == imageId) {

        var detection = detections[detection_idx];
        var sa_layer = viewer.NewAnnotationLayer();
        var layerView = this._getLayerView(detection.description);

        // Create the annotations in the layer.
        var image_objects = detection.image_objects;
        for (var index = 0; index < image_objects.length; index++){
          var corner_points = image_objects[index]["corner_points"];

          var width = corner_points[1] - corner_points[0];
          var height = corner_points[3] - corner_points[2];
          var tlc = [corner_points[0] + width/2, corner_points[2] + width/2];

          // TODO: Random or saved color
          var sa_rect = sa_layer.LoadWidget({type:'rect', origin:tlc,
                                             width: width, height: height, linewidth: 0,
                                             outlinecolor: layerView.Color});
          sa_rect.confidence = image_objects[index]["confidence"];
          sa_rect.Visibility = true;
        }
        layerView.AddLayer(sa_layer);
        sa_layer.EventuallyDraw();
      }
    }
  },
});

