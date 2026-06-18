import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  cropPolygonToPngBlob,
  fitScale,
  loadFloorPlanSourceCanvas,
} from "../utils/floorPlanCrop";
import ModalBackdrop from "./ModalBackdrop";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 12;
const VIEWPORT_WIDTH = 880;
const VIEWPORT_HEIGHT = 520;

export default function FloorPlanCropModal({ file, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0, baseFit: 1 });
  const interactionRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [points, setPoints] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [viewTick, setViewTick] = useState(0);

  const bumpView = useCallback(() => setViewTick((n) => n + 1), []);

  function resetView(source) {
    const baseFit = fitScale(source.width, source.height, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    const zoom = 1;
    const panX = (VIEWPORT_WIDTH - source.width * baseFit * zoom) / 2;
    const panY = (VIEWPORT_HEIGHT - source.height * baseFit * zoom) / 2;
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

  function clampPan() {
    const source = sourceCanvasRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;

    const scale = viewScale();
    const imgW = source.width * scale;
    const imgH = source.height * scale;
    const view = viewRef.current;

    if (imgW <= canvas.width) {
      view.panX = (canvas.width - imgW) / 2;
    } else {
      const minPan = canvas.width - imgW;
      view.panX = Math.min(0, Math.max(minPan, view.panX));
    }

    if (imgH <= canvas.height) {
      view.panY = (canvas.height - imgH) / 2;
    } else {
      const minPan = canvas.height - imgH;
      view.panY = Math.min(0, Math.max(minPan, view.panY));
    }
  }

  function zoomAt(screenX, screenY, factor) {
    const view = viewRef.current;
    const before = screenToSource(screenX, screenY);
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    const afterScale = viewScale();
    view.panX = screenX - before.x * afterScale;
    view.panY = screenY - before.y * afterScale;
    clampPan();
    bumpView();
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPoints([]);

    (async () => {
      try {
        const sourceCanvas = await loadFloorPlanSourceCanvas(file);
        if (cancelled) return;
        sourceCanvasRef.current = sourceCanvas;
        resetView(sourceCanvas);

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = VIEWPORT_WIDTH;
          canvas.height = VIEWPORT_HEIGHT;
        }
        bumpView();
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, bumpView]);

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
      ctx.fillStyle = "rgba(220, 38, 38, 0.15)";
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      if (points.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      const markerRadius = 6 / scale;
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, markerRadius, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#16a34a" : "#dc2626";
        ctx.fill();
        ctx.strokeStyle = WHITE;
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      });
    }
  }, [points, viewTick]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, points, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || loading || loadError) return;

    function onWheelNative(event) {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(x, y, factor);
    }

    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheelNative);
  }, [loading, loadError, bumpView]);

  function canvasCoords(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function onMouseDown(event) {
    if (loading || loadError) return;
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
    if (!interaction) return;
    const pt = canvasCoords(event);
    if (!pt) return;

    if (interaction.type === "pan") {
      viewRef.current.panX = interaction.panX + (pt.x - interaction.startX);
      viewRef.current.panY = interaction.panY + (pt.y - interaction.startY);
      clampPan();
      bumpView();
      return;
    }

    if (interaction.type === "point") {
      const dx = pt.x - interaction.startX;
      const dy = pt.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
    }
  }

  function addPointAtScreen(screenX, screenY) {
    const source = sourceCanvasRef.current;
    if (!source) return;
    const pt = screenToSource(screenX, screenY);
    if (pt.x < 0 || pt.y < 0 || pt.x > source.width || pt.y > source.height) return;
    setPoints((prev) => [...prev, pt]);
  }

  function onMouseUp(event) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction || loading || loadError) return;

    if (interaction.type === "point" && !interaction.moved && event.button === 0) {
      addPointAtScreen(interaction.startX, interaction.startY);
    }
  }

  function undoPoint() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function clearPoints() {
    setPoints([]);
  }

  function resetZoom() {
    const source = sourceCanvasRef.current;
    if (!source) return;
    resetView(source);
    bumpView();
  }

  async function handleConfirmCrop() {
    if (points.length < 3) {
      alert("Click at least 3 corners to outline the floor plan.");
      return;
    }
    const source = sourceCanvasRef.current;
    if (!source) return;

    setExporting(true);
    try {
      const { blob, cropCorners } = await cropPolygonToPngBlob(source, points);
      onConfirm({ blob, cropCorners });
    } catch (err) {
      alert(err.message || "Failed to crop floor plan");
    } finally {
      setExporting(false);
    }
  }

  const zoomPercent = Math.round(viewRef.current.zoom * 100);

  return (
    <ModalBackdrop zIndex={2200} style={{ background: "rgba(0,0,0,0.55)" }}>
      <div
        style={{
          background: WHITE,
          borderRadius: "16px",
          padding: "24px",
          width: "min(960px, 96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 8px", color: MONUMENT, fontSize: "1.2rem" }}>
          Outline floor plan
        </h3>
        <p style={{ margin: "0 0 16px", color: "#666", fontSize: "0.9rem", lineHeight: 1.45 }}>
          Scroll to zoom in on details. Shift+drag (or middle mouse) to pan. Click to place corners
          around the floor plan — you can use more than four. The outlined area is saved as a JPEG.
        </p>

        {loading && <div style={{ padding: "24px", color: "#666" }}>Loading…</div>}
        {loadError && (
          <div style={{ padding: "12px", color: "#842029", background: "#fdecea", borderRadius: "8px" }}>
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
                fontSize: "0.85rem",
                color: "#666",
              }}
            >
              <span>Zoom: {zoomPercent}%</span>
              <button
                type="button"
                onClick={resetZoom}
                style={{
                  background: "transparent",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  cursor: "pointer",
                  color: MONUMENT,
                  fontSize: "0.85rem",
                }}
              >
                Reset view
              </button>
            </div>
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#e8e8e8",
                marginBottom: "12px",
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <canvas
                ref={canvasRef}
                width={VIEWPORT_WIDTH}
                height={VIEWPORT_HEIGHT}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                style={{ display: "block", width: "100%", height: "auto", cursor: "crosshair" }}
              />
            </div>
          </>
        )}

        <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "16px" }}>
          {points.length} corner{points.length === 1 ? "" : "s"} placed
          {points.length >= 3 ? " — ready to save" : " — need at least 3"}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={undoPoint}
            disabled={!points.length || exporting}
            style={{
              background: SECTION_GREY,
              color: MONUMENT,
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: points.length ? "pointer" : "not-allowed",
              opacity: points.length ? 1 : 0.5,
            }}
          >
            Undo corner
          </button>
          <button
            type="button"
            onClick={clearPoints}
            disabled={!points.length || exporting}
            style={{
              background: SECTION_GREY,
              color: MONUMENT,
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: points.length ? "pointer" : "not-allowed",
              opacity: points.length ? 1 : 0.5,
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            style={{
              background: SECTION_GREY,
              color: MONUMENT,
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmCrop()}
            disabled={points.length < 3 || exporting || loading || !!loadError}
            style={{
              background: MONUMENT,
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              cursor: points.length >= 3 && !exporting ? "pointer" : "not-allowed",
              opacity: points.length >= 3 && !exporting ? 1 : 0.5,
            }}
          >
            {exporting ? "Saving…" : "Save cropped plan"}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
