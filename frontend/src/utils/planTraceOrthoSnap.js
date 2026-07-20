import { orthogonalSnap } from "./floorPlanDefine3dDraw";

/**
 * Collect unique H/V axis values from reference polygon corners (e.g. external walls)
 * so a roof (or similar) outline can soft-snap and show relation guides.
 *
 * @param {{ x: number, y: number }[]} points
 * @param {number} [tolerance=0.5]
 * @returns {{ xs: number[], ys: number[] }}
 */
export function collectOrthoReferenceAxes(points, tolerance = 0.5) {
  const xs = [];
  const ys = [];
  if (!Array.isArray(points)) return { xs, ys };
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (!xs.some((x) => Math.abs(x - p.x) <= tolerance)) xs.push(p.x);
    if (!ys.some((y) => Math.abs(y - p.y) <= tolerance)) ys.push(p.y);
  }
  return { xs, ys };
}

/**
 * Resolve an orthographic (H/V only) draw point for polygon tracing, with
 * guidelines and a special "close-ready" snap so the next segment can return
 * to the origin at 90°.
 *
 * Close-ready targets (from last point `prev`, origin `origin`):
 *   - { x: origin.x, y: prev.y }  → horizontal from prev, then vertical to origin
 *   - { x: prev.x, y: origin.y }  → vertical from prev, then horizontal to origin
 *
 * Optional `referenceAxes` (from external walls etc.) soft-snap the current
 * stroke onto matching X/Y lines and draw the same infinite extension guides.
 *
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} cursor
 * @param {{ x: number, y: number } | null} origin
 * @param {{
 *   snapThreshold?: number,
 *   referenceAxes?: { xs?: number[], ys?: number[] },
 * }} [options]
 * @returns {{
 *   point: { x: number, y: number },
 *   kind: "ortho" | "close-ready" | "reference",
 *   guides: { x1: number, y1: number, x2: number, y2: number, emphasis?: boolean }[],
 * }}
 */
