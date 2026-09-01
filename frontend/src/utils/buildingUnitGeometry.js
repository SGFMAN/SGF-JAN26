import * as THREE from "three";
import {
  tracePolygonToOuterXZRing,
  getTracePlanXZMapping,
  normalizedPointToXZ,
  offsetPolygonInward,
} from "./tracePlan3D";

export const DEFAULT_UNIT_WIDTH_M = 11.3;
export const DEFAULT_UNIT_DEPTH_M = 5.0;
/** Framed external wall depth (metres). Weatherboards sit as 10 mm boards on the outer face. */
export const CLADDING_WALL_THICKNESS_M = 0.1;
/** Weatherboard section: 230 mm × 19 mm, lapped 30 mm (200 mm cover). */
export const WEATHERBOARD_HEIGHT_M = 0.23;
export const WEATHERBOARD_THICKNESS_M = 0.019;
export const WEATHERBOARD_LAP_M = 0.03;
export const WEATHERBOARD_COVER_M = WEATHERBOARD_HEIGHT_M - WEATHERBOARD_LAP_M;
/** Clearance outside the stud face so boards sit proud of the frame. */
export const WEATHERBOARD_FRAME_GAP_M = 0.001;
/** 10 mm plasterboard lining. */
export const WALL_LINING_THICKNESS_M = 0.01;
/** Keep lining off the stud face so distant views do not z-fight the frame through it. */
export const WALL_LINING_FRAME_GAP_M = 0.003;
/** Dark band on the underside / drip edge so laps read as separate boards. */
const WEATHERBOARD_UNDERSIDE_SHADOW_M = 0.05;
/** Drip darkening is 60% of the previous 0.16 shade (1 − 0.84 × 0.6). */
const WEATHERBOARD_UNDERSIDE_SHADE = 0.496;

/**
 * Vertex colours: optional drip-edge shade on the board underside.
 * Always writes a colour attribute so merged weatherboard geos match.
 */
function applyWeatherboardVertexColors(geometry, { undersideShadow = false } = {}) {
  geometry.computeBoundingBox();
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  if (!undersideShadow) {
    colors.fill(1);
  } else {
    const yMin = geometry.boundingBox.min.y;
    const band = Math.min(
      WEATHERBOARD_UNDERSIDE_SHADOW_M,
      Math.max(0.006, (geometry.boundingBox.max.y - yMin) * 0.35)
    );
    const range = 1 - WEATHERBOARD_UNDERSIDE_SHADE;
    for (let i = 0; i < pos.count; i += 1) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / band));
      const shade = WEATHERBOARD_UNDERSIDE_SHADE + range * t;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/**
 * Top Y of each weatherboard row within a wall of height `wallHM` (metres).
 * Rows start at the top of the top plate and step down by the 200 mm cover.
 */
export function weatherboardRowTops(wallHM) {
  const cover = WEATHERBOARD_COVER_M;
  const wallH = Number(wallHM) || 0;
  const tops = [];
  if (!(wallH > 0.02)) return tops;
  for (let top = wallH; top > 1e-4; top -= cover) {
    tops.push(Math.round(top * 10000) / 10000);
  }
  return tops;
}

function weatherboardRunsAlongLength(lengthM, cuts) {
  const L = Math.max(0, Number(lengthM) || 0);
  if (!(L > 0.02)) return [];
  const merged = [];
  const sorted = (cuts || [])
    .map((c) => ({
      min: Math.max(0, Number(c.min)),
      max: Math.min(L, Number(c.max)),
    }))
    .filter((c) => c.max - c.min > 0.02)
    .sort((a, b) => a.min - b.min);
  for (const cut of sorted) {
    const last = merged[merged.length - 1];
    if (last && cut.min <= last.max + 0.01) last.max = Math.max(last.max, cut.max);
    else merged.push({ ...cut });
  }
  const runs = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.min - cursor > 0.02) {
      runs.push({
        along: (cursor + cut.min) / 2,
        length: cut.min - cursor,
      });
    }
    cursor = Math.max(cursor, cut.max);
  }
  if (L - cursor > 0.02) {
    runs.push({ along: (cursor + L) / 2, length: L - cursor });
  }
  return runs;
}

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

