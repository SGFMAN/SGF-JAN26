import {
  clipRoofAxisSpansToRing,
  pointInRoofRing,
  roofRingAabbXZ,
} from "./affordableRoofGeometry.js";
import { CORRUGATED_ROOF_PITCH_M } from "./corrugatedRoofTexture.js";

/** Isosceles truss pitch from the horizontal (degrees). */
export const SUPERIOR_TRUSS_PITCH_DEG = 15;

/** Plan width used to flush first/last truss faces (90 mm). */
export const SUPERIOR_TRUSS_WIDTH_M = 0.09;

/** Layout thickness of the bottom chord above the wall (45 mm). */
export const SUPERIOR_TRUSS_THICK_M = 0.045;

/** Drawn timber: 45 mm along the truss row, 90 mm in the truss plane. */
export const SUPERIOR_TRUSS_TIMBER_ALONG_ROW_M = SUPERIOR_TRUSS_THICK_M;
export const SUPERIOR_TRUSS_TIMBER_IN_PLANE_M = SUPERIOR_TRUSS_WIDTH_M;

/** Roof sheet thickness over each truss-run slope. */
export const SUPERIOR_ROOF_SHEET_THICK_M = 0.002;

/** Target centre-to-centre spacing along the long side. */
export const SUPERIOR_TRUSS_CENTRES_M = 0.9;

const MIN_SPAN_M = 0.2;

function pointAt(alongX, cross, run) {
  return alongX ? { x: run, z: cross } : { x: cross, z: run };
}

function uniqueSorted(values, eps = 0.002) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) {
    if (!out.length || v - out[out.length - 1] > eps) out.push(v);
  }
  return out;
}

function rectSpanAlongX(rect) {
  const sizeX = rect.maxX - rect.minX;
  const sizeZ = rect.maxZ - rect.minZ;
  return sizeX <= sizeZ;
}

function longAxisForSpan(spanAlongX) {
  return spanAlongX ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
}

/**
 * Lay a gable-end truss down to pitch: plane contains the span and a vector
 * that runs inward along the row at `pitchRad` from the floor.
 * inwardSign: +1 at the min-long end, -1 at the max-long end.
 */
function hipEndFrame(spanAlongX, inwardSign, pitchRad) {
  const c = Math.cos(pitchRad);
  const s = Math.sin(pitchRad);
  if (spanAlongX) {
    return {
      longAxis: { x: 0, y: -inwardSign * c, z: s },
      shiftLong: inwardSign * c,
      sinP: s,
    };
  }
  return {
    longAxis: { x: -s, y: inwardSign * c, z: 0 },
    shiftLong: inwardSign * c,
    sinP: s,
  };
}

function hipInwardSign(stationIndex, stationCount, hipMinEnd, hipMaxEnd) {
  if (!(stationCount > 1)) return 0;
  if (hipMinEnd && stationIndex === 0) return 1;
  if (hipMaxEnd && stationIndex === stationCount - 1) return -1;
  return 0;
}

function cellKey(i, j) {
  return `${i},${j}`;
}

function largestOccupiedRect(xs, zs, occupied) {
  let best = null;
  let bestArea = 0;
  const ni = xs.length - 1;
  const nj = zs.length - 1;
  for (let i1 = 0; i1 < ni; i1 += 1) {
    for (let i2 = i1; i2 < ni; i2 += 1) {
      for (let j1 = 0; j1 < nj; j1 += 1) {
        for (let j2 = j1; j2 < nj; j2 += 1) {
          let ok = true;
          for (let i = i1; i <= i2 && ok; i += 1) {
            for (let j = j1; j <= j2; j += 1) {
              if (!occupied.has(cellKey(i, j))) {
                ok = false;
                break;
              }
            }
          }
          if (!ok) continue;
          const area = (xs[i2 + 1] - xs[i1]) * (zs[j2 + 1] - zs[j1]);
          if (area > bestArea + 1e-9) {
            bestArea = area;
            best = {
              minX: xs[i1],
              maxX: xs[i2 + 1],
              minZ: zs[j1],
              maxZ: zs[j2 + 1],
              i1,
              i2,
              j1,
              j2,
            };
          }
        }
      }
    }
  }
  return best;
}

/**
 * Cover an orthogonal outline with the largest rectangle first (main),
 * then leftover rectangles (protrusions).
 */
