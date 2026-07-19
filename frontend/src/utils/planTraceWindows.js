import { internalWallHalfThicknessSource } from "./tracePlanInternalWalls";

export const WINDOW_LENGTH_M = 1.8;
export const WINDOW_THICKNESS_M = 0.1;

/** Door leaf footprint on the plan: 870 mm wide × 100 mm thick. */
export const DOOR_WIDTH_M = 0.87;

/** Sliding door default width and allowed resize increments (metres). */
export const SLIDING_DOOR_WIDTH_M = 2.1;
export const SLIDING_DOOR_WIDTH_INCREMENTS_M = [2.1, 2.4, 2.7, 3.3, 3.6];
export const SLIDING_DOOR_HEIGHT_M = 2.1;

/** Allowed window widths (metres). Resizing snaps to the nearest of these. */
export const WINDOW_WIDTH_INCREMENTS_M = [0.6, 0.9, 1.2, 1.5, 1.8, 2.1];

/** Allowed window heights (metres). Selected from the centre node in edit mode. */
export const WINDOW_HEIGHT_INCREMENTS_M = [0.4, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1];

/** Default height for a newly placed window (metres). */
export const DEFAULT_WINDOW_HEIGHT_M = 1.8;

/** Nearest allowed width to `widthM`, optionally capped so it still fits the wall. */
export function snapWindowWidthM(widthM, maxWidthM = Infinity) {
  return snapWidthToIncrements(widthM, WINDOW_WIDTH_INCREMENTS_M, maxWidthM);
}

export function snapSlidingDoorWidthM(widthM, maxWidthM = Infinity) {
  return snapWidthToIncrements(widthM, SLIDING_DOOR_WIDTH_INCREMENTS_M, maxWidthM);
}

function snapWidthToIncrements(widthM, increments, maxWidthM = Infinity) {
  const options = increments.filter((w) => w <= maxWidthM + 1e-6);
  const list = options.length ? options : [increments[0]];
  let best = list[0];
  let bestDiff = Math.abs(widthM - best);
  for (const w of list) {
    const diff = Math.abs(widthM - w);
    if (diff < bestDiff) {
      best = w;
      bestDiff = diff;
    }
  }
  return best;
}

function projectPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return { t: 0, x: ax, y: ay, dist: Math.hypot(px - ax, py - ay), len: 0 };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { t, x, y, dist: Math.hypot(px - x, py - y), len: Math.sqrt(lenSq) };
}

function polygonCentroid(points) {
  let cx = 0;
  let cy = 0;
  points.forEach((p) => {
    cx += p.x;
    cy += p.y;
  });
  return { x: cx / points.length, y: cy / points.length };
}

/**
 * Snap a 1.8 m × 100 mm window onto the nearest external wall edge, centred on
 * the wall centreline and sliding with the cursor.
 *
 * @param {{ x: number, y: number }} cursor  source-pixel cursor position
 * @param {{ x: number, y: number }[]} outerPoints  external wall polygon (source px)
 * @returns {{
 *   edgeIndex: number,
 *   center: { x: number, y: number },
 *   a: { x: number, y: number },
 *   b: { x: number, y: number },
 *   outerA: { x: number, y: number },
 *   outerB: { x: number, y: number },
 *   corners: { x: number, y: number }[],
 * } | null}
 */