function pointInRingXZ(x, z, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const crosses = zi > z !== zj > z;
    if (!crosses) continue;
    const atX = ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi;
    if (x < atX) inside = !inside;
  }
  return inside;
}

/** Inward unit normal for a footprint edge (winding, not centroid — L re-entrants stay correct). */
export function footprintEdgeInwardXZ(dirX, dirZ, ring) {
  const ccw = ringSignedAreaXZ(ring) > 0;
  return ccw ? { x: -dirZ, z: dirX } : { x: dirZ, z: -dirX };
}

/**
 * Corner column centres: 50×50 posts sitting proud of both adjacent faces.
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
    const inward = footprintEdgeInwardXZ(dirX, dirZ, clean);
    const inX = inward.x;
    const inZ = inward.z;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;

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

function minDistPointToRingXZ(p, ring) {
  const clean = sanitizeFootprintRing(ring);
  let best = Infinity;
  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq));
    const dist = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    if (dist < best) best = dist;
  }
  return best;
}

function resolvedOpeningLocals({
  a,
  dx,
  dz,
  len,
  dirX,
  dirZ,
  openings,
  bottomYM,
  wallH,
  maxDistM = 0.25,
}) {
  const locals = [];
  for (const op of openings || []) {
    if (!(op?.lengthM > 0) && !(op?.x1 > op?.x0)) continue;
    let x0;
    let x1;
    if (Number.isFinite(op.x0) && Number.isFinite(op.x1)) {
      x0 = op.x0;
      x1 = op.x1;
    } else {
      const half = op.lengthM / 2;
      const align = Math.abs(op.dirX * dirX + op.dirZ * dirZ);
      if (align < 0.7) continue;
      const t = Math.max(
        0,
        Math.min(1, ((op.midX - a.x) * dx + (op.midZ - a.z) * dz) / (len * len))
      );
      const px = a.x + t * dx;
      const pz = a.z + t * dz;
      if (Math.hypot(op.midX - px, op.midZ - pz) > maxDistM) continue;
      const projectAlong = (qx, qz) =>
        Math.max(0, Math.min(len, (qx - a.x) * dirX + (qz - a.z) * dirZ));
      x0 = projectAlong(op.midX - op.dirX * half, op.midZ - op.dirZ * half);
      x1 = projectAlong(op.midX + op.dirX * half, op.midZ + op.dirZ * half);
    }
    if (x1 < x0) {
      const tmp = x0;
      x0 = x1;
      x1 = tmp;
    }
    x0 = Math.max(0, x0);
    x1 = Math.min(len, x1);
    if (x1 - x0 < 0.05) continue;
    const y0 = Math.max(0, (op.openingBottomYM ?? bottomYM) - bottomYM);
    const y1 = Math.min(wallH, (op.openingTopYM ?? bottomYM + wallH) - bottomYM);
    if (y1 - y0 < 0.05) continue;
    locals.push({ x0, x1, y0, y1 });
  }
  return locals;
}

function punchResolvedHoles(shape, locals) {
  for (const { x0, x1, y0, y1 } of locals) {
    const hole = new THREE.Path();
    // Opposite winding to the wall sheet so earcut keeps the hole on-size.
    hole.moveTo(x0, y0);
    hole.lineTo(x0, y1);
    hole.lineTo(x1, y1);
    hole.lineTo(x1, y0);
    hole.closePath();
    shape.holes.push(hole);
  }
}

function addOpeningRevealParts(parts, {
  originX,
  originZ,
  dirX,
  dirZ,
  x0,
  x1,
  y0,
  y1,
  bottomYM,
  thicknessM,
  z0,
  z1,
}) {
  const doorW = x1 - x0;
  const doorH = y1 - y0;
  const depth = z1 - z0;
  if (doorW < 0.05 || doorH < 0.05 || Math.abs(depth) < 0.005 || !(thicknessM > 0)) {
    return;
  }
  const t = thicknessM;
  const rotY = Math.atan2(-dirZ, dirX);
  const zLo = Math.min(z0, z1);
  const zHi = Math.max(z0, z1);
  const sz = zHi - zLo;
  const zc = (zLo + zHi) / 2;
  const xc = (x0 + x1) / 2;
  const yc = (y0 + y1) / 2;
  const hasSill = y0 > 0.05;

  const pushBox = (lx, ly, lz, sx, sy, boxZ) => {
    const geometry = new THREE.BoxGeometry(sx, sy, boxZ);
    geometry.translate(lx, ly, lz);
    geometry.computeVertexNormals();
    parts.push({
      geometry,
      position: { x: originX, y: bottomYM, z: originZ },
      rotationY: rotY,
      isReveal: true,
    });
  };

  // Local X = along wall, Y = up, Z = through the wall (same as the lining sheet).
  pushBox(x0 + t / 2, yc, zc, t, doorH, sz);
  pushBox(x1 - t / 2, yc, zc, t, doorH, sz);
  pushBox(xc, y1 - t / 2, zc, doorW, t, sz);
  if (hasSill) pushBox(xc, y0 + t / 2, zc, doorW, t, sz);
}

function extrudeLiningSheet(shape, {
  originX,
  originZ,
  bottomYM,
  dirX,
  dirZ,
  sideX,
  sideZ,
  thicknessM,
}) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessM,
    bevelEnabled: false,
    curveSegments: 1,
  });
  const rotY = Math.atan2(-dirZ, dirX);
  const leftX = -dirZ;
  const leftZ = dirX;
  const leftIsSide = leftX * sideX + leftZ * sideZ >= 0;
  if (!leftIsSide) geometry.translate(0, 0, -thicknessM);
  geometry.computeVertexNormals();
  return {
    geometry,
    position: { x: originX, y: bottomYM, z: originZ },
    rotationY: rotY,
  };
}

/**
 * 10 mm plaster on the inner face of the external frame, openings cut
 * for windows, doors, and internal-wall T-junctions.
 */
