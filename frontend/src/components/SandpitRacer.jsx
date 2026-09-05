import React, { useEffect, useRef } from "react";
import racingTrack from "../images/racing.png";
import { getLoggedInUserId, getLoggedInUserName } from "../utils/auth";
import { getSandpitRaceWsUrl } from "../utils/sandpitRaceWs";
import { drawDesignedCar } from "../utils/sandpitCarMesh";

const TRACK_W = 1672;
const TRACK_H = 941;
const TRACK_ASPECT = TRACK_W / TRACK_H;
const ISO_Y = 0.58;
const START_X = 0.58;
const START_Y = 0.765;
const START_HEADING = Math.PI;
const STATE_SEND_MS = 40;
const REMOTE_SMOOTH = 14;
const REMOTE_GONE_MS = 8000;
const GRID_ORIGIN_X = 0.565;
const GRID_ORIGIN_Y = 0.748;

const DEFAULT_COLOR = { body: "#d61f26", cabin: "#b01820", stroke: "#8a1016" };

/** Survives React remounts so a socket blip cannot rewind cars. */
const localCar = {
  x: START_X,
  y: START_Y,
  heading: START_HEADING,
  speed: 0,
};
const remoteCars = new Map();
let localSeq = 0;

function isStartArea(x, y) {
  const dx = x - GRID_ORIGIN_X;
  const dy = y - GRID_ORIGIN_Y;
  return dx * dx + dy * dy < 0.012;
}

function containRect(cw, ch, iw, ih) {
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function parseHex(hex) {
  let h = String(hex || "#888888").replace("#", "");
  if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  return {
    r: Number.parseInt(h.slice(0, 2), 16) || 0,
    g: Number.parseInt(h.slice(2, 4), 16) || 0,
    b: Number.parseInt(h.slice(4, 6), 16) || 0,
  };
}

function rgbStr(r, g, b) {
  return `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(
    Math.max(0, Math.min(255, b))
  )})`;
}

function litHex(hex, light) {
  const { r, g, b } = parseHex(hex);
  return rgbStr(r * light, g * light, b * light);
}

function rotateXY(x, y, heading) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: x * c - y * s, y: x * s + y * c };
}

function projectCar(x, y, z, heading) {
  const r = rotateXY(x, y, heading);
  return { x: r.x, y: r.y * ISO_Y - z * 1.05 };
}

function quadCentroidY(pts) {
  return (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
}

function faceLight(pts) {
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    nx += a.y - b.y;
    ny += b.x - a.x;
  }
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const d = nx * -0.42 + ny * -0.78;
  return 0.38 + 0.7 * Math.max(0, d);
}

const CAM = { x: 0.12, y: 1, z: 1.08 };

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
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
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function isTowardCamera(localX, localY, heading) {
  const w = rotateXY(localX, localY, heading);
  return w.x * CAM.x + w.y * CAM.y > 0.02;
}

function addBoxCorners(points, heading, x0, x1, y0, y1, z0, z1) {
  for (const x of [x0, x1]) {
    for (const y of [y0, y1]) {
      for (const z of [z0, z1]) points.push(projectCar(x, y, z, heading));
    }
  }
}

function worldFaceDot(nx, ny, nz, heading) {
  const w = rotateXY(nx, ny, heading);
  return w.x * CAM.x + w.y * CAM.y + nz * CAM.z;
}

function faceVisible(nx, ny, nz, heading) {
  return worldFaceDot(nx, ny, nz, heading) > 0.08;
}

function addBoxTopsAndNearSides(faces, heading, x0, x1, y0, y1, z0, z1, fillHex, strokeHex) {
  const p = (x, y, z) => projectCar(x, y, z, heading);
  faces.push({
    pts: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)],
    fillHex,
    strokeHex,
  });
  const sides = [
    { n: [-1, 0, 0], pts: [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)] },
    { n: [1, 0, 0], pts: [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)] },
    { n: [0, -1, 0], pts: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)] },
    { n: [0, 1, 0], pts: [p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)] },
  ]
    .map((side) => ({ ...side, dot: worldFaceDot(side.n[0], side.n[1], side.n[2], heading) }))
    .filter((side) => side.dot > 0.08)
    .sort((a, b) => b.dot - a.dot)
    .slice(0, 2);
  for (const side of sides) faces.push({ pts: side.pts, fillHex, strokeHex });
}

