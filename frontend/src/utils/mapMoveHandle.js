import L from "leaflet";

export const BOUNDARY_HANDLE_COLOR = "#FFD700";
export const UNIT_HANDLE_COLOR = "#2563eb";
const HANDLE_SIZE = 16;

export function createMoveHandleIcon(color, filled, size = HANDLE_SIZE) {
  const border = filled
    ? `2px solid ${color}`
    : `2.5px solid ${color}`;
  const background = filled ? color : "transparent";
  const html = `<div style="
    width:${size}px;
    height:${size}px;
    background:${background};
    border:${border};
    box-shadow:0 0 0 1px rgba(255,255,255,0.9), 0 1px 4px rgba(0,0,0,0.35);
    box-sizing:border-box;
    cursor:pointer;
  "></div>`;

  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function offsetLatLngByPixels(map, latlng, dx, dy) {
  if (!map || !latlng) return latlng;
  try {
    const point = map.latLngToLayerPoint(latlng);
    return map.layerPointToLatLng(L.point(point.x + dx, point.y + dy));
  } catch {
    return latlng;
  }
}

/** Place handle just outside the north-east corner of bounds. */
export function handleLatLngForBounds(map, bounds, pixelOffset = 8) {
  const ne = northEastFromBounds(bounds);
  if (!ne || !map) return ne;
  return offsetLatLngByPixels(map, ne, pixelOffset, -pixelOffset);
}

function isLatLngLike(value) {
  return value instanceof L.LatLng || (value?.lat != null && value?.lng != null);
}

function isLatLngRing(latlngs) {
  return Array.isArray(latlngs) && latlngs.length > 0 && isLatLngLike(latlngs[0]);
}

function collectVertices(latlngs, out) {
  if (!Array.isArray(latlngs)) return;
  if (isLatLngRing(latlngs)) {
    for (const ll of latlngs) {
      out.push(ll instanceof L.LatLng ? ll : L.latLng(ll.lat, ll.lng));
    }
    return;
  }
  for (const part of latlngs) {
    collectVertices(part, out);
  }
}

/** North-east corner of actual path geometry (not axis-aligned bbox). */
export function northEastVertexFromLayerGroup(group) {
  if (!group) return null;
  const vertices = [];
  group.eachLayer((layer) => {
    if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
      collectVertices(layer.getLatLngs(), vertices);
    }
  });
  if (vertices.length === 0) return null;

  let best = vertices[0];
  let bestScore = best.lat + best.lng;
  for (let i = 1; i < vertices.length; i += 1) {
    const vertex = vertices[i];
    const score = vertex.lat + vertex.lng;
    if (score > bestScore) {
      bestScore = score;
      best = vertex;
    }
  }
  return best;
}

/** Place handle just outside the north-east vertex of path geometry. */
export function handleLatLngForLayerGroup(map, group, pixelOffset = 8) {
  const vertex = northEastVertexFromLayerGroup(group);
  if (!vertex || !map) return null;
  return offsetLatLngByPixels(map, vertex, pixelOffset, -pixelOffset);
}

export function deferMapToggle(callback) {
  window.setTimeout(() => {
    try {
      callback?.();
    } catch (err) {
      console.warn("[mapMoveHandle] deferred toggle:", err);
    }
  }, 0);
}

export function createMoveHandleMarker(latlng, { color, filled, onToggle, title }) {
  if (!latlng) return null;

  const marker = L.marker(latlng, {
    icon: createMoveHandleIcon(color, filled),
    interactive: true,
    zIndexOffset: 2500,
    draggable: false,
    keyboard: false,
    title: title || "Toggle move lock",
    bubblingMouseEvents: false,
  });

  marker.on("mousedown", (event) => {
    L.DomEvent.stop(event);
    deferMapToggle(onToggle);
  });

  return marker;
}

export function setMarkerTooltip(marker, title) {
  if (!marker || title == null) return;
  if (marker.options) marker.options.title = title;
  const el = marker.getElement?.();
  if (el) el.title = title;
}

export function updateMoveHandleMarker(marker, { color, filled, title }) {
  if (!marker) return;
  try {
    marker.setIcon(createMoveHandleIcon(color, filled));
    if (title) setMarkerTooltip(marker, title);
  } catch (err) {
    console.warn("[mapMoveHandle] update handle:", err);
  }
}

export function northEastFromBounds(bounds) {
  if (!bounds) return null;
  return bounds.getNorthEast();
}

/** Debounced sync on pan/zoom — avoids crashes from sync during Leaflet animations. */
export function bindDebouncedMapViewSync(map, callback) {
  if (!map || typeof callback !== "function") return () => {};
  let rafId = null;
  const run = () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      rafId = null;
      try {
        callback();
      } catch (err) {
        console.warn("[mapMoveHandle] view sync:", err);
      }
    });
  };
  map.on("zoomend", run);
  map.on("moveend", run);
  return () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    map.off("zoomend", run);
    map.off("moveend", run);
  };
}
