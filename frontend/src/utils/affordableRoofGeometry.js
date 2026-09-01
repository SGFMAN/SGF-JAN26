import * as THREE from "three";
import { CORRUGATED_ROOF_PITCH_M } from "./corrugatedRoofTexture.js";
import {
  parsePlanTraceRoofRidgeAxis,
  ROOF_RIDGE_VERTICAL,
} from "./planTracePolygon.js";

export const AFFORDABLE_ROOF_PITCH_DEG = 3;

/** Flat roof slab on cladding top (m) — affordable dual-fall only. */
export const AFFORDABLE_ROOF_SLAB_THICKNESS_M = 0.1;

/** B1: 70 mm across the fall, 45 mm tall. */
export const AFFORDABLE_EAVE_BATTEN_WIDTH_M = 0.07;
export const AFFORDABLE_EAVE_BATTEN_THICK_M = 0.045;

const W70 = 0.07;
const T45 = 0.045;
const W45 = 0.045;
const T70 = 0.07;
const T190 = 0.19;

/** B1 … B5 from each eave; no member is required on the ridge. */
export const AFFORDABLE_BATTEN_TYPES = Object.freeze(["B1", "B2", "B3", "B4", "B5"]);

/** Top bearing height of each assembly (m). */
export const AFFORDABLE_BATTEN_HEIGHT_M = Object.freeze({
  B1: T45,
  B2: T70,
  B3: T45 + T70,
  B4: T45 + T70 + T45,
  B5: T190,
});

/**
 * Cross-section parts. `across` is relative to the top bearing centre:
 * negative = toward the eave, positive = toward the ridge.
 * `y` is the box centre above the roof slab.
 *
 * @returns {{ across: number, y: number, w: number, h: number }[]}
 */
export function affordableBattenParts(type) {
  switch (type) {
    case "B1":
      return [{ across: 0, y: T45 / 2, w: W70, h: T45 }];
    case "B2":
      return [{ across: 0, y: T70 / 2, w: W45, h: T70 }];
    case "B3":
      // Vertical 45×70 on the eave side of a 70×45 plate.
      return [
        { across: 0, y: T45 + T70 / 2, w: W45, h: T70 },
        { across: W70 / 2 - W45 / 2, y: T45 / 2, w: W70, h: T45 },
      ];
    case "B4":
      return [
        { across: 0, y: T45 + T70 + T45 / 2, w: W70, h: T45 },
        { across: 0, y: T45 + T70 / 2, w: W45, h: T70 },
        { across: 0, y: T45 / 2, w: W70, h: T45 },
      ];
    case "B5":
      // Tall 45×190 on the eave side; 70×45 plate on the ridge side at the base.
      return [
        { across: 0, y: T190 / 2, w: W45, h: T190 },
        { across: W45 / 2 + W70 / 2, y: T45 / 2, w: W70, h: T45 },
      ];
    default:
      return [];
  }
}

/**
 * @param {number} pitchDeg
 * @returns {number[]} cumulative run from B1 bearing to each type (m)
 */
export function affordableBattenCumRuns(pitchDeg = AFFORDABLE_ROOF_PITCH_DEG) {
  const tanP = Math.tan((Number(pitchDeg) * Math.PI) / 180);
  const types = AFFORDABLE_BATTEN_TYPES;
  const cum = [0];
  for (let i = 1; i < types.length; i += 1) {
    const rise =
      AFFORDABLE_BATTEN_HEIGHT_M[types[i]] - AFFORDABLE_BATTEN_HEIGHT_M[types[i - 1]];
    cum[i] = cum[i - 1] + rise / tanP;
  }
  return cum;
}

/**
 * Largest type index whose 3° station still sits before the ridge (not on it).
 * @param {number} halfSpanM eave-to-ridge distance (m)
 */
export function affordableBattenLastIndex(
  halfSpanM,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const tanP = Math.tan((Number(pitchDeg) * Math.PI) / 180);
  const b1H = AFFORDABLE_BATTEN_HEIGHT_M.B1;
  const types = AFFORDABLE_BATTEN_TYPES;
  let last = 0;
  for (let i = 1; i < types.length; i += 1) {
    const run = battenRunFromEave(types[i], tanP, b1H);
    if (run < Number(halfSpanM) - 0.02) last = i;
  }
  return last;
}

