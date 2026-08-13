import * as THREE from "three";
import {
  tracePolygonToOuterXZRing,
  getTracePlanXZMapping,
  normalizedPointToXZ,
  offsetPolygonInward,
} from "./tracePlan3D";

export const DEFAULT_UNIT_WIDTH_M = 11.3;
export const DEFAULT_UNIT_DEPTH_M = 5.0;
/** External cladding / weatherboard wall thickness (metres). */
export const CLADDING_WALL_THICKNESS_M = 0.1;

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
 * Drop a duplicate closing vertex, near-duplicate points, and near-collinear
 * mid-edge kinks so outlines / corner posts sit only on real wall corners.
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
  if (cleaned.length < 3) return [];

  // Collapse consecutive points closer than 1 mm.
  const deduped = [cleaned[0]];
  for (let i = 1; i < cleaned.length; i += 1) {
    const prev = deduped[deduped.length - 1];
    const p = cleaned[i];
    if (Math.hypot(p.x - prev.x, p.z - prev.z) >= 0.001) {
      deduped.push(p);
    }
  }
  if (
    deduped.length > 1 &&
    Math.hypot(
      deduped[0].x - deduped[deduped.length - 1].x,
      deduped[0].z - deduped[deduped.length - 1].z
    ) < 0.001
  ) {
    deduped.pop();
  }
  if (deduped.length < 3) return [];

  // Drop near-collinear vertices (|sin turn| < sin ~4°).
  const COLLINEAR_SIN = 0.07;
  const simplified = [];
  const n0 = deduped.length;
  for (let i = 0; i < n0; i += 1) {
    const prev = deduped[(i - 1 + n0) % n0];
    const curr = deduped[i];
    const next = deduped[(i + 1) % n0];
    const ax = curr.x - prev.x;
    const az = curr.z - prev.z;
    const bx = next.x - curr.x;
    const bz = next.z - curr.z;
    const lenA = Math.hypot(ax, az);
    const lenB = Math.hypot(bx, bz);
    if (lenA < 1e-9 || lenB < 1e-9) continue;
    const sinTurn = Math.abs(ax * bz - az * bx) / (lenA * lenB);
    if (sinTurn < COLLINEAR_SIN) continue;
    simplified.push(curr);
  }

  return simplified.length >= 3 ? simplified : deduped;
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
 * Only true exterior (convex) corners. Includes rotationY so post faces align
 * with the incoming wall edge (needed for rotated footprints).
 * @returns {{ x: number, z: number, index: number, rotationY: number }[]}
 */
