/**
 * @module ol/source/TileArcGISRest
 */
import {inherits} from '../index.js';
import {createEmpty} from '../extent.js';
import {modulo} from '../math.js';
import {assign} from '../obj.js';
import {toSize, scale as scaleSize} from '../size.js';
import TileImage from '../source/TileImage.js';
import {hash as tileCoordHash} from '../tilecoord.js';
import {appendParams} from '../uri.js';

/**
 * @typedef {Object} Options
 * @property {ol.AttributionLike} [attributions] Attributions.
 * @property {number} [cacheSize=2048] Cache size.
 * @property {null|string} [crossOrigin] The `crossOrigin` attribute for loaded images.
 * Note that you must provide a `crossOrigin` value if you are using the WebGL renderer
 * or if you want to access pixel data with the Canvas renderer.  See
 * {@link https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image}
 * for more detail.
 * @property {Object.<string,*>} [params] ArcGIS Rest parameters. This field is optional. Service defaults will be
 * used for any fields not specified. `FORMAT` is `PNG32` by default. `F` is `IMAGE` by
 * default. `TRANSPARENT` is `true` by default.  `BBOX, `SIZE`, `BBOXSR`,
 * and `IMAGESR` will be set dynamically. Set `LAYERS` to
 * override the default service layer visibility. See
 * {@link http://resources.arcgis.com/en/help/arcgis-rest-api/index.html#/Export_Map/02r3000000v7000000/}
 * for further reference.
 * @property {ol.tilegrid.TileGrid} [tileGrid] Tile grid. Base this on the resolutions,
 * tilesize and extent supported by the server.
 * If this is not defined, a default grid will be used: if there is a projection
 * extent, the grid will be based on that; if not, a grid based on a global
 * extent with origin at 0,0 will be used.
 * @property {ol.ProjectionLike} projection Projection.
 * @property {number} [reprojectionErrorThreshold=0.5] Maximum allowed reprojection error (in pixels).
 * Higher values can increase reprojection performance, but decrease precision.
 * @property {ol.TileLoadFunctionType} [tileLoadFunction] Optional function to load a tile given a URL.
 * The default is
 * ```js
 * function(imageTile, src) {
 *   imageTile.getImage().src = src;
 * };
 * ```
 * @property {string} [url] ArcGIS Rest service URL for a Map Service or Image Service. The
 * url should include /MapServer or /ImageServer.
 * @property {boolean} [wrapX=true] Whether to wrap the world horizontally.
 * @property {number} [transition] Duration of the opacity transition for rendering.  To disable the opacity
 * transition, pass `transition: 0`.
 * @property {Array.<string>} urls ArcGIS Rest service urls. Use this instead of `url` when the ArcGIS
 * Service supports multiple urls for export requests.
 */


/**
 * @classdesc
 * Layer source for tile data from ArcGIS Rest services. Map and Image
 * Services are supported.
 *
 * For cached ArcGIS services, better performance is available using the
 * {@link module:ol/source/XYZ~XYZ} data source.
 *
 * @constructor
 * @extends {module:ol/source/TileImage~TileImage}
 * @param {module:ol/source/TileArcGISRest~Options=} opt_options Tile ArcGIS Rest options.
 * @api
 */
const TileArcGISRest = function(opt_options) {

  const options = opt_options || {};

  TileImage.call(this, {
    attributions: options.attributions,
    cacheSize: options.cacheSize,
    crossOrigin: options.crossOrigin,
    projection: options.projection,
    reprojectionErrorThreshold: options.reprojectionErrorThreshold,
    tileGrid: options.tileGrid,
    tileLoadFunction: options.tileLoadFunction,
    url: options.url,
    urls: options.urls,
    wrapX: options.wrapX !== undefined ? options.wrapX : true,
    transition: options.transition
  });

  /**
   * @private
   * @type {!Object}
   */
  this.params_ = options.params || {};

  /**
   * @private
   * @type {module:ol/extent~Extent}
   */
  this.tmpExtent_ = createEmpty();

  this.setKey(this.getKeyForParams_());
};

inherits(TileArcGISRest, TileImage);


/**
 * @private
 * @return {string} The key for the current params.
 */
TileArcGISRest.prototype.getKeyForParams_ = function() {
  let i = 0;
  const res = [];
  for (const key in this.params_) {
    res[i++] = key + '-' + this.params_[key];
  }
  return res.join('/');
};


/**
 * Get the user-provided params, i.e. those passed to the constructor through
 * the "params" option, and possibly updated using the updateParams method.
 * @return {Object} Params.
 * @api
 */
TileArcGISRest.prototype.getParams = function() {
  return this.params_;
};


/**
 * @param {module:ol/tilecoord~TileCoord} tileCoord Tile coordinate.
 * @param {module:ol/size~Size} tileSize Tile size.
 * @param {module:ol/extent~Extent} tileExtent Tile extent.
 * @param {number} pixelRatio Pixel ratio.
 * @param {module:ol/proj/Projection~Projection} projection Projection.
 * @param {Object} params Params.
 * @return {string|undefined} Request URL.
 * @private
 */
TileArcGISRest.prototype.getRequestUrl_ = function(tileCoord, tileSize, tileExtent,
  pixelRatio, projection, params) {

  const urls = this.urls;
  if (!urls) {
    return undefined;
  }

  // ArcGIS Server only wants the numeric portion of the projection ID.
  const srid = projection.getCode().split(':').pop();

  params['SIZE'] = tileSize[0] + ',' + tileSize[1];
  params['BBOX'] = tileExtent.join(',');
  params['BBOXSR'] = srid;
  params['IMAGESR'] = srid;
  params['DPI'] = Math.round(
    params['DPI'] ? params['DPI'] * pixelRatio : 90 * pixelRatio
  );

  let url;
  if (urls.length == 1) {
    url = urls[0];
  } else {
    const index = modulo(tileCoordHash(tileCoord), urls.length);
    url = urls[index];
  }

  const modifiedUrl = url
    .replace(/MapServer\/?$/, 'MapServer/export')
    .replace(/ImageServer\/?$/, 'ImageServer/exportImage');
  return appendParams(modifiedUrl, params);
};


/**
 * @inheritDoc
 */
TileArcGISRest.prototype.getTilePixelRatio = function(pixelRatio) {
  return /** @type {number} */ (pixelRatio);
};


/**
 * @inheritDoc
 */
TileArcGISRest.prototype.fixedTileUrlFunction = function(tileCoord, pixelRatio, projection) {

  let tileGrid = this.getTileGrid();
  if (!tileGrid) {
    tileGrid = this.getTileGridForProjection(projection);
  }

  if (tileGrid.getResolutions().length <= tileCoord[0]) {
    return undefined;
  }

  const tileExtent = tileGrid.getTileCoordExtent(
    tileCoord, this.tmpExtent_);
  let tileSize = toSize(
    tileGrid.getTileSize(tileCoord[0]), this.tmpSize);

  if (pixelRatio != 1) {
    tileSize = scaleSize(tileSize, pixelRatio, this.tmpSize);
  }

  // Apply default params and override with user specified values.
  const baseParams = {
    'F': 'image',
    'FORMAT': 'PNG32',
    'TRANSPARENT': true
  };
  assign(baseParams, this.params_);

  return this.getRequestUrl_(tileCoord, tileSize, tileExtent,
    pixelRatio, projection, baseParams);
};


/**
 * Update the user-provided params.
 * @param {Object} params Params.
 * @api
 */
TileArcGISRest.prototype.updateParams = function(params) {
  assign(this.params_, params);
  this.setKey(this.getKeyForParams_());
};
export default TileArcGISRest;
