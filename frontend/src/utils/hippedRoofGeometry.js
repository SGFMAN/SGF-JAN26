import * as THREE from "three";
import { CORRUGATED_ROOF_PITCH_M } from "./corrugatedRoofTexture.js";
import { ROOF_PITCH_DEG, ROOF_STYLE_SUPERIOR_HIPPED } from "../constants/roofStyles.js";

/** Hip pitch (degrees). */
export const HIPPED_ROOF_PITCH_DEG = ROOF_PITCH_DEG[ROOF_STYLE_SUPERIOR_HIPPED];

/** Flat roof slab on cladding top (m) — full traced outline. */
export const ROOF_SLAB_THICKNESS_M = 0.15;

/**
 * Traced roof outline includes this gutter strip all around.
 * Hip planes use the outline inset by this amount.
 */
export const ROOF_GUTTER_INSET_M = 0.15;

/**
 * World Y of the hip eave plane: sits on top of the roof slab.
 * @param {number} wallTopYM
 */
export function hippedRoofEaveYM(wallTopYM) {
  return wallTopYM + ROOF_SLAB_THICKNESS_M;
}

/**
 * Inset the traced roof ring for gutter so hip planes sit inside the slab.
 * @param {{ x: number, z: number }[]} ring
 * @param {number} [insetM=ROOF_GUTTER_INSET_M]
 * @returns {{ x: number, z: number }[] | null}
 */
export function insetRoofRingForGutter(ring, insetM = ROOF_GUTTER_INSET_M) {
  const clean = sanitizeRing(ring);
  if (clean.length < 3 || !(insetM > 0)) return clean.length >= 3 ? ensureCcw(clean) : null;
  const ccw = ensureCcw(clean);
  const inset = offsetPolygonInward(ccw, insetM);
  if (!inset || inset.length < 3) return null;
  return ensureCcw(inset);
}

/**
 * @param {{ x: number, z: number }[] | null | undefined} ring
 * @returns {{ x: number, z: number }[]}
 */
function sanitizeRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  const cleaned = ring
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z))
    .map((p) => ({ x: p.x, z: p.z }));
  if (cleaned.length < 3) return [];
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-9) cleaned.pop();
  return cleaned.length >= 3 ? cleaned : [];
}

/**
 * @param {{ x: number, z: number }[]} ring
 * @returns {{ x: number, z: number }[]}
 */
function ensureCcw(ring) {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    area += a.x * b.z - b.x * a.z;
  }
  return area >= 0
    ? ring.map((p) => ({ x: p.x, z: p.z }))
    : ring.map((p) => ({ x: p.x, z: p.z })).reverse();
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) * 0.5;
}

/**
 * Parallel offset. Positive = outward for CCW rings.
 * @param {{ x: number, z: number }[]} ring
 * @param {number} offsetM
 * @returns {{ x: number, z: number }[] | null}
 */
function offsetPolygonXZ(ring, offsetM) {
  const n = ring.length;
  if (n < 3 || !Number.isFinite(offsetM) || offsetM === 0) return null;
  let signedArea = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    signedArea += ring[i].x * ring[j].z - ring[j].x * ring[i].z;
  }
  const ccw = signedArea > 0;
  const result = [];
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
    const n1x = ccw ? d1z / len1 : -d1z / len1;
    const n1z = ccw ? -d1x / len1 : d1x / len1;
    const n2x = ccw ? d2z / len2 : -d2z / len2;
    const n2z = ccw ? -d2x / len2 : d2x / len2;
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
    const cos = Math.max(-1, Math.min(1, bx * n1x + bz * n1z));
    const miter = Math.abs(cos) > 1e-6 ? 1 / cos : 1;
    const scale = offsetM * Math.min(Math.abs(miter), 4) * Math.sign(miter || 1);
    // For outward offset with CCW, normals above are outward (right of edge).
    // Wait: CCW edge dir (d1), outward is (d1z, -d1x) = right of edge in XZ from above?
    // Left of edge = (-d1z, d1x). For CCW interior is left, so inward = (-d1z, d1x).
    // The formula used n1 = (d1z, -d1x) for ccw which is RIGHT = outward.
    result.push({ x: curr.x + bx * scale, z: curr.z + bz * scale });
  }
  return result;
}