export function buildExternalWallLiningParts(
  ring,
  bottomYM,
  topYM,
  openings = [],
  { frameDepthM = 0.09, thicknessM = WALL_LINING_THICKNESS_M, gapM = WALL_LINING_FRAME_GAP_M } = {}
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM) || !(thicknessM > 0)) return [];
  const insetM = frameDepthM + gapM;
  const inner = offsetPolygonInward(clean, insetM);
  let faceRing = inner && inner.length >= 3 ? inner : clean;
  if (faceRing !== clean) {
    const outerArea = ringSignedAreaXZ(clean);
    const innerArea = ringSignedAreaXZ(faceRing);
    if (outerArea * innerArea < 0) faceRing = [...faceRing].reverse();
  }
  const extraInward = inner && inner.length >= 3 ? 0 : insetM;
  const wallH = topYM - bottomYM;
  const parts = [];

  for (let i = 0; i < faceRing.length; i += 1) {
    const a0 = faceRing[i];
    const b0 = faceRing[(i + 1) % faceRing.length];
    const dx = b0.x - a0.x;
    const dz = b0.z - a0.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) continue;
    const dirX = dx / len;
    const dirZ = dz / len;
    const inward = footprintEdgeInwardXZ(dirX, dirZ, faceRing);
    const a = {
      x: a0.x + inward.x * extraInward,
      z: a0.z + inward.z * extraInward,
    };
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, wallH);
    shape.lineTo(0, wallH);
    shape.closePath();
    const holeLocals = resolvedOpeningLocals({
      a,
      dx,
      dz,
      len,
      dirX,
      dirZ,
      openings,
      bottomYM,
      wallH,
      maxDistM: 0.45,
    });
    punchResolvedHoles(shape, holeLocals);
    parts.push(
      extrudeLiningSheet(shape, {
        originX: a.x,
        originZ: a.z,
        bottomYM,
        dirX,
        dirZ,
        sideX: inward.x,
        sideZ: inward.z,
        thicknessM,
      })
    );
    // Frame sits on the opposite side of the lining plane from the room.
    const leftX = -dirZ;
    const leftZ = dirX;
    const leftIsInward = leftX * inward.x + leftZ * inward.z >= 0;
    const revealDepthM = frameDepthM + gapM;
    // Include lining thickness so the wrap is flush with the inner face.
    const z0 = leftIsInward ? -revealDepthM : -thicknessM;
    const z1 = leftIsInward ? thicknessM : revealDepthM;
    for (const hole of holeLocals) {
      const fullHeight = hole.y0 < 0.02 && hole.y1 > wallH - 0.02;
      if (fullHeight) continue;
      addOpeningRevealParts(parts, {
        originX: a.x,
        originZ: a.z,
        dirX,
        dirZ,
        x0: hole.x0,
        x1: hole.x1,
        y0: hole.y0,
        y1: hole.y1,
        bottomYM,
        thicknessM,
        z0,
        z1,
      });
    }
  }
  return parts;
}

