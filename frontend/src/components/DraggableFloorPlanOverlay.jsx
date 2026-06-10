import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import FloorPlanCornerLevels from "./FloorPlanCornerLevels";
import {
  boundsFromCenter,
  fetchFloorPlanImageBlob,
  floorPlanDimensionsMeters,
  loadImageSizeFromBlob,
} from "../utils/floorPlanMap";
import {
  UNIT_HANDLE_COLOR,
  bindDebouncedMapViewSync,
  createMoveHandleMarker,
  handleLatLngForBounds,
  updateMoveHandleMarker,
} from "../utils/mapMoveHandle";

function setOverlayInteraction(overlay, movable) {
  const el = overlay?.getElement?.();
  if (!el) return;
  el.style.cursor = movable ? "grab" : "";
  el.style.pointerEvents = movable ? "auto" : "none";
}

function disableNativeImageDrag(overlay) {
  const el = overlay?.getElement?.();
  if (!el) return;
  el.draggable = false;
  el.style.userSelect = "none";
  el.style.webkitUserDrag = "none";
  el.addEventListener("dragstart", (event) => {
    L.DomEvent.preventDefault(event);
  });
}

function startUnitDrag(map, overlay, movableRef, syncHandlePosition, onCenterChangeRef, startEvent) {
  if (!movableRef.current || !startEvent.latlng) return;
  L.DomEvent.stop(startEvent);
  if (startEvent.originalEvent) {
    L.DomEvent.preventDefault(startEvent.originalEvent);
  }
  map.dragging.disable();
  map.getContainer().style.cursor = "grabbing";
  setOverlayInteraction(overlay, true);

  let last = startEvent.latlng;

  const onMove = (ev) => {
    if (ev.originalEvent) {
      L.DomEvent.preventDefault(ev.originalEvent);
    }
    const dLat = ev.latlng.lat - last.lat;
    const dLng = ev.latlng.lng - last.lng;
    last = ev.latlng;
    const current = overlay.getBounds();
    const sw = current.getSouthWest();
    const ne = current.getNorthEast();
    overlay.setBounds([
      [sw.lat + dLat, sw.lng + dLng],
      [ne.lat + dLat, ne.lng + dLng],
    ]);
    syncHandlePosition();
  };

  const onUp = () => {
    map.off("mousemove", onMove);
    map.off("mouseup", onUp);
    if (!movableRef.current) {
      map.dragging.enable();
    }
    map.getContainer().style.cursor = "";
    setOverlayInteraction(overlay, movableRef.current);
    const c = overlay.getBounds().getCenter();
    onCenterChangeRef.current?.({ lat: c.lat, lng: c.lng });
  };

  map.on("mousemove", onMove);
  map.on("mouseup", onUp);
}