export function footprintCornerColumnCenters(ring, sizeM, projectionM) {
  const clean = sanitizeFootprintRing(ring);
  const n = clean.length;
  if (n < 3) return [];
  const counterClockwise = ringSignedAreaXZ(clean) > 0;
  const half = sizeM / 2;
  const centers = [];

  for (let i = 0; i < n; i += 1) {
    if (!isConvexFootprintVertex(clean, i, counterClockwise)) continue;

    const prev = clean[(i - 1 + n) % n];
    const curr = clean[i];
    const next = clean[(i + 1) % n];

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

    // Align box local +X with the incoming edge direction.
    const rotationY = Math.atan2(-d1z / len1, d1x / len1);

    centers.push({
      index: i,
      x: curr.x + bx * alongBisector,
      z: curr.z + bz * alongBisector,
      rotationY,
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
 * Hollow extruded wall band: outer face = footprint, thickness inward (default 100 mm).
 * Falls back to a solid slab if the ring is too small to inset.
 * @returns {THREE.BufferGeometry | null}
 */
export function buildFootprintWallBandGeometry(
  ring,
  bottomYM,
  topYM,
  thicknessM = CLADDING_WALL_THICKNESS_M
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM) || !(thicknessM > 0)) return null;

  const inner = offsetPolygonInward(clean, thicknessM);
  if (!inner || inner.length < 3) {
    return buildFootprintSlabGeometry(clean, bottomYM, topYM);
  }

  const height = topYM - bottomYM;
  const shape = new THREE.Shape();
  shape.moveTo(clean[0].x, -clean[0].z);
  for (let i = 1; i < clean.length; i += 1) {
    shape.lineTo(clean[i].x, -clean[i].z);
  }
  shape.closePath();

  // Hole winding opposite the outer path so ExtrudeGeometry keeps the band.
  const holePts = [...inner].reverse();
  const hole = new THREE.Path();
  hole.moveTo(holePts[0].x, -holePts[0].z);
  for (let i = 1; i < holePts.length; i += 1) {
    hole.lineTo(holePts[i].x, -holePts[i].z);
  }
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
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
 * Outline for a hollow wall band using only true footprint corners:
 * outer + inner top/bottom perimeters, and verticals at each ring vertex.
 * Pass the un-notched footprint so door/window cutouts do not invent extra edges.
 */
export function buildFootprintWallBandOutlineGeometry(
  ring,
  bottomYM,
  topYM,
  thicknessM = CLADDING_WALL_THICKNESS_M
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM) || !(thicknessM > 0)) return null;
  const inner = offsetPolygonInward(clean, thicknessM);
  if (!inner || inner.length < 3) {
    return buildFootprintSlabOutlineGeometry(clean, bottomYM, topYM);
  }

  const rings = [clean, inner];
  const segmentCount =
    clean.length * 4 + // outer top/bottom/vertical
    inner.length * 4; // inner top/bottom/vertical
  const positions = new Float32Array(segmentCount * 6);
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

  for (const loop of rings) {
    const n = loop.length;
    for (let i = 0; i < n; i += 1) {
      const a = loop[i];
      const b = loop[(i + 1) % n];
      pushSegment(a.x, topYM, a.z, b.x, topYM, b.z);
      pushSegment(a.x, bottomYM, a.z, b.x, bottomYM, b.z);
      pushSegment(a.x, bottomYM, a.z, a.x, topYM, a.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions.subarray(0, offset), 3)
  );
  return geometry;
}

/**
 * One continuous cladding face per footprint edge, with rectangular openings
 * cut for doors/windows. Outer face sits on the footprint; thickness goes inward.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {number} bottomYM
 * @param {number} topYM
 * @param {{
 *   midX: number, midZ: number,
 *   dirX: number, dirZ: number,
 *   lengthM: number,
 *   openingBottomYM: number,
 *   openingTopYM: number,
 * }[]} openings
 * @param {number} [thicknessM]
 * @returns {{ geometry: THREE.BufferGeometry, position: {x,y,z}, rotationY: number }[]}
 */
export function buildFootprintCladdingFaceParts(
  ring,
  bottomYM,
  topYM,
  openings = [],
  thicknessM = CLADDING_WALL_THICKNESS_M
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM) || !(thicknessM > 0)) return [];

  const wallH = topYM - bottomYM;
  const centroid = clean.reduce(
    (acc, p) => ({ x: acc.x + p.x / clean.length, z: acc.z + p.z / clean.length }),
    { x: 0, z: 0 }
  );
  const parts = [];

  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) continue;
    const dirX = dx / len;
    const dirZ = dz / len;
    // Left of direction (inward for a typical CCW footprint).
    let inX = -dirZ;
    let inZ = dirX;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    if (inX * (centroid.x - midX) + inZ * (centroid.z - midZ) < 0) {
      inX = -inX;
      inZ = -inZ;
    }

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, wallH);
    shape.lineTo(0, wallH);
    shape.closePath();

    for (const op of openings) {
      if (!(op?.lengthM > 0)) continue;
      const half = op.lengthM / 2;
      const align = Math.abs(op.dirX * dirX + op.dirZ * dirZ);
      if (align < 0.7) continue;
      const t = Math.max(
        0,
        Math.min(1, ((op.midX - a.x) * dx + (op.midZ - a.z) * dz) / (len * len))
      );
      const px = a.x + t * dx;
      const pz = a.z + t * dz;
      if (Math.hypot(op.midX - px, op.midZ - pz) > 0.2) continue;

      const projectAlong = (qx, qz) =>
        Math.max(0, Math.min(len, (qx - a.x) * dirX + (qz - a.z) * dirZ));
      let x0 = projectAlong(op.midX - op.dirX * half, op.midZ - op.dirZ * half);
      let x1 = projectAlong(op.midX + op.dirX * half, op.midZ + op.dirZ * half);
      if (x1 < x0) {
        const tmp = x0;
        x0 = x1;
        x1 = tmp;
      }
      if (x1 - x0 < 0.05) continue;

      const y0 = Math.max(0, (op.openingBottomYM ?? bottomYM) - bottomYM);
      const y1 = Math.min(wallH, (op.openingTopYM ?? topYM) - bottomYM);
      if (y1 - y0 < 0.05) continue;

      const hole = new THREE.Path();
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thicknessM,
      bevelEnabled: false,
      curveSegments: 1,
    });
    // local +X → edge dir, local +Z → left of dir.
    const rotY = Math.atan2(-dirZ, dirX);
    const leftX = -dirZ;
    const leftZ = dirX;
    const leftIsInward = leftX * inX + leftZ * inZ >= 0;
    if (!leftIsInward) {
      // +Z points outward — shift so the outer face stays on the footprint.
      geometry.translate(0, 0, -thicknessM);
    }
    geometry.computeVertexNormals();

    parts.push({
      geometry,
      position: { x: a.x, y: bottomYM, z: a.z },
      rotationY: rotY,
    });
  }

  return parts;
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

