import L from "leaflet";

/**
 * Rotated image overlay (three corner points).
 * Wrapper div participates in Leaflet zoom animation; inner img handles rotation.
 * Based on Leaflet.ImageOverlay.Rotated by Iván Sánchez.
 */
export const RotatedImageOverlay = L.ImageOverlay.extend({
  initialize(topLeft, topRight, bottomLeft, url, options) {
    if (typeof url === "string") {
      this._url = url;
    } else {
      this._rawImage = url;
    }
    this._topLeft = L.latLng(topLeft);
    this._topRight = L.latLng(topRight);
    this._bottomLeft = L.latLng(bottomLeft);
    L.setOptions(this, options);
  },

  onAdd(map) {
    if (!this._image) {
      this._initImage();
      if (this.options.opacity < 1) {
        this._updateOpacity();
      }
    }

    if (this.options.interactive) {
      L.DomUtil.addClass(this._rawImage, "leaflet-interactive");
      this.addInteractiveTarget(this._rawImage);
    }

    map.on("zoomend viewreset", this._reset, this);
    this.getPane().appendChild(this._image);
    this._reset();
  },

  onRemove(map) {
    map.off("zoomend viewreset", this._reset, this);
    if (this.options.interactive) {
      this.removeInteractiveTarget(this._rawImage);
    }
    L.DomUtil.remove(this._image);
  },

  _initImage() {
    let img = this._rawImage;
    if (this._url) {
      img = L.DomUtil.create("img");
      img.style.display = "none";
      if (this.options.crossOrigin || this.options.crossOrigin === "") {
        img.crossOrigin = this.options.crossOrigin === true ? "" : this.options.crossOrigin;
      }
      img.src = this._url;
      this._rawImage = img;
    }

    L.DomUtil.addClass(img, "leaflet-image-layer");

    const div = (this._image = L.DomUtil.create(
      "div",
      `leaflet-image-layer${this._zoomAnimated ? " leaflet-zoom-animated" : ""}`
    ));
    if (this.options.className) {
      L.DomUtil.addClass(div, this.options.className);
    }
    this._updateZIndex();
    div.appendChild(img);

    div.onselectstart = L.Util.falseFn;
    div.onmousemove = L.Util.falseFn;

    img.onload = () => {
      this._reset();
      img.style.display = "block";
      this.fire("load");
    };
    img.onerror = () => this.fire("error");
    img.alt = this.options.alt || "";
  },

  _reset() {
    const div = this._image;
    const map = this._map;
    if (!map || !div) return;

    const pxTopLeft = map.latLngToLayerPoint(this._topLeft);
    const pxTopRight = map.latLngToLayerPoint(this._topRight);
    const pxBottomLeft = map.latLngToLayerPoint(this._bottomLeft);
    const pxBottomRight = pxTopRight.subtract(pxTopLeft).add(pxBottomLeft);

    const pxBounds = L.bounds([pxTopLeft, pxTopRight, pxBottomLeft, pxBottomRight]);
    const size = pxBounds.getSize();
    const pxTopLeftInDiv = pxTopLeft.subtract(pxBounds.min);

    // Geographic bounds of the axis-aligned box — used by Leaflet's _animateZoom on the wrapper div.
    this._bounds = L.latLngBounds(
      map.layerPointToLatLng(pxBounds.min),
      map.layerPointToLatLng(pxBounds.max)
    );

    L.DomUtil.setPosition(div, pxBounds.min);
    div.style.width = `${size.x}px`;
    div.style.height = `${size.y}px`;

    const img = this._rawImage;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!imgW || !imgH) return;

    const vectorX = pxTopRight.subtract(pxTopLeft);
    const vectorY = pxBottomLeft.subtract(pxTopLeft);

    img.style.transformOrigin = "0 0";
    img.style.transform =
      `matrix(${vectorX.x / imgW}, ${vectorX.y / imgW}, ` +
      `${vectorY.x / imgH}, ${vectorY.y / imgH}, ` +
      `${pxTopLeftInDiv.x}, ${pxTopLeftInDiv.y})`;
  },

  reposition(topLeft, topRight, bottomLeft) {
    this._topLeft = L.latLng(topLeft);
    this._topRight = L.latLng(topRight);
    this._bottomLeft = L.latLng(bottomLeft);
    this._reset();
    return this;
  },

  getCorners() {
    return {
      nw: this._topLeft,
      ne: this._topRight,
      sw: this._bottomLeft,
    };
  },

  getElement() {
    return this._rawImage;
  },
});

export function createRotatedImageOverlay(url, corners, options = {}) {
  return new RotatedImageOverlay(
    corners.nw,
    corners.ne,
    corners.sw,
    url,
    options
  );
}