/**
 * @param {{ x: number, z: number }[]} ring
 * @param {number} distanceM
 * @returns {{ x: number, z: number }[] | null}
 */
function offsetPolygonInward(ring, distanceM) {
  if (!ring?.length || !(distanceM > 0)) return null;
  const outerArea = ringArea(ring);
  if (outerArea < 1e-6) return null;
  const neg = offsetPolygonXZ(ring, -distanceM);
  const pos = offsetPolygonXZ(ring, distanceM);
  const areaNeg = neg ? ringArea(neg) : Infinity;
  const areaPos = pos ? ringArea(pos) : Infinity;
  let inner = null;
  if (areaNeg < outerArea && areaNeg <= areaPos) inner = neg;
  else if (areaPos < outerArea) inner = pos;
  if (!inner || ringArea(inner) < 1e-6) return null;
  if (ringArea(inner) >= outerArea * 0.98) return null;
  return inner;
}

/**
 * Inward unit normal for CCW edge a→b in XZ.
 */
function inwardNormalCCW(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len, z: dx / len };
}

/** @returns {{ nx: number, ny: number, nz: number, px: number, py: number, pz: number }} */
function roofPlaneFromEdge(a, b, inward, eaveYM, tanPitch) {
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const hx = inward.x;
  const hy = tanPitch;
  const hz = inward.z;
  const nx = -ez * hy;
  const ny = ez * hx - ex * hz;
  const nz = ex * hy;
  const len = Math.hypot(nx, ny, nz) || 1;
  return {
    nx: nx / len,
    ny: ny / len,
    nz: nz / len,
    px: a.x,
    py: eaveYM,
    pz: a.z,
  };
}

function planeDot(plane, x, y, z) {
  return plane.nx * (x - plane.px) + plane.ny * (y - plane.py) + plane.nz * (z - plane.pz);
}

/**
 * @returns {{ px: number, py: number, pz: number, dx: number, dy: number, dz: number } | null}
 */
function intersectPlanes(p1, p2) {
  const dx = p1.ny * p2.nz - p1.nz * p2.ny;
  const dy = p1.nz * p2.nx - p1.nx * p2.nz;
  const dz = p1.nx * p2.ny - p1.ny * p2.nx;
  const dirLen = Math.hypot(dx, dy, dz);
  if (dirLen < 1e-9) return null;

  const c1 = p1.nx * p1.px + p1.ny * p1.py + p1.nz * p1.pz;
  const c2 = p2.nx * p2.px + p2.ny * p2.py + p2.nz * p2.pz;

  let px;
  let py;
  let pz;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const az = Math.abs(dz);

  if (az >= ax && az >= ay) {
    const det = p1.nx * p2.ny - p2.nx * p1.ny;
    if (Math.abs(det) < 1e-9) return null;
    px = (c1 * p2.ny - c2 * p1.ny) / det;
    py = (p1.nx * c2 - p2.nx * c1) / det;
    pz = 0;
  } else if (ay >= ax) {
    const det = p1.nx * p2.nz - p2.nx * p1.nz;
    if (Math.abs(det) < 1e-9) return null;
    px = (c1 * p2.nz - c2 * p1.nz) / det;
    pz = (p1.nx * c2 - p2.nx * c1) / det;
    py = 0;
  } else {
    const det = p1.ny * p2.nz - p2.ny * p1.nz;
    if (Math.abs(det) < 1e-9) return null;
    py = (c1 * p2.nz - c2 * p1.nz) / det;
    pz = (p1.ny * c2 - p2.ny * c1) / det;
    px = 0;
  }

  return { px, py, pz, dx: dx / dirLen, dy: dy / dirLen, dz: dz / dirLen };
}

/**
 * @returns {{ t: number, point: { x: number, y: number, z: number } } | null}
 */
