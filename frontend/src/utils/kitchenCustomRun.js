/**
 * Custom kitchen benches drawn along real wall faces (world metres).
 *
 * The open area is the inside of the external walls minus the walled rooms (bedrooms etc.).
 * Its boundary is traced into closed, axis-aligned wall loops walked clockwise on screen
 * (y down), so the open area is always on the right and `normal` points into it.
 * A bench is a stretch of one loop between two loop parameters, `depth` deep.
 */

const EPS = 1e-6;
const CORNER_SNAP_M = 0.15;

function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function uniqueSorted(values) {
  const out = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1] > EPS) out.push(v);
  }
  return out;
}

/**
 * @param inner  inside-face polygon of the external walls
 * @param blocks axis-aligned rects that are not open floor (walled rooms incl. their wall)
 */
export function buildWallLoops(inner, blocks = []) {
  if (!inner || inner.length < 3) return [];
  const xs = uniqueSorted([...inner.map((p) => p.x), ...blocks.flatMap((b) => [b.x, b.x + b.w])]);
  const ys = uniqueSorted([...inner.map((p) => p.y), ...blocks.flatMap((b) => [b.y, b.y + b.h])]);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  if (nx < 1 || ny < 1) return [];
  const free = [];
  for (let j = 0; j < ny; j += 1) {
    const row = [];
    const cy = (ys[j] + ys[j + 1]) / 2;
    for (let i = 0; i < nx; i += 1) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: cy };
      const blocked = blocks.some((b) => c.x > b.x && c.x < b.x + b.w && c.y > b.y && c.y < b.y + b.h);
      row.push(!blocked && pointInPoly(c, inner));
    }
    free.push(row);
  }
  const isFree = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && free[j][i];
  // Directed boundary edges keyed by start point; open area on the right of travel.
  const key = (x, y) => `${x.toFixed(6)},${y.toFixed(6)}`;
  const out = new Map();
  const add = (ax, ay, bx, by) => {
    const k = key(ax, ay);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  };
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (!free[j][i]) continue;
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const y0 = ys[j];
      const y1 = ys[j + 1];
      if (!isFree(i, j - 1)) add(x0, y0, x1, y0);
      if (!isFree(i + 1, j)) add(x1, y0, x1, y1);
      if (!isFree(i, j + 1)) add(x1, y1, x0, y1);
      if (!isFree(i - 1, j)) add(x0, y1, x0, y0);
    }
  }
  const loops = [];
  for (;;) {
    let startList = null;
    for (const list of out.values()) {
      if (list.length) {
        startList = list;
        break;
      }
    }
    if (!startList) break;
    const pts = [];
    let e = startList.pop();
    const first = key(e.a.x, e.a.y);
    for (let guard = 0; guard < 100000; guard += 1) {
      pts.push(e.a);
      const k = key(e.b.x, e.b.y);
      if (k === first) break;
      const list = out.get(k);
      if (!list?.length) break;
      // At a pinch point prefer the right turn so loops stay simple.
      let pick = 0;
      const dx = e.b.x - e.a.x;
      const dy = e.b.y - e.a.y;
      for (let n = 0; n < list.length; n += 1) {
        const ex = list[n].b.x - list[n].a.x;
        const ey = list[n].b.y - list[n].a.y;
        if (dx * ey - dy * ex > 0) pick = n;
      }
      e = list.splice(pick, 1)[0];
    }
    const loop = makeLoop(pts);
    if (loop) loops.push(loop);
  }
  return loops;
}

function makeLoop(rawPts) {
  // Merge collinear runs.
  const pts = [];
  const n = rawPts.length;
  for (let i = 0; i < n; i += 1) {
    const prev = rawPts[(i - 1 + n) % n];
    const cur = rawPts[i];
    const next = rawPts[(i + 1) % n];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (Math.abs(cross) > EPS) pts.push(cur);
  }
  if (pts.length < 4) return null;
  const edges = [];
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    edges.push({ a, b, len, dir, normal: { x: -dir.y, y: dir.x }, s0: s });
    s += len;
  }
  return { pts, edges, length: s };
}

function wrapParam(loop, s) {
  return ((s % loop.length) + loop.length) % loop.length;
}

function edgeAt(loop, s) {
  const t = wrapParam(loop, s);
  for (const e of loop.edges) if (t <= e.s0 + e.len + EPS) return e;
  return loop.edges[loop.edges.length - 1];
}

export function loopPointAt(loop, s) {
  const e = edgeAt(loop, s);
  const u = Math.max(0, Math.min(e.len, wrapParam(loop, s) - e.s0));
  return { point: { x: e.a.x + e.dir.x * u, y: e.a.y + e.dir.y * u }, normal: e.normal };
}

/** Nearest wall-face point to `p` across all loops. */
export function nearestOnLoops(loops, p) {
  let best = null;
  loops.forEach((loop, li) => {
    for (const e of loop.edges) {
      const u = Math.max(0, Math.min(e.len, (p.x - e.a.x) * e.dir.x + (p.y - e.a.y) * e.dir.y));
      const q = { x: e.a.x + e.dir.x * u, y: e.a.y + e.dir.y * u };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!best || d < best.dist) best = { loopIndex: li, s: e.s0 + u, dist: d, point: q, normal: e.normal };
    }
  });
  return best;
}

/** Nearest parameter on one loop, unwrapped to sit closest to `near`. */
export function nearestParamOnLoop(loop, p, near) {
  const hit = nearestOnLoops([loop], p);
  if (!hit) return near;
  return hit.s + Math.round((near - hit.s) / loop.length) * loop.length;
}