/**
 * Full-height slots in the external lining where an internal wall T's in.
 */
export function liningTJunctionOpeningsOnRing(
  ring,
  segmentsXZ,
  bottomYM,
  topYM,
  widthM,
  endSnapM = 0.16
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(widthM > 0.05)) return [];
  const openings = [];
  for (const seg of segmentsXZ || []) {
    if (!seg?.a || !seg?.b) continue;
    for (const pt of [seg.a, seg.b]) {
      let best = null;
      for (let i = 0; i < clean.length; i += 1) {
        const a = clean[i];
        const b = clean[(i + 1) % clean.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.05) continue;
        const dirX = dx / len;
        const dirZ = dz / len;
        const along = Math.max(0, Math.min(len, (pt.x - a.x) * dirX + (pt.z - a.z) * dirZ));
        const px = a.x + dirX * along;
        const pz = a.z + dirZ * along;
        const dist = Math.hypot(pt.x - px, pt.z - pz);
        if (!best || dist < best.dist) {
          best = { dist, px, pz, dirX, dirZ, along, len };
        }
      }
      if (!best || best.dist > endSnapM) continue;
      if (best.along < 0.04 || best.along > best.len - 0.04) continue;
      openings.push({
        midX: best.px,
        midZ: best.pz,
        dirX: best.dirX,
        dirZ: best.dirZ,
        lengthM: widthM,
        openingBottomYM: bottomYM,
        openingTopYM: topYM,
      });
    }
  }
  return openings;
}

/**
 * 10 mm plaster on both faces of each internal-wall frame, doors cut out.
 * Ends that T into the external wall stop at the inner stud face.
 */