export function resolveWindowPlacement(
  cursor,
  outerPoints,
  metresPerPixel = null,
  widthM = WINDOW_LENGTH_M
) {
  if (!cursor || !Array.isArray(outerPoints) || outerPoints.length < 3) return null;

  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
  if (halfT == null || !(halfT > 0)) return null;

  const pxPerMetre = halfT / (WINDOW_THICKNESS_M / 2);
  const effWidthM = widthM > 0 ? widthM : WINDOW_LENGTH_M;
  const halfLenPx = (effWidthM / 2) * pxPerMetre;
  const halfThicknessPx = halfT;

  const n = outerPoints.length;
  let best = null;
  for (let i = 0; i < n; i += 1) {
    const a = outerPoints[i];
    const b = outerPoints[(i + 1) % n];
    const proj = projectPointToSegment(cursor.x, cursor.y, a.x, a.y, b.x, b.y);
    if (!best || proj.dist < best.dist) {
      best = { ...proj, edgeIndex: i, a, b };
    }
  }
  if (!best || best.len < 1e-6) return null;

  const dir = { x: (best.b.x - best.a.x) / best.len, y: (best.b.y - best.a.y) / best.len };

  // Inward normal (towards polygon centroid) so the window sits on the wall centreline.
  const centroid = polygonCentroid(outerPoints);
  let normal = { x: -dir.y, y: dir.x };
  const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
  const towardCentroid = { x: centroid.x - mid.x, y: centroid.y - mid.y };
  if (normal.x * towardCentroid.x + normal.y * towardCentroid.y < 0) {
    normal = { x: -normal.x, y: -normal.y };
  }

  // Slide along the wall, keeping the whole window on the edge.
  let alongPx = best.t * best.len;
  if (best.len <= halfLenPx * 2) {
    alongPx = best.len / 2;
  } else {
    alongPx = Math.max(halfLenPx, Math.min(best.len - halfLenPx, alongPx));
  }

  const onEdge = { x: best.a.x + dir.x * alongPx, y: best.a.y + dir.y * alongPx };
  const center = {
    x: onEdge.x + normal.x * halfThicknessPx,
    y: onEdge.y + normal.y * halfThicknessPx,
  };

  const endA = { x: center.x - dir.x * halfLenPx, y: center.y - dir.y * halfLenPx };
  const endB = { x: center.x + dir.x * halfLenPx, y: center.y + dir.y * halfLenPx };

  const nx = normal.x * halfThicknessPx;
  const ny = normal.y * halfThicknessPx;
  // Inner face endpoints (offset toward centroid) and outer face endpoints (on the wall edge).
  const innerA = { x: endA.x + nx, y: endA.y + ny };
  const innerB = { x: endB.x + nx, y: endB.y + ny };
  const outerA = { x: endA.x - nx, y: endA.y - ny };
  const outerB = { x: endB.x - nx, y: endB.y - ny };
  const corners = [innerA, innerB, outerB, outerA];

  return {
    edgeIndex: best.edgeIndex,
    center,
    a: endA,
    b: endB,
    outerA,
    outerB,
    corners,
    widthM: effWidthM,
  };
}

/**
 * Rebuild a window's plan rectangle from its stored outer-face endpoints.
 * Used when restoring saved windows (which persist only the outer edge line).
 *
 * @param {{ x: number, y: number }} outerA  source-pixel outer endpoint
 * @param {{ x: number, y: number }} outerB  source-pixel outer endpoint
 * @param {{ x: number, y: number }[]} outerPoints  external wall polygon (source px)
 * @returns {{
 *   center: { x: number, y: number },
 *   a: { x: number, y: number },
 *   b: { x: number, y: number },
 *   outerA: { x: number, y: number },
 *   outerB: { x: number, y: number },
 *   corners: { x: number, y: number }[],
 * } | null}
 */
export function buildWindowRenderFromEndpoints(outerA, outerB, outerPoints, metresPerPixel = null) {
  if (!outerA || !outerB || !Array.isArray(outerPoints) || outerPoints.length < 3) return null;
  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
  if (halfT == null || !(halfT > 0)) return null;

  const dx = outerB.x - outerA.x;
  const dy = outerB.y - outerA.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;

  // Inward normal points toward the polygon centroid.
  const centroid = polygonCentroid(outerPoints);
  const mid = { x: (outerA.x + outerB.x) / 2, y: (outerA.y + outerB.y) / 2 };
  let inward = { x: -dy / len, y: dx / len };
  if (inward.x * (centroid.x - mid.x) + inward.y * (centroid.y - mid.y) < 0) {
    inward = { x: -inward.x, y: -inward.y };
  }

  const thickness = halfT * 2;
  const innerA = { x: outerA.x + inward.x * thickness, y: outerA.y + inward.y * thickness };
  const innerB = { x: outerB.x + inward.x * thickness, y: outerB.y + inward.y * thickness };
  const center = {
    x: (outerA.x + outerB.x + innerA.x + innerB.x) / 4,
    y: (outerA.y + outerB.y + innerA.y + innerB.y) / 4,
  };

  const pxPerMetre = halfT / (WINDOW_THICKNESS_M / 2);

  return {
    center,
    a: { x: outerA.x, y: outerA.y },
    b: { x: outerB.x, y: outerB.y },
    outerA: { x: outerA.x, y: outerA.y },
    outerB: { x: outerB.x, y: outerB.y },
    corners: [innerA, innerB, { ...outerB }, { ...outerA }],
    widthM: len / pxPerMetre,
  };
}

