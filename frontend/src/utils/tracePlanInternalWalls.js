import {
  offsetPolygonInward,
  TRACE_FOOTPRINT_TARGET_M,
  TRACE_WALL_THICKNESS_M,
} from "./tracePlan3D";

function traceScaleParams(points, metresPerPixel = null) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const maxSpan = Math.max(maxX - minX, maxY - minY, 1);
  // Prefer a measured metres-per-pixel (calibration line); otherwise assume the
  // longest traced side equals TRACE_FOOTPRINT_TARGET_M (legacy fallback).
  const metresPerUnit =
    metresPerPixel && metresPerPixel > 0 ? metresPerPixel : TRACE_FOOTPRINT_TARGET_M / maxSpan;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { metresPerUnit, cx, cy };
}

function sourceToMetreRing(points, metresPerPixel = null) {
  const params = traceScaleParams(points, metresPerPixel);
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
 * Offset the outer wall trace inward by `offsetM` (metres) in PDF source coords.
 */
export function externalWallOffsetBoundarySource(
  outerPoints,
  offsetM,
  metresPerPixel = null
) {
  if (!Array.isArray(outerPoints) || outerPoints.length < 3) return null;
  if (!(offsetM > 0)) return null;
  const { ring, params } = sourceToMetreRing(outerPoints, metresPerPixel);
  const offset = offsetPolygonInward(ring, offsetM);
  if (!offset || offset.length < 3) return null;
  return metreRingToSource(offset, params);
}

/**
 * Inner face of external walls in PDF source coordinates (inside edge of wall band).
 * @param {{ x: number, y: number }[]} outerPoints
 * @returns {{ x: number, y: number }[] | null}
 */
export function externalWallInnerBoundarySource(outerPoints, metresPerPixel = null) {
  return externalWallOffsetBoundarySource(outerPoints, TRACE_WALL_THICKNESS_M, metresPerPixel);
}

/** Centreline of the 100 mm external wall band in PDF source coordinates. */
export function externalWallCentreBoundarySource(outerPoints, metresPerPixel = null) {
  return externalWallOffsetBoundarySource(
    outerPoints,
    TRACE_WALL_THICKNESS_M / 2,
    metresPerPixel
  );
}

/** Half-width of a 100 mm internal wall band in PDF source coordinates. */
export function internalWallHalfThicknessSource(outerPoints, metresPerPixel = null) {
  if (!outerPoints?.length) return null;
  const { metresPerUnit } = traceScaleParams(outerPoints, metresPerPixel);
  return TRACE_WALL_THICKNESS_M / 2 / metresPerUnit;
}

/**
 * 100 mm wall band corners in PDF source coordinates (matches 3D wall thickness).
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }} segment
 * @param {{ x: number, y: number }[]} outerPoints
 * @returns {{ x: number, y: number }[] | null}
 */
export function internalWallSegmentSourceFootprint(segment, outerPoints, metresPerPixel = null) {
  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
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
    if (index === segmentIndex || !seg?.a || !seg?.b) return;
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
    if (!other?.a || !other?.b) continue;
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
    // Near face is halfT back from the crossing centerline along the approach.
    return { x: junction.x - uA.x * halfT, y: junction.y - uA.y * halfT };
  }

  // hit is already on the near face of the crossing wall — do not pull back again.
  return hit;
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

function distanceToRing(point, ring) {
  if (!point || !ring?.length) return Infinity;
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    const dSq = distanceToSegmentSq(
      point.x,
      point.y,
      ring[i].x,
      ring[i].y,
      ring[j].x,
      ring[j].y
    );
    if (dSq < best) best = dSq;
  }
  return Math.sqrt(best);
}

function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pullEndpointToInnerFace(end, other, inner, centre, halfT) {
  if (!end || !other) return end;
  const len = Math.hypot(other.x - end.x, other.y - end.y);
  if (len < MIN_SEGMENT_LEN) return end;

  const edgeTol = Math.min(1.5, halfT * 0.08);
  if (inner && pointInPolygon(end, inner, edgeTol)) return end;

  if (inner && pointInPolygon(other, inner, edgeTol)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      const p = lerpPoint(other, end, mid);
      if (pointInPolygon(p, inner, edgeTol)) lo = mid;
      else hi = mid;
    }
    return lerpPoint(other, end, lo);
  }

  const onCentre = centre && distanceToRing(end, centre) <= halfT * 1.25;
  if (!onCentre) return end;
  const t = Math.min(0.49, halfT / len);
  return lerpPoint(end, other, t);
}

/**
 * Snap targets the external-wall centreline; the drawn 100 mm band must stop
 * at the inner face so it does not overlap the external wall thickness.
 */
export function trimInternalWallSegmentToExternalInner(
  seg,
  outerPoints,
  metresPerPixel = null
) {
  if (!seg?.a || !seg?.b) return null;
  const inner = externalWallInnerBoundarySource(outerPoints, metresPerPixel);
  const centre = externalWallCentreBoundarySource(outerPoints, metresPerPixel);
  if (!inner && !centre) return seg;
  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel) ?? 2;
  const a = pullEndpointToInnerFace(seg.a, seg.b, inner, centre, halfT);
  const b = pullEndpointToInnerFace(seg.b, seg.a, inner, centre, halfT);
  if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_SEGMENT_LEN) return null;
  return { a, b };
}

