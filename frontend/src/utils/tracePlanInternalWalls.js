import {
  offsetPolygonInward,
  TRACE_FOOTPRINT_TARGET_M,
  TRACE_WALL_THICKNESS_M,
} from "./tracePlan3D";

function traceScaleParams(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const maxSpan = Math.max(maxX - minX, maxY - minY, 1);
  const metresPerUnit = TRACE_FOOTPRINT_TARGET_M / maxSpan;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { metresPerUnit, cx, cy };
}

function sourceToMetreRing(points) {
  const params = traceScaleParams(points);
  return {
    ring: points.map((p) => ({
      x: (p.x - params.cx) * params.metresPerUnit,
      z: -(p.y - params.cy) * params.metresPerUnit,
    })),
    params,
  };
}

function metreRingToSource(ring, params) {
  const { metresPerUnit, cx, cy } = params;
  return ring.map((p) => ({
    x: p.x / metresPerUnit + cx,
    y: -p.z / metresPerUnit + cy,
  }));
}

/**
 * Inner face of external walls in PDF source coordinates (inside edge of wall band).
 * @param {{ x: number, y: number }[]} outerPoints
 * @returns {{ x: number, y: number }[] | null}
 */
export function externalWallInnerBoundarySource(outerPoints) {
  if (!Array.isArray(outerPoints) || outerPoints.length < 3) return null;
  const { ring, params } = sourceToMetreRing(outerPoints);
  const inner = offsetPolygonInward(ring, TRACE_WALL_THICKNESS_M);
  if (!inner || inner.length < 3) return null;
  return metreRingToSource(inner, params);
}

/** Half-width of a 100 mm internal wall band in PDF source coordinates. */
export function internalWallHalfThicknessSource(outerPoints) {
  if (!outerPoints?.length) return null;
  const { metresPerUnit } = traceScaleParams(outerPoints);
  return TRACE_WALL_THICKNESS_M / 2 / metresPerUnit;
}

/**
 * 100 mm wall band corners in PDF source coordinates (matches 3D wall thickness).
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }} segment
 * @param {{ x: number, y: number }[]} outerPoints
 * @returns {{ x: number, y: number }[] | null}
 */
export function internalWallSegmentSourceFootprint(segment, outerPoints) {
  const halfT = internalWallHalfThicknessSource(outerPoints);
  if (halfT == null) return null;

  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const len = Math.hypot(dx, dy);
  if (len < MIN_SEGMENT_LEN) return null;

  const nx = (-dy / len) * halfT;
  const ny = (dx / len) * halfT;

  return [
    { x: segment.a.x + nx, y: segment.a.y + ny },
    { x: segment.b.x + nx, y: segment.b.y + ny },
    { x: segment.b.x - nx, y: segment.b.y - ny },
    { x: segment.a.x - nx, y: segment.a.y - ny },
  ];
}

const MIN_SEGMENT_LEN = 0.5;
const JUNCTION_EPSILON = 0.75;
const MIN_CORNER_ANGLE_RAD = (12 * Math.PI) / 180;
const MAX_CORNER_ANGLE_RAD = (168 * Math.PI) / 180;

function pointsCoincideSource(a, b, epsilon = JUNCTION_EPSILON) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= epsilon;
}

function normalizeVec(x, y) {
  const len = Math.hypot(x, y);
  if (len < MIN_SEGMENT_LEN) return null;
  return { x: x / len, y: y / len };
}

function lineIntersectionPoint(ax, ay, ux, uy, bx, by, vx, vy) {
  const denom = ux * vy - uy * vx;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = bx - ax;
  const dy = by - ay;
  const t = (dx * vy - dy * vx) / denom;
  return { x: ax + ux * t, y: ay + uy * t };
}

function outwardNormals(u1x, u1y, u2x, u2y) {
  const cross = u1x * u2y - u1y * u2x;
  const p1x = -u1y;
  const p1y = u1x;
  const p2x = -u2y;
  const p2y = u2x;
  if (cross >= 0) {
    return { n1x: -p1x, n1y: -p1y, n2x: -p2x, n2y: -p2y };
  }
  return { n1x: p1x, n1y: p1y, n2x: p2x, n2y: p2y };
}

function interiorAngleBetween(u1x, u1y, u2x, u2y) {
  const c = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
  return Math.acos(c);
}

/**
 * Where outer/inner face lines meet at an L-corner (square butt, not a diagonal miter).
 */
