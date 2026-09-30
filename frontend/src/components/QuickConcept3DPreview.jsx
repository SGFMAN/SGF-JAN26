import { useEffect, useRef } from "react";
import * as THREE from "three";

const WALL_H = 2.55;
const WALL_T = 0.1;
const LINE = 0x1a1a1a;
const PLAN_DOOR_W = 0.87;
const PLAN_DOOR_H = 2.1;
const BENCH_DEPTH_M = 0.6;
const BENCH_CARCASS_M = 0.58;
const BENCH_TOP_M = 0.04;
const BENCH_BAR_M = 0.9;
const BENCH_CLEAR_M = 0.9;
const BENCH_HEIGHT_M = 0.86;
const COOKTOP_M = 0.55;
const PANTRY_M = 0.6;
const PANTRY_H_M = 2.1;
const FRIDGE_ALONG_M = 1.0;
const FRIDGE_ACROSS_M = 0.75;
const FRIDGE_H_M = 1.8;
const SINK_ALONG_M = 1.155;
const SINK_ACROSS_M = 0.495;
const SINK_RIGHT_M = 0.05;
const BED_SHORT_M = 1.8;
const BED_LONG_M = 2.0;
const NIGHTSTAND_M = 0.4;
const NIGHTSTAND_GAP_M = 0.06;
const ROBE_DEPTH_M = 0.6;
const ROBE_WIDTH_DEFAULT_M = 1.6;
const ROBE_MIN_M = 1.2;
const ROBE_MAX_M = 1.8;
const ROBE_DOOR_T_M = 0.02;
const ROBE_NIB_T_M = 0.1;
const ROBE_H_M = 2.2;
const ROBE_DOOR_H_M = 2.05;
const HYBRID_PLANK_M = 0.15;
const HYBRID_GAP_M = 0.003;
const HYBRID_TONE_HEX = [0xdcc9a8, 0xd3be9c, 0xcdb792, 0xd7c3a2];
const ISO_AZIMUTH = Math.PI / 4;
const ISO_ELEVATION = Math.atan(1 / Math.sqrt(2));

function pointInPolygon(p, pts) {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const a = pts[i];
    const b = pts[j];
    const hit =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInRoom(p, room) {
  return p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h;
}

function roomKind(room) {
  if (room?.kind === "bathroom") return "bathroom";
  if (room?.kind === "powder") return "powder";
  if (room?.kind === "laundry") return "laundry";
  if (room?.kind === "kitchen") return "kitchen";
  if (room?.kind === "porch") return "porch";
  if (room?.kind === "living") return "living";
  return "bedroom";
}

/** Walled rooms only: porches and living furniture sets sit on/outside the open living floor. */
function interiorRooms(rooms) {
  return (rooms || []).filter((r) => roomKind(r) !== "porch" && roomKind(r) !== "living");
}

const COUCH_CUSHION_M = 0.8;
const COUCH_ARM_M = 0.1;
const COUCH_BACK_M = 0.15;
const COUCH_W_M = COUCH_CUSHION_M * 3 + COUCH_ARM_M * 2;
const COUCH_D_M = COUCH_CUSHION_M + COUCH_BACK_M;
const TV_UNIT_W_M = 1.8;
const TV_UNIT_D_M = 0.4;
const TV_W_M = 1.4;
const TV_D_M = 0.06;
const COFFEE_W_M = 1.2;
const COFFEE_D_M = 0.6;

function livingSetGeom3D(room) {
  const rot = roomRotation(room);
  const tvSide = rot === 90 ? "right" : rot === 180 ? "bottom" : rot === 270 ? "left" : "top";
  const frame = roomWallFrame(room, tvSide);
  const depth = tvSide === "left" || tvSide === "right" ? room.w : room.h;
  const c = frame.wallLen / 2;
  const box = (t0, t1, d0, d1) => wallBoxRect(frame.origin, frame.along, frame.inward, t0, t1, d0, d1);
  const type = ["2", "3", "L-right", "L-left"].includes(room?.couchType) ? room.couchType : "3";
  const isL = type === "L-right" || type === "L-left";
  const A = COUCH_ARM_M;
  const C = COUCH_CUSHION_M;
  const W = type === "2" ? A * 2 + C * 2 : isL ? A + C * 3 + COUCH_BACK_M : COUCH_W_M;
  const s0 = c - W / 2;
  const s1 = c + W / 2;
  const seatD0 = depth - COUCH_D_M;
  const seatD1 = depth - COUCH_BACK_M;
  const alongIsRight = frame.along.x * frame.inward.y - frame.along.y * frame.inward.x > 0;
  const lAtEnd = type === "L-right" ? alongIsRight : !alongIsRight;
  const tOf = (u) => (lAtEnd ? s0 + u : s1 - u);
  const ubox = (u0, u1, d0, d1) => box(tOf(u0), tOf(u1), d0, d1);
  let seats;
  let backs;
  let arms;
  let tableU;
  if (isL) {
    const retD0 = seatD0 - C - A;
    const cornerU = A + C * 2;
    seats = [ubox(A, A + C * 3, seatD0, seatD1), ubox(cornerU, cornerU + C, retD0 + A, seatD0)];
    backs = [ubox(0, W, seatD1, depth), ubox(W - COUCH_BACK_M, W, retD0, seatD1)];
    arms = [ubox(0, A, seatD0, seatD1), ubox(cornerU, cornerU + C, retD0, retD0 + A)];
    tableU = cornerU / 2;
  } else {
    seats = [ubox(A, W - A, seatD0, seatD1)];
    backs = [ubox(0, W, seatD1, depth)];
    arms = [ubox(0, A, seatD0, seatD1), ubox(W - A, W, seatD0, seatD1)];
    tableU = W / 2;
  }
  const tableMid = (TV_UNIT_D_M + seatD0) / 2;
  const tableT = tOf(tableU);
  return {
    tvUnit: box(c - TV_UNIT_W_M / 2, c + TV_UNIT_W_M / 2, 0, TV_UNIT_D_M),
    tv: box(c - TV_W_M / 2, c + TV_W_M / 2, 0.1, 0.1 + TV_D_M),
    table: box(
      tableT - COFFEE_W_M / 2,
      tableT + COFFEE_W_M / 2,
      tableMid - COFFEE_D_M / 2,
      tableMid + COFFEE_D_M / 2
    ),
    seats,
    backs,
    arms,
  };
}

function ringBounds(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts || []) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function projectedOrthoBounds(camera, object) {
  camera.updateMatrixWorld(true);
  object.updateWorldMatrix?.(true, true);
  object.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const inv = camera.matrixWorldInverse;
  const v = new THREE.Vector3();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const xs = [box.min.x, box.max.x];
  const ys = [box.min.y, box.max.y];
  const zs = [box.min.z, box.max.z];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        v.set(x, y, z).applyMatrix4(inv);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: Math.max(0.01, maxX - minX),
    height: Math.max(0.01, maxY - minY),
  };
}

function applyOrthoBounds(camera, bounds, aspect, padFrac = 0.04) {
  if (!bounds) return;
  const pad = 1 + Math.max(0, padFrac);
  let halfW = (bounds.width / 2) * pad;
  let halfH = (bounds.height / 2) * pad;
  if (aspect > 0) {
    const contentAspect = halfW / halfH;
    if (aspect > contentAspect) halfW = halfH * aspect;
    else halfH = halfW / aspect;
  }
  camera.left = bounds.cx - halfW;
  camera.right = bounds.cx + halfW;
  camera.top = bounds.cy + halfH;
  camera.bottom = bounds.cy - halfH;
  camera.updateProjectionMatrix();
}

