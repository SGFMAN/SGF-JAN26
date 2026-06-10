import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import {
  BOUNDARY_HANDLE_COLOR,
  bindDebouncedMapViewSync,
  createMoveHandleMarker,
  handleLatLngForLayerGroup,
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

function setBoundaryPointerEvents(group, enabled) {
  forEachPathLayer(group, (layer) => {
    const el = layer.getElement?.();
    if (el) {
      el.style.pointerEvents = enabled ? "auto" : "none";
      if (enabled) el.style.zIndex = "900";
    }
  });
}

function boundaryGroupContainsLatLng(group, map, latlng) {
  if (!group || !map || !latlng) return false;
  let inside = false;
  forEachPathLayer(group, (layer) => {
    if (inside || !(layer instanceof L.Polygon)) return;
    try {
      const point = map.latLngToLayerPoint(latlng);
      if (layer._containsPoint(point)) inside = true;
    } catch {
      // ignore hit-test errors
    }
  });
  return inside;
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
  const mapDragHandlerRef = useRef(null);
  const draggingRef = useRef(false);

  featureRef.current = feature;
  onToggleRef.current = onToggleMovable;
  onFeatureChangeRef.current = onFeatureChange;

  function applyMovableVisuals(filled) {
    try {
      updateMoveHandleMarker(handleRef.current, {
        color: BOUNDARY_HANDLE_COLOR,
        filled,
      });
      setBoundaryCursor(boundaryRef.current, filled ? "grab" : "");
      setBoundaryPointerEvents(boundaryRef.current, filled);
      if (filled) {
        boundaryRef.current?.bringToFront?.();
        handleRef.current?.bringToFront?.();
      }
      if (handleRef.current) {
        handleRef.current.setTitle(
          filled ? "Boundary move enabled (click to lock)" : "Click to enable boundary move"
        );
      }
    } catch (err) {
      console.warn("[DraggableParcelBoundary] apply movable visuals:", err);
    }
  }

  function handleToggleMovable() {
    onToggleRef.current?.();
  }

  useEffect(() => {
    movableRef.current = movable;
    applyMovableVisuals(movable);
  }, [movable]);

  useEffect(() => {
    if (!feature?.geometry) return undefined;

    const mapInstance = map;
    let handle = null;
    let boundaryGroup = null;
    let unbindViewSync = null;
    let cancelled = false;

    const setup = () => {
      if (cancelled) return;
      const currentFeature = featureRef.current;
      if (!currentFeature?.geometry) return;
      try {
        boundaryGroup = L.layerGroup();
        L.geoJSON(currentFeature, {
          style: PARCEL_BOUNDARY_STYLE,
          interactive: true,
        }).eachLayer((layer) => boundaryGroup.addLayer(layer));

        boundaryGroup.addTo(mapInstance);
        boundaryGroup.bringToFront?.();
        boundaryRef.current = boundaryGroup;

        const syncHandlePosition = () => {
          if (!boundaryRef.current || !handleRef.current) return;
          try {
            const latlng = handleLatLngForLayerGroup(mapInstance, boundaryRef.current);
            if (latlng) handleRef.current.setLatLng(latlng);
          } catch (err) {
            console.warn("[DraggableParcelBoundary] sync handle:", err);
          }
        };

        handle = createMoveHandleMarker(
          boundaryGroup
            ? handleLatLngForLayerGroup(mapInstance, boundaryGroup)
            : mapInstance.getCenter(),
          {
            color: BOUNDARY_HANDLE_COLOR,
            filled: movableRef.current,
            title: movableRef.current
              ? "Boundary move enabled (click to lock)"
              : "Click to enable boundary move",
            onToggle: handleToggleMovable,
          }
        );
        if (handle) {
          handle.addTo(mapInstance);
          handleRef.current = handle;
        }

        const beginDrag = (startEvent) => {
          if (!movableRef.current || draggingRef.current || !startEvent.latlng) return;
          draggingRef.current = true;
          L.DomEvent.stop(startEvent);
          mapInstance.dragging.disable();
          mapInstance.getContainer().style.cursor = "grabbing";
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
            mapInstance.off("mousemove", onMove);
            mapInstance.off("mouseup", onUp);
            draggingRef.current = false;
            if (!movableRef.current) {
              mapInstance.dragging.enable();
            }
            mapInstance.getContainer().style.cursor = "";
            setBoundaryCursor(boundaryGroup, movableRef.current ? "grab" : "");

            const geometry = geometryFromLayerGroup(boundaryGroup);
            if (!geometry) return;
            onFeatureChangeRef.current?.({
              ...featureRef.current,
              geometry,
            });
          };

          mapInstance.on("mousemove", onMove);
          mapInstance.on("mouseup", onUp);
        };

        const onMapMouseDown = (event) => {
          if (!movableRef.current || draggingRef.current) return;
          if (!boundaryGroupContainsLatLng(boundaryGroup, mapInstance, event.latlng)) return;
          beginDrag(event);
        };

        dragHandlersRef.current.clear();
        forEachPathLayer(boundaryGroup, (layer) => {
          layer.on("mousedown", beginDrag);
          dragHandlersRef.current.set(layer, beginDrag);
        });
        mapInstance.on("mousedown", onMapMouseDown);
        mapDragHandlerRef.current = onMapMouseDown;
        setBoundaryCursor(boundaryGroup, movableRef.current ? "grab" : "");
        setBoundaryPointerEvents(boundaryGroup, movableRef.current);
        unbindViewSync = bindDebouncedMapViewSync(mapInstance, syncHandlePosition);
      } catch (err) {
        console.error("[DraggableParcelBoundary] setup failed:", err);
      }
    };

    const frameId = requestAnimationFrame(setup);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      unbindViewSync?.();
      if (mapDragHandlerRef.current) {
        mapInstance.off("mousedown", mapDragHandlerRef.current);
        mapDragHandlerRef.current = null;
      }
      dragHandlersRef.current.forEach((handler, layer) => {
        layer.off("mousedown", handler);
      });
      dragHandlersRef.current.clear();
      if (handle) mapInstance.removeLayer(handle);
      if (boundaryGroup) mapInstance.removeLayer(boundaryGroup);
      handleRef.current = null;
      boundaryRef.current = null;
    };
  }, [map]);

  return null;
}