export function computeWallCornerPoints(junction, u1, u2, halfT) {
  const { n1x, n1y, n2x, n2y } = outwardNormals(u1.x, u1.y, u2.x, u2.y);
  const outerCorner = lineIntersectionPoint(
    junction.x + n1x * halfT,
    junction.y + n1y * halfT,
    u1.x,
    u1.y,
    junction.x + n2x * halfT,
    junction.y + n2y * halfT,
    u2.x,
    u2.y
  );
  const innerCorner = lineIntersectionPoint(
    junction.x - n1x * halfT,
    junction.y - n1y * halfT,
    u1.x,
    u1.y,
    junction.x - n2x * halfT,
    junction.y - n2y * halfT,
    u2.x,
    u2.y
  );
  return { outerCorner, innerCorner };
}

function directionIntoSegmentFromVertex(segment, vertex) {
  const junction = segment[vertex];
  const other = vertex === "a" ? segment.b : segment.a;
  return normalizeVec(other.x - junction.x, other.y - junction.y);
}

function findPartnerAtJunction(segmentIndex, vertex, segments) {
  const junction = segments[segmentIndex]?.[vertex];
  if (!junction) return null;

  let partner = null;
  segments.forEach((seg, index) => {
    if (index === segmentIndex) return;
    ["a", "b"].forEach((v) => {
      if (!pointsCoincideSource(seg[v], junction)) return;
      const u2 = directionIntoSegmentFromVertex(seg, v);
      if (!u2) return;
      partner = { segmentIndex: index, vertex: v, u2 };
    });
  });
  return partner;
}

function lCornerAtEndpoint(segmentIndex, vertex, segments, halfT) {
  const segment = segments[segmentIndex];
  if (!segment || halfT == null) return null;

  const u1 = directionIntoSegmentFromVertex(segment, vertex);
  const partner = findPartnerAtJunction(segmentIndex, vertex, segments);
  if (!u1 || !partner) return null;

  const theta = interiorAngleBetween(u1.x, u1.y, partner.u2.x, partner.u2.y);
  if (theta < MIN_CORNER_ANGLE_RAD || theta > MAX_CORNER_ANGLE_RAD) return null;

  const junction = segment[vertex];
  const { outerCorner, innerCorner } = computeWallCornerPoints(
    junction,
    u1,
    partner.u2,
    halfT
  );
  if (!outerCorner || !innerCorner) return null;

  return { junction, u1, u2: partner.u2, outerCorner, innerCorner };
}

function projectPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < MIN_SEGMENT_LEN * MIN_SEGMENT_LEN) {
    return { x: ax, y: ay, t: 0, dist: Math.hypot(px - ax, py - ay) };
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, t, dist: Math.hypot(px - x, py - y) };
}

function directionTowardVertex(segment, vertex) {
  const junction = segment[vertex];
  const other = vertex === "a" ? segment.b : segment.a;
  return normalizeVec(junction.x - other.x, junction.y - other.y);
}

/** Endpoint lies on another wall's centerline interior (T), not an L-corner. */
function tJunctionAtEndpoint(segmentIndex, vertex, segments, halfT) {
  if (lCornerAtEndpoint(segmentIndex, vertex, segments, halfT)) return null;

  const junction = segments[segmentIndex]?.[vertex];
  if (!junction) return null;

  for (let i = 0; i < segments.length; i += 1) {
    if (i === segmentIndex) continue;
    const other = segments[i];
    const proj = projectPointOnSegment(
      junction.x,
      junction.y,
      other.a.x,
      other.a.y,
      other.b.x,
      other.b.y
    );
    if (proj.t > 0.04 && proj.t < 0.96 && proj.dist <= JUNCTION_EPSILON) {
      return { obstructingIndex: i, junction };
    }
  }
  return null;
}

/**
 * Centerline endpoint for rendering: at a T, stop at the near face of the crossing wall.
 */
