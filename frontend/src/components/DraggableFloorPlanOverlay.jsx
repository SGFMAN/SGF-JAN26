import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
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

/** Scaled floor plan overlay with corner handle to toggle dragging. */
export default function DraggableFloorPlanOverlay({
  plan,
  initialCenter,
  onCenterChange,
  movable = false,
  onToggleMovable,
}) {
  const map = useMap();
  const overlayRef = useRef(null);
  const handleRef = useRef(null);
  const objectUrlRef = useRef(null);
  const onCenterChangeRef = useRef(onCenterChange);
  const onToggleRef = useRef(onToggleMovable);
  const movableRef = useRef(movable);
  const initialCenterRef = useRef(initialCenter);
  const dragHandlerRef = useRef(null);
  const unbindViewSyncRef = useRef(null);

  onCenterChangeRef.current = onCenterChange;
  onToggleRef.current = onToggleMovable;
  movableRef.current = movable;
  initialCenterRef.current = initialCenter;

  function syncHandlePosition() {
    const overlay = overlayRef.current;
    if (!overlay || !handleRef.current) return;
    try {
      const latlng = handleLatLngForBounds(map, overlay.getBounds());
      if (latlng) handleRef.current.setLatLng(latlng);
    } catch (err) {
      console.warn("[DraggableFloorPlanOverlay] sync handle:", err);
    }
  }

  function attachOverlayDrag(overlay) {
    if (dragHandlerRef.current) {
      overlay.off("mousedown", dragHandlerRef.current);
    }

    const beginDrag = (startEvent) => {
      if (!movableRef.current) return;
      L.DomEvent.stopPropagation(startEvent);
      L.DomEvent.preventDefault(startEvent);
      map.dragging.disable();
      map.getContainer().style.cursor = "grabbing";
      setOverlayInteraction(overlay, true);
      const el = overlay.getElement?.();
      if (el) el.style.cursor = "grabbing";

      let last = startEvent.latlng;

      const onMove = (ev) => {
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
        map.dragging.enable();
        map.getContainer().style.cursor = "";
        setOverlayInteraction(overlay, movableRef.current);
        const c = overlay.getBounds().getCenter();
        onCenterChangeRef.current?.({ lat: c.lat, lng: c.lng });
      };

      map.on("mousemove", onMove);
      map.on("mouseup", onUp);
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
          onToggle: () => onToggleRef.current?.(),
        });

        attachOverlayDrag(overlay);
        setOverlayInteraction(overlay, movableRef.current);

        overlay.addTo(map);
        if (handle) handle.addTo(map);

        overlayRef.current = overlay;
        handleRef.current = handle;

        unbindViewSyncRef.current?.();
        unbindViewSyncRef.current = bindDebouncedMapViewSync(map, syncHandlePosition);
        onCenterChangeRef.current?.({ lat: startCenter.lat, lng: startCenter.lng });
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
    };
  }, [plan?.id, plan?.scale?.metersPerPixel, plan?.name, map]);

  useEffect(() => {
    updateMoveHandleMarker(handleRef.current, {
      color: UNIT_HANDLE_COLOR,
      filled: movable,
    });
    setOverlayInteraction(overlayRef.current, movable);
    if (handleRef.current) {
      handleRef.current.setTitle(
        movable ? "Unit move enabled (click to lock)" : "Click to enable unit move"
      );
    }
  }, [movable]);

  return null;
}
