const ISO_Y = 0.58;
const CAM = { x: 0.18, y: 1, z: 1.05 };
const TAPER_MIN = -0.95;
const TAPER_MAX = 0.95;
const TAPER_SCALE_MIN = 0.05;

export const DESIGNER_SHAPES_KEY = "sgf-sandpit-designer-shapes";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function taperAmountOf(cube, axis, end) {
  const key = axis === "h" ? (end === "a" ? "taperHA" : "taperHB") : end === "a" ? "taperVA" : "taperVB";
  if (cube && cube[key] != null && Number.isFinite(Number(cube[key]))) {
    return clamp(Number(cube[key]), TAPER_MIN, TAPER_MAX);
  }
  const shared = axis === "h" ? Number(cube?.taperH) || 0 : Number(cube?.taperV) || 0;
  const ends = axis === "h" ? cube?.taperHEnds : cube?.taperVEnds;
  const which =
    ends === "a" || ends === "b" || ends === "both"
      ? ends
      : cube?.taperEnds === "a" || cube?.taperEnds === "b"
        ? cube.taperEnds
        : "both";
  if (which === "both" || which === end) return clamp(shared, TAPER_MIN, TAPER_MAX);
  return 0;
}

export function taperPosOf(cube, which) {
  const raw = which === "h" ? cube?.taperHPos : cube?.taperVPos;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, 0.05, 0.95) : 0.5;
}

export function loadDesignerShapes() {
  try {
    const raw = JSON.parse(localStorage.getItem(DESIGNER_SHAPES_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((shape) => shape && shape.type === "cube" && shape.id);
  } catch {
    return [];
  }
}

export function saveDesignerShapes(shapes) {
  try {
    localStorage.setItem(DESIGNER_SHAPES_KEY, JSON.stringify(Array.isArray(shapes) ? shapes : []));
  } catch {
    /* ignore quota */
  }
}

function rotateXY(x, y, heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: x * c - y * s, y: x * s + y * c };
}

function projectPoint(x, y, z, heading) {
  const r = rotateXY(x, y, heading);
  return { x: r.x, y: r.y * ISO_Y - z * 1.05 };
}

function worldDot(nx, ny, nz, heading) {
  const w = rotateXY(nx, ny, heading);
  return w.x * CAM.x + w.y * CAM.y + nz * CAM.z;
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  if (lower.length) lower.pop();
  if (upper.length) upper.pop();
  return lower.concat(upper);
}

function profileAt(t, pos, start, peak, end) {
  const p = clamp(pos, 0.05, 0.95);
  if (t <= p) return start + (peak - start) * (t / p);
  return peak + (end - peak) * ((t - p) / (1 - p));
}

function uniqueTs(values) {
  const sorted = values.map((t) => clamp(t, 0, 1)).sort((a, b) => a - b);
  const out = [];
  sorted.forEach((t) => {
    if (!out.length || t - out[out.length - 1] > 0.012) out.push(t);
  });
  if (out[0] > 0) out.unshift(0);
  if (out[out.length - 1] < 1) out.push(1);
  return out;
}

function endScale(taper) {
  return clamp(1 - taper, TAPER_SCALE_MIN, 1 + TAPER_MAX);
}

function cubeStations(cube) {
  const l = Math.max(4, Number(cube.l) || 4);
  const w = Math.max(4, Number(cube.w) || 4);
  const h = Math.max(4, Number(cube.h) || 4);
  const ox = Number(cube.x) || 0;
  const oy = Number(cube.y) || 0;
  const oz = Number(cube.z) || 0;
  const hPos = taperPosOf(cube, "h");
  const vPos = taperPosOf(cube, "v");
  const ym = w / 2;
  const yA = ym * endScale(taperAmountOf(cube, "h", "a"));
  const yB = ym * endScale(taperAmountOf(cube, "h", "b"));
  const sizeA = h * endScale(taperAmountOf(cube, "v", "a"));
  const sizeB = h * endScale(taperAmountOf(cube, "v", "b"));
  return uniqueTs([0, hPos, vPos, 1]).map((t) => {
    const x = -l / 2 + l * t;
    const y = profileAt(t, hPos, yA, ym, yB);
    const size = profileAt(t, vPos, sizeA, h, sizeB);
    const z0 = (h - size) / 2;
    const z1 = z0 + size;
    return [
      { x: x + ox, y: -y + oy, z: z0 + oz },
      { x: x + ox, y: y + oy, z: z0 + oz },
      { x: x + ox, y: y + oy, z: z1 + oz },
      { x: x + ox, y: -y + oy, z: z1 + oz },
    ];
  });
}

function applyXf(pt, xf) {
  if (!xf) return pt;
  return {
    x: (pt.x - xf.cx) * xf.scale,
    y: (pt.y - xf.cy) * xf.scale,
    z: (pt.z - xf.z0) * xf.scale,
  };
}

function faceNormal(a, b, c) {
  const e1x = b.x - a.x;
  const e1y = b.y - a.y;
  const e1z = b.z - a.z;
  const e2x = c.x - a.x;
  const e2y = c.y - a.y;
  const e2z = c.z - a.z;
  const x = e1y * e2z - e1z * e2y;
  const y = e1z * e2x - e1x * e2z;
  const z = e1x * e2y - e1y * e2x;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function polyCentroid(pts) {
  return {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    z: pts.reduce((sum, p) => sum + p.z, 0) / pts.length,
  };
}

function cubeInsidePoint(cube) {
  const h = Math.max(4, Number(cube.h) || 4);
  return {
    x: Number(cube.x) || 0,
    y: Number(cube.y) || 0,
    z: (Number(cube.z) || 0) + h / 2,
  };
}

function makeOutwardFace(pts, inside) {
  if (pts.length < 3) return null;
  const n = faceNormal(pts[0], pts[1], pts[2]);
  const mid = polyCentroid(pts);
  const outward = (mid.x - inside.x) * n.x + (mid.y - inside.y) * n.y + (mid.z - inside.z) * n.z;
  if (outward >= 0) return { pts, n };
  return {
    pts: pts.slice().reverse(),
    n: { x: -n.x, y: -n.y, z: -n.z },
  };
}

function collectMeshFaces(cube) {
  const stations = cubeStations(cube);
  const inside = cubeInsidePoint(cube);
  const first = stations[0];
  const last = stations[stations.length - 1];
  const quads = [
    [first[0], first[3], first[2], first[1]],
    [last[0], last[1], last[2], last[3]],
  ];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = stations[i];
    const b = stations[i + 1];
    quads.push([a[3], b[3], b[2], a[2]]);
    quads.push([a[0], a[1], b[1], b[0]]);
    quads.push([a[1], a[2], b[2], b[1]]);
    quads.push([a[0], b[0], b[3], a[3]]);
  }
  return quads.map((pts) => makeOutwardFace(pts, inside)).filter(Boolean);
}

function screenArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}

function fillPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill("nonzero");
}

function strokePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function projectFace(face, heading) {
  const screen = face.pts.map((pt) => projectPoint(pt.x, pt.y, pt.z, heading));
  const depth =
    face.pts.reduce((sum, pt) => {
      const w = rotateXY(pt.x, pt.y, heading);
      return sum + w.y;
    }, 0) / face.pts.length;
  return {
    ...face,
    screen,
    depth,
    facing: worldDot(face.n.x, face.n.y, face.n.z, heading),
  };
}

function transformFace(face, xf) {
  if (!xf) return face;
  return { ...face, pts: face.pts.map((pt) => applyXf(pt, xf)) };
}

function visibleProjectedFaces(cube, heading, xf, minArea = 0.4) {
  return collectMeshFaces(cube)
    .map((face) => projectFace(transformFace(face, xf), heading))
    .filter((face) => face.facing > 0.004 && Math.abs(screenArea(face.screen)) > minArea);
}

function shapeIsConvex(cube) {
  const ha = taperAmountOf(cube, "h", "a");
  const hb = taperAmountOf(cube, "h", "b");
  const va = taperAmountOf(cube, "v", "a");
  const vb = taperAmountOf(cube, "v", "b");
  return !(ha < 0 && hb < 0) && !(va < 0 && vb < 0);
}

export function shapeHitDepth(cube, heading, px, py) {
  const hits = visibleProjectedFaces(cube, heading).filter((face) => pointInPoly(px, py, face.screen));
  if (!hits.length) return null;
  return Math.max(...hits.map((face) => face.depth));
}

function fillFace(ctx, screen) {
  if (screen.length >= 4) {
    fillPath(ctx, [screen[0], screen[1], screen[2]]);
    fillPath(ctx, [screen[0], screen[2], screen[3]]);
    return;
  }
  fillPath(ctx, screen);
}

function shade(hex, light) {
  const h = String(hex || "#3d7ad6").replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16) || 80;
  const g = Number.parseInt(h.slice(2, 4), 16) || 80;
  const b = Number.parseInt(h.slice(4, 6), 16) || 80;
  const t = clamp(light, 0.2, 1);
  return `rgb(${Math.round(r * t)},${Math.round(g * t)},${Math.round(b * t)})`;
}

export function rotateShapeXY(x, y, heading) {
  return rotateXY(x, y, heading);
}

export function projectShapePoint(x, y, z, heading) {
  return projectPoint(x, y, z, heading);
}