function addQuad3(faces, heading, a, b, c, d, fillHex, strokeHex) {
  const e1x = b.x - a.x;
  const e1y = b.y - a.y;
  const e1z = b.z - a.z;
  const e2x = d.x - a.x;
  const e2y = d.y - a.y;
  const e2z = d.z - a.z;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  if (!faceVisible(nx, ny, nz, heading)) return;
  const p = (pt) => projectCar(pt.x, pt.y, pt.z, heading);
  faces.push({ pts: [p(a), p(b), p(c), p(d)], fillHex, strokeHex });
}

function drawFaces(ctx, faces) {
  faces.sort((a, b) => quadCentroidY(a.pts) - quadCentroidY(b.pts));
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.8;
  for (const face of faces) {
    const pts = face.pts;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = litHex(face.fillHex, faceLight(pts));
    ctx.fill();
    ctx.strokeStyle = face.strokeHex || "rgba(0,0,0,0.35)";
    ctx.stroke();
  }
}

function drawCar(ctx, heading, length, color = DEFAULT_COLOR) {
  const L = length;
  const W = L * 0.43;
  const body = color.body || DEFAULT_COLOR.body;
  const cabin = color.cabin || DEFAULT_COLOR.cabin;
  const stroke = color.stroke || DEFAULT_COLOR.stroke;
  const glass = "#1a2228";
  const rubber = "#141414";
  const p = (x, y, z) => projectCar(x, y, z, heading);

  const shadow = [
    p(-L * 0.48, -W * 0.48, 0),
    p(L * 0.5, -W * 0.48, 0),
    p(L * 0.5, W * 0.48, 0),
    p(-L * 0.48, W * 0.48, 0),
  ];
  ctx.save();
  ctx.translate(L * 0.07, L * 0.11);
  ctx.beginPath();
  ctx.moveTo(shadow[0].x, shadow[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(shadow[i].x, shadow[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.fill();
  ctx.restore();

  const wheelW = W * 0.16;
  const wheelL = L * 0.11;
  const wheelH = L * 0.09;
  const zBody = L * 0.22;
  const zCabin = L * 0.42;

  const hullPts = [];
  addBoxCorners(hullPts, heading, -L * 0.48, L * 0.5, -W * 0.5, W * 0.5, wheelH * 0.45, zBody);
  addBoxCorners(hullPts, heading, -L * 0.18, L * 0.16, -W * 0.4, W * 0.4, zBody, zCabin);
  const hull = convexHull(hullPts);
  if (hull.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i += 1) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    ctx.fillStyle = litHex(body, 0.52);
    ctx.fill();
  }

  const faces = [];
  addBoxTopsAndNearSides(faces, heading, -L * 0.48, L * 0.5, -W * 0.5, W * 0.5, wheelH * 0.45, zBody, body, stroke);

  addQuad3(
    faces,
    heading,
    { x: L * 0.16, y: -W * 0.48, z: zBody },
    { x: L * 0.5, y: -W * 0.42, z: L * 0.17 },
    { x: L * 0.5, y: W * 0.42, z: L * 0.17 },
    { x: L * 0.16, y: W * 0.48, z: zBody },
    body,
    stroke
  );
  addQuad3(
    faces,
    heading,
    { x: -L * 0.48, y: -W * 0.42, z: L * 0.17 },
    { x: -L * 0.16, y: -W * 0.48, z: zBody },
    { x: -L * 0.16, y: W * 0.48, z: zBody },
    { x: -L * 0.48, y: W * 0.42, z: L * 0.17 },
    body,
    stroke
  );

  addBoxTopsAndNearSides(faces, heading, -L * 0.18, L * 0.16, -W * 0.4, W * 0.4, zBody, zCabin, cabin, stroke);

  addQuad3(
    faces,
    heading,
    { x: L * 0.16, y: -W * 0.38, z: zCabin },
    { x: L * 0.32, y: -W * 0.44, z: L * 0.225 },
    { x: L * 0.32, y: W * 0.44, z: L * 0.225 },
    { x: L * 0.16, y: W * 0.38, z: zCabin },
    glass,
    "#0b1014"
  );
  addQuad3(
    faces,
    heading,
    { x: -L * 0.3, y: -W * 0.42, z: L * 0.225 },
    { x: -L * 0.18, y: -W * 0.38, z: zCabin },
    { x: -L * 0.18, y: W * 0.38, z: zCabin },
    { x: -L * 0.3, y: W * 0.42, z: L * 0.225 },
    glass,
    "#0b1014"
  );
  if (isTowardCamera(0, -W, heading)) {
    addQuad3(
      faces,
      heading,
      { x: -L * 0.12, y: -W * 0.4, z: L * 0.24 },
      { x: L * 0.1, y: -W * 0.4, z: L * 0.24 },
      { x: L * 0.1, y: -W * 0.4, z: L * 0.4 },
      { x: -L * 0.12, y: -W * 0.4, z: L * 0.4 },
      glass,
      "#0b1014"
    );
  }
  if (isTowardCamera(0, W, heading)) {
    addQuad3(
      faces,
      heading,
      { x: -L * 0.12, y: W * 0.4, z: L * 0.24 },
      { x: -L * 0.12, y: W * 0.4, z: L * 0.4 },
      { x: L * 0.1, y: W * 0.4, z: L * 0.4 },
      { x: L * 0.1, y: W * 0.4, z: L * 0.24 },
      glass,
      "#0b1014"
    );
  }

  if (isTowardCamera(L * 0.1, -W, heading)) {
    addBoxTopsAndNearSides(faces, heading, L * 0.08, L * 0.14, -W * 0.54, -W * 0.4, L * 0.24, L * 0.32, body, stroke);
  }
  if (isTowardCamera(L * 0.1, W, heading)) {
    addBoxTopsAndNearSides(faces, heading, L * 0.08, L * 0.14, W * 0.4, W * 0.54, L * 0.24, L * 0.32, body, stroke);
  }

  drawFaces(ctx, faces);

  const wheelFaces = [];
  for (const [wx, wy] of [
    [L * 0.28, -W * 0.52],
    [L * 0.28, W * 0.52],
    [-L * 0.3, -W * 0.52],
    [-L * 0.3, W * 0.52],
  ]) {
    if (!isTowardCamera(wx, wy, heading)) continue;
    addBoxTopsAndNearSides(
      wheelFaces,
      heading,
      wx - wheelL,
      wx + wheelL,
      wy - wheelW,
      wy + wheelW,
      0,
      wheelH,
      rubber,
      "#050505"
    );
  }
  drawFaces(ctx, wheelFaces);

  const lampQuads = [
    [
      { x: L * 0.5, y: -W * 0.28, z: L * 0.15 },
      { x: L * 0.5, y: -W * 0.12, z: L * 0.15 },
      { x: L * 0.5, y: -W * 0.12, z: L * 0.2 },
      { x: L * 0.5, y: -W * 0.28, z: L * 0.2 },
    ],
    [
      { x: L * 0.5, y: W * 0.12, z: L * 0.15 },
      { x: L * 0.5, y: W * 0.28, z: L * 0.15 },
      { x: L * 0.5, y: W * 0.28, z: L * 0.2 },
      { x: L * 0.5, y: W * 0.12, z: L * 0.2 },
    ],
  ];
  for (const [a, b, c, d] of lampQuads) {
    if (!faceVisible(1, 0, 0, heading)) continue;
    const pts = [a, b, c, d].map((pt) => p(pt.x, pt.y, pt.z));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = "#f2e2a8";
    ctx.fill();
  }
  const tailQuads = [
    [
      { x: -L * 0.48, y: -W * 0.28, z: L * 0.15 },
      { x: -L * 0.48, y: -W * 0.12, z: L * 0.15 },
      { x: -L * 0.48, y: -W * 0.12, z: L * 0.2 },
      { x: -L * 0.48, y: -W * 0.28, z: L * 0.2 },
    ],
    [
      { x: -L * 0.48, y: W * 0.12, z: L * 0.15 },
      { x: -L * 0.48, y: W * 0.28, z: L * 0.15 },
      { x: -L * 0.48, y: W * 0.28, z: L * 0.2 },
      { x: -L * 0.48, y: W * 0.12, z: L * 0.2 },
    ],
  ];
  for (const [a, b, c, d] of tailQuads) {
    if (!faceVisible(-1, 0, 0, heading)) continue;
    const pts = [a, b, c, d].map((pt) => p(pt.x, pt.y, pt.z));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = "#c43b32";
    ctx.fill();
  }
}

function drawName(ctx, px, py, carLen, name) {
  if (!name) return;
  ctx.save();
  ctx.font = `700 ${Math.max(10, Math.round(carLen * 0.28))}px Segoe UI, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "#fff";
  ctx.strokeText(name, px, py - carLen * 0.55);
  ctx.fillText(name, px, py - carLen * 0.55);
  ctx.restore();
}

export default function SandpitRacer({ startRaceRef, onDriversChange, inputPaused = false, carShapes = [] }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const inputPausedRef = useRef(inputPaused);
  inputPausedRef.current = inputPaused;
  const carShapesRef = useRef(carShapes);
  carShapesRef.current = carShapes;
  const carRef = useRef(localCar);
  const remotesRef = useRef(remoteCars);
  const localMetaRef = useRef({
    id: String(getLoggedInUserId() || ""),
    name: getLoggedInUserName() || "Driver",
    color: DEFAULT_COLOR,
  });
  const onDriversChangeRef = useRef(onDriversChange);
  onDriversChangeRef.current = onDriversChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const keys = keysRef.current;
    const car = carRef.current;
    const remotes = remotesRef.current;
    const localId = String(getLoggedInUserId() || "");
    localMetaRef.current.id = localId;
    localMetaRef.current.name = getLoggedInUserName() || "Driver";

    let raf = 0;
    let last = performance.now();
    let lastSend = 0;
    let ws = null;
    let disposed = false;
    let connGen = 0;
    let reconnectTimer = 0;

    function emitDrivers() {
      const list = [
        {
          id: localMetaRef.current.id,
          name: localMetaRef.current.name,
          self: true,
        },
        ...Array.from(remotes.values()).map((r) => ({
          id: r.id,
          name: r.name,
          self: false,
        })),
      ];
      onDriversChangeRef.current?.(list);
    }

    function upsertRemote(player, { snap = false, roster = false } = {}) {
      if (!player?.id || String(player.id) === localId) return;
      const id = String(player.id);
      const prev = remotes.get(id);
      const tx = Number.isFinite(player.x) ? player.x : prev?.tx ?? START_X;
      const ty = Number.isFinite(player.y) ? player.y : prev?.ty ?? START_Y;
      const th = Number.isFinite(player.heading) ? player.heading : prev?.th ?? START_HEADING;
      const ts = Number.isFinite(player.speed) ? player.speed : prev?.ts ?? 0;
      const now = performance.now();
      const serverAt = Number.isFinite(player.at) ? player.at : 0;

      const seq = Number.isFinite(player.seq) ? player.seq : 0;
      if (prev && !snap && seq && prev.seq && seq < prev.seq) {
        return;
      }
      if (prev && !snap && serverAt && prev.serverAt && serverAt < prev.serverAt) {
        return;
      }
      if (prev && !snap && isStartArea(tx, ty) && !isStartArea(prev.x, prev.y)) {
        return;
      }

      if (!prev) {
        remotes.set(id, {
          id,
          name: player.name || "Driver",
          color: player.color || DEFAULT_COLOR,
          x: tx,
          y: ty,
          heading: th,
          speed: ts,
          tx,
          ty,
          th,
          ts,
          recvAt: now,
          serverAt,
          seq,
          goneAt: 0,
        });
        emitDrivers();
        return;
      }

      prev.name = player.name || prev.name;
      prev.color = player.color || prev.color;
      prev.goneAt = 0;
      if (serverAt) prev.serverAt = serverAt;
      if (seq) prev.seq = seq;

      if (snap) {
        prev.x = tx;
        prev.y = ty;
        prev.heading = th;
        prev.tx = tx;
        prev.ty = ty;
        prev.th = th;
        prev.ts = ts;
        prev.speed = ts;
        prev.recvAt = now;
      } else {
        prev.tx = tx;
        prev.ty = ty;
        prev.th = th;
        prev.ts = ts;
        prev.speed = ts;
        prev.recvAt = now;
      }

      if (roster) emitDrivers();
    }

    function applyStartGrid(cars) {
      if (!Array.isArray(cars)) return;
      for (const pose of cars) {
        if (!pose?.id) continue;
        if (String(pose.id) === localId) {
          car.x = pose.x;
          car.y = pose.y;
          car.heading = pose.heading;
          car.speed = 0;
          keys.clear();
        } else {
          upsertRemote({ ...pose, speed: 0 }, { snap: true });
        }
      }
    }

    function sendState(force = false) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = performance.now();
      if (!force && now - lastSend < STATE_SEND_MS) return;
      lastSend = now;
      try {
        ws.send(
          JSON.stringify({
            seq: ++localSeq,
            x: car.x,
            y: car.y,
            heading: car.heading,
            speed: car.speed,
          })
        );
      } catch {
        /* ignore */
      }
    }

    function requestStartRace() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: "start_race" }));
      } catch {
        /* ignore */
      }
    }

    if (startRaceRef) startRaceRef.current = requestStartRace;
    emitDrivers();

    function closeSocket(socket, { reconnect = false } = {}) {
      if (!socket) return;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = reconnect ? socket.onclose : null;
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      } catch {
        /* ignore */
      }
    }

    function connect() {
      const gen = ++connGen;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = 0;
      }
      const previous = ws;
      if (previous) {
        previous.onclose = null;
        closeSocket(previous);
      }

      const socket = new WebSocket(getSandpitRaceWsUrl(localId, localMetaRef.current.name));
      ws = socket;

      socket.onopen = () => {
        if (disposed || gen !== connGen) return;
        sendState(true);
      };

      socket.onmessage = (event) => {
        if (disposed || gen !== connGen) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "joined" && msg.player) {
          localMetaRef.current.color = msg.player.color || DEFAULT_COLOR;
          localMetaRef.current.name = msg.player.name || localMetaRef.current.name;
          for (const other of msg.cars || []) {
            if (!other?.id || String(other.id) === localId) continue;
            if (!remotes.has(String(other.id))) {
              upsertRemote(other);
            }
          }
          emitDrivers();
          sendState(true);
          return;
        }

        if (msg.type === "peer_joined" && msg.player) {
          const id = String(msg.player.id || "");
          if (id && id !== localId && !remotes.has(id)) {
            upsertRemote(msg.player, { roster: true });
          }
        }

        if (msg.type === "peer_left") {
          const remote = remotes.get(String(msg.playerId || ""));
          if (remote) remote.goneAt = performance.now();
        }

        if (msg.type === "peer_state" && msg.player) {
          upsertRemote(msg.player);
        }

        if (msg.type === "start_race") {
          applyStartGrid(msg.cars);
          emitDrivers();
          sendState(true);
        }
      };

      socket.onclose = () => {
        if (disposed || gen !== connGen) return;
        reconnectTimer = window.setTimeout(() => {
          if (!disposed && gen === connGen) connect();
        }, 600);
      };
    }

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: cw, clientHeight: ch } = wrap;
      canvas.width = Math.max(1, Math.round(cw * dpr));
      canvas.height = Math.max(1, Math.round(ch * dpr));
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onKeyDown(e) {
      if (inputPausedRef.current) return;
      const code = e.code;
      if (
        code === "ArrowUp" ||
        code === "ArrowDown" ||
        code === "ArrowLeft" ||
        code === "ArrowRight" ||
        code === "KeyW" ||
        code === "KeyA" ||
        code === "KeyD" ||
        code === "KeyX"
      ) {
        e.preventDefault();
        keys.add(code);
      }
    }

    function onKeyUp(e) {
      keys.delete(e.code);
    }

    function stepRemote(remote, dt, now) {
      if (remote.goneAt && now - remote.goneAt > REMOTE_GONE_MS) {
        remotes.delete(remote.id);
        emitDrivers();
        return false;
      }
      if (!remote.goneAt && remote.ts > 0.002 && now - remote.recvAt > 40) {
        remote.tx += Math.cos(remote.th) * remote.ts * dt;
        remote.ty += Math.sin(remote.th) * remote.ts * dt * TRACK_ASPECT;
      }
      const k = 1 - Math.exp(-dt * REMOTE_SMOOTH);
      remote.x += (remote.tx - remote.x) * k;
      remote.y += (remote.ty - remote.y) * k;
      remote.heading = lerpAngle(remote.heading, remote.th, k);
      return true;
    }

    function paintCar(ctx, view, pose, color, name, carLen, useDesign = false) {
      const px = view.x + pose.x * view.w;
      const py = view.y + pose.y * view.h;
      ctx.save();
      ctx.translate(px, py);
      const designed = useDesign ? carShapesRef.current : null;
      if (!designed?.length || !drawDesignedCar(ctx, designed, pose.heading, carLen, color)) {
        drawCar(ctx, pose.heading, carLen, color);
      }
      ctx.restore();
      drawName(ctx, px, py, carLen, name);
    }

    function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ctx = canvas.getContext("2d");
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      const view = containRect(cw, ch, TRACK_W, TRACK_H);

      const accel = keys.has("ArrowUp") || keys.has("KeyW");
      const brake = keys.has("ArrowDown") || keys.has("KeyX");
      const left = keys.has("ArrowLeft") || keys.has("KeyA");
      const right = keys.has("ArrowRight") || keys.has("KeyD");

      const maxSpeed = 0.22;
      const accelRate = 0.18;
      const brakeRate = 0.32;
      const drag = 0.55;
      const turnRate = 2.15;

      if (left) car.heading -= turnRate * dt;
      if (right) car.heading += turnRate * dt;

      if (accel) car.speed = Math.min(maxSpeed, car.speed + accelRate * dt);
      if (brake) car.speed = Math.max(0, car.speed - brakeRate * dt);
      if (!accel && !brake) {
        const s = Math.sign(car.speed);
        car.speed -= s * drag * dt;
        if (Math.sign(car.speed) !== s) car.speed = 0;
      }

      car.x += Math.cos(car.heading) * car.speed * dt;
      car.y += Math.sin(car.heading) * car.speed * dt * TRACK_ASPECT;

      sendState();

      ctx.clearRect(0, 0, cw, ch);
      const carLen = view.w * 0.04;

      for (const remote of remotes.values()) {
        if (!stepRemote(remote, dt, now)) continue;
        paintCar(ctx, view, remote, remote.color, remote.name, carLen);
      }
      paintCar(ctx, view, car, localMetaRef.current.color, localMetaRef.current.name, carLen, true);

      raf = window.requestAnimationFrame(tick);
    }

    sizeCanvas();
    connect();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", sizeCanvas);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    const onPageHide = () => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "leave" }));
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      disposed = true;
      connGen += 1;
      if (startRaceRef) startRaceRef.current = null;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeCanvas);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pagehide", onPageHide);
      if (ws) {
        ws.onclose = null;
        closeSocket(ws);
        ws = null;
      }
    };
  }, [startRaceRef]);

  useEffect(() => {
    if (inputPaused) keysRef.current.clear();
  }, [inputPaused]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#1a3a18",
      }}
    >
      <img
        src={racingTrack}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
        }}
      />
    </div>
  );
}