function cropCanvasWhitespace(source, threshold = 248) {
  const w = source.width;
  const h = source.height;
  if (!(w > 1) || !(h > 1)) return source;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = pixels[i + 3];
      if (a < 8) continue;
      if (pixels[i] >= threshold && pixels[i + 1] >= threshold && pixels[i + 2] >= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return source;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw >= w - 1 && ch >= h - 1) return source;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const outCtx = out.getContext("2d");
  if (!outCtx) return source;
  outCtx.drawImage(source, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

function ringSignedArea(pts) {
  let sum = 0;
  for (let i = 0; i < (pts?.length || 0); i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

function inwardNormal(a, b, ring) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const nl = Math.hypot(dx, dy) || 1;
  const ccw = ringSignedArea(ring) >= 0;
  return {
    nx: (ccw ? -dy : dy) / nl,
    ny: (ccw ? dx : -dx) / nl,
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  };
}

function disposeObject(root) {
  root.traverse((child) => {
    child.geometry?.dispose?.();
    const mats = child.material;
    if (!mats) return;
    (Array.isArray(mats) ? mats : [mats]).forEach((m) => {
      if (m.userData?.shared) return;
      m.map?.dispose?.();
      m.dispose?.();
    });
  });
}

function addOutlined(parent, geometry, material, lineMat, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), lineMat);
  mesh.add(lines);
  parent.add(mesh);
  return mesh;
}

// One continuous wall (any length, any axis) with rectangular door openings
// cut out of it. Built as a single shape, so corners and junctions have no
// internal seam lines; only the real outer edges are outlined.
function addWallRun(parent, x0, z0, x1, z1, thickness, openings, fill, lineMat) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.04) return null;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(len, 0);
  shape.lineTo(len, WALL_H);
  shape.lineTo(0, WALL_H);
  shape.closePath();
  const holes = [];
  for (const o of openings || []) {
    const lo = Math.max(0, Math.min(o.lo, o.hi));
    const hi = Math.min(len, Math.max(o.lo, o.hi));
    if (hi - lo < 0.05) continue;
    const hole = new THREE.Path();
    hole.moveTo(lo, 0);
    hole.lineTo(hi, 0);
    hole.lineTo(hi, PLAN_DOOR_H);
    hole.lineTo(lo, PLAN_DOOR_H);
    hole.closePath();
    shape.holes.push(hole);
    holes.push({ lo, hi });
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  const mesh = addOutlined(parent, geo, fill, lineMat, x0, 0, z0, Math.atan2(-dz, dx));
  if (mesh) {
    mesh.userData.wallSeg = {
      ax: x0,
      az: z0,
      bx: x1,
      bz: z1,
      halfT: thickness / 2,
      y0: 0,
      y1: WALL_H,
    };
    mesh.userData.wallFrame = { ux, uz, px, pz, holes };
  }
  return mesh;
}

function addBox(parent, w, h, d, x, y, z, fill, lineMat, rotY = 0) {
  const bw = Math.max(0.04, Math.abs(w) || 0.04);
  const bh = Math.max(0.04, Math.abs(h) || 0.04);
  const bd = Math.max(0.04, Math.abs(d) || 0.04);
  return addOutlined(parent, new THREE.BoxGeometry(bw, bh, bd), fill, lineMat, x, y, z, rotY);
}

function roomRotation(room) {
  const n = ((Number(room?.rot) || 0) % 360 + 360) % 360;
  if (n === 90 || n === 180 || n === 270) return n;
  return 0;
}

function rotatedLocalRect(room, rect) {
  const rot = roomRotation(room);
  const uw = rot === 90 || rot === 270 ? room.h : room.w;
  const uh = rot === 90 || rot === 270 ? room.w : room.h;
  const cx = uw / 2;
  const cy = uh / 2;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ].map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    let rdx = dx;
    let rdy = dy;
    if (rot === 90) {
      rdx = -dy;
      rdy = dx;
    } else if (rot === 180) {
      rdx = -dx;
      rdy = -dy;
    } else if (rot === 270) {
      rdx = dy;
      rdy = -dx;
    }
    return { x: rdx, y: rdy };
  });
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: room.x + room.w / 2 + minX,
    y: room.y + room.h / 2 + minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

function kitchenLayoutKind(room) {
  const v = String(room?.kitchenLayout || "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (
    v === "cbar-right" ||
    v === "c-bar-right" ||
    v === "cshape-bar-right" ||
    v === "c-shape-bar-right" ||
    v === "wrap-c-right"
  ) {
    return "cbar-right";
  }
  if (
    v === "cbar-left" ||
    v === "c-bar-left" ||
    v === "cshape-bar-left" ||
    v === "c-shape-bar-left" ||
    v === "wrap-c-left"
  ) {
    return "cbar-left";
  }
  if (v === "cshape" || v === "c-shape" || v === "c" || v === "ushape" || v === "u-shape") {
    return "cshape";
  }
  if (
    v === "bar-right" ||
    v === "breakfast-right" ||
    v === "u-right" ||
    v === "wrap-right"
  ) {
    return "bar-right";
  }
  if (
    v === "bar-left" ||
    v === "breakfast-left" ||
    v === "u-left" ||
    v === "wrap-left" ||
    v === "bar" ||
    v === "breakfast"
  ) {
    return "bar-left";
  }
  if (v === "lshape-right" || v === "l-shape-right" || v === "l-right" || v === "lright") {
    return "lshape-right";
  }
  if (
    v === "lshape" ||
    v === "l-shape" ||
    v === "l" ||
    v === "lshape-left" ||
    v === "l-shape-left" ||
    v === "l-left" ||
    v === "lleft"
  ) {
    return "lshape-left";
  }
  if (v === "island") return "island";
  if (v === "custom") return "custom";
  return "galley";
}

/** Drawn custom bench pieces, stored in unrotated room-local metres. */
function customKitchenSegments3D(room) {
  const segs = room?.kitchenCustomBench?.segs;
  return Array.isArray(segs) ? segs : [];
}

function kitchenHasLeftReturn(kind) {
  return (
    kind === "lshape-left" ||
    kind === "bar-left" ||
    kind === "cshape" ||
    kind === "cbar-left" ||
    kind === "cbar-right"
  );
}

function kitchenHasRightReturn(kind) {
  return (
    kind === "lshape-right" ||
    kind === "bar-right" ||
    kind === "cshape" ||
    kind === "cbar-left" ||
    kind === "cbar-right"
  );
}

function kitchenHasWrap(kind) {
  return kind === "bar-left" || kind === "bar-right" || kind === "cbar-left" || kind === "cbar-right";
}

function kitchenWrapSide(kind) {
  return kind === "bar-right" || kind === "cbar-right" ? "right" : "left";
}

function roomLayoutLongIsX(room) {
  if (room?.layoutLongIsX === true) return true;
  if (room?.layoutLongIsX === false) return false;
  const rot = roomRotation(room);
  const w = rot === 90 || rot === 270 ? room.h : room.w;
  const h = rot === 90 || rot === 270 ? room.w : room.h;
  return w >= h;
}

function kitchenAlongLen(w, h, longIsX) {
  return longIsX ? w : h;
}

function defaultKitchenRun(along, kind, side, longIsX) {
  const min = 0.9;
  const half = Math.max(min, along * 0.5);
  if (kind === "island") {
    const t0 = Math.max(0, (along - half) / 2);
    return { t0, t1: Math.min(along, t0 + half) };
  }
  const fromStart = (longIsX && side === "left") || (!longIsX && side === "right");
  if (fromStart) return { t0: 0, t1: Math.min(along, half) };
  return { t0: Math.max(0, along - half), t1: along };
}

function kitchenRunRange(room, w, h, longIsX, kind, side) {
  const along = kitchenAlongLen(w, h, longIsX);
  const min = 0.9;
  const stored0 = Number(room?.kitchenRun0);
  const stored1 = Number(room?.kitchenRun1);
  let t0;
  let t1;
  if (Number.isFinite(stored0) && Number.isFinite(stored1) && stored1 - stored0 >= min - 1e-6) {
    t0 = stored0;
    t1 = stored1;
  } else {
    const d = defaultKitchenRun(along, kind, side, longIsX);
    t0 = d.t0;
    t1 = d.t1;
  }
  t0 = Math.max(0, Math.min(t0, along - min));
  t1 = Math.max(t0 + min, Math.min(along, t1));
  return { t0, t1, along };
}

