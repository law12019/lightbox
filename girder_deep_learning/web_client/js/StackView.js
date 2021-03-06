// multiple aligned images a location over time.
import { apiRoot } from '@girder/core/rest';
import { restRequest } from '@girder/core/rest';
import View from '@girder/core/views/View';
// IN SAM
// import { GirderStackWidget } from './GirderStackWidget';


var StackView = View.extend({
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
  initialize: function (settings) {
    console.log("StackView init");
    this.settings = settings;
    this.itemId = settings.item.id;
    
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

    console.log("StackView render");

    // Create the viewer.
    $(this.el)
      .css({'height': '800px',
            'width': '100%',
            'position': 'relative'});
    SA.SAViewer($(this.el),
                {zoomWidget: true,
                 drawWidget: false,
                 rotatable: true,
                 prefixUrl: '/static/built/plugins/large_image/extra/slideatlas/img/'});
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

    this.girderGui = new window.SAM.LayerPanel(this.viewer, this.itemId);
    $(this.el).css({position: 'relative'});
    window.SA.SAFullScreenButton($(this.el))
      .css({'position': 'absolute', 'left': '2px', 'top': '2px'});
    SA.GirderView = this;

    this.StackWidget = new SAM.GirderStackWidget($(this.el), this.viewer, this.viewer_overlay, '/api/v1');
    if (this.settings.metaData.annotation) {
      this.StackWidget.SetAnnotationName(this.settings.metaData.annotation);
    }
    if (this.settings.metaData.sections){
      this.StackWidget.LoadSections(this.settings.metaData.sections);
    } else {
      this.StackWidget.LoadFolder(this.parentView.model.parent.id);
    }
  }

});

export {StackView};
