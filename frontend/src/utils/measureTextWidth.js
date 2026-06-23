let canvasContext = null;

function getCanvasContext() {
  if (typeof document === "undefined") return null;
  if (!canvasContext) {
    const canvas = document.createElement("canvas");
    canvasContext = canvas.getContext("2d");
  }
  return canvasContext;
}

function getRootFontSizePx() {
  if (typeof document === "undefined") return 16;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

let cachedBodyFontFamily = null;

function getBodyFontFamily() {
  if (typeof document === "undefined") return "system-ui, sans-serif";
  if (!cachedBodyFontFamily) {
    cachedBodyFontFamily = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  }
  return cachedBodyFontFamily;
}

/**
 * Measure single-line text width in px (matches rem-based UI fonts).
 * @param {string} text
 * @param {{ sizeRem: number, weight?: number | string }} options
 */
export function measureTextWidth(text, { sizeRem, weight = 400 }) {
  const ctx = getCanvasContext();
  if (!ctx || !text) return 0;

  const px = sizeRem * getRootFontSizePx();
  ctx.font = `${weight} ${px}px ${getBodyFontFamily()}`;
  return ctx.measureText(text).width;
}