/**
 * Snap traced internal doors onto internal-wall centreline segments in model XZ.
 * Door `a`/`b` are face endpoints (one side of the 100 mm wall); they are projected
 * onto the nearest segment so openings cut the solid wall band cleanly.
 *
 * @returns {{
 *   segmentIndex: number,
 *   midX: number, midZ: number,
 *   dirX: number, dirZ: number,
 *   normalX: number, normalZ: number,
 *   lengthM: number,
 *   along0: number, along1: number,
 * }[]}
 */
export function resolveModelInternalDoors(
  normalizedExternalPoints,
  normalizedInternalDoors,
  normalizedInternalWallSegments,
  calibration = null
) {
  const mapping = getTracePlanXZMapping(normalizedExternalPoints, calibration);
  if (
    !mapping ||
    !Array.isArray(normalizedInternalDoors) ||
    !normalizedInternalDoors.length ||
    !Array.isArray(normalizedInternalWallSegments) ||
    !normalizedInternalWallSegments.length
  ) {
    return [];
  }

  const segmentsXZ = [];
  normalizedInternalWallSegments.forEach((seg, index) => {
    if (!seg?.a || !seg?.b) return;
    const a = normalizedPointToXZ(seg.a, mapping);
    const b = normalizedPointToXZ(seg.b, mapping);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) return;
    segmentsXZ.push({
      index,
      a,
      b,
      len,
      dirX: dx / len,
      dirZ: dz / len,
    });
  });
  if (!segmentsXZ.length) return [];

  // Face endpoints sit ~half wall thickness off the centreline.
  const maxSnapDistM = 0.22;
  const result = [];

  for (const door of normalizedInternalDoors) {
    if (!door?.a || !door?.b) continue;
    const da = normalizedPointToXZ(door.a, mapping);
    const db = normalizedPointToXZ(door.b, mapping);
    const midX = (da.x + db.x) / 2;
    const midZ = (da.z + db.z) / 2;
    const doorLen = Math.hypot(db.x - da.x, db.z - da.z);
    if (doorLen < 0.05) continue;
    const doorDirX = (db.x - da.x) / doorLen;
    const doorDirZ = (db.z - da.z) / doorLen;

    let best = null;
    for (const seg of segmentsXZ) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((midX - seg.a.x) * (seg.b.x - seg.a.x) + (midZ - seg.a.z) * (seg.b.z - seg.a.z)) /
            (seg.len * seg.len)
        )
      );
      const px = seg.a.x + t * (seg.b.x - seg.a.x);
      const pz = seg.a.z + t * (seg.b.z - seg.a.z);
      const dist = Math.hypot(midX - px, midZ - pz);
      const align = Math.abs(doorDirX * seg.dirX + doorDirZ * seg.dirZ);
      if (
        !best ||
        dist < best.dist - 1e-6 ||
        (Math.abs(dist - best.dist) < 1e-6 && align > best.align)
      ) {
        best = { seg, dist, align };
      }
    }
    if (!best || best.dist > maxSnapDistM || best.align < 0.7) continue;

    const seg = best.seg;
    const projectAlong = (px, pz) =>
      Math.max(0, Math.min(seg.len, (px - seg.a.x) * seg.dirX + (pz - seg.a.z) * seg.dirZ));

    let along0 = projectAlong(da.x, da.z);
    let along1 = projectAlong(db.x, db.z);
    if (along1 < along0) {
      const tmp = along0;
      along0 = along1;
      along1 = tmp;
    }
    if (along1 - along0 < 0.05) {
      const midAlong = projectAlong(midX, midZ);
      along0 = Math.max(0, midAlong - doorLen / 2);
      along1 = Math.min(seg.len, midAlong + doorLen / 2);
    }
    if (along1 - along0 < 0.05) continue;

    const centerAlong = (along0 + along1) / 2;
    result.push({
      segmentIndex: seg.index,
      midX: seg.a.x + seg.dirX * centerAlong,
      midZ: seg.a.z + seg.dirZ * centerAlong,
      dirX: seg.dirX,
      dirZ: seg.dirZ,
      normalX: -seg.dirZ,
      normalZ: seg.dirX,
      lengthM: along1 - along0,
      along0,
      along1,
    });
  }

  return result;
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

