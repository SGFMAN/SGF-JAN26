/** Must match backend `pdfPageToPng.mjs` raster DPI used for elevation extraction. */
export const AI_PLAN_RASTER_DPI = 216;

/** pdf.js viewport scale so canvas pixels align with backend PNG for crop fractions. */
export function pdfViewportScaleFromDpi(dpi) {
  return dpi / 72;
}