function topHalfM(type) {
  return type === "B1" || type === "B4" ? W70 / 2 : W45 / 2;
}

/** Distance from eave to the member centre so the eave-side top sits on a 3° sheet. */
function battenRunFromEave(type, tanP, b1H) {
  if (type === "B1") return W70 / 2;
  const h = AFFORDABLE_BATTEN_HEIGHT_M[type];
  return (h - b1H) / tanP + topHalfM(type);
}

/** @param {number} availableM distance from B1 bearing centre to ridge */
export function affordableBattenPeakIndex(
  availableM,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  return affordableBattenLastIndex(Number(availableM) + W70 / 2, pitchDeg);
}

/**
 * @param {{ x: number, z: number }[] | null | undefined} ring
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number } | null}
 */
export function roofRingAabbXZ(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of ring) {
    const x = Number(p?.x);
    const z = Number(p?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX) || maxX - minX < 0.05 || maxZ - minZ < 0.05) return null;
  return { minX, maxX, minZ, maxZ };
}

function sanitizeRoofRing(ring) {
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

function pointInRoofRing(x, z, ring) {
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

/**
 * Axis-aligned spans of a roof member that sit inside the traced outline.
 * @returns {{ start: number, end: number }[]}
 */
export function clipRoofAxisSpansToRing(alongX, cross, minRun, maxRun, ring) {
  const lo = Number(minRun);
  const hi = Number(maxRun);
  const clean = sanitizeRoofRing(ring);
  if (!(hi > lo) || clean.length < 3) {
    return hi > lo ? [{ start: lo, end: hi }] : [];
  }
  const hits = [lo, hi];
  for (let i = 0, j = clean.length - 1; i < clean.length; j = i, i += 1) {
    const a = clean[j];
    const b = clean[i];
    const aC = alongX ? a.z : a.x;
    const bC = alongX ? b.z : b.x;
    const aR = alongX ? a.x : a.z;
    const bR = alongX ? b.x : b.z;
    if (aC > cross === bC > cross) continue;
    const run = aR + ((cross - aC) / (bC - aC || 1e-12)) * (bR - aR);
    if (run > lo + 1e-6 && run < hi - 1e-6) hits.push(run);
  }
  hits.sort((a, b) => a - b);
  const uniq = [];
  for (const h of hits) {
    if (!uniq.length || h - uniq[uniq.length - 1] > 0.001) uniq.push(h);
  }
  const spans = [];
  for (let i = 0; i < uniq.length - 1; i += 1) {
    const start = uniq[i];
    const end = uniq[i + 1];
    if (end - start < 0.05) continue;
    const mid = (start + end) / 2;
    const x = alongX ? mid : cross;
    const z = alongX ? cross : mid;
    if (!pointInRoofRing(x, z, clean)) continue;
    const last = spans[spans.length - 1];
    if (last && Math.abs(start - last.end) < 0.002) last.end = end;
    else spans.push({ start, end });
  }
  return spans;
}

function clipRingToCrossHalf(ring, alongX, ridge, keepMin) {
  if (!ring.length) return [];
  const inside = (p) => {
    const c = alongX ? p.z : p.x;
    return keepMin ? c <= ridge + 1e-7 : c >= ridge - 1e-7;
  };
  const hit = (a, b) => {
    const ac = alongX ? a.z : a.x;
    const bc = alongX ? b.z : b.x;
    const t = (ridge - ac) / (bc - ac || 1e-12);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  };
  const output = [];
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const previous = ring[(i - 1 + ring.length) % ring.length];
    const currInside = inside(current);
    const prevInside = inside(previous);
    if (currInside) {
      if (!prevInside) output.push(hit(previous, current));
      output.push({ x: current.x, z: current.z });
    } else if (prevInside) {
      output.push(hit(previous, current));
    }
  }
  const deduped = [];
  for (const p of output) {
    const last = deduped[deduped.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 0.001) continue;
    deduped.push(p);
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
  return deduped;
}

function heightAtSheetCross(cross, profile) {
  const pts = profile.points;
  if (!pts?.length) return 0;
  if (cross <= pts[0].cross) return pts[0].height;
  const last = pts[pts.length - 1];
  if (cross >= last.cross) return last.height;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (cross >= a.cross - 1e-9 && cross <= b.cross + 1e-9) {
      const t = (cross - a.cross) / (b.cross - a.cross || 1);
      return a.height + t * (b.height - a.height);
    }
  }
  return pts[0].height;
}

/**
 * Stations from each eave at 3°: B1 … Bk | ridge | Bk … B1.
 * There is no timber on the ridge unless a 3° station happens to land there.
 *
 * `alongX` true → timbers run along X (horizontal ridge). `mirror` flips L-shapes
 * so the eave side of B3/B5 stays toward the low edge.
 *
 * @returns {{
 *   type: string,
 *   alongX: boolean,
 *   cross: number,
 *   minRun: number,
 *   maxRun: number,
 *   mirror: boolean,
 * }[]}
 */
export function affordableBattenStations(
  ring,
  ridgeAxis,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const aabb = roofRingAabbXZ(ring);
  if (!aabb) return [];
  const axis = parsePlanTraceRoofRidgeAxis(ridgeAxis) || ROOF_RIDGE_VERTICAL;
  const alongX = axis !== ROOF_RIDGE_VERTICAL;
  const eave0 = alongX ? aabb.minZ : aabb.minX;
  const eave1 = alongX ? aabb.maxZ : aabb.maxX;
  const ridge = (eave0 + eave1) / 2;
  const minRun = alongX ? aabb.minX : aabb.minZ;
  const maxRun = alongX ? aabb.maxX : aabb.maxZ;
  const tanP = Math.tan((Number(pitchDeg) * Math.PI) / 180);
  const b1H = AFFORDABLE_BATTEN_HEIGHT_M.B1;
  const types = AFFORDABLE_BATTEN_TYPES;
  const stations = [];
  for (let k = 0; k < types.length; k += 1) {
    const run = battenRunFromEave(types[k], tanP, b1H);
    if (eave0 + run >= ridge - 0.02) break;
    stations.push({
      type: types[k],
      alongX,
      cross: eave0 + run,
      minRun,
      maxRun,
      mirror: false,
    });
    stations.push({
      type: types[k],
      alongX,
      cross: eave1 - run,
      minRun,
      maxRun,
      mirror: true,
    });
  }
  if (!stations.length) {
    const b1 = battenRunFromEave("B1", tanP, b1H);
    stations.push(
      { type: "B1", alongX, cross: eave0 + b1, minRun, maxRun, mirror: false },
      { type: "B1", alongX, cross: eave1 - b1, minRun, maxRun, mirror: true }
    );
  }
  return stations;
}

/** Visual sheet thickness (Colorbond is thinner; this reads in 3D). */
export const AFFORDABLE_SHEET_THICKNESS_M = 0.008;

/** Square ColorBond gutter on each eave (m). */
export const AFFORDABLE_GUTTER_SIZE_M = 0.1;

/** Drop plate under a cutaway gutter, down to the slab soffit (m). */
export const AFFORDABLE_CUTAWAY_PANEL_THICK_M = 0.005;

/** Gable end panel / barge thickness (m). */
export const AFFORDABLE_GABLE_BARGE_THICKNESS_M = 0.025;

const SHEET_LIFT_M = 0.0006;
const GABLE_BARGE_INSET_M = 0.002;

/**
 * Dual-fall 3° sheet: eave → ridge → eave. Ridge height is span × tan(3°),
 * not a batten on the ridge.
 *
 * @returns {{ alongX: boolean, points: { cross: number, height: number }[], peakHeight: number } | null}
 */
export function affordableSheetProfile(
  ring,
  ridgeAxis,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const aabb = roofRingAabbXZ(ring);
  if (!aabb) return null;
  const axis = parsePlanTraceRoofRidgeAxis(ridgeAxis) || ROOF_RIDGE_VERTICAL;
  const alongX = axis !== ROOF_RIDGE_VERTICAL;
  const eave0 = alongX ? aabb.minZ : aabb.minX;
  const eave1 = alongX ? aabb.maxZ : aabb.maxX;
  const ridge = (eave0 + eave1) / 2;
  const tanP = Math.tan((Number(pitchDeg) * Math.PI) / 180);
  const b1H = AFFORDABLE_BATTEN_HEIGHT_M.B1;
  const ridgeH = b1H + ((eave1 - eave0) / 2) * tanP;
  return {
    alongX,
    points: [
      { cross: eave0, height: b1H },
      { cross: ridge, height: ridgeH },
      { cross: eave1, height: b1H },
    ],
    peakHeight: ridgeH,
  };
}

function stripNormal(alongX, c0, h0, c1, h1) {
  const span = c1 - c0;
  const dH = h1 - h0;
  const len = Math.hypot(span, dH) || 1;
  const nFall = -dH / len;
  const nY = span / len;
  const sign = nY >= 0 ? 1 : -1;
  if (alongX) return { x: 0, y: sign * nY, z: sign * nFall };
  return { x: sign * nFall, y: sign * nY, z: 0 };
}

function sheetUv(p, alongX) {
  const run = alongX ? p.x : p.z;
  const fall = alongX ? p.z : p.x;
  return [run / CORRUGATED_ROOF_PITCH_M, fall / CORRUGATED_ROOF_PITCH_M];
}

/**
 * Thin dual-fall sheet on the traced outline. Ridge is centred on the AABB
 * width; the sheet is cut away to the defined polygon.
 *
 * @returns {{
 *   positions: Float32Array,
 *   uvs: Float32Array,
 *   indices: Uint32Array,
 *   maxRiseM: number,
 *   outline: Float32Array,
 * } | null}
 */
export function buildAffordableRoofSheetMeshData(
  ring,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const aabb = roofRingAabbXZ(ring);
  const profile = affordableSheetProfile(ring, ridgeAxis, pitchDeg);
  const clean = sanitizeRoofRing(ring);
  if (!aabb || !profile || clean.length < 3) return null;
  const { alongX, points } = profile;
  const thick = AFFORDABLE_SHEET_THICKNESS_M;
  const baseY = Number(slabTopY);
  if (!Number.isFinite(baseY)) return null;
  const minRun = alongX ? aabb.minX : aabb.minZ;
  const maxRun = alongX ? aabb.maxX : aabb.maxZ;
  if (!(maxRun - minRun > 0.05)) return null;

  const eave0 = points[0];
  const eave1 = points[points.length - 1];
  const peak = points.reduce((best, p) => (p.height > best.height ? p : best), points[0]);
  const heightFn = (cross) => heightAtSheetCross(cross, profile);

  const positions = [];
  const uvs = [];
  const indices = [];
  let maxRiseM = 0;

  const pushVert = (p) => {
    const idx = positions.length / 3;
    positions.push(p.x, p.y, p.z);
    uvs.push(...sheetUv(p, alongX));
    maxRiseM = Math.max(maxRiseM, p.y - baseY);
    return idx;
  };

  const offset = (p, n) => ({
    x: p.x + n.x * thick,
    y: p.y + n.y * thick,
    z: p.z + n.z * thick,
  });

  const appendFold = (poly, a, b) => {
    if (!poly || poly.length < 3 || b.cross - a.cross < 0.002) return;
    const n = stripNormal(alongX, a.cross, a.height, b.cross, b.height);
    const contour = poly.map((p) => new THREE.Vector2(p.x, p.z));
    let area = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const p0 = poly[i];
      const p1 = poly[(i + 1) % poly.length];
      area += p0.x * p1.z - p1.x * p0.z;
    }
    const verts = poly.map((p) => ({ x: p.x, z: p.z }));
    if (area < 0) {
      contour.reverse();
      verts.reverse();
    }
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    if (!tris?.length) return;
    const bottoms = verts.map((p) => {
      const cross = alongX ? p.z : p.x;
      return { x: p.x, y: baseY + heightFn(cross) + SHEET_LIFT_M, z: p.z };
    });
    const tops = bottoms.map((p) => offset(p, n));
    const bi = bottoms.map((p) => pushVert(p));
    const ti = tops.map((p) => pushVert(p));
    const si = bottoms.map((p) => pushVert(p));
    const so = tops.map((p) => pushVert(p));
    tris.forEach((tri) => {
      indices.push(ti[tri[0]], ti[tri[1]], ti[tri[2]]);
      indices.push(bi[tri[0]], bi[tri[2]], bi[tri[1]]);
    });
    const count = verts.length;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      indices.push(si[i], si[j], so[j], si[i], so[j], so[i]);
    }
  };

  const splitAtRidge =
    peak.cross > eave0.cross + 0.01 && peak.cross < eave1.cross - 0.01;
  if (splitAtRidge) {
    appendFold(clipRingToCrossHalf(clean, alongX, peak.cross, true), eave0, peak);
    appendFold(clipRingToCrossHalf(clean, alongX, peak.cross, false), peak, eave1);
  } else {
    appendFold(clean, eave0, eave1);
  }

  if (indices.length < 3) return null;

  const outline = [];
  const yTop = (p) =>
    baseY + heightFn(alongX ? p.z : p.x) + SHEET_LIFT_M + thick;
  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const ya = yTop(a);
    const yb = yTop(b);
    outline.push(a.x, ya, a.z, b.x, yb, b.z);
  }
  const ridgeSpans = clipRoofAxisSpansToRing(
    alongX,
    peak.cross,
    minRun,
    maxRun,
    clean
  );
  const yPeak = baseY + peak.height + SHEET_LIFT_M + thick;
  ridgeSpans.forEach((span) => {
    const p0 = pointOnRun(alongX, span.start, peak.cross, yPeak);
    const p1 = pointOnRun(alongX, span.end, peak.cross, yPeak);
    outline.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  });

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    maxRiseM,
    outline: new Float32Array(outline),
  };
}

