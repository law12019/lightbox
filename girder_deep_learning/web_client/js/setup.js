import _ from 'underscore';
import { wrap } from '@girder/core/utilities/PluginUtils';
import ItemView from '@girder/core/views/body/ItemView';
import View from '@girder/core/views/View';
import {SimpleLightBoxView} from './SimpleLightBoxView';
import {LightBoxView} from './LightBoxView';
import {StackView} from './StackView';
//import {ProofReader} from './ProofReader';
//import {SAView} from './SAView';
//import {MaskAnnotateView} from './MaskAnnotateView';


wrap(ItemView, 'initialize', function (initialize, settings) {
  initialize.call(this, settings);
  this.on('g:rendered', function () {
    var meta = this.model.get('meta') || {};
    // var fileColl = this.fileListWidget.collection;

    var initSimpleLightBoxView = _.bind(function (metaData) {
      // Make a top level container
      var el = $('<div>', {
        class: 'g-lightbox-container'
      }).prependTo(this.$('.g-item-info'));

      new SimpleLightBoxView({
        metaData: metaData,
        parentView: this,
        item: this.model,
        el: el
      }).render();
    }, this);

    var initLightBoxView = _.bind(function (metaData) {
      // Make a top level container
      var el = $('<div>', {
        class: 'g-lightbox-container'
      }).prependTo(this.$('.g-item-info'));

      new LightBoxView({
        metaData: metaData,
        parentView: this,
        item: this.model,
        el: el
      }).render();
    }, this);

    var initProofReader = _.bind(function (metaData) {
      // Make a top level container
      var el = $('<div>', {
        class: 'g-lightbox-container'
      }).prependTo(this.$('.g-item-info'));

      new ProofReader({
        metaData: metaData,
        parentView: this,
        item: this.model,
        el: el
      }).render();
    }, this);

    var initStackView = _.bind(function (metaData) {
      // Make a top level container
      var el = $('<div>', {
        class: 'g-stack-container'
      }).prependTo(this.$('.g-item-info'));

      new StackView({
        metaData: metaData,
        parentView: this,
        item: this.model,
        el: el
      }).render();
    }, this);

    var initSAView = _.bind(function (itemId) {
      // Make a top level container
      var el = $('<div>', {
        class: 'g-lightbox-container'
      }).prependTo(this.$('.g-item-info'));

      new SAView({
        itemId: itemId,
        parentView: this,
        item: this.model,
        el: el
      }).initialize(itemId);
    }, this);

    var initCopyView = _.bind(function (metaData) {
      // Shallow copy of a slide
      var el = $('<div>', {
        class: 'g-lightbox-container'
      }).prependTo(this.$('.g-item-info'));

      new CopyView({
        metaData: metaData,
        parentView: this,
        item: this.model,
        el: el
      }).render();
    }, this);

    var initMaskAnnotateView = _.bind(function (metaData) {
      var el = $('<div>', {
        class: 'g-lightbox-container'
      }).prependTo(this.$('.g-item-info'));

      new MaskAnnotateView({
        metaData: metaData,
        parentView: this,
        item: this.model,
        el: el
      }).render();
    }, this);

    var initImagesView = _.bind(function () {
      // Make a container div for all the images to populate.
      var container = $('<div>')
        .appendTo(this.$('.g-item-info'))
        .css({'width':'100%',
              'margin-right':'30px',
              'overflow':'auto',
              'position':'relative'});

      // Render all the image files we can find.
      // TODO: Filter out files that are not images.
      var files = this.fileListWidget.collection.models;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var ext = file.attributes.name.split('.').pop();
        ext = ext.toLowerCase();
        if (ext == 'jpg' || ext == 'png' || ext == 'tif' || ext == 'gif') {
          var img = $('<img>')
            .appendTo(container)
            .addClass("img-chip")
            .css({'height':'128px',
                  //'width':'80px',
                  'display':'inline-block',
                  'border': '4px solid #EEE'})
            .prop('src',
                  "api/v1/file/"+file.id+"/download?contentDisposition=inline");
        }
      }
    }, this);

    if (_.has(meta, 'LightBox')) {
      initLightBoxView(meta.LightBox);
    }
    if (_.has(meta, 'ProofReader')) {
      initProofReader(meta.ProofReader);
    }
    if (_.has(meta, 'SimpleLightBox')) {
      initSimpleLightBoxView(meta.SimpleLightBox);
    }
    if (_.has(meta, 'Stack')) {
      initStackView(meta.Stack);
    }
    if (_.has(meta, 'View')) {
      initCopyView(meta.Stack);
    }
    if (_.has(meta, 'MaskAnnotate')) {
      initMaskAnnotateView(meta.Stack);
    }
    if (_.has(meta, 'SAItem')) {
      initSAView(meta.SAItem);
    }
    if (_.has(meta, 'lightbox')) {
      initImagesView();
    }
  }, this);
});