export function resolvePolygonOrthoSnap(prev, cursor, origin = null, options = {}) {
  const snapThreshold = Number.isFinite(options.snapThreshold) ? options.snapThreshold : 12;
  const ortho = orthogonalSnap(prev, cursor);
  const refXs = Array.isArray(options.referenceAxes?.xs) ? options.referenceAxes.xs : [];
  const refYs = Array.isArray(options.referenceAxes?.ys) ? options.referenceAxes.ys : [];

  const guides = [
    // Axis through last point (helps keep the current stroke aligned).
    { x1: prev.x - 1e6, y1: prev.y, x2: prev.x + 1e6, y2: prev.y },
    { x1: prev.x, y1: prev.y - 1e6, x2: prev.x, y2: prev.y + 1e6 },
  ];

  // Faint extensions through reference geometry (e.g. external wall corners).
  for (const x of refXs) {
    guides.push({ x1: x, y1: -1e6, x2: x, y2: 1e6 });
  }
  for (const y of refYs) {
    guides.push({ x1: -1e6, y1: y, x2: 1e6, y2: y });
  }

  if (!origin) {
    return applyReferenceAxisSnap(prev, ortho, guides, refXs, refYs, snapThreshold, "ortho");
  }

  // Origin crosshair — shows where a closing leg would need to land.
  guides.push(
    { x1: origin.x - 1e6, y1: origin.y, x2: origin.x + 1e6, y2: origin.y },
    { x1: origin.x, y1: origin.y - 1e6, x2: origin.x, y2: origin.y + 1e6 }
  );

  const closeTargets = [
    { x: origin.x, y: prev.y },
    { x: prev.x, y: origin.y },
  ].filter((target) => Math.hypot(target.x - prev.x, target.y - prev.y) > 1e-6);

  let best = null;
  let bestDist = Infinity;
  for (const target of closeTargets) {
    // Prefer when the orthographic cursor approaches the target, so lengthening
    // a side "into line" with the origin engages the snap.
    const distOrtho = Math.hypot(ortho.x - target.x, ortho.y - target.y);
    const distCursor = Math.hypot(cursor.x - target.x, cursor.y - target.y);
    const dist = Math.min(distOrtho, distCursor);
    if (dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }

  if (best && bestDist <= snapThreshold) {
    return {
      point: best,
      kind: "close-ready",
      guides: [
        ...guides,
        // Preview of the final closing leg back to the origin.
        {
          x1: best.x,
          y1: best.y,
          x2: origin.x,
          y2: origin.y,
          emphasis: true,
        },
      ],
    };
  }

  // Soft axis snap: if drawing horizontally, pull X onto origin.x when near;
  // if drawing vertically, pull Y onto origin.y when near.
  const aligned = { ...ortho };
  let kind = "ortho";
  if (Math.abs(ortho.y - prev.y) <= 1e-9 && Math.abs(ortho.x - origin.x) <= snapThreshold) {
    aligned.x = origin.x;
    kind = "close-ready";
  } else if (Math.abs(ortho.x - prev.x) <= 1e-9 && Math.abs(ortho.y - origin.y) <= snapThreshold) {
    aligned.y = origin.y;
    kind = "close-ready";
  }

  if (kind === "close-ready") {
    return {
      point: aligned,
      kind,
      guides: [
        ...guides,
        {
          x1: aligned.x,
          y1: aligned.y,
          x2: origin.x,
          y2: origin.y,
          emphasis: true,
        },
      ],
    };
  }

  return applyReferenceAxisSnap(prev, ortho, guides, refXs, refYs, snapThreshold, "ortho");
}

function applyReferenceAxisSnap(prev, ortho, guides, refXs, refYs, snapThreshold, baseKind) {
  const aligned = { ...ortho };
  let kind = baseKind;
  const extraGuides = [];

  // Horizontal stroke → soft-snap X onto a reference wall vertical.
  if (Math.abs(ortho.y - prev.y) <= 1e-9 && refXs.length) {
    let bestX = null;
    let bestDist = Infinity;
    for (const x of refXs) {
      const dist = Math.abs(ortho.x - x);
      if (dist < bestDist) {
        bestDist = dist;
        bestX = x;
      }
    }
    if (bestX != null && bestDist <= snapThreshold) {
      aligned.x = bestX;
      kind = "reference";
      extraGuides.push({
        x1: bestX,
        y1: -1e6,
        x2: bestX,
        y2: 1e6,
        emphasis: true,
      });
    }
  }

  // Vertical stroke → soft-snap Y onto a reference wall horizontal.
  if (Math.abs(ortho.x - prev.x) <= 1e-9 && refYs.length) {
    let bestY = null;
    let bestDist = Infinity;
    for (const y of refYs) {
      const dist = Math.abs(ortho.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestY = y;
      }
    }
    if (bestY != null && bestDist <= snapThreshold) {
      aligned.y = bestY;
      kind = "reference";
      extraGuides.push({
        x1: -1e6,
        y1: bestY,
        x2: 1e6,
        y2: bestY,
        emphasis: true,
      });
    }
  }

  return {
    point: aligned,
    kind,
    guides: [...guides, ...extraGuides],
  };
}

/**
 * Keep a dragged polygon node so both adjacent edges stay horizontal/vertical.
 * Valid positions are the two orthographic intersections with the neighbours.
 *
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} next
 * @param {{ x: number, y: number }} cursor
 * @returns {{ x: number, y: number }}
 */
export function resolveOrthoNodeDrag(prev, next, cursor) {
  if (!prev || !next || !cursor) return cursor;

  const candidates = [
    { x: prev.x, y: next.y },
    { x: next.x, y: prev.y },
  ];

  let best = candidates[0];
  let bestDist = Math.hypot(cursor.x - best.x, cursor.y - best.y);
  for (let i = 1; i < candidates.length; i += 1) {
    const dist = Math.hypot(cursor.x - candidates[i].x, cursor.y - candidates[i].y);
    if (dist < bestDist) {
      best = candidates[i];
      bestDist = dist;
    }
  }
  return best;
}

export { orthogonalSnap };
