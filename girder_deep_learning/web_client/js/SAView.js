// Shallow reference to large image.
import { staticRoot } from 'girder/rest';
import { restRequest } from 'girder/rest';
import View from 'girder/views/View';
import { apiRoot } from 'girder/rest';


var SAView = View.extend({
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

    // Settings is the items metadata
    initialize: function (itemId) {
	console.log("SAView init");
	this.itemId = itemId;
	
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

    // I am not sure how the superclass uses this render method.
    // I am just using it to load the girder large-image tile info.
    render: function () {
	// If script is not loaded then abort
	// If script or metadata isn't loaded, then abort
	if (!window.SA) {
            return this;
	}

	// render can get called multiple times
	if (this.Initialized) {
	    return this;
	}
	this.Initialized = true;

	console.log("SAView render");

	// We need to request image data from the server to setup the cache.
	var self = this;
	girder.rest.restRequest({
	    path: 'item/' + this.itemId + '/tiles',
	    method: 'GET',
	    contentType: 'application/json',
	    error: function (error, status) {
		console.error(error.status + ' ' + error.statusText, error.responseText);
	    }
	}).done(function (resp) {
	    self.loadItem(resp);
	});

	return this;
    },

    // I am using this method to create the slide-atlas viewer after we have all the
    // girder information we need.
    loadItem: function (resp) {
	var tileSource = new SATileSource(resp.sizeX, resp.sizeY,
					  resp.tileWidth, resp.tileHeight,
					  0, resp.levels - 1,
					  this.ApiRoot, this.itemId);
        window.SA.SAViewer(window.$(this.el), {
            zoomWidget: true,
            drawWidget: true,
            prefixUrl: staticRoot + '/built/plugins/large_image/extra/slideatlas/img/',
            tileSource: tileSource
        });
        this.viewer = this.el.saViewer;
        this.girderGui = new window.SAM.GirderAnnotationPanel(this.viewer, this.itemId);
        $(this.el).css({position: 'relative'});
        window.SA.SAFullScreenButton($(this.el))
            .css({'position': 'absolute', 'left': '2px', 'top': '2px'});
        SA.GirderView = this;
      
        this.trigger('g:imageRendered', this);

        return this;
    }
});


var SATileSource = function (width, height,
                             tileWidth, tileHeight,
                             minLevel, maxLevel,
                             apiRoot, imageId) 
{
    this.height = height;
    this.width = width;
    this.maxLevel = maxLevel;
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.ApiRoot = 'api/v1'; //apiRoot;
    this.ImageId = imageId;
};

SATileSource.prototype.getTileUrl =  function (level, x, y, z) {
  return this.ApiRoot + '/item/' + this.ImageId +
    '/tiles/zxy/' + level + '/' + x + '/' + y;
};


export {SAView};
