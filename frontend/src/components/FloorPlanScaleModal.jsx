import React, { useCallback, useEffect, useRef, useState } from "react";
import { fitScale } from "../utils/floorPlanCrop";
import ModalBackdrop from "./ModalBackdrop";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 12;
const VIEWPORT_WIDTH = 880;
const VIEWPORT_HEIGHT = 520;
const SNAP_SCREEN_PX = 16;

export default function FloorPlanScaleModal({ imageBlob, snapCorners = [], onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0, baseFit: 1 });
  const interactionRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [lineStart, setLineStart] = useState(null);
  const [lineEnd, setLineEnd] = useState(null);
  const [distanceMeters, setDistanceMeters] = useState("");
  const [viewTick, setViewTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const bumpView = useCallback(() => setViewTick((n) => n + 1), []);

  function resetView(image) {
    const baseFit = fitScale(image.width, image.height, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    const zoom = 1;
    const panX = (VIEWPORT_WIDTH - image.width * baseFit * zoom) / 2;
    const panY = (VIEWPORT_HEIGHT - image.height * baseFit * zoom) / 2;
    viewRef.current = { zoom, panX, panY, baseFit };
  }

  function viewScale() {
    const { baseFit, zoom } = viewRef.current;
    return baseFit * zoom;
  }

  function screenToImage(screenX, screenY) {
    const { panX, panY } = viewRef.current;
    const scale = viewScale();
    return {
      x: (screenX - panX) / scale,
      y: (screenY - panY) / scale,
    };
  }

  function clampPan() {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const scale = viewScale();
    const imgW = image.width * scale;
    const imgH = image.height * scale;
    const view = viewRef.current;

    if (imgW <= canvas.width) {
      view.panX = (canvas.width - imgW) / 2;
    } else {
      view.panX = Math.min(0, Math.max(canvas.width - imgW, view.panX));
    }

    if (imgH <= canvas.height) {
      view.panY = (canvas.height - imgH) / 2;
    } else {
      view.panY = Math.min(0, Math.max(canvas.height - imgH, view.panY));
    }
  }

  function zoomAt(screenX, screenY, factor) {
    const view = viewRef.current;
    const before = screenToImage(screenX, screenY);
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    const afterScale = viewScale();
    view.panX = screenX - before.x * afterScale;
    view.panY = screenY - before.y * afterScale;
    clampPan();
    bumpView();
  }

  function snapPoint(imagePt) {
    const threshold = SNAP_SCREEN_PX / viewScale();
    let best = imagePt;
    let bestDist = threshold;
    for (const corner of snapCorners) {
      const d = Math.hypot(imagePt.x - corner.x, imagePt.y - corner.y);
      if (d <= bestDist) {
        bestDist = d;
        best = { x: corner.x, y: corner.y };
      }
    }
    return best;
  }

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setLoading(true);
    setLoadError(null);
    setLineStart(null);
    setLineEnd(null);
    setDistanceMeters("");

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      resetView(img);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = VIEWPORT_WIDTH;
        canvas.height = VIEWPORT_HEIGHT;
      }
      setLoading(false);
      bumpView();
    };
    img.onerror = () => {
      if (!cancelled) {
        setLoadError("Could not load cropped image");
        setLoading(false);
      }
    };
    objectUrl = URL.createObjectURL(imageBlob);
    img.src = objectUrl;

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageBlob, bumpView]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = viewScale();
    const { panX, panY } = viewRef.current;
    ctx.setTransform(scale, 0, 0, scale, panX, panY);
    ctx.drawImage(image, 0, 0);

    snapCorners.forEach((corner) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 5 / scale, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(22, 163, 74, 0.35)";
      ctx.fill();
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();
    });

    if (lineStart && lineEnd) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 3 / scale;
      ctx.beginPath();
      ctx.moveTo(lineStart.x, lineStart.y);
      ctx.lineTo(lineEnd.x, lineEnd.y);
      ctx.stroke();
    }

    [lineStart, lineEnd].filter(Boolean).forEach((pt, index) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 7 / scale, 0, Math.PI * 2);
      ctx.fillStyle = index === 0 ? "#16a34a" : "#2563eb";
      ctx.fill();
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 2 / scale;
      ctx.stroke();
    });
  }, [lineStart, lineEnd, snapCorners, viewTick]);

  useEffect(() => {
    if (!loading && !loadError) redraw();
  }, [loading, loadError, redraw]);

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
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onMouseDown(event) {
    if (loading || loadError || lineEnd) return;
    const screen = canvasCoords(event);
    if (!screen) return;

    if (event.button === 1 || event.button === 2 || event.shiftKey) {
      event.preventDefault();
      interactionRef.current = {
        type: "pan",
        startX: screen.x,
        startY: screen.y,
        panX: viewRef.current.panX,
        panY: viewRef.current.panY,
      };
      return;
    }

    if (event.button === 0) {
      interactionRef.current = {
        type: "point",
        startX: screen.x,
        startY: screen.y,
        moved: false,
      };
    }
  }

  function onMouseMove(event) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const screen = canvasCoords(event);
    if (!screen) return;

    if (interaction.type === "pan") {
      viewRef.current.panX = interaction.panX + (screen.x - interaction.startX);
      viewRef.current.panY = interaction.panY + (screen.y - interaction.startY);
      clampPan();
      bumpView();
      return;
    }

    if (interaction.type === "point") {
      const dx = screen.x - interaction.startX;
      const dy = screen.y - interaction.startY;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
    }
  }

  function placeLinePoint(screenX, screenY) {
    const image = imageRef.current;
    if (!image) return;
    const raw = screenToImage(screenX, screenY);
    const snapped = snapPoint(raw);
    if (snapped.x < 0 || snapped.y < 0 || snapped.x > image.width || snapped.y > image.height) return;

    if (!lineStart) {
      setLineStart(snapped);
      return;
    }

    if (Math.hypot(snapped.x - lineStart.x, snapped.y - lineStart.y) < 1) return;
    setLineEnd(snapped);
  }

  function onMouseUp(event) {
    const interaction = interactionRef.current;
    interactionRef.current = null;
    if (!interaction || loading || loadError || lineEnd) return;

    if (interaction.type === "point" && !interaction.moved && event.button === 0) {
      placeLinePoint(interaction.startX, interaction.startY);
    }
  }

  function clearLine() {
    setLineStart(null);
    setLineEnd(null);
    setDistanceMeters("");
  }

  function resetZoom() {
    const image = imageRef.current;
    if (!image) return;
    resetView(image);
    bumpView();
  }

  async function handleConfirm() {
    if (!lineStart || !lineEnd) {
      alert("Click two corners to draw a scale line.");
      return;
    }
    const meters = Number.parseFloat(distanceMeters);
    if (!Number.isFinite(meters) || meters <= 0) {
      alert("Enter a valid distance in metres.");
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm({
        scaleLineX1: lineStart.x,
        scaleLineY1: lineStart.y,
        scaleLineX2: lineEnd.x,
        scaleLineY2: lineEnd.y,
        scaleLineMeters: meters,
      });
    } catch {
      // Parent shows error; keep modal open for retry.
    } finally {
      setSubmitting(false);
    }
  }

  const zoomPercent = Math.round(viewRef.current.zoom * 100);
  const pixelDistance =
    lineStart && lineEnd
      ? Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y)
      : 0;

  return (
    <ModalBackdrop onClose={onCancel} zIndex={2300} style={{ background: "rgba(0,0,0,0.55)" }}>
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
          Set floor plan scale
        </h3>
        <p style={{ margin: "0 0 16px", color: "#666", fontSize: "0.9rem", lineHeight: 1.45 }}>
          Draw a line between two corners of the plan (the cursor snaps to nearby corners). Then enter
          the real-world distance that line represents in metres. This scale is used when placing the
          plan on the map.
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
              <span>
                {!lineStart
                  ? "Click the first corner"
                  : !lineEnd
                    ? "Click the second corner"
                    : "Enter the distance below"}
              </span>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
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

        {lineEnd && (
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="scale-distance"
              style={{ display: "block", marginBottom: "6px", color: MONUMENT, fontSize: "0.9rem" }}
            >
              Distance represented by this line (metres)
            </label>
            <input
              id="scale-distance"
              type="number"
              min="0.01"
              step="0.01"
              value={distanceMeters}
              onChange={(e) => setDistanceMeters(e.target.value)}
              placeholder="e.g. 5.2"
              style={{
                width: "100%",
                maxWidth: "220px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                fontSize: "0.95rem",
              }}
            />
            {pixelDistance > 0 && Number.parseFloat(distanceMeters) > 0 && (
              <div style={{ marginTop: "8px", fontSize: "0.85rem", color: "#666" }}>
                Scale:{" "}
                {(Number.parseFloat(distanceMeters) / pixelDistance).toFixed(4)} m per pixel
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={clearLine}
            disabled={!lineStart || submitting}
            style={{
              background: SECTION_GREY,
              color: MONUMENT,
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: lineStart ? "pointer" : "not-allowed",
              opacity: lineStart ? 1 : 0.5,
            }}
          >
            Clear line
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
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
            onClick={handleConfirm}
            disabled={!lineEnd || submitting || loading || !!loadError}
            style={{
              background: MONUMENT,
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "10px 18px",
              cursor: lineEnd && !submitting ? "pointer" : "not-allowed",
              opacity: lineEnd && !submitting ? 1 : 0.5,
            }}
          >
            {submitting ? "Saving…" : "Save floor plan"}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