/**
 * @returns {THREE.BufferGeometry | null}
 */
export function buildAffordableRoofSheetGeometry(
  ring,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const data = buildAffordableRoofSheetMeshData(ring, ridgeAxis, slabTopY, pitchDeg);
  if (!data) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @returns {THREE.BufferGeometry | null}
 */
export function buildAffordableRoofSheetOutlineGeometry(
  ring,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const data = buildAffordableRoofSheetMeshData(ring, ridgeAxis, slabTopY, pitchDeg);
  if (!data?.outline?.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.outline, 3));
  return geometry;
}

function roofRunExtent(aabb, alongX) {
  return alongX
    ? { minRun: aabb.minX, maxRun: aabb.maxX }
    : { minRun: aabb.minZ, maxRun: aabb.maxZ };
}

function pointOnRun(alongX, run, cross, y) {
  return alongX ? { x: run, y, z: cross } : { x: cross, y, z: run };
}

/**
 * Inset edges of the cutaway roof sheet — not the outer bounding-box eaves.
 */
function cutawayRoofEdges(sheetRing) {
  const ring = sanitizeRoofRing(sheetRing);
  const aabb = roofRingAabbXZ(ring);
  if (!aabb || ring.length < 5) return [];
  const eps = 0.08;
  const on = (value, target) => Math.abs(value - target) < eps;
  const edges = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.15) continue;
    const alongX = Math.abs(dz) <= 0.12 && Math.abs(dx) > 0.15;
    const alongZ = Math.abs(dx) <= 0.12 && Math.abs(dz) > 0.15;
    if (!alongX && !alongZ) continue;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    if (alongX && (on(midZ, aabb.minZ) || on(midZ, aabb.maxZ))) continue;
    if (alongZ && (on(midX, aabb.minX) || on(midX, aabb.maxX))) continue;
    const testX = alongX ? midX : midX + 0.04;
    const testZ = alongX ? midZ + 0.04 : midZ;
    const outward = pointInRoofRing(testX, testZ, ring) ? -1 : 1;
    edges.push({
      alongX,
      length,
      midX,
      midZ,
      outward,
      startX: Math.min(a.x, b.x),
      endX: Math.max(a.x, b.x),
      startZ: Math.min(a.z, b.z),
      endZ: Math.max(a.z, b.z),
    });
  }
  return edges;
}

