import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PDF_RENDER_SCALE = 1.5;

export function isPdfFile(file) {
  if (!file) return false;
  return file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf");
}

function cloneCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas");
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

async function renderPdfPageToCanvas(doc, pageNumber = 1) {
  if (!doc?.numPages) throw new Error("PDF has no pages");
  const pageIndex = Math.min(Math.max(1, pageNumber), doc.numPages);
  const page = await doc.getPage(pageIndex);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return cloneCanvas(canvas);
}

async function renderPdfFirstPageToCanvas(file) {
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  try {
    return await renderPdfPageToCanvas(doc, 1);
  } finally {
    await doc.destroy().catch(() => {});
  }
}

/** Load a PDF from URL and keep the document open for page navigation. */
export async function loadPdfDocumentFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load plan PDF");
  }
  const data = await response.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  if (!doc.numPages) {
    await doc.destroy().catch(() => {});
    throw new Error("PDF has no pages");
  }
  return doc;
}

export async function renderPdfDocumentPage(doc, pageNumber = 1) {
  return renderPdfPageToCanvas(doc, pageNumber);
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
    return cloneCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @returns {Promise<HTMLCanvasElement>} full-resolution source canvas */
export async function loadFloorPlanSourceCanvas(file) {
  return isPdfFile(file) ? renderPdfFirstPageToCanvas(file) : loadImageFileToCanvas(file);
}

/** Load first page of a remote PDF (or image) into a canvas. */
export async function loadFloorPlanSourceCanvasFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not load plan PDF");
  }
  const blob = await response.blob();
  const file = new File([blob], "plan.pdf", {
    type: blob.type || "application/pdf",
  });
  return loadFloorPlanSourceCanvas(file);
}

/** Fit image into viewport with uniform scale (preserves aspect ratio). */
export function fitScale(sourceWidth, sourceHeight, viewportWidth, viewportHeight) {
  if (!sourceWidth || !sourceHeight || !viewportWidth || !viewportHeight) return 1;
  return Math.min(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
}

/** @returns {{ minX: number, minY: number, cropCorners: { x: number, y: number }[] }} */
export function sourcePointsToCropSpace(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const cropCorners = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  return { minX, minY, cropCorners };
}

/**
 * Crop polygon region from source canvas and return PNG blob with transparent exterior.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {{ x: number, y: number }[]} points source-space coordinates
 */
export function cropPolygonToPngBlob(sourceCanvas, points) {
  if (points.length < 3) {
    return Promise.reject(new Error("Draw at least 3 corners"));
  }

  const { minX, minY, cropCorners } = sourcePointsToCropSpace(points);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const maxX = Math.min(sourceCanvas.width, Math.ceil(Math.max(...xs)));
  const maxY = Math.min(sourceCanvas.height, Math.ceil(Math.max(...ys)));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not create canvas"));

  ctx.clearRect(0, 0, w, h);
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
  ctx.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    -minX,
    -minY,
    sourceCanvas.width,
    sourceCanvas.height
  );
  ctx.restore();

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Failed to export PNG"));
        else resolve({ blob, cropCorners });
      },
      "image/png"
    );
  });
}
