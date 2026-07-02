import * as THREE from "three";
import { buildExtrudedFootprintMesh } from "./siteBoundaryMesh";

export const TRACE_WALL_HEIGHT_M = 3.2;
export const TRACE_WALL_BASE_M = 0.65;
export const TRACE_SUBFLOOR_TOP_M = 0.649;
export const TRACE_SUBFLOOR_COLOR = 0x323233;
export const TRACE_WALL_THICKNESS_M = 0.1;
export const TRACE_FOOTPRINT_TARGET_M = 14;
export const DEFAULT_CAMERA_HEIGHT_M = 1.8;
export const CAMERA_HEIGHT_STEP_M = 0.5;
export const MIN_CAMERA_HEIGHT_M = 0.5;
export const MAX_CAMERA_HEIGHT_M = 10;
export const TRACE_WALL_TOP_M = TRACE_WALL_BASE_M + TRACE_WALL_HEIGHT_M;
/** World Y the camera aims at — wall mid-height keeps the model centred as height changes. */
export const TRACE_MODEL_FOCUS_Y_M = TRACE_WALL_BASE_M + TRACE_WALL_HEIGHT_M * 0.5;

/**
 * Look-at height for a given camera elevation. Higher camera = more downward pitch toward the model.
 * @param {number} cameraHeightM
 * @returns {number}
 */
export function tracePlanLookAtHeight(cameraHeightM) {
  const focusY = TRACE_MODEL_FOCUS_Y_M;
  if (cameraHeightM <= DEFAULT_CAMERA_HEIGHT_M) {
    const t = (cameraHeightM - MIN_CAMERA_HEIGHT_M) / (DEFAULT_CAMERA_HEIGHT_M - MIN_CAMERA_HEIGHT_M);
    const lowFocus = focusY * 0.55;
    return lowFocus + (focusY - lowFocus) * Math.max(0, Math.min(1, t));
  }
  return focusY;
}

/**
 * Normalized trace polygon (0–1 on plan page) → XZ ring in metres (trace = outer wall face).
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {{ x: number, z: number }[] | null}
 */
export function tracePolygonToOuterXZRing(normalizedPoints) {
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

  return normalizedPoints.map((p) => ({
    x: -(p.x - cx) * scale,
    z: -(p.y - cy) * scale,
  }));
}

function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    area += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  return area * 0.5;
}

/**
 * Parallel offset of a closed XZ polygon. Positive offsetM = outward; negative = inward.
 * @param {{ x: number, z: number }[]} ring
 * @param {number} offsetM
 * @returns {{ x: number, z: number }[] | null}
 */
export function offsetPolygonXZ(ring, offsetM) {
  const vertexCount = ring.length;
  if (vertexCount < 3 || !Number.isFinite(offsetM) || offsetM === 0) return null;

  let signedArea = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    signedArea += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  const counterClockwise = signedArea > 0;

  const result = [];
  for (let i = 0; i < vertexCount; i += 1) {
    const prev = (i - 1 + vertexCount) % vertexCount;
    const next = (i + 1) % vertexCount;

    const p0 = ring[prev];
    const p1 = ring[i];
    const p2 = ring[next];

    const d1x = p1.x - p0.x;
    const d1z = p1.z - p0.z;
    const d2x = p2.x - p1.x;
    const d2z = p2.z - p1.z;
    const len1 = Math.hypot(d1x, d1z) || 1;
    const len2 = Math.hypot(d2x, d2z) || 1;

    const n1x = counterClockwise ? d1z / len1 : -d1z / len1;
    const n1z = counterClockwise ? -d1x / len1 : d1x / len1;
    const n2x = counterClockwise ? d2z / len2 : -d2z / len2;
    const n2z = counterClockwise ? -d2x / len2 : d2x / len2;

    let bx = n1x + n2x;
    let bz = n1z + n2z;
    const blen = Math.hypot(bx, bz);
    if (blen < 1e-9) {
      bx = n1x;
      bz = n1z;
    } else {
      bx /= blen;
      bz /= blen;
    }

    const dot = Math.max(-1, Math.min(1, n1x * n2x + n1z * n2z));
    const halfAngleCos = Math.sqrt((1 + dot) / 2);
    const miterScale = Math.min(3, 1 / Math.max(0.3, halfAngleCos));
    const scale = offsetM * miterScale;

    result.push({
      x: p1.x + bx * scale,
      z: p1.z + bz * scale,
    });
  }

  return result;
}

