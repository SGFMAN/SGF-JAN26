import { collectOrthoReferenceAxes, resolvePolygonOrthoSnap } from "./planTraceOrthoSnap";

/**
 * Project a point onto the nearest edge of a polygon.
 *
 * @param {{ x: number, y: number }} cursor
 * @param {{ x: number, y: number }[]} polygon
 * @returns {{
 *   point: { x: number, y: number },
 *   dist: number,
 *   edgeIndex: number,
 *   a: { x: number, y: number },
 *   b: { x: number, y: number },
 * } | null}
 */
export function projectPointToNearestPolygonEdge(cursor, polygon) {
  if (!cursor || !Array.isArray(polygon) || polygon.length < 2) return null;
  const n = polygon.length;
  let best = null;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-9) {
      t = ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const dist = Math.hypot(cursor.x - x, cursor.y - y);
    if (!best || dist < best.dist) {
      best = { point: { x, y }, dist, edgeIndex: i, a, b };
    }
  }
  return best;
}

/**
 * Snap a deck start point onto an external wall edge.
 * Returns null when the cursor is too far from any wall.
 *
 * @param {{ x: number, y: number }} cursor
 * @param {{ x: number, y: number }[]} wallPoints
 * @param {number} snapThreshold
 */
export function resolveDeckStartSnap(cursor, wallPoints, snapThreshold = 16) {
  const hit = projectPointToNearestPolygonEdge(cursor, wallPoints);
  if (!hit || hit.dist > snapThreshold) return null;
  return {
    point: hit.point,
    kind: "wall",
    guides: [
      { x1: hit.a.x, y1: hit.a.y, x2: hit.b.x, y2: hit.b.y, emphasis: true },
      { x1: hit.point.x - 1e6, y1: hit.point.y, x2: hit.point.x + 1e6, y2: hit.point.y },
      { x1: hit.point.x, y1: hit.point.y - 1e6, x2: hit.point.x, y2: hit.point.y + 1e6 },
    ],
    edgeIndex: hit.edgeIndex,
  };
}

/**
 * Deck corner snap: H/V like walls, wall-axis guides like roof, and soft-snap
 * onto the external wall perimeter so the deck stays wall-aligned.
 *
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} cursor
 * @param {{ x: number, y: number } | null} origin
 * @param {{ x: number, y: number }[]} wallPoints
 * @param {{ snapThreshold?: number }} [options]
 */
export function resolveDeckPolygonSnap(prev, cursor, origin, wallPoints, options = {}) {
  const snapThreshold = Number.isFinite(options.snapThreshold) ? options.snapThreshold : 12;
  const referenceAxes = collectOrthoReferenceAxes(wallPoints);
  const base = resolvePolygonOrthoSnap(prev, cursor, origin, {
    snapThreshold,
    referenceAxes,
  });

  // Prefer landing on the wall when the ortho point (or cursor) is near an edge,
  // but only if that wall hit stays H/V from the previous corner.
  const wallHit = projectPointToNearestPolygonEdge(base.point, wallPoints);
  const wallHitCursor = projectPointToNearestPolygonEdge(cursor, wallPoints);
  const candidates = [wallHit, wallHitCursor].filter(
    (hit) => hit && hit.dist <= snapThreshold
  );

  let bestWall = null;
  let bestDist = Infinity;
  for (const hit of candidates) {
    const dx = Math.abs(hit.point.x - prev.x);
    const dy = Math.abs(hit.point.y - prev.y);
    const isOrtho = dx <= 1e-6 || dy <= 1e-6;
    if (!isOrtho) continue;
    // Prefer exact wall-axis alignment: horizontal from prev → same Y; vertical → same X.
    const aligned =
      dx <= 1e-6
        ? { x: prev.x, y: hit.point.y }
        : { x: hit.point.x, y: prev.y };
    // Re-project aligned point onto the wall edge if needed.
    const alignedHit = projectPointToNearestPolygonEdge(aligned, wallPoints);
    const usePoint =
      alignedHit && alignedHit.dist <= snapThreshold ? alignedHit.point : aligned;
    const stillOrtho =
      Math.abs(usePoint.x - prev.x) <= 1e-6 || Math.abs(usePoint.y - prev.y) <= 1e-6;
    if (!stillOrtho) continue;
    const dist = Math.hypot(usePoint.x - cursor.x, usePoint.y - cursor.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestWall = {
        point: usePoint,
        kind: "wall",
        guides: [
          ...base.guides,
          {
            x1: usePoint.x,
            y1: usePoint.y,
            x2: prev.x,
            y2: prev.y,
            emphasis: true,
          },
        ],
      };
    }
  }

  if (bestWall) return bestWall;
  return base;
}
