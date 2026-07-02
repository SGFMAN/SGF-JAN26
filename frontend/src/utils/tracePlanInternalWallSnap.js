import { internalWallHalfThicknessSource } from "./tracePlanInternalWalls";

const MIN_LEN = 1e-6;
const MIN_ANGLE_RAD = (12 * Math.PI) / 180;
const MAX_ANGLE_RAD = (168 * Math.PI) / 180;

function hypot(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const len = hypot(x, y);
  if (len < MIN_LEN) return null;
  return { x: x / len, y: y / len };
}

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

/** Signed area cross (a -> b) x (a -> p). */
function signedSide(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

function projectOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < MIN_LEN * MIN_LEN) {
    const dist = hypot(px - ax, py - ay);
    return { x: ax, y: ay, t: 0, dist };
  }
  let t = dot(px - ax, py - ay, dx, dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { x, y, t, dist: hypot(px - x, py - y) };
}

function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  return {
    x: ax + t * (bx - ax),
    y: ay + t * (by - ay),
    t,
    u,
  };
}

function interiorAngle(u1x, u1y, u2x, u2y) {
  const c = Math.max(-1, Math.min(1, dot(u1x, u1y, u2x, u2y)));
  return Math.acos(c);
}

function isClearCrossing(start, end, ea, eb, threshold) {
  const sideStart = signedSide(ea.x, ea.y, eb.x, eb.y, start.x, start.y);
  const sideEnd = signedSide(ea.x, ea.y, eb.x, eb.y, end.x, end.y);
  if (Math.abs(sideStart) < threshold * 0.25 || Math.abs(sideEnd) < threshold * 0.25) {
    return false;
  }
  if (sideStart * sideEnd >= 0) return false;

  const hit = segmentIntersection(
    start.x,
    start.y,
    end.x,
    end.y,
    ea.x,
    ea.y,
    eb.x,
    eb.y
  );
  if (!hit || hit.t <= 0.02 || hit.t >= 0.98 || hit.u <= 0.02 || hit.u >= 0.98) {
    return false;
  }

  const endProj = projectOnSegment(end.x, end.y, ea.x, ea.y, eb.x, eb.y);
  return endProj.dist > threshold * 0.65;
}

/**
 * Snap a point while drawing or dragging an internal wall endpoint.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} existingSegments
 * @param {{ x: number, y: number }[]} outerPoints
 * @param {{ threshold?: number, excludeSegmentIndex?: number, minPointSeparation?: number }} [options]
 */
export function resolveInternalWallDrawSnap(start, end, existingSegments, outerPoints, options = {}) {
  const halfT = internalWallHalfThicknessSource(outerPoints) ?? 4;
  const threshold = options.threshold ?? Math.max(halfT * 1.5, 8);
  const excludeSegmentIndex = options.excludeSegmentIndex ?? -1;
  const minSep = options.minPointSeparation ?? 2;

  if (hypot(end.x - start.x, end.y - start.y) < minSep) {
    return { point: end, kind: "none" };
  }

  let bestL = null;
  let bestLScore = threshold;

  let bestT = null;
  let bestTScore = threshold;

  existingSegments.forEach((seg, segmentIndex) => {
    if (segmentIndex === excludeSegmentIndex) return;

    const ea = seg.a;
    const eb = seg.b;

    ["a", "b"].forEach((vertex) => {
      const junction = seg[vertex];
      const other = vertex === "a" ? eb : ea;
      const dist = hypot(end.x - junction.x, end.y - junction.y);
      if (dist >= bestLScore) return;

      const uExisting = normalize(junction.x - other.x, junction.y - other.y);
      const uNew = normalize(end.x - start.x, end.y - start.y);
      if (!uExisting || !uNew) return;

      if (hypot(junction.x - start.x, junction.y - start.y) < minSep) return;

      const theta = interiorAngle(uExisting.x, uExisting.y, uNew.x, uNew.y);
      if (theta < MIN_ANGLE_RAD || theta > MAX_ANGLE_RAD) return;

      bestLScore = dist;
      bestL = {
        junction: { ...junction },
        segmentIndex,
      };
    });

    if (isClearCrossing(start, end, ea, eb, threshold)) return;

    const proj = projectOnSegment(end.x, end.y, ea.x, ea.y, eb.x, eb.y);
    if (proj.t <= 0.04 || proj.t >= 0.96 || proj.dist >= bestTScore) return;

    const hit = segmentIntersection(
      start.x,
      start.y,
      end.x,
      end.y,
      ea.x,
      ea.y,
      eb.x,
      eb.y
    );
    const snapPoint =
      hit && hit.t > 0.02 && hit.t < 0.98 && hit.u > 0.02 && hit.u < 0.98
        ? { x: hit.x, y: hit.y }
        : { x: proj.x, y: proj.y };

    bestTScore = proj.dist;
    bestT = {
      point: snapPoint,
      drawPoint: snapPoint,
      segmentIndex,
    };
  });

  if (bestL) {
    return {
      point: bestL.junction,
      previewPoint: bestL.junction,
      kind: "l",
      segmentIndex: bestL.segmentIndex,
      lCorner: {
        junction: bestL.junction,
      },
    };
  }

  if (bestT) {
    return {
      point: bestT.drawPoint,
      previewPoint: bestT.drawPoint,
      kind: "t",
      segmentIndex: bestT.segmentIndex,
    };
  }

  return { point: end, previewPoint: end, kind: "none" };
}
