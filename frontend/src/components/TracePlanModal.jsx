import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fitScale,
  loadPdfDocumentFromUrl,
  renderPdfDocumentPage,
} from "../utils/floorPlanCrop";
import {
  denormalizeTracePoints,
  MAX_TRACE_POINTS,
  normalizeTracePoints,
  parsePlanTracePolygon,
} from "../utils/planTracePolygon";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const CLOSE_SNAP_PX = 14;

function hasDraftTrace(points, polygonClosed) {
  return points.length > 0 || polygonClosed;
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

  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [points, setPoints] = useState([]);
  const [polygonClosed, setPolygonClosed] = useState(false);
  const [nearOrigin, setNearOrigin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewTick, setViewTick] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  const bumpView = useCallback(() => setViewTick((n) => n + 1), []);

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

  function applySavedTraceForPage(pageNumber, sourceCanvas) {
    const saved = savedTraceRef.current;
    if (saved.page === pageNumber && saved.points.length >= 3) {
      const restored = denormalizeTracePoints(
        saved.points,
        sourceCanvas.width,
        sourceCanvas.height
      );
      setPoints(restored);
      setPolygonClosed(true);
      return;
    }
    setPoints([]);
    setPolygonClosed(false);
    setNearOrigin(false);
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
          applySavedTraceForPage(pageNumber, sourceCanvas);
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
    setPoints([]);
    setPolygonClosed(false);

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
        applySavedTraceForPage(initialPage, sourceCanvas);
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

    if (points.length > 0) {
      ctx.strokeStyle = "#dc2626";
      ctx.fillStyle = polygonClosed ? "rgba(220, 38, 38, 0.2)" : "rgba(220, 38, 38, 0.1)";
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (polygonClosed && points.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      const markerRadius = 6 / scale;
      const originHighlight =
        nearOrigin && !polygonClosed && points.length >= 2 ? 10 / scale : markerRadius;
      points.forEach((p, i) => {
        const isOrigin = i === 0;
        const radius = isOrigin ? originHighlight : markerRadius;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        if (isOrigin && nearOrigin && !polygonClosed && points.length >= 2) {
          ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
          ctx.strokeStyle = "#16a34a";
          ctx.lineWidth = 3 / scale;
        } else {
          ctx.fillStyle = isOrigin ? "#16a34a" : "#dc2626";
          ctx.strokeStyle = WHITE;
          ctx.lineWidth = 2 / scale;
        }
        ctx.fill();
        ctx.stroke();
      });
    }
  }, [points, polygonClosed, nearOrigin, viewTick]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, pageLoading, points, polygonClosed, nearOrigin, redraw, viewTick]);

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

  function updateNearOrigin(screenX, screenY) {
    const next = isNearOrigin(screenX, screenY);
    setNearOrigin((prev) => (prev === next ? prev : next));
  }

  function addPointAtScreen(screenX, screenY) {
    if (polygonClosed || pageLoading) return;
    const source = sourceCanvasRef.current;
    if (!source) return;

    if (points.length >= 3 && isNearOrigin(screenX, screenY)) {
      setPolygonClosed(true);
      setNearOrigin(false);
      return;
    }

    if (points.length >= MAX_TRACE_POINTS) {
      alert(`Maximum ${MAX_TRACE_POINTS} points allowed. Click the origin to finish.`);
      return;
    }

    const pt = screenToSource(screenX, screenY);
    if (pt.x < 0 || pt.y < 0 || pt.x > source.width || pt.y > source.height) return;
    setPoints((prev) => [...prev, pt]);
    setNearOrigin(false);
  }

  function onMouseDown(event) {
    if (loading || loadError || pageLoading || polygonClosed) return;
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
      if (!polygonClosed && points.length >= 2) {
        updateNearOrigin(pt.x, pt.y);
      }
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
    if (!interaction || loading || loadError || pageLoading || polygonClosed) return;

    if (interaction.type === "point" && !interaction.moved && event.button === 0) {
      addPointAtScreen(interaction.startX, interaction.startY);
    }
  }

  function onMouseLeave() {
    interactionRef.current = null;
    setNearOrigin(false);
  }

  function undoPoint() {
    if (polygonClosed) {
      setPolygonClosed(false);
      return;
    }
    setPoints((prev) => prev.slice(0, -1));
    setNearOrigin(false);
  }

  function clearPoints() {
    setPoints([]);
    setPolygonClosed(false);
    setNearOrigin(false);
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

    if (hasDraftTrace(points, polygonClosed)) {
      const saved = savedTraceRef.current;
      const isSavedDraft =
        saved.page === currentPage &&
        saved.points.length >= 3 &&
        polygonClosed;
      if (!isSavedDraft) {
        const proceed = window.confirm(
          "Changing page will clear the current trace on this page. Continue?"
        );
        if (!proceed) return;
      }
    }

    setCurrentPage(target);
    await loadPage(target);
  }

  async function handleSaveAndContinue() {
    if (!polygonClosed || points.length < 3) {
      alert("Close the polygon by clicking the origin point first.");
      return;
    }
    const source = sourceCanvasRef.current;
    if (!source) return;

    setSaving(true);
    try {
      const normalized = normalizeTracePoints(points, source.width, source.height);
      await onSave(normalized, currentPage);
      onClose();
    } catch (err) {
      alert(err.message || "Failed to save trace");
    } finally {
      setSaving(false);
    }
  }

  const zoomPercent = Math.round(viewRef.current.zoom * 100);
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
          Click to place corners around the floor plan (max {MAX_TRACE_POINTS} points). Scroll to zoom.
          Shift+drag to pan. Click the green origin point to close the polygon.
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
            ref={containerRef}
            style={{
              flex: 1,
              minHeight: 0,
              margin: "0 20px",
              borderRadius: "8px",
              overflow: "hidden",
              border: `1px solid ${SECTION_GREY}`,
              cursor: polygonClosed || pageLoading ? "default" : "crosshair",
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
              disabled={points.length === 0 && !polygonClosed}
              style={{
                ...navButtonStyle,
                opacity: points.length === 0 && !polygonClosed ? 0.5 : 1,
                cursor: points.length === 0 && !polygonClosed ? "not-allowed" : "pointer",
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={clearPoints}
              disabled={points.length === 0}
              style={{
                ...navButtonStyle,
                opacity: points.length === 0 ? 0.5 : 1,
                cursor: points.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Clear
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveAndContinue}
            disabled={!polygonClosed || saving || pageLoading}
            style={{
              background: polygonClosed && !saving && !pageLoading ? MONUMENT : SECTION_GREY,
              color: polygonClosed && !saving && !pageLoading ? PAGE_TEXT : UI.textMuted,
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: polygonClosed && !saving && !pageLoading ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : "Save and Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