/** Pull a snap/node point back to the inner face for display (snap can stay on centre). */
export function internalWallSnapPointForDisplay(
  point,
  outerPoints,
  metresPerPixel = null,
  toward = null
) {
  if (!point || !outerPoints?.length) return point;
  const inner = externalWallInnerBoundarySource(outerPoints, metresPerPixel);
  if (!inner || inner.length < 3) return point;
  const other = toward || {
    x: inner.reduce((sum, p) => sum + p.x, 0) / inner.length,
    y: inner.reduce((sum, p) => sum + p.y, 0) / inner.length,
  };
  const trimmed = trimInternalWallSegmentToExternalInner(
    { a: point, b: other },
    outerPoints,
    metresPerPixel
  );
  return trimmed?.a || point;
}

export function internalWallSegmentSourceFootprintForRender(
  seg,
  segmentIndex,
  segments,
  outerPoints,
  metresPerPixel = null
) {
  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
  if (halfT == null) return null;
  const renderSeg = internalWallSegmentForRender(seg, segmentIndex, segments, halfT);
  if (!renderSeg) return null;
  const trimmed = trimInternalWallSegmentToExternalInner(
    renderSeg,
    outerPoints,
    metresPerPixel
  );
  if (!trimmed) return null;
  return internalWallSegmentSourceFootprint(trimmed, outerPoints, metresPerPixel);
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
export function buildInternalWallVisibleOutlines(
  segments,
  halfT,
  outerPoints = null,
  metresPerPixel = null
) {
  if (!halfT || !segments?.length) return [];

  const display = outerPoints
    ? segments.map(
        (seg) =>
          trimInternalWallSegmentToExternalInner(seg, outerPoints, metresPerPixel) ||
          null
      )
    : segments;

  const lines = [];

  const inner = outerPoints
    ? externalWallInnerBoundarySource(outerPoints, metresPerPixel)
    : null;

  display.forEach((seg, segmentIndex) => {
    if (!seg?.a || !seg?.b) return;
    const posA = endpointSidePoint(segmentIndex, "a", "pos", display, halfT);
    const posB = endpointSidePoint(segmentIndex, "b", "pos", display, halfT);
    const negA = endpointSidePoint(segmentIndex, "a", "neg", display, halfT);
    const negB = endpointSidePoint(segmentIndex, "b", "neg", display, halfT);
    if (!posA || !posB || !negA || !negB) return;

    lines.push({ a: posA, b: posB });
    lines.push({ a: negA, b: negB });

    const capTol = halfT * 1.25;
    const buttsExternal = (point) => inner && distanceToRing(point, inner) <= capTol;
    if (
      !lCornerAtEndpoint(segmentIndex, "a", display, halfT) &&
      !tJunctionAtEndpoint(segmentIndex, "a", display, halfT) &&
      !buttsExternal(seg.a)
    ) {
      lines.push({ a: posA, b: negA });
    }
    if (
      !lCornerAtEndpoint(segmentIndex, "b", display, halfT) &&
      !tJunctionAtEndpoint(segmentIndex, "b", display, halfT) &&
      !buttsExternal(seg.b)
    ) {
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
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  return t;
}

function findSegmentPolygonCrossingT(a, b, polygon, tolerance) {
  const aIn = pointInPolygon(a, polygon, tolerance);
  const bIn = pointInPolygon(b, polygon, tolerance);
  if (aIn === bIn) return null;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    const p = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
    if (pointInPolygon(p, polygon, tolerance) === aIn) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function segmentLineIntersectionXY(p1, p2, a, b) {
  const denom = (p1.x - p2.x) * (a.y - b.y) - (p1.y - p2.y) * (a.x - b.x);
  if (Math.abs(denom) < 1e-12) return null;
  const t =
    ((p1.x - a.x) * (a.y - b.y) - (p1.y - a.y) * (a.x - b.x)) / denom;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function isInsideClipEdgeXY(point, a, b) {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= -1e-9;
}

function clipPolygonToHalfPlaneXY(polygon, a, b) {
  if (!polygon.length) return [];
  const output = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const previous = polygon[(i - 1 + polygon.length) % polygon.length];
    const currInside = isInsideClipEdgeXY(current, a, b);
    const prevInside = isInsideClipEdgeXY(previous, a, b);
    if (currInside) {
      if (!prevInside) {
        const hit = segmentLineIntersectionXY(previous, current, a, b);
        if (hit) output.push(hit);
      }
      output.push(current);
    } else if (prevInside) {
      const hit = segmentLineIntersectionXY(previous, current, a, b);
      if (hit) output.push(hit);
    }
  }
  return output;
}

function clipPolygonToRingInterior(polygon, ring) {
  if (!polygon?.length || !ring || ring.length < 3) return [];
  let signedArea = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    signedArea += ring[i].x * ring[j].y - ring[j].x * ring[i].y;
  }
  const ccw = signedArea > 0;
  let result = polygon.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    const a = ccw ? ring[i] : ring[j];
    const b = ccw ? ring[j] : ring[i];
    result = clipPolygonToHalfPlaneXY(result, a, b);
    if (!result.length) return [];
  }
  return result;
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

  if (ts.size === 2) {
    const crossT = findSegmentPolygonCrossingT(a, b, polygon, tolerance);
    if (crossT != null) ts.add(Math.max(0, Math.min(1, crossT)));
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
export function finalizeInternalWallSegment(start, end, outerPoints, metresPerPixel = null) {
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len < MIN_SEGMENT_LEN) return [];
  if (outerPoints?.length >= 3) {
    const visible = trimInternalWallSegmentToExternalInner(
      { a: start, b: end },
      outerPoints,
      metresPerPixel
    );
    if (!visible) return [];
  }
  return [{ a: { x: start.x, y: start.y }, b: { x: end.x, y: end.y } }];
}

function tryMergeCollinearSegments(a, b, epsilon = JUNCTION_EPSILON) {
  if (!a?.a || !a?.b || !b?.a || !b?.b) return null;
  const aVert = Math.abs(a.a.x - a.b.x) <= epsilon;
  const aHorz = Math.abs(a.a.y - a.b.y) <= epsilon;
  const bVert = Math.abs(b.a.x - b.b.x) <= epsilon;
  const bHorz = Math.abs(b.a.y - b.b.y) <= epsilon;
  const share = [a.a, a.b].some((p) => [b.a, b.b].some((q) => pointsCoincideSource(p, q, epsilon)));
  if (!share) return null;
  if (aVert && bVert) {
    if (Math.abs(a.a.x - b.a.x) > epsilon) return null;
    const x = (a.a.x + a.b.x + b.a.x + b.b.x) / 4;
    const ys = [a.a.y, a.b.y, b.a.y, b.b.y];
    return { a: { x, y: Math.min(...ys) }, b: { x, y: Math.max(...ys) } };
  }
  if (aHorz && bHorz) {
    if (Math.abs(a.a.y - b.a.y) > epsilon) return null;
    const y = (a.a.y + a.b.y + b.a.y + b.b.y) / 4;
    const xs = [a.a.x, a.b.x, b.a.x, b.b.x];
    return { a: { x: Math.min(...xs), y }, b: { x: Math.max(...xs), y } };
  }
  return null;
}

function restoreEndpointToExternalCentre(end, other, inner, centre, halfT) {
  if (!end || !other || !centre || halfT == null) return end;
  if (distanceToRing(end, centre) <= halfT * 0.6) return end;
  if (!inner || distanceToRing(end, inner) > halfT * 0.6) return end;
  const len = Math.hypot(end.x - other.x, end.y - other.y);
  if (len < MIN_SEGMENT_LEN) return end;
  const ux = (end.x - other.x) / len;
  const uy = (end.y - other.y) / len;
  const pushed = { x: end.x + ux * halfT, y: end.y + uy * halfT };
  if (distanceToRing(pushed, centre) <= halfT * 1.25) return pushed;
  return end;
}

/**
 * Drop segments that cannot be drawn, then join collinear runs that share an
 * endpoint so leftover T-junction nodes disappear after a wall is deleted.
 */
export function cleanupInternalWallSegments(segments, outerPoints = [], metresPerPixel = null) {
  const next = (segments || [])
    .filter((seg) => {
      if (!seg?.a || !seg?.b) return false;
      if (Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) < MIN_SEGMENT_LEN) return false;
      if (outerPoints.length < 3) return true;
      return Boolean(
        trimInternalWallSegmentToExternalInner(seg, outerPoints, metresPerPixel)
      );
    })
    .map((seg) => ({ a: { ...seg.a }, b: { ...seg.b } }));

  if (outerPoints.length >= 3) {
    const inner = externalWallInnerBoundarySource(outerPoints, metresPerPixel);
    const centre = externalWallCentreBoundarySource(outerPoints, metresPerPixel);
    const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel);
    if (inner && centre && halfT != null) {
      next.forEach((seg) => {
        seg.a = restoreEndpointToExternalCentre(seg.a, seg.b, inner, centre, halfT);
        seg.b = restoreEndpointToExternalCentre(seg.b, seg.a, inner, centre, halfT);
      });
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const merged = tryMergeCollinearSegments(next[i], next[j]);
        if (!merged) continue;
        next.splice(j, 1);
        next[i] = merged;
        changed = true;
        break outer;
      }
    }
  }
  return next;
}

/**
 * Clip an internal wall segment to the drawable area inside external walls.
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }} segment
 * @param {{ x: number, y: number }[]} externalOuterPoints
 */
export function clipInternalWallSegment(segment, externalOuterPoints, metresPerPixel = null) {
  const inner = externalWallInnerBoundarySource(externalOuterPoints, metresPerPixel);
  if (!inner) return [];
  const halfT = internalWallHalfThicknessSource(externalOuterPoints, metresPerPixel) ?? 2;
  return clipSegmentToPolygonInterior(
    segment.a,
    segment.b,
    inner,
    Math.max(2, halfT * 0.25)
  );
}