function kitchenWorkBenches(room) {
  const rot = roomRotation(room);
  const w = rot === 90 || rot === 270 ? room.h : room.w;
  const h = rot === 90 || rot === 270 ? room.w : room.h;
  const depth = BENCH_DEPTH_M;
  const barDepth = BENCH_BAR_M;
  const longIsX = roomLayoutLongIsX(room);
  const kind = kitchenLayoutKind(room);
  if (kind === "custom") {
    return customKitchenSegments3D(room).map((s, i) => ({
      id: `c${i}`,
      group: "run",
      alongAxis: s.alongX ? "x" : "y",
      wall: s.wall === "minX" || s.wall === "minY" ? "min" : "max",
      ...s.rect,
      along0: s.t0,
      along1: s.t1,
    }));
  }
  const barFits = longIsX
    ? h >= depth + barDepth + BENCH_CLEAR_M
    : w >= depth + barDepth + BENCH_CLEAR_M;
  const benches = [];
  const main = longIsX
    ? { id: "main", group: "run", alongAxis: "x", wall: "max", x: 0, y: h - depth, w, h: depth, along0: 0, along1: w }
    : { id: "main", group: "run", alongAxis: "y", wall: "min", x: 0, y: 0, w: depth, h, along0: 0, along1: h };
  benches.push(main);
  if (kitchenHasLeftReturn(kind)) {
    if (longIsX) {
      benches.push({
        id: kitchenHasRightReturn(kind) ? "return-left" : "return",
        group: "run",
        alongAxis: "y",
        wall: "min",
        x: 0,
        y: 0,
        w: depth,
        h: Math.max(0, h - depth),
        along0: 0,
        along1: Math.max(0, h - depth),
      });
    } else {
      benches.push({
        id: kitchenHasRightReturn(kind) ? "return-left" : "return",
        group: "run",
        alongAxis: "x",
        wall: "max",
        x: depth,
        y: h - depth,
        w: Math.max(0, w - depth),
        h: depth,
        along0: depth,
        along1: w,
      });
    }
  }
  if (kitchenHasRightReturn(kind)) {
    if (longIsX) {
      benches.push({
        id: kitchenHasLeftReturn(kind) ? "return-right" : "return",
        group: "run",
        alongAxis: "y",
        wall: "max",
        x: w - depth,
        y: 0,
        w: depth,
        h: Math.max(0, h - depth),
        along0: 0,
        along1: Math.max(0, h - depth),
      });
    } else {
      benches.push({
        id: kitchenHasLeftReturn(kind) ? "return-right" : "return",
        group: "run",
        alongAxis: "x",
        wall: "min",
        x: depth,
        y: 0,
        w: Math.max(0, w - depth),
        h: depth,
        along0: depth,
        along1: w,
      });
    }
  }
  if (kitchenHasWrap(kind) && barFits) {
    const run = kitchenRunRange(room, w, h, longIsX, kind, kitchenWrapSide(kind));
    if (longIsX) {
      benches.push({
        id: "bar",
        group: "bar",
        alongAxis: "x",
        wall: "min",
        x: run.t0,
        y: 0,
        w: Math.max(0.01, run.t1 - run.t0),
        h: barDepth,
        along0: run.t0,
        along1: run.t1,
      });
    } else {
      benches.push({
        id: "bar",
        group: "bar",
        alongAxis: "y",
        wall: "max",
        x: w - barDepth,
        y: run.t0,
        w: barDepth,
        h: Math.max(0.01, run.t1 - run.t0),
        along0: run.t0,
        along1: run.t1,
      });
    }
  }
  if (kind === "island") {
    const run = kitchenRunRange(room, w, h, longIsX, kind, "left");
    if (longIsX) {
      const y = Math.max(0, h - depth - BENCH_CLEAR_M - depth);
      benches.push({
        id: "island",
        group: "island",
        alongAxis: "x",
        wall: "min",
        x: run.t0,
        y,
        w: Math.max(0.01, run.t1 - run.t0),
        h: depth,
        along0: run.t0,
        along1: run.t1,
      });
    } else {
      const x = Math.min(w - depth, depth + BENCH_CLEAR_M);
      benches.push({
        id: "island",
        group: "island",
        alongAxis: "y",
        wall: "max",
        x,
        y: run.t0,
        w: depth,
        h: Math.max(0.01, run.t1 - run.t0),
        along0: run.t0,
        along1: run.t1,
      });
    }
  }
  return benches.filter((b) => b.along1 - b.along0 >= 0.2);
}

function cookLocalOnBench(bench, along) {
  const half = COOKTOP_M / 2;
  const t = Math.max(bench.along0 + half, Math.min(bench.along1 - half, along));
  if (bench.alongAxis === "x") {
    return { x: t - half, y: bench.y + (bench.h - COOKTOP_M) / 2, w: COOKTOP_M, h: COOKTOP_M };
  }
  return { x: bench.x + (bench.w - COOKTOP_M) / 2, y: t - half, w: COOKTOP_M, h: COOKTOP_M };
}

function pantryLocalOnBench(bench, along) {
  const size = PANTRY_M;
  const work = BENCH_DEPTH_M;
  const pad = (work - size) / 2;
  if (bench.alongAxis === "x") {
    const y = bench.wall === "max" ? bench.y + bench.h - pad - size : bench.y + pad;
    return { x: along, y, w: size, h: size };
  }
  const x = bench.wall === "min" ? bench.x + pad : bench.x + bench.w - pad - size;
  return { x, y: along, w: size, h: size };
}

function fridgeLocalOnBench(bench, along) {
  const a = FRIDGE_ALONG_M;
  const d = FRIDGE_ACROSS_M;
  const work = BENCH_DEPTH_M;
  const extra = d - work;
  if (bench.alongAxis === "x") {
    if (bench.wall === "max") return { x: along, y: bench.y - extra, w: a, h: d };
    return { x: along, y: bench.y + bench.h - work, w: a, h: d };
  }
  if (bench.wall === "min") return { x: bench.x + bench.w - work, y: along, w: d, h: a };
  return { x: bench.x - extra, y: along, w: d, h: a };
}

function sinkRectOnBench(bench, along) {
  const half = SINK_ALONG_M / 2;
  const t = Math.max(bench.along0 + half, Math.min(bench.along1 - half, along));
  const inset = (BENCH_DEPTH_M - SINK_ACROSS_M) / 2;
  if (bench.alongAxis === "x") {
    if (bench.wall === "min") {
      const front = bench.y + bench.h - inset;
      const x = Math.max(bench.along0, Math.min(bench.along1 - SINK_ALONG_M, t - half + SINK_RIGHT_M));
      return { x, y: front - SINK_ACROSS_M, w: SINK_ALONG_M, h: SINK_ACROSS_M };
    }
    const front = bench.y + inset;
    const x = Math.max(bench.along0, Math.min(bench.along1 - SINK_ALONG_M, t - half + SINK_RIGHT_M));
    return { x, y: front, w: SINK_ALONG_M, h: SINK_ACROSS_M };
  }
  if (bench.wall === "min") {
    const front = bench.x + bench.w - inset;
    const x = Math.max(bench.x, Math.min(bench.x + bench.w - SINK_ACROSS_M, front - SINK_ACROSS_M));
    const y = Math.max(bench.along0, Math.min(bench.along1 - SINK_ALONG_M, t - half + SINK_RIGHT_M));
    return { x, y, w: SINK_ACROSS_M, h: SINK_ALONG_M };
  }
  const front = bench.x + inset;
  const x = Math.max(bench.x, Math.min(bench.x + bench.w - SINK_ACROSS_M, front));
  const y = Math.max(bench.along0, Math.min(bench.along1 - SINK_ALONG_M, t - half + SINK_RIGHT_M));
  return { x, y, w: SINK_ACROSS_M, h: SINK_ALONG_M };
}

function resolveKitchenAppliance(room, type) {
  const benches = kitchenWorkBenches(room);
  if (!benches.length) return null;
  const main = benches.find((b) => b.id === "main") || benches[0];
  const fieldB =
    type === "cook" ? "cookBench" : type === "pantry" ? "pantryBench" : type === "fridge" ? "fridgeBench" : "sinkBench";
  const fieldA =
    type === "cook" ? "cookAlong" : type === "pantry" ? "pantryAlong" : type === "fridge" ? "fridgeAlong" : "sinkAlong";
  const storedB = String(room?.[fieldB] || "");
  const storedA = Number(room?.[fieldA]);
  let bench = benches.find((b) => b.id === storedB) || null;
  if (bench && Number.isFinite(storedA)) return { bench, along: storedA };
  if (type === "cook") {
    return { bench: main, along: main.along0 + 0.2 + COOKTOP_M / 2 };
  }
  if (type === "pantry") {
    return { bench: main, along: Math.max(main.along0, main.along1 - PANTRY_M) };
  }
  if (type === "fridge") {
    return { bench: main, along: main.along0 };
  }
  const cook = resolveKitchenAppliance(room, "cook");
  if (cook && cook.bench.id === main.id) {
    const after = cook.along + COOKTOP_M / 2 + 0.25 + SINK_ALONG_M / 2;
    if (after + SINK_ALONG_M / 2 <= main.along1) return { bench: main, along: after };
  }
  return { bench: main, along: main.along0 + 0.2 + SINK_ALONG_M / 2 };
}

function kitchenCookRect(room) {
  const placed = resolveKitchenAppliance(room, "cook");
  if (!placed) return { x: room.x, y: room.y, w: COOKTOP_M, h: COOKTOP_M };
  return rotatedLocalRect(room, cookLocalOnBench(placed.bench, placed.along));
}

function kitchenSinkRect(room) {
  const placed = resolveKitchenAppliance(room, "sink");
  if (!placed) return { x: room.x, y: room.y, w: SINK_ALONG_M, h: SINK_ACROSS_M };
  return rotatedLocalRect(room, sinkRectOnBench(placed.bench, placed.along));
}

function kitchenPantryRect(room) {
  const placed = resolveKitchenAppliance(room, "pantry");
  if (!placed) return { x: room.x, y: room.y, w: PANTRY_M, h: PANTRY_M };
  return rotatedLocalRect(room, pantryLocalOnBench(placed.bench, placed.along));
}

