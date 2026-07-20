import * as THREE from "three";
import {
  tracePolygonToOuterXZRing,
  getTracePlanXZMapping,
  normalizedPointToXZ,
} from "./tracePlan3D";

export const DEFAULT_UNIT_WIDTH_M = 11.3;
export const DEFAULT_UNIT_DEPTH_M = 5.0;

/**
 * Axis-aligned rectangle footprint centred on the origin (XZ).
 * @returns {{ x: number, z: number }[]}
 */
export function rectangleFootprintRing(widthM, depthM) {
  const hx = widthM / 2;
  const hz = depthM / 2;
  return [
    { x: -hx, z: hz },
    { x: hx, z: hz },
    { x: hx, z: -hz },
    { x: -hx, z: -hz },
  ];
}

/**
 * Drop a duplicate closing vertex if the ring repeats the first point.
 * @param {{ x: number, z: number }[]} ring
 * @returns {{ x: number, z: number }[]}
 */
export function sanitizeFootprintRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const cleaned = ring
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z))
    .map((p) => ({ x: p.x, z: p.z }));
  if (cleaned.length < 3) return [];

  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-9) {
    cleaned.pop();
  }
  return cleaned.length >= 3 ? cleaned : [];
}

/**
 * Prefer a traced plan polygon when available; otherwise the default rectangle.
 * @param {{ x: number, y: number }[] | null | undefined} normalizedPoints
 * @param {number} [widthM]
 * @param {number} [depthM]
 * @returns {{ ring: { x: number, z: number }[], fromTrace: boolean }}
 */
export function resolveBuildingFootprintRing(
  normalizedPoints,
  widthM = DEFAULT_UNIT_WIDTH_M,
  depthM = DEFAULT_UNIT_DEPTH_M,
  calibration = null
) {
  const traced = sanitizeFootprintRing(
    tracePolygonToOuterXZRing(normalizedPoints, calibration) || []
  );
  if (traced.length >= 3) {
    return { ring: traced, fromTrace: true };
  }
  return { ring: rectangleFootprintRing(widthM, depthM), fromTrace: false };
}

/**
 * Map a secondary trace (deck, roof, etc.) into the same XZ frame as the
 * external-wall footprint, so overhangs and attachments stay aligned.
 *
 * @param {{ x: number, y: number }[] | null | undefined} normalizedPoints
 * @param {{ x: number, y: number }[] | null | undefined} referenceNormalizedPoints  usually external walls
 * @param {object | null} [calibration]
 * @returns {{ ring: { x: number, z: number }[], fromTrace: boolean }}
 */
export function resolveAlignedTraceRing(
  normalizedPoints,
  referenceNormalizedPoints,
  calibration = null
) {
  if (!Array.isArray(normalizedPoints) || normalizedPoints.length < 3) {
    return { ring: [], fromTrace: false };
  }
  const reference =
    Array.isArray(referenceNormalizedPoints) && referenceNormalizedPoints.length >= 3
      ? referenceNormalizedPoints
      : normalizedPoints;
  const mapping = getTracePlanXZMapping(reference, calibration);
  if (!mapping) return { ring: [], fromTrace: false };
  const ring = sanitizeFootprintRing(
    normalizedPoints.map((p) => normalizedPointToXZ(p, mapping))
  );
  return { ring, fromTrace: ring.length >= 3 };
}

export function footprintBounds(ring) {
  const xs = ring.map((p) => p.x);
  const zs = ring.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    spanX: maxX - minX,
    spanZ: maxZ - minZ,
    widthM: maxX - minX,
    depthM: maxZ - minZ,
  };
}

function ringSignedAreaXZ(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    area += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  return area * 0.5;
}

/**
 * Corner column centres: 50×50 posts sitting 5 mm proud of both adjacent faces.
 * @returns {{ x: number, z: number, index: number }[]}
 */
export function footprintCornerColumnCenters(ring, sizeM, projectionM) {
  const n = ring.length;
  if (n < 3) return [];
  const counterClockwise = ringSignedAreaXZ(ring) > 0;
  const half = sizeM / 2;
  const centers = [];

  for (let i = 0; i < n; i += 1) {
    const prev = ring[(i - 1 + n) % n];
    const curr = ring[i];
    const next = ring[(i + 1) % n];

    const d1x = curr.x - prev.x;
    const d1z = curr.z - prev.z;
    const d2x = next.x - curr.x;
    const d2z = next.z - curr.z;
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
    const alongBisector = (projectionM - half) * miterScale;

    centers.push({
      index: i,
      x: curr.x + bx * alongBisector,
      z: curr.z + bz * alongBisector,
    });
  }

  return centers;
}

/**
 * Solid extruded slab from an arbitrary XZ footprint (supports angled / N-sided plans).
 * Uses Shape + ExtrudeGeometry so complex traces triangulate reliably.
 * @returns {THREE.BufferGeometry | null}
 */
