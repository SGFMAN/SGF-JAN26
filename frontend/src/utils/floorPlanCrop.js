import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const MAX_CANVAS_WIDTH = 1200;
const PDF_RENDER_SCALE = 1.5;

export function isPdfFile(file) {
  if (!file) return false;
  return file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

async function renderPdfFirstPageToCanvas(file) {
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  try {
    if (!doc.numPages) throw new Error("PDF has no pages");
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  } finally {
    await doc.destroy().catch(() => {});
  }
}

async function loadImageFileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Scale source canvas to fit max width; returns { canvas, scale }. */
function fitCanvas(source) {
  const scale = source.width > MAX_CANVAS_WIDTH ? MAX_CANVAS_WIDTH / source.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, scale: 1 / scale };
}

/**
 * Load uploaded file into a display canvas (scaled) and full-resolution source canvas.
 * @returns {{ displayCanvas: HTMLCanvasElement, sourceCanvas: HTMLCanvasElement, scale: number }}
 */
export async function loadFloorPlanSourceCanvases(file) {
  const rawCanvas = isPdfFile(file)
    ? await renderPdfFirstPageToCanvas(file)
    : await loadImageFileToCanvas(file);

  const { canvas: displayCanvas, scale } = fitCanvas(rawCanvas);
  return {
    displayCanvas,
    sourceCanvas: rawCanvas,
    scale,
  };
}

/** @param {{ x: number, y: number }[]} displayPoints @param {number} scale display -> source multiplier */
export function displayPointsToSource(displayPoints, scale) {
  return displayPoints.map((p) => ({ x: p.x * scale, y: p.y * scale }));
}

/**
 * Crop polygon region from source canvas and return JPEG blob.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{ x: number, y: number }[]} points source-space coordinates
 */
export function cropPolygonToJpegBlob(sourceCanvas, points, quality = 0.92) {
  if (points.length < 3) {
    return Promise.reject(new Error("Draw at least 3 corners"));
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxX = Math.min(sourceCanvas.width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(sourceCanvas.height, Math.ceil(Math.max(...ys)));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not create canvas"));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = p.x - minX;
    const y = p.y - minY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(sourceCanvas, -minX, -minY);
  ctx.restore();

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Failed to export JPEG"));
        else resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}
