// multiple aligned images a location over time.
import { staticRoot } from 'girder/rest';
import { restRequest } from 'girder/rest';
import View from 'girder/views/View';
import { apiRoot } from 'girder/rest';


// This is just a copy of stackview for now.
// TODO: Make it a shallow copy view.



var CopyView = View.extend({
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
  nitialize: function (settings) {
    console.log("CopyView init");
    this.settings = settings;
    this.itemId = settings.item.id;
    
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

    console.log("CopyView render");

    // Create the viewer.
    $(this.el)
      .css({'height': '800px',
            'width': '100%',
            'position': 'relative'});
    SA.SAViewer($(this.el),
                {zoomWidget: true,
                 drawWidget: false,
                 rotatable: false,
                 prefixUrl: staticRoot + '/built/plugins/large_image/extra/slideatlas/img/'});
    this.viewer = this.el.saViewer;

    // Overaly is not used.  It was an attempt to show two at once for alignment.
    this.viewer_overlay = this.viewer.NewViewLayer();

    //var transform = new SAM.MatrixTransformation();
    //transform.InitializeWithPoints(
    //  [259,656], [345,261],
    //  [285,8896], [167,7265],
    //  [9406,16], [7789,306]
    //);
    //this.sa_view_layer.Transform = transform;

    this.viewer_overlay.Canvas.css({'opacity':'0.5'});
    //var cache = SA.TileSourceToCache(tileSource);
    //this.sa_view_layer.SetCache(cache);

    this.girderGui = new window.SAM.GirderAnnotationPanel(this.viewer, this.itemId);

    SA.SAFullScreenButton($(this.el))
      .css({'position': 'absolute', 'left': '2px', 'top': '2px'});

    this.CopyWidget = new SAM.GirderCopyWidget($(this.el), this.viewer, this.viewer_overlay, apiRoot);
    if (this.settings.metaData.annotation) {
      this.CopyWidget.SetAnnotationName(this.settings.metaData.annotation);
    }
    if (this.settings.metaData.sections){
      this.CopyWidget.LoadSections(this.settings.metaData.sections);
    } else {
      this.CopyWidget.LoadFolder(this.parentView.model.parent.id);
    }
  }

});

export {CopyView};