export function decomposeOrthogonalRoofRects(ring) {
  const aabb = roofRingAabbXZ(ring);
  if (!aabb) return [];
  const xs = uniqueSorted(ring.map((p) => p.x));
  const zs = uniqueSorted(ring.map((p) => p.z));
  if (xs.length < 2 || zs.length < 2) {
    return [{ minX: aabb.minX, maxX: aabb.maxX, minZ: aabb.minZ, maxZ: aabb.maxZ }];
  }
  const occupied = new Set();
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < zs.length - 1; j += 1) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      if (pointInRoofRing(cx, cz, ring)) occupied.add(cellKey(i, j));
    }
  }
  if (!occupied.size) {
    return [{ minX: aabb.minX, maxX: aabb.maxX, minZ: aabb.minZ, maxZ: aabb.maxZ }];
  }
  const remaining = new Set(occupied);
  const rects = [];
  while (remaining.size) {
    const next = largestOccupiedRect(xs, zs, remaining);
    if (!next) break;
    rects.push({
      minX: next.minX,
      maxX: next.maxX,
      minZ: next.minZ,
      maxZ: next.maxZ,
    });
    for (let i = next.i1; i <= next.i2; i += 1) {
      for (let j = next.j1; j <= next.j2; j += 1) remaining.delete(cellKey(i, j));
    }
  }
  return rects.length
    ? rects
    : [{ minX: aabb.minX, maxX: aabb.maxX, minZ: aabb.minZ, maxZ: aabb.maxZ }];
}

/**
 * Stations along the long side, with the first and last truss faces flush
 * to the outline ends (centres inset by half the 90 mm width).
 */
export function superiorTrussStationsAlong(minLong, maxLong) {
  const span = Number(maxLong) - Number(minLong);
  const halfW = SUPERIOR_TRUSS_WIDTH_M / 2;
  if (!(span > SUPERIOR_TRUSS_WIDTH_M + 0.05)) {
    return Number.isFinite(minLong) && Number.isFinite(maxLong)
      ? [(minLong + maxLong) / 2]
      : [];
  }
  const first = minLong + halfW;
  const last = maxLong - halfW;
  const usable = last - first;
  const bayCount = Math.max(1, Math.round(usable / SUPERIOR_TRUSS_CENTRES_M));
  const step = usable / bayCount;
  const stations = [];
  for (let i = 0; i <= bayCount; i += 1) {
    stations.push(first + i * step);
  }
  return stations;
}

function pushTruss(members, trussState, spanAlongX, cross, start, end, wallYs, inwardSign = 0) {
  const length = end - start;
  if (length < MIN_SPAN_M) return;
  const half = length / 2;
  const rise = wallYs.tanP * half;
  trussState.riseM = Math.max(trussState.riseM, rise);
  const a = pointAt(spanAlongX, cross, start);
  const b = pointAt(spanAlongX, cross, end);
  let heelAY = wallYs.chordTop;
  let heelBY = wallYs.chordTop;
  let heelA = a;
  let heelB = b;
  let peak = pointAt(spanAlongX, cross, (start + end) / 2);
  let peakY = wallYs.chordTop + rise;
  let longAxis = longAxisForSpan(spanAlongX);
  if (inwardSign) {
    const hip = hipEndFrame(spanAlongX, inwardSign, wallYs.pitchRad);
    const lay = (y) => {
      const dy = y - wallYs.chordMid;
      const long = cross + dy * hip.shiftLong;
      return { long, y: wallYs.chordMid + dy * hip.sinP };
    };
    const heel = lay(wallYs.chordTop);
    const apex = lay(peakY);
    heelA = pointAt(spanAlongX, heel.long, start);
    heelB = pointAt(spanAlongX, heel.long, end);
    heelAY = heel.y;
    heelBY = heel.y;
    peak = pointAt(spanAlongX, apex.long, (start + end) / 2);
    peakY = apex.y;
    longAxis = hip.longAxis;
  }
  const idx = trussState.index;
  trussState.index += 1;
  members.push({
    from: { x: a.x, y: wallYs.chordMid, z: a.z },
    to: { x: b.x, y: wallYs.chordMid, z: b.z },
    longAxis,
    kind: "bottom",
    trussIndex: idx,
  });
  members.push({
    from: { x: heelA.x, y: heelAY, z: heelA.z },
    to: { x: peak.x, y: peakY, z: peak.z },
    longAxis,
    kind: "rafter",
    trussIndex: idx,
  });
  members.push({
    from: { x: heelB.x, y: heelBY, z: heelB.z },
    to: { x: peak.x, y: peakY, z: peak.z },
    longAxis,
    kind: "rafter",
    trussIndex: idx,
  });
}

