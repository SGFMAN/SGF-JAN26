export const TRACE_WALL_HEIGHT_M = 3.2;
/** Largest footprint span (m) when mapping normalized trace coords to world space. */
export const TRACE_FOOTPRINT_TARGET_M = 14;

/**
 * Normalized trace polygon (0–1 on plan page) → flat ring at wall height for extrusion.
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {Float32Array | null}
 */
export function tracePolygonToWallRing(normalizedPoints) {
  if (!Array.isArray(normalizedPoints) || normalizedPoints.length < 3) return null;

  const xs = normalizedPoints.map((p) => p.x);
  const ys = normalizedPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const maxSpan = Math.max(spanX, spanY, 0.001);
  const scale = TRACE_FOOTPRINT_TARGET_M / maxSpan;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const positions = new Float32Array(normalizedPoints.length * 3);
  normalizedPoints.forEach((p, i) => {
    positions[i * 3] = (p.x - cx) * scale;
    positions[i * 3 + 1] = TRACE_WALL_HEIGHT_M;
    positions[i * 3 + 2] = -(p.y - cy) * scale;
  });
  return positions;
}
