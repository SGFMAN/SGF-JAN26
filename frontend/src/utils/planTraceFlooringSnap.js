import { collectOrthoReferenceAxes, resolvePolygonOrthoSnap } from "./planTraceOrthoSnap";
import {
  externalWallInnerBoundarySource,
  internalWallSegmentSourceFootprintForRender,
} from "./tracePlanInternalWalls";

/**
 * Collect snap edges: inside face of external walls + all edges of internal wall bands.
 * @returns {{ a: {x,y}, b: {x,y} }[]}
 */
export function collectFlooringSnapEdges(
  externalOuterPoints,
  internalSegments,
  metresPerPixel = null
) {
  const edges = [];
  if (!externalOuterPoints || externalOuterPoints.length < 3) return edges;

  const inner = externalWallInnerBoundarySource(externalOuterPoints, metresPerPixel);
  if (inner?.length >= 3) {
    for (let i = 0; i < inner.length; i += 1) {
      edges.push({ a: inner[i], b: inner[(i + 1) % inner.length] });
    }
  }

  const segs = Array.isArray(internalSegments) ? internalSegments : [];
  for (let i = 0; i < segs.length; i += 1) {
    const fp = internalWallSegmentSourceFootprintForRender(
      segs[i],
      i,
      segs,
      externalOuterPoints,
      metresPerPixel
    );
    if (!fp || fp.length < 3) continue;
    for (let j = 0; j < fp.length; j += 1) {
      edges.push({ a: fp[j], b: fp[(j + 1) % fp.length] });
    }
  }
  return edges;
}

function projectPointToNearestEdgeList(cursor, edges) {
  if (!cursor || !edges?.length) return null;
  let best = null;
  for (let i = 0; i < edges.length; i += 1) {
    const { a, b } = edges[i];
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
      best = { point: { x, y }, dist, a, b, edgeIndex: i };
    }
  }
  return best;
}

export function resolveFlooringStartSnap(cursor, edges, snapThreshold = 16) {
  const hit = projectPointToNearestEdgeList(cursor, edges);
  if (!hit || hit.dist > snapThreshold) return null;
  return {
    point: hit.point,
    kind: "wall",
    guides: [
      { x1: hit.a.x, y1: hit.a.y, x2: hit.b.x, y2: hit.b.y, emphasis: true },
      { x1: hit.point.x - 1e6, y1: hit.point.y, x2: hit.point.x + 1e6, y2: hit.point.y },
      { x1: hit.point.x, y1: hit.point.y - 1e6, x2: hit.point.x, y2: hit.point.y + 1e6 },
    ],
  };
}

/**
 * Ortho corner snap with soft-snap onto flooring wall edges (inner external + internal).
 */
export function resolveFlooringPolygonSnap(prev, cursor, origin, edges, options = {}) {
  const snapThreshold = Number.isFinite(options.snapThreshold) ? options.snapThreshold : 12;
  const axisPoints = [];
  for (const e of edges || []) {
    if (e?.a) axisPoints.push(e.a);
    if (e?.b) axisPoints.push(e.b);
  }
  const referenceAxes = collectOrthoReferenceAxes(
    axisPoints.length >= 2 ? axisPoints : [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  );
  const base = resolvePolygonOrthoSnap(prev, cursor, origin, {
    snapThreshold,
    referenceAxes,
  });

  const edgeHit = projectPointToNearestEdgeList(base.point, edges);
  const edgeHitCursor = projectPointToNearestEdgeList(cursor, edges);
  const candidates = [edgeHit, edgeHitCursor].filter(
    (hit) => hit && hit.dist <= snapThreshold
  );

  let bestWall = null;
  let bestDist = Infinity;
  for (const hit of candidates) {
    const dx = Math.abs(hit.point.x - prev.x);
    const dy = Math.abs(hit.point.y - prev.y);
    const isOrtho = dx <= 1e-6 || dy <= 1e-6;
    if (!isOrtho) continue;
    const aligned =
      dx <= 1e-6
        ? { x: prev.x, y: hit.point.y }
        : { x: hit.point.x, y: prev.y };
    const alignedHit = projectPointToNearestEdgeList(aligned, edges);
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