export function buildInternalWallLiningParts({
  segmentsXZ = [],
  doors = [],
  ring = null,
  bottomYM,
  topYM,
  frameDepthM = 0.09,
  thicknessM = WALL_LINING_THICKNESS_M,
  gapM = WALL_LINING_FRAME_GAP_M,
}) {
  if (!(topYM > bottomYM) || !(thicknessM > 0)) return [];
  const wallH = topYM - bottomYM;
  const halfFrame = frameDepthM / 2;
  const liningOff = halfFrame + gapM;
  const overallHalf = liningOff + thicknessM;
  const parts = [];
  const segs = (segmentsXZ || []).map((seg, index) => {
    if (!seg?.a || !seg?.b) return null;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.08) return null;
    return {
      index,
      a: seg.a,
      b: seg.b,
      len,
      dirX: dx / len,
      dirZ: dz / len,
    };
  }).filter(Boolean);

  const endInset = segs.map(() => ({ start: 0, end: 0 }));

  segs.forEach((seg, i) => {
    if (ring) {
      if (minDistPointToRingXZ(seg.a, ring) < 0.14) endInset[i].start = liningOff;
      if (minDistPointToRingXZ(seg.b, ring) < 0.14) endInset[i].end = liningOff;
    }
    segs.forEach((other) => {
      if (other === seg) return;
      const colinear = Math.abs(seg.dirX * other.dirX + seg.dirZ * other.dirZ) > 0.5;
      // Parallel / colinear runs are one wall — do not slot the lining between them.
      if (colinear) return;
      for (const [pt, which] of [
        [seg.a, "start"],
        [seg.b, "end"],
      ]) {
        const along =
          (pt.x - other.a.x) * other.dirX + (pt.z - other.a.z) * other.dirZ;
        if (along < 0.08 || along > other.len - 0.08) continue;
        const px = other.a.x + other.dirX * along;
        const pz = other.a.z + other.dirZ * along;
        const dist = Math.hypot(pt.x - px, pt.z - pz);
        if (dist > 0.08) continue;
        endInset[i][which] = Math.max(endInset[i][which], overallHalf);
      }
    });
  });

  segs.forEach((seg, i) => {
    const xStart = Math.max(0, endInset[i].start);
    const xEnd = Math.min(seg.len, seg.len - endInset[i].end);
    const sheetLen = xEnd - xStart;
    if (sheetLen < 0.05) return;
    const origin = {
      x: seg.a.x + seg.dirX * xStart,
      z: seg.a.z + seg.dirZ * xStart,
    };
    const perpX = -seg.dirZ;
    const perpZ = seg.dirX;
    const doorHoles = (doors || [])
      .filter((d) => d.segmentIndex === seg.index && d.lengthM > 0.05)
      .map((d) => ({
        x0: (d.along0 ?? 0) - xStart,
        x1: (d.along1 ?? 0) - xStart,
        openingBottomYM: d.openingBottomYM ?? bottomYM,
        openingTopYM: d.openingTopYM ?? bottomYM + Math.min(2.1, wallH),
      }));
    const holeLocals = resolvedOpeningLocals({
      a: origin,
      dx: seg.dirX * sheetLen,
      dz: seg.dirZ * sheetLen,
      len: sheetLen,
      dirX: seg.dirX,
      dirZ: seg.dirZ,
      openings: doorHoles,
      bottomYM,
      wallH,
    });

    for (const side of [1, -1]) {
      const sideX = perpX * side;
      const sideZ = perpZ * side;
      const face = {
        x: origin.x + sideX * liningOff,
        z: origin.z + sideZ * liningOff,
      };
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(sheetLen, 0);
      shape.lineTo(sheetLen, wallH);
      shape.lineTo(0, wallH);
      shape.closePath();
      punchResolvedHoles(shape, holeLocals);
      parts.push(
        extrudeLiningSheet(shape, {
          originX: face.x,
          originZ: face.z,
          bottomYM,
          dirX: seg.dirX,
          dirZ: seg.dirZ,
          sideX,
          sideZ,
          thicknessM,
        })
      );
    }
    const revealDepthM = frameDepthM + 2 * gapM;
    const zHalf = revealDepthM / 2 + thicknessM;
    for (const hole of holeLocals) {
      addOpeningRevealParts(parts, {
        originX: origin.x,
        originZ: origin.z,
        dirX: seg.dirX,
        dirZ: seg.dirZ,
        x0: hole.x0,
        x1: hole.x1,
        y0: hole.y0,
        y1: hole.y1,
        bottomYM,
        thicknessM,
        z0: -zHalf,
        z1: zHalf,
      });
    }
  });

  return parts;
}

/**
 * Individual weatherboards per footprint edge: 230 × 10 mm, 30 mm lap (200 mm cover).
 * Rows start at the top of the wall (top plate) and work down; any leftover
 * short board is at the bottom. Each board runs the wall length. Openings
 * notch only the height band they occupy — boards above a door or below a
 * window run through over the studs. Boards sit proud of the frame.
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
 * @param {{ rowIndexOffset?: number }} [options]
 * @returns {{ geometry: THREE.BufferGeometry, position: {x,y,z}, rotationY: number, lengthM: number, heightM: number, rowIndex: number }[]}
 */
