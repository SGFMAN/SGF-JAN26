/**
 * Scale helpers for a user-supplied calibration line.
 *
 * A calibration is a straight line (horizontal or vertical) drawn over an edge
 * of known real-world length. It is stored in page-normalized coordinates:
 *   { a: {x,y}, b: {x,y}, lengthM, aspect }
 * where `aspect` = sourceWidth / sourceHeight of the rendered plan page.
 *
 * The rasterised plan has a uniform pixel density (pdf.js renders at one scale),
 * so metres-per-pixel in source coordinates is uniform. The normalized space is
 * anisotropic (x ÷ width, y ÷ height), so 3D reconstruction needs separate
 * metres-per-normalized-unit factors for x and y, related by the page aspect.
 */

/**
 * Metres per source pixel from a calibration line.
 * @param {{ a: {x:number,y:number}, b:{x:number,y:number}, lengthM:number }|null} calibration
 * @param {number} sourceWidth  rendered page width in pixels
 * @param {number} sourceHeight rendered page height in pixels
 * @returns {number|null}
 */
export function computeMetresPerPixel(calibration, sourceWidth, sourceHeight) {
  if (!calibration || !(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  const { a, b, lengthM } = calibration;
  if (!a || !b || !(lengthM > 0)) return null;
  const dxPx = (a.x - b.x) * sourceWidth;
  const dyPx = (a.y - b.y) * sourceHeight;
  const pixelDist = Math.hypot(dxPx, dyPx);
  if (!(pixelDist > 1e-6)) return null;
  return lengthM / pixelDist;
}

/**
 * Metres per normalized unit for x and y (for 3D reconstruction from normalized points).
 * @param {{ a: {x:number,y:number}, b:{x:number,y:number}, lengthM:number, aspect?:number }|null} calibration
 * @returns {{ Kx: number, Ky: number }|null}
 */
export function calibrationNormScales(calibration) {
  if (!calibration) return null;
  const { a, b, lengthM } = calibration;
  if (!a || !b || !(lengthM > 0)) return null;
  const dxn = Math.abs(a.x - b.x);
  const dyn = Math.abs(a.y - b.y);
  const aspect = calibration.aspect > 0 ? calibration.aspect : 1;
  if (dxn >= dyn) {
    if (!(dxn > 1e-9)) return null;
    const Kx = lengthM / dxn;
    return { Kx, Ky: Kx / aspect };
  }
  if (!(dyn > 1e-9)) return null;
  const Ky = lengthM / dyn;
  return { Kx: Ky * aspect, Ky };
}
