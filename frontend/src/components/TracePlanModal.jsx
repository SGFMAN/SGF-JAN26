import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fitScale,
  loadPdfDocumentFromUrl,
  renderPdfDocumentPage,
} from "../utils/floorPlanCrop";
import {
  createEmptyLayerTraces,
  denormalizeTracePoints,
  denormalizeTraceSegments,
  EXTERNAL_WALLS_LAYER_ID,
  hasLayerDraft,
  INTERNAL_WALLS_LAYER_ID,
  isLineTraceLayer,
  MAX_TRACE_POINTS,
  normalizeTracePoints,
  normalizeTraceSegments,
  parsePlanTracePolygon,
  TRACE_PLAN_LAYERS,
} from "../utils/planTracePolygon";
import {
  finalizeInternalWallSegment,
  externalWallInnerBoundarySource,
  buildInternalWallVisibleOutlines,
  internalWallHalfThicknessSource,
  internalWallSegmentSourceFootprintForRender,
} from "../utils/tracePlanInternalWalls";
import { resolveInternalWallDrawSnap } from "../utils/tracePlanInternalWallSnap";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const CLOSE_SNAP_PX = 14;
const NODE_HIT_PX = 12;
const LINE_HIT_PX = 10;
const MERGE_SNAP_PX = 14;
const WALL_SNAP_PX = 16;
const WALL_NODE_COINCIDE_PX = 0.75;

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
  const [activeLayerId, setActiveLayerId] = useState(EXTERNAL_WALLS_LAYER_ID);
  const [layerTraces, setLayerTraces] = useState(createEmptyLayerTraces);
  const [nearOrigin, setNearOrigin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewTick, setViewTick] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState(-1);
  const [draggingNodeIndex, setDraggingNodeIndex] = useState(-1);
  const [snapMergeTargetIndex, setSnapMergeTargetIndex] = useState(-1);
  const [linePreviewPoint, setLinePreviewPoint] = useState(null);
  const [hoveredWallNode, setHoveredWallNode] = useState(null);
  const [draggingWallNode, setDraggingWallNode] = useState(null);

  const activeLayer = TRACE_PLAN_LAYERS.find((layer) => layer.id === activeLayerId) || TRACE_PLAN_LAYERS[0];
  const isLineLayerActive = isLineTraceLayer(activeLayerId);
  const activeTrace =
    layerTraces[activeLayerId] ||
    (isLineTraceLayer(activeLayerId)
      ? { segments: [], draftStart: null }
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

  function selectLayer(layerId) {
    if (layerId === activeLayerId) return;
    if (layerId === INTERNAL_WALLS_LAYER_ID) {
      const ext = layerTraces[EXTERNAL_WALLS_LAYER_ID];
      if (!ext?.polygonClosed || (ext.points?.length ?? 0) < 3) {
        alert("Trace and close External Walls before drawing internal walls.");
        return;
      }
    }
    interactionRef.current = null;
    setNearOrigin(false);
    setHoveredNodeIndex(-1);
    setDraggingNodeIndex(-1);
    setSnapMergeTargetIndex(-1);
    setLinePreviewPoint(null);
    setHoveredWallNode(null);
    setDraggingWallNode(null);
    setActiveLayerId(layerId);
  }

  function getExternalInnerBoundary() {
    if (!externalTrace.polygonClosed || externalTrace.points.length < 3) return null;
    return externalWallInnerBoundarySource(externalTrace.points);
  }

  function resetView(source, width, height) {
    const baseFit = fitScale(source.width, source.height, width, height);
    const zoom = 1;
    const panX = (width - source.width * baseFit * zoom) / 2;
    const panY = (height - source.height * baseFit * zoom) / 2;
    viewRef.current = { zoom, panX, panY, baseFit };
  }

  function viewScale() {
    const { baseFit, zoom } = viewRef.current;
    return baseFit * zoom;
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
    const imgW = source.width * scale;
    const imgH = source.height * scale;
    const view = viewRef.current;

    if (imgW <= width) {
      view.panX = (width - imgW) / 2;
    } else {
      const minPan = width - imgW;
      view.panX = Math.min(0, Math.max(minPan, view.panX));
    }

    if (imgH <= height) {
      view.panY = (height - imgH) / 2;
    } else {
      const minPan = height - imgH;
      view.panY = Math.min(0, Math.max(minPan, view.panY));
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setLayerTraces(createEmptyLayerTraces());
    setActiveLayerId(EXTERNAL_WALLS_LAYER_ID);

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
        const initialPage = Math.min(Math.max(1, saved.page || 1), totalPages);
        setCurrentPage(initialPage);

        const sourceCanvas = await renderPdfDocumentPage(doc, initialPage);
        if (cancelled) return;
        sourceCanvasRef.current = sourceCanvas;

        const { width, height } = viewportSize;
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
  }, [viewportSize.width, viewportSize.height, loading, bumpView]);

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
    ctx.drawImage(source, 0, 0);

    const markerRadius = 6 / scale;

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
        const halfT = internalWallHalfThicknessSource(outerPoints);
        ctx.fillStyle = layer.fillClosed;
        ctx.globalAlpha = isActive ? 1 : 0.72;

        segments.forEach((seg, segmentIndex) => {
          const footprint = internalWallSegmentSourceFootprintForRender(
            seg,
            segmentIndex,
            segments,
            outerPoints
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

      if (!trace.points?.length) return;

      const closed = trace.polygonClosed;
      const layerPoints = trace.points;

      ctx.strokeStyle = layer.stroke;
      ctx.fillStyle = closed ? layer.fillClosed : layer.fillOpen;
      ctx.lineWidth = (isActive ? 2 : 1.5) / scale;
      ctx.globalAlpha = isActive ? 1 : 0.72;
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
    });

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
    externalTrace.polygonClosed,
    externalTrace.points,
    hoveredWallNode,
    draggingWallNode,
    viewTick,
  ]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, pageLoading, layerTraces, activeLayerId, nearOrigin, redraw, viewTick, linePreviewPoint]);

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
        nextSegments.push(...finalizeInternalWallSegment(seg.a, seg.b, outerPoints));
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
    return {
      x: Math.max(0, Math.min(source.width, pt.x)),
      y: Math.max(0, Math.min(source.height, pt.y)),
    };
  }

  function internalWallSnapThresholdSource(outerPoints) {
    const halfT = internalWallHalfThicknessSource(outerPoints) ?? 4;
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
        next[nodeIndex] = clampSourcePoint(screenToSource(screenX, screenY));
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

      const snap = resolveInternalWallDrawSnap(start, rawEnd, segments, outerPoints, {
        threshold: internalWallSnapThresholdSource(outerPoints),
      });
      const end = clampSourcePoint(snap.point);

      const parts = finalizeInternalWallSegment(start, end, outerPoints);
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
    if (isLineLayerActive) return;
    if (polygonClosed || pageLoading) return;
    const source = sourceCanvasRef.current;
    if (!source) return;

    if (points.length >= 3 && isNearOrigin(screenX, screenY)) {
      patchActiveTrace({ polygonClosed: true });
      setNearOrigin(false);
      return;
    }

    if (points.length >= MAX_TRACE_POINTS) {
      alert(`Maximum ${MAX_TRACE_POINTS} points allowed. Click the origin to finish.`);
      return;
    }

    const pt = screenToSource(screenX, screenY);
    if (pt.x < 0 || pt.y < 0 || pt.x > source.width || pt.y > source.height) return;
    setActivePoints((prev) => [...prev, pt]);
    setNearOrigin(false);
  }

  function onMouseDown(event) {
    if (loading || loadError || pageLoading) return;
    const pt = canvasCoords(event);
    if (!pt) return;

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
      if (isLineLayerActive) {
        if (internalWallDraftRef.current) {
          const segments = layerTraces[INTERNAL_WALLS_LAYER_ID]?.segments ?? [];
          const outerPoints = externalTrace.points;
          const raw = clampSourcePoint(screenToSource(pt.x, pt.y));
          const snapped = resolveSnapForInternalWall(
            internalWallDraftRef.current,
            raw,
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
      } else if (points.length >= 2) {
        updateNearOrigin(pt.x, pt.y);
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
      if (!polygonClosed && points.length >= 2) {
        updateNearOrigin(pt.x, pt.y);
      }
    }
  }

  function onMouseUp(event) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction || loading || loadError || pageLoading) return;

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
        return;
      }
      if (interaction.type === "insertOrIdle" && !interaction.moved && event.button === 0) {
        const segment = findSegmentAtScreen(interaction.startX, interaction.startY);
        if (segment) insertNodeOnSegment(segment);
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
    setHoveredWallNode(null);
    setDraggingWallNode(null);
    internalWallSnapHintRef.current = null;
  }

  function undoPoint() {
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
  }

  function clearActiveLayerTrace() {
    if (isLineLayerActive) {
      internalWallDraftRef.current = null;
      patchLayerTrace(activeLayerId, { segments: [], draftStart: null });
      setLinePreviewPoint(null);
      return;
    }
    patchActiveTrace({ points: [], polygonClosed: false });
    setNearOrigin(false);
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
      if (layer.id === INTERNAL_WALLS_LAYER_ID && source) {
        if (saved.page !== currentPage) return true;
        const normalized = normalizeTraceSegments(trace.segments ?? [], source.width, source.height);
        return JSON.stringify(normalized) !== JSON.stringify(saved.internalWallSegments ?? []);
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

  async function goToPage(nextPage) {
    const target = Math.min(Math.max(1, nextPage), pageCount);
    if (target === currentPage) return;

    if (hasUnsavedPageTraces()) {
      const proceed = window.confirm(
        "Changing page will clear traces on this page. Continue?"
      );
      if (!proceed) return;
    }

    setCurrentPage(target);
    await loadPage(target);
  }

  async function handleSaveAndContinue() {
    const external = layerTraces[EXTERNAL_WALLS_LAYER_ID];
    if (!external.polygonClosed || external.points.length < 3) {
      alert("Close the External Walls polygon by clicking the origin point first.");
      return;
    }
    const source = sourceCanvasRef.current;
    if (!source) return;

    setSaving(true);
    try {
      const normalized = normalizeTracePoints(external.points, source.width, source.height);
      const internal = layerTraces[INTERNAL_WALLS_LAYER_ID];
      const normalizedInternal = normalizeTraceSegments(internal?.segments ?? [], source.width, source.height);
      await onSave(normalized, currentPage, normalizedInternal);
      savedTraceRef.current = {
        page: currentPage,
        points: normalized,
        internalWallSegments: normalizedInternal,
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
          <h2 style={{ margin: 0, fontSize: "1.35rem", color: MONUMENT }}>Trace Plan</h2>

          {pageCount > 1 && !loading && !loadError && (
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
          {isLineLayerActive
            ? "Click once for each end of a wall line — single segments only, trimmed to the inside edge of external walls. Drag nodes to adjust walls. Other layers are hidden while drawing internal walls. Scroll to zoom, shift+drag to pan."
            : `Select a layer from the menu, then click to place corners (max ${MAX_TRACE_POINTS} points). Scroll to zoom, shift+drag to pan. Click the green origin to close the shape.${
                polygonClosed
                  ? " Drag nodes to move them, drop onto another node to merge, or click a line to add a node."
                  : ""
              }`}
          {!activeLayer.saves
            ? ` ${activeLayer.label} is not saved yet — session only.`
            : ""}
          {pageCount > 1 ? " Use page navigation for multi-page plans." : ""}
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
                style={{ display: "block" }}
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
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: UI.textMuted,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: "4px",
                }}
              >
                Trace layers
              </div>
              {TRACE_PLAN_LAYERS.map((layer) => {
                const trace = layerTraces[layer.id];
                const isActive = layer.id === activeLayerId;
                const hasTrace = hasLayerDraft(layer.id, trace);
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => selectLayer(layer.id)}
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
                    <span style={{ lineHeight: 1.25 }}>{layer.label}</span>
                  </button>
                );
              })}
            </aside>
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
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
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
              disabled={!externalTrace.polygonClosed || saving || pageLoading}
              style={{
                background: externalTrace.polygonClosed && !saving && !pageLoading ? MONUMENT : SECTION_GREY,
                color: externalTrace.polygonClosed && !saving && !pageLoading ? PAGE_TEXT : UI.textMuted,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: externalTrace.polygonClosed && !saving && !pageLoading ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Saving…" : "Save and Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