/**
 * True when the footprint turns convex at vertex `i` (exterior corner post).
 * Concave / re-entrant vertices (e.g. notch corners t / y) return false.
 */
function isConvexFootprintVertex(ring, i, counterClockwise) {
  const n = ring.length;
  if (n < 3) return false;
  const prev = ring[(i - 1 + n) % n];
  const curr = ring[i];
  const next = ring[(i + 1) % n];
  const ax = curr.x - prev.x;
  const az = curr.z - prev.z;
  const bx = next.x - curr.x;
  const bz = next.z - curr.z;
  const cross = ax * bz - az * bx;
  return counterClockwise ? cross > 1e-9 : cross < -1e-9;
}

function frontmostDepthAtS(facing, s) {
  let best = -Infinity;
  let covered = false;
  for (const edge of facing) {
    if (s < edge.s0 - 1e-9 || s > edge.s1 + 1e-9) continue;
    covered = true;
    if (edge.depth > best) best = edge.depth;
  }
  return covered ? best : null;
}

/**
 * Frontmost wall spans only (hides occluded inset faces that otherwise leave
 * ghost end-strokes). Adjacent spans at different depths stay separate so real
 * plan steps still show an edge.
 *
 * @param {{ s0: number, s1: number, depth: number, convexAtS0: boolean, convexAtS1: boolean }[]} facing
 * @returns {{ s0: number, s1: number, cornerAtS0: boolean, cornerAtS1: boolean }[]}
 */
function buildFrontmostElevationSegments(facing, lengthEpsM = 1e-4, depthEpsM = 0.05) {
  if (!Array.isArray(facing) || !facing.length) return [];

  const breaks = new Set();
  for (const edge of facing) {
    if (!(edge.s1 > edge.s0 + lengthEpsM)) continue;
    breaks.add(edge.s0);
    breaks.add(edge.s1);
  }
  const sorted = [...breaks].sort((a, b) => a - b);
  if (sorted.length < 2) return [];

  const intervals = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b - a < lengthEpsM) continue;
    const mid = (a + b) / 2;
    const bestDepth = frontmostDepthAtS(facing, mid);
    if (bestDepth == null) continue;

    // Corner posts only where a frontmost facing edge has a convex ring vertex.
    let cornerAtS0 = false;
    let cornerAtS1 = false;
    for (const edge of facing) {
      if (Math.abs(edge.depth - bestDepth) > depthEpsM) continue;
      if (Math.abs(edge.s0 - a) <= lengthEpsM && edge.convexAtS0) cornerAtS0 = true;
      if (Math.abs(edge.s1 - b) <= lengthEpsM && edge.convexAtS1) cornerAtS1 = true;
    }

    intervals.push({
      s0: a,
      s1: b,
      depth: bestDepth,
      cornerAtS0,
      cornerAtS1,
    });
  }

  // Merge only same-depth neighbours (keep depth steps as separate segments).
  const merged = [];
  for (const seg of intervals) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.s1 - seg.s0) < lengthEpsM &&
      Math.abs(last.depth - seg.depth) <= depthEpsM
    ) {
      last.s1 = seg.s1;
      last.cornerAtS1 = seg.cornerAtS1;
    } else {
      merged.push({
        s0: seg.s0,
        s1: seg.s1,
        depth: seg.depth,
        cornerAtS0: seg.cornerAtS0,
        cornerAtS1: seg.cornerAtS1,
      });
    }
  }

  return merged.map(({ s0, s1, cornerAtS0, cornerAtS1 }) => ({
    s0,
    s1,
    cornerAtS0,
    cornerAtS1,
  }));
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

    const facing = [];
    for (let i = 0; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = counterClockwise ? dz / len : -dz / len;
      const nz = counterClockwise ? -dx / len : dx / len;
      if (nx * viewDir.x + nz * viewDir.z <= 0.05) continue;

      const sA = projectS(a);
      const sB = projectS(b);
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + b.z) / 2;
      const depth = midX * viewDir.x + midZ * viewDir.z;
      const convexA = isConvexFootprintVertex(ring, i, counterClockwise);
      const convexB = isConvexFootprintVertex(ring, (i + 1) % n, counterClockwise);
      facing.push({
        s0: Math.min(sA, sB),
        s1: Math.max(sA, sB),
        depth,
        convexAtS0: sA <= sB ? convexA : convexB,
        convexAtS1: sA <= sB ? convexB : convexA,
      });
    }

    const segments = buildFrontmostElevationSegments(facing);

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
