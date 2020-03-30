import { restRequest } from 'girder/rest';
import View from 'girder/views/View';

var DualView = View.extend({
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
        console.log("DualView init");
        this.file = settings.file;
    },

    _element_callback: function(e) {
        // no action for now.
        this.e = e;
        var element = $(e.target)
    },

    // Render is really initialize. I believe it only gets called once.
    render: function () {
        console.log("DualView render");
        //console.log(JSON.stringify(this.testImage));
        var self = this;

        // Wait unitl both libraries are loaded before continuing.
        if ( typeof(SA) == "undefined" || typeof(SAM) == "undefined") {
            // Make sure we have the classes we need.
            $('head').prepend(
                $('<link rel="stylesheet" href="http://lemon:8080/webgl-viewer/static/css/sa.css">'));
            $.getScript(
                'http://lemon:8080/webgl-viewer/static/sam.max.js',
                _.bind(function () {
                    console.log("sam loaded");
                    $.getScript(
                        'http://lemon:8080/webgl-viewer/static/sa.max.js',
                        _.bind(function () {
                            console.log("sa loaded");
                            this.render();
                        }, this)
                    );
                }, this)
            );
            return;
        }

        console.log("Request mission data");
        // Get the mission info we need from the "database"/
        restRequest({
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

        console.log("Load mission data");

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

        //this.$el.html(kwcnnContainer({title: "LightBox"}));
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

        // Constructs the dual viewer.
        viewer_div.saViewer({'dual':true});
        this.sa_dual_viewer = viewer_div[0].saViewer;


        // Have to request twice (ansynchronously)
        // TODO: Get the image ids from a separate argument.
        console.log("Load image metadata");
        var imageId1 = this.missionData.Sessions[0].detections[0].image_id;
        restRequest({
            type: 'GET',
            url: "/item/"+imageId1+"/tiles",

        }).done(_.bind(function (resp) {
            this._loadImageTileData(0,imageId1,resp);
        }, this));

        var imageId2 = this.missionData.Sessions[0].detections[1].image_id;
        restRequest({
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

        this.sa_dual_viewer.GetViewer(index).ProcessArguments({
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
        if (index > 0) {
            this.sa_dual_viewer.ToggleDualView();
            this.sa_dual_viewer.InitializeSynchronousViewsWithPoints(
                [259,656], [259,656], 
                [285,8896], [285,8896],
                [9406,16], [9406,16]
            );

            /*
            this.sa_dual_viewer.InitializeSynchronousViews(
                [1, 0, 259,
                 0, 1, 656,
                 0, 0, 1],
                [0.813819, 0, 345,
                 0, 0.85, 261,
                 0, 0, 1]);
            */
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

        var viewer = this.sa_dual_viewer.GetViewer(viewIndex);
        // Might be useful.
        viewer.image_id = imageId;
        viewer.index = viewIndex;

        // TODO: Look into whether this is necessary
        viewer.ClearAnnotations();
        // $('.sa-viewer').saViewer('AddAnnotation', {type:'rect',origin:[2000,2000],
        // width:5000, height:8000});

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

export {DualView};