/**
 * Offset toward polygon interior regardless of trace winding direction.
 * @param {{ x: number, z: number }[]} ring
 * @param {number} distanceM
 * @returns {{ x: number, z: number }[] | null}
 */
export function offsetPolygonInward(ring, distanceM) {
  if (!ring?.length || distanceM <= 0) return null;

  const outerArea = Math.abs(ringSignedArea(ring));
  if (outerArea < 1e-6) return null;

  const inwardNeg = offsetPolygonXZ(ring, -distanceM);
  const inwardPos = offsetPolygonXZ(ring, distanceM);

  const areaNeg = inwardNeg ? Math.abs(ringSignedArea(inwardNeg)) : Infinity;
  const areaPos = inwardPos ? Math.abs(ringSignedArea(inwardPos)) : Infinity;

  let inner = null;
  if (areaNeg < outerArea && areaNeg <= areaPos) inner = inwardNeg;
  else if (areaPos < outerArea) inner = inwardPos;

  if (!inner || Math.abs(ringSignedArea(inner)) < 1e-6) return null;
  if (Math.abs(ringSignedArea(inner)) >= outerArea * 0.98) return null;

  return inner;
}

function pushTriangle(indices, a, b, c) {
  indices.push(a, b, c);
}

/**
 * Build a solid wall band between outer and inner rings (no interior fill).
 * @param {{ x: number, z: number }[]} outer
 * @param {{ x: number, z: number }[]} inner
 * @param {number} baseYM
 * @param {number} heightM
 * @returns {THREE.BufferGeometry}
 */