function kitchenFridgeRect(room) {
  const placed = resolveKitchenAppliance(room, "fridge");
  if (!placed) return { x: room.x, y: room.y, w: FRIDGE_ACROSS_M, h: FRIDGE_ALONG_M };
  return rotatedLocalRect(room, fridgeLocalOnBench(placed.bench, placed.along));
}

// Bench footprint with the fridge and pantry spans removed: those units
// stand on the floor, so no bench shows under them in 3D.
function kitchenBenchPieces(room) {
  const pieces = [];
  const units = [];
  for (const type of ["fridge", "pantry"]) {
    const placed = resolveKitchenAppliance(room, type);
    if (!placed) continue;
    const size = type === "fridge" ? FRIDGE_ALONG_M : PANTRY_M;
    units.push({ id: placed.bench.id, t0: placed.along, t1: placed.along + size });
  }
  for (const bench of kitchenWorkBenches(room)) {
    const cuts = units
      .filter((u) => u.id === bench.id)
      .sort((a, b) => a.t0 - b.t0);
    let cursor = bench.along0;
    for (const cut of cuts) {
      const lo = Math.max(cursor, cut.t0);
      const hi = Math.min(bench.along1, cut.t1);
      if (lo - cursor > 0.02) pieces.push({ ...bench, along0: cursor, along1: lo });
      cursor = Math.max(cursor, hi);
    }
    if (bench.along1 - cursor > 0.02) pieces.push({ ...bench, along0: cursor, along1: bench.along1 });
  }
  return pieces.map((b) =>
    b.alongAxis === "x"
      ? rotatedLocalRect(room, { x: b.along0, y: b.y, w: b.along1 - b.along0, h: b.h })
      : rotatedLocalRect(room, { x: b.x, y: b.along0, w: b.w, h: b.along1 - b.along0 })
  );
}

function pointOnSeg(p, a, b, eps = 0.08) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y) <= eps;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / (len * len);
  if (t < -0.02 || t > 1.02) return false;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + abx * clamped), p.y - (a.y + aby * clamped)) <= eps;
}

function doorOnEdge(door, a, b) {
  return door?.hinge && door?.closed && pointOnSeg(door.hinge, a, b) && pointOnSeg(door.closed, a, b);
}

// One white 4-panel internal door leaf, 50% open, hinged at the design hinge
// and swinging into the room. Built as a single shape so the panel recesses
// are part of the door, not boxes stacked on it.
function addDoorLeaf(parent, door, cx, cz, mats) {
  if (!door?.hinge || !door?.open) return;
  const width = Math.max(0.2, door.doorWidth || PLAN_DOOR_W);
  const hx = door.hinge.x - cx;
  const hz = door.hinge.y - cz;
  let dx = door.open.x - door.hinge.x;
  let dz = door.open.y - door.hinge.y;
  if (door.closed) {
    const lo = Math.hypot(dx, dz);
    const cdx = door.closed.x - door.hinge.x;
    const cdz = door.closed.y - door.hinge.y;
    const lc = Math.hypot(cdx, cdz);
    if (lo > 1e-6 && lc > 1e-6) {
      dx = dx / lo + cdx / lc;
      dz = dz / lo + cdz / lc;
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) {
        dx /= l;
        dz /= l;
      } else {
        dx = (door.open.x - door.hinge.x) / lo;
        dz = (door.open.y - door.hinge.y) / lo;
      }
    }
  }
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  const rotY = Math.atan2(-uz, ux);
  if (door.external) {
    addBox(
      parent,
      width,
      PLAN_DOOR_H,
      0.04,
      hx + ux * (width / 2),
      PLAN_DOOR_H / 2,
      hz + uz * (width / 2),
      mats.timber,
      mats.line,
      rotY
    );
    return;
  }
  const t = 0.04;
  const inset = 0.09;
  const gap = 0.06;
  const rail = 0.16;
  const panelW = (width - inset * 2 - gap) / 2;
  const topH = (PLAN_DOOR_H - rail * 3 - gap) * 0.58;
  const botH = (PLAN_DOOR_H - rail * 3 - gap) * 0.42;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, PLAN_DOOR_H);
  shape.lineTo(0, PLAN_DOOR_H);
  shape.closePath();
  const panel = (x0, y0, pw, ph) => {
    const hole = new THREE.Path();
    hole.moveTo(x0, y0);
    hole.lineTo(x0 + pw, y0);
    hole.lineTo(x0 + pw, y0 + ph);
    hole.lineTo(x0, y0 + ph);
    hole.closePath();
    shape.holes.push(hole);
  };
  const xs = [inset, inset + panelW + gap];
  for (const x of xs) {
    panel(x, rail, panelW, botH);
    panel(x, rail * 2 + botH, panelW, topH);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  const mesh = addOutlined(parent, geo, mats.fill, mats.line, hx, 0, hz, rotY);
  if (mesh) mesh.userData.doorLeaf = true;
}

function addOuterEdge(parent, a, b, doors, cx, cz, nx, ny, mats) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.04) return null;
  const ux = dx / len;
  const uy = dy / len;
  const hits = (doors || [])
    .filter((d) => d.external && doorOnEdge(d, a, b))
    .map((door) => {
      const t0 = (door.hinge.x - a.x) * ux + (door.hinge.y - a.y) * uy;
      const t1 = (door.closed.x - a.x) * ux + (door.closed.y - a.y) * uy;
      return { lo: Math.min(t0, t1), hi: Math.max(t0, t1), door };
    })
    .sort((p, q) => p.lo - q.lo);
  // External wall body sits on the inside of the boundary line.
  let px = -uy;
  let pz = ux;
  if (px * nx + pz * ny < 0) {
    px = -px;
    pz = -pz;
  }
  const mesh = addWallRun(
    parent,
    a.x - cx + px * (WALL_T / 2),
    a.y - cz + pz * (WALL_T / 2),
    b.x - cx + px * (WALL_T / 2),
    b.y - cz + pz * (WALL_T / 2),
    WALL_T,
    hits,
    mats.wall,
    mats.line
  );
  for (const hit of hits) addDoorLeaf(parent, hit.door, cx, cz, mats);
  return mesh ? [mesh] : [];
}

// Internal partition walls: collinear segments are joined into one continuous
// run first, then each design door is cut as a real opening in that run.
function addPartitionWalls(parent, walls, doors, cx, cz, mats, drawnDoors) {
  const groups = new Map();
  for (const w of walls || []) {
    const horiz = w.axis === "h";
    const fixed = Math.round((horiz ? w.y : w.x) * 1000);
    const key = `${horiz ? "h" : "v"}:${fixed}`;
    if (!groups.has(key)) groups.set(key, { horiz, fixed: horiz ? w.y : w.x, spans: [] });
    groups.get(key).spans.push([Math.min(w.t0, w.t1), Math.max(w.t0, w.t1)]);
  }
  for (const g of groups.values()) {
    const spans = g.spans.slice().sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of spans) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + 0.02) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    for (const [t0, t1] of merged) {
      const a = g.horiz ? { x: t0, y: g.fixed } : { x: g.fixed, y: t0 };
      const b = g.horiz ? { x: t1, y: g.fixed } : { x: g.fixed, y: t1 };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const hits = (doors || [])
        .filter((d) => !d.external && doorOnEdge(d, a, b))
        .map((door) => {
          const s0 = (door.hinge.x - a.x) * ux + (door.hinge.y - a.y) * uy;
          const s1 = (door.closed.x - a.x) * ux + (door.closed.y - a.y) * uy;
          return { lo: Math.min(s0, s1), hi: Math.max(s0, s1), door };
        })
        .sort((p, q) => p.lo - q.lo);
      addWallRun(
        parent,
        a.x - cx,
        a.y - cz,
        b.x - cx,
        b.y - cz,
        WALL_T,
        hits,
        mats.wall,
        mats.line
      );
      for (const hit of hits) {
        addDoorLeaf(parent, hit.door, cx, cz, mats);
        drawnDoors?.add(hit.door);
      }
    }
  }
}