function cutawayRunRange(edge) {
  return edge.alongX
    ? { start: edge.startX, end: edge.endX }
    : { start: edge.startZ, end: edge.endZ };
}

function cutawayCross(edge) {
  return edge.alongX ? edge.midZ : edge.midX;
}

/** Bite a hair into each gable so the panel/gutter butt the inner face. */
function cutawayTrimRunSpan(edge) {
  const overlap = GABLE_BARGE_INSET_M + 0.001;
  const { start, end } = cutawayRunRange(edge);
  return { start: start - overlap, end: end + overlap };
}

/**
 * +1 / -1 along fall from a cutaway, pointing outside the roof.
 * Returns 0 at an inner corner where both sides are still inside the outline.
 */
function cutawayWrapSign(alongX, inboardRun, edgeCross, ring) {
  const delta = 0.04;
  const pos = pointOnRun(alongX, inboardRun, edgeCross + delta, 0);
  const neg = pointOnRun(alongX, inboardRun, edgeCross - delta, 0);
  const posIn = pointInRoofRing(pos.x, pos.z, ring);
  const negIn = pointInRoofRing(neg.x, neg.z, ring);
  if (posIn === negIn) return 0;
  return posIn ? -1 : 1;
}

/**
 * 100×100 gutters on both AABB eaves, clipped to the traced outline.
 *
 * @returns {{
 *   alongX: boolean,
 *   length: number,
 *   outward: number,
 *   eaveCross: number,
 *   position: { x: number, y: number, z: number },
 * }[]}
 */