export function buildFootprintWeatherboardParts(
  ring,
  bottomYM,
  topYM,
  openings = [],
  thicknessM = WEATHERBOARD_THICKNESS_M,
  options = {}
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !(topYM > bottomYM) || !(thicknessM > 0)) return [];

  const wallH = topYM - bottomYM;
  const rowIndexOffset = Math.max(0, Math.floor(Number(options.rowIndexOffset) || 0));
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
    const inward = footprintEdgeInwardXZ(dirX, dirZ, clean);
    const inX = inward.x;
    const inZ = inward.z;
    const rotY = Math.atan2(-dirZ, dirX);
    const leftIsInward = -dirZ * inX + dirX * inZ >= 0;
    const tiltX =
      Math.atan(thicknessM / WEATHERBOARD_COVER_M) * (leftIsInward ? 1 : -1);

    const wallOpenings = [];
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
      wallOpenings.push({
        x0,
        x1,
        openingBottomYM: op.openingBottomYM ?? bottomYM,
        openingTopYM: op.openingTopYM ?? topYM,
      });
    }

    weatherboardRowTops(wallH).forEach((rowTop, rowInWall) => {
      const rowIndex = rowIndexOffset + rowInWall;
      const thisBoardH = Math.min(WEATHERBOARD_HEIGHT_M, rowTop);
      if (!(thisBoardH > 0.02)) return;
      const boardTop = bottomYM + rowTop;
      const boardBot = boardTop - thisBoardH;
      const overlapping = wallOpenings.filter(
        (op) =>
          op.openingBottomYM < boardTop - 1e-4 && op.openingTopYM > boardBot + 1e-4
      );
      const ySet = new Set([boardBot, boardTop]);
      for (const op of overlapping) {
        if (
          op.openingBottomYM > boardBot + 1e-4 &&
          op.openingBottomYM < boardTop - 1e-4
        ) {
          ySet.add(op.openingBottomYM);
        }
        if (
          op.openingTopYM > boardBot + 1e-4 &&
          op.openingTopYM < boardTop - 1e-4
        ) {
          ySet.add(op.openingTopYM);
        }
      }
      const ys = [...ySet].sort((a, b) => a - b);
      const outward = WEATHERBOARD_FRAME_GAP_M + thicknessM / 2;

      for (let band = 0; band < ys.length - 1; band += 1) {
        const y0 = ys[band];
        const y1 = ys[band + 1];
        const stripH = y1 - y0;
        if (stripH < 0.006) continue;
        const midY = (y0 + y1) / 2;
        const cuts = overlapping
          .filter(
            (op) =>
              op.openingBottomYM < midY - 1e-6 && op.openingTopYM > midY + 1e-6
          )
          .map((op) => ({ min: op.x0, max: op.x1 }));
        const runs = weatherboardRunsAlongLength(len, cuts);
        const isBoardBottom = Math.abs(y0 - boardBot) < 1e-4;

        const boardCenterY = boardBot + thisBoardH / 2;
        runs.forEach((run) => {
          const heightSegs = Math.max(2, Math.round(stripH / 0.015));
          const geometry = new THREE.BoxGeometry(
            run.length,
            stripH,
            thicknessM,
            1,
            heightSegs,
            1
          );
          // Tilt around the original board centre so a notched row stays one board.
          geometry.translate(0, (y0 + y1) / 2 - boardCenterY, 0);
          applyWeatherboardVertexColors(geometry, {
            undersideShadow: isBoardBottom,
          });
          geometry.computeVertexNormals();
          parts.push({
            geometry,
            position: {
              x: a.x + dirX * run.along - inX * outward,
              y: boardCenterY,
              z: a.z + dirZ * run.along - inZ * outward,
            },
            rotationY: rotY,
            tiltX,
            lengthM: run.length,
            heightM: stripH,
            rowIndex,
          });
        });
      }
    });
  }

  return parts;
}

/** Duragroove sheet: 10 mm thick, vertical grooves 5 mm wide at 170 mm centres. */
export const DURAGROOVE_THICKNESS_M = 0.01;
export const DURAGROOVE_GROOVE_SPACING_M = 0.17;
export const DURAGROOVE_GROOVE_WIDTH_M = 0.005;
export const DURAGROOVE_GROOVE_DEPTH_M = 0.007;
/** Keep the sheet off the stud face so the frame cannot z-fight through. */
export const DURAGROOVE_FRAME_GAP_M = 0.01;