function effectiveEndpointCenter(segmentIndex, vertex, segments, halfT) {
  const seg = segments[segmentIndex];
  if (!seg) return null;

  const junction = seg[vertex];
  if (lCornerAtEndpoint(segmentIndex, vertex, segments, halfT)) {
    return { ...junction };
  }

  const tJ = tJunctionAtEndpoint(segmentIndex, vertex, segments, halfT);
  if (!tJ) return { ...junction };

  const other = vertex === "a" ? seg.b : seg.a;
  const uA = directionTowardVertex(seg, vertex);
  if (!uA) return { ...junction };

  const bSeg = segments[tJ.obstructingIndex];
  const uB = normalizeVec(bSeg.b.x - bSeg.a.x, bSeg.b.y - bSeg.a.y);
  if (!uB) return { ...junction };

  const nB = { x: -uB.y, y: uB.x };
  const fromOther = { x: other.x - junction.x, y: other.y - junction.y };
  const sign = fromOther.x * nB.x + fromOther.y * nB.y >= 0 ? 1 : -1;
  const facePoint = {
    x: junction.x + nB.x * halfT * sign,
    y: junction.y + nB.y * halfT * sign,
  };

  const hit = lineIntersectionPoint(
    other.x,
    other.y,
    uA.x,
    uA.y,
    facePoint.x,
    facePoint.y,
    uB.x,
    uB.y
  );
  if (!hit) {
    return { x: junction.x - uA.x * 2 * halfT, y: junction.y - uA.y * 2 * halfT };
  }

  return { x: hit.x - uA.x * halfT, y: hit.y - uA.y * halfT };
}

/**
 * Segment endpoints adjusted for T-junction face cropping in the trace view.
 */
export function internalWallSegmentForRender(seg, segmentIndex, segments, halfT) {
  const a = effectiveEndpointCenter(segmentIndex, "a", segments, halfT);
  const b = effectiveEndpointCenter(segmentIndex, "b", segments, halfT);
  if (!a || !b) return seg;
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_SEGMENT_LEN) return null;
  return { a, b };
}

export function internalWallSegmentSourceFootprintForRender(
  seg,
  segmentIndex,
  segments,
  outerPoints
) {
  const halfT = internalWallHalfThicknessSource(outerPoints);
  if (halfT == null) return null;
  const renderSeg = internalWallSegmentForRender(seg, segmentIndex, segments, halfT);
  if (!renderSeg) return null;
  return internalWallSegmentSourceFootprint(renderSeg, outerPoints);
}

function endpointSidePoint(segmentIndex, vertex, side, segments, halfT) {
  const seg = segments[segmentIndex];
  if (!seg) return null;

  const junction = effectiveEndpointCenter(segmentIndex, vertex, segments, halfT);
  if (!junction) return null;

  const segDx = seg.b.x - seg.a.x;
  const segDy = seg.b.y - seg.a.y;
  const segLen = Math.hypot(segDx, segDy);
  if (segLen < MIN_SEGMENT_LEN) return null;

  const segNx = -segDy / segLen;
  const segNy = segDx / segLen;
  const sign = side === "pos" ? 1 : -1;

  const lCorner = lCornerAtEndpoint(segmentIndex, vertex, segments, halfT);
  if (lCorner) {
    const outerOnPosSide =
      (lCorner.outerCorner.x - lCorner.junction.x) * segNx +
        (lCorner.outerCorner.y - lCorner.junction.y) * segNy >
      0;
    if (side === "pos") {
      return { ...(outerOnPosSide ? lCorner.outerCorner : lCorner.innerCorner) };
    }
    return { ...(outerOnPosSide ? lCorner.innerCorner : lCorner.outerCorner) };
  }

  return { x: junction.x + segNx * halfT * sign, y: junction.y + segNy * halfT * sign };
}

/**
 * Visible wall outline edges only — two face lines per run, square end caps at free ends,
 * 90° turn at L-corners (no diagonal miter).
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} segments
 * @param {number} halfT
 * @returns {{ a: { x: number, y: number }, b: { x: number, y: number } }[]}
 */
export function buildInternalWallVisibleOutlines(segments, halfT) {
  if (!halfT || !segments?.length) return [];

  const lines = [];

  segments.forEach((_, segmentIndex) => {
    const posA = endpointSidePoint(segmentIndex, "a", "pos", segments, halfT);
    const posB = endpointSidePoint(segmentIndex, "b", "pos", segments, halfT);
    const negA = endpointSidePoint(segmentIndex, "a", "neg", segments, halfT);
    const negB = endpointSidePoint(segmentIndex, "b", "neg", segments, halfT);
    if (!posA || !posB || !negA || !negB) return;

    lines.push({ a: posA, b: posB });
    lines.push({ a: negA, b: negB });

    if (!lCornerAtEndpoint(segmentIndex, "a", segments, halfT) && !tJunctionAtEndpoint(segmentIndex, "a", segments, halfT)) {
      lines.push({ a: posA, b: negA });
    }
    if (!lCornerAtEndpoint(segmentIndex, "b", segments, halfT) && !tJunctionAtEndpoint(segmentIndex, "b", segments, halfT)) {
      lines.push({ a: posB, b: negB });
    }
  });

  return lines;
}

/**
 * Outer/inner corner vertices at L-junctions (for vertical edge markers in 3D).
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} segments
 * @param {number} halfT
 */