// Hide outline segments buried inside a neighbouring wall (T/X junctions,
// corners, door-header ends) so joins read clean. Genuine outlines are never
// strictly inside another wall body, so they survive.
function cleanWallJoins(group) {
  const segs = [];
  group.traverse((o) => {
    if (o.isMesh && o.userData.wallSeg) segs.push({ mesh: o, seg: o.userData.wallSeg });
  });
  if (segs.length < 2) return;
  group.updateMatrixWorld(true);
  const TOL = 0.11;
  const v = new THREE.Vector3();
  const buriedIn = (x, y, z, self) => {
    for (const o of segs) {
      if (o.mesh === self) continue;
      const s = o.seg;
      if (y <= s.y0 + 0.003 || y >= s.y1 - 0.003) continue;
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const L2 = dx * dx + dz * dz;
      if (!(L2 > 1e-9)) continue;
      let t = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = s.ax + dx * t - x;
      const ez = s.az + dz * t - z;
      const r = s.halfT + TOL;
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  };
  for (const { mesh } of segs) {
    for (const child of mesh.children) {
      if (!child.isLineSegments) continue;
      const attr = child.geometry?.getAttribute("position");
      if (!attr) continue;
      const src = attr.array;
      const kept = new Float32Array(src.length);
      let n = 0;
      for (let i = 0; i + 5 < src.length; i += 6) {
        v.set(
          (src[i] + src[i + 3]) / 2,
          (src[i + 1] + src[i + 4]) / 2,
          (src[i + 2] + src[i + 5]) / 2
        ).applyMatrix4(mesh.matrixWorld);
        if (buriedIn(v.x, v.y, v.z, mesh)) continue;
        kept[n++] = src[i];
        kept[n++] = src[i + 1];
        kept[n++] = src[i + 2];
        kept[n++] = src[i + 3];
        kept[n++] = src[i + 4];
        kept[n++] = src[i + 5];
      }
      if (n === src.length) continue;
      child.geometry.dispose();
      const next = new THREE.BufferGeometry();
      next.setAttribute("position", new THREE.BufferAttribute(kept.slice(0, n), 3));
      child.geometry = next;
    }
  }
}

function addThinBox(parent, w, h, d, x, y, z, fill, lineMat, rotY = 0) {
  return addOutlined(
    parent,
    new THREE.BoxGeometry(
      Math.max(0.008, Math.abs(w) || 0.008),
      Math.max(0.008, Math.abs(h) || 0.008),
      Math.max(0.008, Math.abs(d) || 0.008)
    ),
    fill,
    lineMat,
    x,
    y,
    z,
    rotY
  );
}

function addWorldRectThin(parent, rect, height, yCenter, fill, lineMat, cx, cz) {
  if (!rect || !(rect.w > 0.004) || !(rect.h > 0.004)) return;
  addThinBox(
    parent,
    rect.w,
    height,
    rect.h,
    rect.x - cx + rect.w / 2,
    yCenter,
    rect.y - cz + rect.h / 2,
    fill,
    lineMat
  );
}

function robeGeom3D(room) {
  const side =
    room?.robeSide === "top" ||
    room?.robeSide === "right" ||
    room?.robeSide === "bottom" ||
    room?.robeSide === "left"
      ? room.robeSide
      : room.w >= room.h
        ? "left"
        : "bottom";
  const frame = roomWallFrame(room, side);
  const robeWidth = Math.max(
    Math.min(ROBE_MIN_M, frame.wallLen),
    Math.min(
      ROBE_MAX_M,
      frame.wallLen,
      Number(room?.robeWidth) > 0 ? Number(room.robeWidth) : ROBE_WIDTH_DEFAULT_M
    )
  );
  const maxAlong = Math.max(0, frame.wallLen - robeWidth);
  const stored = Number(room?.robeAlong);
  const alongM = Number.isFinite(stored) ? Math.max(0, Math.min(maxAlong, stored)) : maxAlong;
  const anchor = {
    x: frame.origin.x + frame.along.x * alongM,
    y: frame.origin.y + frame.along.y * alongM,
  };
  const againstTol = WALL_T + 0.02;
  const leaf = Math.max(0.2, robeWidth * 0.55);
  const front = ROBE_DEPTH_M;
  const t = ROBE_DOOR_T_M;
  const nibs = [];
  if (alongM > againstTol) {
    nibs.push(wallBoxRect(anchor, frame.along, frame.inward, -ROBE_NIB_T_M, 0, 0, ROBE_DEPTH_M));
  }
  if (alongM + robeWidth < frame.wallLen - againstTol) {
    nibs.push(
      wallBoxRect(anchor, frame.along, frame.inward, robeWidth, robeWidth + ROBE_NIB_T_M, 0, ROBE_DEPTH_M)
    );
  }
  return {
    rect: wallBoxRect(anchor, frame.along, frame.inward, 0, robeWidth, 0, ROBE_DEPTH_M),
    nibs,
    doors: [
      wallBoxRect(anchor, frame.along, frame.inward, 0, leaf, front - t * 2, front - t),
      wallBoxRect(anchor, frame.along, frame.inward, robeWidth - leaf, robeWidth, front - t, front),
    ],
  };
}

function addWorldRect(parent, rect, height, yCenter, fill, lineMat, cx, cz) {
  if (!rect || !(rect.w > 0.04) || !(rect.h > 0.04)) return;
  addBox(
    parent,
    rect.w,
    height,
    rect.h,
    rect.x - cx + rect.w / 2,
    yCenter,
    rect.y - cz + rect.h / 2,
    fill,
    lineMat
  );
}

function roomWallFrame(room, side) {
  const x0 = room.x;
  const y0 = room.y;
  const x1 = room.x + room.w;
  const y1 = room.y + room.h;
  if (side === "top") {
    return { along: { x: 1, y: 0 }, inward: { x: 0, y: 1 }, wallLen: room.w, origin: { x: x0, y: y0 } };
  }
  if (side === "right") {
    return { along: { x: 0, y: 1 }, inward: { x: -1, y: 0 }, wallLen: room.h, origin: { x: x1, y: y0 } };
  }
  if (side === "bottom") {
    return { along: { x: 1, y: 0 }, inward: { x: 0, y: -1 }, wallLen: room.w, origin: { x: x0, y: y1 } };
  }
  return { along: { x: 0, y: 1 }, inward: { x: 1, y: 0 }, wallLen: room.h, origin: { x: x0, y: y0 } };
}

function wallBoxRect(origin, along, inward, t0, t1, d0, d1) {
  const pts = [
    { x: origin.x + along.x * t0 + inward.x * d0, y: origin.y + along.y * t0 + inward.y * d0 },
    { x: origin.x + along.x * t1 + inward.x * d0, y: origin.y + along.y * t1 + inward.y * d0 },
    { x: origin.x + along.x * t1 + inward.x * d1, y: origin.y + along.y * t1 + inward.y * d1 },
    { x: origin.x + along.x * t0 + inward.x * d1, y: origin.y + along.y * t0 + inward.y * d1 },
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function clampBedAlong(wallLen, along) {
  const alongLen = BED_SHORT_M;
  const sidePad = NIGHTSTAND_M + NIGHTSTAND_GAP_M;
  const maxAlong = Math.max(0, wallLen - alongLen);
  const paddedMin = sidePad;
  const paddedMax = wallLen - alongLen - sidePad;
  if (paddedMax >= paddedMin) {
    const raw = Number.isFinite(along) ? along : (paddedMin + paddedMax) / 2;
    return Math.max(paddedMin, Math.min(paddedMax, raw));
  }
  return maxAlong / 2;
}

function bedroomBedGroup(room) {
  const stored = room?.bedSide;
  const bedSide =
    stored === "top" || stored === "right" || stored === "bottom" || stored === "left"
      ? stored
      : room.w >= room.h
        ? "top"
        : "left";
  const frame = roomWallFrame(room, bedSide);
  const alongLen = BED_SHORT_M;
  const depth = BED_LONG_M;
  const storedAlong = Number(room?.bedAlong);
  const alongM = clampBedAlong(
    frame.wallLen,
    Number.isFinite(storedAlong) ? storedAlong : (frame.wallLen - alongLen) / 2
  );
  const { origin, along, inward } = frame;
  const bed = wallBoxRect(origin, along, inward, alongM, alongM + alongLen, 0, depth);
  const rug = wallBoxRect(
    origin,
    along,
    inward,
    alongM - 0.24,
    alongM + alongLen + 0.24,
    0,
    depth + 0.28
  );
  const nsSize = NIGHTSTAND_M;
  const nsGap = NIGHTSTAND_GAP_M;
  const nightstands = [
    wallBoxRect(origin, along, inward, alongM - nsGap - nsSize, alongM - nsGap, 0.02, 0.02 + nsSize),
    wallBoxRect(
      origin,
      along,
      inward,
      alongM + alongLen + nsGap,
      alongM + alongLen + nsGap + nsSize,
      0.02,
      0.02 + nsSize
    ),
  ];
  return { bed, rug, nightstands };
}

function bathroomTileRects(room) {
  const longIsX = room.w >= room.h;
  const tw = longIsX ? 0.6 : 0.3;
  const th = longIsX ? 0.3 : 0.6;
  const g = 0.003;
  const x0 = room.x;
  const y0 = room.y;
  const x1 = room.x + room.w;
  const y1 = room.y + room.h;
  const rects = [];
  for (let y = y0; y < y1 - 1e-9; y += th) {
    const yb = Math.min(y + th, y1);
    for (let x = x0; x < x1 - 1e-9; x += tw) {
      const xb = Math.min(x + tw, x1);
      if (xb - x < 0.05 || yb - y < 0.05) continue;
      rects.push({
        x: x + g / 2,
        y: y + g / 2,
        w: Math.max(0.04, xb - x - g),
        h: Math.max(0.04, yb - y - g),
      });
    }
  }
  return rects;
}

function addBathroomFloor(parent, room, cx, cz, mats) {
  const { tile, grout, groutLine } = mats;
  const rx = room.x - cx + room.w / 2;
  const rz = room.y - cz + room.h / 2;
  addBox(parent, room.w, 0.04, room.h, rx, 0.02, rz, grout, groutLine);
  for (const rect of bathroomTileRects(room)) {
    addWorldRect(parent, rect, 0.05, 0.035, tile, groutLine, cx, cz);
  }
}

function hybridPlankAlongX(pts) {
  const b = ringBounds(pts || []);
  return b.maxX - b.minX >= b.maxY - b.minY;
}

function makeCarpetTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = Math.random();
    img.data[i] = 186 + n * 28;
    img.data[i + 1] = 172 + n * 24;
    img.data[i + 2] = 154 + n * 20;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function addCarpetFloor(parent, room, cx, cz, mats) {
  const mat = mats.carpet.clone();
  mat.userData.shared = false;
  const tex = mats.carpetTex.clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, room.w / 0.32), Math.max(1, room.h / 0.32));
  mat.map = tex;
  const geo = new THREE.PlaneGeometry(room.w, room.h);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(room.x - cx + room.w / 2, 0.012, room.y - cz + room.h / 2);
  parent.add(mesh);
}

function addHybridPlankStrip(parent, rect, alongX, index, cx, cz, mats) {
  const fill = mats.hybridTones[((index % mats.hybridTones.length) + mats.hybridTones.length) % mats.hybridTones.length];
  addWorldRect(parent, rect, 0.03, 0.015, fill, mats.hybridLine, cx, cz);
}

function addHybridFloorRect(parent, rect, alongX, cx, cz, mats) {
  if (!rect || !(rect.w > 0.04) || !(rect.h > 0.04)) return;
  addWorldRect(parent, rect, 0.02, 0.008, mats.hybridGap, mats.hybridLine, cx, cz);
  const pitch = HYBRID_PLANK_M;
  const gap = HYBRID_GAP_M;
  if (alongX) {
    const y0 = Math.floor(rect.y / pitch) * pitch;
    let i = Math.round(y0 / pitch);
    for (let y = y0; y < rect.y + rect.h - 1e-9; y += pitch, i += 1) {
      const yb = Math.max(rect.y, y) + gap / 2;
      const ye = Math.min(rect.y + rect.h, y + pitch) - gap / 2;
      if (ye - yb < 0.02) continue;
      addHybridPlankStrip(parent, { x: rect.x, y: yb, w: rect.w, h: ye - yb }, alongX, i, cx, cz, mats);
    }
  } else {
    const x0 = Math.floor(rect.x / pitch) * pitch;
    let i = Math.round(x0 / pitch);
    for (let x = x0; x < rect.x + rect.w - 1e-9; x += pitch, i += 1) {
      const xb = Math.max(rect.x, x) + gap / 2;
      const xe = Math.min(rect.x + rect.w, x + pitch) - gap / 2;
      if (xe - xb < 0.02) continue;
      addHybridPlankStrip(parent, { x: xb, y: rect.y, w: xe - xb, h: rect.h }, alongX, i, cx, cz, mats);
    }
  }
}

function collectInsideRuns(minT, maxT, step, isInside) {
  const runs = [];
  let run = null;
  for (let t = minT; t <= maxT + 1e-9; t += step) {
    if (isInside(t)) {
      if (!run) run = { t0: t, t1: t };
      else run.t1 = t;
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);
  return runs;
}

function addLivingHybridFloor(parent, inner, rooms, alongX, cx, cz, mats) {
  if (!inner || inner.length < 3) return;
  const b = ringBounds(inner);
  const interiors = interiorRooms(rooms);
  const inLiving = (p) => pointInPolygon(p, inner) && !interiors.some((room) => pointInRoom(p, room));
  const pitch = HYBRID_PLANK_M;
  const gap = HYBRID_GAP_M;
  const step = 0.08;
  if (alongX) {
    const y0 = Math.floor(b.minY / pitch) * pitch;
    let i = Math.round(y0 / pitch);
    for (let y = y0; y < b.maxY - 1e-9; y += pitch, i += 1) {
      const yMid = y + pitch / 2;
      const yb = y + gap / 2;
      const ye = y + pitch - gap / 2;
      if (ye - yb < 0.02) continue;
      const runs = collectInsideRuns(b.minX, b.maxX, step, (x) => inLiving({ x, y: yMid }));
      for (const run of runs) {
        const x = run.t0;
        const w = run.t1 - run.t0 + step;
        if (w < 0.06) continue;
        addHybridPlankStrip(parent, { x, y: yb, w, h: ye - yb }, alongX, i, cx, cz, mats);
      }
    }
  } else {
    const x0 = Math.floor(b.minX / pitch) * pitch;
    let i = Math.round(x0 / pitch);
    for (let x = x0; x < b.maxX - 1e-9; x += pitch, i += 1) {
      const xMid = x + pitch / 2;
      const xb = x + gap / 2;
      const xe = x + pitch - gap / 2;
      if (xe - xb < 0.02) continue;
      const runs = collectInsideRuns(b.minY, b.maxY, step, (y) => inLiving({ x: xMid, y }));
      for (const run of runs) {
        const y = run.t0;
        const h = run.t1 - run.t0 + step;
        if (h < 0.06) continue;
        addHybridPlankStrip(parent, { x: xb, y, w: xe - xb, h }, alongX, i, cx, cz, mats);
      }
    }
  }
}

function buildFurniture(parent, rooms, cx, cz, mats, alongX) {
  const { fill, dark, glass, line, timber, couch } = mats;
  for (const room of rooms || []) {
    const kind = roomKind(room);
    const rx = room.x - cx + room.w / 2;
    const rz = room.y - cz + room.h / 2;
    if (kind === "bedroom") {
      addCarpetFloor(parent, room, cx, cz, mats);
      const { bed, rug, nightstands } = bedroomBedGroup(room);
      addWorldRect(parent, rug, 0.02, 0.026, mats.rug, line, cx, cz);
      for (const ns of nightstands) {
        addWorldRect(parent, ns, 0.52, 0.26, timber, line, cx, cz);
      }
      addWorldRect(parent, bed, 0.42, 0.21, fill, line, cx, cz);
      const robe = robeGeom3D(room);
      for (const nib of robe.nibs) {
        addWorldRect(parent, nib, WALL_H, WALL_H / 2, mats.wall, line, cx, cz);
      }
      addWorldRect(parent, robe.rect, ROBE_H_M, ROBE_H_M / 2, fill, line, cx, cz);
      for (const door of robe.doors) {
        addWorldRectThin(parent, door, ROBE_DOOR_H_M, ROBE_DOOR_H_M / 2, fill, line, cx, cz);
      }
    } else if (kind === "bathroom") {
      addBathroomFloor(parent, room, cx, cz, mats);
      const sw = Math.min(0.95, room.w * 0.48);
      const sd = Math.min(0.95, room.h * 0.48);
      const sx = rx - room.w / 2 + sw / 2 + 0.08;
      const sz = rz - room.h / 2 + sd / 2 + 0.08;
      addBox(parent, sw, 2.05, 0.04, sx, 1.02, sz - sd / 2 + 0.02, glass, line);
      addBox(parent, 0.04, 2.05, sd, sx - sw / 2 + 0.02, 1.02, sz, glass, line);
      addBox(parent, 0.38, 0.42, 0.52, rx + room.w / 2 - 0.38, 0.21, rz, fill, line);
      addBox(parent, 0.32, 0.16, 0.42, rx + room.w / 2 - 0.38, 0.42, rz + 0.22, fill, line);
      const vanityAlong = room.h >= room.w ? room.h : room.w;
      const vanityLen = Math.min(0.9, Math.max(0.4, vanityAlong * 0.35));
      if (room.h >= room.w) {
        addBox(parent, 0.4, 0.85, vanityLen, rx + room.w / 2 - 0.2, 0.42, rz, fill, line);
      } else {
        addBox(parent, vanityLen, 0.85, 0.4, rx, 0.42, rz + room.h / 2 - 0.2, fill, line);
      }
    } else if (kind === "laundry") {
      addHybridFloorRect(parent, room, alongX, cx, cz, mats);
      const rot = roomRotation(room);
      const back = rot === 90 ? "right" : rot === 180 ? "bottom" : rot === 270 ? "left" : "top";
      const f = roomWallFrame(room, back);
      const trough = wallBoxRect(f.origin, f.along, f.inward, f.wallLen - 0.45, f.wallLen, 0, 0.6);
      addWorldRect(parent, trough, 0.86, 0.43, fill, line, cx, cz);
      addWorldRect(parent, trough, 0.04, 0.88, mats.steel, line, cx, cz);
    } else if (kind === "powder") {
      addHybridFloorRect(parent, room, alongX, cx, cz, mats);
      if (room.h >= room.w) {
        addBox(parent, 0.38, 0.42, 0.52, rx, 0.21, rz + room.h / 2 - 0.26, fill, line);
        addBox(parent, 0.32, 0.16, 0.42, rx, 0.42, rz + room.h / 2 - 0.52, fill, line);
        addBox(parent, 0.25, 0.85, 0.6, rx - room.w / 2 + 0.125, 0.42, rz, fill, line);
      } else {
        addBox(parent, 0.52, 0.42, 0.38, rx + room.w / 2 - 0.26, 0.21, rz, fill, line);
        addBox(parent, 0.42, 0.16, 0.32, rx + room.w / 2 - 0.52, 0.42, rz, fill, line);
        addBox(parent, 0.6, 0.85, 0.25, rx, 0.42, rz - room.h / 2 + 0.125, fill, line);
      }
    } else if (kind === "kitchen") {
      addHybridFloorRect(parent, room, alongX, cx, cz, mats);
      const benches = kitchenBenchPieces(room);
      const hasAppliances = Boolean(resolveKitchenAppliance(room, "cook"));
      const cook = kitchenCookRect(room);
      const sink = kitchenSinkRect(room);
      const pantry = kitchenPantryRect(room);
      const fridge = kitchenFridgeRect(room);
      for (const bench of benches) {
        const cx0 = bench.x - cx + bench.w / 2;
        const cz0 = bench.y - cz + bench.h / 2;
        // 20mm overhang on the front edge only: carcass 580 under a 600 top.
        const longIsX = bench.w >= bench.h;
        const carcassW = longIsX ? bench.w : Math.max(0.04, bench.w - (BENCH_DEPTH_M - BENCH_CARCASS_M));
        const carcassD = longIsX ? Math.max(0.04, bench.h - (BENCH_DEPTH_M - BENCH_CARCASS_M)) : bench.h;
        const shift = (BENCH_DEPTH_M - BENCH_CARCASS_M) / 2;
        addBox(
          parent,
          carcassW,
          BENCH_HEIGHT_M - BENCH_TOP_M,
          carcassD,
          cx0 + (longIsX ? 0 : shift),
          (BENCH_HEIGHT_M - BENCH_TOP_M) / 2,
          cz0 - (longIsX ? shift : 0),
          fill,
          line
        );
        addBox(parent, bench.w, BENCH_TOP_M, bench.h, cx0, BENCH_HEIGHT_M - BENCH_TOP_M / 2, cz0, timber, line);
      }
      if (!hasAppliances) continue;
      addBox(
        parent,
        cook.w,
        0.04,
        cook.h,
        cook.x - cx + cook.w / 2,
        BENCH_HEIGHT_M + 0.02,
        cook.y - cz + cook.h / 2,
        dark,
        line
      );
      addBox(
        parent,
        sink.w,
        0.06,
        sink.h,
        sink.x - cx + sink.w / 2,
        BENCH_HEIGHT_M + 0.03,
        sink.y - cz + sink.h / 2,
        mats.steel,
        line
      );
      addBox(
        parent,
        pantry.w,
        PANTRY_H_M,
        pantry.h,
        pantry.x - cx + pantry.w / 2,
        PANTRY_H_M / 2,
        pantry.y - cz + pantry.h / 2,
        fill,
        line
      );
      addBox(
        parent,
        fridge.w,
        FRIDGE_H_M,
        fridge.h,
        fridge.x - cx + fridge.w / 2,
        FRIDGE_H_M / 2,
        fridge.y - cz + fridge.h / 2,
        fill,
        line
      );
    } else if (kind === "porch") {
      addBox(parent, room.w, 0.04, room.h, rx, 0.02, rz, timber, line);
    } else if (kind === "living") {
      const g = livingSetGeom3D(room);
      addWorldRect(parent, g.tvUnit, 0.45, 0.225, timber, line, cx, cz);
      addWorldRect(parent, g.tv, 0.75, 0.45 + 0.375, dark, line, cx, cz);
      addWorldRect(parent, g.table, 0.4, 0.2, timber, line, cx, cz);
      for (const seat of g.seats) addWorldRect(parent, seat, 0.42, 0.21, couch, line, cx, cz);
      for (const back of g.backs) addWorldRect(parent, back, 0.8, 0.4, couch, line, cx, cz);
      for (const arm of g.arms) addWorldRect(parent, arm, 0.6, 0.3, couch, line, cx, cz);
    }
  }
}

function makeMats() {
  const line = new THREE.LineBasicMaterial({ color: LINE });
  line.userData.shared = true;
  const wall = new THREE.MeshLambertMaterial({
    color: 0xf5f2ec,
    side: THREE.DoubleSide,
  });
  wall.userData.shared = true;
  const fill = new THREE.MeshLambertMaterial({
    color: 0xf7f5f0,
    side: THREE.DoubleSide,
  });
  fill.userData.shared = true;
  const timber = new THREE.MeshLambertMaterial({ color: 0xd2ae76, side: THREE.DoubleSide });
  timber.userData.shared = true;
  const couch = new THREE.MeshLambertMaterial({ color: 0xf2efe9, side: THREE.DoubleSide });
  couch.userData.shared = true;
  const rug = new THREE.MeshLambertMaterial({ color: 0xd4c4a4, side: THREE.DoubleSide });
  rug.userData.shared = true;
  const ghost = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ghost.userData.shared = true;
  const glass = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  glass.userData.shared = true;
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, side: THREE.DoubleSide });
  dark.userData.shared = true;
  const steel = new THREE.MeshPhongMaterial({
    color: 0xc4cad0,
    specular: 0xffffff,
    shininess: 120,
    side: THREE.DoubleSide,
  });
  steel.userData.shared = true;
  const tile = new THREE.MeshLambertMaterial({ color: 0xc5c5c5, side: THREE.DoubleSide });
  tile.userData.shared = true;
  const grout = new THREE.MeshLambertMaterial({ color: 0x4a4a4a, side: THREE.DoubleSide });
  grout.userData.shared = true;
  const groutLine = new THREE.LineBasicMaterial({ color: 0x4a4a4a });
  groutLine.userData.shared = true;
  const hybridTones = HYBRID_TONE_HEX.map((color) => {
    const m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    m.userData.shared = true;
    return m;
  });
  const hybridGap = new THREE.MeshLambertMaterial({ color: 0x8a7354, side: THREE.DoubleSide });
  hybridGap.userData.shared = true;
  const hybridLine = new THREE.LineBasicMaterial({ color: 0x8a7354 });
  hybridLine.userData.shared = true;
  const carpetTex = makeCarpetTexture();
  carpetTex.userData.shared = true;
  const carpet = new THREE.MeshLambertMaterial({ map: carpetTex, side: THREE.DoubleSide });
  carpet.userData.shared = true;
  return {
    line,
    wall,
    fill,
    timber,
    couch,
    rug,
    ghost,
    glass,
    dark,
    steel,
    tile,
    grout,
    groutLine,
    hybridTones,
    hybridGap,
    hybridLine,
    carpet,
    carpetTex,
  };
}

