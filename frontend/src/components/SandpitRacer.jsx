import React, { useEffect, useRef } from "react";
import racingTrack from "../images/racing.png";
import { getLoggedInUserId, getLoggedInUserName } from "../utils/auth";
import { getSandpitRaceWsUrl } from "../utils/sandpitRaceWs";

const TRACK_W = 1672;
const TRACK_H = 941;
const ISO_Y = 0.58;
const START_X = 0.58;
const START_Y = 0.765;
const START_HEADING = Math.PI;
const STATE_SEND_MS = 50;

const DEFAULT_COLOR = { body: "#d61f26", cabin: "#b01820", stroke: "#8a1016" };

function containRect(cw, ch, iw, ih) {
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, scale };
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

    function upsertRemote(player) {
      if (!player?.id || String(player.id) === localId) return;
      remotes.set(String(player.id), {
        id: String(player.id),
        name: player.name || "Driver",
        color: player.color || DEFAULT_COLOR,
        x: player.x,
        y: player.y,
        heading: player.heading,
        speed: player.speed || 0,
      });
      emitDrivers();
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
          upsertRemote({ ...pose, speed: 0 });
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

    function connect() {
      ws = new WebSocket(getSandpitRaceWsUrl(localId, localMetaRef.current.name));

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "joined" && msg.player) {
          localMetaRef.current.color = msg.player.color || DEFAULT_COLOR;
          localMetaRef.current.name = msg.player.name || localMetaRef.current.name;
          car.x = msg.player.x;
          car.y = msg.player.y;
          car.heading = msg.player.heading;
          car.speed = 0;
          remotes.clear();
          for (const other of msg.cars || []) upsertRemote(other);
          emitDrivers();
          return;
        }

        if (msg.type === "peer_joined" && msg.player) {
          upsertRemote(msg.player);
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

      ws.onclose = () => {
        if (disposed) return;
        window.setTimeout(() => {
          if (!disposed) connect();
        }, 1200);
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

      const aspect = TRACK_W / TRACK_H;
      car.x += Math.cos(car.heading) * car.speed * dt;
      car.y += Math.sin(car.heading) * car.speed * dt * aspect;

      sendState();

      ctx.clearRect(0, 0, cw, ch);
      const carLen = view.w * 0.04;

      for (const remote of remotes.values()) {
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
      if (startRaceRef) startRaceRef.current = null;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeCanvas);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "leave" }));
          }
          ws.close();
        } catch {
          /* ignore */
        }
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
