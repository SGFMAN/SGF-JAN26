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
export function handleLatLngForBounds(map, bounds, pixelOffset = 14) {
  const ne = northEastFromBounds(bounds);
  if (!ne || !map) return ne;
  return offsetLatLngByPixels(map, ne, pixelOffset, -pixelOffset);
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

  const fireToggle = (event) => {
    L.DomEvent.stopPropagation(event);
    L.DomEvent.preventDefault(event);
    onToggle?.();
  };

  marker.on("mousedown", fireToggle);

  return marker;
}

export function updateMoveHandleMarker(marker, { color, filled }) {
  if (!marker) return;
  marker.setIcon(createMoveHandleIcon(color, filled));
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
