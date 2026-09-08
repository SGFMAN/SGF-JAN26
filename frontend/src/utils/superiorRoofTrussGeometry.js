import {
  clipRoofAxisSpansToRing,
  pointInRoofRing,
  roofRingAabbXZ,
} from "./affordableRoofGeometry.js";

/** Isosceles truss pitch from the horizontal (degrees). */
export const SUPERIOR_TRUSS_PITCH_DEG = 15;

/** Plan width of each truss along the long axis (90 mm). */
export const SUPERIOR_TRUSS_WIDTH_M = 0.09;

/** Member thickness in the plane of the truss (45 mm). */
export const SUPERIOR_TRUSS_THICK_M = 0.045;

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

function pushTruss(members, trussState, spanAlongX, cross, start, end, wallYs) {
  const length = end - start;
  if (length < MIN_SPAN_M) return;
  const half = length / 2;
  const rise = wallYs.tanP * half;
  trussState.riseM = Math.max(trussState.riseM, rise);
  const a = pointAt(spanAlongX, cross, start);
  const b = pointAt(spanAlongX, cross, end);
  const peak = pointAt(spanAlongX, cross, (start + end) / 2);
  const peakY = wallYs.chordTop + rise;
  const idx = trussState.index;
  trussState.index += 1;
  const longAxis = longAxisForSpan(spanAlongX);
  members.push({
    from: { x: a.x, y: wallYs.chordMid, z: a.z },
    to: { x: b.x, y: wallYs.chordMid, z: b.z },
    longAxis,
    kind: "bottom",
    trussIndex: idx,
  });
  members.push({
    from: { x: a.x, y: wallYs.chordTop, z: a.z },
    to: { x: peak.x, y: peakY, z: peak.z },
    longAxis,
    kind: "rafter",
    trussIndex: idx,
  });
  members.push({
    from: { x: b.x, y: wallYs.chordTop, z: b.z },
    to: { x: peak.x, y: peakY, z: peak.z },
    longAxis,
    kind: "rafter",
    trussIndex: idx,
  });
}

function addRectTrusses(members, trussState, rect, ring, wallYs, spanAlongX) {
  const minLong = spanAlongX ? rect.minZ : rect.minX;
  const maxLong = spanAlongX ? rect.maxZ : rect.maxX;
  const minRun = spanAlongX ? rect.minX : rect.minZ;
  const maxRun = spanAlongX ? rect.maxX : rect.maxZ;
  superiorTrussStationsAlong(minLong, maxLong).forEach((cross) => {
    const spans = clipRoofAxisSpansToRing(spanAlongX, cross, minRun, maxRun, ring);
    const toPlace = spans.length ? spans : [{ start: minRun, end: maxRun }];
    toPlace.forEach((span) => {
      pushTruss(members, trussState, spanAlongX, cross, span.start, span.end, wallYs);
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
function addProtrusionTrusses(members, trussState, rect, main, ring, wallYs, spanAlongX, mainSpanAlongX) {
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
  superiorTrussStationsAlong(minLong, maxLong).forEach((cross) => {
    const clipped = clipRoofAxisSpansToRing(spanAlongX, cross, minRun, maxRun, ring)
      .map((span) => ({
        start: Math.max(span.start, minRun),
        end: Math.min(span.end, maxRun),
      }))
      .filter((span) => span.end - span.start >= MIN_SPAN_M);
    const toPlace = clipped.length ? clipped : [{ start: minRun, end: maxRun }];
    toPlace.forEach((span) => {
      pushTruss(members, trussState, spanAlongX, cross, span.start, span.end, wallYs);
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
  };
  const members = [];
  const trussState = { index: 0, riseM: 0 };
  const rects = decomposeOrthogonalRoofRects(ring);
  const main = rects[0];
  if (!main) return null;
  const mainSpanAlongX = rectSpanAlongX(main);
  addRectTrusses(members, trussState, main, ring, wallYs, mainSpanAlongX);
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
      mainSpanAlongX
    );
  });
  if (!members.length) return null;
  return {
    members,
    riseM: trussState.riseM,
    pitchDeg: SUPERIOR_TRUSS_PITCH_DEG,
    count: trussState.index,
  };
}