export function collectInternalWallLCornerVertices(segments, halfT) {
  if (!halfT || !segments?.length) return [];

  const corners = [];
  const seen = new Set();

  segments.forEach((_, segmentIndex) => {
    ["a", "b"].forEach((vertex) => {
      const corner = lCornerAtEndpoint(segmentIndex, vertex, segments, halfT);
      if (!corner) return;

      const key = [
        Math.round(corner.junction.x * 10),
        Math.round(corner.junction.y * 10),
      ].join(",");
      if (seen.has(key)) return;
      seen.add(key);

      corners.push({
        outerCorner: corner.outerCorner,
        innerCorner: corner.innerCorner,
      });
    });
  });

  return corners;
}

function distanceToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return (px - x) ** 2 + (py - y) ** 2;
}

/**
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number }[]} polygon
 * @param {number} tolerance
 */
export function pointInPolygon(point, polygon, tolerance = 0) {
  if (tolerance > 0) {
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (
        distanceToSegmentSq(
          point.x,
          point.y,
          polygon[i].x,
          polygon[i].y,
          polygon[j].x,
          polygon[j].y
        ) <=
        tolerance * tolerance
      ) {
        return true;
      }
    }
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentEdgeIntersectionT(ax, ay, bx, by, cx, cy, dx, dy) {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  if (u < 0 || u > 1) return null;
  return t;
}

/**
 * Keep only the portions of a segment inside a closed polygon.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ x: number, y: number }[]} polygon
 * @returns {{ a: { x: number, y: number }, b: { x: number, y: number } }[]}
 */
export function clipSegmentToPolygonInterior(a, b, polygon, tolerance = 1) {
  if (!polygon || polygon.length < 3) return [];

  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < MIN_SEGMENT_LEN) return [];

  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (
    pointInPolygon(a, polygon, tolerance) &&
    pointInPolygon(b, polygon, tolerance) &&
    pointInPolygon(mid, polygon, tolerance)
  ) {
    return [{ a, b }];
  }

  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const ts = new Set([0, 1]);
  const n = polygon.length;

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const t = segmentEdgeIntersectionT(
      ax,
      ay,
      bx,
      by,
      polygon[i].x,
      polygon[i].y,
      polygon[j].x,
      polygon[j].y
    );
    if (t !== null && t >= -1e-9 && t <= 1 + 1e-9) ts.add(Math.max(0, Math.min(1, t)));
  }

  const sorted = [...ts].sort((x, y) => x - y);
  const result = [];

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t0 = sorted[i];
    const t1 = sorted[i + 1];
    const midT = (t0 + t1) / 2;
    const mx = ax + (bx - ax) * midT;
    const my = ay + (by - ay) * midT;
    if (!pointInPolygon({ x: mx, y: my }, polygon, tolerance)) continue;

    const segA = { x: ax + (bx - ax) * t0, y: ay + (by - ay) * t0 };
    const segB = { x: ax + (bx - ax) * t1, y: ay + (by - ay) * t1 };
    if (Math.hypot(segB.x - segA.x, segB.y - segA.y) >= MIN_SEGMENT_LEN) {
      result.push({ a: segA, b: segB });
    }
  }

  return result;
}

/**
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @param {{ x: number, y: number }[]} outerPoints
 * @returns {{ a: { x: number, y: number }, b: { x: number, y: number } }[]}
 */
export function finalizeInternalWallSegment(start, end, outerPoints) {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len < MIN_SEGMENT_LEN) return [];

  const inner = externalWallInnerBoundarySource(outerPoints);
  if (!inner || outerPoints.length < 3) {
    return [{ a: start, b: end }];
  }

  const innerParts = clipSegmentToPolygonInterior(start, end, inner);
  if (innerParts.length > 0) return innerParts;

  const outerParts = clipSegmentToPolygonInterior(start, end, outerPoints);
  if (outerParts.length > 0) return outerParts;

  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  if (pointInPolygon(mid, inner, 2) || pointInPolygon(mid, outerPoints, 2)) {
    return [{ a: start, b: end }];
  }

  return [];
}

/**
 * Clip an internal wall segment to the drawable area inside external walls.
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }} segment
 * @param {{ x: number, y: number }[]} externalOuterPoints
 */
export function clipInternalWallSegment(segment, externalOuterPoints) {
  const inner = externalWallInnerBoundarySource(externalOuterPoints);
  if (!inner) return [];
  return clipSegmentToPolygonInterior(segment.a, segment.b, inner);
}
