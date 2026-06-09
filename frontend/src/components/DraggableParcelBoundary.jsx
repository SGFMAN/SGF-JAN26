import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  BOUNDARY_HANDLE_COLOR,
  bindDebouncedMapViewSync,
  createMoveHandleMarker,
  handleLatLngForBounds,
  updateMoveHandleMarker,
} from "../utils/mapMoveHandle";
import { PARCEL_BOUNDARY_STYLE } from "../utils/parcelBoundaryStyle";

function isLatLng(value) {
  return value instanceof L.LatLng;
}

function isLatLngRing(value) {
  return Array.isArray(value) && value.length > 0 && isLatLng(value[0]);
}

function translateLatLngs(latlngs, dLat, dLng) {
  if (isLatLngRing(latlngs)) {
    return latlngs.map((ll) => L.latLng(ll.lat + dLat, ll.lng + dLng));
  }
  if (Array.isArray(latlngs)) {
    return latlngs.map((ring) => translateLatLngs(ring, dLat, dLng));
  }
  return latlngs;
}

function forEachPathLayer(group, fn) {
  if (!group) return;
  group.eachLayer((layer) => {
    if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
      fn(layer);
    } else if (layer.eachLayer) {
      forEachPathLayer(layer, fn);
    }
  });
}

function translateLayerGroup(group, dLat, dLng) {
  forEachPathLayer(group, (layer) => {
    layer.setLatLngs(translateLatLngs(layer.getLatLngs(), dLat, dLng));
  });
}

function boundsFromLayerGroup(group) {
  if (!group) return null;
  try {
    const bounds = L.latLngBounds([]);
    forEachPathLayer(group, (layer) => {
      bounds.extend(layer.getBounds());
    });
    return bounds.isValid() ? bounds : null;
  } catch {
    return null;
  }
}

function ringToCoordinates(ring) {
  const coords = ring.map((ll) => [ll.lng, ll.lat]);
  if (coords.length > 0) {
    const [firstLng, firstLat] = coords[0];
    const [lastLng, lastLat] = coords[coords.length - 1];
    if (firstLng !== lastLng || firstLat !== lastLat) {
      coords.push([firstLng, firstLat]);
    }
  }
  return coords;
}

function polygonLayerToGeometry(layer) {
  const latlngs = layer.getLatLngs();
  if (isLatLngRing(latlngs)) {
    return { type: "Polygon", coordinates: [ringToCoordinates(latlngs)] };
  }
  if (Array.isArray(latlngs) && isLatLngRing(latlngs[0])) {
    return { type: "Polygon", coordinates: latlngs.map(ringToCoordinates) };
  }
  return null;
}

function geometryFromLayerGroup(group) {
  const polygons = [];
  forEachPathLayer(group, (layer) => {
    const geom = polygonLayerToGeometry(layer);
    if (geom) polygons.push(geom);
  });
  if (polygons.length === 0) return null;
  if (polygons.length === 1) return polygons[0];
  return {
    type: "MultiPolygon",
    coordinates: polygons.map((g) => g.coordinates),
  };
}

function setBoundaryCursor(group, cursor) {
  forEachPathLayer(group, (layer) => {
    const el = layer.getElement?.();
    if (el) el.style.cursor = cursor;
  });
}