/**
 * Resize a window by dragging one end. `outerA` stays fixed and the end at
 * `outerB` slides along the wall toward the cursor. The new width snaps to the
 * allowed increments and is capped to the remaining wall length.
 *
 * @param {{ outerA: {x,y}, outerB: {x,y} }} win  the window being resized
 * @param {{ x: number, y: number }} cursor  source-pixel cursor position
 * @param {{ x: number, y: number }[]} outerPoints  external wall polygon (source px)
 * @param {number|null} metresPerPixel
 * @returns {object|null} rebuilt window render, or null
 */
export function resizeWindowFromEndpoint(win, cursor, outerPoints, metresPerPixel = null) {
  return resizeOpeningFromEndpoint(win, cursor, outerPoints, metresPerPixel, snapWindowWidthM);
}

export function resizeSlidingDoorFromEndpoint(door, cursor, outerPoints, metresPerPixel = null) {
  return resizeOpeningFromEndpoint(door, cursor, outerPoints, metresPerPixel, snapSlidingDoorWidthM);
}

function resizeOpeningFromEndpoint(win, cursor, outerPoints, metresPerPixel, snapWidthFn) {
  if (!win?.outerA || !win?.outerB || !cursor) return null;
  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
  if (halfT == null || !(halfT > 0)) return null;
  const pxPerMetre = halfT / (WINDOW_THICKNESS_M / 2);

  const anchor = win.outerA;
  const wdx = win.outerB.x - anchor.x;
  const wdy = win.outerB.y - anchor.y;
  const wlen = Math.hypot(wdx, wdy);
  if (wlen < 1e-6) return null;
  const dir = { x: wdx / wlen, y: wdy / wlen };

  // Wall edge that carries this opening (closest edge whose direction matches).
  const n = outerPoints.length;
  let edge = null;
  for (let i = 0; i < n; i += 1) {
    const a = outerPoints[i];
    const b = outerPoints[(i + 1) % n];
    const proj = projectPointToSegment(anchor.x, anchor.y, a.x, a.y, b.x, b.y);
    const edx = b.x - a.x;
    const edy = b.y - a.y;
    const elen = Math.hypot(edx, edy) || 1;
    const edir = { x: edx / elen, y: edy / elen };
    const align = Math.abs(edir.x * dir.x + edir.y * dir.y);
    const score = proj.dist - align * 4;
    if (!edge || score < edge.score) {
      edge = { score, elen, edir, anchorAlong: proj.t * elen };
    }
  }

  let maxWidthPx = wlen;
  if (edge) {
    const sameDir = edge.edir.x * dir.x + edge.edir.y * dir.y >= 0;
    maxWidthPx = sameDir ? edge.elen - edge.anchorAlong : edge.anchorAlong;
  }
  const maxWidthM = maxWidthPx / pxPerMetre;

  const along = (cursor.x - anchor.x) * dir.x + (cursor.y - anchor.y) * dir.y;
  const targetWidthM = Math.max(0, along / pxPerMetre);
  const widthM = snapWidthFn(targetWidthM, maxWidthM);

  const lenPx = widthM * pxPerMetre;
  const newOuterB = { x: anchor.x + dir.x * lenPx, y: anchor.y + dir.y * lenPx };
  return buildWindowRenderFromEndpoints(anchor, newOuterB, outerPoints, metresPerPixel);
}
