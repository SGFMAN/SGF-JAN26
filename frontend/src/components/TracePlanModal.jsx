import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fitScale,
  loadPdfDocumentFromUrl,
  renderPdfDocumentPage,
} from "../utils/floorPlanCrop";
import {
  createEmptyLayerTraces,
  denormalizeCropRect,
  denormalizeTracePoints,
  denormalizeTraceSegments,
  EXTERNAL_WALLS_LAYER_ID,
  hasLayerDraft,
  INTERNAL_WALLS_LAYER_ID,
  isLineTraceLayer,
  isWindowsTraceLayer,
  isDoorsTraceLayer,
  isSlidingDoorsTraceLayer,
  isDeckTraceLayer,
  DOORS_LAYER_ID,
  SLIDING_DOORS_LAYER_ID,
  ROOF_LAYER_ID,
  DECK_LAYER_ID,
  MAX_TRACE_POINTS,
  normalizeCropRect,
  normalizePixelCropRect,
  normalizeTracePoints,
  normalizeTraceSegments,
  parsePlanTracePolygon,
  TRACE_PLAN_GROUPS,
  TRACE_PLAN_LAYERS,
  WINDOWS_LAYER_ID,
} from "../utils/planTracePolygon";
import {
  resolveWindowPlacement,
  buildWindowRenderFromEndpoints,
  resizeWindowFromEndpoint,
  resizeSlidingDoorFromEndpoint,
  WINDOW_HEIGHT_INCREMENTS_M,
  DEFAULT_WINDOW_HEIGHT_M,
  DOOR_WIDTH_M,
  SLIDING_DOOR_WIDTH_M,
} from "../utils/planTraceWindows";
import { computeMetresPerPixel } from "../utils/planTraceScale";
import {
  finalizeInternalWallSegment,
  externalWallInnerBoundarySource,
  buildInternalWallVisibleOutlines,
  internalWallHalfThicknessSource,
  internalWallSegmentSourceFootprintForRender,
  pointInPolygon,
} from "../utils/tracePlanInternalWalls";
import { resolveInternalWallDrawSnap } from "../utils/tracePlanInternalWallSnap";
import {
  collectOrthoReferenceAxes,
  orthogonalSnap,
  resolveOrthoNodeDrag,
  resolvePolygonOrthoSnap,
} from "../utils/planTraceOrthoSnap";
import { resolveDeckPolygonSnap, resolveDeckStartSnap } from "../utils/planTraceDeckSnap";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const CLOSE_SNAP_PX = 14;
const WINDOW_RESIZE_NODE_PX = 12;
const NODE_HIT_PX = 12;
const LINE_HIT_PX = 10;
const MERGE_SNAP_PX = 14;
const WALL_SNAP_PX = 16;
const ORTHO_SNAP_PX = 16;
const WALL_NODE_COINCIDE_PX = 0.75;
const MIN_CROP_PX = 40;

const WIZARD_PAGE = "page";
const WIZARD_AREA = "area";
const WIZARD_CALIBRATE = "calibrate";
const WIZARD_TRACE = "trace";

function wallNodesMatch(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.segmentIndex === b.segmentIndex && a.vertex === b.vertex;
}

function pointsCoincide(a, b, epsilon = WALL_NODE_COINCIDE_PX) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= epsilon;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    const dist = Math.hypot(px - ax, py - ay);
    return { dist, t: 0, x: ax, y: ay };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { dist: Math.hypot(px - x, py - y), t, x, y };
}