/** Title boundary with corner handle to toggle dragging. */
export default function DraggableParcelBoundary({
  feature,
  onFeatureChange,
  movable = false,
  onToggleMovable,
}) {
  const map = useMap();
  const boundaryRef = useRef(null);
  const handleRef = useRef(null);
  const featureRef = useRef(feature);
  const movableRef = useRef(movable);
  const onToggleRef = useRef(onToggleMovable);
  const onFeatureChangeRef = useRef(onFeatureChange);
  const dragHandlersRef = useRef(new Map());

  featureRef.current = feature;
  movableRef.current = movable;
  onToggleRef.current = onToggleMovable;
  onFeatureChangeRef.current = onFeatureChange;

  useEffect(() => {
    if (!feature?.geometry) return undefined;

    let handle = null;
    let boundaryGroup = null;
    let unbindViewSync = null;

    try {
      boundaryGroup = L.layerGroup();
      L.geoJSON(feature, {
        style: PARCEL_BOUNDARY_STYLE,
        interactive: true,
      }).eachLayer((layer) => boundaryGroup.addLayer(layer));

      boundaryGroup.addTo(map);
      boundaryRef.current = boundaryGroup;

      const bounds = boundsFromLayerGroup(boundaryGroup);
      handle = createMoveHandleMarker(
        bounds ? handleLatLngForBounds(map, bounds) : map.getCenter(),
        {
          color: BOUNDARY_HANDLE_COLOR,
          filled: movableRef.current,
          title: movableRef.current
            ? "Boundary move enabled (click to lock)"
            : "Click to enable boundary move",
          onToggle: () => onToggleRef.current?.(),
        }
      );
      if (handle) {
        handle.addTo(map);
        handleRef.current = handle;
      }

      const syncHandlePosition = () => {
        if (!boundaryRef.current || !handleRef.current) return;
        try {
          const nextBounds = boundsFromLayerGroup(boundaryRef.current);
          if (!nextBounds) return;
          const latlng = handleLatLngForBounds(map, nextBounds);
          if (latlng) handleRef.current.setLatLng(latlng);
        } catch (err) {
          console.warn("[DraggableParcelBoundary] sync handle:", err);
        }
      };

      const beginDrag = (startEvent) => {
        if (!movableRef.current) return;
        L.DomEvent.stopPropagation(startEvent);
        L.DomEvent.preventDefault(startEvent);
        map.dragging.disable();
        map.getContainer().style.cursor = "grabbing";
        setBoundaryCursor(boundaryGroup, "grabbing");

        let last = startEvent.latlng;

        const onMove = (ev) => {
          const dLat = ev.latlng.lat - last.lat;
          const dLng = ev.latlng.lng - last.lng;
          last = ev.latlng;
          translateLayerGroup(boundaryGroup, dLat, dLng);
          syncHandlePosition();
        };

        const onUp = () => {
          map.off("mousemove", onMove);
          map.off("mouseup", onUp);
          map.dragging.enable();
          map.getContainer().style.cursor = "";
          setBoundaryCursor(boundaryGroup, movableRef.current ? "grab" : "");

          const geometry = geometryFromLayerGroup(boundaryGroup);
          if (!geometry) return;
          onFeatureChangeRef.current?.({
            ...featureRef.current,
            geometry,
          });
        };

        map.on("mousemove", onMove);
        map.on("mouseup", onUp);
      };

      dragHandlersRef.current.clear();
      forEachPathLayer(boundaryGroup, (layer) => {
        layer.on("mousedown", beginDrag);
        dragHandlersRef.current.set(layer, beginDrag);
      });
      setBoundaryCursor(boundaryGroup, movableRef.current ? "grab" : "");

      unbindViewSync = bindDebouncedMapViewSync(map, syncHandlePosition);
    } catch (err) {
      console.error("[DraggableParcelBoundary] setup failed:", err);
    }

    return () => {
      unbindViewSync?.();
      dragHandlersRef.current.forEach((handler, layer) => {
        layer.off("mousedown", handler);
      });
      dragHandlersRef.current.clear();
      if (handle) map.removeLayer(handle);
      if (boundaryGroup) map.removeLayer(boundaryGroup);
      handleRef.current = null;
      boundaryRef.current = null;
    };
  }, [feature?.geometry, map]);

  useEffect(() => {
    updateMoveHandleMarker(handleRef.current, {
      color: BOUNDARY_HANDLE_COLOR,
      filled: movable,
    });
    setBoundaryCursor(boundaryRef.current, movable ? "grab" : "");
    if (handleRef.current) {
      handleRef.current.setTitle(
        movable ? "Boundary move enabled (click to lock)" : "Click to enable boundary move"
      );
    }
  }, [movable]);

  return null;
}
