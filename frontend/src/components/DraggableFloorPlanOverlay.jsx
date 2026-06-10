import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import FloorPlanCornerLevels from "./FloorPlanCornerLevels";
import {
  fetchFloorPlanImageBlob,
  floorPlanDimensionsMeters,
  loadImageSizeFromBlob,
  rotatedOverlayCornerLatLngs,
} from "../utils/floorPlanMap";
import {
  UNIT_HANDLE_COLOR,
  bindDebouncedMapViewSync,
  createMoveHandleMarker,
  offsetLatLngByPixels,
  updateMoveHandleMarker,
} from "../utils/mapMoveHandle";
import { createRotatedImageOverlay } from "../utils/rotatedImageOverlay";

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

function blockOverlayContextMenu(overlay) {
  const img = overlay?.getElement?.();
  if (!img) return;
  const wrap = img.parentElement;
  const prevent = (event) => {
    L.DomEvent.preventDefault(event);
    L.DomEvent.stopPropagation(event);
  };
  L.DomEvent.on(img, "contextmenu", prevent);
  if (wrap) L.DomEvent.on(wrap, "contextmenu", prevent);
}

function pointerBearingFromCenter(map, centerLatLng, pointerLatLng) {
  const center = map.latLngToContainerPoint(centerLatLng);
  const pointer = map.latLngToContainerPoint(pointerLatLng);
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

function startUnitDrag(
  map,
  overlay,
  movableRef,
  getPlacement,
  applyPlacement,
  onPlacementChangeRef,
  syncVisuals,
  startEvent
) {
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
    const placement = getPlacement();
    applyPlacement({
      center: { lat: placement.center.lat + dLat, lng: placement.center.lng + dLng },
      bearing: placement.bearing,
    });
    syncVisuals();
  };

  const onUp = () => {
    map.off("mousemove", onMove);
    map.off("mouseup", onUp);
    if (!movableRef.current) {
      map.dragging.enable();
    }
    map.getContainer().style.cursor = "";
    setOverlayInteraction(overlay, movableRef.current);
    const placement = getPlacement();
    onPlacementChangeRef.current?.({
      center: placement.center,
      bearing: placement.bearing,
    });
  };

  map.on("mousemove", onMove);
  map.on("mouseup", onUp);
}

function startUnitRotate(
  map,
  movableRef,
  getPlacement,
  applyPlacement,
  onPlacementChangeRef,
  syncVisuals,
  startEvent
) {
  if (!movableRef.current || !startEvent.latlng) return;
  L.DomEvent.stop(startEvent);
  if (startEvent.originalEvent) {
    L.DomEvent.preventDefault(startEvent.originalEvent);
  }
  map.dragging.disable();
  map.getContainer().style.cursor = "ew-resize";

  const container = map.getContainer();
  const preventMenu = (event) => {
    L.DomEvent.preventDefault(event);
    L.DomEvent.stopPropagation(event);
  };

  const placement = getPlacement();
  const center = L.latLng(placement.center.lat, placement.center.lng);
  const startPointerBearing = pointerBearingFromCenter(map, center, startEvent.latlng);
  const startBearing = placement.bearing;

  const onMove = (ev) => {
    if (!ev.latlng) return;
    if (ev.originalEvent) {
      L.DomEvent.preventDefault(ev.originalEvent);
    }
    const pointerBearing = pointerBearingFromCenter(map, center, ev.latlng);
    applyPlacement({
      center: placement.center,
      bearing: startBearing + (pointerBearing - startPointerBearing),
    });
    syncVisuals();
  };

  const onUp = (event) => {
    if (event?.originalEvent) {
      L.DomEvent.preventDefault(event.originalEvent);
    }
    map.off("mousemove", onMove);
    map.off("mouseup", onUp);
    map.off("contextmenu", preventMenu);
    container.removeEventListener("contextmenu", preventMenu, true);
    if (!movableRef.current) {
      map.dragging.enable();
    }
    map.getContainer().style.cursor = "";
    const latest = getPlacement();
    onPlacementChangeRef.current?.({
      center: latest.center,
      bearing: latest.bearing,
    });
  };

  map.on("mousemove", onMove);
  map.on("mouseup", onUp);
  map.on("contextmenu", preventMenu);
  container.addEventListener("contextmenu", preventMenu, true);
}