/** 1 px/mm tile: flat sheet with only a 5 mm groove, no halo. */
export function getDuragrooveMaps() {
  const w = 170;
  const h = 8;
  const groovePx = 5;
  const albedo = document.createElement("canvas");
  albedo.width = w;
  albedo.height = h;
  const aCtx = albedo.getContext("2d");
  const aData = aCtx.createImageData(w, h);
  const normal = document.createElement("canvas");
  normal.width = w;
  normal.height = h;
  const nCtx = normal.getContext("2d");
  const nData = nCtx.createImageData(w, h);
  const halfG = groovePx / 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dist = Math.min(x, w - x);
      const i = (y * w + x) * 4;
      const inGroove = dist < halfG;
      const c = inGroove ? 168 : 255;
      aData.data[i] = c;
      aData.data[i + 1] = c;
      aData.data[i + 2] = c;
      aData.data[i + 3] = 255;
      let nx = 0.5;
      if (inGroove && dist > 0.2) {
        nx = x < w / 2 ? 0.62 : 0.38;
      }
      nData.data[i] = Math.round(nx * 255);
      nData.data[i + 1] = 128;
      nData.data[i + 2] = 255;
      nData.data[i + 3] = 255;
    }
  }
  aCtx.putImageData(aData, 0, 0);
  nCtx.putImageData(nData, 0, 0);
  const map = new THREE.CanvasTexture(albedo);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;
  const normalMap = new THREE.CanvasTexture(normal);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.generateMipmaps = false;
  normalMap.minFilter = THREE.LinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.anisotropy = 4;
  normalMap.needsUpdate = true;
  return { map, normalMap };
}

function applyDuragrooveUVs(geometry, alongMid, firstCentreM) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const spacing = DURAGROOVE_GROOVE_SPACING_M;
  for (let i = 0; i < pos.count; i += 1) {
    const along = alongMid + pos.getX(i);
    uv.setXY(i, (along - firstCentreM) / spacing, 0.5);
  }
  uv.needsUpdate = true;
}

/**
 * Vertical Duragroove sheets on each footprint edge: 10 mm board, 5 mm
 * grooves at 170 mm centres, notched around door/window openings.
 */