export function affordableGutterBoxes(
  ring,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const aabb = roofRingAabbXZ(ring);
  const profile = affordableSheetProfile(ring, ridgeAxis, pitchDeg);
  if (!aabb || !profile) return [];
  const baseY = Number(slabTopY);
  if (!Number.isFinite(baseY)) return [];
  const { alongX, points } = profile;
  const eave0 = points[0];
  const eave1 = points[points.length - 1];
  const { minRun, maxRun } = roofRunExtent(aabb, alongX);
  const size = AFFORDABLE_GUTTER_SIZE_M;
  const barge = AFFORDABLE_GABLE_BARGE_THICKNESS_M;
  const sheetEaveY = baseY + eave0.height + SHEET_LIFT_M;
  const y = sheetEaveY - size / 2;
  const boxes = [];
  const pushEave = (eaveCross, outward) => {
    const clipCross = eaveCross - outward * 0.02;
    const spans = clipRoofAxisSpansToRing(alongX, clipCross, minRun, maxRun, ring);
    spans.forEach((span) => {
      const length = span.end - span.start + barge * 2;
      if (!(length > 0.05)) return;
      const runCenter = (span.start + span.end) / 2;
      boxes.push({
        alongX,
        length,
        outward,
        eaveCross,
        size,
        position: pointOnRun(alongX, runCenter, eaveCross + outward * (size / 2), y),
      });
    });
  };
  pushEave(eave0.cross, -1);
  pushEave(eave1.cross, 1);
  cutawayRoofEdges(ring)
    .filter((edge) => edge.alongX === alongX)
    .forEach((edge) => {
      const { start, end } = cutawayTrimRunSpan(edge);
      const length = end - start;
      if (!(length > 0.05)) return;
      const eaveCross = cutawayCross(edge);
      const sheetY = baseY + heightAtSheetCross(eaveCross, profile) + SHEET_LIFT_M;
      const runCenter = (start + end) / 2;
      const panel = AFFORDABLE_CUTAWAY_PANEL_THICK_M;
      boxes.push({
        alongX,
        length,
        outward: edge.outward,
        eaveCross: eaveCross + edge.outward * panel,
        size,
        cutaway: true,
        position: pointOnRun(
          alongX,
          runCenter,
          eaveCross + edge.outward * (panel + size / 2),
          sheetY - size / 2
        ),
      });
    });
  return boxes;
}