function buildWallBandGeometry(outer, inner, baseYM, heightM) {
  const n = outer.length;
  const positions = [];
  const indices = [];
  const topYM = baseYM + heightM;

  const addVertex = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  const outerBottom = [];
  const outerTop = [];
  const innerBottom = [];
  const innerTop = [];

  for (let i = 0; i < n; i += 1) {
    outerBottom.push(addVertex(outer[i].x, baseYM, outer[i].z));
    outerTop.push(addVertex(outer[i].x, topYM, outer[i].z));
    innerBottom.push(addVertex(inner[i].x, baseYM, inner[i].z));
    innerTop.push(addVertex(inner[i].x, topYM, inner[i].z));
  }

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;

    pushTriangle(indices, outerBottom[i], outerBottom[j], outerTop[j]);
    pushTriangle(indices, outerBottom[i], outerTop[j], outerTop[i]);

    pushTriangle(indices, innerBottom[i], innerTop[i], innerTop[j]);
    pushTriangle(indices, innerBottom[i], innerTop[j], innerBottom[j]);

    pushTriangle(indices, outerBottom[i], innerBottom[i], innerBottom[j]);
    pushTriangle(indices, outerBottom[i], innerBottom[j], outerBottom[j]);

    pushTriangle(indices, outerTop[i], outerTop[j], innerTop[j]);
    pushTriangle(indices, outerTop[i], innerTop[j], innerTop[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Shared XZ mapping for trace plan geometry (uses external footprint span).
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {{ scale: number, cx: number, cy: number } | null}
 */
export function getTracePlanXZMapping(normalizedPoints) {
  if (!Array.isArray(normalizedPoints) || normalizedPoints.length < 3) return null;

  const xs = normalizedPoints.map((p) => p.x);
  const ys = normalizedPoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const maxSpan = Math.max(maxX - minX, maxY - minY, 0.001);
  return {
    scale: TRACE_FOOTPRINT_TARGET_M / maxSpan,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * @param {{ x: number, y: number }} point
 * @param {{ scale: number, cx: number, cy: number }} mapping
 * @returns {{ x: number, z: number }}
 */
export function normalizedPointToXZ(point, mapping) {
  return {
    x: -(point.x - mapping.cx) * mapping.scale,
    z: -(point.y - mapping.cy) * mapping.scale,
  };
}

function pushQuad(indices, a, b, c, d) {
  pushTriangle(indices, a, b, c);
  pushTriangle(indices, a, c, d);
}

function internalWallSegmentXZCorners(startXZ, endXZ, thicknessM) {
  const dx = endXZ.x - startXZ.x;
  const dz = endXZ.z - startXZ.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;

  const halfT = thicknessM / 2;
  const nx = (-dz / len) * halfT;
  const nz = (dx / len) * halfT;

  return [
    { x: startXZ.x + nx, z: startXZ.z + nz },
    { x: endXZ.x + nx, z: endXZ.z + nz },
    { x: endXZ.x - nx, z: endXZ.z - nz },
    { x: startXZ.x - nx, z: startXZ.z - nz },
  ];
}

const JUNCTION_EPSILON_XZ = 0.03;
const MIN_CORNER_ANGLE_XZ = (12 * Math.PI) / 180;
const MAX_CORNER_ANGLE_XZ = (168 * Math.PI) / 180;

function pointsCoincideXZ(a, b, epsilon = JUNCTION_EPSILON_XZ) {
  return Math.hypot(a.x - b.x, a.z - b.z) <= epsilon;
}

function normalizeXZ(x, z) {
  const len = Math.hypot(x, z);
  if (len < 0.05) return null;
  return { x: x / len, z: z / len };
}

function lineIntersectionXZ(ax, az, ux, uz, bx, bz, vx, vz) {
  const denom = ux * vz - uz * vx;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = bx - ax;
  const dz = bz - az;
  const t = (dx * vz - dz * vx) / denom;
  return { x: ax + ux * t, z: az + uz * t };
}

function outwardNormalsXZ(u1x, u1z, u2x, u2z) {
  const cross = u1x * u2z - u1z * u2x;
  const p1x = -u1z;
  const p1z = u1x;
  const p2x = -u2z;
  const p2z = u2x;
  if (cross >= 0) {
    return { n1x: -p1x, n1z: -p1z, n2x: -p2x, n2z: -p2z };
  }
  return { n1x: p1x, n1z: p1z, n2x: p2x, n2z: p2z };
}

function interiorAngleXZ(u1x, u1z, u2x, u2z) {
  const c = Math.max(-1, Math.min(1, u1x * u2x + u1z * u2z));
  return Math.acos(c);
}

function computeWallCornerPointsXZ(junction, u1, u2, halfT) {
  const { n1x, n1z, n2x, n2z } = outwardNormalsXZ(u1.x, u1.z, u2.x, u2.z);
  const outerCorner = lineIntersectionXZ(
    junction.x + n1x * halfT,
    junction.z + n1z * halfT,
    u1.x,
    u1.z,
    junction.x + n2x * halfT,
    junction.z + n2z * halfT,
    u2.x,
    u2.z
  );
  const innerCorner = lineIntersectionXZ(
    junction.x - n1x * halfT,
    junction.z - n1z * halfT,
    u1.x,
    u1.z,
    junction.x - n2x * halfT,
    junction.z - n2z * halfT,
    u2.x,
    u2.z
  );
  return { outerCorner, innerCorner };
}

function directionIntoSegmentXZ(segment, vertex) {
  const junction = segment[vertex];
  const other = vertex === "a" ? segment.b : segment.a;
  return normalizeXZ(other.x - junction.x, other.z - junction.z);
}

function findPartnerAtJunctionXZ(segmentIndex, vertex, segmentsXZ) {
  const junction = segmentsXZ[segmentIndex]?.[vertex];
  if (!junction) return null;

  let partner = null;
  segmentsXZ.forEach((seg, index) => {
    if (index === segmentIndex) return;
    ["a", "b"].forEach((v) => {
      if (!pointsCoincideXZ(seg[v], junction)) return;
      const u2 = directionIntoSegmentXZ(seg, v);
      if (!u2) return;
      partner = { segmentIndex: index, vertex: v, u2 };
    });
  });
  return partner;
}

function lCornerAtEndpointXZ(segmentIndex, vertex, segmentsXZ, halfT) {
  const segment = segmentsXZ[segmentIndex];
  if (!segment) return null;

  const u1 = directionIntoSegmentXZ(segment, vertex);
  const partner = findPartnerAtJunctionXZ(segmentIndex, vertex, segmentsXZ);
  if (!u1 || !partner) return null;

  const theta = interiorAngleXZ(u1.x, u1.z, partner.u2.x, partner.u2.z);
  if (theta < MIN_CORNER_ANGLE_XZ || theta > MAX_CORNER_ANGLE_XZ) return null;

  const junction = segment[vertex];
  const { outerCorner, innerCorner } = computeWallCornerPointsXZ(
    junction,
    u1,
    partner.u2,
    halfT
  );
  if (!outerCorner || !innerCorner) return null;

  return { junction, u1, u2: partner.u2, outerCorner, innerCorner };
}

function endpointSidePointXZ(segmentIndex, vertex, side, segmentsXZ, halfT) {
  const seg = segmentsXZ[segmentIndex];
  if (!seg) return null;

  const junction = seg[vertex];
  const segDx = seg.b.x - seg.a.x;
  const segDz = seg.b.z - seg.a.z;
  const segLen = Math.hypot(segDx, segDz);
  if (segLen < 0.05) return null;

  const segNx = -segDz / segLen;
  const segNz = segDx / segLen;
  const sign = side === "pos" ? 1 : -1;

  const lCorner = lCornerAtEndpointXZ(segmentIndex, vertex, segmentsXZ, halfT);
  if (lCorner) {
    const outerOnPosSide =
      (lCorner.outerCorner.x - junction.x) * segNx + (lCorner.outerCorner.z - junction.z) * segNz > 0;
    if (side === "pos") {
      return { ...(outerOnPosSide ? lCorner.outerCorner : lCorner.innerCorner) };
    }
    return { ...(outerOnPosSide ? lCorner.innerCorner : lCorner.outerCorner) };
  }

  return { x: junction.x + segNx * halfT * sign, z: junction.z + segNz * halfT * sign };
}

function buildInternalWallVisibleOutlinesXZ(segmentsXZ, halfT) {
  if (!halfT || !segmentsXZ?.length) return [];

  const lines = [];

  segmentsXZ.forEach((_, segmentIndex) => {
    const posA = endpointSidePointXZ(segmentIndex, "a", "pos", segmentsXZ, halfT);
    const posB = endpointSidePointXZ(segmentIndex, "b", "pos", segmentsXZ, halfT);
    const negA = endpointSidePointXZ(segmentIndex, "a", "neg", segmentsXZ, halfT);
    const negB = endpointSidePointXZ(segmentIndex, "b", "neg", segmentsXZ, halfT);
    if (!posA || !posB || !negA || !negB) return;

    lines.push({ a: posA, b: posB });
    lines.push({ a: negA, b: negB });

    if (!lCornerAtEndpointXZ(segmentIndex, "a", segmentsXZ, halfT)) {
      lines.push({ a: posA, b: negA });
    }
    if (!lCornerAtEndpointXZ(segmentIndex, "b", segmentsXZ, halfT)) {
      lines.push({ a: posB, b: negB });
    }
  });

  return lines;
}

function buildClippedInternalWallFootprints(normalizedExternalPoints, normalizedSegments) {
  const mapping = getTracePlanXZMapping(normalizedExternalPoints);
  const innerRing = getTraceInnerXZRing(normalizedExternalPoints);
  if (!mapping || !innerRing) return [];

  const footprints = [];
  for (const segment of normalizedSegments) {
    const startXZ = normalizedPointToXZ(segment.a, mapping);
    const endXZ = normalizedPointToXZ(segment.b, mapping);
    const corners = internalWallSegmentXZCorners(startXZ, endXZ, TRACE_WALL_THICKNESS_M);
    if (!corners) continue;

    const clipped = clipPolygonToRingInteriorXZ(corners, innerRing);
    if (clipped.length < 3 || polygonXZArea(clipped) < 0.002) continue;
    footprints.push(clipped);
  }
  return footprints;
}

function segmentLineIntersectionXZ(p1, p2, a, b) {
  const x1 = p1.x;
  const z1 = p1.z;
  const x2 = p2.x;
  const z2 = p2.z;
  const x3 = a.x;
  const z3 = a.z;
  const x4 = b.x;
  const z4 = b.z;
  const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), z: z1 + t * (z2 - z1) };
}

function isInsideClipEdgeXZ(point, a, b) {
  return (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x) >= -1e-9;
}

function clipPolygonToHalfPlaneXZ(polygon, a, b) {
  if (!polygon.length) return [];
  const output = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const previous = polygon[(i - 1 + polygon.length) % polygon.length];
    const currInside = isInsideClipEdgeXZ(current, a, b);
    const prevInside = isInsideClipEdgeXZ(previous, a, b);

    if (currInside) {
      if (!prevInside) {
        const hit = segmentLineIntersectionXZ(previous, current, a, b);
        if (hit) output.push(hit);
      }
      output.push(current);
    } else if (prevInside) {
      const hit = segmentLineIntersectionXZ(previous, current, a, b);
      if (hit) output.push(hit);
    }
  }

  return output;
}

function clipPolygonToRingInteriorXZ(polygon, ring) {
  if (!polygon?.length || !ring || ring.length < 3) return [];

  let signedArea = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    signedArea += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  const ccw = signedArea > 0;

  let result = polygon.map((p) => ({ x: p.x, z: p.z }));
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    const a = ccw ? ring[i] : ring[j];
    const b = ccw ? ring[j] : ring[i];
    result = clipPolygonToHalfPlaneXZ(result, a, b);
    if (!result.length) return [];
  }
  return result;
}

/**
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {{ x: number, z: number }[] | null}
 */
export function getTraceInnerXZRing(normalizedPoints) {
  const outer = tracePolygonToOuterXZRing(normalizedPoints);
  if (!outer) return null;
  return offsetPolygonInward(outer, TRACE_WALL_THICKNESS_M);
}

function polygonXZArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    area += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  return Math.abs(area) * 0.5;
}

