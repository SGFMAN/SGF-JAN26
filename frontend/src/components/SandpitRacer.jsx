import React, { useEffect, useRef } from "react";
import racingTrack from "../images/racing.png";
import { getLoggedInUserId, getLoggedInUserName } from "../utils/auth";
import { getSandpitRaceWsUrl } from "../utils/sandpitRaceWs";

const TRACK_W = 1672;
const TRACK_H = 941;
const TRACK_ASPECT = TRACK_W / TRACK_H;
const ISO_Y = 0.58;
const START_X = 0.58;
const START_Y = 0.765;
const START_HEADING = Math.PI;
const STATE_SEND_MS = 40;
const REMOTE_SMOOTH = 16;
const REMOTE_EXTRAPOLATE_MAX = 0.1;
const SNAP_DIST2 = 0.012;

const DEFAULT_COLOR = { body: "#d61f26", cabin: "#b01820", stroke: "#8a1016" };

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

function drawCar(ctx, length, color = DEFAULT_COLOR) {
  const w = length;
  const h = length * 0.46;
  const r = h * 0.22;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(2.5, 3.5, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  const wheel = h * 0.2;
  ctx.fillStyle = "#1a1a1a";
  for (const [wx, wy] of [
    [-w * 0.28, -h * 0.52],
    [-w * 0.28, h * 0.52],
    [w * 0.28, -h * 0.52],
    [w * 0.28, h * 0.52],
  ]) {
    ctx.beginPath();
    ctx.roundRect(wx - wheel, wy - wheel * 0.55, wheel * 2, wheel * 1.1, 2);
    ctx.fill();
  }

  ctx.fillStyle = color.body;
  ctx.strokeStyle = color.stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color.cabin;
  ctx.beginPath();
  ctx.roundRect(-w * 0.12, -h * 0.38, w * 0.42, h * 0.76, r * 0.7);
  ctx.fill();

  ctx.fillStyle = "rgba(170, 220, 255, 0.85)";
  ctx.beginPath();
  ctx.moveTo(w * 0.08, -h * 0.28);
  ctx.lineTo(w * 0.34, -h * 0.22);
  ctx.lineTo(w * 0.34, h * 0.22);
  ctx.lineTo(w * 0.08, h * 0.28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(w * 0.44, -h * 0.18, h * 0.08, 0, Math.PI * 2);
  ctx.arc(w * 0.44, h * 0.18, h * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff4a3a";
  ctx.beginPath();
  ctx.arc(-w * 0.44, -h * 0.16, h * 0.07, 0, Math.PI * 2);
  ctx.arc(-w * 0.44, h * 0.16, h * 0.07, 0, Math.PI * 2);
  ctx.fill();
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
  ctx.strokeText(name, px, py - carLen * 0.28);
  ctx.fillText(name, px, py - carLen * 0.28);
  ctx.restore();
}

export default function SandpitRacer({ startRaceRef, onDriversChange }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const keysRef = useRef(new Set());
  const carRef = useRef({
    x: START_X,
    y: START_Y,
    heading: START_HEADING,
    speed: 0,
  });
  const spawnedRef = useRef(false);
  const remotesRef = useRef(new Map());
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
        });
        emitDrivers();
        return;
      }

      prev.name = player.name || prev.name;
      prev.color = player.color || prev.color;
      prev.tx = tx;
      prev.ty = ty;
      prev.th = th;
      prev.ts = ts;
      prev.speed = ts;
      prev.recvAt = now;

      const dx = tx - prev.x;
      const dy = ty - prev.y;
      if (snap || dx * dx + dy * dy > SNAP_DIST2) {
        prev.x = tx;
        prev.y = ty;
        prev.heading = th;
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
            type: "state",
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
          if (!spawnedRef.current) {
            spawnedRef.current = true;
            car.x = msg.player.x;
            car.y = msg.player.y;
            car.heading = msg.player.heading;
            car.speed = 0;
          }
          remotes.clear();
          for (const other of msg.cars || []) upsertRemote(other, { snap: true });
          emitDrivers();
          sendState(true);
          return;
        }

        if (msg.type === "peer_joined" && msg.player) {
          upsertRemote(msg.player, { snap: true, roster: true });
        }

        if (msg.type === "peer_left") {
          remotes.delete(String(msg.playerId || ""));
          emitDrivers();
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
      const lag = Math.min(REMOTE_EXTRAPOLATE_MAX, Math.max(0, (now - remote.recvAt) / 1000));
      const predX = remote.tx + Math.cos(remote.th) * remote.ts * lag;
      const predY = remote.ty + Math.sin(remote.th) * remote.ts * lag * TRACK_ASPECT;
      const k = 1 - Math.exp(-dt * REMOTE_SMOOTH);
      remote.x += (predX - remote.x) * k;
      remote.y += (predY - remote.y) * k;
      remote.heading = lerpAngle(remote.heading, remote.th, k);
    }

    function paintCar(ctx, view, pose, color, name, carLen) {
      const px = view.x + pose.x * view.w;
      const py = view.y + pose.y * view.h;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, ISO_Y);
      ctx.rotate(pose.heading);
      drawCar(ctx, carLen, color);
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
        stepRemote(remote, dt, now);
        paintCar(ctx, view, remote, remote.color, remote.name, carLen);
      }
      paintCar(ctx, view, car, localMetaRef.current.color, localMetaRef.current.name, carLen);

      raf = window.requestAnimationFrame(tick);
    }

    sizeCanvas();
    connect();
    raf = window.requestAnimationFrame(tick);
    window.addEventListener("resize", sizeCanvas);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);

    return () => {
      disposed = true;
      connGen += 1;
      if (startRaceRef) startRaceRef.current = null;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeCanvas);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "leave" }));
          }
        } catch {
          /* ignore */
        }
        ws.onclose = null;
        closeSocket(ws);
        ws = null;
      }
    };
  }, [startRaceRef]);

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