export function buildFootprintSlabGeometry(ring, bottomYM, topYM) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM)) return null;

  const height = topYM - bottomYM;
  // Shape lives in XY; use -z so after rotateX(-90°) world Z matches the footprint.
  const shape = new THREE.Shape();
  shape.moveTo(clean[0].x, -clean[0].z);
  for (let i = 1; i < clean.length; i += 1) {
    shape.lineTo(clean[i].x, -clean[i].z);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  // Extrude along +Z → rotate so depth becomes +Y, then lift to bottomYM.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottomYM, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Outline-only edges for a footprint slab (perimeter top/bottom + vertical corners).
 * Avoids the internal triangulation lines that EdgesGeometry produces.
 * @returns {THREE.BufferGeometry | null}
 */
export function buildFootprintSlabOutlineGeometry(ring, bottomYM, topYM) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM)) return null;

  const n = clean.length;
  const positions = new Float32Array(n * 4 * 6);
  let offset = 0;

  const pushSegment = (ax, ay, az, bx, by, bz) => {
    positions[offset] = ax;
    positions[offset + 1] = ay;
    positions[offset + 2] = az;
    positions[offset + 3] = bx;
    positions[offset + 4] = by;
    positions[offset + 5] = bz;
    offset += 6;
  };

  for (let i = 0; i < n; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % n];
    pushSegment(a.x, topYM, a.z, b.x, topYM, b.z);
    pushSegment(a.x, bottomYM, a.z, b.x, bottomYM, b.z);
    pushSegment(a.x, bottomYM, a.z, a.x, topYM, a.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Four orthographic elevations from screen-relative sides of the plan:
 *   A = right side of screen
 *   B = bottom side of screen
 *   C = left side of screen
 *   D = top side of screen
 *
 * Trace plan X increases right and Y increases down. The XZ ring maps
 * plan → world as x' = -(x-cx)*s, z' = -(y-cy)*s, so:
 *   right (+plan x)  → viewDir world (-1, 0)
 *   bottom (+plan y) → viewDir world ( 0,-1)
 *   left   (-plan x) → viewDir world ( 1, 0)
 *   top    (-plan y) → viewDir world ( 0, 1)
 *
 * @returns {{
 *   title: string,
 *   viewDir: { x: number, z: number },
 *   segments: { s0: number, s1: number }[],
 *   minS: number,
 *   maxS: number,
 *   lengthM: number,
 * }[]}
 */
/**
 * Resolve saved windows (normalized outer-edge endpoints) into world-space
 * placements on the traced footprint for the 3D model.
 *
 * @param {{ x: number, y: number }[]} normalizedPoints  external trace polygon
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} normalizedWindows
 * @returns {{
 *   midX: number, midZ: number,
 *   dirX: number, dirZ: number,
 *   normalX: number, normalZ: number,
 *   lengthM: number,
 * }[]}
 */
/** Same placement math as windows — doors share outer-edge endpoints on the footprint. */
export function resolveModelDoors(normalizedPoints, normalizedDoors, calibration = null) {
  return resolveModelWindows(normalizedPoints, normalizedDoors, calibration);
}

export function resolveModelSlidingDoors(normalizedPoints, normalizedSlidingDoors, calibration = null) {
  return resolveModelWindows(normalizedPoints, normalizedSlidingDoors, calibration);
}

export function resolveModelWindows(normalizedPoints, normalizedWindows, calibration = null) {
  const mapping = getTracePlanXZMapping(normalizedPoints, calibration);
  if (!mapping || !Array.isArray(normalizedWindows) || !normalizedWindows.length) return [];

  const ringXZ = normalizedPoints.map((p) => normalizedPointToXZ(p, mapping));
  const centroid = ringXZ.reduce(
    (acc, p) => ({ x: acc.x + p.x / ringXZ.length, z: acc.z + p.z / ringXZ.length }),
    { x: 0, z: 0 }
  );

  const result = [];
  for (const win of normalizedWindows) {
    if (!win?.a || !win?.b) continue;
    const a = normalizedPointToXZ(win.a, mapping);
    const b = normalizedPointToXZ(win.b, mapping);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthM = Math.hypot(dx, dz);
    if (lengthM < 0.05) continue;

    const dirX = dx / lengthM;
    const dirZ = dz / lengthM;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;

    // Outward normal (away from centroid).
    let nX = -dirZ;
    let nZ = dirX;
    if (nX * (midX - centroid.x) + nZ * (midZ - centroid.z) < 0) {
      nX = -nX;
      nZ = -nZ;
    }

    const heightM = Number(win.heightM);
    result.push({
      midX,
      midZ,
      dirX,
      dirZ,
      normalX: nX,
      normalZ: nZ,
      lengthM,
      heightM: Number.isFinite(heightM) && heightM > 0 ? heightM : null,
    });
  }
  return result;
}

/**
 * Cut a rectangular notch into a footprint ring for one door opening.
 * The door's outer face sits on the perimeter; the notch cuts inward by `cutDepthM`.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {{ midX: number, midZ: number, dirX: number, dirZ: number, normalX: number, normalZ: number, lengthM: number }} door
 * @param {number} cutDepthM
 * @returns {{ x: number, z: number }[]}
 */
function notchRingForDoor(ring, door, cutDepthM) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(door?.lengthM > 0) || !(cutDepthM > 0)) return clean;

  const halfLen = door.lengthM / 2;
  const mid = { x: door.midX, z: door.midZ };
  const n = clean.length;

  let best = null;
  for (let i = 0; i < n; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const edirX = dx / len;
    const edirZ = dz / len;
    const align = Math.abs(edirX * door.dirX + edirZ * door.dirZ);
    const t = Math.max(0, Math.min(1, ((mid.x - a.x) * dx + (mid.z - a.z) * dz) / (len * len)));
    const px = a.x + t * dx;
    const pz = a.z + t * dz;
    const dist = Math.hypot(mid.x - px, mid.z - pz);
    const score = dist - align * 2;
    if (!best || score < best.score) {
      best = { score, i, a, b, len, edirX, edirZ };
    }
  }
  if (!best || best.score > 0.35) return clean;

  // Project door ends onto the chosen edge and order them along a → b.
  const projectT = (px, pz) => {
    const dx = best.b.x - best.a.x;
    const dz = best.b.z - best.a.z;
    return Math.max(0, Math.min(1, ((px - best.a.x) * dx + (pz - best.a.z) * dz) / (best.len * best.len)));
  };
  const end0 = {
    x: mid.x - door.dirX * halfLen,
    z: mid.z - door.dirZ * halfLen,
  };
  const end1 = {
    x: mid.x + door.dirX * halfLen,
    z: mid.z + door.dirZ * halfLen,
  };
  let t0 = projectT(end0.x, end0.z);
  let t1 = projectT(end1.x, end1.z);
  if (t1 < t0) {
    const tmp = t0;
    t0 = t1;
    t1 = tmp;
  }
  // Keep a tiny margin so the notch doesn't collapse at corners.
  const minGap = 0.02 / Math.max(best.len, 0.02);
  if (t1 - t0 < minGap) return clean;

  const lerp = (t) => ({
    x: best.a.x + (best.b.x - best.a.x) * t,
    z: best.a.z + (best.b.z - best.a.z) * t,
  });
  const p0 = lerp(t0);
  const p1 = lerp(t1);
  // Inward = opposite of the door's outward normal.
  const ix = -door.normalX * cutDepthM;
  const iz = -door.normalZ * cutDepthM;

  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(clean[i]);
    if (i !== best.i) continue;
    if (t0 > 1e-6) out.push(p0);
    out.push({ x: p0.x + ix, z: p0.z + iz });
    out.push({ x: p1.x + ix, z: p1.z + iz });
    if (t1 < 1 - 1e-6) out.push(p1);
  }
  return sanitizeFootprintRing(out);
}