function intersectLineWithLine(p1, d1, p2, d2) {
  const w0x = p1.x - p2.x;
  const w0y = p1.y - p2.y;
  const w0z = p1.z - p2.z;
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z;
  const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
  const c = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z;
  const d = d1.x * w0x + d1.y * w0y + d1.z * w0z;
  const e = d2.x * w0x + d2.y * w0y + d2.z * w0z;
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-12) return null;

  const t = (b * e - c * d) / denom;
  const s = (a * e - b * d) / denom;
  const qx = p2.x + s * d2.x;
  const qy = p2.y + s * d2.y;
  const qz = p2.z + s * d2.z;
  const px = p1.x + t * d1.x;
  const py = p1.y + t * d1.y;
  const pz = p1.z + t * d1.z;
  if (Math.hypot(px - qx, py - qy, pz - qz) > 0.05) return null;

  return {
    t,
    point: { x: px, y: py, z: pz },
  };
}

function polygonCentroidXZ(ring) {
  let cx = 0;
  let cz = 0;
  for (const p of ring) {
    cx += p.x;
    cz += p.z;
  }
  return { x: cx / ring.length, z: cz / ring.length };
}

function edgesAreAdjacent(a, b, n) {
  if (a === b) return true;
  if (Math.abs(a - b) === 1) return true;
  return (a === 0 && b === n - 1) || (b === 0 && a === n - 1);
}

/**
 * One plane per eave edge at pitchDeg, extended inward until hips meet ridges.
 *
 * @param {{ x: number, z: number }[]} ringCcw
 * @param {number} eaveYM
 * @param {number} pitchDeg
 */
function buildPerEdgeRoofPlanes(ringCcw, eaveYM, pitchDeg) {
  const n = ringCcw.length;
  if (n < 3) return null;

  const pitchRad = (pitchDeg * Math.PI) / 180;
  const tanPitch = Math.tan(pitchRad);
  if (!(tanPitch > 0)) return null;

  /** @type {ReturnType<typeof roofPlaneFromEdge>[]} */
  const planes = [];
  for (let ei = 0; ei < n; ei += 1) {
    const a = ringCcw[ei];
    const b = ringCcw[(ei + 1) % n];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) return null;
    planes.push(roofPlaneFromEdge(a, b, inwardNormalCCW(a, b), eaveYM, tanPitch));
  }

  const centroid = polygonCentroidXZ(ringCcw);
  /** @type {{ x: number, y: number, z: number }[]} */
  const ridgePoints = [];

  for (let vi = 0; vi < n; vi += 1) {
    const v = ringCcw[vi];
    const leftPlane = planes[(vi - 1 + n) % n];
    const rightPlane = planes[vi];
    const hipLine = intersectPlanes(leftPlane, rightPlane);
    if (!hipLine) {
      ridgePoints.push({ x: v.x, y: eaveYM, z: v.z });
      continue;
    }

    let dir = { x: hipLine.dx, y: hipLine.dy, z: hipLine.dz };
    const toInX = centroid.x - v.x;
    const toInZ = centroid.z - v.z;
    if (dir.x * toInX + dir.z * toInZ < 0) {
      dir = { x: -dir.x, y: -dir.y, z: -dir.z };
    }
    if (dir.y < 0) {
      dir = { x: -dir.x, y: -dir.y, z: -dir.z };
    }

    const hipOrigin = { x: v.x, y: eaveYM, z: v.z };
    let bestT = Infinity;
    /** @type {{ x: number, y: number, z: number } | null} */
    let bestPoint = null;

    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        if (edgesAreAdjacent(a, b, n)) continue;
        const ridgeLine = intersectPlanes(planes[a], planes[b]);
        if (!ridgeLine) continue;

        const hit = intersectLineWithLine(
          hipOrigin,
          dir,
          { x: ridgeLine.px, y: ridgeLine.py, z: ridgeLine.pz },
          { x: ridgeLine.dx, y: ridgeLine.dy, z: ridgeLine.dz }
        );
        if (!hit || hit.t < 1e-6 || hit.t >= bestT) continue;
        if (hit.point.y <= eaveYM + 1e-6) continue;
        bestT = hit.t;
        bestPoint = hit.point;
      }
    }

    ridgePoints.push(
      bestPoint ?? {
        x: v.x + dir.x * 0.01,
        y: eaveYM + dir.y * 0.01,
        z: v.z + dir.z * 0.01,
      }
    );
  }

  /** @type {{ x: number, y: number, z: number }[]} */
  const vertices = [];
  /** @type {number[][]} */
  const faces = [];
  let maxRiseM = 0;

  for (let ei = 0; ei < n; ei += 1) {
    const a = ringCcw[ei];
    const b = ringCcw[(ei + 1) % n];
    const aTop = ridgePoints[ei];
    const bTop = ridgePoints[(ei + 1) % n];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;

    maxRiseM = Math.max(maxRiseM, aTop.y - eaveYM, bTop.y - eaveYM);

    const idxA = vertices.length;
    vertices.push({ x: a.x, y: eaveYM, z: a.z });
    const idxB = vertices.length;
    vertices.push({ x: b.x, y: eaveYM, z: b.z });
    const idxBTop = vertices.length;
    vertices.push(bTop);
    const idxATop = vertices.length;
    vertices.push(aTop);

    faces.push([idxA, idxB, idxBTop, idxATop]);
  }

  if (!faces.length) return null;
  return { vertices, faces, maxRiseM };
}

