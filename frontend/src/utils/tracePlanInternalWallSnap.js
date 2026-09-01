import {
  externalWallCentreBoundarySource,
  internalWallHalfThicknessSource,
} from "./tracePlanInternalWalls";

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

function centreRingEdges(outerPoints, metresPerPixel) {
  const centre = externalWallCentreBoundarySource(outerPoints, metresPerPixel);
  if (!centre || centre.length < 3) return { ring: null, edges: [] };
  const edges = [];
  for (let i = 0; i < centre.length; i += 1) {
    edges.push({ a: centre[i], b: centre[(i + 1) % centre.length] });
  }
  return { ring: centre, edges };
}

function considerCandidate(best, candidate, threshold) {
  if (!candidate?.point || !Number.isFinite(candidate.dist)) return best;
  if (candidate.dist > threshold) return best;
  if (!best || candidate.dist < best.dist - 1e-9) return candidate;
  if (best && Math.abs(candidate.dist - best.dist) <= 1e-9) {
    const rank = { "wall-corner": 0, l: 1, wall: 2, t: 3 };
    const nextRank = rank[candidate.kind] ?? 9;
    const prevRank = rank[best.kind] ?? 9;
    if (nextRank < prevRank) return candidate;
  }
  return best;
}

function dualAxisCornerLock(cursor, points, threshold, kind) {
  let best = null;
  for (const point of points) {
    if (!point) continue;
    const dx = Math.abs(cursor.x - point.x);
    const dy = Math.abs(cursor.y - point.y);
    // Both axes must be in range so a corner locks H and V together
    // instead of sliding onto the nearer wall.
    if (dx > threshold || dy > threshold) continue;
    best = considerCandidate(
      best,
      {
        point: { x: point.x, y: point.y },
        dist: hypot(cursor.x - point.x, cursor.y - point.y),
        kind: point.kind || kind,
        segmentIndex: point.segmentIndex,
      },
      threshold
    );
  }
  return best;
}

function snapCursorToCentreWall(cursor, outerPoints, metresPerPixel, threshold) {
  const { ring, edges } = centreRingEdges(outerPoints, metresPerPixel);
  if (!ring) return null;

  const corner = dualAxisCornerLock(cursor, ring, threshold, "wall-corner");
  if (corner) return corner;

  let best = null;
  for (const { a, b } of edges) {
    const proj = projectOnSegment(cursor.x, cursor.y, a.x, a.y, b.x, b.y);
    best = considerCandidate(
      best,
      {
        point: { x: proj.x, y: proj.y },
        dist: proj.dist,
        kind: "wall",
        edge: { a, b },
      },
      threshold
    );
  }
  return best;
}

function snapOrthoEndToCentreWall(start, end, outerPoints, metresPerPixel, threshold) {
  const { ring, edges } = centreRingEdges(outerPoints, metresPerPixel);
  if (!ring) return null;

  const vertical = Math.abs(end.x - start.x) <= 1e-6;
  const horizontal = Math.abs(end.y - start.y) <= 1e-6;
  if (!vertical && !horizontal) return null;

  const align = (point) =>
    vertical ? { x: start.x, y: point.y } : { x: point.x, y: start.y };

  // Dual-axis corner lock first: if this stroke already lines up with a
  // corner on the locked axis, snap the free axis onto that corner too.
  let best = null;
  for (const vertex of ring) {
    const along = vertical
      ? Math.abs(vertex.y - end.y)
      : Math.abs(vertex.x - end.x);
    const across = vertical
      ? Math.abs(vertex.x - start.x)
      : Math.abs(vertex.y - start.y);
    if (along > threshold || across > threshold) continue;
    const aligned = align(vertex);
    best = considerCandidate(
      best,
      {
        point: aligned,
        dist: hypot(end.x - aligned.x, end.y - aligned.y),
        kind: "wall-corner",
      },
      threshold
    );
  }
  if (best) return best;

  for (const { a, b } of edges) {
    const hit = projectOnSegment(end.x, end.y, a.x, a.y, b.x, b.y);
    if (hit.dist > threshold) continue;
    const aligned = align(hit);
    const onEdge = projectOnSegment(aligned.x, aligned.y, a.x, a.y, b.x, b.y);
    if (onEdge.dist > threshold) continue;
    const dist = hypot(end.x - aligned.x, end.y - aligned.y);
    best = considerCandidate(
      best,
      { point: aligned, dist, kind: "wall", edge: { a, b } },
      threshold
    );
  }

  return best;
}

function snapOptions(outerPoints, options) {
  const metresPerPixel = options.metresPerPixel ?? null;
  const halfT = internalWallHalfThicknessSource(outerPoints, metresPerPixel) ?? 4;
  return {
    halfT,
    metresPerPixel,
    threshold: options.threshold ?? Math.max(halfT * 2.5, 12),
    excludeSegmentIndex: options.excludeSegmentIndex ?? -1,
    minSep: options.minPointSeparation ?? 2,
  };
}

function crosshairGuides(point, extra = []) {
  if (!point) return extra;
  return [
    { x1: point.x - 1e6, y1: point.y, x2: point.x + 1e6, y2: point.y },
    { x1: point.x, y1: point.y - 1e6, x2: point.x, y2: point.y + 1e6 },
    ...extra,
  ];
}

