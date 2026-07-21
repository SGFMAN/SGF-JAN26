import * as THREE from "three";
import { sanitizeFootprintRing } from "./buildingUnitGeometry.js";
import { ROOF_PITCH_DEG, ROOF_STYLE_SUPERIOR_SKILLION } from "../constants/roofStyles.js";

function ringSignedAreaXZ(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area * 0.5;
}

/** Skillion roof pitch (degrees). */
export const SKILLION_ROOF_PITCH_DEG = ROOF_PITCH_DEG[ROOF_STYLE_SUPERIOR_SKILLION];

/** Skillion roof slab thickness (400 mm), measured perpendicular to the roof plane. */
export const SKILLION_ROOF_SLAB_THICKNESS_M = 0.4;

/**
 * Pitch axis from a swing door: door side is high, opposite side is low.
 * Pitching point is the low-side perimeter at wall top.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {{ normalX: number, normalZ: number } | null | undefined} swingDoor
 */
export function resolveSkillionPitchFromSwingDoor(ring, swingDoor) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3) return null;

  let highDir = null;
  if (swingDoor) {
    const len = Math.hypot(swingDoor.normalX, swingDoor.normalZ);
    if (len >= 1e-6) {
      highDir = { x: swingDoor.normalX / len, z: swingDoor.normalZ / len };
    }
  }

  if (!highDir) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of clean) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    highDir = maxX - minX <= maxZ - minZ ? { x: 1, z: 0 } : { x: 0, z: 1 };
  }

  let projMin = Infinity;
  let projMax = -Infinity;
  for (const p of clean) {
    const proj = p.x * highDir.x + p.z * highDir.z;
    projMin = Math.min(projMin, proj);
    projMax = Math.max(projMax, proj);
  }

  return { highDir, projMin, projMax, runM: projMax - projMin };
}

/**
 * Pitch from a user-traced horizontal/vertical hinge (pivot) line in plan XZ.
 * The line is the low / hinge side; rise increases perpendicular away from it
 * toward the footprint centroid.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {{ x: number, z: number }} pivotA
 * @param {{ x: number, z: number }} pivotB
 */
export function resolveSkillionPitchFromPivotLine(ring, pivotA, pivotB) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !pivotA || !pivotB) return null;

  const dx = pivotB.x - pivotA.x;
  const dz = pivotB.z - pivotA.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return null;

  // Prefer axis-aligned hinge (trace is H/V); fall back to true perpendicular.
  let highDir;
  if (Math.abs(dx) >= Math.abs(dz)) {
    // Horizontal hinge → pitch along ±Z
    highDir = { x: 0, z: 1 };
  } else {
    // Vertical hinge → pitch along ±X
    highDir = { x: 1, z: 0 };
  }

  let cx = 0;
  let cz = 0;
  for (const p of clean) {
    cx += p.x;
    cz += p.z;
  }
  cx /= clean.length;
  cz /= clean.length;
  const midX = (pivotA.x + pivotB.x) * 0.5;
  const midZ = (pivotA.z + pivotB.z) * 0.5;
  if ((cx - midX) * highDir.x + (cz - midZ) * highDir.z < 0) {
    highDir = { x: -highDir.x, z: -highDir.z };
  }

  const projMin = midX * highDir.x + midZ * highDir.z;
  let projMax = projMin;
  for (const p of clean) {
    const proj = p.x * highDir.x + p.z * highDir.z;
    projMax = Math.max(projMax, proj);
  }

  return {
    highDir,
    projMin,
    projMax,
    runM: Math.max(0, projMax - projMin),
  };
}

/**
 * Prefer a traced pivot line; otherwise swing-door / footprint fallback.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {{ a?: { x: number, z: number }, b?: { x: number, z: number } } | null | undefined} pivotLineXZ
 * @param {{ normalX: number, normalZ: number } | null | undefined} swingDoor
 */
export function resolveSkillionPitch(ring, pivotLineXZ, swingDoor) {
  if (pivotLineXZ?.a && pivotLineXZ?.b) {
    const fromPivot = resolveSkillionPitchFromPivotLine(ring, pivotLineXZ.a, pivotLineXZ.b);
    if (fromPivot) return fromPivot;
  }
  return resolveSkillionPitchFromSwingDoor(ring, swingDoor);
}

function runAt(point, pitch) {
  return point.x * pitch.highDir.x + point.z * pitch.highDir.z - pitch.projMin;
}