/** Wall thickness of the 100×100 open-top gutter channel (m). */
export const AFFORDABLE_GUTTER_WALL_M = 0.01;

/**
 * Open-top 100×100 channel plates (back, bottom, front) per eave.
 *
 * @returns {{
 *   alongX: boolean,
 *   size: { x: number, y: number, z: number },
 *   position: { x: number, y: number, z: number },
 * }[]}
 */
export function affordableGutterChannelParts(
  ring,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const boxes = affordableGutterBoxes(ring, ridgeAxis, slabTopY, pitchDeg);
  const wall = AFFORDABLE_GUTTER_WALL_M;
  const parts = [];
  boxes.forEach((box) => {
    const { alongX, length, outward, eaveCross, position } = box;
    const size = box.size || AFFORDABLE_GUTTER_SIZE_M;
    const yTop = position.y + size / 2;
    const yBottom = yTop - size;
    const yMid = (yTop + yBottom) / 2;
    const backCross = eaveCross + outward * (wall / 2);
    const frontCross = eaveCross + outward * (size - wall / 2);
    const bottomCross = eaveCross + outward * (size / 2);
    const run = alongX ? position.x : position.z;
    const plate = (cross, y, sx, sy, sz, runAt = run) => {
      parts.push({
        alongX,
        cutaway: Boolean(box.cutaway),
        size: { x: sx, y: sy, z: sz },
        position: pointOnRun(alongX, runAt, cross, y),
      });
    };
    if (alongX) {
      plate(backCross, yMid, length, size, wall);
      plate(frontCross, yMid, length, size, wall);
      plate(bottomCross, yBottom + wall / 2, length, wall, size);
      plate(bottomCross, yMid, wall, size, size, run - length / 2 + wall / 2);
      plate(bottomCross, yMid, wall, size, size, run + length / 2 - wall / 2);
    } else {
      plate(backCross, yMid, wall, size, length);
      plate(frontCross, yMid, wall, size, length);
      plate(bottomCross, yBottom + wall / 2, size, wall, length);
      plate(bottomCross, yMid, size, size, wall, run - length / 2 + wall / 2);
      plate(bottomCross, yMid, size, size, wall, run + length / 2 - wall / 2);
    }
  });
  return parts;
}

