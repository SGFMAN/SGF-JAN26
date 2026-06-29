import * as THREE from "three";

export const TRACE_WALL_HEIGHT_M = 3.2;
export const TRACE_WALL_THICKNESS_M = 0.1;
export const TRACE_FOOTPRINT_TARGET_M = 14;
export const DEFAULT_CAMERA_HEIGHT_M = 1.8;
export const CAMERA_HEIGHT_STEP_M = 0.5;
export const MIN_CAMERA_HEIGHT_M = 0.5;
export const MAX_CAMERA_HEIGHT_M = 10;

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
    x: (p.x - cx) * scale,
    z: -(p.y - cy) * scale,
  }));
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

function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    area += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  return area * 0.5;
}

function ringToShapePath(ring, path) {
  ring.forEach((p, i) => {
    if (i === 0) path.moveTo(p.x, p.z);
    else path.lineTo(p.x, p.z);
  });
  path.closePath();
}

/**
 * Solid external wall band: outer face = traced polygon, 100 mm thick inward.
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {THREE.BufferGeometry | null}
 */
export function buildTraceExternalWallGeometry(normalizedPoints) {
  const outer = tracePolygonToOuterXZRing(normalizedPoints);
  if (!outer) return null;

  const inner = offsetPolygonXZ(outer, -TRACE_WALL_THICKNESS_M);
  if (!inner || Math.abs(ringSignedArea(inner)) < 0.01) return null;

  const outerArea = Math.abs(ringSignedArea(outer));
  const innerArea = Math.abs(ringSignedArea(inner));
  if (innerArea >= outerArea * 0.95) return null;

  const shape = new THREE.Shape();
  const outerWinding = ringSignedArea(outer) > 0;
  const outerRing = outerWinding ? outer : [...outer].reverse();
  ringToShapePath(outerRing, shape);

  const hole = new THREE.Path();
  const innerWinding = ringSignedArea(inner) > 0;
  const holeRing = innerWinding ? [...inner].reverse() : inner;
  ringToShapePath(holeRing, hole);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: TRACE_WALL_HEIGHT_M,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Outer wall ring at top height (for edge outlines).
 * @param {{ x: number, y: number }[]} normalizedPoints
 * @returns {Float32Array | null}
 */
export function tracePolygonToWallRing(normalizedPoints) {
  const outer = tracePolygonToOuterXZRing(normalizedPoints);
  if (!outer) return null;

  const positions = new Float32Array(outer.length * 3);
  outer.forEach((p, i) => {
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = TRACE_WALL_HEIGHT_M;
    positions[i * 3 + 2] = p.z;
  });
  return positions;
}