/** Vertical rise of the skillion underside above wall top (metres). */
export function skillionUndersideRiseM(point, pitch, pitchDeg = SKILLION_ROOF_PITCH_DEG) {
  if (!pitch) return 0;
  const tanPitch = Math.tan((pitchDeg * Math.PI) / 180);
  return Math.max(0, runAt(point, pitch)) * tanPitch;
}

/** Peak underside rise above wall top (metres). */
export function skillionMaxWallRiseM(pitch, pitchDeg = SKILLION_ROOF_PITCH_DEG) {
  if (!pitch || !(pitch.runM > 0)) return 0;
  return pitch.runM * Math.tan((pitchDeg * Math.PI) / 180);
}

/**
 * Extra 200 mm cladding bands above the base wall top to fill under the skillion.
 * Each band is full layer height except a possible shorter top band.
 *
 * @returns {{ bottomRiseM: number, topRiseM: number }[]}
 */
export function skillionExtraCladdingBands(maxRiseM, layerHeightM = 0.2) {
  if (!(maxRiseM > 1e-6) || !(layerHeightM > 0)) return [];
  const bands = [];
  let bottom = 0;
  while (bottom < maxRiseM - 1e-9) {
    const top = Math.min(bottom + layerHeightM, maxRiseM);
    bands.push({ bottomRiseM: bottom, topRiseM: top });
    bottom = top;
  }
  return bands;
}

/**
 * Keep the portion of a ring on the high side of the skillion where underside rise >= minRiseM.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {{ highDir: { x: number, z: number }, projMin: number }} pitch
 * @param {number} minRiseM
 * @param {number} [pitchDeg=SKILLION_ROOF_PITCH_DEG]
 * @returns {{ x: number, z: number }[] | null}
 */
export function clipRingToSkillionMinRise(
  ring,
  pitch,
  minRiseM,
  pitchDeg = SKILLION_ROOF_PITCH_DEG
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !pitch) return null;
  if (!(minRiseM > 1e-9)) return clean;

  const tanPitch = Math.tan((pitchDeg * Math.PI) / 180);
  if (!(tanPitch > 0)) return null;
  const minRun = minRiseM / tanPitch;
  const threshold = pitch.projMin + minRun;
  const ax = pitch.highDir.x;
  const az = pitch.highDir.z;

  const inside = (p) => ax * p.x + az * p.z >= threshold - 1e-9;
  const intersect = (a, b) => {
    const da = ax * a.x + az * a.z - threshold;
    const db = ax * b.x + az * b.z - threshold;
    const t = da / (da - db);
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
    };
  };

  const out = [];
  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn && bIn) {
      out.push(b);
    } else if (aIn && !bIn) {
      out.push(intersect(a, b));
    } else if (!aIn && bIn) {
      out.push(intersect(a, b));
      out.push(b);
    }
  }

  if (out.length < 3) return null;
  // Drop near-duplicates from clip joints.
  const deduped = [];
  for (const p of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 1e-7) continue;
    deduped.push(p);
  }
  if (deduped.length >= 2) {
    const first = deduped[0];
    const last = deduped[deduped.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-7) deduped.pop();
  }
  return deduped.length >= 3 ? deduped : null;
}