function addRectTrusses(members, trussState, rect, ring, wallYs, spanAlongX, runs) {
  const minLong = spanAlongX ? rect.minZ : rect.minX;
  const maxLong = spanAlongX ? rect.maxZ : rect.maxX;
  const minRun = spanAlongX ? rect.minX : rect.minZ;
  const maxRun = spanAlongX ? rect.maxX : rect.maxZ;
  if (runs) {
    runs.push({
      spanAlongX,
      minLong,
      maxLong,
      minRun,
      maxRun,
      hipMin: true,
      hipMax: true,
    });
  }
  superiorTrussStationsAlong(minLong, maxLong).forEach((cross, i, stations) => {
    const inwardSign = hipInwardSign(i, stations.length, true, true);
    const spans = clipRoofAxisSpansToRing(spanAlongX, cross, minRun, maxRun, ring);
    const toPlace = spans.length ? spans : [{ start: minRun, end: maxRun }];
    toPlace.forEach((span) => {
      pushTruss(members, trussState, spanAlongX, cross, span.start, span.end, wallYs, inwardSign);
    });
  });
}

/**
 * Where the small ridge (same 15° as the main) hits the main rafter slope,
 * measured along the axis the protrusion stations use. Not the main ridge —
 * that is further in.
 */
function protrusionStopStation(main, rect, spanAlongX, mainSpanAlongX) {
  const minRun = spanAlongX ? rect.minX : rect.minZ;
  const maxRun = spanAlongX ? rect.maxX : rect.maxZ;
  const smallHalf = Math.max(0, (maxRun - minRun) / 2);
  const mainMin = mainSpanAlongX ? main.minX : main.minZ;
  const mainMax = mainSpanAlongX ? main.maxX : main.maxZ;
  const mainMid = (mainMin + mainMax) / 2;
  const rectMin = spanAlongX ? rect.minZ : rect.minX;
  const rectMax = spanAlongX ? rect.maxZ : rect.maxX;
  const rectMid = (rectMin + rectMax) / 2;
  if (!(Number.isFinite(smallHalf) && Number.isFinite(mainMid))) return null;
  return rectMid > mainMid ? mainMax - smallHalf : mainMin + smallHalf;
}

/**
 * 90° run on a protrusion, continued into the main until the small ridge
 * meets the main roof slope. Last truss sits on that line; the rest are
 * respaced from the outer end. Span stays the protrusion width.
 */
function addProtrusionTrusses(members, trussState, rect, main, ring, wallYs, spanAlongX, mainSpanAlongX, runs) {
  const minRun = spanAlongX ? rect.minX : rect.minZ;
  const maxRun = spanAlongX ? rect.maxX : rect.maxZ;
  const rectMin = spanAlongX ? rect.minZ : rect.minX;
  const rectMax = spanAlongX ? rect.maxZ : rect.maxX;
  const stop = protrusionStopStation(main, rect, spanAlongX, mainSpanAlongX);
  const mainMid = mainSpanAlongX
    ? (main.minX + main.maxX) / 2
    : (main.minZ + main.maxZ) / 2;
  const fromMaxSide = (rectMin + rectMax) / 2 > mainMid;
  let minLong = rectMin;
  let maxLong = rectMax;
  if (Number.isFinite(stop)) {
    if (fromMaxSide) {
      minLong = stop;
      maxLong = rectMax;
    } else {
      minLong = rectMin;
      maxLong = stop;
    }
  }
  if (!(maxLong > minLong)) {
    minLong = rectMin;
    maxLong = rectMax;
  }
  const hipMin = !fromMaxSide;
  const hipMax = fromMaxSide;
  if (runs) {
    runs.push({
      spanAlongX,
      minLong,
      maxLong,
      minRun,
      maxRun,
      hipMin,
      hipMax,
    });
  }
  superiorTrussStationsAlong(minLong, maxLong).forEach((cross, i, stations) => {
    const inwardSign = hipInwardSign(i, stations.length, hipMin, hipMax);
    const clipped = clipRoofAxisSpansToRing(spanAlongX, cross, minRun, maxRun, ring)
      .map((span) => ({
        start: Math.max(span.start, minRun),
        end: Math.min(span.end, maxRun),
      }))
      .filter((span) => span.end - span.start >= MIN_SPAN_M);
    const toPlace = clipped.length ? clipped : [{ start: minRun, end: maxRun }];
    toPlace.forEach((span) => {
      pushTruss(members, trussState, spanAlongX, cross, span.start, span.end, wallYs, inwardSign);
    });
  });
}