/** Scaled floor plan overlay — move with left drag, rotate with right drag when selected. */
export default function DraggableFloorPlanOverlay({
  plan,
  initialCenter,
  initialBearing = 0,
  onPlacementChange,
  movable = false,
  onToggleMovable,
  lookupState = "VIC",
  siteGeometry = null,
}) {
  const map = useMap();
  const [cornerPoints, setCornerPoints] = useState(null);
  const overlayRef = useRef(null);
  const handleRef = useRef(null);
  const objectUrlRef = useRef(null);
  const onPlacementChangeRef = useRef(onPlacementChange);
  const onToggleRef = useRef(onToggleMovable);
  const movableRef = useRef(movable);
  const initialCenterRef = useRef(initialCenter);
  const initialBearingRef = useRef(initialBearing);
  const mouseHandlerRef = useRef(null);
  const contextMenuHandlerRef = useRef(null);
  const unbindViewSyncRef = useRef(null);
  const draggingRef = useRef(false);
  const rotatingRef = useRef(false);
  const dimsRef = useRef(null);
  const placementRef = useRef({
    center: initialCenter || null,
    bearing: initialBearing,
  });
  const lastCornerKeyRef = useRef("");

  onPlacementChangeRef.current = onPlacementChange;
  onToggleRef.current = onToggleMovable;
  movableRef.current = movable;
  initialCenterRef.current = initialCenter;
  initialBearingRef.current = initialBearing;

  function getPlacement() {
    return placementRef.current;
  }

  function applyPlacement({ center, bearing }) {
    placementRef.current = { center, bearing };
    const dims = dimsRef.current;
    const overlay = overlayRef.current;
    if (!dims || !overlay || !center) return { overlay };

    const corners = rotatedOverlayCornerLatLngs(
      center.lat,
      center.lng,
      dims.widthM,
      dims.heightM,
      bearing
    );
    overlay.reposition(corners.nw, corners.ne, corners.sw);
    return { overlay };
  }

  function syncCornerPoints() {
    const placement = placementRef.current;
    const dims = dimsRef.current;
    if (!placement?.center || !dims) return;

    const { points } = rotatedOverlayCornerLatLngs(
      placement.center.lat,
      placement.center.lng,
      dims.widthM,
      dims.heightM,
      placement.bearing
    );
    const key = points
      .map((point) => `${point.id}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
      .join("|");
    if (key === lastCornerKeyRef.current) return;
    lastCornerKeyRef.current = key;
    setCornerPoints(points);
  }

  function syncHandlePosition() {
    const placement = placementRef.current;
    const dims = dimsRef.current;
    if (!placement?.center || !dims || !handleRef.current) return;

    try {
      const { ne } = rotatedOverlayCornerLatLngs(
        placement.center.lat,
        placement.center.lng,
        dims.widthM,
        dims.heightM,
        placement.bearing
      );
      const latlng = offsetLatLngByPixels(map, L.latLng(ne.lat, ne.lng), 8, -8);
      if (latlng) handleRef.current.setLatLng(latlng);
      syncCornerPoints();
    } catch (err) {
      console.warn("[DraggableFloorPlanOverlay] sync handle:", err);
    }
  }

  function syncVisuals() {
    applyPlacement(placementRef.current);
    syncHandlePosition();
  }

  function applyMovableVisuals(filled) {
    try {
      updateMoveHandleMarker(handleRef.current, {
        color: UNIT_HANDLE_COLOR,
        filled,
        title: filled
          ? "Unit selected — drag to move, right-drag to rotate"
          : "Click to select unit",
      });
      setOverlayInteraction(overlayRef.current, filled);
      if (filled && overlayRef.current) {
        overlayRef.current.bringToFront?.();
        const el = overlayRef.current.getElement?.();
        if (el) el.style.zIndex = "900";
      }
      if (handleRef.current) {
        handleRef.current.bringToFront?.();
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

  function attachOverlayHandlers(overlay) {
    if (mouseHandlerRef.current) {
      overlay.off("mousedown", mouseHandlerRef.current);
    }
    if (contextMenuHandlerRef.current) {
      overlay.off("contextmenu", contextMenuHandlerRef.current);
    }

    const onContextMenu = (event) => {
      if (!movableRef.current) return;
      L.DomEvent.preventDefault(event);
      L.DomEvent.stopPropagation(event);
    };

    const onMouseDown = (startEvent) => {
      if (!movableRef.current) return;
      const button = startEvent.originalEvent?.button ?? 0;
      if (button === 2) {
        if (rotatingRef.current || draggingRef.current) return;
        rotatingRef.current = true;
        startUnitRotate(
          map,
          movableRef,
          getPlacement,
          applyPlacement,
          onPlacementChangeRef,
          syncVisuals,
          startEvent
        );
        const onRotateEnd = () => {
          rotatingRef.current = false;
          map.off("mouseup", onRotateEnd);
        };
        map.once("mouseup", onRotateEnd);
        return;
      }
      if (button !== 0) return;
      if (draggingRef.current || rotatingRef.current) return;
      draggingRef.current = true;
      startUnitDrag(
          map,
          overlay,
          movableRef,
          getPlacement,
          applyPlacement,
          onPlacementChangeRef,
          syncVisuals,
          startEvent
        );
      const onDragEnd = () => {
        draggingRef.current = false;
        map.off("mouseup", onDragEnd);
      };
      map.once("mouseup", onDragEnd);
    };

    overlay.on("mousedown", onMouseDown);
    overlay.on("contextmenu", onContextMenu);
    mouseHandlerRef.current = onMouseDown;
    contextMenuHandlerRef.current = onContextMenu;
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
        dimsRef.current = dims;

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        const mapCenter = map.getCenter();
        const startCenter = initialCenterRef.current || {
          lat: mapCenter.lat,
          lng: mapCenter.lng,
        };
        placementRef.current = {
          center: startCenter,
          bearing: initialBearingRef.current || 0,
        };

        const corners = rotatedOverlayCornerLatLngs(
          startCenter.lat,
          startCenter.lng,
          dims.widthM,
          dims.heightM,
          placementRef.current.bearing
        );

        const overlay = createRotatedImageOverlay(objectUrl, corners, {
          opacity: 0.92,
          interactive: true,
          alt: plan.name || "Floor plan",
        });

        const handle = createMoveHandleMarker(
          offsetLatLngByPixels(map, L.latLng(corners.ne.lat, corners.ne.lng), 8, -8),
          {
            color: UNIT_HANDLE_COLOR,
            filled: movableRef.current,
            title: movableRef.current
              ? "Unit selected — drag to move, right-drag to rotate"
              : "Click to select unit",
            onToggle: handleToggleMovable,
          }
        );

        overlay.addTo(map);
        disableNativeImageDrag(overlay);
        blockOverlayContextMenu(overlay);
        if (handle) handle.addTo(map);

        attachOverlayHandlers(overlay);
        applyMovableVisuals(movableRef.current);

        overlayRef.current = overlay;
        handleRef.current = handle;
        lastCornerKeyRef.current = "";

        const syncWhenReady = () => {
          disableNativeImageDrag(overlay);
          blockOverlayContextMenu(overlay);
          syncVisuals();
        };
        const imgEl = overlay.getElement();
        if (imgEl?.complete && imgEl.naturalWidth) {
          syncWhenReady();
        } else {
          overlay.once("load", syncWhenReady);
        }

        unbindViewSyncRef.current?.();
        unbindViewSyncRef.current = bindDebouncedMapViewSync(map, syncHandlePosition);

        onPlacementChangeRef.current?.({
          center: placementRef.current.center,
          bearing: placementRef.current.bearing,
        });
      } catch (err) {
        console.error("[DraggableFloorPlanOverlay]", err);
      }
    })();

    return () => {
      cancelled = true;
      unbindViewSyncRef.current?.();
      unbindViewSyncRef.current = null;
      if (overlayRef.current && mouseHandlerRef.current) {
        overlayRef.current.off("mousedown", mouseHandlerRef.current);
      }
      if (overlayRef.current && contextMenuHandlerRef.current) {
        overlayRef.current.off("contextmenu", contextMenuHandlerRef.current);
      }
      mouseHandlerRef.current = null;
      contextMenuHandlerRef.current = null;
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
      dimsRef.current = null;
      lastCornerKeyRef.current = "";
      setCornerPoints(null);
    };
  }, [plan?.id, plan?.scale?.metersPerPixel, plan?.name, map]);

  return (
    <FloorPlanCornerLevels
      cornerPoints={cornerPoints}
      siteGeometry={siteGeometry}
      lookupState={lookupState}
      enabled
    />
  );
}