/**
 * 5 mm drop plate under each cutaway gutter, down to the 100 mm slab soffit.
 *
 * @returns {{
 *   alongX: boolean,
 *   size: { x: number, y: number, z: number },
 *   position: { x: number, y: number, z: number },
 * }[]}
 */
export function affordableCutawayFasciaParts(
  sheetRing,
  roofRing,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const profile = affordableSheetProfile(roofRing, ridgeAxis, pitchDeg);
  const baseY = Number(slabTopY);
  if (!profile || !Number.isFinite(baseY)) return [];
  const thick = AFFORDABLE_CUTAWAY_PANEL_THICK_M;
  const gutter = AFFORDABLE_GUTTER_SIZE_M;
  const yBottom = baseY - AFFORDABLE_ROOF_SLAB_THICKNESS_M;
  const parts = [];
  cutawayRoofEdges(sheetRing)
    .filter((edge) => edge.alongX === profile.alongX)
    .forEach((edge) => {
    const { start, end } = cutawayTrimRunSpan(edge);
    const length = end - start;
    const cross = cutawayCross(edge);
    const sheetY = baseY + heightAtSheetCross(cross, profile) + SHEET_LIFT_M;
    const yTop = sheetY - gutter;
    const height = yTop - yBottom;
    if (!(height > 0.02) || !(length > 0.05)) return;
    const yMid = (yTop + yBottom) / 2;
    const runCenter = (start + end) / 2;
    const pos = edge.alongX
      ? {
          x: runCenter,
          y: yMid,
          z: edge.midZ + edge.outward * (thick / 2),
        }
      : {
          x: edge.midX + edge.outward * (thick / 2),
          y: yMid,
          z: runCenter,
        };
    parts.push({
      alongX: edge.alongX,
      size: edge.alongX
        ? { x: length, y: height, z: thick }
        : { x: thick, y: height, z: length },
      position: pos,
    });
  });
  return parts;
}

/**
 * Gable barge / infill on every fall-aligned edge of the traced outline,
 * from the roof-slab soffit up to the sheet.
 *
 * @returns {{ positions: Float32Array, indices: Uint32Array } | null}
 */
