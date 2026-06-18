import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { AI_PLAN_RASTER_DPI, pdfViewportScaleFromDpi } from "../constants/aiPlanRaster";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * @typedef {{ nx: number, ny: number, nw: number, nh: number }} NormalizedCrop
 */

export default function ElevationPickerModal({ open, onClose, drawingsPdfUrl, onConfirm }) {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  /** @type {'nav'|'define'} */
  const [mode, setMode] = useState("nav");
  /** pixels on canvas [{x,y,w,h} top-left relative to viewport canvas] */
  const [selPx, setSelPx] = useState(null);
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 });

  const pdfCanvasRef = useRef(null);
  const ovCanvasRef = useRef(null);
  const draggingRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelPx(null);
    setLoadErr(null);
    setPdf(null);
    setPageNum(1);
    setNumPages(0);
    setLoading(true);
    setMode("nav");
    setCanvasDims({ w: 0, h: 0 });

    let cancelled = false;

    async function load() {
      try {
        const task = pdfjsLib.getDocument({
          url: drawingsPdfUrl,
          withCredentials: false,
          verbosity: 0,
        });
        const doc = await task.promise;
        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages || 0);
        if (!doc.numPages) {
          setLoadErr("This PDF has no pages.");
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e?.message || "Could not load drawings PDF.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, drawingsPdfUrl]);

  useEffect(() => {
    setSelPx(null);
  }, [pageNum]);

  const scale = useMemo(() => pdfViewportScaleFromDpi(AI_PLAN_RASTER_DPI), []);

  /** Render PDF page bitmap */
  useEffect(() => {
    const canvasEl = pdfCanvasRef.current;
    const ovEl = ovCanvasRef.current;
    if (!open || !pdf || !canvasEl || !numPages || pageNum < 1 || loading) return;

    (async () => {
      try {
        const page = await pdf.getPage(Math.min(Math.max(pageNum, 1), numPages));
        const viewport = page.getViewport({ scale });
        canvasEl.width = Math.floor(viewport.width);
        canvasEl.height = Math.floor(viewport.height);
        if (ovEl) {
          ovEl.width = canvasEl.width;
          ovEl.height = canvasEl.height;
        }
        const ctx = canvasEl.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        setCanvasDims({ w: canvasEl.width, h: canvasEl.height });
      } catch (e) {
        setLoadErr(e?.message || "Failed to render PDF page.");
      }
    })();
  }, [open, pdf, pageNum, numPages, scale, loading]);

  /** Redraw selection overlay */
  useEffect(() => {
    const ov = ovCanvasRef.current;
    if (!ov || loading) return;
    const cx = ov.getContext("2d");
    if (!cx) return;
    cx.clearRect(0, 0, ov.width, ov.height);
    if (!selPx || selPx.w < 2 || selPx.h < 2) return;
    cx.strokeStyle = "rgba(234,67,53,1)";
    cx.lineWidth = 3;
    cx.setLineDash([8, 4]);
    cx.strokeRect(selPx.x + 1.5, selPx.y + 1.5, selPx.w - 3, selPx.h - 3);
    cx.setLineDash([]);
    cx.fillStyle = "rgba(234,67,53,0.12)";
    cx.fillRect(selPx.x, selPx.y, selPx.w, selPx.h);
  }, [selPx, loading, pageNum]);

  function eventToCanvas(ev) {
    const canvas = ovCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * sx;
    const y = (ev.clientY - rect.top) * sy;
    return { x, y };
  }

  const handlePointerDown = useCallback(
    (ev) => {
      if (mode !== "define" || !ovCanvasRef.current) return;
      ev.preventDefault();
      const p = eventToCanvas(ev);
      if (!p) return;
      draggingRef.current = { startX: p.x, startY: p.y };
      setSelPx({ x: p.x, y: p.y, w: 1, h: 1 });
    },
    [mode]
  );

  const handlePointerMove = useCallback(
    (ev) => {
      if (mode !== "define" || !draggingRef.current) return;
      const p = eventToCanvas(ev);
      const d = draggingRef.current;
      if (!p || !d) return;
      const x0 = Math.min(d.startX, p.x);
      const y0 = Math.min(d.startY, p.y);
      const ww = Math.abs(p.x - d.startX);
      const hh = Math.abs(p.y - d.startY);
      setSelPx({ x: x0, y: y0, w: ww, h: hh });
    },
    [mode]
  );

  const finishDrag = useCallback(() => {
    draggingRef.current = null;
    setSelPx((prev) => {
      if (!prev || prev.w < 4 || prev.h < 4) return prev;
      return prev;
    });
  }, []);

  /** @returns {NormalizedCrop|null} */
  function pixelsToNormalized(sel, W, H) {
    if (!sel || W <= 1 || H <= 1 || sel.w < 4 || sel.h < 4) return null;
    const nx = Math.max(0, Math.min(1, sel.x / W));
    const ny = Math.max(0, Math.min(1, sel.y / H));
    const nw = Math.max(0, Math.min(1 - nx, sel.w / W));
    const nh = Math.max(0, Math.min(1 - ny, sel.h / H));
    if (nw < 0.02 || nh < 0.02) return null;
    return { nx, ny, nw, nh };
  }

  const confirmNorm = useMemo(
    () => pixelsToNormalized(selPx, canvasDims.w, canvasDims.h),
    [selPx, canvasDims.w, canvasDims.h]
  );

  function handleConfirm() {
    const norm = pixelsToNormalized(selPx, canvasDims.w, canvasDims.h);
    if (!norm) return;
    onConfirm({ planPage: pageNum, elevationCrop: norm });
  }

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1002,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-labelledby="elev-picker-title"
        style={{
          background: WHITE,
          borderRadius: "14px",
          maxWidth: "960px",
          width: "100%",
          maxHeight: "94vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${SECTION_GREY}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <div>
              <h2 id="elev-picker-title" style={{ margin: 0, fontSize: "1.2rem", color: MONUMENT }}>
                Choose elevation on drawings
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: "0.86rem", color: SECTION_GREY, lineHeight: 1.45 }}>
                Browse the drawings PDF, then use <strong>Define elevation</strong> and drag a{" "}
                <strong style={{ color: "#ea4339" }}>red box</strong> around the façade you want rendered. Colour
                choices still come only from your colours PDF—do not rely on building shapes on that sheet.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "1.5rem",
                cursor: "pointer",
                color: SECTION_GREY,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ padding: "12px 18px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            disabled={pageNum <= 1 || loading || !!loadErr}
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: `1px solid ${SECTION_GREY}`,
              background: WHITE,
              cursor: pageNum <= 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: "0.95rem", color: MONUMENT, minWidth: "120px", textAlign: "center" }}>
            Page {loading ? "…" : pageNum}
            {!loading && numPages ? ` / ${numPages}` : ""}
          </span>
          <button
            type="button"
            disabled={pageNum >= numPages || loading || !!loadErr}
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: `1px solid ${SECTION_GREY}`,
              background: WHITE,
              cursor: pageNum >= numPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
          <button
            type="button"
            disabled={loading || !!loadErr}
            onClick={() => {
              setMode((m) => (m === "define" ? "nav" : "define"));
              setSelPx(null);
            }}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: mode === "define" ? `2px solid #ea4339` : `1px solid ${SECTION_GREY}`,
              background: mode === "define" ? "#fff5f5" : WHITE,
              color: MONUMENT,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: mode === "define" ? 600 : 500,
            }}
          >
            {mode === "define" ? "Defining elevation (drag)" : "Define elevation"}
          </button>
          <button
            type="button"
            disabled={!selPx}
            onClick={() => setSelPx(null)}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: `1px solid ${SECTION_GREY}`,
              background: WHITE,
              color: SECTION_GREY,
              cursor: selPx ? "pointer" : "not-allowed",
            }}
          >
            Clear rectangle
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!confirmNorm || loading || !!loadErr}
            style={{
              marginLeft: "auto",
              padding: "10px 18px",
              borderRadius: "8px",
              border: "none",
              background: MONUMENT,
              color: WHITE,
              fontWeight: 600,
              cursor: confirmNorm && !loading && !loadErr ? "pointer" : "not-allowed",
              opacity: confirmNorm && !loading && !loadErr ? 1 : 0.55,
            }}
          >
            Use selection &amp; generate
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "12px 18px 20px",
            background: "#e8e8ea",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", color: SECTION_GREY, padding: "40px" }}>
              Loading drawings…
            </div>
          ) : null}
          {loadErr ? (
            <div
              role="alert"
              style={{
                padding: "12px",
                borderRadius: "8px",
                background: "#fdecea",
                color: "#842029",
                fontSize: "0.92rem",
              }}
            >
              {loadErr}
            </div>
          ) : null}
          {!loading && !loadErr && numPages > 0 ? (
            <>
              <div
                style={{
                  position: "relative",
                  display: "inline-block",
                  maxWidth: "100%",
                  outline: mode === "define" ? `2px solid #ea4339` : "none",
                  borderRadius: "6px",
                }}
              >
                <canvas ref={pdfCanvasRef} style={{ display: "block", maxWidth: "100%", height: "auto" }} />
                <canvas
                  ref={ovCanvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishDrag}
                  onPointerLeave={finishDrag}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: "100%",
                    touchAction: "none",
                    cursor: mode === "define" ? "crosshair" : "default",
                    pointerEvents: mode === "define" ? "auto" : "none",
                  }}
                />
              </div>
              {!selPx && mode === "define" ? (
                <p style={{ margin: "12px 0 0", fontSize: "0.85rem", color: SECTION_GREY }}>
                  Drag on the drawings to outline the elevation.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