/**
 * @param {{ x: number, y: number, z: number }[]} vertices
 * @param {number[][]} faces
 * @returns {{
 *   positions: Float32Array,
 *   uvs: Float32Array,
 *   indices: Uint32Array,
 *   triangles: { ax:number,ay:number,az:number, bx:number,by:number,bz:number, cx:number,cy:number,cz:number }[],
 * }}
 */
function meshFromFaces(vertices, faces) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const triangles = [];

  function pushTri(ia, ib, ic) {
    const a = vertices[ia];
    const b = vertices[ib];
    const c = vertices[ic];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const acz = c.z - a.z;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (Math.hypot(nx, ny, nz) < 1e-12) return;

    let a2 = a;
    let b2 = b;
    let c2 = c;
    if (ny < 0) {
      b2 = c;
      c2 = b;
    }

    const ux = b2.x - a2.x;
    const uz = b2.z - a2.z;
    const ulen = Math.hypot(ux, uz) || 1;
    const uDir = { x: ux / ulen, z: uz / ulen };
    const vDir = { x: -uDir.z, z: uDir.x };

    const base = positions.length / 3;
    for (const p of [a2, b2, c2]) {
      positions.push(p.x, p.y, p.z);
      const u = ((p.x - a2.x) * uDir.x + (p.z - a2.z) * uDir.z) / CORRUGATED_ROOF_PITCH_M;
      const v = ((p.x - a2.x) * vDir.x + (p.z - a2.z) * vDir.z) / CORRUGATED_ROOF_PITCH_M;
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2);
    triangles.push({
      ax: a2.x,
      ay: a2.y,
      az: a2.z,
      bx: b2.x,
      by: b2.y,
      bz: b2.z,
      cx: c2.x,
      cy: c2.y,
      cz: c2.z,
    });
  }

  for (const face of faces) {
    if (face.length === 3) {
      pushTri(face[0], face[1], face[2]);
    } else if (face.length === 4) {
      pushTri(face[0], face[1], face[2]);
      pushTri(face[0], face[2], face[3]);
    } else if (face.length > 4) {
      for (let i = 1; i < face.length - 1; i += 1) {
        pushTri(face[0], face[i], face[i + 1]);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    triangles,
  };
}

/**
 * Build hip roof mesh data from an XZ eave ring at 15° (default).
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {number} eaveYM
 * @param {number} [pitchDeg=15]
 * @returns {{
 *   positions: Float32Array,
 *   uvs: Float32Array,
 *   indices: Uint32Array,
 *   maxRiseM: number,
 *   triangles: { ax:number,ay:number,az:number, bx:number,by:number,bz:number, cx:number,cy:number,cz:number }[],
 * } | null}
 */
export function buildHippedRoofMeshData(ring, eaveYM, pitchDeg = HIPPED_ROOF_PITCH_DEG) {
  const clean = sanitizeRing(ring);
  if (clean.length < 3 || !Number.isFinite(eaveYM)) return null;
  if (!(pitchDeg > 0 && pitchDeg < 90)) return null;

  const ccw = ensureCcw(clean);
  const built = buildPerEdgeRoofPlanes(ccw, eaveYM, pitchDeg);
  if (!built) return null;

  const mesh = meshFromFaces(built.vertices, built.faces);
  if (mesh.indices.length < 3) return null;

  return {
    ...mesh,
    maxRiseM: built.maxRiseM,
  };
}

/**
 * @param {{ x: number, z: number }[]} ring
 * @param {number} eaveYM
 * @param {number} [pitchDeg]
 * @returns {THREE.BufferGeometry | null}
 */
export function buildHippedRoofGeometry(ring, eaveYM, pitchDeg = HIPPED_ROOF_PITCH_DEG) {
  const data = buildHippedRoofMeshData(ring, eaveYM, pitchDeg);
  if (!data) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param {{ x: number, z: number }[]} ring
 * @param {number} eaveYM
 * @param {number} [pitchDeg]
 * @returns {THREE.BufferGeometry | null}
 */
export function buildHippedRoofOutlineGeometry(ring, eaveYM, pitchDeg = HIPPED_ROOF_PITCH_DEG) {
  const data = buildHippedRoofMeshData(ring, eaveYM, pitchDeg);
  if (!data) return null;
  const edgeKeys = new Set();
  const segs = [];
  const addEdge = (ax, ay, az, bx, by, bz) => {
    const ka = `${ax.toFixed(4)},${ay.toFixed(4)},${az.toFixed(4)}`;
    const kb = `${bx.toFixed(4)},${by.toFixed(4)},${bz.toFixed(4)}`;
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    segs.push(ax, ay, az, bx, by, bz);
  };
  for (const t of data.triangles) {
    addEdge(t.ax, t.ay, t.az, t.bx, t.by, t.bz);
    addEdge(t.bx, t.by, t.bz, t.cx, t.cy, t.cz);
    addEdge(t.cx, t.cy, t.cz, t.ax, t.ay, t.az);
  }
  if (!segs.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(segs), 3));
  return geometry;
}

/**
 * Project hipped roof triangles into an elevation (s along façade, y above eave).
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {number} eaveYM
 * @param {{ x: number, z: number }} viewDir
 * @param {number} [pitchDeg]
 * @returns {{
 *   polygons: { points: { s: number, y: number }[] }[],
 *   maxRiseM: number,
 *   minS: number,
 *   maxS: number,
 * } | null}
 */
export function projectHippedRoofElevation(
  ring,
  eaveYM,
  viewDir,
  pitchDeg = HIPPED_ROOF_PITCH_DEG
) {
  const data = buildHippedRoofMeshData(ring, eaveYM, pitchDeg);
  if (!data) return null;

  const screenAxis = { x: viewDir.z, z: -viewDir.x };
  const projectS = (x, z) => x * screenAxis.x + z * screenAxis.z;

  const polygons = [];
  let minS = Infinity;
  let maxS = -Infinity;
  let maxRiseM = 0;

  for (const t of data.triangles) {
    const abx = t.bx - t.ax;
    const aby = t.by - t.ay;
    const abz = t.bz - t.az;
    const acx = t.cx - t.ax;
    const acy = t.cy - t.ay;
    const acz = t.cz - t.az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const faceDot = (nx / nLen) * viewDir.x + (nz / nLen) * viewDir.z;
    // Keep faces toward the camera; always keep near-horizontal ridge caps.
    if (faceDot < -0.02 && Math.abs(ny / nLen) < 0.9) continue;

    const pts = [
      { s: projectS(t.ax, t.az), y: t.ay - eaveYM },
      { s: projectS(t.bx, t.bz), y: t.by - eaveYM },
      { s: projectS(t.cx, t.cz), y: t.cy - eaveYM },
    ];
    for (const p of pts) {
      minS = Math.min(minS, p.s);
      maxS = Math.max(maxS, p.s);
      maxRiseM = Math.max(maxRiseM, p.y);
    }
    const area2 = Math.abs(
      (pts[1].s - pts[0].s) * (pts[2].y - pts[0].y) -
        (pts[2].s - pts[0].s) * (pts[1].y - pts[0].y)
    );
    if (area2 < 1e-8) continue;
    polygons.push({ points: pts });
  }

  return {
    polygons,
    maxRiseM: Math.max(maxRiseM, data.maxRiseM),
    minS: Number.isFinite(minS) ? minS : 0,
    maxS: Number.isFinite(maxS) ? maxS : 0,
  };
}