/**
 * Cut door notches into a footprint ring (applied sequentially for multiple doors).
 * @param {{ x: number, z: number }[]} ring
 * @param {{ midX: number, midZ: number, dirX: number, dirZ: number, normalX: number, normalZ: number, lengthM: number }[]} doors
 * @param {number} cutDepthM
 * @returns {{ x: number, z: number }[]}
 */
export function notchFootprintRingForDoors(ring, doors, cutDepthM) {
  let current = sanitizeFootprintRing(ring);
  if (!current.length || !Array.isArray(doors) || !doors.length || !(cutDepthM > 0)) {
    return current;
  }
  for (const door of doors) {
    current = notchRingForDoor(current, door, cutDepthM);
  }
  return current;
}

export function buildFootprintElevations(ring) {
  if (!ring || ring.length < 3) return [];

  const viewDirs = [
    { title: "Elevation A", viewDir: { x: -1, z: 0 } },
    { title: "Elevation B", viewDir: { x: 0, z: -1 } },
    { title: "Elevation C", viewDir: { x: 1, z: 0 } },
    { title: "Elevation D", viewDir: { x: 0, z: 1 } },
  ];

  const counterClockwise = ringSignedAreaXZ(ring) > 0;
  const n = ring.length;

  return viewDirs.map(({ title, viewDir }) => {
    const screenAxis = { x: viewDir.z, z: -viewDir.x };
    const projectS = (p) => p.x * screenAxis.x + p.z * screenAxis.z;

    const segments = [];
    for (let i = 0; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = counterClockwise ? dz / len : -dz / len;
      const nz = counterClockwise ? -dx / len : dx / len;
      if (nx * viewDir.x + nz * viewDir.z <= 0.05) continue;

      const s0 = projectS(a);
      const s1 = projectS(b);
      segments.push({ s0: Math.min(s0, s1), s1: Math.max(s0, s1) });
    }

    const allS = ring.map(projectS);
    const minS = Math.min(...allS);
    const maxS = Math.max(...allS);

    return {
      title,
      viewDir,
      segments,
      minS,
      maxS,
      lengthM: Math.max(0.01, maxS - minS),
    };
  });
}