function extrudeXZFootprintPolygon(ring, baseYM, topYM) {
  const n = ring.length;
  if (n < 3) return null;

  const positions = [];
  const indices = [];
  const addVertex = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  const bottom = ring.map((p) => addVertex(p.x, baseYM, p.z));
  const top = ring.map((p) => addVertex(p.x, topYM, p.z));

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    pushQuad(indices, bottom[i], bottom[j], top[j], top[i]);
  }
  for (let i = 1; i < n - 1; i += 1) {
    pushTriangle(indices, bottom[0], bottom[i + 1], bottom[i]);
    pushTriangle(indices, top[0], top[i], top[i + 1]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function segmentXZIntersection(a, b, c, d) {
  const denom = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / denom;
  const u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / denom;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
}

function distancePointToSegmentXZ(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.z - a.z);
  let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

function appendHorizontalEdgeXZ(chunks, a, b, y) {
  chunks.push(new Float32Array([a.x, y, a.z, b.x, y, b.z]));
}

function collectInternalWallJunctionPointsXZ(normalizedExternalPoints, normalizedSegments) {
  const mapping = getTracePlanXZMapping(normalizedExternalPoints);
  if (!mapping) return [];

  const segmentsXZ = normalizedSegments.map((segment) => ({
    a: normalizedPointToXZ(segment.a, mapping),
    b: normalizedPointToXZ(segment.b, mapping),
  }));

  const halfT = TRACE_WALL_THICKNESS_M / 2;
  const points = [];
  const addPoint = (point) => {
    if (!point) return;
    if (points.some((existing) => Math.hypot(existing.x - point.x, existing.z - point.z) < 0.025)) {
      return;
    }
    points.push(point);
  };

  const seenLCorners = new Set();
  segmentsXZ.forEach((_, segmentIndex) => {
    ["a", "b"].forEach((vertex) => {
      const corner = lCornerAtEndpointXZ(segmentIndex, vertex, segmentsXZ, halfT);
      if (!corner) return;
      const key = [
        Math.round(corner.junction.x * 100),
        Math.round(corner.junction.z * 100),
      ].join(",");
      if (seenLCorners.has(key)) return;
      seenLCorners.add(key);
      addPoint(corner.outerCorner);
      addPoint(corner.innerCorner);
    });
  });

  for (let i = 0; i < segmentsXZ.length; i += 1) {
    for (let j = i + 1; j < segmentsXZ.length; j += 1) {
      addPoint(segmentXZIntersection(segmentsXZ[i].a, segmentsXZ[i].b, segmentsXZ[j].a, segmentsXZ[j].b));
    }
  }

  for (let i = 0; i < segmentsXZ.length; i += 1) {
    const seg = segmentsXZ[i];
    for (const vertex of ["a", "b"]) {
      if (lCornerAtEndpointXZ(i, vertex, segmentsXZ, halfT)) continue;
      const endpoint = seg[vertex];
      for (let j = 0; j < segmentsXZ.length; j += 1) {
        if (i === j) continue;
        const other = segmentsXZ[j];
        if (distancePointToSegmentXZ(endpoint, other.a, other.b) <= JUNCTION_EPSILON_XZ) {
          addPoint(endpoint);
        }
      }
    }
  }

  return points;
}

function appendVerticalLines(chunks, points, bottomYM, topYM) {
  for (const point of points) {
    chunks.push(
      new Float32Array([point.x, bottomYM, point.z, point.x, topYM, point.z])
    );
  }
}

/**
 * @param {{ x: number, y: number }[]} normalizedExternalPoints
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} normalizedSegments
 * @returns {THREE.BufferGeometry | null}
 */
export function buildTraceInternalWallsGeometry(normalizedExternalPoints, normalizedSegments) {
  const footprints = buildClippedInternalWallFootprints(
    normalizedExternalPoints,
    normalizedSegments
  );
  if (!footprints.length) return null;

  const positions = [];
  const indices = [];
  let vertexOffset = 0;

  for (const footprint of footprints) {
    const part = extrudeXZFootprintPolygon(footprint, TRACE_WALL_BASE_M, TRACE_WALL_TOP_M);
    if (!part) continue;

    const partPos = part.getAttribute("position").array;
    const partIdx = part.getIndex()?.array;
    if (!partIdx) continue;

    for (let i = 0; i < partPos.length; i += 1) positions.push(partPos[i]);
    for (let i = 0; i < partIdx.length; i += 1) indices.push(partIdx[i] + vertexOffset);
    vertexOffset += partPos.length / 3;
    part.dispose();
  }

  if (!indices.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Edge outlines for internal wall segments (vertical + top/bottom perimeters).
 * @param {{ x: number, y: number }[]} normalizedExternalPoints
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} normalizedSegments
 * @param {number} [bottomYM=TRACE_WALL_BASE_M]
 * @param {number} [offsetM=0.003]
 * @returns {Float32Array | null}
 */
export function buildTraceInternalWallsOutlinePositions(
  normalizedExternalPoints,
  normalizedSegments,
  bottomYM = TRACE_WALL_BASE_M,
  offsetM = 0.003
) {
  const mapping = getTracePlanXZMapping(normalizedExternalPoints);
  if (!mapping || !normalizedSegments?.length) return null;

  const segmentsXZ = normalizedSegments.map((segment) => ({
    a: normalizedPointToXZ(segment.a, mapping),
    b: normalizedPointToXZ(segment.b, mapping),
  }));

  const halfT = TRACE_WALL_THICKNESS_M / 2;
  const outlines = buildInternalWallVisibleOutlinesXZ(segmentsXZ, halfT);
  if (!outlines.length) return null;

  const chunks = [];
  let totalFloats = 0;
  const topY = TRACE_WALL_TOP_M + offsetM;
  const bottomY = bottomYM;

  for (const { a, b } of outlines) {
    appendHorizontalEdgeXZ(chunks, a, b, topY);
    appendHorizontalEdgeXZ(chunks, a, b, bottomY);
    totalFloats += 12;
  }

  const junctions = collectInternalWallJunctionPointsXZ(
    normalizedExternalPoints,
    normalizedSegments
  );
  appendVerticalLines(chunks, junctions, bottomYM, TRACE_WALL_TOP_M);
  totalFloats += junctions.length * 6;

  if (!chunks.length) return null;

  const merged = new Float32Array(totalFloats);
  let writeOffset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return merged;
}

/**
 * Solid external wall band: outer face = traced polygon, 100 mm thick inward.
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {THREE.BufferGeometry | null}
 */
export function buildTraceExternalWallGeometry(normalizedPoints) {
  const outer = tracePolygonToOuterXZRing(normalizedPoints);
  if (!outer) return null;

  const inner = offsetPolygonInward(outer, TRACE_WALL_THICKNESS_M);
  if (!inner) return null;

  return buildWallBandGeometry(outer, inner, TRACE_WALL_BASE_M, TRACE_WALL_HEIGHT_M);
}

/**
 * Solid subfloor slab under the traced footprint (ground → 649 mm).
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {THREE.BufferGeometry | null}
 */
export function buildTraceSubfloorGeometry(normalizedPoints) {
  const outer = tracePolygonToOuterXZRing(normalizedPoints);
  if (!outer) return null;

  const topRing = new Float32Array(outer.length * 3);
  outer.forEach((p, i) => {
    topRing[i * 3] = p.x;
    topRing[i * 3 + 1] = TRACE_SUBFLOOR_TOP_M;
    topRing[i * 3 + 2] = p.z;
  });

  const volume = buildExtrudedFootprintMesh(topRing, 0, {
    includeTopCap: true,
    includeBottomCap: true,
  });
  if (!volume) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(volume.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(volume.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * XZ ring → top-height positions for edge outlines.
 * @param {{ x: number, z: number }[]} ring
 * @returns {Float32Array}
 */
function xzRingToRingPositions(ring, yM) {
  const positions = new Float32Array(ring.length * 3);
  ring.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = yM;
    positions[i * 3 + 2] = p.z;
  });
  return positions;
}

/**
 * Horizontal top/bottom perimeter lines only (no vertical corner lines).
 * @param {Float32Array} topRingPositions
 * @param {number} [bottomYM=0]
 * @returns {Float32Array | null}
 */
export function buildWallRingHorizontalEdgeLines(topRingPositions, bottomYM = 0) {
  const vertexCount = topRingPositions.length / 3;
  if (vertexCount < 3) return null;

  const topY = topRingPositions[1];
  const positions = new Float32Array(vertexCount * 2 * 6);
  let offset = 0;

  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    const ax = topRingPositions[i * 3];
    const az = topRingPositions[i * 3 + 2];
    const bx = topRingPositions[j * 3];
    const bz = topRingPositions[j * 3 + 2];

    positions[offset] = ax;
    positions[offset + 1] = topY;
    positions[offset + 2] = az;
    positions[offset + 3] = bx;
    positions[offset + 4] = topY;
    positions[offset + 5] = bz;
    offset += 6;

    positions[offset] = ax;
    positions[offset + 1] = bottomYM;
    positions[offset + 2] = az;
    positions[offset + 3] = bx;
    positions[offset + 4] = bottomYM;
    positions[offset + 5] = bz;
    offset += 6;
  }

  return positions;
}

/**
 * Outer and inner wall rings at top height (for edge outlines).
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {{ outer: Float32Array, inner: Float32Array } | null}
 */
export function tracePolygonWallRings(normalizedPoints) {
  const outer = tracePolygonToOuterXZRing(normalizedPoints);
  if (!outer) return null;
  const inner = offsetPolygonInward(outer, TRACE_WALL_THICKNESS_M);
  if (!inner) return null;
  return {
    outer: xzRingToRingPositions(outer, TRACE_WALL_TOP_M),
    inner: xzRingToRingPositions(inner, TRACE_WALL_TOP_M),
    wallBaseYM: TRACE_WALL_BASE_M,
  };
}

/**
 * Outer wall ring at top height (for edge outlines).
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {Float32Array | null}
 */
export function tracePolygonToWallRing(normalizedPoints) {
  const rings = tracePolygonWallRings(normalizedPoints);
  return rings?.outer ?? null;
}
