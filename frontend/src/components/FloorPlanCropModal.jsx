import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  cropPolygonToJpegBlob,
  displayPointsToSource,
  loadFloorPlanSourceCanvases,
} from "../utils/floorPlanCrop";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

export default function FloorPlanCropModal({ file, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const scaleRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [points, setPoints] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPoints([]);

    (async () => {
      try {
        const { displayCanvas, sourceCanvas, scale } = await loadFloorPlanSourceCanvases(file);
        if (cancelled) return;
        sourceCanvasRef.current = sourceCanvas;
        scaleRef.current = scale;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = displayCanvas.width;
        canvas.height = displayCanvas.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not draw on canvas");
        ctx.drawImage(displayCanvas, 0, 0);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Could not load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceCanvasRef.current;
    if (!canvas || !source) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = canvas.width / source.width;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    if (points.length === 0) return;

    ctx.strokeStyle = "#dc2626";
    ctx.fillStyle = "rgba(220, 38, 38, 0.15)";
    ctx.lineWidth = 2;
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

    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#16a34a" : "#dc2626";
      ctx.fill();
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }, [points]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, points, redraw]);

  function canvasCoords(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function onCanvasClick(event) {
    if (loading || loadError) return;
    const pt = canvasCoords(event);
    if (!pt) return;
    setPoints((prev) => [...prev, pt]);
  }

  function undoPoint() {
    setPoints((prev) => prev.slice(0, -1));
  }

  function clearPoints() {
    setPoints([]);
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
      const sourcePoints = displayPointsToSource(points, scaleRef.current);
      const blob = await cropPolygonToJpegBlob(source, sourcePoints);
      onConfirm(blob);
    } catch (err) {
      alert(err.message || "Failed to crop floor plan");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2200,
      }}
      onClick={onCancel}
    >
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
          Click on the image to place corners around the floor plan shape. You can use more than four
          corners. The outlined area will be saved as a JPEG.
        </p>

        {loading && <div style={{ padding: "24px", color: "#666" }}>Loading…</div>}
        {loadError && (
          <div style={{ padding: "12px", color: "#842029", background: "#fdecea", borderRadius: "8px" }}>
            {loadError}
          </div>
        )}

        {!loading && !loadError && (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "10px",
              overflow: "auto",
              maxHeight: "60vh",
              background: "#f5f5f5",
              marginBottom: "12px",
            }}
          >
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              style={{ display: "block", maxWidth: "100%", cursor: "crosshair" }}
            />
          </div>
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
    </div>
  );
}
