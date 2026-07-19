import { orthogonalSnap } from "./floorPlanDefine3dDraw";

/**
 * Resolve an orthographic (H/V only) draw point for polygon tracing, with
 * guidelines and a special "close-ready" snap so the next segment can return
 * to the origin at 90°.
 *
 * Close-ready targets (from last point `prev`, origin `origin`):
 *   - { x: origin.x, y: prev.y }  → horizontal from prev, then vertical to origin
 *   - { x: prev.x, y: origin.y }  → vertical from prev, then horizontal to origin
 *
 * @param {{ x: number, y: number }} prev
 * @param {{ x: number, y: number }} cursor
 * @param {{ x: number, y: number } | null} origin
 * @param {{ snapThreshold?: number }} [options]
 * @returns {{
 *   point: { x: number, y: number },
 *   kind: "ortho" | "close-ready",
 *   guides: { x1: number, y1: number, x2: number, y2: number, emphasis?: boolean }[],
 * }}
 */
export function resolvePolygonOrthoSnap(prev, cursor, origin = null, options = {}) {
  const snapThreshold = Number.isFinite(options.snapThreshold) ? options.snapThreshold : 12;
  const ortho = orthogonalSnap(prev, cursor);

  const guides = [
    // Axis through last point (helps keep the current stroke aligned).
    { x1: prev.x - 1e6, y1: prev.y, x2: prev.x + 1e6, y2: prev.y },
    { x1: prev.x, y1: prev.y - 1e6, x2: prev.x, y2: prev.y + 1e6 },
  ];

  if (!origin) {
    return { point: ortho, kind: "ortho", guides };
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

  return { point: ortho, kind: "ortho", guides };
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