/**
 * One 15° truss run on the largest rectangle (spanning its short side), then
 * a 90° adjacent run on each leftover protrusion, continued until the small
 * ridge meets the main roof slope. No valley trimming.
 *
 * @param {{ x: number, z: number }[]} ring
 * @param {number} wallTopY
 */
export function buildSuperiorRoofTrussMembers(ring, wallTopY) {
  const aabb = roofRingAabbXZ(ring);
  if (!aabb) return null;
  const yBottom = Number(wallTopY);
  if (!Number.isFinite(yBottom)) return null;
  const wallYs = {
    chordTop: yBottom + SUPERIOR_TRUSS_THICK_M,
    chordMid: yBottom + SUPERIOR_TRUSS_THICK_M / 2,
    tanP: Math.tan((SUPERIOR_TRUSS_PITCH_DEG * Math.PI) / 180),
    pitchRad: (SUPERIOR_TRUSS_PITCH_DEG * Math.PI) / 180,
  };
  const members = [];
  const runs = [];
  const trussState = { index: 0, riseM: 0 };
  const rects = decomposeOrthogonalRoofRects(ring);
  const main = rects[0];
  if (!main) return null;
  const mainSpanAlongX = rectSpanAlongX(main);
  addRectTrusses(members, trussState, main, ring, wallYs, mainSpanAlongX, runs);
  const protrusionSpanAlongX = !mainSpanAlongX;
  rects.slice(1).forEach((rect) => {
    addProtrusionTrusses(
      members,
      trussState,
      rect,
      main,
      ring,
      wallYs,
      protrusionSpanAlongX,
      mainSpanAlongX,
      runs
    );
  });
  if (!members.length) return null;
  return {
    members,
    sheets: buildSuperiorRoofSheets(runs, wallYs),
    riseM: trussState.riseM,
    pitchDeg: SUPERIOR_TRUSS_PITCH_DEG,
    count: trussState.index,
  };
}