/** Upward unit normal of the 5° roof plane (perpendicular to the slab faces). */
function roofUpNormal(highDir, pitchRad) {
  const sinPitch = Math.sin(pitchRad);
  const cosPitch = Math.cos(pitchRad);
  const nx = -sinPitch * highDir.x;
  const ny = cosPitch;
  const nz = -sinPitch * highDir.z;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

/**
 * Uniform 400 mm thick slab pitched at 5° about the low-side wall top.
 * Bottom and top faces are parallel; thickness is perpendicular to the plane.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {number} wallTopY
 * @param {{ normalX: number, normalZ: number } | null | undefined} swingDoor
 * @param {number} [pitchDeg=SKILLION_ROOF_PITCH_DEG]
 * @param {number} [thicknessM=SKILLION_ROOF_SLAB_THICKNESS_M]
 */
export function buildSkillionRoofSlabMeshData(
  ring,
  wallTopY,
  swingDoor,
  pitchDeg = SKILLION_ROOF_PITCH_DEG,
  thicknessM = SKILLION_ROOF_SLAB_THICKNESS_M,
  pivotLineXZ = null
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !Number.isFinite(wallTopY) || !(thicknessM > 0)) return null;

  const pitch = resolveSkillionPitch(clean, pivotLineXZ, swingDoor);
  if (!pitch) return null;

  const pitchRad = (pitchDeg * Math.PI) / 180;
  const tanPitch = Math.tan(pitchRad);
  const upNormal = roofUpNormal(pitch.highDir, pitchRad);

  // Bottom face: pitched at 5° from the low-side pitching point on wall top.
  const bottomVerts = clean.map((p) => ({
    x: p.x,
    y: wallTopY + Math.max(0, runAt(p, pitch)) * tanPitch,
    z: p.z,
  }));
  // Top face: parallel offset by thickness along the roof-plane normal.
  const topVerts = bottomVerts.map((b) => ({
    x: b.x + upNormal.x * thicknessM,
    y: b.y + upNormal.y * thicknessM,
    z: b.z + upNormal.z * thicknessM,
  }));

  let maxRiseM = 0;
  for (const top of topVerts) {
    maxRiseM = Math.max(maxRiseM, top.y - wallTopY);
  }

  const contour = clean.map((p) => new THREE.Vector2(p.x, p.z));
  // ShapeUtils expects CCW; flip if the ring is clockwise.
  let signedArea = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    signedArea += a.x * b.z - b.x * a.z;
  }
  if (signedArea < 0) {
    contour.reverse();
    bottomVerts.reverse();
    topVerts.reverse();
  }
  const capIndices = THREE.ShapeUtils.triangulateShape(contour, []);
  const n = clean.length;

  const positions = [];
  const indices = [];

  function addVertex(p) {
    const idx = positions.length;
    positions.push([p.x, p.y, p.z]);
    return idx;
  }

  // Separate vertex sets so caps and sides don't share normals / get culled oddly.
  const bottomCapIdx = bottomVerts.map((p) => addVertex(p));
  const topCapIdx = topVerts.map((p) => addVertex(p));
  const bottomSideIdx = bottomVerts.map((p) => addVertex(p));
  const topSideIdx = topVerts.map((p) => addVertex(p));

  for (const tri of capIndices) {
    // Underside: CW when viewed from above → outward normal points down.
    indices.push(bottomCapIdx[tri[0]], bottomCapIdx[tri[2]], bottomCapIdx[tri[1]]);
    // Top: CCW when viewed from above → outward normal points up.
    indices.push(topCapIdx[tri[0]], topCapIdx[tri[1]], topCapIdx[tri[2]]);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const bi = bottomSideIdx[i];
    const bj = bottomSideIdx[j];
    const ti = topSideIdx[i];
    const tj = topSideIdx[j];
    indices.push(bi, bj, tj);
    indices.push(bi, tj, ti);
  }

  return {
    positions: new Float32Array(positions.flat()),
    indices: new Uint32Array(indices),
    maxRiseM,
    pitch,
    pitchDeg,
    thicknessM,
    tanPitch,
    upNormal,
  };
}

/**
 * @returns {THREE.BufferGeometry | null}
 */
