/**
 * Rasterize a PDF page to PNG for AI inputs.
 * Uses @omsimos/pdf-raster (PDFium). Avoids pdfjs + @napi-rs/canvas Path2D issues.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { convert } from "@omsimos/pdf-raster";
import { PDFDocument } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Used for plan + colours raster; must match frontend `aiPlanRaster.js` for crop alignment. */
export const AI_PLAN_RASTER_DPI = 216;

async function getPdfPageCountWithPdfJs(uint8) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = path.join(__dirname, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const task = pdfjs.getDocument({ data: uint8, verbosity: 0 });
  const doc = await task.promise;
  try {
    return doc.numPages || 0;
  } finally {
    await doc.destroy();
  }
}

/**
 * @param {string} pdfAbsolutePath
 * @returns {Promise<number>}
 */
export async function getPdfPageCount(pdfAbsolutePath) {
  const bytes = await readFile(pdfAbsolutePath);
  const uint8 = new Uint8Array(bytes);
  try {
    const doc = await PDFDocument.load(uint8, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const n = doc.getPageCount();
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  } catch {
    // pdf-lib misses some drafting PDFs — fall through
  }

  try {
    const n = await getPdfPageCountWithPdfJs(uint8);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("PDF has no pages.");
    }
    return n;
  } catch (e) {
    throw new Error(`Could not read PDF page count: ${e.message}`);
  }
}

/**
 * @param {string} pdfAbsolutePath
 * @param {number} pageIndex1Based First page is 1
 * @param {number} [dpi=AI_PLAN_RASTER_DPI]
 * @returns {Promise<Buffer>}
 */
export async function renderPdfPageToPngBuffer(pdfAbsolutePath, pageIndex1Based, dpi = AI_PLAN_RASTER_DPI) {
  const n = await getPdfPageCount(pdfAbsolutePath);
  const pageOneBased = Math.min(Math.max(1, Math.floor(pageIndex1Based)), n);
  const pageZeroBased = pageOneBased - 1;
  const dpiUse = Math.min(300, Math.max(96, Math.round(Number(dpi))));

  let pages;
  try {
    pages = await convert(pdfAbsolutePath, {
      pages: [pageZeroBased],
      dpi: dpiUse,
      outputFormat: "png",
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    throw new Error(`PDF rasterize failed: ${msg}`);
  }

  const page = pages?.[0];
  if (!page?.data) {
    throw new Error("Rasterizer returned no image data.");
  }
  return Buffer.isBuffer(page.data) ? page.data : Buffer.from(page.data);
}

/**
 * Crop PNG using fractions of width/height from top-left (same as browser canvas + pdf.js viewport).
 * @param {Buffer} buffer
 * @param {{ nx: number, ny: number, nw: number, nh: number }} norm
 */
export async function cropPngNormalized(buffer, norm) {
  const nx = Number(norm?.nx);
  const ny = Number(norm?.ny);
  const nw = Number(norm?.nw);
  const nh = Number(norm?.nh);
  if (![nx, ny, nw, nh].every(Number.isFinite)) {
    throw new Error("Invalid elevation crop coordinates.");
  }
  if (nw < 0.02 || nh < 0.02) {
    throw new Error("Elevation rectangle is too small.");
  }
  if (nx < 0 || ny < 0 || nx + nw > 1.0001 || ny + nh > 1.0001) {
    throw new Error("Elevation rectangle must lie within the page.");
  }

  const meta = await sharp(buffer).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  let left = Math.floor(nx * W);
  let top = Math.floor(ny * H);
  let width = Math.floor(nw * W);
  let height = Math.floor(nh * H);

  left = Math.max(0, Math.min(W - 2, left));
  top = Math.max(0, Math.min(H - 2, top));
  width = Math.max(8, Math.min(W - left, width));
  height = Math.max(8, Math.min(H - top, height));

  return sharp(buffer).extract({ left, top, width, height }).png().toBuffer();
}