function polygonNormal(verts) {
  const a = verts[0];
  const b = verts[1];
  const c = verts[2];
  const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
  const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

function offsetPolygon(verts, lift) {
  let n = polygonNormal(verts);
  if (n.y < 0) n = { x: -n.x, y: -n.y, z: -n.z };
  return verts.map((p) => ({
    x: p.x + n.x * lift,
    y: p.y + n.y * lift,
    z: p.z + n.z * lift,
  }));
}

function sheetMeshFromPolygon(verts, uvAt, lift) {
  if (!verts || verts.length < 3) return null;
  const lifted = offsetPolygon(verts, lift);
  const n = polygonNormal(lifted);
  const flip = n.y < 0;
  const positions = [];
  const uvs = [];
  verts.forEach((p, i) => {
    const q = lifted[i];
    positions.push(q.x, q.y, q.z);
    const uv = uvAt(p);
    uvs.push(uv.u, uv.v);
  });
  const indices = [];
  for (let i = 1; i < lifted.length - 1; i += 1) {
    if (flip) indices.push(0, i + 1, i);
    else indices.push(0, i, i + 1);
  }
  if (indices.length < 3) return null;
  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

function runOfPoint(spanAlongX, p) {
  return spanAlongX ? p.x : p.z;
}

function longOfPoint(spanAlongX, p) {
  return spanAlongX ? p.z : p.x;
}

function pointOnRun(spanAlongX, runVal, longVal, y) {
  return spanAlongX
    ? { x: runVal, y, z: longVal }
    : { x: longVal, y, z: runVal };
}

/**
 * Colorbond over each truss run. The main run is hip-cut at both ends;
 * a secondary run is hip-cut only on its outer end, and stays full height
 * into the main run.
 */
export function buildSuperiorRoofSheets(runs, wallYs) {
  const thick = SUPERIOR_ROOF_SHEET_THICK_M;
  const lift = SUPERIOR_TRUSS_TIMBER_IN_PLANE_M / 2 + thick / 2;
  const pitch = CORRUGATED_ROOF_PITCH_M;
  const sheets = [];
  (runs || []).forEach((run, runIndex) => {
    const span = Number(run.maxRun) - Number(run.minRun);
    const rowLen = Number(run.maxLong) - Number(run.minLong);
    if (!(span > MIN_SPAN_M) || !(rowLen > 0.02)) return;
    const half = span / 2;
    const rise = wallYs.tanP * half;
    const ridgeRun = (run.minRun + run.maxRun) / 2;
    const slopeLen = Math.hypot(half, rise);
    if (!(slopeLen > 0.04)) return;
    const eaveY = wallYs.chordTop;
    const ridgeY = wallYs.chordTop + rise;
    const hipMin = run.hipMin !== false;
    const hipMax = run.hipMax !== false;
    const hipInset = Math.min(half, rowLen / 2);
    const ridgeMinLong = hipMin ? run.minLong + hipInset : run.minLong;
    const ridgeMaxLong = hipMax ? run.maxLong - hipInset : run.maxLong;
    const hasRidge = ridgeMaxLong - ridgeMinLong > 0.02;
    const alongX = run.spanAlongX;
    const pt = (runVal, longVal, y) => pointOnRun(alongX, runVal, longVal, y);
    const slopeUv = (eaveRun) => (p) => ({
      u: longOfPoint(alongX, p) / pitch,
      v: Math.hypot(runOfPoint(alongX, p) - eaveRun, p.y - eaveY) / pitch,
    });
    const hipUv = (eaveLong) => (p) => ({
      u: runOfPoint(alongX, p) / pitch,
      v: Math.hypot(longOfPoint(alongX, p) - eaveLong, p.y - eaveY) / pitch,
    });
    const ridgeApexLong = (ridgeMinLong + ridgeMaxLong) / 2;
    const faces = [
      {
        side: "a",
        verts: hasRidge
          ? [
              pt(run.minRun, run.minLong, eaveY),
              pt(run.minRun, run.maxLong, eaveY),
              pt(ridgeRun, ridgeMaxLong, ridgeY),
              pt(ridgeRun, ridgeMinLong, ridgeY),
            ]
          : [
              pt(run.minRun, run.minLong, eaveY),
              pt(run.minRun, run.maxLong, eaveY),
              pt(ridgeRun, ridgeApexLong, ridgeY),
            ],
        uvAt: slopeUv(run.minRun),
      },
      {
        side: "b",
        verts: hasRidge
          ? [
              pt(run.maxRun, run.maxLong, eaveY),
              pt(run.maxRun, run.minLong, eaveY),
              pt(ridgeRun, ridgeMinLong, ridgeY),
              pt(ridgeRun, ridgeMaxLong, ridgeY),
            ]
          : [
              pt(run.maxRun, run.maxLong, eaveY),
              pt(run.maxRun, run.minLong, eaveY),
              pt(ridgeRun, ridgeApexLong, ridgeY),
            ],
        uvAt: slopeUv(run.maxRun),
      },
    ];
    if (hipMin) {
      faces.push({
        side: "hip-min",
        verts: [
          pt(run.minRun, run.minLong, eaveY),
          pt(run.maxRun, run.minLong, eaveY),
          pt(ridgeRun, ridgeMinLong, ridgeY),
        ],
        uvAt: hipUv(run.minLong),
      });
    }
    if (hipMax) {
      faces.push({
        side: "hip-max",
        verts: [
          pt(run.maxRun, run.maxLong, eaveY),
          pt(run.minRun, run.maxLong, eaveY),
          pt(ridgeRun, ridgeMaxLong, ridgeY),
        ],
        uvAt: hipUv(run.maxLong),
      });
    }
    faces.forEach((face) => {
      const mesh = sheetMeshFromPolygon(face.verts, face.uvAt, lift);
      if (!mesh) return;
      sheets.push({
        runIndex,
        side: face.side,
        thickM: thick,
        positions: mesh.positions,
        uvs: mesh.uvs,
        indices: mesh.indices,
      });
    });
  });
  return sheets;
}