export default function QuickConcept3DPreview({
  metres,
  rooms,
  innerMetres,
  walls,
  doors,
  orbit = null,
  onOrbitChange,
  captureRef,
}) {
  const mountRef = useRef(null);
  const orbitRef = useRef(orbit);
  const onOrbitChangeRef = useRef(onOrbitChange);
  orbitRef.current = orbit;
  onOrbitChangeRef.current = onOrbitChange;

  useEffect(() => {
    const mount = mountRef.current;
    const outer = metres || [];
    if (!mount || outer.length < 3) return undefined;

    let renderer;
    let scene;
    let camera;
    let group;
    let ground = null;
    let canvas;
    let ro;
    let raf = 0;
    const mats = makeMats();
    const onDown = { current: null };
    const onMove = { current: null };
    const onUp = { current: null };
    const onWheel = { current: null };

    try {
      const bounds = ringBounds(outer);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cz = (bounds.minY + bounds.maxY) / 2;
      const planDoors = doors || [];

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000);
      camera.up.set(0, 1, 0);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      renderer.setClearColor(0xffffff, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      mount.appendChild(canvas);

      // Realistic daylight rig: bright sky/ground bounce so white walls read
      // white, a warm-ish sun key with soft shadows, and a cool fill.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4b4, 1.0));
      const key = new THREE.DirectionalLight(0xfff6e8, 0.85);
      key.position.set(8, 14, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -18;
      key.shadow.camera.right = 18;
      key.shadow.camera.top = 18;
      key.shadow.camera.bottom = -18;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 100;
      key.shadow.bias = -0.0002;
      key.shadow.normalBias = 0.03;
      scene.add(key);
      const fillL = new THREE.DirectionalLight(0xe8f0ff, 0.3);
      fillL.position.set(-6, 8, -4);
      scene.add(fillL);

      group = new THREE.Group();
      scene.add(group);

      const wallMeshes = [];
      for (let i = 0; i < outer.length; i += 1) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        const { nx, ny } = inwardNormal(a, b, outer);
        const meshes = addOuterEdge(group, a, b, planDoors, cx, cz, nx, ny, mats) || [];
        for (const mesh of meshes) {
          mesh.userData.outward = { x: -nx, z: -ny };
          wallMeshes.push(mesh);
        }
      }

      const drawnDoors = new Set();
      addPartitionWalls(group, walls, planDoors, cx, cz, mats, drawnDoors);

      for (const door of planDoors) {
        if (!door.external && !drawnDoors.has(door)) addDoorLeaf(group, door, cx, cz, mats);
      }
      const alongX = hybridPlankAlongX(outer);
      addLivingHybridFloor(group, innerMetres?.length >= 3 ? innerMetres : outer, rooms, alongX, cx, cz, mats);
      buildFurniture(group, rooms, cx, cz, mats, alongX);
      cleanWallJoins(group);

      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const target = box.getCenter(new THREE.Vector3());
      const span = Math.max(
        Number.isFinite(size.x) ? size.x : 0,
        Number.isFinite(size.y) ? size.y : 0,
        Number.isFinite(size.z) ? size.z : 0,
        4
      );
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
        target.set(0, 0, 0);
      }
      // Aim the sun at the model (not the world origin) and keep it outside
      // the shadow camera range no matter how big the house is.
      key.position.set(target.x + 20, target.y + 30, target.z + 15);
      key.target.position.copy(target);
      scene.add(key.target);
      // Invisible shadow-catcher ground so the house sits in the scene instead
      // of floating on white. Same white as the background, shows shadows only.
      ground = new THREE.Mesh(
        new THREE.PlaneGeometry(300, 300),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(target.x, -0.02, target.z);
      ground.receiveShadow = true;
      scene.add(ground);
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
        // Transparent faces (glass, ghosted walls) must not cast solid shadows.
        o.castShadow = !o.material?.transparent;
      });
      const saved = orbitRef.current;
      let azimuth = Number.isFinite(saved?.azimuth) ? saved.azimuth : ISO_AZIMUTH;
      let elevation = Number.isFinite(saved?.elevation) ? saved.elevation : ISO_ELEVATION;
      let zoom = 1;
      const camDist = span * 4;

      const emitOrbit = () => {
        onOrbitChangeRef.current?.({ azimuth, elevation });
      };

      const updateGhostWalls = () => {
        const camDirX = Math.cos(elevation) * Math.sin(azimuth);
        const camDirZ = Math.cos(elevation) * Math.cos(azimuth);
        for (const mesh of wallMeshes) {
          const o = mesh.userData.outward;
          if (!o) continue;
          const ghosted = o.x * camDirX + o.z * camDirZ > 0.18;
          mesh.material = ghosted ? mats.ghost : mats.wall;
          // A ghosted wall must not cast a solid shadow either.
          mesh.castShadow = !ghosted;
          // A ghosted wall keeps only its faint face; its dark outlines would hang in mid-air
          // and read as bent geometry, so hide them while ghosted.
          mesh.children.forEach((c) => {
            if (c.isLineSegments) c.visible = !ghosted;
          });
        }
      };

      const placeCamera = () => {
        camera.up.set(0, 1, 0);
        camera.position.set(
          target.x + camDist * Math.cos(elevation) * Math.sin(azimuth),
          target.y + camDist * Math.sin(elevation),
          target.z + camDist * Math.cos(elevation) * Math.cos(azimuth)
        );
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
      };

      // Fit once for the whole spin: measure the projected bounds at sample
      // angles right around the full circle (low to near top-down, since
      // rotation is unrestricted) and keep the largest, so rotating never
      // rescales the model.
      let spinFit = null;
      const computeSpinFit = () => {
        const saveA = azimuth;
        const saveE = elevation;
        let maxW = 0.01;
        let maxH = 0.01;
        const elevations = [0.02, 0.5, elevation, 1.0, 1.45];
        for (const e of elevations) {
          elevation = e;
          for (let i = 0; i < 16; i += 1) {
            azimuth = (i / 16) * Math.PI * 2;
            placeCamera();
            const b = projectedOrthoBounds(camera, group);
            if (!b) continue;
            if (b.width > maxW) maxW = b.width;
            if (b.height > maxH) maxH = b.height;
          }
        }
        azimuth = saveA;
        elevation = saveE;
        placeCamera();
        // Centre the locked frustum on the orbit target (it stays dead-centre
        // on screen at every angle) with room for the largest spin bounds.
        const tc = target.clone().applyMatrix4(camera.matrixWorldInverse);
        spinFit = { width: maxW, height: maxH, cx: tc.x, cy: tc.y };
      };

      const applySpinFit = () => {
        if (!spinFit) return;
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        applyOrthoBounds(
          camera,
          { width: spinFit.width * zoom, height: spinFit.height * zoom, cx: spinFit.cx, cy: spinFit.cy },
          w / Math.max(1, h),
          0.02
        );
      };

      const updateCamera = () => {
        placeCamera();
        updateGhostWalls();
      };

      const setSize = () => {
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        renderer.setSize(w, h, false);
        applySpinFit();
      };

      computeSpinFit();
      updateCamera();
      setSize();

      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      onDown.current = (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.style.cursor = "grabbing";
        canvas.setPointerCapture?.(e.pointerId);
      };
      onMove.current = (e) => {
        if (!dragging) return;
        azimuth -= (e.clientX - lastX) * 0.008;
        // Free tilt, but never below the floor line so the underside stays hidden.
        elevation = Math.max(0.02, elevation + (e.clientY - lastY) * 0.006);
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
      };
      onWheel.current = (e) => {
        e.preventDefault();
        zoom = Math.max(0.25, Math.min(5, zoom * Math.exp(e.deltaY * 0.001)));
        applySpinFit();
      };
      onUp.current = () => {
        dragging = false;
        canvas.style.cursor = "grab";
        emitOrbit();
      };
      canvas.addEventListener("pointerdown", onDown.current);
      canvas.addEventListener("pointermove", onMove.current);
      canvas.addEventListener("wheel", onWheel.current, { passive: false });
      window.addEventListener("pointerup", onUp.current);

      ro = new ResizeObserver(setSize);
      ro.observe(mount);

      if (captureRef) {
        captureRef.current = (outW = 2200) => {
          const bounds = projectedOrthoBounds(camera, group);
          applyOrthoBounds(camera, bounds, 0, 0.03);
          const imgAspect = bounds ? bounds.width / bounds.height : 1.6;
          const w = Math.max(2, Math.round(outW));
          const h = Math.max(2, Math.round(w / Math.max(0.2, imgAspect)));
          try {
            renderer.setPixelRatio(1);
            renderer.setSize(w, h, false);
            renderer.render(scene, camera);
            return cropCanvasWhitespace(renderer.domElement).toDataURL("image/png");
          } finally {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            setSize();
            renderer.render(scene, camera);
          }
        };
      }

      const tick = () => {
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.error("[QuickConcept] 3D preview failed:", err);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (canvas && onDown.current) canvas.removeEventListener("pointerdown", onDown.current);
      if (canvas && onMove.current) canvas.removeEventListener("pointermove", onMove.current);
      if (canvas && onWheel.current) canvas.removeEventListener("wheel", onWheel.current);
      if (onUp.current) window.removeEventListener("pointerup", onUp.current);
      if (captureRef && captureRef.current) captureRef.current = null;
      if (group) disposeObject(group);
      ground?.geometry?.dispose();
      if (Array.isArray(ground?.material)) ground.material.forEach((m) => m?.dispose?.());
      else ground?.material?.dispose?.();
      Object.values(mats).forEach((m) => {
        if (Array.isArray(m)) m.forEach((item) => item.dispose?.());
        else {
          m?.map?.dispose?.();
          m.dispose?.();
        }
      });
      renderer?.dispose();
      if (canvas && canvas.parentNode === mount) mount.removeChild(canvas);
    };
  }, [metres, rooms, innerMetres, walls, doors, captureRef]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", minHeight: 0, background: "#fff", cursor: "grab" }}
    />
  );
}