function toSnapResult(candidate, fallback, start = null) {
  const point = candidate?.point || fallback;
  const extra = [];
  if (start && point) {
    extra.push({ x1: start.x, y1: start.y, x2: point.x, y2: point.y });
  }
  if (candidate?.edge?.a && candidate?.edge?.b) {
    extra.push({
      x1: candidate.edge.a.x,
      y1: candidate.edge.a.y,
      x2: candidate.edge.b.x,
      y2: candidate.edge.b.y,
      emphasis: true,
    });
  }
  const guides = crosshairGuides(point, extra);
  const dualAxis = candidate?.kind === "wall-corner" || candidate?.kind === "l";
  if (dualAxis) {
    guides.forEach((guide) => {
      guide.emphasis = true;
    });
  }
  if (!candidate?.point) {
    return { point: fallback, previewPoint: fallback, kind: "none", guides };
  }
  return {
    point: candidate.point,
    previewPoint: candidate.point,
    kind: candidate.kind,
    segmentIndex: candidate.segmentIndex,
    lCorner: candidate.kind === "l" ? { junction: candidate.point } : undefined,
    guides,
  };
}

/**
 * Snap the first click of an internal wall onto the centreline of an external
 * wall, or onto an existing internal wall endpoint / segment.
 */
export function resolveInternalWallStartSnap(cursor, existingSegments, outerPoints, options = {}) {
  const { threshold, metresPerPixel } = snapOptions(outerPoints, options);
  if (!cursor) return { point: cursor, kind: "none" };

  const existingPoints = [];
  (existingSegments || []).forEach((seg, segmentIndex) => {
    if (!seg?.a || !seg?.b) return;
    existingPoints.push({ ...seg.a, segmentIndex, kind: "l" });
    existingPoints.push({ ...seg.b, segmentIndex, kind: "l" });
  });

  const existingCorner = dualAxisCornerLock(
    cursor,
    existingPoints,
    threshold,
    "l"
  );
  if (existingCorner) return toSnapResult(existingCorner, cursor);

  const wallCorner = snapCursorToCentreWall(cursor, outerPoints, metresPerPixel, threshold);
  if (wallCorner?.kind === "wall-corner") return toSnapResult(wallCorner, cursor);

  let best = wallCorner;
  (existingSegments || []).forEach((seg, segmentIndex) => {
    if (!seg?.a || !seg?.b) return;
    const proj = projectOnSegment(cursor.x, cursor.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
    if (proj.t > 0.04 && proj.t < 0.96) {
      best = considerCandidate(
        best,
        {
          point: { x: proj.x, y: proj.y },
          dist: proj.dist,
          kind: "t",
          segmentIndex,
          edge: { a: seg.a, b: seg.b },
        },
        threshold
      );
    }
  });

  return toSnapResult(best, cursor);
}

/**
 * Snap a point while drawing or dragging an internal wall endpoint.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @param {{ a: { x: number, y: number }, b: { x: number, y: number } }[]} existingSegments
 * @param {{ x: number, y: number }[]} outerPoints
 * @param {{ threshold?: number, excludeSegmentIndex?: number, minPointSeparation?: number, metresPerPixel?: number }} [options]
 */
export function resolveInternalWallDrawSnap(start, end, existingSegments, outerPoints, options = {}) {
  const { threshold, excludeSegmentIndex, minSep, metresPerPixel } = snapOptions(
    outerPoints,
    options
  );

  if (hypot(end.x - start.x, end.y - start.y) < minSep) {
    return { point: end, kind: "none" };
  }

  const wallSnap = snapOrthoEndToCentreWall(start, end, outerPoints, metresPerPixel, threshold);
  const vertical = Math.abs(end.x - start.x) <= 1e-6;

  let junctionBest = null;
  (existingSegments || []).forEach((seg, segmentIndex) => {
    if (segmentIndex === excludeSegmentIndex) return;
    const ea = seg.a;
    const eb = seg.b;

    ["a", "b"].forEach((vertex) => {
      const junction = seg[vertex];
      const other = vertex === "a" ? eb : ea;
      const along = vertical
        ? Math.abs(junction.y - end.y)
        : Math.abs(junction.x - end.x);
      const across = vertical
        ? Math.abs(junction.x - start.x)
        : Math.abs(junction.y - start.y);
      if (along > threshold || across > threshold) return;

      const uExisting = normalize(junction.x - other.x, junction.y - other.y);
      const uNew = normalize(end.x - start.x, end.y - start.y);
      if (!uExisting || !uNew) return;
      if (hypot(junction.x - start.x, junction.y - start.y) < minSep) return;

      const theta = interiorAngle(uExisting.x, uExisting.y, uNew.x, uNew.y);
      if (theta < MIN_ANGLE_RAD || theta > MAX_ANGLE_RAD) return;

      const aligned = vertical
        ? { x: start.x, y: junction.y }
        : { x: junction.x, y: start.y };
      junctionBest = considerCandidate(
        junctionBest,
        {
          point: aligned,
          dist: hypot(end.x - aligned.x, end.y - aligned.y),
          kind: "l",
          segmentIndex,
        },
        threshold
      );
    });
  });

  if (junctionBest) return toSnapResult(junctionBest, end, start);
  if (wallSnap?.kind === "wall-corner") return toSnapResult(wallSnap, end, start);

  let best = wallSnap;
  (existingSegments || []).forEach((seg, segmentIndex) => {
    if (segmentIndex === excludeSegmentIndex) return;

    const ea = seg.a;
    const eb = seg.b;

    if (isClearCrossing(start, end, ea, eb, threshold)) return;

    const proj = projectOnSegment(end.x, end.y, ea.x, ea.y, eb.x, eb.y);
    if (proj.t <= 0.04 || proj.t >= 0.96 || proj.dist > threshold) return;

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

    best = considerCandidate(
      best,
      {
        point: snapPoint,
        dist: proj.dist,
        kind: "t",
        segmentIndex,
        edge: { a: ea, b: eb },
      },
      threshold
    );
  });

  return toSnapResult(best, end, start);
}