export function buildAffordableGableEndPanelMeshData(
  ring,
  ridgeAxis,
  slabTopY,
  pitchDeg = AFFORDABLE_ROOF_PITCH_DEG
) {
  const aabb = roofRingAabbXZ(ring);
  const profile = affordableSheetProfile(ring, ridgeAxis, pitchDeg);
  const clean = sanitizeRoofRing(ring);
  if (!aabb || !profile || clean.length < 3) return null;
  const baseY = Number(slabTopY);
  if (!Number.isFinite(baseY)) return null;
  const { alongX, points } = profile;
  const peak = points.reduce((best, p) => (p.height > best.height ? p : best), points[0]);
  const topPad = SHEET_LIFT_M + AFFORDABLE_SHEET_THICKNESS_M;
  const yBottom = baseY - AFFORDABLE_ROOF_SLAB_THICKNESS_M;
  const thick = AFFORDABLE_GABLE_BARGE_THICKNESS_M;
  const positions = [];
  const indices = [];

  const addPanel = (outline, runInner, runOuter) => {
    const n = outline.length;
    if (n < 3) return;
    const base = positions.length / 3;
    outline.forEach((p) => {
      const w = pointOnRun(alongX, runInner, p.cross, p.y);
      positions.push(w.x, w.y, w.z);
    });
    outline.forEach((p) => {
      const w = pointOnRun(alongX, runOuter, p.cross, p.y);
      positions.push(w.x, w.y, w.z);
    });
    for (let i = 1; i < n - 1; i += 1) {
      indices.push(base, base + i, base + i + 1);
      indices.push(base + n, base + n + i + 1, base + n + i);
    }
    for (let i = 0; i < n; i += 1) {
      const i1 = (i + 1) % n;
      const a = base + i;
      const b = base + i1;
      const c = base + n + i1;
      const d = base + n + i;
      indices.push(a, b, c, a, c, d);
    }
  };

  const runOf = (p) => (alongX ? p.x : p.z);
  const crossOf = (p) => (alongX ? p.z : p.x);

  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const dRun = runOf(b) - runOf(a);
    const dCross = crossOf(b) - crossOf(a);
    if (Math.abs(dRun) > 0.12 || Math.abs(dCross) < 0.15) continue;
    const c0 = Math.min(crossOf(a), crossOf(b));
    const c1 = Math.max(crossOf(a), crossOf(b));
    let lo = c0;
    let hi = c1;
    const run = (runOf(a) + runOf(b)) / 2;
    const midCross = (c0 + c1) / 2;
    const test = pointOnRun(alongX, run + 0.04, midCross, 0);
    const outward = pointInRoofRing(test.x, test.z, clean) ? -1 : 1;
    const inboardRun = run - outward * 0.05;
    const panelT = AFFORDABLE_CUTAWAY_PANEL_THICK_M;
    cutawayRoofEdges(clean)
      .filter((edge) => edge.alongX === alongX)
      .forEach((edge) => {
        const { start, end } = cutawayRunRange(edge);
        const edgeCross = cutawayCross(edge);
        const atRun =
          Math.abs(run - start) < 0.25 || Math.abs(run - end) < 0.25;
        const atEave =
          (Math.abs(c0 - edgeCross) < 0.25 || Math.abs(c1 - edgeCross) < 0.25) &&
          run >= start - 0.25 &&
          run <= end + 0.25;
        if (!atRun && !atEave) return;
        const sign =
          cutawayWrapSign(alongX, inboardRun, edgeCross, clean) || edge.outward;
        const coverCross = edgeCross + sign * panelT;
        lo = Math.min(lo, edgeCross, coverCross);
        hi = Math.max(hi, edgeCross, coverCross);
        // Short gable: grow this end by the plate thickness even if outward was flipped.
        if (sign > 0) hi = Math.max(hi, edgeCross + panelT);
        if (sign < 0) lo = Math.min(lo, edgeCross - panelT);
      });
    const h0 = heightAtSheetCross(lo, profile);
    const h1 = heightAtSheetCross(hi, profile);
    const outline = [
      { cross: lo, y: yBottom },
      { cross: lo, y: baseY + h0 + topPad },
    ];
    if (peak.cross > lo + 0.02 && peak.cross < hi - 0.02) {
      outline.push({ cross: peak.cross, y: baseY + peak.height + topPad });
    }
    outline.push(
      { cross: hi, y: baseY + h1 + topPad },
      { cross: hi, y: yBottom }
    );
    addPanel(
      outline,
      run - outward * GABLE_BARGE_INSET_M,
      run + outward * thick
    );
  }

  if (indices.length < 3) return null;
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}
