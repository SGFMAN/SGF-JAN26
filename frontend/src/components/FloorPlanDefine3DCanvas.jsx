import { useCallback, useEffect, useRef, useState } from "react";
import { getApiHeaders } from "../utils/auth";
import { loadFloorPlanSourceCanvas } from "../utils/floorPlanCrop";
import {
  clampImagePoint,
  closeThresholdImagePx,
  findExternalWallNodeHit,
  findExternalWallPolygonHit,
  findInternalWallNodeHit,
  findInternalWallSegmentHit,
  fitImageInViewport,
  isNearPoint,
  orthogonalSnap,
  screenToImagePoint,
} from "../utils/floorPlanDefine3dDraw";

const EXTERNAL_WALLS_STROKE = "#eab308";
const INTERNAL_WALLS_STROKE = "#22c55e";
const WALL_LINE_WIDTH = 5;
const NODE_RADIUS_SCREEN_PX = 7;

async function loadPlanSourceCanvas(plan) {
  if (!plan?.imageUrl) throw new Error("No floor plan image");
  const res = await fetch(plan.imageUrl, {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error("Could not load floor plan image");
  const blob = await res.blob();
  const file = new File([blob], "floor-plan", { type: blob.type || "image/png" });
  return loadFloorPlanSourceCanvas(file);
}

export default function FloorPlanDefine3DCanvas({
  plan,
  drawTool = null,
  externalWallPolygons = [],
  onExternalWallPolygonsChange,
  internalWallSegments = [],
  onInternalWallSegmentsChange,
  onImageSize,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const sourceRef = useRef(null);
  const viewRef = useRef({ baseFit: 1, panX: 0, panY: 0, zoom: 1 });
  const interactionRef = useRef(null);

  const externalWallPolygonsRef = useRef(externalWallPolygons);
  const internalWallSegmentsRef = useRef(internalWallSegments);
  const onExternalChangeRef = useRef(onExternalWallPolygonsChange);
  const onInternalChangeRef = useRef(onInternalWallSegmentsChange);
  const mouseHandlersRef = useRef({});

  externalWallPolygonsRef.current = externalWallPolygons;
  internalWallSegmentsRef.current = internalWallSegments;
  onExternalChangeRef.current = onExternalWallPolygonsChange;
  onInternalChangeRef.current = onInternalWallSegmentsChange;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [draftPoints, setDraftPoints] = useState([]);
  const [hoverImagePoint, setHoverImagePoint] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [viewTick, setViewTick] = useState(0);

  const isExternalWalls = drawTool === "external-walls";
  const isInternalWalls = drawTool === "internal-walls";
  const drawingActive = isExternalWalls || isInternalWalls;
  const bumpView = useCallback(() => setViewTick((n) => n + 1), []);

  const layoutCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!container || !canvas || !source) return;

    const width = Math.max(1, Math.floor(container.clientWidth));
    const height = Math.max(1, Math.floor(container.clientHeight));
    canvas.width = width;
    canvas.height = height;

    const fit = fitImageInViewport(source.width, source.height, width, height);
    viewRef.current = { ...fit, zoom: 1 };
    bumpView();
  }, [bumpView]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDraftPoints([]);
    setHoverImagePoint(null);
    setHoverNode(null);
    sourceRef.current = null;

    (async () => {
      try {
        const source = await loadPlanSourceCanvas(plan);
        if (cancelled) return;
        sourceRef.current = source;
        onImageSize?.({ width: source.width, height: source.height });
        layoutCanvas();
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load floor plan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plan?.id, plan?.imageUrl, layoutCanvas]);

  useEffect(() => {
    setDraftPoints([]);
    setHoverImagePoint(null);
    setHoverNode(null);
    setDraggingNode(null);
    interactionRef.current = null;
  }, [drawTool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(() => layoutCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [layoutCanvas]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const view = viewRef.current;
    const scale = view.baseFit * view.zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(scale, 0, 0, scale, view.panX, view.panY);
    ctx.drawImage(source, 0, 0);

    function strokeLine(points, stroke, dashed = false) {
      if (!points?.length) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = WALL_LINE_WIDTH / scale;
      if (dashed) ctx.setLineDash([5 / scale, 4 / scale]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawPolygon(points, { closed, stroke, dashed = false }) {
      if (!points?.length) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (closed && points.length >= 3) {
        ctx.closePath();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = WALL_LINE_WIDTH / scale;
      if (dashed) ctx.setLineDash([6 / scale, 4 / scale]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawNode(p, fill, highlighted = false) {
      const radius = (highlighted ? NODE_RADIUS_SCREEN_PX + 2 : NODE_RADIUS_SCREEN_PX) / scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    }

    for (const polygon of externalWallPolygons) {
      drawPolygon(polygon, { closed: true, stroke: EXTERNAL_WALLS_STROKE });
    }

    for (const segment of internalWallSegments) {
      if (segment?.length === 2) {
        strokeLine(segment, INTERNAL_WALLS_STROKE);
      }
    }

    if (isExternalWalls) {
      externalWallPolygons.forEach((polygon, polygonIndex) => {
        polygon.forEach((p, vertexIndex) => {
          const highlighted =
            (hoverNode?.kind === "external" &&
              hoverNode.polygonIndex === polygonIndex &&
              hoverNode.vertexIndex === vertexIndex) ||
            (draggingNode?.kind === "external" &&
              draggingNode.polygonIndex === polygonIndex &&
              draggingNode.vertexIndex === vertexIndex);
          drawNode(p, EXTERNAL_WALLS_STROKE, highlighted);
        });
      });
    }

    if (isInternalWalls) {
      internalWallSegments.forEach((segment, segmentIndex) => {
        if (segment?.length !== 2) return;
        segment.forEach((p, endIndex) => {
          const highlighted =
            (hoverNode?.kind === "internal" &&
              hoverNode.segmentIndex === segmentIndex &&
              hoverNode.endIndex === endIndex) ||
            (draggingNode?.kind === "internal" &&
              draggingNode.segmentIndex === segmentIndex &&
              draggingNode.endIndex === endIndex);
          drawNode(p, INTERNAL_WALLS_STROKE, highlighted);
        });
      });
    }

    if (isExternalWalls && draftPoints.length > 0) {
      drawPolygon(draftPoints, { closed: false, stroke: EXTERNAL_WALLS_STROKE });
      if (hoverImagePoint && !interactionRef.current) {
        const last = draftPoints[draftPoints.length - 1];
        const preview =
          draftPoints.length >= 3 &&
          isNearPoint(hoverImagePoint, draftPoints[0], closeThresholdImagePx(view))
            ? draftPoints[0]
            : orthogonalSnap(last, hoverImagePoint);
        strokeLine([last, preview], EXTERNAL_WALLS_STROKE, true);
      }

      draftPoints.forEach((p, i) => {
        drawNode(p, i === 0 ? "#16a34a" : EXTERNAL_WALLS_STROKE);
      });
    }

    if (isInternalWalls && draftPoints.length === 1 && hoverImagePoint && !interactionRef.current) {
      const start = draftPoints[0];
      const preview = orthogonalSnap(start, hoverImagePoint);
      strokeLine([start, preview], INTERNAL_WALLS_STROKE, true);
      drawNode(start, INTERNAL_WALLS_STROKE);
    }
  }, [
    draftPoints,
    externalWallPolygons,
    internalWallSegments,
    hoverImagePoint,
    hoverNode,
    draggingNode,
    isExternalWalls,
    isInternalWalls,
    viewTick,
  ]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, redraw]);

  function canvasCoords(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function imagePointFromEvent(event) {
    const source = sourceRef.current;
    const screen = canvasCoords(event);
    if (!source || !screen) return null;
    const raw = screenToImagePoint(screen.x, screen.y, viewRef.current);
    return clampImagePoint(raw, source.width, source.height);
  }

  function updateHoveredNode(imagePt) {
    if (!imagePt || !drawingActive) {
      setHoverNode(null);
      return;
    }
    const view = viewRef.current;
    if (isExternalWalls) {
      const hit = findExternalWallNodeHit(imagePt, externalWallPolygonsRef.current, view);
      setHoverNode(hit ? { kind: "external", ...hit } : null);
      return;
    }
    if (isInternalWalls) {
      const hit = findInternalWallNodeHit(imagePt, internalWallSegmentsRef.current, view);
      setHoverNode(hit ? { kind: "internal", ...hit } : null);
    }
  }

  function moveExternalNode(polygonIndex, vertexIndex, imagePt) {
    onExternalChangeRef.current?.((polygons) =>
      polygons.map((polygon, pi) => {
        if (pi !== polygonIndex) return polygon;
        return polygon.map((point, vi) => (vi === vertexIndex ? { ...imagePt } : point));
      })
    );
  }

  function moveInternalNode(segmentIndex, endIndex, imagePt) {
    onInternalChangeRef.current?.((segments) =>
      segments.map((segment, si) => {
        if (si !== segmentIndex) return segment;
        const next = [...segment];
        next[endIndex] = { ...imagePt };
        return next;
      })
    );
  }

  function commitClick(imagePt) {
    if (isInternalWalls) {
      setDraftPoints((prev) => {
        if (prev.length === 0) {
          return [imagePt];
        }
        const start = prev[0];
        const end = orthogonalSnap(start, imagePt);
        if (Math.hypot(end.x - start.x, end.y - start.y) < 1) {
          return prev;
        }
        onInternalChangeRef.current?.((existing) => [...existing, [start, end]]);
        return [];
      });
      return;
    }

    if (isExternalWalls) {
      setDraftPoints((prev) => {
        if (prev.length === 0) {
          return [imagePt];
        }

        const last = prev[prev.length - 1];
        const next = orthogonalSnap(last, imagePt);

        if (prev.length >= 3 && isNearPoint(next, prev[0], closeThresholdImagePx(viewRef.current))) {
          onExternalChangeRef.current?.((existing) => [...existing, [...prev]]);
          return [];
        }

        if (Math.hypot(next.x - last.x, next.y - last.y) < 1) {
          return prev;
        }

        return [...prev, next];
      });
    }
  }

  function onContextMenu(event) {
    if (!drawingActive || loading || loadError) return;
    event.preventDefault();

    const imagePt = imagePointFromEvent(event);
    if (!imagePt) return;

    const view = viewRef.current;

    if (isExternalWalls) {
      const polygonIndex = findExternalWallPolygonHit(
        imagePt,
        externalWallPolygonsRef.current,
        view
      );
      if (polygonIndex === null) return;

      onExternalChangeRef.current?.((polygons) =>
        polygons.filter((_, index) => index !== polygonIndex)
      );
      setHoverNode(null);
      bumpView();
      return;
    }

    if (isInternalWalls) {
      const segmentIndex = findInternalWallSegmentHit(
        imagePt,
        internalWallSegmentsRef.current,
        view
      );
      if (segmentIndex === null) return;

      onInternalChangeRef.current?.((segments) =>
        segments.filter((_, index) => index !== segmentIndex)
      );
      setHoverNode(null);
      bumpView();
    }
  }

  function onMouseDown(event) {
    if (!drawingActive || loading || loadError || event.button !== 0) return;
    const source = sourceRef.current;
    const imagePt = imagePointFromEvent(event);
    if (!source || !imagePt) return;

    const view = viewRef.current;
    const screen = canvasCoords(event);

    if (isExternalWalls) {
      const hit = findExternalWallNodeHit(imagePt, externalWallPolygonsRef.current, view);
      if (hit) {
        event.preventDefault();
        interactionRef.current = { type: "drag-external", ...hit };
        setDraggingNode({ kind: "external", ...hit });
        setHoverNode({ kind: "external", ...hit });
        return;
      }
    }

    if (isInternalWalls) {
      const hit = findInternalWallNodeHit(imagePt, internalWallSegmentsRef.current, view);
      if (hit) {
        event.preventDefault();
        interactionRef.current = { type: "drag-internal", ...hit };
        setDraggingNode({ kind: "internal", ...hit });
        setHoverNode({ kind: "internal", ...hit });
        return;
      }
    }

    interactionRef.current = {
      type: "click",
      startScreenX: screen.x,
      startScreenY: screen.y,
      imagePt,
    };
  }

  function onMouseMove(event) {
    if (!drawingActive || loading || loadError) return;
    const source = sourceRef.current;
    const imagePt = imagePointFromEvent(event);
    if (!source || !imagePt) return;

    const interaction = interactionRef.current;

    if (interaction?.type === "drag-external") {
      moveExternalNode(interaction.polygonIndex, interaction.vertexIndex, imagePt);
      setHoverNode({
        kind: "external",
        polygonIndex: interaction.polygonIndex,
        vertexIndex: interaction.vertexIndex,
      });
      bumpView();
      return;
    }

    if (interaction?.type === "drag-internal") {
      moveInternalNode(interaction.segmentIndex, interaction.endIndex, imagePt);
      setHoverNode({
        kind: "internal",
        segmentIndex: interaction.segmentIndex,
        endIndex: interaction.endIndex,
      });
      bumpView();
      return;
    }

    if (!interaction) {
      setHoverImagePoint(imagePt);
      updateHoveredNode(imagePt);
      bumpView();
    }
  }

  function onMouseUp(event) {
    if (!drawingActive || loading || loadError) return;

    const interaction = interactionRef.current;
    interactionRef.current = null;

    if (interaction?.type === "drag-external" || interaction?.type === "drag-internal") {
      setDraggingNode(null);
      bumpView();
      return;
    }

    if (interaction?.type === "click" && event.button === 0) {
      const screen = canvasCoords(event);
      if (!screen) return;
      const moved = Math.hypot(screen.x - interaction.startScreenX, screen.y - interaction.startScreenY);
      if (moved > 4) return;

      const imagePt = imagePointFromEvent(event);
      if (!imagePt) return;

      const view = viewRef.current;
      if (isExternalWalls && findExternalWallNodeHit(imagePt, externalWallPolygonsRef.current, view)) {
        return;
      }
      if (isInternalWalls && findInternalWallNodeHit(imagePt, internalWallSegmentsRef.current, view)) {
        return;
      }

      commitClick(imagePt);
      setHoverImagePoint(null);
      bumpView();
    }
  }

  function onMouseLeave() {
    if (interactionRef.current?.type?.startsWith("drag-")) return;
    setHoverImagePoint(null);
    setHoverNode(null);
    bumpView();
  }

  useEffect(() => {
    if (!drawingActive || !draggingNode) return undefined;

    function onWindowMouseMove(event) {
      mouseHandlersRef.current.onMouseMove?.(event);
    }

    function onWindowMouseUp(event) {
      mouseHandlersRef.current.onMouseUp?.(event);
    }

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [drawingActive, draggingNode]);

  mouseHandlersRef.current = { onMouseMove, onMouseUp };

  useEffect(() => {
    if (!drawingActive) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setDraftPoints([]);
        setHoverImagePoint(null);
        interactionRef.current = null;
        bumpView();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (isInternalWalls) {
          setDraftPoints((prev) => {
            if (prev.length > 0) return [];
            onInternalChangeRef.current?.((existing) => existing.slice(0, -1));
            return [];
          });
        } else {
          setDraftPoints((prev) => prev.slice(0, -1));
        }
        bumpView();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawingActive, isInternalWalls, bumpView]);

  const cursor = (() => {
    if (!drawingActive) return "default";
    if (draggingNode) return "grabbing";
    if (hoverNode) return "grab";
    return "crosshair";
  })();

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
            fontSize: "0.9rem",
          }}
        >
          Loading floor plan…
        </div>
      )}
      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#842029",
            fontSize: "0.9rem",
            padding: "16px",
            textAlign: "center",
          }}
        >
          {loadError}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: loading || loadError ? "none" : "block",
          cursor,
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
      />
    </div>
  );
}