/** Scaled floor plan overlay with corner handle to toggle dragging. */
export default function DraggableFloorPlanOverlay({
  plan,
  initialCenter,
  onCenterChange,
  movable = false,
  onToggleMovable,
  lookupState = "VIC",
}) {
  const map = useMap();
  const [overlayBounds, setOverlayBounds] = useState(null);
  const overlayRef = useRef(null);
  const handleRef = useRef(null);
  const objectUrlRef = useRef(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const onToggleRef = useRef(onToggleMovable);
  const movableRef = useRef(movable);
  const initialCenterRef = useRef(initialCenter);
  const dragHandlerRef = useRef(null);
  const unbindViewSyncRef = useRef(null);
  const draggingRef = useRef(false);

  onCenterChangeRef.current = onCenterChange;
  onToggleRef.current = onToggleMovable;
  movableRef.current = movable;
  initialCenterRef.current = initialCenter;

  function syncOverlayBounds() {
    const overlay = overlayRef.current;
    if (!overlay) return;
    try {
      setOverlayBounds(overlay.getBounds());
    } catch (err) {
      console.warn("[DraggableFloorPlanOverlay] sync bounds:", err);
    }
  }

  function syncHandlePosition() {
    const overlay = overlayRef.current;
    if (!overlay || !handleRef.current) return;
    try {
      const latlng = handleLatLngForBounds(map, overlay.getBounds());
      if (latlng) handleRef.current.setLatLng(latlng);
      syncOverlayBounds();
    } catch (err) {
      console.warn("[DraggableFloorPlanOverlay] sync handle:", err);
    }
  }

  function applyMovableVisuals(filled) {
    try {
      updateMoveHandleMarker(handleRef.current, {
        color: UNIT_HANDLE_COLOR,
        filled,
      });
      setOverlayInteraction(overlayRef.current, filled);
      if (filled && overlayRef.current) {
        overlayRef.current.bringToFront?.();
        const el = overlayRef.current.getElement?.();
        if (el) el.style.zIndex = "900";
      }
      if (handleRef.current) {
        handleRef.current.bringToFront?.();
        handleRef.current.setTitle(
          filled ? "Unit move enabled (click to lock)" : "Click to enable unit move"
        );
      }
    } catch (err) {
      console.warn("[DraggableFloorPlanOverlay] apply movable visuals:", err);
    }
  }

  function handleToggleMovable() {
    onToggleRef.current?.();
  }

  useEffect(() => {
    movableRef.current = movable;
    applyMovableVisuals(movable);
  }, [movable]);

  function attachOverlayDrag(overlay) {
    if (dragHandlerRef.current) {
      overlay.off("mousedown", dragHandlerRef.current);
    }

    const beginDrag = (startEvent) => {
      if (draggingRef.current) return;
      draggingRef.current = true;
      startUnitDrag(map, overlay, movableRef, syncHandlePosition, onCenterChangeRef, startEvent);
      const onDragEnd = () => {
        draggingRef.current = false;
        map.off("mouseup", onDragEnd);
      };
      map.once("mouseup", onDragEnd);
    };

    overlay.on("mousedown", beginDrag);
    dragHandlerRef.current = beginDrag;
  }

  useEffect(() => {
    if (!plan?.id || !plan.scale?.metersPerPixel) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const blob = await fetchFloorPlanImageBlob(plan.id);
        if (cancelled) return;

        const { width, height } = await loadImageSizeFromBlob(blob);
        if (cancelled) return;

        const dims = floorPlanDimensionsMeters(plan, width, height);
        if (!dims) return;

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        const mapCenter = map.getCenter();
        const startCenter = initialCenterRef.current || { lat: mapCenter.lat, lng: mapCenter.lng };
        const bounds = boundsFromCenter(startCenter.lat, startCenter.lng, dims.widthM, dims.heightM);
        const leafletBounds = L.latLngBounds(bounds);

        const overlay = L.imageOverlay(objectUrl, bounds, {
          opacity: 0.92,
          interactive: true,
          alt: plan.name || "Floor plan",
        });

        const handle = createMoveHandleMarker(handleLatLngForBounds(map, leafletBounds), {
          color: UNIT_HANDLE_COLOR,
          filled: movableRef.current,
          title: movableRef.current ? "Unit move enabled (click to lock)" : "Click to enable unit move",
          onToggle: handleToggleMovable,
        });

        overlay.addTo(map);
        disableNativeImageDrag(overlay);
        overlay.on("load", () => disableNativeImageDrag(overlay));
        if (handle) handle.addTo(map);

        attachOverlayDrag(overlay);
        applyMovableVisuals(movableRef.current);

        overlayRef.current = overlay;
        handleRef.current = handle;

        unbindViewSyncRef.current?.();
        unbindViewSyncRef.current = bindDebouncedMapViewSync(map, syncHandlePosition);
        if (initialCenterRef.current) {
          onCenterChangeRef.current?.({
            lat: startCenter.lat,
            lng: startCenter.lng,
          });
        }
      } catch (err) {
        console.error("[DraggableFloorPlanOverlay]", err);
      }
    })();

    return () => {
      cancelled = true;
      unbindViewSyncRef.current?.();
      unbindViewSyncRef.current = null;
      if (overlayRef.current && dragHandlerRef.current) {
        overlayRef.current.off("mousedown", dragHandlerRef.current);
      }
      dragHandlerRef.current = null;
      if (overlayRef.current) {
        map.removeLayer(overlayRef.current);
        overlayRef.current = null;
      }
      if (handleRef.current) {
        map.removeLayer(handleRef.current);
        handleRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setOverlayBounds(null);
    };
  }, [plan?.id, plan?.scale?.metersPerPixel, plan?.name, map]);

  return (
    <FloorPlanCornerLevels
      bounds={overlayBounds}
      lookupState={lookupState}
      enabled={Boolean(overlayBounds)}
    />
  );
}