export function drawCubePreview(
  ctx,
  cube,
  heading,
  originX,
  originY,
  { selected = false, showLabels = false, fillHex = "#3d7ad6", strokeHex = "rgba(16, 28, 52, 0.88)", transform = null, minArea = 0.4, lineWidth } = {}
) {
  const xf = transform;
  const projected = visibleProjectedFaces(cube, heading, xf, minArea).sort((a, b) => a.depth - b.depth);
  const hull = convexHull(
    cubeStations(cube).flatMap((station) =>
      station.map((pt) => {
        const t = applyXf(pt, xf);
        return projectPoint(t.x, t.y, t.z, heading);
      })
    )
  );
  ctx.save();
  ctx.translate(originX, originY);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  if (shapeIsConvex(cube) && hull.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i += 1) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    ctx.fillStyle = shade(fillHex, 0.46);
    ctx.fill("nonzero");
  }

  projected.forEach((face) => {
    const nx = Math.abs(face.n.x);
    const ny = Math.abs(face.n.y);
    const nz = Math.abs(face.n.z);
    const lit = 0.42 + 0.58 * (nz * 0.7 + ny * 0.45 + nx * 0.25);
    ctx.fillStyle = shade(fillHex, lit);
    fillFace(ctx, face.screen);
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth != null ? lineWidth : selected ? 1.8 : 1.15;
    ctx.strokeStyle = selected ? "#1ec95a" : strokeHex;
    strokePath(ctx, face.screen);
  });

  if (showLabels) {
    const stations = cubeStations(cube).map((station) => station.map((pt) => applyXf(pt, xf)));
    const first = stations[0];
    const last = stations[stations.length - 1];
    const oz = applyXf({ x: Number(cube.x) || 0, y: Number(cube.y) || 0, z: Number(cube.z) || 0 }, xf).z;
    const labelA = projectPoint((first[0].x + first[1].x) / 2, (first[0].y + first[1].y) / 2, oz, heading);
    const labelB = projectPoint((last[0].x + last[1].x) / 2, (last[0].y + last[1].y) / 2, oz, heading);
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = selected ? "#146b32" : "rgba(20, 32, 64, 0.9)";
    ctx.fillText("A", labelA.x, labelA.y + 10);
    ctx.fillText("B", labelB.x, labelB.y + 10);
  }
  ctx.restore();
}

function shapesBounds(shapes) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  (shapes || []).forEach((cube) => {
    cubeStations(cube).forEach((station) => {
      station.forEach((pt) => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        minZ = Math.min(minZ, pt.z);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
        maxZ = Math.max(maxZ, pt.z);
      });
    });
  });
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function carTransformForShapes(shapes, length) {
  const bounds = shapesBounds(shapes);
  if (!bounds) return null;
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: (bounds.minY + bounds.maxY) / 2,
    z0: bounds.minZ,
    scale: length / 80,
  };
}

export function drawDesignedCar(ctx, shapes, heading, length, color = {}) {
  if (!shapes?.length) return false;
  const xf = carTransformForShapes(shapes, length);
  if (!xf) return false;
  const fillHex = "#3d7ad6";
  const strokeHex = "rgba(16, 28, 52, 0.88)";
  const minArea = 0.02;

  const shadowPts = [];
  shapes.forEach((cube) => {
    cubeStations(cube).forEach((station) => {
      station.forEach((pt) => {
        const t = applyXf({ x: pt.x, y: pt.y, z: xf.z0 }, xf);
        shadowPts.push(projectPoint(t.x, t.y, 0, heading));
      });
    });
  });
  const shadow = convexHull(shadowPts);
  if (shadow.length >= 3) {
    ctx.save();
    ctx.translate(length * 0.06, length * 0.1);
    ctx.beginPath();
    ctx.moveTo(shadow[0].x, shadow[0].y);
    for (let i = 1; i < shadow.length; i += 1) ctx.lineTo(shadow[i].x, shadow[i].y);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fill();
    ctx.restore();
  }

  const ordered = shapes.slice().sort((a, b) => {
    const da = rotateXY(((Number(a.x) || 0) - xf.cx) * xf.scale, ((Number(a.y) || 0) - xf.cy) * xf.scale, heading).y;
    const db = rotateXY(((Number(b.x) || 0) - xf.cx) * xf.scale, ((Number(b.y) || 0) - xf.cy) * xf.scale, heading).y;
    return da - db;
  });
  ordered.forEach((shape) => {
    drawCubePreview(ctx, shape, heading, 0, 0, {
      fillHex,
      strokeHex,
      transform: xf,
      minArea,
      lineWidth: Math.max(0.55, length * 0.018),
    });
  });
  return true;
}