export default function TracePlanModal({
  pdfUrl,
  savedPolygon,
  onSave,
  onClose,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfDocRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0, baseFit: 1 });
  const interactionRef = useRef(null);
  const savedTraceRef = useRef(parsePlanTracePolygon(savedPolygon));
  const internalWallDraftRef = useRef(null);
  const internalWallSnapHintRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [wizardStep, setWizardStep] = useState(WIZARD_PAGE);
  const [cropRectPx, setCropRectPx] = useState(null);
  const [cropDraftEnd, setCropDraftEnd] = useState(null);
  const [activeLayerId, setActiveLayerId] = useState(EXTERNAL_WALLS_LAYER_ID);
  const [layerTraces, setLayerTraces] = useState(createEmptyLayerTraces);
  const [calibration, setCalibration] = useState(savedTraceRef.current.calibration || null);
  const [calibDraftStart, setCalibDraftStart] = useState(null);
  const [calibPreviewEnd, setCalibPreviewEnd] = useState(null);
  const [pendingCalibLine, setPendingCalibLine] = useState(null);
  const [lengthInput, setLengthInput] = useState("");
  const [nearOrigin, setNearOrigin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewTick, setViewTick] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState(-1);
  const [draggingNodeIndex, setDraggingNodeIndex] = useState(-1);
  const [snapMergeTargetIndex, setSnapMergeTargetIndex] = useState(-1);
  const [linePreviewPoint, setLinePreviewPoint] = useState(null);
  const [polygonPreviewPoint, setPolygonPreviewPoint] = useState(null);
  const [hoveredWallNode, setHoveredWallNode] = useState(null);
  const [draggingWallNode, setDraggingWallNode] = useState(null);
  const [windowPreview, setWindowPreview] = useState(null);
  const [windowTool, setWindowTool] = useState("add");
  const [deckTool, setDeckTool] = useState("add");
  const [hoveredDeckIndex, setHoveredDeckIndex] = useState(-1);
  const [editingDeckIndex, setEditingDeckIndex] = useState(-1);
  const [hoveredWindowIndex, setHoveredWindowIndex] = useState(-1);
  const [hoveredResizeIndex, setHoveredResizeIndex] = useState(-1);
  const [hoveredHeightIndex, setHoveredHeightIndex] = useState(-1);
  const [resizeWidthM, setResizeWidthM] = useState(null);
  const [movingWindowIndex, setMovingWindowIndex] = useState(-1);
  const [heightPickerIndex, setHeightPickerIndex] = useState(-1);
  const [doorTool, setDoorTool] = useState("add");
  const [doorPreview, setDoorPreview] = useState(null);
  const [hoveredDoorIndex, setHoveredDoorIndex] = useState(-1);
  const [movingDoorIndex, setMovingDoorIndex] = useState(-1);
  const [slidingDoorTool, setSlidingDoorTool] = useState("add");
  const [slidingDoorPreview, setSlidingDoorPreview] = useState(null);
  const [hoveredSlidingDoorIndex, setHoveredSlidingDoorIndex] = useState(-1);
  const [hoveredSlidingResizeIndex, setHoveredSlidingResizeIndex] = useState(-1);
  const [movingSlidingDoorIndex, setMovingSlidingDoorIndex] = useState(-1);
  const [slidingResizeWidthM, setSlidingResizeWidthM] = useState(null);
  const [openSubmenuLayerId, setOpenSubmenuLayerId] = useState(null);
  const [showPdfPlan, setShowPdfPlan] = useState(true);
  const polygonSnapGuidesRef = useRef([]);
  const polygonSnapKindRef = useRef("ortho");

  const activeLayer = TRACE_PLAN_LAYERS.find((layer) => layer.id === activeLayerId) || TRACE_PLAN_LAYERS[0];
  const isLineLayerActive = isLineTraceLayer(activeLayerId);
  const isWindowsLayerActive = isWindowsTraceLayer(activeLayerId);
  const isDoorsLayerActive = isDoorsTraceLayer(activeLayerId);
  const isSlidingDoorsLayerActive = isSlidingDoorsTraceLayer(activeLayerId);
  const isDeckLayerActive = isDeckTraceLayer(activeLayerId);
  const activeTrace =
    layerTraces[activeLayerId] ||
    (isLineTraceLayer(activeLayerId)
      ? { segments: [], draftStart: null }
      : isDeckTraceLayer(activeLayerId)
        ? { decks: [], points: [], polygonClosed: false }
        : { points: [], polygonClosed: false });
  const points = isLineLayerActive ? [] : (activeTrace.points ?? []);
  const polygonClosed = isLineLayerActive ? false : Boolean(activeTrace.polygonClosed);
  const lineDraftStart = isLineLayerActive ? activeTrace.draftStart : null;
  internalWallDraftRef.current = lineDraftStart;
  const externalTrace = layerTraces[EXTERNAL_WALLS_LAYER_ID] || { points: [], polygonClosed: false };
  const showOnlyInternalLayer = activeLayerId === INTERNAL_WALLS_LAYER_ID;

  const bumpView = useCallback(() => setViewTick((n) => n + 1), []);

  function patchLayerTrace(layerId, patch) {
    setLayerTraces((prev) => ({
      ...prev,
      [layerId]: { ...prev[layerId], ...patch },
    }));
  }

  function patchActiveTrace(patch) {
    patchLayerTrace(activeLayerId, patch);
  }

  function setActivePoints(updater) {
    setLayerTraces((prev) => {
      const current = prev[activeLayerId];
      const nextPoints = typeof updater === "function" ? updater(current.points) : updater;
      return { ...prev, [activeLayerId]: { ...current, points: nextPoints } };
    });
  }

  function layerSelectable(layerId) {
    if (
      layerId === INTERNAL_WALLS_LAYER_ID ||
      layerId === WINDOWS_LAYER_ID ||
      layerId === DOORS_LAYER_ID ||
      layerId === SLIDING_DOORS_LAYER_ID ||
      layerId === ROOF_LAYER_ID ||
      layerId === DECK_LAYER_ID
    ) {
      const ext = layerTraces[EXTERNAL_WALLS_LAYER_ID];
      if (!ext?.polygonClosed || (ext.points?.length ?? 0) < 3) return false;
    }
    return true;
  }

  function selectLayer(layerId) {
    if (layerId === activeLayerId) return;
    interactionRef.current = null;
    setNearOrigin(false);
    setHoveredNodeIndex(-1);
    setDraggingNodeIndex(-1);
    setSnapMergeTargetIndex(-1);
    setLinePreviewPoint(null);
    clearPolygonPreview();
    setHoveredWallNode(null);
    setDraggingWallNode(null);
    setWindowPreview(null);
    setHoveredWindowIndex(-1);
    setHoveredResizeIndex(-1);
    setHoveredHeightIndex(-1);
    setResizeWidthM(null);
    setMovingWindowIndex(-1);
    setHeightPickerIndex(-1);
    setDoorPreview(null);
    setHoveredDoorIndex(-1);
    setMovingDoorIndex(-1);
    setSlidingDoorPreview(null);
    setHoveredSlidingDoorIndex(-1);
    setHoveredSlidingResizeIndex(-1);
    setMovingSlidingDoorIndex(-1);
    setSlidingResizeWidthM(null);
    if (layerId === WINDOWS_LAYER_ID) setWindowTool("add");
    if (layerId === DOORS_LAYER_ID) setDoorTool("add");
    if (layerId === SLIDING_DOORS_LAYER_ID) setSlidingDoorTool("add");
    if (layerId === DECK_LAYER_ID) {
      setDeckTool("add");
      setHoveredDeckIndex(-1);
      setEditingDeckIndex(-1);
    }
    setActiveLayerId(layerId);
  }

  function handleMenuItemClick(layer) {
    if (!layerSelectable(layer.id)) {
      alert(
        layer.id === WINDOWS_LAYER_ID
          ? "Trace and close External Walls before placing windows."
          : layer.id === DOORS_LAYER_ID
            ? "Trace and close External Walls before placing swing doors."
            : layer.id === SLIDING_DOORS_LAYER_ID
              ? "Trace and close External Walls before placing sliding doors."
              : layer.id === ROOF_LAYER_ID
                ? "Trace and close External Walls before drawing the roof outline."
                : layer.id === DECK_LAYER_ID
                  ? "Trace and close External Walls before drawing a deck."
                : "Trace and close External Walls before drawing internal walls."
      );
      return;
    }
    selectLayer(layer.id);
    if (layer.submenu?.length) {
      setOpenSubmenuLayerId((prev) => (prev === layer.id ? null : layer.id));
    } else {
      setOpenSubmenuLayerId(null);
    }
  }

  function handleSubmenuAction(layer, item) {
    if (layer.id === WINDOWS_LAYER_ID) {
      setWindowTool(item.id);
      setWindowPreview(null);
      setHoveredWindowIndex(-1);
      setHoveredResizeIndex(-1);
      setHoveredHeightIndex(-1);
      setResizeWidthM(null);
      setMovingWindowIndex(-1);
      setHeightPickerIndex(-1);
    }
    if (layer.id === DOORS_LAYER_ID) {
      setDoorTool(item.id);
      setDoorPreview(null);
      setHoveredDoorIndex(-1);
      setMovingDoorIndex(-1);
    }
    if (layer.id === SLIDING_DOORS_LAYER_ID) {
      setSlidingDoorTool(item.id);
      setSlidingDoorPreview(null);
      setHoveredSlidingDoorIndex(-1);
      setHoveredSlidingResizeIndex(-1);
      setMovingSlidingDoorIndex(-1);
      setSlidingResizeWidthM(null);
    }
    if (layer.id === DECK_LAYER_ID) {
      // Commit any in-progress edit before switching tools.
      commitDeckDraftIfNeeded();
      setDeckTool(item.id);
      setHoveredDeckIndex(-1);
      if (item.id !== "edit") setEditingDeckIndex(-1);
      if (item.id === "add") {
        patchLayerTrace(DECK_LAYER_ID, { points: [], polygonClosed: false });
        setEditingDeckIndex(-1);
      }
    }
    setOpenSubmenuLayerId(null);
  }

  function commitDeckDraftIfNeeded() {
    const deck = layerTraces[DECK_LAYER_ID];
    if (!deck) return;
    const draftPts = deck.points ?? [];
    if (draftPts.length < 3) return;
    if (editingDeckIndex >= 0) {
      setLayerTraces((prev) => {
        const current = prev[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
        const decks = [...(current.decks ?? [])];
        if (editingDeckIndex >= decks.length) return prev;
        decks[editingDeckIndex] = { points: draftPts.map((p) => ({ x: p.x, y: p.y })) };
        return {
          ...prev,
          [DECK_LAYER_ID]: { decks, points: [], polygonClosed: false },
        };
      });
      setEditingDeckIndex(-1);
      return;
    }
    if (deck.polygonClosed || draftPts.length >= 3) {
      setLayerTraces((prev) => {
        const current = prev[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
        return {
          ...prev,
          [DECK_LAYER_ID]: {
            decks: [
              ...(current.decks ?? []),
              { points: draftPts.map((p) => ({ x: p.x, y: p.y })) },
            ],
            points: [],
            polygonClosed: false,
          },
        };
      });
    }
  }

  function deckIndexAtScreen(screenX, screenY) {
    const placed = layerTraces[DECK_LAYER_ID]?.decks ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const pts = placed[i]?.points;
      if (pts?.length >= 3 && pointInPolygon(src, pts, 0)) return i;
    }
    return -1;
  }

  function removeDeckAt(index) {
    if (index < 0) return;
    setLayerTraces((prev) => {
      const current = prev[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
      const decks = (current.decks ?? []).filter((_, i) => i !== index);
      return {
        ...prev,
        [DECK_LAYER_ID]: {
          ...current,
          decks,
          points: editingDeckIndex === index ? [] : current.points,
          polygonClosed: editingDeckIndex === index ? false : current.polygonClosed,
        },
      };
    });
    if (editingDeckIndex === index) setEditingDeckIndex(-1);
    else if (editingDeckIndex > index) setEditingDeckIndex((n) => n - 1);
    setHoveredDeckIndex(-1);
  }

  function beginEditDeckAt(index) {
    if (index < 0) return;
    const placed = layerTraces[DECK_LAYER_ID]?.decks ?? [];
    const deck = placed[index];
    if (!deck?.points?.length) return;
    if (editingDeckIndex >= 0 && editingDeckIndex !== index) commitDeckDraftIfNeeded();
    setEditingDeckIndex(index);
    patchLayerTrace(DECK_LAYER_ID, {
      points: deck.points.map((p) => ({ x: p.x, y: p.y })),
      polygonClosed: true,
    });
    setNearOrigin(false);
    clearPolygonPreview();
  }

  function windowIndexAtScreen(screenX, screenY) {
    const placed = layerTraces[WINDOWS_LAYER_ID]?.windows ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const corners = placed[i]?.corners;
      if (corners?.length >= 3 && pointInPolygon(src, corners, 0)) return i;
    }
    return -1;
  }

  function removeWindowAt(index) {
    if (index < 0) return;
    setLayerTraces((prev) => {
      const current = prev[WINDOWS_LAYER_ID] || { windows: [] };
      const windows = (current.windows ?? []).filter((_, i) => i !== index);
      return { ...prev, [WINDOWS_LAYER_ID]: { ...current, windows } };
    });
  }

  function doorIndexAtScreen(screenX, screenY) {
    const placed = layerTraces[DOORS_LAYER_ID]?.doors ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const corners = placed[i]?.corners;
      if (corners?.length >= 3 && pointInPolygon(src, corners, 0)) return i;
    }
    return -1;
  }

  function removeDoorAt(index) {
    if (index < 0) return;
    setLayerTraces((prev) => {
      const current = prev[DOORS_LAYER_ID] || { doors: [] };
      const doors = (current.doors ?? []).filter((_, i) => i !== index);
      return { ...prev, [DOORS_LAYER_ID]: { ...current, doors } };
    });
  }

  function slidingDoorIndexAtScreen(screenX, screenY) {
    const placed = layerTraces[SLIDING_DOORS_LAYER_ID]?.slidingDoors ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    for (let i = placed.length - 1; i >= 0; i -= 1) {
      const corners = placed[i]?.corners;
      if (corners?.length >= 3 && pointInPolygon(src, corners, 0)) return i;
    }
    return -1;
  }

  function removeSlidingDoorAt(index) {
    if (index < 0) return;
    setLayerTraces((prev) => {
      const current = prev[SLIDING_DOORS_LAYER_ID] || { slidingDoors: [] };
      const slidingDoors = (current.slidingDoors ?? []).filter((_, i) => i !== index);
      return { ...prev, [SLIDING_DOORS_LAYER_ID]: { ...current, slidingDoors } };
    });
  }

  function getExternalInnerBoundary() {
    if (!externalTrace.polygonClosed || externalTrace.points.length < 3) return null;
    return externalWallInnerBoundarySource(externalTrace.points, currentMetresPerPixel());
  }

  const showTraceUi = wizardStep === WIZARD_TRACE;
  const showAreaUi = wizardStep === WIZARD_AREA;
  const showCalibrateUi = wizardStep === WIZARD_CALIBRATE;

  function currentMetresPerPixel() {
    const src = sourceCanvasRef.current;
    if (!src) return null;
    return computeMetresPerPixel(calibration, src.width, src.height);
  }
  const activeCropRect = (() => {
    if (wizardStep === WIZARD_AREA && cropDraftEnd && interactionRef.current?.type === "cropDrag") {
      const start = interactionRef.current.startSource;
      if (start) return normalizePixelCropRect(start, cropDraftEnd);
    }
    return cropRectPx;
  })();

  function resetView(source, width, height) {
    const useCrop =
      (wizardStep === WIZARD_TRACE || wizardStep === WIZARD_CALIBRATE) &&
      cropRectPx &&
      cropRectPx.w > 0 &&
      cropRectPx.h > 0;
    if (useCrop) {
      const baseFit = fitScale(cropRectPx.w, cropRectPx.h, width, height);
      const zoom = 1;
      const scale = baseFit * zoom;
      const panX = (width - cropRectPx.w * scale) / 2 - cropRectPx.x * scale;
      const panY = (height - cropRectPx.h * scale) / 2 - cropRectPx.y * scale;
      viewRef.current = { zoom, panX, panY, baseFit };
      clampPan(width, height);
      return;
    }

    // Full page fit while choosing page / drawing the floor-plan area.
    const baseFit = fitScale(source.width, source.height, width, height);
    const zoom = 1;
    const panX = (width - source.width * baseFit * zoom) / 2;
    const panY = (height - source.height * baseFit * zoom) / 2;
    viewRef.current = { zoom, panX, panY, baseFit };
    clampPan(width, height);
  }

  function viewScale() {
    const { baseFit, zoom } = viewRef.current;
    return baseFit * zoom;
  }

  function orthoSnapThresholdSource() {
    const scale = viewScale();
    return scale > 0 ? ORTHO_SNAP_PX / scale : ORTHO_SNAP_PX;
  }

  function resolveActivePolygonSnap(rawCursor) {
    const wallPoints = externalTrace.points;
    const hasWalls = wallPoints?.length >= 3 && externalTrace.polygonClosed;

    // Deck first point: must land on an external wall edge.
    if (activeLayerId === DECK_LAYER_ID && points.length === 0) {
      if (!hasWalls) return { point: rawCursor, kind: "ortho", guides: [] };
      const start = resolveDeckStartSnap(rawCursor, wallPoints, orthoSnapThresholdSource());
      return start || { point: null, kind: "ortho", guides: [] };
    }

    if (!points.length) {
      return { point: rawCursor, kind: "ortho", guides: [] };
    }
    const prev = points[points.length - 1];
    const origin = points.length >= 2 ? points[0] : null;

    if (activeLayerId === DECK_LAYER_ID && hasWalls) {
      return resolveDeckPolygonSnap(prev, rawCursor, origin, wallPoints, {
        snapThreshold: orthoSnapThresholdSource(),
      });
    }

    const referenceAxes =
      activeLayerId === ROOF_LAYER_ID && hasWalls
        ? collectOrthoReferenceAxes(wallPoints)
        : undefined;
    return resolvePolygonOrthoSnap(prev, rawCursor, origin, {
      snapThreshold: orthoSnapThresholdSource(),
      referenceAxes,
    });
  }

  function clearPolygonPreview() {
    polygonSnapGuidesRef.current = [];
    polygonSnapKindRef.current = "ortho";
    setPolygonPreviewPoint(null);
  }

  function screenToSource(screenX, screenY) {
    const { panX, panY } = viewRef.current;
    const scale = viewScale();
    return {
      x: (screenX - panX) / scale,
      y: (screenY - panY) / scale,
    };
  }

  function sourceToScreen(sourceX, sourceY) {
    const { panX, panY } = viewRef.current;
    const scale = viewScale();
    return {
      x: sourceX * scale + panX,
      y: sourceY * scale + panY,
    };
  }

  function clampPan(width, height) {
    const source = sourceCanvasRef.current;
    if (!source) return;

    const scale = viewScale();
    const view = viewRef.current;
    const useCrop =
      (wizardStep === WIZARD_TRACE || wizardStep === WIZARD_CALIBRATE) &&
      cropRectPx &&
      cropRectPx.w > 0 &&
      cropRectPx.h > 0;
    const contentW = useCrop ? cropRectPx.w * scale : source.width * scale;
    const contentH = useCrop ? cropRectPx.h * scale : source.height * scale;
    const originX = useCrop ? cropRectPx.x * scale : 0;
    const originY = useCrop ? cropRectPx.y * scale : 0;

    if (contentW <= width) {
      view.panX = (width - contentW) / 2 - originX;
    } else {
      const maxPan = -originX;
      const minPan = width - contentW - originX;
      view.panX = Math.min(maxPan, Math.max(minPan, view.panX));
    }

    if (contentH <= height) {
      view.panY = (height - contentH) / 2 - originY;
    } else {
      const maxPan = -originY;
      const minPan = height - contentH - originY;
      view.panY = Math.min(maxPan, Math.max(minPan, view.panY));
    }
  }

  function zoomAt(screenX, screenY, factor, width, height) {
    const view = viewRef.current;
    const before = screenToSource(screenX, screenY);
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    const afterScale = viewScale();
    view.panX = screenX - before.x * afterScale;
    view.panY = screenY - before.y * afterScale;
    clampPan(width, height);
    bumpView();
  }

  function applyLayerTracesForPage(pageNumber, sourceCanvas) {
    const saved = savedTraceRef.current;
    const next = createEmptyLayerTraces();
    if (saved.page === pageNumber && saved.points.length >= 3) {
      next[EXTERNAL_WALLS_LAYER_ID] = {
        points: denormalizeTracePoints(saved.points, sourceCanvas.width, sourceCanvas.height),
        polygonClosed: true,
      };
    }
    if (saved.page === pageNumber && saved.roofPoints?.length >= 3) {
      next[ROOF_LAYER_ID] = {
        points: denormalizeTracePoints(saved.roofPoints, sourceCanvas.width, sourceCanvas.height),
        polygonClosed: true,
      };
    }
    if (saved.page === pageNumber && saved.decks?.length) {
      next[DECK_LAYER_ID] = {
        decks: saved.decks
          .map((deck) => {
            const pts = deck?.points ?? deck;
            if (!Array.isArray(pts) || pts.length < 3) return null;
            return {
              points: denormalizeTracePoints(pts, sourceCanvas.width, sourceCanvas.height),
            };
          })
          .filter(Boolean),
        points: [],
        polygonClosed: false,
      };
    } else if (saved.page === pageNumber && saved.deckPoints?.length >= 3) {
      next[DECK_LAYER_ID] = {
        decks: [
          {
            points: denormalizeTracePoints(
              saved.deckPoints,
              sourceCanvas.width,
              sourceCanvas.height
            ),
          },
        ],
        points: [],
        polygonClosed: false,
      };
    }
    if (saved.page === pageNumber && saved.internalWallSegments?.length) {
      next[INTERNAL_WALLS_LAYER_ID] = {
        segments: denormalizeTraceSegments(
          saved.internalWallSegments,
          sourceCanvas.width,
          sourceCanvas.height
        ),
        draftStart: null,
      };
    }
    if (
      saved.page === pageNumber &&
      saved.windows?.length &&
      next[EXTERNAL_WALLS_LAYER_ID]?.points?.length >= 3
    ) {
      const outerPx = next[EXTERNAL_WALLS_LAYER_ID].points;
      const savedMpp = computeMetresPerPixel(
        saved.calibration,
        sourceCanvas.width,
        sourceCanvas.height
      );
      const restored = saved.windows
        .map((win) => {
          const outerA = {
            x: win.a.x * sourceCanvas.width,
            y: win.a.y * sourceCanvas.height,
          };
          const outerB = {
            x: win.b.x * sourceCanvas.width,
            y: win.b.y * sourceCanvas.height,
          };
          const render = buildWindowRenderFromEndpoints(outerA, outerB, outerPx, savedMpp);
          if (render && win.heightM > 0) render.heightM = win.heightM;
          return render;
        })
        .filter(Boolean);
      next[WINDOWS_LAYER_ID] = { windows: restored };
    }
    if (
      saved.page === pageNumber &&
      saved.doors?.length &&
      next[EXTERNAL_WALLS_LAYER_ID]?.points?.length >= 3
    ) {
      const outerPx = next[EXTERNAL_WALLS_LAYER_ID].points;
      const savedMpp = computeMetresPerPixel(
        saved.calibration,
        sourceCanvas.width,
        sourceCanvas.height
      );
      const restoredDoors = saved.doors
        .map((door) => {
          const outerA = { x: door.a.x * sourceCanvas.width, y: door.a.y * sourceCanvas.height };
          const outerB = { x: door.b.x * sourceCanvas.width, y: door.b.y * sourceCanvas.height };
          return buildWindowRenderFromEndpoints(outerA, outerB, outerPx, savedMpp);
        })
        .filter(Boolean);
      next[DOORS_LAYER_ID] = { doors: restoredDoors };
    }
    if (
      saved.page === pageNumber &&
      saved.slidingDoors?.length &&
      next[EXTERNAL_WALLS_LAYER_ID]?.points?.length >= 3
    ) {
      const outerPx = next[EXTERNAL_WALLS_LAYER_ID].points;
      const savedMpp = computeMetresPerPixel(
        saved.calibration,
        sourceCanvas.width,
        sourceCanvas.height
      );
      const restoredSliding = saved.slidingDoors
        .map((door) => {
          const outerA = { x: door.a.x * sourceCanvas.width, y: door.a.y * sourceCanvas.height };
          const outerB = { x: door.b.x * sourceCanvas.width, y: door.b.y * sourceCanvas.height };
          return buildWindowRenderFromEndpoints(outerA, outerB, outerPx, savedMpp);
        })
        .filter(Boolean);
      next[SLIDING_DOORS_LAYER_ID] = { slidingDoors: restoredSliding };
    }
    setLayerTraces(next);
    setNearOrigin(false);
    setHoveredNodeIndex(-1);
    setDraggingNodeIndex(-1);
    setSnapMergeTargetIndex(-1);
  }

  const loadPage = useCallback(
    async (pageNumber, { preserveDraft = false } = {}) => {
      const doc = pdfDocRef.current;
      if (!doc) return;

      setPageLoading(true);
      try {
        const sourceCanvas = await renderPdfDocumentPage(doc, pageNumber);
        sourceCanvasRef.current = sourceCanvas;

        const canvas = canvasRef.current;
        const width = canvas?.width || viewportSize.width;
        const height = canvas?.height || viewportSize.height;
        resetView(sourceCanvas, width, height);

        if (!preserveDraft) {
          applyLayerTracesForPage(pageNumber, sourceCanvas);
        }

        bumpView();
      } catch (err) {
        setLoadError(err.message || "Could not load PDF page");
      } finally {
        setPageLoading(false);
      }
    },
    [viewportSize.width, viewportSize.height, bumpView]
  );

  useEffect(() => {
    // Container only mounts after loading finishes — observe then, not on first mount.
    if (loading || loadError) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    function measure() {
      const width = Math.max(320, Math.floor(container.clientWidth));
      const height = Math.max(240, Math.floor(container.clientHeight));
      setViewportSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height }
      );
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [loading, loadError]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setLayerTraces(createEmptyLayerTraces());
    setActiveLayerId(EXTERNAL_WALLS_LAYER_ID);
    setCalibration(savedTraceRef.current.calibration || null);
    setCalibDraftStart(null);
    setCalibPreviewEnd(null);
    setPendingCalibLine(null);

    (async () => {
      try {
        const doc = await loadPdfDocumentFromUrl(pdfUrl);
        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }
        pdfDocRef.current = doc;
        const totalPages = doc.numPages || 1;
        setPageCount(totalPages);

        const saved = parsePlanTracePolygon(savedPolygon);
        savedTraceRef.current = saved;
        setCalibration(saved.calibration || null);
        const initialPage = Math.min(Math.max(1, saved.page || 1), totalPages);
        setCurrentPage(initialPage);

        const sourceCanvas = await renderPdfDocumentPage(doc, initialPage);
        if (cancelled) return;
        sourceCanvasRef.current = sourceCanvas;

        const denormCrop = denormalizeCropRect(
          saved.crop,
          sourceCanvas.width,
          sourceCanvas.height
        );
        if (denormCrop) {
          setCropRectPx(denormCrop);
          setWizardStep(saved.calibration ? WIZARD_TRACE : WIZARD_CALIBRATE);
        } else {
          setCropRectPx(null);
          setWizardStep(WIZARD_PAGE);
        }

        const { width, height } = viewportSize;
        // resetView uses wizardStep/crop from this render; force fit after state settles via effect.
        resetView(sourceCanvas, width, height);
        applyLayerTracesForPage(initialPage, sourceCanvas);
        bumpView();
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load plan PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const doc = pdfDocRef.current;
      pdfDocRef.current = null;
      if (doc) doc.destroy().catch(() => {});
    };
  }, [pdfUrl, savedPolygon, bumpView]);

  useEffect(() => {
    const source = sourceCanvasRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas || loading) return;
    canvas.width = viewportSize.width;
    canvas.height = viewportSize.height;
    resetView(source, viewportSize.width, viewportSize.height);
    bumpView();
  }, [viewportSize.width, viewportSize.height, loading, bumpView, wizardStep, cropRectPx]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceCanvasRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = viewScale();
    const { panX, panY } = viewRef.current;
    ctx.setTransform(scale, 0, 0, scale, panX, panY);
    if (showPdfPlan) {
      ctx.drawImage(source, 0, 0);
    }

    const metresPerPixel = currentMetresPerPixel();

    // Dim everything outside the floor-plan area while defining it, calibrating, or tracing.
    const overlayCrop =
      wizardStep === WIZARD_AREA || wizardStep === WIZARD_CALIBRATE || wizardStep === WIZARD_TRACE
        ? activeCropRect
        : null;
    if (overlayCrop && overlayCrop.w > 0 && overlayCrop.h > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(20, 24, 32, 0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, source.width, source.height);
      ctx.rect(overlayCrop.x, overlayCrop.y, overlayCrop.w, overlayCrop.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = wizardStep === WIZARD_AREA ? "#2563eb" : "rgba(37, 99, 235, 0.7)";
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash(wizardStep === WIZARD_AREA ? [8 / scale, 6 / scale] : []);
      ctx.strokeRect(overlayCrop.x, overlayCrop.y, overlayCrop.w, overlayCrop.h);
      ctx.setLineDash([]);
      ctx.restore();
    }

    const markerRadius = 6 / scale;

    if (showCalibrateUi) {
      const drawCalibLine = (aPx, bPx, { color, dashed = false, label = null }) => {
        if (!aPx || !bPx) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / scale;
        if (dashed) ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.beginPath();
        ctx.moveTo(aPx.x, aPx.y);
        ctx.lineTo(bPx.x, bPx.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // End ticks + markers.
        [aPx, bPx].forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5 / scale, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.strokeStyle = WHITE;
          ctx.lineWidth = 2 / scale;
          ctx.fill();
          ctx.stroke();
        });
        if (label) {
          const mx = (aPx.x + bPx.x) / 2;
          const my = (aPx.y + bPx.y) / 2;
          ctx.font = `${14 / scale}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const padY = 8 / scale;
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          const tw = ctx.measureText(label).width;
          ctx.fillRect(mx - tw / 2 - 4 / scale, my - padY - 16 / scale, tw + 8 / scale, 18 / scale);
          ctx.fillStyle = "#111827";
          ctx.fillText(label, mx, my - padY);
        }
        ctx.restore();
      };

      if (calibration) {
        const a = { x: calibration.a.x * source.width, y: calibration.a.y * source.height };
        const b = { x: calibration.b.x * source.width, y: calibration.b.y * source.height };
        drawCalibLine(a, b, { color: "#16a34a", label: `${calibration.lengthM} m` });
      }
      if (pendingCalibLine) {
        drawCalibLine(pendingCalibLine.a, pendingCalibLine.b, { color: "#2563eb" });
      } else if (calibDraftStart) {
        drawCalibLine(calibDraftStart, calibPreviewEnd || calibDraftStart, {
          color: "#2563eb",
          dashed: true,
        });
      }
    }

    const innerBoundary =
      showOnlyInternalLayer && externalTrace.polygonClosed && externalTrace.points.length >= 3
        ? getExternalInnerBoundary()
        : null;

    if (innerBoundary) {
      ctx.strokeStyle = "rgba(71, 85, 105, 0.55)";
      ctx.fillStyle = "rgba(71, 85, 105, 0.06)";
      ctx.lineWidth = 1.25 / scale;
      ctx.setLineDash([5 / scale, 4 / scale]);
      ctx.beginPath();
      innerBoundary.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawLineSegments(segments, layer, isActive, { drawWallBands = false } = {}) {
      if (!segments?.length) return;

      const outerPoints = externalTrace.points;
      const canDrawBands = drawWallBands && outerPoints.length >= 3;

      ctx.globalAlpha = isActive ? 1 : 0.72;

      if (canDrawBands) {
        const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
        ctx.fillStyle = layer.fillClosed;
        ctx.globalAlpha = isActive ? 1 : 0.72;

        segments.forEach((seg, segmentIndex) => {
          const footprint = internalWallSegmentSourceFootprintForRender(
            seg,
            segmentIndex,
            segments,
            outerPoints,
            metresPerPixel
          );
          if (!footprint) return;
          ctx.beginPath();
          footprint.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.fill();
        });

        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = (isActive ? 1.75 : 1.25) / scale;
        ctx.lineCap = "square";
        ctx.lineJoin = "miter";
        buildInternalWallVisibleOutlines(segments, halfT).forEach(({ a, b }) => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;

        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = (isActive ? 1.25 : 1) / scale;
        ctx.setLineDash([4 / scale, 3 / scale]);
        segments.forEach((seg) => {
          ctx.beginPath();
          ctx.moveTo(seg.a.x, seg.a.y);
          ctx.lineTo(seg.b.x, seg.b.y);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = layer.stroke;
        ctx.lineWidth = (isActive ? 2.5 : 1.75) / scale;
        ctx.lineCap = "round";
        segments.forEach((seg) => {
          ctx.beginPath();
          ctx.moveTo(seg.a.x, seg.a.y);
          ctx.lineTo(seg.b.x, seg.b.y);
          ctx.stroke();
        });
      }

      ctx.globalAlpha = 1;
      if (!isActive) return;
      segments.forEach((seg, segmentIndex) => {
        ["a", "b"].forEach((vertex) => {
          const p = seg[vertex];
          const isHovered = wallNodesMatch(hoveredWallNode, { segmentIndex, vertex });
          const isDragging = wallNodesMatch(draggingWallNode, { segmentIndex, vertex });
          const isActiveNode = isHovered || isDragging;
          const radius = isActiveNode ? 8 / scale : markerRadius;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isActiveNode ? layer.stroke : layer.marker;
          ctx.strokeStyle = WHITE;
          ctx.lineWidth = isActiveNode ? 2.5 / scale : 2 / scale;
          ctx.fill();
          ctx.stroke();
        });
      });
    }

    if (showTraceUi) {
    TRACE_PLAN_LAYERS.forEach((layer) => {
      if (showOnlyInternalLayer && layer.id !== INTERNAL_WALLS_LAYER_ID) return;

      const trace = layerTraces[layer.id];
      if (!trace) return;

      const isActive = layer.id === activeLayerId;

      if (layer.mode === "lines") {
        drawLineSegments(trace.segments, layer, isActive, {
          drawWallBands: layer.id === INTERNAL_WALLS_LAYER_ID,
        });
        return;
      }

      // Placed decks (committed outlines) — always drawn for the deck layer.
      if (layer.mode === "decks" && Array.isArray(trace.decks) && trace.decks.length) {
        trace.decks.forEach((deck, deckIndex) => {
          const deckPts = deck?.points;
          if (!Array.isArray(deckPts) || deckPts.length < 3) return;
          // Skip the deck currently loaded into the draft editor (drawn below).
          if (isActive && editingDeckIndex === deckIndex && (trace.points?.length ?? 0) >= 3) {
            return;
          }
          const hovered =
            isActive && (deckTool === "delete" || deckTool === "edit") && hoveredDeckIndex === deckIndex;
          ctx.beginPath();
          ctx.moveTo(deckPts[0].x, deckPts[0].y);
          for (let i = 1; i < deckPts.length; i += 1) ctx.lineTo(deckPts[i].x, deckPts[i].y);
          ctx.closePath();
          ctx.fillStyle = hovered
            ? deckTool === "delete"
              ? "rgba(220, 38, 38, 0.28)"
              : "rgba(5, 150, 105, 0.35)"
            : layer.fillClosed;
          ctx.strokeStyle = hovered && deckTool === "delete" ? "#dc2626" : layer.stroke;
          ctx.lineWidth = (hovered ? 2.5 : isActive ? 2 : 1.5) / scale;
          ctx.globalAlpha = isActive ? 1 : 0.72;
          ctx.fill();
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }

      if (!trace.points?.length) {
        // Allow active empty polygon layers (e.g. deck start) to draw snap preview.
        if (
          !isActive ||
          polygonClosed ||
          !polygonPreviewPoint ||
          layer.mode === "lines" ||
          layer.mode === "windows" ||
          layer.mode === "doors" ||
          layer.mode === "slidingDoors" ||
          layer.mode === "decks"
        ) {
          // Deck add with empty draft still needs wall-start snap preview.
          if (
            !(
              isActive &&
              layer.mode === "decks" &&
              deckTool === "add" &&
              !polygonClosed &&
              polygonPreviewPoint
            )
          ) {
            return;
          }
        }
        const guides = polygonSnapGuidesRef.current || [];
        const source = sourceCanvasRef.current;
        const clipPad = Math.max(source?.width || 0, source?.height || 0) * 2;
        const snapEmphasis =
          polygonSnapKindRef.current === "close-ready" ||
          polygonSnapKindRef.current === "reference" ||
          polygonSnapKindRef.current === "wall";
        ctx.save();
        guides.forEach((guide) => {
          ctx.beginPath();
          ctx.moveTo(
            Math.max(-clipPad, Math.min(clipPad, guide.x1)),
            Math.max(-clipPad, Math.min(clipPad, guide.y1))
          );
          ctx.lineTo(
            Math.max(-clipPad, Math.min(clipPad, guide.x2)),
            Math.max(-clipPad, Math.min(clipPad, guide.y2))
          );
          ctx.strokeStyle = guide.emphasis ? "#16a34a" : "rgba(37, 99, 235, 0.55)";
          ctx.lineWidth = (guide.emphasis ? 2 : 1) / scale;
          ctx.setLineDash(guide.emphasis ? [6 / scale, 4 / scale] : [4 / scale, 4 / scale]);
          ctx.globalAlpha = guide.emphasis ? 0.95 : 0.7;
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(
          polygonPreviewPoint.x,
          polygonPreviewPoint.y,
          snapEmphasis ? 8 / scale : markerRadius,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = snapEmphasis ? "rgba(34, 197, 94, 0.4)" : layer.marker;
        ctx.strokeStyle = snapEmphasis ? "#16a34a" : WHITE;
        ctx.lineWidth = 2 / scale;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      const closed = trace.polygonClosed;
      const layerPoints = trace.points;

      ctx.strokeStyle = layer.stroke;
      ctx.fillStyle = closed ? layer.fillClosed : layer.fillOpen;
      ctx.lineWidth = (isActive ? 2 : 1.5) / scale;
      ctx.globalAlpha = isActive ? 1 : 0.72;

      // External walls render as a 100 mm-thick band (outer trace = outside face,
      // inner boundary offset inward), filling only the wall space between them.
      const innerRing =
        layer.id === EXTERNAL_WALLS_LAYER_ID && closed && layerPoints.length >= 3
          ? externalWallInnerBoundarySource(layerPoints, metresPerPixel)
          : null;

      if (innerRing && innerRing.length >= 3) {
        ctx.beginPath();
        layerPoints.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        innerRing.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill("evenodd");

        // Outline both faces of the wall.
        ctx.beginPath();
        layerPoints.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        innerRing.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.beginPath();
        layerPoints.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        if (closed && layerPoints.length >= 3) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!isActive) return;

      const originHighlight =
        nearOrigin && !closed && layerPoints.length >= 2 ? 10 / scale : markerRadius;
      layerPoints.forEach((p, i) => {
        const isOrigin = i === 0;
        const isNodeActive = i === hoveredNodeIndex || i === draggingNodeIndex;
        const isSnapMergeTarget = i === snapMergeTargetIndex;
        let radius = isOrigin ? originHighlight : markerRadius;
        if (closed && (isNodeActive || isSnapMergeTarget)) radius = 8 / scale;
        if (closed && isSnapMergeTarget) radius = 10 / scale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        if (isOrigin && nearOrigin && !closed && layerPoints.length >= 2) {
          ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 3 / scale;
        } else if (closed && (isSnapMergeTarget || (isNodeActive && snapMergeTargetIndex >= 0))) {
          ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 3 / scale;
        } else if (closed && isNodeActive) {
          ctx.fillStyle = layer.stroke;
          ctx.strokeStyle = WHITE;
          ctx.lineWidth = 2.5 / scale;
        } else {
          ctx.fillStyle = isOrigin ? layer.origin : layer.marker;
          ctx.strokeStyle = WHITE;
          ctx.lineWidth = 2 / scale;
        }
        ctx.fill();
        ctx.stroke();
      });

      // Live H/V draft + alignment guides while placing the next corner.
      if (!closed && isActive && polygonPreviewPoint) {
        const guides = polygonSnapGuidesRef.current || [];
        const source = sourceCanvasRef.current;
        const clipPad = Math.max(source?.width || 0, source?.height || 0) * 2;
        const snapEmphasis =
          polygonSnapKindRef.current === "close-ready" ||
          polygonSnapKindRef.current === "reference" ||
          polygonSnapKindRef.current === "wall";

        ctx.save();
        guides.forEach((guide) => {
          ctx.beginPath();
          ctx.moveTo(
            Math.max(-clipPad, Math.min(clipPad, guide.x1)),
            Math.max(-clipPad, Math.min(clipPad, guide.y1))
          );
          ctx.lineTo(
            Math.max(-clipPad, Math.min(clipPad, guide.x2)),
            Math.max(-clipPad, Math.min(clipPad, guide.y2))
          );
          ctx.strokeStyle = guide.emphasis ? "#16a34a" : "rgba(37, 99, 235, 0.55)";
          ctx.lineWidth = (guide.emphasis ? 2 : 1) / scale;
          ctx.setLineDash(guide.emphasis ? [6 / scale, 4 / scale] : [4 / scale, 4 / scale]);
          ctx.globalAlpha = guide.emphasis ? 0.95 : 0.7;
          ctx.stroke();
        });
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        if (layerPoints.length >= 1) {
          const last = layerPoints[layerPoints.length - 1];
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(polygonPreviewPoint.x, polygonPreviewPoint.y);
          ctx.strokeStyle = snapEmphasis ? "#16a34a" : layer.stroke;
          ctx.lineWidth = 2 / scale;
          ctx.globalAlpha = 0.85;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(
          polygonPreviewPoint.x,
          polygonPreviewPoint.y,
          snapEmphasis ? 8 / scale : markerRadius,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = snapEmphasis ? "rgba(34, 197, 94, 0.4)" : layer.marker;
        ctx.strokeStyle = snapEmphasis ? "#16a34a" : WHITE;
        ctx.lineWidth = 2 / scale;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    });

    // Windows: placed rectangles + live hover preview (plan view only for now).
    if (!showOnlyInternalLayer) {
      const windowsLayer = TRACE_PLAN_LAYERS.find((l) => l.id === WINDOWS_LAYER_ID);
      const placed = layerTraces[WINDOWS_LAYER_ID]?.windows ?? [];

      const drawWindowRect = (win, { preview = false } = {}) => {
        if (!win?.corners?.length) return;
        ctx.beginPath();
        win.corners.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = preview ? "rgba(96, 165, 250, 0.35)" : "rgba(96, 165, 250, 0.55)";
        ctx.fill();
        ctx.strokeStyle = preview ? "rgba(37, 99, 235, 0.7)" : (windowsLayer?.stroke || "#2563eb");
        ctx.lineWidth = (preview ? 1.25 : 1.5) / scale;
        if (preview) ctx.setLineDash([5 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      const highlightWindow = (win, color) => {
        if (!win?.corners?.length) return;
        ctx.beginPath();
        win.corners.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = color.fill;
        ctx.fill();
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 2.5 / scale;
        ctx.stroke();
      };

      const showResizeNodes = isWindowsLayerActive && windowTool === "edit";

      placed.forEach((win, index) => {
        drawWindowRect(win, { preview: false });
        if (
          isWindowsLayerActive &&
          index === hoveredWindowIndex &&
          (windowTool === "delete" || windowTool === "edit")
        ) {
          highlightWindow(
            win,
            windowTool === "delete"
              ? { fill: "rgba(220, 38, 38, 0.35)", stroke: "#dc2626" }
              : { fill: "rgba(37, 99, 235, 0.3)", stroke: "#1d4ed8" }
          );
        }
        if (showResizeNodes && win?.outerB) {
          const r = (index === hoveredResizeIndex ? 7 : 5.5) / scale;
          ctx.beginPath();
          ctx.rect(win.outerB.x - r, win.outerB.y - r, r * 2, r * 2);
          ctx.fillStyle = index === hoveredResizeIndex ? "#1d4ed8" : WHITE;
          ctx.strokeStyle = "#1d4ed8";
          ctx.lineWidth = 2 / scale;
          ctx.fill();
          ctx.stroke();
        }
        // Centre node: click to set the window height.
        if (showResizeNodes && win?.center) {
          const r = (index === hoveredHeightIndex ? 7 : 5.5) / scale;
          ctx.beginPath();
          ctx.arc(win.center.x, win.center.y, r, 0, Math.PI * 2);
          ctx.fillStyle = index === hoveredHeightIndex ? "#7c3aed" : WHITE;
          ctx.strokeStyle = "#7c3aed";
          ctx.lineWidth = 2 / scale;
          ctx.fill();
          ctx.stroke();
        }
      });
      if (isWindowsLayerActive && windowPreview) {
        drawWindowRect(windowPreview, { preview: true });
      }

      // Width readout while resizing.
      if (isWindowsLayerActive && resizeWidthM != null) {
        const active = placed[interactionRef.current?.index];
        const anchorPt = active?.center;
        if (anchorPt) {
          const label = `${Math.round(resizeWidthM * 1000)} mm`;
          ctx.font = `${14 / scale}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const tw = ctx.measureText(label).width;
          const padX = 6 / scale;
          const boxY = anchorPt.y - 12 / scale;
          ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
          ctx.fillRect(anchorPt.x - tw / 2 - padX, boxY - 18 / scale, tw + padX * 2, 20 / scale);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, anchorPt.x, boxY);
        }
      }

      // Doors: placed rectangles + live hover preview (plan view only for now).
      const doorsLayer = TRACE_PLAN_LAYERS.find((l) => l.id === DOORS_LAYER_ID);
      const placedDoors = layerTraces[DOORS_LAYER_ID]?.doors ?? [];

      const drawDoorRect = (door, { preview = false } = {}) => {
        if (!door?.corners?.length) return;
        ctx.beginPath();
        door.corners.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = preview ? "rgba(217, 119, 6, 0.32)" : "rgba(217, 119, 6, 0.5)";
        ctx.fill();
        ctx.strokeStyle = preview ? "rgba(180, 83, 9, 0.7)" : (doorsLayer?.stroke || "#b45309");
        ctx.lineWidth = (preview ? 1.25 : 1.5) / scale;
        if (preview) ctx.setLineDash([5 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      placedDoors.forEach((door, index) => {
        drawDoorRect(door, { preview: false });
        if (
          isDoorsLayerActive &&
          index === hoveredDoorIndex &&
          (doorTool === "delete" || doorTool === "edit")
        ) {
          highlightWindow(
            door,
            doorTool === "delete"
              ? { fill: "rgba(220, 38, 38, 0.35)", stroke: "#dc2626" }
              : { fill: "rgba(180, 83, 9, 0.32)", stroke: "#92400e" }
          );
        }
      });
      if (isDoorsLayerActive && doorPreview) {
        drawDoorRect(doorPreview, { preview: true });
      }

      // Sliding doors: same plan rect as windows, teal colour, resize node in edit mode.
      const slidingLayer = TRACE_PLAN_LAYERS.find((l) => l.id === SLIDING_DOORS_LAYER_ID);
      const placedSliding = layerTraces[SLIDING_DOORS_LAYER_ID]?.slidingDoors ?? [];
      const showSlidingResizeNodes = isSlidingDoorsLayerActive && slidingDoorTool === "edit";

      const drawSlidingDoorRect = (door, { preview = false } = {}) => {
        if (!door?.corners?.length) return;
        ctx.beginPath();
        door.corners.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fillStyle = preview ? "rgba(45, 212, 191, 0.32)" : "rgba(45, 212, 191, 0.5)";
        ctx.fill();
        ctx.strokeStyle = preview ? "rgba(15, 118, 110, 0.7)" : (slidingLayer?.stroke || "#0f766e");
        ctx.lineWidth = (preview ? 1.25 : 1.5) / scale;
        if (preview) ctx.setLineDash([5 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      placedSliding.forEach((door, index) => {
        drawSlidingDoorRect(door, { preview: false });
        if (
          isSlidingDoorsLayerActive &&
          index === hoveredSlidingDoorIndex &&
          (slidingDoorTool === "delete" || slidingDoorTool === "edit")
        ) {
          highlightWindow(
            door,
            slidingDoorTool === "delete"
              ? { fill: "rgba(220, 38, 38, 0.35)", stroke: "#dc2626" }
              : { fill: "rgba(15, 118, 110, 0.32)", stroke: "#115e59" }
          );
        }
        if (showSlidingResizeNodes && door?.outerB) {
          const r = (index === hoveredSlidingResizeIndex ? 7 : 5.5) / scale;
          ctx.beginPath();
          ctx.rect(door.outerB.x - r, door.outerB.y - r, r * 2, r * 2);
          ctx.fillStyle = index === hoveredSlidingResizeIndex ? "#0f766e" : WHITE;
          ctx.strokeStyle = "#0f766e";
          ctx.lineWidth = 2 / scale;
          ctx.fill();
          ctx.stroke();
        }
      });
      if (isSlidingDoorsLayerActive && slidingDoorPreview) {
        drawSlidingDoorRect(slidingDoorPreview, { preview: true });
      }
      if (isSlidingDoorsLayerActive && slidingResizeWidthM != null) {
        const active = placedSliding[interactionRef.current?.index];
        const anchorPt = active?.center;
        if (anchorPt) {
          const label = `${Math.round(slidingResizeWidthM * 1000)} mm`;
          ctx.font = `${14 / scale}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const tw = ctx.measureText(label).width;
          const padX = 6 / scale;
          const boxY = anchorPt.y - 12 / scale;
          ctx.fillStyle = "rgba(17, 24, 39, 0.85)";
          ctx.fillRect(anchorPt.x - tw / 2 - padX, boxY - 18 / scale, tw + padX * 2, 20 / scale);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, anchorPt.x, boxY);
        }
      }
    }

    if (showOnlyInternalLayer && lineDraftStart && linePreviewPoint) {
      ctx.strokeStyle = activeLayer.stroke;
      ctx.lineWidth = 2 / scale;
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(lineDraftStart.x, lineDraftStart.y);
      ctx.lineTo(linePreviewPoint.x, linePreviewPoint.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      const snapHint = internalWallSnapHintRef.current;
      if (snapHint?.kind === "l" && snapHint.junction) {
        ctx.beginPath();
        ctx.arc(snapHint.junction.x, snapHint.junction.y, markerRadius * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = activeLayer.marker;
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2 / scale;
        ctx.fill();
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(lineDraftStart.x, lineDraftStart.y, markerRadius, 0, Math.PI * 2);
      ctx.fillStyle = activeLayer.origin;
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 2 / scale;
      ctx.fill();
      ctx.stroke();
    }
    }
  }, [
    layerTraces,
    activeLayerId,
    activeLayer,
    nearOrigin,
    hoveredNodeIndex,
    draggingNodeIndex,
    snapMergeTargetIndex,
    showOnlyInternalLayer,
    lineDraftStart,
    linePreviewPoint,
    polygonPreviewPoint,
    externalTrace.polygonClosed,
    externalTrace.points,
    hoveredWallNode,
    draggingWallNode,
    windowPreview,
    isWindowsLayerActive,
    windowTool,
    hoveredWindowIndex,
    hoveredResizeIndex,
    hoveredHeightIndex,
    resizeWidthM,
    movingWindowIndex,
    isDoorsLayerActive,
    doorTool,
    doorPreview,
    hoveredDoorIndex,
    movingDoorIndex,
    isSlidingDoorsLayerActive,
    slidingDoorTool,
    slidingDoorPreview,
    hoveredSlidingDoorIndex,
    hoveredSlidingResizeIndex,
    movingSlidingDoorIndex,
    slidingResizeWidthM,
    viewTick,
    wizardStep,
    cropRectPx,
    cropDraftEnd,
    showTraceUi,
    showCalibrateUi,
    activeCropRect,
    calibration,
    calibDraftStart,
    calibPreviewEnd,
    pendingCalibLine,
    showPdfPlan,
  ]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, pageLoading, layerTraces, activeLayerId, nearOrigin, redraw, viewTick, linePreviewPoint, polygonPreviewPoint, windowPreview, windowTool, hoveredWindowIndex, hoveredResizeIndex, hoveredHeightIndex, resizeWidthM, movingWindowIndex, doorTool, doorPreview, hoveredDoorIndex, movingDoorIndex, slidingDoorTool, slidingDoorPreview, hoveredSlidingDoorIndex, hoveredSlidingResizeIndex, movingSlidingDoorIndex, slidingResizeWidthM, deckTool, hoveredDeckIndex, editingDeckIndex, wizardStep, cropRectPx, cropDraftEnd, calibration, calibDraftStart, calibPreviewEnd, pendingCalibLine, showPdfPlan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading || loadError) return;

    function onWheelNative(event) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(x, y, factor, canvas.width, canvas.height);
    }

    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheelNative);
  }, [loading, loadError, bumpView]);

  function canvasCoords(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function isNearOrigin(screenX, screenY) {
    if (points.length < 2) return false;
    const origin = sourceToScreen(points[0].x, points[0].y);
    return Math.hypot(screenX - origin.x, screenY - origin.y) <= CLOSE_SNAP_PX;
  }

  function findInternalWallNodeAtScreen(screenX, screenY) {
    const segments = layerTraces[INTERNAL_WALLS_LAYER_ID]?.segments ?? [];
    let best = null;
    let bestDist = NODE_HIT_PX;
    segments.forEach((seg, segmentIndex) => {
      ["a", "b"].forEach((vertex) => {
        const p = seg[vertex];
        const s = sourceToScreen(p.x, p.y);
        const d = Math.hypot(screenX - s.x, screenY - s.y);
        if (d <= bestDist) {
          bestDist = d;
          best = { segmentIndex, vertex };
        }
      });
    });
    return best;
  }

  function moveInternalWallNode(segmentIndex, vertex, screenX, screenY) {
    const outerPoints = externalTrace.points;
    const segments = layerTraces[INTERNAL_WALLS_LAYER_ID]?.segments ?? [];
    const seg = segments[segmentIndex];
    if (!seg) return;

    const fixedAnchor = seg[vertex === "a" ? "b" : "a"];
    const draggedAnchor = seg[vertex];
    const raw = clampSourcePoint(screenToSource(screenX, screenY));
    const snapped = resolveSnapForInternalWall(
      fixedAnchor,
      raw,
      segments,
      outerPoints,
      segmentIndex
    );

    setLayerTraces((prev) => {
      const current = prev[INTERNAL_WALLS_LAYER_ID] || { segments: [], draftStart: null };
      const segs = current.segments ?? [];
      if (!segs[segmentIndex]?.[vertex]) return prev;

      const nextSegments = segs.map((s) => {
        const next = { a: { ...s.a }, b: { ...s.b } };
        if (pointsCoincide(s.a, draggedAnchor)) next.a = { ...snapped };
        if (pointsCoincide(s.b, draggedAnchor)) next.b = { ...snapped };
        return next;
      });

      return {
        ...prev,
        [INTERNAL_WALLS_LAYER_ID]: { ...current, segments: nextSegments },
      };
    });
  }

  function finalizeDraggedInternalWallSegments(affectedIndices) {
    const outerPoints = externalTrace.points;
    if (outerPoints.length < 3 || !affectedIndices?.length) return;

    setLayerTraces((prev) => {
      const current = prev[INTERNAL_WALLS_LAYER_ID] || { segments: [], draftStart: null };
      const segments = current.segments ?? [];
      const affected = new Set(affectedIndices);
      const nextSegments = [];

      segments.forEach((seg, index) => {
        if (!affected.has(index)) {
          nextSegments.push(seg);
          return;
        }
        nextSegments.push(
          ...finalizeInternalWallSegment(seg.a, seg.b, outerPoints, currentMetresPerPixel())
        );
      });

      return {
        ...prev,
        [INTERNAL_WALLS_LAYER_ID]: { ...current, segments: nextSegments },
      };
    });
  }

  function findNodeAtScreen(screenX, screenY) {
    let bestIndex = -1;
    let bestDist = NODE_HIT_PX;
    points.forEach((p, i) => {
      const s = sourceToScreen(p.x, p.y);
      const d = Math.hypot(screenX - s.x, screenY - s.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    });
    return bestIndex;
  }

  function findSegmentAtScreen(screenX, screenY) {
    if (!polygonClosed || points.length < 2) return null;

    let best = null;
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const a = sourceToScreen(points[i].x, points[i].y);
      const b = sourceToScreen(points[j].x, points[j].y);
      if (Math.hypot(screenX - a.x, screenY - a.y) <= NODE_HIT_PX) continue;
      if (Math.hypot(screenX - b.x, screenY - b.y) <= NODE_HIT_PX) continue;

      const hit = distanceToSegment(screenX, screenY, a.x, a.y, b.x, b.y);
      if (hit.dist > LINE_HIT_PX) continue;

      const aSrc = points[i];
      const bSrc = points[j];
      const candidate = {
        insertIndex: j,
        dist: hit.dist,
        sourceX: aSrc.x + hit.t * (bSrc.x - aSrc.x),
        sourceY: aSrc.y + hit.t * (bSrc.y - aSrc.y),
      };
      if (!best || candidate.dist < best.dist) best = candidate;
    }
    return best;
  }

  function clampSourcePoint(pt) {
    const source = sourceCanvasRef.current;
    if (!source) return pt;
    if ((wizardStep === WIZARD_TRACE || wizardStep === WIZARD_CALIBRATE) && cropRectPx) {
      return {
        x: Math.max(cropRectPx.x, Math.min(cropRectPx.x + cropRectPx.w, pt.x)),
        y: Math.max(cropRectPx.y, Math.min(cropRectPx.y + cropRectPx.h, pt.y)),
      };
    }
    return {
      x: Math.max(0, Math.min(source.width, pt.x)),
      y: Math.max(0, Math.min(source.height, pt.y)),
    };
  }

  function internalWallSnapThresholdSource(outerPoints) {
    const halfT = internalWallHalfThicknessSource(outerPoints, currentMetresPerPixel()) ?? 4;
    return Math.max(WALL_SNAP_PX / viewScale(), halfT * 1.25);
  }

  function resolveSnapForInternalWall(start, end, segments, outerPoints, excludeSegmentIndex = -1) {
    if (!start || !outerPoints?.length) {
      internalWallSnapHintRef.current = null;
      return clampSourcePoint(end);
    }
    const snap = resolveInternalWallDrawSnap(start, end, segments, outerPoints, {
      threshold: internalWallSnapThresholdSource(outerPoints),
      excludeSegmentIndex,
    });
    if (snap.kind === "l" && snap.lCorner) {
      internalWallSnapHintRef.current = {
        kind: "l",
        junction: snap.lCorner.junction,
      };
    } else {
      internalWallSnapHintRef.current = snap.kind === "none" ? null : { kind: snap.kind };
    }
    return clampSourcePoint(snap.point);
  }

  function findNearestMergeSnapTarget(excludeIndex, screenX, screenY) {
    let bestIndex = -1;
    let bestDist = MERGE_SNAP_PX;
    points.forEach((p, i) => {
      if (i === excludeIndex) return;
      const s = sourceToScreen(p.x, p.y);
      const d = Math.hypot(screenX - s.x, screenY - s.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    });
    return bestIndex;
  }

  function moveNode(nodeIndex, screenX, screenY, snapTargetIndex = -1) {
    const source = sourceCanvasRef.current;
    if (!source) return;
    setActivePoints((prev) => {
      const next = [...prev];
      if (
        snapTargetIndex >= 0 &&
        snapTargetIndex !== nodeIndex &&
        snapTargetIndex < prev.length
      ) {
        next[nodeIndex] = { ...prev[snapTargetIndex] };
      } else {
        const raw = clampSourcePoint(screenToSource(screenX, screenY));
        const prevPt = prev[(nodeIndex - 1 + prev.length) % prev.length];
        const nextPt = prev[(nodeIndex + 1) % prev.length];
        // Keep adjacent edges horizontal/vertical when editing a closed shape.
        next[nodeIndex] = clampSourcePoint(resolveOrthoNodeDrag(prevPt, nextPt, raw));
      }
      return next;
    });
  }

  function mergeNodeInto(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setActivePoints((prev) => {
      if (prev.length <= 3) return prev;
      return prev.filter((_, i) => i !== fromIndex);
    });
  }

  function insertNodeOnSegment(segment) {
    if (!segment || points.length >= MAX_TRACE_POINTS) {
      if (points.length >= MAX_TRACE_POINTS) {
        alert(`Maximum ${MAX_TRACE_POINTS} points allowed.`);
      }
      return;
    }
    const pt = clampSourcePoint({ x: segment.sourceX, y: segment.sourceY });
    setActivePoints((prev) => {
      const next = [...prev];
      next.splice(segment.insertIndex, 0, pt);
      return next;
    });
  }

  function updateNearOrigin(screenX, screenY) {
    const next = isNearOrigin(screenX, screenY);
    setNearOrigin((prev) => (prev === next ? prev : next));
  }

  function updateHoveredNode(screenX, screenY) {
    if (!polygonClosed) {
      setHoveredNodeIndex((prev) => (prev === -1 ? prev : -1));
      return;
    }
    const index = findNodeAtScreen(screenX, screenY);
    setHoveredNodeIndex((prev) => (prev === index ? prev : index));
  }

  function commitInternalWallAtScreen(screenX, screenY) {
    if (!showTraceUi) return;
    if (!isLineLayerActive || pageLoading) return;
    const source = sourceCanvasRef.current;
    if (!source) return;

    const outerPoints = externalTrace.points;
    if (outerPoints.length < 3) return;

      const rawEnd = clampSourcePoint(screenToSource(screenX, screenY));
    let startedDraft = false;

    setLayerTraces((prev) => {
      const current = prev[INTERNAL_WALLS_LAYER_ID] || { segments: [], draftStart: null };
      const start = current.draftStart;
      const segments = current.segments ?? [];

      if (!start) {
        startedDraft = true;
        internalWallDraftRef.current = rawEnd;
        internalWallSnapHintRef.current = null;
        return {
          ...prev,
          [INTERNAL_WALLS_LAYER_ID]: { ...current, draftStart: rawEnd },
        };
      }

      const orthoEnd = orthogonalSnap(start, rawEnd);
      const snap = resolveInternalWallDrawSnap(start, orthoEnd, segments, outerPoints, {
        threshold: internalWallSnapThresholdSource(outerPoints),
      });
      const end = clampSourcePoint(snap.point);

      const parts = finalizeInternalWallSegment(start, end, outerPoints, currentMetresPerPixel());
      if (parts.length === 0) {
        internalWallSnapHintRef.current = null;
        return {
          ...prev,
          [INTERNAL_WALLS_LAYER_ID]: { ...current, draftStart: null },
        };
      }

      internalWallSnapHintRef.current = null;

      return {
        ...prev,
        [INTERNAL_WALLS_LAYER_ID]: {
          ...current,
          segments: [...segments, ...parts],
          draftStart: null,
        },
      };
    });

    internalWallDraftRef.current = startedDraft ? rawEnd : null;

    if (startedDraft) setLinePreviewPoint(rawEnd);
    else setLinePreviewPoint(null);
  }

  function addPointAtScreen(screenX, screenY) {
    if (!showTraceUi) return;
    if (isLineLayerActive) return;
    if (isDeckLayerActive && deckTool !== "add" && editingDeckIndex < 0) return;
    if (polygonClosed || pageLoading) return;
    const source = sourceCanvasRef.current;
    if (!source) return;

    if (points.length >= 3 && isNearOrigin(screenX, screenY)) {
      if (isDeckLayerActive && deckTool === "add") {
        const closedPts = points.map((p) => ({ x: p.x, y: p.y }));
        setLayerTraces((prev) => {
          const current = prev[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
          return {
            ...prev,
            [DECK_LAYER_ID]: {
              decks: [...(current.decks ?? []), { points: closedPts }],
              points: [],
              polygonClosed: false,
            },
          };
        });
      } else if (isDeckLayerActive && editingDeckIndex >= 0) {
        const closedPts = points.map((p) => ({ x: p.x, y: p.y }));
        setLayerTraces((prev) => {
          const current = prev[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
          const decks = [...(current.decks ?? [])];
          if (editingDeckIndex < decks.length) {
            decks[editingDeckIndex] = { points: closedPts };
          }
          return {
            ...prev,
            [DECK_LAYER_ID]: { decks, points: [], polygonClosed: false },
          };
        });
        setEditingDeckIndex(-1);
      } else {
        patchActiveTrace({ polygonClosed: true });
      }
      setNearOrigin(false);
      clearPolygonPreview();
      return;
    }

    if (points.length >= MAX_TRACE_POINTS) {
      alert(`Maximum ${MAX_TRACE_POINTS} points allowed. Click the origin to finish.`);
      return;
    }

    const raw = screenToSource(screenX, screenY);
    if (raw.x < 0 || raw.y < 0 || raw.x > source.width || raw.y > source.height) return;

    const snap = resolveActivePolygonSnap(raw);
    if (!snap?.point) {
      if (activeLayerId === DECK_LAYER_ID && points.length === 0) {
        alert("Start the deck on an external wall — move closer to a wall edge.");
      }
      return;
    }
    const pt = clampSourcePoint(snap.point);
    setActivePoints((prev) => [...prev, pt]);
    setNearOrigin(false);
    clearPolygonPreview();
  }

  function windowPlacementAtScreen(screenX, screenY, widthM) {
    if (!isWindowsLayerActive) return null;
    const outerPoints = externalTrace.points;
    if (!externalTrace.polygonClosed || outerPoints.length < 3) return null;
    const cursor = clampSourcePoint(screenToSource(screenX, screenY));
    return resolveWindowPlacement(cursor, outerPoints, currentMetresPerPixel(), widthM);
  }

  function moveWindowAtScreen(index, screenX, screenY) {
    const placed = layerTraces[WINDOWS_LAYER_ID]?.windows ?? [];
    const win = placed[index];
    if (!win) return;
    const placement = windowPlacementAtScreen(screenX, screenY, win.widthM);
    if (!placement) return;
    placement.heightM = win.heightM ?? DEFAULT_WINDOW_HEIGHT_M;
    setLayerTraces((prev) => {
      const current = prev[WINDOWS_LAYER_ID] || { windows: [] };
      const windows = (current.windows ?? []).map((w, i) => (i === index ? placement : w));
      return { ...prev, [WINDOWS_LAYER_ID]: { ...current, windows } };
    });
  }

  function windowResizeNodeAtScreen(screenX, screenY) {
    if (!isWindowsLayerActive || windowTool !== "edit") return -1;
    const placed = layerTraces[WINDOWS_LAYER_ID]?.windows ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    const threshold = WINDOW_RESIZE_NODE_PX / viewScale();
    let bestIdx = -1;
    let bestDist = threshold;
    placed.forEach((win, i) => {
      const node = win?.outerB;
      if (!node) return;
      const d = Math.hypot(node.x - src.x, node.y - src.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  function windowHeightNodeAtScreen(screenX, screenY) {
    if (!isWindowsLayerActive || windowTool !== "edit") return -1;
    const placed = layerTraces[WINDOWS_LAYER_ID]?.windows ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    const threshold = WINDOW_RESIZE_NODE_PX / viewScale();
    let bestIdx = -1;
    let bestDist = threshold;
    placed.forEach((win, i) => {
      const node = win?.center;
      if (!node) return;
      const d = Math.hypot(node.x - src.x, node.y - src.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  function setWindowHeightAt(index, heightM) {
    if (!(heightM > 0)) return;
    setLayerTraces((prev) => {
      const current = prev[WINDOWS_LAYER_ID] || { windows: [] };
      const windows = (current.windows ?? []).map((w, i) =>
        i === index ? { ...w, heightM } : w
      );
      return { ...prev, [WINDOWS_LAYER_ID]: { ...current, windows } };
    });
  }

  function resizeWindowAtScreen(index, screenX, screenY) {
    const placed = layerTraces[WINDOWS_LAYER_ID]?.windows ?? [];
    const win = placed[index];
    if (!win) return;
    const cursor = clampSourcePoint(screenToSource(screenX, screenY));
    const resized = resizeWindowFromEndpoint(
      win,
      cursor,
      externalTrace.points,
      currentMetresPerPixel()
    );
    if (!resized) return;
    resized.heightM = win.heightM ?? DEFAULT_WINDOW_HEIGHT_M;
    setResizeWidthM(resized.widthM);
    setLayerTraces((prev) => {
      const current = prev[WINDOWS_LAYER_ID] || { windows: [] };
      const windows = (current.windows ?? []).map((w, i) => (i === index ? resized : w));
      return { ...prev, [WINDOWS_LAYER_ID]: { ...current, windows } };
    });
  }

  function placeWindowAtScreen(screenX, screenY) {
    const placement = windowPlacementAtScreen(screenX, screenY);
    if (!placement) return;
    placement.heightM = DEFAULT_WINDOW_HEIGHT_M;
    setLayerTraces((prev) => {
      const current = prev[WINDOWS_LAYER_ID] || { windows: [] };
      return {
        ...prev,
        [WINDOWS_LAYER_ID]: {
          ...current,
          windows: [...(current.windows ?? []), placement],
        },
      };
    });
  }

  function doorPlacementAtScreen(screenX, screenY) {
    if (!isDoorsLayerActive) return null;
    const outerPoints = externalTrace.points;
    if (!externalTrace.polygonClosed || outerPoints.length < 3) return null;
    const cursor = clampSourcePoint(screenToSource(screenX, screenY));
    return resolveWindowPlacement(cursor, outerPoints, currentMetresPerPixel(), DOOR_WIDTH_M);
  }

  function moveDoorAtScreen(index, screenX, screenY) {
    const placement = doorPlacementAtScreen(screenX, screenY);
    if (!placement) return;
    setLayerTraces((prev) => {
      const current = prev[DOORS_LAYER_ID] || { doors: [] };
      const doors = (current.doors ?? []).map((d, i) => (i === index ? placement : d));
      return { ...prev, [DOORS_LAYER_ID]: { ...current, doors } };
    });
  }

  function placeDoorAtScreen(screenX, screenY) {
    const placement = doorPlacementAtScreen(screenX, screenY);
    if (!placement) return;
    setLayerTraces((prev) => {
      const current = prev[DOORS_LAYER_ID] || { doors: [] };
      return {
        ...prev,
        [DOORS_LAYER_ID]: {
          ...current,
          doors: [...(current.doors ?? []), placement],
        },
      };
    });
  }

  function slidingDoorPlacementAtScreen(screenX, screenY, widthM) {
    if (!isSlidingDoorsLayerActive) return null;
    const outerPoints = externalTrace.points;
    if (!externalTrace.polygonClosed || outerPoints.length < 3) return null;
    const cursor = clampSourcePoint(screenToSource(screenX, screenY));
    return resolveWindowPlacement(
      cursor,
      outerPoints,
      currentMetresPerPixel(),
      widthM ?? SLIDING_DOOR_WIDTH_M
    );
  }

  function moveSlidingDoorAtScreen(index, screenX, screenY) {
    const placed = layerTraces[SLIDING_DOORS_LAYER_ID]?.slidingDoors ?? [];
    const door = placed[index];
    if (!door) return;
    const placement = slidingDoorPlacementAtScreen(screenX, screenY, door.widthM);
    if (!placement) return;
    setLayerTraces((prev) => {
      const current = prev[SLIDING_DOORS_LAYER_ID] || { slidingDoors: [] };
      const slidingDoors = (current.slidingDoors ?? []).map((d, i) =>
        i === index ? placement : d
      );
      return { ...prev, [SLIDING_DOORS_LAYER_ID]: { ...current, slidingDoors } };
    });
  }

  function slidingDoorResizeNodeAtScreen(screenX, screenY) {
    if (!isSlidingDoorsLayerActive || slidingDoorTool !== "edit") return -1;
    const placed = layerTraces[SLIDING_DOORS_LAYER_ID]?.slidingDoors ?? [];
    if (!placed.length) return -1;
    const src = clampSourcePoint(screenToSource(screenX, screenY));
    const threshold = WINDOW_RESIZE_NODE_PX / viewScale();
    let bestIdx = -1;
    let bestDist = threshold;
    placed.forEach((door, i) => {
      const node = door?.outerB;
      if (!node) return;
      const d = Math.hypot(node.x - src.x, node.y - src.y);
      if (d <= bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    return bestIdx;
  }

  function resizeSlidingDoorAtScreen(index, screenX, screenY) {
    const placed = layerTraces[SLIDING_DOORS_LAYER_ID]?.slidingDoors ?? [];
    const door = placed[index];
    if (!door) return;
    const cursor = clampSourcePoint(screenToSource(screenX, screenY));
    const resized = resizeSlidingDoorFromEndpoint(
      door,
      cursor,
      externalTrace.points,
      currentMetresPerPixel()
    );
    if (!resized) return;
    setSlidingResizeWidthM(resized.widthM);
    setLayerTraces((prev) => {
      const current = prev[SLIDING_DOORS_LAYER_ID] || { slidingDoors: [] };
      const slidingDoors = (current.slidingDoors ?? []).map((d, i) =>
        i === index ? resized : d
      );
      return { ...prev, [SLIDING_DOORS_LAYER_ID]: { ...current, slidingDoors } };
    });
  }

  function placeSlidingDoorAtScreen(screenX, screenY) {
    const placement = slidingDoorPlacementAtScreen(screenX, screenY);
    if (!placement) return;
    setLayerTraces((prev) => {
      const current = prev[SLIDING_DOORS_LAYER_ID] || { slidingDoors: [] };
      return {
        ...prev,
        [SLIDING_DOORS_LAYER_ID]: {
          ...current,
          slidingDoors: [...(current.slidingDoors ?? []), placement],
        },
      };
    });
  }

  function onMouseDown(event) {
    if (loading || loadError || pageLoading) return;
    const pt = canvasCoords(event);
    if (!pt) return;
    if (openSubmenuLayerId) setOpenSubmenuLayerId(null);

    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      event.preventDefault();
      interactionRef.current = {
        type: "pan",
        startX: pt.x,
        startY: pt.y,
        panX: viewRef.current.panX,
        panY: viewRef.current.panY,
      };
      return;
    }

    if (event.button === 0) {
      if (wizardStep === WIZARD_PAGE) {
        return;
      }

      if (wizardStep === WIZARD_AREA) {
        const startSource = clampSourcePoint(screenToSource(pt.x, pt.y));
        interactionRef.current = {
          type: "cropDrag",
          startX: pt.x,
          startY: pt.y,
          startSource,
          moved: false,
        };
        setCropDraftEnd(startSource);
        return;
      }

      if (wizardStep === WIZARD_CALIBRATE) {
        if (pendingCalibLine) return; // waiting for length entry
        interactionRef.current = {
          type: "calibratePoint",
          startX: pt.x,
          startY: pt.y,
          moved: false,
        };
        return;
      }

      if (!showTraceUi) return;

      if (isWindowsLayerActive) {
        if (windowTool === "edit") {
          const heightIndex = windowHeightNodeAtScreen(pt.x, pt.y);
          if (heightIndex >= 0) {
            setHeightPickerIndex(heightIndex);
            return;
          }
          const resizeIndex = windowResizeNodeAtScreen(pt.x, pt.y);
          if (resizeIndex >= 0) {
            interactionRef.current = {
              type: "windowResize",
              index: resizeIndex,
              startX: pt.x,
              startY: pt.y,
              moved: false,
            };
            return;
          }
          const moveIndex = windowIndexAtScreen(pt.x, pt.y);
          if (moveIndex >= 0) {
            interactionRef.current = {
              type: "windowMove",
              index: moveIndex,
              startX: pt.x,
              startY: pt.y,
              moved: false,
            };
            setMovingWindowIndex(moveIndex);
            return;
          }
          return;
        }
        interactionRef.current = {
          type: "windowTool",
          startX: pt.x,
          startY: pt.y,
          moved: false,
        };
        return;
      }

      if (isDoorsLayerActive) {
        if (doorTool === "edit") {
          const moveIndex = doorIndexAtScreen(pt.x, pt.y);
          if (moveIndex >= 0) {
            interactionRef.current = {
              type: "doorMove",
              index: moveIndex,
              startX: pt.x,
              startY: pt.y,
              moved: false,
            };
            setMovingDoorIndex(moveIndex);
            return;
          }
          return;
        }
        interactionRef.current = {
          type: "doorTool",
          startX: pt.x,
          startY: pt.y,
          moved: false,
        };
        return;
      }

      if (isSlidingDoorsLayerActive) {
        if (slidingDoorTool === "edit") {
          const resizeIndex = slidingDoorResizeNodeAtScreen(pt.x, pt.y);
          if (resizeIndex >= 0) {
            interactionRef.current = {
              type: "slidingDoorResize",
              index: resizeIndex,
              startX: pt.x,
              startY: pt.y,
              moved: false,
            };
            return;
          }
          const moveIndex = slidingDoorIndexAtScreen(pt.x, pt.y);
          if (moveIndex >= 0) {
            interactionRef.current = {
              type: "slidingDoorMove",
              index: moveIndex,
              startX: pt.x,
              startY: pt.y,
              moved: false,
            };
            setMovingSlidingDoorIndex(moveIndex);
            return;
          }
          return;
        }
        interactionRef.current = {
          type: "slidingDoorTool",
          startX: pt.x,
          startY: pt.y,
          moved: false,
        };
        return;
      }

      if (isDeckLayerActive && (deckTool === "delete" || (deckTool === "edit" && editingDeckIndex < 0))) {
        interactionRef.current = {
          type: "deckTool",
          startX: pt.x,
          startY: pt.y,
          moved: false,
        };
        return;
      }

      if (isLineLayerActive) {
        const wallNode = findInternalWallNodeAtScreen(pt.x, pt.y);
        if (wallNode) {
          const segments = layerTraces[INTERNAL_WALLS_LAYER_ID]?.segments ?? [];
          const anchor = segments[wallNode.segmentIndex]?.[wallNode.vertex];
          if (anchor) {
            if (internalWallDraftRef.current) {
              internalWallDraftRef.current = null;
              patchLayerTrace(INTERNAL_WALLS_LAYER_ID, { draftStart: null });
              setLinePreviewPoint(null);
            }
            const affectedIndices = segments
              .map((seg, index) => ({ seg, index }))
              .filter(
                ({ seg }) => pointsCoincide(seg.a, anchor) || pointsCoincide(seg.b, anchor)
              )
              .map(({ index }) => index);
            interactionRef.current = {
              type: "dragInternalWallNode",
              segmentIndex: wallNode.segmentIndex,
              vertex: wallNode.vertex,
              affectedIndices,
              startX: pt.x,
              startY: pt.y,
              moved: false,
            };
            setDraggingWallNode(wallNode);
            setHoveredWallNode(wallNode);
            return;
          }
        }
        commitInternalWallAtScreen(pt.x, pt.y);
        return;
      }

      if (polygonClosed) {
        const nodeIndex = findNodeAtScreen(pt.x, pt.y);
        if (nodeIndex >= 0) {
          interactionRef.current = {
            type: "dragNode",
            nodeIndex,
            startX: pt.x,
            startY: pt.y,
            moved: false,
            snapTargetIndex: -1,
          };
          setDraggingNodeIndex(nodeIndex);
          setSnapMergeTargetIndex(-1);
          return;
        }
        interactionRef.current = {
          type: "insertOrIdle",
          startX: pt.x,
          startY: pt.y,
          moved: false,
        };
        return;
      }

      interactionRef.current = {
        type: "point",
        startX: pt.x,
        startY: pt.y,
        moved: false,
      };
    }
  }

  function onMouseMove(event) {
    const interaction = interactionRef.current;
    const pt = canvasCoords(event);
    if (!pt) return;

    if (!interaction) {
      if (showCalibrateUi) {
        if (calibDraftStart && !pendingCalibLine) {
          const raw = clampSourcePoint(screenToSource(pt.x, pt.y));
          const snapped = orthogonalSnap(calibDraftStart, raw);
          setCalibPreviewEnd((prev) =>
            prev && prev.x === snapped.x && prev.y === snapped.y ? prev : snapped
          );
        }
        return;
      }
      if (!showTraceUi) return;
      if (isWindowsLayerActive) {
        if (windowTool === "add") {
          const placement = windowPlacementAtScreen(pt.x, pt.y);
          setWindowPreview((prev) =>
            prev === placement ||
            (prev && placement &&
              prev.center.x === placement.center.x &&
              prev.center.y === placement.center.y)
              ? prev
              : placement
          );
        } else if (windowTool === "edit") {
          const heightIdx = windowHeightNodeAtScreen(pt.x, pt.y);
          setHoveredHeightIndex((prev) => (prev === heightIdx ? prev : heightIdx));
          const resizeIdx = heightIdx >= 0 ? -1 : windowResizeNodeAtScreen(pt.x, pt.y);
          setHoveredResizeIndex((prev) => (prev === resizeIdx ? prev : resizeIdx));
          const idx = heightIdx >= 0 || resizeIdx >= 0 ? -1 : windowIndexAtScreen(pt.x, pt.y);
          setHoveredWindowIndex((prev) => (prev === idx ? prev : idx));
        } else {
          const idx = windowIndexAtScreen(pt.x, pt.y);
          setHoveredWindowIndex((prev) => (prev === idx ? prev : idx));
        }
        return;
      }
      if (isDoorsLayerActive) {
        if (doorTool === "add") {
          const placement = doorPlacementAtScreen(pt.x, pt.y);
          setDoorPreview((prev) =>
            prev === placement ||
            (prev && placement &&
              prev.center.x === placement.center.x &&
              prev.center.y === placement.center.y)
              ? prev
              : placement
          );
        } else {
          const idx = doorIndexAtScreen(pt.x, pt.y);
          setHoveredDoorIndex((prev) => (prev === idx ? prev : idx));
        }
        return;
      }
      if (isSlidingDoorsLayerActive) {
        if (slidingDoorTool === "add") {
          const placement = slidingDoorPlacementAtScreen(pt.x, pt.y);
          setSlidingDoorPreview((prev) =>
            prev === placement ||
            (prev && placement &&
              prev.center.x === placement.center.x &&
              prev.center.y === placement.center.y)
              ? prev
              : placement
          );
        } else if (slidingDoorTool === "edit") {
          const resizeIdx = slidingDoorResizeNodeAtScreen(pt.x, pt.y);
          setHoveredSlidingResizeIndex((prev) => (prev === resizeIdx ? prev : resizeIdx));
          const idx = resizeIdx >= 0 ? -1 : slidingDoorIndexAtScreen(pt.x, pt.y);
          setHoveredSlidingDoorIndex((prev) => (prev === idx ? prev : idx));
        } else {
          const idx = slidingDoorIndexAtScreen(pt.x, pt.y);
          setHoveredSlidingDoorIndex((prev) => (prev === idx ? prev : idx));
        }
        return;
      }
      if (isDeckLayerActive && (deckTool === "delete" || deckTool === "edit")) {
        if (!(deckTool === "edit" && editingDeckIndex >= 0 && polygonClosed)) {
          const idx = deckIndexAtScreen(pt.x, pt.y);
          setHoveredDeckIndex((prev) => (prev === idx ? prev : idx));
          return;
        }
      }
      if (isLineLayerActive) {
        if (internalWallDraftRef.current) {
          const segments = layerTraces[INTERNAL_WALLS_LAYER_ID]?.segments ?? [];
          const outerPoints = externalTrace.points;
          const raw = clampSourcePoint(screenToSource(pt.x, pt.y));
          const ortho = orthogonalSnap(internalWallDraftRef.current, raw);
          const snapped = resolveSnapForInternalWall(
            internalWallDraftRef.current,
            ortho,
            segments,
            outerPoints
          );
          setLinePreviewPoint((prev) =>
            prev && prev.x === snapped.x && prev.y === snapped.y ? prev : snapped
          );
        } else {
          const hit = findInternalWallNodeAtScreen(pt.x, pt.y);
          setHoveredWallNode((prev) => (wallNodesMatch(prev, hit) ? prev : hit));
        }
        return;
      }
      if (polygonClosed) {
        updateHoveredNode(pt.x, pt.y);
        clearPolygonPreview();
      } else if (points.length >= 1 || activeLayerId === DECK_LAYER_ID) {
        const raw = clampSourcePoint(screenToSource(pt.x, pt.y));
        const snap = resolveActivePolygonSnap(raw);
        if (!snap?.point) {
          clearPolygonPreview();
        } else {
          polygonSnapGuidesRef.current = snap.guides || [];
          polygonSnapKindRef.current = snap.kind;
          setPolygonPreviewPoint((prev) =>
            prev && prev.x === snap.point.x && prev.y === snap.point.y ? prev : snap.point
          );
          if (points.length >= 2) {
            const previewScreen = sourceToScreen(snap.point.x, snap.point.y);
            updateNearOrigin(previewScreen.x, previewScreen.y);
          }
        }
      } else {
        clearPolygonPreview();
      }
      return;
    }

    if (interaction.type === "cropDrag") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 3) interaction.moved = true;
      const endSource = clampSourcePoint(screenToSource(pt.x, pt.y));
      setCropDraftEnd(endSource);
      return;
    }

    if (interaction.type === "windowResize") {
      interaction.moved = true;
      resizeWindowAtScreen(interaction.index, pt.x, pt.y);
      return;
    }

    if (interaction.type === "windowMove") {
      interaction.moved = true;
      moveWindowAtScreen(interaction.index, pt.x, pt.y);
      return;
    }

    if (interaction.type === "windowTool") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (windowTool === "add") {
        const placement = windowPlacementAtScreen(pt.x, pt.y);
        setWindowPreview((prev) => (prev === placement ? prev : placement));
      } else {
        const idx = windowIndexAtScreen(pt.x, pt.y);
        setHoveredWindowIndex((prev) => (prev === idx ? prev : idx));
      }
      return;
    }

    if (interaction.type === "doorMove") {
      interaction.moved = true;
      moveDoorAtScreen(interaction.index, pt.x, pt.y);
      return;
    }

    if (interaction.type === "doorTool") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (doorTool === "add") {
        const placement = doorPlacementAtScreen(pt.x, pt.y);
        setDoorPreview((prev) => (prev === placement ? prev : placement));
      } else {
        const idx = doorIndexAtScreen(pt.x, pt.y);
        setHoveredDoorIndex((prev) => (prev === idx ? prev : idx));
      }
      return;
    }

    if (interaction.type === "slidingDoorResize") {
      interaction.moved = true;
      resizeSlidingDoorAtScreen(interaction.index, pt.x, pt.y);
      return;
    }

    if (interaction.type === "slidingDoorMove") {
      interaction.moved = true;
      moveSlidingDoorAtScreen(interaction.index, pt.x, pt.y);
      return;
    }

    if (interaction.type === "slidingDoorTool") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (slidingDoorTool === "add") {
        const placement = slidingDoorPlacementAtScreen(pt.x, pt.y);
        setSlidingDoorPreview((prev) => (prev === placement ? prev : placement));
      } else {
        const idx = slidingDoorIndexAtScreen(pt.x, pt.y);
        setHoveredSlidingDoorIndex((prev) => (prev === idx ? prev : idx));
      }
      return;
    }

    if (interaction.type === "deckTool") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      const idx = deckIndexAtScreen(pt.x, pt.y);
      setHoveredDeckIndex((prev) => (prev === idx ? prev : idx));
      return;
    }

    if (interaction.type === "calibratePoint") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (calibDraftStart && !pendingCalibLine) {
        const raw = clampSourcePoint(screenToSource(pt.x, pt.y));
        const snapped = orthogonalSnap(calibDraftStart, raw);
        setCalibPreviewEnd((prev) =>
          prev && prev.x === snapped.x && prev.y === snapped.y ? prev : snapped
        );
      }
      return;
    }

    if (interaction.type === "dragInternalWallNode") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 2) interaction.moved = true;
      moveInternalWallNode(interaction.segmentIndex, interaction.vertex, pt.x, pt.y);
      return;
    }

    if (interaction.type === "dragNode") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 2) interaction.moved = true;
      const snapTarget = findNearestMergeSnapTarget(interaction.nodeIndex, pt.x, pt.y);
      interaction.snapTargetIndex = snapTarget;
      setSnapMergeTargetIndex((prev) => (prev === snapTarget ? prev : snapTarget));
      moveNode(interaction.nodeIndex, pt.x, pt.y, snapTarget);
      return;
    }

    if (interaction.type === "insertOrIdle") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      return;
    }

    if (interaction.type === "pan") {
      const canvas = canvasRef.current;
      viewRef.current.panX = interaction.panX + (pt.x - interaction.startX);
      viewRef.current.panY = interaction.panY + (pt.y - interaction.startY);
      clampPan(canvas?.width || viewportSize.width, canvas?.height || viewportSize.height);
      bumpView();
      return;
    }

    if (interaction.type === "point") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (!polygonClosed && (points.length >= 1 || activeLayerId === DECK_LAYER_ID)) {
        const raw = clampSourcePoint(screenToSource(pt.x, pt.y));
        const snap = resolveActivePolygonSnap(raw);
        if (!snap?.point) {
          clearPolygonPreview();
        } else {
          polygonSnapGuidesRef.current = snap.guides || [];
          polygonSnapKindRef.current = snap.kind;
          setPolygonPreviewPoint((prev) =>
            prev && prev.x === snap.point.x && prev.y === snap.point.y ? prev : snap.point
          );
          if (points.length >= 2) {
            const previewScreen = sourceToScreen(snap.point.x, snap.point.y);
            updateNearOrigin(previewScreen.x, previewScreen.y);
          }
        }
      }
    }
  }

  function onMouseUp(event) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction || loading || loadError || pageLoading) return;

    if (interaction.type === "cropDrag") {
      const endSource =
        cropDraftEnd ||
        clampSourcePoint(screenToSource(interaction.startX, interaction.startY));
      const rect = normalizePixelCropRect(interaction.startSource, endSource);
      setCropDraftEnd(null);
      if (rect.w >= MIN_CROP_PX && rect.h >= MIN_CROP_PX) {
        setCropRectPx(rect);
      }
      return;
    }

    if (interaction.type === "windowResize") {
      if (event.button === 0) {
        const pt = canvasCoords(event);
        if (pt) resizeWindowAtScreen(interaction.index, pt.x, pt.y);
      }
      setResizeWidthM(null);
      return;
    }

    if (interaction.type === "windowMove") {
      if (event.button === 0 && interaction.moved) {
        const pt = canvasCoords(event);
        if (pt) moveWindowAtScreen(interaction.index, pt.x, pt.y);
      }
      setMovingWindowIndex(-1);
      return;
    }

    if (interaction.type === "windowTool") {
      if (event.button === 0 && !interaction.moved) {
        const pt = canvasCoords(event) || { x: interaction.startX, y: interaction.startY };
        if (windowTool === "add") {
          placeWindowAtScreen(pt.x, pt.y);
        } else if (windowTool === "delete") {
          removeWindowAt(windowIndexAtScreen(pt.x, pt.y));
          setHoveredWindowIndex(-1);
        }
      }
      return;
    }

    if (interaction.type === "doorMove") {
      if (event.button === 0 && interaction.moved) {
        const pt = canvasCoords(event);
        if (pt) moveDoorAtScreen(interaction.index, pt.x, pt.y);
      }
      setMovingDoorIndex(-1);
      return;
    }

    if (interaction.type === "doorTool") {
      if (event.button === 0 && !interaction.moved) {
        const pt = canvasCoords(event) || { x: interaction.startX, y: interaction.startY };
        if (doorTool === "add") {
          placeDoorAtScreen(pt.x, pt.y);
        } else if (doorTool === "delete") {
          removeDoorAt(doorIndexAtScreen(pt.x, pt.y));
          setHoveredDoorIndex(-1);
        }
      }
      return;
    }

    if (interaction.type === "slidingDoorResize") {
      if (event.button === 0) {
        const pt = canvasCoords(event);
        if (pt) resizeSlidingDoorAtScreen(interaction.index, pt.x, pt.y);
      }
      setSlidingResizeWidthM(null);
      return;
    }

    if (interaction.type === "slidingDoorMove") {
      if (event.button === 0 && interaction.moved) {
        const pt = canvasCoords(event);
        if (pt) moveSlidingDoorAtScreen(interaction.index, pt.x, pt.y);
      }
      setMovingSlidingDoorIndex(-1);
      return;
    }

    if (interaction.type === "slidingDoorTool") {
      if (event.button === 0 && !interaction.moved) {
        const pt = canvasCoords(event) || { x: interaction.startX, y: interaction.startY };
        if (slidingDoorTool === "add") {
          placeSlidingDoorAtScreen(pt.x, pt.y);
        } else if (slidingDoorTool === "delete") {
          removeSlidingDoorAt(slidingDoorIndexAtScreen(pt.x, pt.y));
          setHoveredSlidingDoorIndex(-1);
        }
      }
      return;
    }

    if (interaction.type === "deckTool") {
      if (event.button === 0 && !interaction.moved) {
        const pt = canvasCoords(event) || { x: interaction.startX, y: interaction.startY };
        const idx = deckIndexAtScreen(pt.x, pt.y);
        if (deckTool === "delete") {
          removeDeckAt(idx);
        } else if (deckTool === "edit") {
          beginEditDeckAt(idx);
        }
        setHoveredDeckIndex(-1);
      }
      return;
    }

    if (interaction.type === "calibratePoint") {
      if (event.button !== 0 || pendingCalibLine) return;
      const pt = canvasCoords(event) || { x: interaction.startX, y: interaction.startY };
      const source = clampSourcePoint(screenToSource(pt.x, pt.y));
      if (!calibDraftStart) {
        setCalibDraftStart(source);
        setCalibPreviewEnd(source);
        return;
      }
      const end = orthogonalSnap(calibDraftStart, source);
      if (Math.hypot(end.x - calibDraftStart.x, end.y - calibDraftStart.y) < 2) {
        // Ignore a zero-length line.
        return;
      }
      setPendingCalibLine({ a: { ...calibDraftStart }, b: { ...end } });
      setCalibPreviewEnd(end);
      setLengthInput("");
      return;
    }

    if (interaction.type === "dragInternalWallNode") {
      setDraggingWallNode(null);
      if (interaction.moved) {
        finalizeDraggedInternalWallSegments(interaction.affectedIndices);
      }
      internalWallSnapHintRef.current = null;
      return;
    }

    if (polygonClosed) {
      if (interaction.type === "dragNode") {
        const { nodeIndex, snapTargetIndex = -1 } = interaction;
        setDraggingNodeIndex(-1);
        setSnapMergeTargetIndex(-1);
        if (snapTargetIndex >= 0 && snapTargetIndex !== nodeIndex) {
          mergeNodeInto(nodeIndex, snapTargetIndex);
        }
        if (isDeckLayerActive && editingDeckIndex >= 0) {
          setLayerTraces((prev) => {
            const current = prev[DECK_LAYER_ID];
            if (!current || (current.points?.length ?? 0) < 3) return prev;
            const decks = [...(current.decks ?? [])];
            if (editingDeckIndex >= decks.length) return prev;
            decks[editingDeckIndex] = {
              points: current.points.map((p) => ({ x: p.x, y: p.y })),
            };
            return { ...prev, [DECK_LAYER_ID]: { ...current, decks } };
          });
        }
        return;
      }
      if (interaction.type === "insertOrIdle" && !interaction.moved && event.button === 0) {
        const segment = findSegmentAtScreen(interaction.startX, interaction.startY);
        if (segment) insertNodeOnSegment(segment);
        if (isDeckLayerActive && editingDeckIndex >= 0) {
          // Sync after potential insert on next tick via points already in state —
          // insertNodeOnSegment updates points synchronously in setState, so sync here from ref is hard.
          // Commit happens on tool switch / save.
        }
      }
      return;
    }

    if (interaction.type === "point" && !interaction.moved && event.button === 0) {
      addPointAtScreen(interaction.startX, interaction.startY);
    }
  }

  function onMouseLeave() {
    interactionRef.current = null;
    setNearOrigin(false);
    setHoveredNodeIndex(-1);
    setDraggingNodeIndex(-1);
    setSnapMergeTargetIndex(-1);
    setLinePreviewPoint(null);
    clearPolygonPreview();
    setCropDraftEnd(null);
    setHoveredWallNode(null);
    setDraggingWallNode(null);
    setWindowPreview(null);
    setHoveredWindowIndex(-1);
    setHoveredResizeIndex(-1);
    setResizeWidthM(null);
    setMovingWindowIndex(-1);
    internalWallSnapHintRef.current = null;
  }

  function undoPoint() {
    if (isWindowsLayerActive) {
      setLayerTraces((prev) => {
        const current = prev[WINDOWS_LAYER_ID] || { windows: [] };
        return {
          ...prev,
          [WINDOWS_LAYER_ID]: { ...current, windows: (current.windows ?? []).slice(0, -1) },
        };
      });
      return;
    }
    if (isDoorsLayerActive) {
      setLayerTraces((prev) => {
        const current = prev[DOORS_LAYER_ID] || { doors: [] };
        return {
          ...prev,
          [DOORS_LAYER_ID]: { ...current, doors: (current.doors ?? []).slice(0, -1) },
        };
      });
      return;
    }
    if (isSlidingDoorsLayerActive) {
      setLayerTraces((prev) => {
        const current = prev[SLIDING_DOORS_LAYER_ID] || { slidingDoors: [] };
        return {
          ...prev,
          [SLIDING_DOORS_LAYER_ID]: {
            ...current,
            slidingDoors: (current.slidingDoors ?? []).slice(0, -1),
          },
        };
      });
      return;
    }
    if (isDeckLayerActive) {
      const deck = layerTraces[DECK_LAYER_ID];
      if ((deck?.points?.length ?? 0) > 0) {
        if (polygonClosed) {
          patchLayerTrace(DECK_LAYER_ID, { polygonClosed: false });
        } else {
          setActivePoints((prev) => prev.slice(0, -1));
        }
        return;
      }
      if ((deck?.decks?.length ?? 0) > 0) {
        setLayerTraces((prev) => {
          const current = prev[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
          return {
            ...prev,
            [DECK_LAYER_ID]: {
              ...current,
              decks: (current.decks ?? []).slice(0, -1),
            },
          };
        });
        setEditingDeckIndex(-1);
      }
      return;
    }
    if (isLineLayerActive) {
      const trace = layerTraces[INTERNAL_WALLS_LAYER_ID];
      if (trace?.draftStart) {
        internalWallDraftRef.current = null;
        patchLayerTrace(INTERNAL_WALLS_LAYER_ID, { draftStart: null });
        setLinePreviewPoint(null);
        return;
      }
      if ((trace?.segments?.length ?? 0) > 0) {
        patchLayerTrace(INTERNAL_WALLS_LAYER_ID, {
          segments: trace.segments.slice(0, -1),
        });
      }
      return;
    }
    if (polygonClosed) {
      patchActiveTrace({ polygonClosed: false });
      return;
    }
    setActivePoints((prev) => prev.slice(0, -1));
    setNearOrigin(false);
    clearPolygonPreview();
  }

  function clearActiveLayerTrace() {
    if (isWindowsLayerActive) {
      patchLayerTrace(WINDOWS_LAYER_ID, { windows: [] });
      setWindowPreview(null);
      return;
    }
    if (isDoorsLayerActive) {
      patchLayerTrace(DOORS_LAYER_ID, { doors: [] });
      setDoorPreview(null);
      return;
    }
    if (isSlidingDoorsLayerActive) {
      patchLayerTrace(SLIDING_DOORS_LAYER_ID, { slidingDoors: [] });
      setSlidingDoorPreview(null);
      return;
    }
    if (isDeckLayerActive) {
      patchLayerTrace(DECK_LAYER_ID, { decks: [], points: [], polygonClosed: false });
      setEditingDeckIndex(-1);
      setHoveredDeckIndex(-1);
      setNearOrigin(false);
      clearPolygonPreview();
      return;
    }
    if (isLineLayerActive) {
      internalWallDraftRef.current = null;
      patchLayerTrace(activeLayerId, { segments: [], draftStart: null });
      setLinePreviewPoint(null);
      return;
    }
    patchActiveTrace({ points: [], polygonClosed: false });
    setNearOrigin(false);
    clearPolygonPreview();
    setHoveredNodeIndex(-1);
    setDraggingNodeIndex(-1);
    setSnapMergeTargetIndex(-1);
  }

  function handleClearTrace() {
    if (!hasLayerDraft(activeLayerId, layerTraces[activeLayerId])) return;
    if (!window.confirm(`Clear the ${activeLayer.label} trace?`)) return;
    clearActiveLayerTrace();
  }

  function hasUnsavedPageTraces() {
    const saved = savedTraceRef.current;
    const source = sourceCanvasRef.current;
    return TRACE_PLAN_LAYERS.some((layer) => {
      const trace = layerTraces[layer.id];
      if (!hasLayerDraft(layer.id, trace)) return false;
      if (layer.id === EXTERNAL_WALLS_LAYER_ID) {
        return !(
          saved.page === currentPage &&
          saved.points.length >= 3 &&
          trace.polygonClosed
        );
      }
      if (layer.id === ROOF_LAYER_ID) {
        if (!trace.polygonClosed || (trace.points?.length ?? 0) < 3) return true;
        if (saved.page !== currentPage) return true;
        const sourceW = source?.width;
        const sourceH = source?.height;
        if (!sourceW || !sourceH) return true;
        const normalized = normalizeTracePoints(trace.points, sourceW, sourceH);
        return JSON.stringify(normalized) !== JSON.stringify(saved.roofPoints ?? []);
      }
      if (layer.id === DECK_LAYER_ID) {
        if (saved.page !== currentPage) return true;
        const sourceW = source?.width;
        const sourceH = source?.height;
        if (!sourceW || !sourceH) return true;
        const decks = [...(trace.decks ?? [])];
        if ((trace.points?.length ?? 0) >= 3) {
          if (editingDeckIndex >= 0 && editingDeckIndex < decks.length) {
            decks[editingDeckIndex] = { points: trace.points };
          } else {
            decks.push({ points: trace.points });
          }
        }
        const normalized = decks
          .map((deck) => normalizeTracePoints(deck.points ?? [], sourceW, sourceH))
          .filter((pts) => pts.length >= 3)
          .map((pts) => ({ points: pts }));
        const savedDecks = (saved.decks?.length ? saved.decks : null)
          ?? (saved.deckPoints?.length >= 3 ? [{ points: saved.deckPoints }] : []);
        return JSON.stringify(normalized) !== JSON.stringify(savedDecks);
      }
      if (layer.id === INTERNAL_WALLS_LAYER_ID && source) {
        if (saved.page !== currentPage) return true;
        const normalized = normalizeTraceSegments(trace.segments ?? [], source.width, source.height);
        return JSON.stringify(normalized) !== JSON.stringify(saved.internalWallSegments ?? []);
      }
      if (layer.id === WINDOWS_LAYER_ID && source) {
        if (saved.page !== currentPage) return true;
        const round = (v) => Math.round(v * 1e6) / 1e6;
        const normalized = (trace.windows ?? [])
          .map((win) => {
            const outerA = win.outerA ?? win.a;
            const outerB = win.outerB ?? win.b;
            if (!outerA || !outerB) return null;
            const out = {
              a: { x: round(outerA.x / source.width), y: round(outerA.y / source.height) },
              b: { x: round(outerB.x / source.width), y: round(outerB.y / source.height) },
            };
            if (win.heightM > 0) out.heightM = round(win.heightM);
            return out;
          })
          .filter(Boolean);
        return JSON.stringify(normalized) !== JSON.stringify(saved.windows ?? []);
      }
      if (layer.id === DOORS_LAYER_ID && source) {
        if (saved.page !== currentPage) return true;
        const round = (v) => Math.round(v * 1e6) / 1e6;
        const normalized = (trace.doors ?? [])
          .map((door) => {
            const outerA = door.outerA ?? door.a;
            const outerB = door.outerB ?? door.b;
            if (!outerA || !outerB) return null;
            return {
              a: { x: round(outerA.x / source.width), y: round(outerA.y / source.height) },
              b: { x: round(outerB.x / source.width), y: round(outerB.y / source.height) },
            };
          })
          .filter(Boolean);
        return JSON.stringify(normalized) !== JSON.stringify(saved.doors ?? []);
      }
      if (layer.id === SLIDING_DOORS_LAYER_ID && source) {
        if (saved.page !== currentPage) return true;
        const round = (v) => Math.round(v * 1e6) / 1e6;
        const normalized = (trace.slidingDoors ?? [])
          .map((door) => {
            const outerA = door.outerA ?? door.a;
            const outerB = door.outerB ?? door.b;
            if (!outerA || !outerB) return null;
            return {
              a: { x: round(outerA.x / source.width), y: round(outerA.y / source.height) },
              b: { x: round(outerB.x / source.width), y: round(outerB.y / source.height) },
            };
          })
          .filter(Boolean);
        return JSON.stringify(normalized) !== JSON.stringify(saved.slidingDoors ?? []);
      }
      return true;
    });
  }

  function resetZoom() {
    const source = sourceCanvasRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    resetView(source, canvas.width, canvas.height);
    bumpView();
  }

  function confirmPageStep() {
    setWizardStep(WIZARD_AREA);
    setCropDraftEnd(null);
  }

  function confirmAreaStep() {
    if (!cropRectPx || cropRectPx.w < MIN_CROP_PX || cropRectPx.h < MIN_CROP_PX) {
      alert("Drag a rectangle over the floor plan area first.");
      return;
    }
    setWizardStep(WIZARD_CALIBRATE);
    setCropDraftEnd(null);
  }

  function clearCalibrationDraft() {
    setCalibDraftStart(null);
    setCalibPreviewEnd(null);
    setPendingCalibLine(null);
  }

  function confirmCalibrateStep() {
    if (!calibration) {
      alert("Draw a line over an edge of known length and enter its real length first.");
      return;
    }
    clearCalibrationDraft();
    setWizardStep(WIZARD_TRACE);
  }

  function backToPageStep() {
    if (hasUnsavedPageTraces() || cropRectPx || calibration) {
      const proceed = window.confirm(
        "Going back to page selection will clear the floor-plan area, scale and any traces. Continue?"
      );
      if (!proceed) return;
    }
    setLayerTraces(createEmptyLayerTraces());
    setCropRectPx(null);
    setCropDraftEnd(null);
    setCalibration(null);
    clearCalibrationDraft();
    clearPolygonPreview();
    setWizardStep(WIZARD_PAGE);
  }

  function backToAreaStep() {
    setCropDraftEnd(null);
    clearCalibrationDraft();
    clearPolygonPreview();
    setWizardStep(WIZARD_AREA);
  }

  function backToCalibrateStep() {
    clearCalibrationDraft();
    clearPolygonPreview();
    setWizardStep(WIZARD_CALIBRATE);
  }

  function commitCalibrationLength() {
    const value = parseFloat(lengthInput);
    if (!pendingCalibLine || !Number.isFinite(value) || value <= 0) {
      alert("Enter a length in metres greater than 0.");
      return;
    }
    const source = sourceCanvasRef.current;
    if (!source) return;
    const next = {
      a: { x: pendingCalibLine.a.x / source.width, y: pendingCalibLine.a.y / source.height },
      b: { x: pendingCalibLine.b.x / source.width, y: pendingCalibLine.b.y / source.height },
      lengthM: value,
      aspect: source.width / source.height,
    };
    setCalibration(next);
    clearCalibrationDraft();
    setLengthInput("");
  }

  function cancelCalibrationLength() {
    clearCalibrationDraft();
    setLengthInput("");
  }

  async function goToPage(nextPage) {
    const target = Math.min(Math.max(1, nextPage), pageCount);
    if (target === currentPage) return;

    if (wizardStep !== WIZARD_PAGE) {
      alert("Use Back to return to page selection before changing pages.");
      return;
    }

    if (hasUnsavedPageTraces()) {
      const proceed = window.confirm(
        "Changing page will clear traces on this page. Continue?"
      );
      if (!proceed) return;
    }

    setCurrentPage(target);
    setCropRectPx(null);
    setCropDraftEnd(null);
    await loadPage(target);
  }

  async function handleSaveAndContinue() {
    if (!showTraceUi) return;
    const external = layerTraces[EXTERNAL_WALLS_LAYER_ID];
    if (!external.polygonClosed || external.points.length < 3) {
      alert("Close the External Walls polygon by clicking the origin point first.");
      return;
    }
    const source = sourceCanvasRef.current;
    if (!source) return;
    if (!cropRectPx) {
      alert("Define the floor plan area before saving.");
      return;
    }

    setSaving(true);
    try {
      const normalized = normalizeTracePoints(external.points, source.width, source.height);
      const internal = layerTraces[INTERNAL_WALLS_LAYER_ID];
      const normalizedInternal = normalizeTraceSegments(
        internal?.segments ?? [],
        source.width,
        source.height
      );
      const normalizedCrop = normalizeCropRect(cropRectPx, source.width, source.height);
      const normalizedWindows = (layerTraces[WINDOWS_LAYER_ID]?.windows ?? [])
        .map((win) => {
          const outerA = win.outerA ?? win.a;
          const outerB = win.outerB ?? win.b;
          if (!outerA || !outerB) return null;
          const out = {
            a: { x: outerA.x / source.width, y: outerA.y / source.height },
            b: { x: outerB.x / source.width, y: outerB.y / source.height },
          };
          if (win.heightM > 0) out.heightM = win.heightM;
          return out;
        })
        .filter(Boolean);
      const normalizedDoors = (layerTraces[DOORS_LAYER_ID]?.doors ?? [])
        .map((door) => {
          const outerA = door.outerA ?? door.a;
          const outerB = door.outerB ?? door.b;
          if (!outerA || !outerB) return null;
          return {
            a: { x: outerA.x / source.width, y: outerA.y / source.height },
            b: { x: outerB.x / source.width, y: outerB.y / source.height },
          };
        })
        .filter(Boolean);
      const normalizedSlidingDoors = (layerTraces[SLIDING_DOORS_LAYER_ID]?.slidingDoors ?? [])
        .map((door) => {
          const outerA = door.outerA ?? door.a;
          const outerB = door.outerB ?? door.b;
          if (!outerA || !outerB) return null;
          return {
            a: { x: outerA.x / source.width, y: outerA.y / source.height },
            b: { x: outerB.x / source.width, y: outerB.y / source.height },
          };
        })
        .filter(Boolean);
      const roof = layerTraces[ROOF_LAYER_ID];
      const normalizedRoof =
        roof?.polygonClosed && (roof.points?.length ?? 0) >= 3
          ? normalizeTracePoints(roof.points, source.width, source.height)
          : [];
      const deckLayer = layerTraces[DECK_LAYER_ID] || { decks: [], points: [], polygonClosed: false };
      // Flush any open draft / edit into the decks list before save.
      const decksForSave = [...(deckLayer.decks ?? [])];
      if ((deckLayer.points?.length ?? 0) >= 3) {
        const draft = {
          points: deckLayer.points.map((p) => ({ x: p.x, y: p.y })),
        };
        if (editingDeckIndex >= 0 && editingDeckIndex < decksForSave.length) {
          decksForSave[editingDeckIndex] = draft;
        } else {
          decksForSave.push(draft);
        }
      }
      const normalizedDecks = decksForSave
        .map((deck) => {
          const pts = normalizeTracePoints(deck.points ?? [], source.width, source.height);
          return pts.length >= 3 ? { points: pts } : null;
        })
        .filter(Boolean);
      await onSave(
        normalized,
        currentPage,
        normalizedInternal,
        normalizedCrop,
        normalizedWindows,
        calibration,
        normalizedDoors,
        normalizedSlidingDoors,
        normalizedRoof,
        normalizedDecks
      );
      savedTraceRef.current = {
        page: currentPage,
        points: normalized,
        roofPoints: normalizedRoof,
        decks: normalizedDecks,
        deckPoints: normalizedDecks[0]?.points ?? [],
        internalWallSegments: normalizedInternal,
        crop: normalizedCrop,
        windows: normalizedWindows,
        doors: normalizedDoors,
        slidingDoors: normalizedSlidingDoors,
        calibration,
      };
      onClose();
    } catch (err) {
      alert(err.message || "Failed to save trace");
    } finally {
      setSaving(false);
    }
  }

  const zoomPercent = Math.round(viewRef.current.zoom * 100);
  const activeHasDraft = hasLayerDraft(activeLayerId, layerTraces[activeLayerId]);
  const canvasCursor = pageLoading
    ? "default"
    : wizardStep === WIZARD_PAGE
      ? "default"
      : wizardStep === WIZARD_AREA
        ? "crosshair"
        : wizardStep === WIZARD_CALIBRATE
          ? "crosshair"
        : isWindowsLayerActive && windowTool === "edit"
          ? movingWindowIndex >= 0
            ? "grabbing"
            : hoveredHeightIndex >= 0
              ? "pointer"
              : hoveredResizeIndex >= 0 || hoveredWindowIndex >= 0
                ? "grab"
                : "crosshair"
        : isDoorsLayerActive && doorTool === "edit"
          ? movingDoorIndex >= 0
            ? "grabbing"
            : hoveredDoorIndex >= 0
              ? "grab"
              : "crosshair"
        : isSlidingDoorsLayerActive && slidingDoorTool === "edit"
          ? movingSlidingDoorIndex >= 0
            ? "grabbing"
            : hoveredSlidingResizeIndex >= 0 || hoveredSlidingDoorIndex >= 0
              ? "grab"
              : "crosshair"
        : isLineLayerActive
          ? draggingWallNode
            ? "grabbing"
            : hoveredWallNode
              ? "grab"
              : "crosshair"
          : polygonClosed
            ? draggingNodeIndex >= 0
              ? "grabbing"
              : hoveredNodeIndex >= 0
                ? "grab"
                : "crosshair"
            : "crosshair";
  const wizardTitle =
    wizardStep === WIZARD_PAGE
      ? "Trace Plan — Select page"
      : wizardStep === WIZARD_AREA
        ? "Trace Plan — Floor plan area"
        : wizardStep === WIZARD_CALIBRATE
          ? "Trace Plan — Set scale"
          : "Trace Plan — Trace layers";
  const wizardHelp =
    wizardStep === WIZARD_PAGE
      ? "Navigate to the PDF page that shows the floor plan, then continue."
      : wizardStep === WIZARD_AREA
        ? "Drag a rectangle around the floor plan only. When it looks right, continue — the viewer will zoom to that area before tracing."
        : wizardStep === WIZARD_CALIBRATE
          ? "Draw a line along an edge of known length (horizontal or vertical only): click the start, then click the end. Enter what that length represents in metres. This sets the true scale for walls, windows and the 3D model."
        : isWindowsLayerActive
          ? windowTool === "delete"
            ? "Delete windows: hover a placed window (highlights red) and click to remove it. Use the Windows ▸ menu to switch tools."
              : windowTool === "edit"
              ? "Edit windows: drag a window to slide it along the walls, drag the square handle on its end to change its width (snaps to 600–2100 mm), or click the round centre node to set its height. Use the Windows ▸ menu to switch tools."
              : "Add windows: hover near an external wall — a 1.8 m × 100 mm window follows the cursor and snaps to the wall. Click to place it. Undo removes the last window."
          : isDoorsLayerActive
          ? doorTool === "delete"
            ? "Delete swing doors: hover a placed door (highlights red) and click to remove it. Use the Swing Door ▸ menu to switch tools."
            : doorTool === "edit"
              ? "Edit swing doors: drag a door to slide it along the walls. Use the Swing Door ▸ menu to switch tools."
              : "Add swing doors: hover near an external wall — an 870 mm × 100 mm door follows the cursor and snaps to the wall. Click to place it."
          : isSlidingDoorsLayerActive
          ? slidingDoorTool === "delete"
            ? "Delete sliding doors: hover a placed door (highlights red) and click to remove it. Use the Sliding Door ▸ menu to switch tools."
            : slidingDoorTool === "edit"
              ? "Edit sliding doors: drag a door to slide it along the walls, or drag the square handle on its end to change its width (snaps to 2100–3600 mm)."
              : "Add sliding doors: hover near an external wall — a 2.1 m × 100 mm door follows the cursor and snaps to the wall. Click to place it."
          : isLineLayerActive
          ? "Click once for each end of a wall line — horizontal or vertical only. Segments trim to the inside edge of external walls. Drag nodes to adjust. Scroll to zoom, shift+drag to pan."
          : activeLayerId === ROOF_LAYER_ID
            ? `Trace the roof outline — horizontal/vertical only (max ${MAX_TRACE_POINTS}). Blue guides show your stroke axes and external-wall alignments; green guides appear when a side can close at 90° or snaps to a wall line. Click the green origin to close.${
                polygonClosed
                  ? " Drag nodes to move them (edges stay H/V), drop onto another node to merge, or click a line to add a node."
                  : ""
              }`
          : activeLayerId === DECK_LAYER_ID
            ? deckTool === "delete"
              ? "Delete decks: hover a placed deck (highlights red) and click to remove it. Use the Deck ▸ menu to switch tools."
              : deckTool === "edit"
                ? "Edit decks: click a deck to select it, then drag nodes (edges stay H/V). Use the Deck ▸ menu to switch tools."
                : `Add a deck — start on an external wall edge, then click corners (horizontal/vertical only, max ${MAX_TRACE_POINTS}). Click the green origin to close and place it. You can add more decks the same way.`
          : `Click corners on the fitted floor plan — lines snap horizontal/vertical only (max ${MAX_TRACE_POINTS}). Blue guides show axes; green guides snap when a side can close back to the origin at 90°. Click the green origin to close.${
              polygonClosed
                ? " Drag nodes to move them (edges stay H/V), drop onto another node to merge, or click a line to add a node."
                : ""
            }`;
  const navButtonStyle = {
    background: "transparent",
    border: `1px solid ${SECTION_GREY}`,
    borderRadius: "6px",
    padding: "6px 12px",
    cursor: "pointer",
    color: MONUMENT,
    fontSize: "0.9rem",
    fontWeight: 500,
  };
  const pdfPlanToggleButton = (
    <button
      type="button"
      onClick={() => setShowPdfPlan((visible) => !visible)}
      style={{
        ...navButtonStyle,
        background: showPdfPlan ? "transparent" : MONUMENT,
        color: showPdfPlan ? MONUMENT : PAGE_TEXT,
        borderColor: showPdfPlan ? SECTION_GREY : MONUMENT,
      }}
      title={showPdfPlan ? "Hide the PDF floor plan" : "Show the PDF floor plan"}
    >
      {showPdfPlan ? "Hide plan" : "Show plan"}
    </button>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1001,
        padding: "16px",
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative",
          background: WHITE,
          borderRadius: "12px",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            flexShrink: 0,
            borderBottom: `1px solid ${SECTION_GREY}`,
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.35rem", color: MONUMENT }}>{wizardTitle}</h2>

          {pageCount > 1 && !loading && !loadError && wizardStep === WIZARD_PAGE && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1 || pageLoading}
                style={{
                  ...navButtonStyle,
                  opacity: currentPage <= 1 || pageLoading ? 0.5 : 1,
                  cursor: currentPage <= 1 || pageLoading ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: "0.95rem", color: MONUMENT, minWidth: "110px", textAlign: "center" }}>
                Page {currentPage} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= pageCount || pageLoading}
                style={{
                  ...navButtonStyle,
                  opacity: currentPage >= pageCount || pageLoading ? 0.5 : 1,
                  cursor: currentPage >= pageCount || pageLoading ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              background: SECTION_GREY,
              border: "none",
              borderRadius: "8px",
              fontSize: "1rem",
              cursor: "pointer",
              color: MONUMENT,
              padding: "6px 12px",
              fontWeight: 600,
              marginLeft: "auto",
            }}
          >
            Close
          </button>
        </div>

        <p
          style={{
            margin: 0,
            padding: "10px 20px",
            fontSize: "0.9rem",
            color: UI.textMuted,
            lineHeight: 1.45,
            flexShrink: 0,
          }}
        >
          {wizardHelp}
          {wizardStep === WIZARD_TRACE && !activeLayer.saves
            ? ` ${activeLayer.label} is not saved yet — session only.`
            : ""}
          {wizardStep === WIZARD_PAGE && pageCount > 1 ? " Use page navigation for multi-page plans." : ""}
        </p>

        {loading && (
          <div style={{ padding: "24px", color: UI.textMuted, flex: 1 }}>Loading plan PDF…</div>
        )}
        {loadError && (
          <div style={{ padding: "20px", color: "#842029", background: "#fdecea", margin: "0 20px", borderRadius: "8px" }}>
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              margin: "0 20px",
              display: "flex",
              gap: "12px",
            }}
          >
            {showTraceUi && (
            <aside
              style={{
                width: "168px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                padding: "10px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                background: SECTION_GREY,
                position: "relative",
                zIndex: 2,
              }}
            >
              {TRACE_PLAN_GROUPS.map((group, groupIndex) => {
                const groupLayers = TRACE_PLAN_LAYERS.filter((l) => l.group === group.id);
                if (groupLayers.length === 0) return null;
                return (
                  <div
                    key={group.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      marginTop: groupIndex === 0 ? 0 : "16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        color: UI.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        marginBottom: "2px",
                      }}
                    >
                      {group.label}
                    </div>
                    {groupLayers.map((layer) => {
                      const trace = layerTraces[layer.id];
                      const isActive = layer.id === activeLayerId;
                      const hasTrace = hasLayerDraft(layer.id, trace);
                      const hasSubmenu = (layer.submenu?.length ?? 0) > 0;
                      const submenuOpen = openSubmenuLayerId === layer.id;
                      return (
                        <div key={layer.id} style={{ position: "relative" }}>
                          <button
                            type="button"
                            onClick={() => handleMenuItemClick(layer)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "6px",
                              border: isActive ? `2px solid ${layer.stroke}` : `1px solid ${UI.outline}`,
                              background: isActive ? WHITE : "transparent",
                              color: MONUMENT,
                              fontSize: "0.88rem",
                              fontWeight: isActive ? 600 : 500,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <span
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "3px",
                                background: layer.stroke,
                                flexShrink: 0,
                                opacity: hasTrace ? 1 : 0.45,
                              }}
                            />
                            <span style={{ lineHeight: 1.25, flex: 1 }}>{layer.label}</span>
                            {isActive && hasSubmenu && (layer.id === WINDOWS_LAYER_ID || layer.id === DOORS_LAYER_ID || layer.id === SLIDING_DOORS_LAYER_ID || layer.id === DECK_LAYER_ID) && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                  textTransform: "capitalize",
                                  color: layer.stroke,
                                }}
                              >
                                {layer.id === WINDOWS_LAYER_ID
                                  ? windowTool
                                  : layer.id === DOORS_LAYER_ID
                                    ? doorTool
                                    : layer.id === SLIDING_DOORS_LAYER_ID
                                      ? slidingDoorTool
                                      : deckTool}
                              </span>
                            )}
                            {hasSubmenu && (
                              <span
                                style={{
                                  fontSize: "0.9rem",
                                  color: UI.textMuted,
                                  transform: submenuOpen ? "rotate(90deg)" : "none",
                                  transition: "transform 0.12s ease",
                                }}
                              >
                                ›
                              </span>
                            )}
                          </button>

                          {hasSubmenu && submenuOpen && (
                            <div
                              style={{
                                position: "absolute",
                                left: "100%",
                                top: 0,
                                marginLeft: "8px",
                                minWidth: "120px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                padding: "6px",
                                borderRadius: "8px",
                                border: `1px solid ${UI.outline}`,
                                background: WHITE,
                                boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
                                zIndex: 30,
                              }}
                            >
                              {layer.submenu.map((item) => {
                                const itemActive =
                                  (layer.id === WINDOWS_LAYER_ID && windowTool === item.id) ||
                                  (layer.id === DOORS_LAYER_ID && doorTool === item.id) ||
                                  (layer.id === SLIDING_DOORS_LAYER_ID && slidingDoorTool === item.id) ||
                                  (layer.id === DECK_LAYER_ID && deckTool === item.id);
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleSubmenuAction(layer, item)}
                                    style={{
                                      width: "100%",
                                      padding: "7px 10px",
                                      borderRadius: "6px",
                                      border: "none",
                                      background: itemActive ? layer.stroke : "transparent",
                                      color: itemActive ? PAGE_TEXT : MONUMENT,
                                      fontSize: "0.86rem",
                                      fontWeight: itemActive ? 600 : 500,
                                      cursor: "pointer",
                                      textAlign: "left",
                                    }}
                                  >
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </aside>
            )}

            <div
              ref={containerRef}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                borderRadius: "8px",
                overflow: "hidden",
                border: `1px solid ${SECTION_GREY}`,
                cursor: canvasCursor,
                position: "relative",
                background: "#e8e8e8",
              }}
            >
              <canvas
                ref={canvasRef}
                width={viewportSize.width}
                height={viewportSize.height}
                style={{ display: "block", width: "100%", height: "100%" }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
                onContextMenu={(e) => e.preventDefault()}
              />
              {pageLoading && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255,255,255,0.65)",
                    color: MONUMENT,
                    fontSize: "0.95rem",
                    fontWeight: 500,
                  }}
                >
                  Loading page…
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            padding: "16px 20px",
            flexShrink: 0,
            borderTop: `1px solid ${SECTION_GREY}`,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem", color: UI.textMuted, flexWrap: "wrap" }}>
            <span>Zoom: {zoomPercent}%</span>
            <button type="button" onClick={resetZoom} style={navButtonStyle}>
              Reset zoom
            </button>
            {showTraceUi && (
              <>
                <button
                  type="button"
                  onClick={undoPoint}
                  disabled={!activeHasDraft}
                  style={{
                    ...navButtonStyle,
                    opacity: !activeHasDraft ? 0.5 : 1,
                    cursor: !activeHasDraft ? "not-allowed" : "pointer",
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={clearActiveLayerTrace}
                  disabled={!activeHasDraft}
                  style={{
                    ...navButtonStyle,
                    opacity: !activeHasDraft ? 0.5 : 1,
                    cursor: !activeHasDraft ? "not-allowed" : "pointer",
                  }}
                >
                  Clear
                </button>
              </>
            )}
            {showAreaUi && cropRectPx && (
              <button
                type="button"
                onClick={() => {
                  setCropRectPx(null);
                  setCropDraftEnd(null);
                }}
                style={navButtonStyle}
              >
                Clear area
              </button>
            )}
            {wizardStep !== WIZARD_PAGE && (
              <span style={{ marginLeft: 4 }}>Page {currentPage}</span>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            {wizardStep === WIZARD_PAGE && (
              <button
                type="button"
                onClick={confirmPageStep}
                disabled={pageLoading}
                style={{
                  background: !pageLoading ? MONUMENT : SECTION_GREY,
                  color: !pageLoading ? PAGE_TEXT : UI.textMuted,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: !pageLoading ? "pointer" : "not-allowed",
                }}
              >
                Continue to area
              </button>
            )}
            {wizardStep === WIZARD_AREA && (
              <>
                <button type="button" onClick={backToPageStep} style={navButtonStyle}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmAreaStep}
                  disabled={!cropRectPx || pageLoading}
                  style={{
                    background: cropRectPx && !pageLoading ? MONUMENT : SECTION_GREY,
                    color: cropRectPx && !pageLoading ? PAGE_TEXT : UI.textMuted,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: cropRectPx && !pageLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Continue to scale
                </button>
              </>
            )}
            {showCalibrateUi && (
              <>
                <button type="button" onClick={backToAreaStep} style={navButtonStyle}>
                  Edit area
                </button>
                {pdfPlanToggleButton}
                <button
                  type="button"
                  onClick={() => {
                    setCalibration(null);
                    clearCalibrationDraft();
                  }}
                  disabled={!calibration && !calibDraftStart}
                  style={{
                    ...navButtonStyle,
                    opacity: !calibration && !calibDraftStart ? 0.5 : 1,
                    cursor: !calibration && !calibDraftStart ? "not-allowed" : "pointer",
                  }}
                >
                  Clear scale
                </button>
                <button
                  type="button"
                  onClick={confirmCalibrateStep}
                  disabled={!calibration || pageLoading}
                  style={{
                    background: calibration && !pageLoading ? MONUMENT : SECTION_GREY,
                    color: calibration && !pageLoading ? PAGE_TEXT : UI.textMuted,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: calibration && !pageLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Continue to trace
                </button>
              </>
            )}
            {showTraceUi && (
              <>
                <button type="button" onClick={backToAreaStep} style={navButtonStyle}>
                  Edit area
                </button>
                {pdfPlanToggleButton}
                <button type="button" onClick={backToCalibrateStep} style={navButtonStyle}>
                  Edit scale
                </button>
                <button
                  type="button"
                  onClick={handleClearTrace}
                  disabled={!activeHasDraft || saving || pageLoading}
                  style={{
                    background: "transparent",
                    color: MONUMENT,
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor: !activeHasDraft || saving || pageLoading ? "not-allowed" : "pointer",
                    opacity: !activeHasDraft || saving || pageLoading ? 0.5 : 1,
                  }}
                >
                  Clear trace
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndContinue}
                  disabled={!externalTrace.polygonClosed || saving || pageLoading || !cropRectPx}
                  style={{
                    background:
                      externalTrace.polygonClosed && !saving && !pageLoading && cropRectPx
                        ? MONUMENT
                        : SECTION_GREY,
                    color:
                      externalTrace.polygonClosed && !saving && !pageLoading && cropRectPx
                        ? PAGE_TEXT
                        : UI.textMuted,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 600,
                    cursor:
                      externalTrace.polygonClosed && !saving && !pageLoading && cropRectPx
                        ? "pointer"
                        : "not-allowed",
                  }}
                >
                  {saving ? "Saving…" : "Save and Continue"}
                </button>
              </>
            )}
          </div>
        </div>

        {pendingCalibLine && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 5,
            }}
            onClick={cancelCalibrationLength}
          >
            <div
              style={{
                background: WHITE,
                borderRadius: "12px",
                padding: "24px",
                width: "min(420px, 90%)",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 8px", color: MONUMENT, fontSize: "1.15rem" }}>
                Length of this line
              </h3>
              <p style={{ margin: "0 0 16px", color: UI.textMuted, fontSize: "0.9rem" }}>
                Enter the real-world length that the line you drew represents.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitCalibrationLength();
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    autoFocus
                    value={lengthInput}
                    onChange={(e) => setLengthInput(e.target.value)}
                    placeholder="e.g. 11.3"
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      fontSize: "1rem",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                    }}
                  />
                  <span style={{ color: MONUMENT, fontWeight: 600 }}>metres</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                    marginTop: "20px",
                  }}
                >
                  <button type="button" onClick={cancelCalibrationLength} style={navButtonStyle}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      background: MONUMENT,
                      color: PAGE_TEXT,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Set scale
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {heightPickerIndex >= 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0, 0, 0, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 5,
            }}
            onClick={() => setHeightPickerIndex(-1)}
          >
            <div
              style={{
                background: WHITE,
                borderRadius: "12px",
                padding: "24px",
                width: "min(360px, 90%)",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 8px", color: MONUMENT, fontSize: "1.15rem" }}>
                Window height
              </h3>
              <p style={{ margin: "0 0 16px", color: UI.textMuted, fontSize: "0.9rem" }}>
                Choose the height for this window. The head stays fixed; the sill moves.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <select
                  autoFocus
                  value={
                    layerTraces[WINDOWS_LAYER_ID]?.windows?.[heightPickerIndex]?.heightM ??
                    DEFAULT_WINDOW_HEIGHT_M
                  }
                  onChange={(e) => {
                    setWindowHeightAt(heightPickerIndex, parseFloat(e.target.value));
                    setHeightPickerIndex(-1);
                  }}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: "1rem",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    background: WHITE,
                    color: MONUMENT,
                  }}
                >
                  {WINDOW_HEIGHT_INCREMENTS_M.map((h) => (
                    <option key={h} value={h}>
                      {Math.round(h * 1000)} mm
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "20px",
                }}
              >
                <button type="button" onClick={() => setHeightPickerIndex(-1)} style={navButtonStyle}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