export function buildFootprintDuragrooveParts(
  ring,
  bottomYM,
  topYM,
  openings = []
) {
  const clean = sanitizeFootprintRing(ring);
  const thicknessM = DURAGROOVE_THICKNESS_M;
  const frameGap = DURAGROOVE_FRAME_GAP_M;
  if (clean.length < 3 || !(topYM > bottomYM)) return [];

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
    const inward = footprintEdgeInwardXZ(dirX, dirZ, clean);
    const inX = inward.x;
    const inZ = inward.z;
    const rotY = Math.atan2(-dirZ, dirX);
    const nMod = Math.max(1, Math.round(len / DURAGROOVE_GROOVE_SPACING_M));
    const firstCentreM = len / 2 - ((nMod - 1) * DURAGROOVE_GROOVE_SPACING_M) / 2;

    const wallOpenings = [];
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
      wallOpenings.push({
        x0,
        x1,
        openingBottomYM: op.openingBottomYM ?? bottomYM,
        openingTopYM: op.openingTopYM ?? topYM,
      });
    }

    const ySet = new Set([bottomYM, topYM]);
    for (const op of wallOpenings) {
      if (op.openingBottomYM > bottomYM + 1e-4 && op.openingBottomYM < topYM - 1e-4) {
        ySet.add(op.openingBottomYM);
      }
      if (op.openingTopYM > bottomYM + 1e-4 && op.openingTopYM < topYM - 1e-4) {
        ySet.add(op.openingTopYM);
      }
    }
    const ys = [...ySet].sort((left, right) => left - right);

    for (let band = 0; band < ys.length - 1; band += 1) {
      const y0 = ys[band];
      const y1 = ys[band + 1];
      const stripH = y1 - y0;
      if (stripH < 0.006) continue;
      const midY = (y0 + y1) / 2;
      const cuts = wallOpenings
        .filter(
          (op) =>
            op.openingBottomYM < midY - 1e-6 && op.openingTopYM > midY + 1e-6
        )
        .map((op) => ({ min: op.x0, max: op.x1 }));
      const runs = weatherboardRunsAlongLength(len, cuts);
      runs.forEach((run) => {
        const runStart = run.along - run.length / 2;
        const runEnd = run.along + run.length / 2;
        const segLen = runEnd - runStart;
        if (!(segLen > 0.002)) return;
        const along = (runStart + runEnd) / 2;
        const geometry = new THREE.BoxGeometry(segLen, stripH, thicknessM);
        applyDuragrooveUVs(geometry, along, firstCentreM);
        const outM = frameGap + thicknessM / 2;
        parts.push({
          geometry,
          position: {
            x: a.x + dirX * along - inX * outM,
            y: midY,
            z: a.z + dirZ * along - inZ * outM,
          },
          rotationY: rotY,
          tiltX: 0,
          lengthM: segLen,
          heightM: stripH,
        });
      });
    }
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

  const ringXZ = sanitizeFootprintRing(
    normalizedPoints.map((p) => normalizedPointToXZ(p, mapping))
  );
  if (ringXZ.length < 3) return [];

  const edges = [];
  for (let i = 0; i < ringXZ.length; i += 1) {
    const ea = ringXZ[i];
    const eb = ringXZ[(i + 1) % ringXZ.length];
    const edx = eb.x - ea.x;
    const edz = eb.z - ea.z;
    const elen = Math.hypot(edx, edz);
    if (elen < 0.05) continue;
    const dirX = edx / elen;
    const dirZ = edz / elen;
    const inward = footprintEdgeInwardXZ(dirX, dirZ, ringXZ);
    edges.push({ a: ea, dirX, dirZ, len: elen, inX: inward.x, inZ: inward.z });
  }
  if (!edges.length) return [];

  const maxSnapDistM = 0.4;
  const result = [];
  for (const win of normalizedWindows) {
    if (!win?.a || !win?.b) continue;
    const a = normalizedPointToXZ(win.a, mapping);
    const b = normalizedPointToXZ(win.b, mapping);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const tracedLen = Math.hypot(dx, dz);
    if (tracedLen < 0.05) continue;
    const tracedDirX = dx / tracedLen;
    const tracedDirZ = dz / tracedLen;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;

    let best = null;
    for (const edge of edges) {
      const t = Math.max(
        0,
        Math.min(1, ((midX - edge.a.x) * edge.dirX + (midZ - edge.a.z) * edge.dirZ) / edge.len)
      );
      const px = edge.a.x + t * edge.dirX * edge.len;
      const pz = edge.a.z + t * edge.dirZ * edge.len;
      const dist = Math.hypot(midX - px, midZ - pz);
      const align = Math.abs(tracedDirX * edge.dirX + tracedDirZ * edge.dirZ);
      if (
        !best ||
        dist < best.dist - 1e-6 ||
        (Math.abs(dist - best.dist) < 1e-6 && align > best.align)
      ) {
        best = { edge, dist, align, px, pz };
      }
    }

    const heightM = Number(win.heightM);
    const resolvedHeight =
      Number.isFinite(heightM) && heightM > 0 ? heightM : null;

    if (best && best.dist <= maxSnapDistM && best.align >= 0.7) {
      const edge = best.edge;
      const projectAlong = (qx, qz) =>
        Math.max(0, Math.min(edge.len, (qx - edge.a.x) * edge.dirX + (qz - edge.a.z) * edge.dirZ));
      let along0 = projectAlong(a.x, a.z);
      let along1 = projectAlong(b.x, b.z);
      if (along1 < along0) {
        const tmp = along0;
        along0 = along1;
        along1 = tmp;
      }
      if (along1 - along0 < 0.05) {
        const midAlong = projectAlong(midX, midZ);
        along0 = Math.max(0, midAlong - tracedLen / 2);
        along1 = Math.min(edge.len, midAlong + tracedLen / 2);
      }
      if (along1 - along0 < 0.05) continue;
      const centerAlong = (along0 + along1) / 2;
      result.push({
        midX: edge.a.x + edge.dirX * centerAlong,
        midZ: edge.a.z + edge.dirZ * centerAlong,
        dirX: edge.dirX,
        dirZ: edge.dirZ,
        normalX: -edge.inX,
        normalZ: -edge.inZ,
        lengthM: along1 - along0,
        heightM: resolvedHeight,
      });
      continue;
    }

    let nX = -tracedDirZ;
    let nZ = tracedDirX;
    if (pointInRingXZ(midX + nX * 0.08, midZ + nZ * 0.08, ringXZ)) {
      nX = -nX;
      nZ = -nZ;
    }
    result.push({
      midX,
      midZ,
      dirX: tracedDirX,
      dirZ: tracedDirZ,
      normalX: nX,
      normalZ: nZ,
      lengthM: tracedLen,
      heightM: resolvedHeight,
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