export function buildSkillionRoofSlabGeometry(
  ring,
  wallTopY,
  swingDoor,
  pitchDeg = SKILLION_ROOF_PITCH_DEG,
  thicknessM = SKILLION_ROOF_SLAB_THICKNESS_M,
  pivotLineXZ = null
) {
  const data = buildSkillionRoofSlabMeshData(
    ring,
    wallTopY,
    swingDoor,
    pitchDeg,
    thicknessM,
    pivotLineXZ
  );
  if (!data) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Perimeter edges for the skillion slab: bottom ring, top ring, and corner posts.
 * Avoids internal triangulation lines from EdgesGeometry.
 *
 * @returns {THREE.BufferGeometry | null}
 */
export function buildSkillionRoofSlabOutlineGeometry(
  ring,
  wallTopY,
  swingDoor,
  pitchDeg = SKILLION_ROOF_PITCH_DEG,
  thicknessM = SKILLION_ROOF_SLAB_THICKNESS_M,
  pivotLineXZ = null
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3 || !Number.isFinite(wallTopY) || !(thicknessM > 0)) return null;

  const pitch = resolveSkillionPitch(clean, pivotLineXZ, swingDoor);
  if (!pitch) return null;

  const pitchRad = (pitchDeg * Math.PI) / 180;
  const tanPitch = Math.tan(pitchRad);
  const upNormal = roofUpNormal(pitch.highDir, pitchRad);
  const n = clean.length;

  const bottomVerts = clean.map((p) => ({
    x: p.x,
    y: wallTopY + Math.max(0, runAt(p, pitch)) * tanPitch,
    z: p.z,
  }));
  const topVerts = bottomVerts.map((b) => ({
    x: b.x + upNormal.x * thicknessM,
    y: b.y + upNormal.y * thicknessM,
    z: b.z + upNormal.z * thicknessM,
  }));

  const positions = new Float32Array(n * 3 * 6);
  let offset = 0;
  const pushSegment = (a, b) => {
    positions[offset] = a.x;
    positions[offset + 1] = a.y;
    positions[offset + 2] = a.z;
    positions[offset + 3] = b.x;
    positions[offset + 4] = b.y;
    positions[offset + 5] = b.z;
    offset += 6;
  };

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    pushSegment(bottomVerts[i], bottomVerts[j]);
    pushSegment(topVerts[i], topVerts[j]);
    pushSegment(bottomVerts[i], topVerts[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * One filled quad per visible roof-edge face (rise in metres above wall top).
 * Bottom and top edges are parallel at 5° with uniform perpendicular thickness.
 */
export function projectSkillionRoofElevation(
  ring,
  wallTopY,
  viewDir,
  swingDoor,
  pitchDeg = SKILLION_ROOF_PITCH_DEG,
  thicknessM = SKILLION_ROOF_SLAB_THICKNESS_M,
  pivotLineXZ = null
) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3) return null;

  const pitch = resolveSkillionPitch(clean, pivotLineXZ, swingDoor);
  if (!pitch) return null;

  const pitchRad = (pitchDeg * Math.PI) / 180;
  const tanPitch = Math.tan(pitchRad);
  const upNormal = roofUpNormal(pitch.highDir, pitchRad);
  const counterClockwise = ringSignedAreaXZ(clean) > 0;
  const screenAxis = { x: viewDir.z, z: -viewDir.x };
  const projectS = (x, z) => x * screenAxis.x + z * screenAxis.z;

  const bottomOf = (p) => ({
    x: p.x,
    y: Math.max(0, runAt(p, pitch)) * tanPitch,
    z: p.z,
  });
  const topOf = (p) => {
    const b = bottomOf(p);
    return {
      x: b.x + upNormal.x * thicknessM,
      y: b.y + upNormal.y * thicknessM,
      z: b.z + upNormal.z * thicknessM,
    };
  };

  const polygons = [];
  let minS = Infinity;
  let maxS = -Infinity;
  let maxRiseM = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = counterClockwise ? dz / len : -dz / len;
    const nz = counterClockwise ? -dx / len : dx / len;
    if (nx * viewDir.x + nz * viewDir.z <= 0.05) continue;

    const ba = bottomOf(a);
    const bb = bottomOf(b);
    const ta = topOf(a);
    const tb = topOf(b);

    // Order left→right along the elevation screen axis.
    const sBa = projectS(ba.x, ba.z);
    const sBb = projectS(bb.x, bb.z);
    const leftBottom = sBa <= sBb ? ba : bb;
    const rightBottom = sBa <= sBb ? bb : ba;
    const leftTop = sBa <= sBb ? ta : tb;
    const rightTop = sBa <= sBb ? tb : ta;

    const pts = [
      { s: projectS(leftBottom.x, leftBottom.z), y: leftBottom.y },
      { s: projectS(rightBottom.x, rightBottom.z), y: rightBottom.y },
      { s: projectS(rightTop.x, rightTop.z), y: rightTop.y },
      { s: projectS(leftTop.x, leftTop.z), y: leftTop.y },
    ];
    for (const p of pts) {
      minS = Math.min(minS, p.s);
      maxS = Math.max(maxS, p.s);
      maxRiseM = Math.max(maxRiseM, p.y);
    }
    polygons.push({ points: pts });
  }

  const peakRiseM = Math.max(0, pitch.runM) * tanPitch + upNormal.y * thicknessM;

  return {
    polygons,
    maxRiseM: Math.max(maxRiseM, peakRiseM),
    minS: Number.isFinite(minS) ? minS : 0,
    maxS: Number.isFinite(maxS) ? maxS : 0,
  };
}