/** Snap to wall corners, else to `step` along the current wall. */
export function snapLoopParam(loop, s, step = 0.1) {
  const lap = Math.floor(s / loop.length) * loop.length;
  const t = s - lap;
  for (const e of loop.edges) {
    if (Math.abs(t - e.s0) <= CORNER_SNAP_M) return lap + e.s0;
    if (Math.abs(t - (e.s0 + e.len)) <= CORNER_SNAP_M) return lap + e.s0 + e.len;
  }
  const e = edgeAt(loop, t);
  const u = Math.round((t - e.s0) / step) * step;
  return lap + e.s0 + Math.max(0, Math.min(e.len, u));
}

/**
 * Bench along `loop` from parameter a to b (either order, unwrapped).
 * Returns pieces in drawing order, each an axis-aligned rect against one wall, plus one
 * outline polygon. Inside corners belong to the earlier piece; outside corners (wrapping
 * round a wall end) are filled by extending the earlier piece. `t0`/`t1` is the along-range
 * (world x or y) free for appliances.
 */
export function benchAlongLoop(loop, a, b, depth) {
  let s0 = Math.min(a, b);
  let s1 = Math.max(a, b);
  if (s1 - s0 < 0.05) return null;
  s1 = Math.min(s1, s0 + loop.length - 0.05);
  const shift = Math.floor(s0 / loop.length) * loop.length;
  s0 -= shift;
  s1 -= shift;
  const n = loop.edges.length;
  const pieces = [];
  for (let k = 0; k < n * 2 + 1; k += 1) {
    const e = loop.edges[k % n];
    const E0 = e.s0 + Math.floor(k / n) * loop.length;
    const E1 = E0 + e.len;
    const lo = Math.max(s0, E0);
    const hi = Math.min(s1, E1);
    if (hi - lo <= EPS) continue;
    pieces.push({ e, u0: lo - E0, u1: hi - E0, startJoined: lo <= E0 + EPS && s0 < E0 - EPS, endJoined: hi >= E1 - EPS && s1 > E1 + EPS });
  }
  const inside = (p, q) => p.e.dir.x * q.e.dir.y - p.e.dir.y * q.e.dir.x > 0;
  for (let i = 0; i < pieces.length; i += 1) {
    const p = pieces[i];
    p.startInside = p.startJoined && i > 0 && inside(pieces[i - 1], p);
    p.endInside = p.endJoined && i < pieces.length - 1 && inside(p, pieces[i + 1]);
    p.endOutside = p.endJoined && i < pieces.length - 1 && !p.endInside;
  }
  const last = pieces[pieces.length - 1];
  if (pieces.length > 1 && last.startInside && last.u1 <= depth + EPS) {
    pieces.pop();
    const prev = pieces[pieces.length - 1];
    prev.endJoined = false;
    prev.endInside = false;
    prev.endOutside = false;
  }
  if (!pieces.length) return null;
  const at = (e, u, v = 0) => ({
    x: e.a.x + e.dir.x * u + e.normal.x * v,
    y: e.a.y + e.dir.y * u + e.normal.y * v,
  });
  const round = (v) => Math.round(v * 10000) / 10000;
  const segs = pieces.map((p) => {
    const { e } = p;
    const r0 = p.startInside ? Math.min(p.u1, depth) : p.u0;
    const r1 = p.endOutside ? p.u1 + depth : p.u1;
    const c1 = at(e, r0, 0);
    const c2 = at(e, r1, depth);
    const rect = {
      x: round(Math.min(c1.x, c2.x)),
      y: round(Math.min(c1.y, c2.y)),
      w: round(Math.abs(c2.x - c1.x)),
      h: round(Math.abs(c2.y - c1.y)),
    };
    const alongX = Math.abs(e.dir.x) > 0.5;
    const useA = p.startInside ? Math.min(p.u1, p.u0 + depth) : p.u0;
    const useB = p.endInside ? Math.max(useA, p.u1 - depth) : p.u1;
    const ta = at(e, useA);
    const tb = at(e, useB);
    const wall =
      e.normal.y > 0.5 ? "minY" : e.normal.y < -0.5 ? "maxY" : e.normal.x > 0.5 ? "minX" : "maxX";
    return {
      rect,
      wall,
      alongX,
      dir: (alongX ? e.dir.x : e.dir.y) > 0 ? 1 : -1,
      t0: round(Math.min(alongX ? ta.x : ta.y, alongX ? tb.x : tb.y)),
      t1: round(Math.max(alongX ? ta.x : ta.y, alongX ? tb.x : tb.y)),
    };
  });
  const outer = [at(pieces[0].e, pieces[0].u0)];
  const innerPts = [at(pieces[0].e, pieces[0].u0, depth)];
  for (let i = 0; i < pieces.length; i += 1) {
    const p = pieces[i];
    const end = at(p.e, p.u1);
    outer.push(end);
    if (i < pieces.length - 1) {
      const q = pieces[i + 1];
      innerPts.push({
        x: end.x + (p.e.normal.x + q.e.normal.x) * depth,
        y: end.y + (p.e.normal.y + q.e.normal.y) * depth,
      });
    } else {
      innerPts.push(at(p.e, p.u1, depth));
    }
  }
  const poly = [...outer, ...innerPts.reverse()].map((q) => ({ x: round(q.x), y: round(q.y) }));
  return { segs: segs.filter((s) => s.rect.w > 0.01 && s.rect.h > 0.01), poly };
}
