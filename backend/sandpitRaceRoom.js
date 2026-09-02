const { WebSocketServer } = require("ws");
const { userHasAccessGrant } = require("./userAccessPermissions");

const PING_INTERVAL_MS = 15000;
const MAX_PLAYERS = 12;
const START_HEADING = Math.PI;
const GRID_ORIGIN_X = 0.565;
const GRID_ORIGIN_Y = 0.748;
const GRID_ROW_DX = 0.034;
const GRID_COL_DY = 0.03;

const CAR_COLORS = [
  { body: "#d61f26", cabin: "#b01820", stroke: "#8a1016" },
  { body: "#1e5ad6", cabin: "#1648b0", stroke: "#0f3478" },
  { body: "#2db84a", cabin: "#1e8a34", stroke: "#146024" },
  { body: "#f0c400", cabin: "#c9a000", stroke: "#8a6e00" },
  { body: "#e85d04", cabin: "#c44a00", stroke: "#8a3400" },
  { body: "#9b5de5", cabin: "#7b3cc4", stroke: "#54288a" },
  { body: "#00bbf9", cabin: "#0099cc", stroke: "#006688" },
  { body: "#f15bb5", cabin: "#c44a90", stroke: "#8a3464" },
  { body: "#ffffff", cabin: "#d0d0d0", stroke: "#666666" },
  { body: "#111111", cabin: "#333333", stroke: "#000000" },
  { body: "#7f4f24", cabin: "#5c3919", stroke: "#3d2410" },
  { body: "#4cc9f0", cabin: "#3aa0c0", stroke: "#1e6078" },
];

const POSE_MEMORY_MS = 120000;

/** @type {Map<import('ws').WebSocket, object>} */
const players = new Map();
/** @type {Map<string, { x: number, y: number, heading: number, speed: number, at: number }>} */
const lastPoses = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const leaveTimers = new Map();

function clearLeaveTimer(userId) {
  const key = String(userId);
  const timer = leaveTimers.get(key);
  if (!timer) return false;
  clearTimeout(timer);
  leaveTimers.delete(key);
  return true;
}

function stillInRoom(userId) {
  return Array.from(players.values()).some((p) => String(p.userId) === String(userId));
}

function rememberPose(p) {
  if (!p) return;
  lastPoses.set(String(p.userId), {
    x: p.x,
    y: p.y,
    heading: p.heading,
    speed: p.speed,
    seq: p.seq || 0,
    at: Date.now(),
  });
}

function recalledPose(userId) {
  const saved = lastPoses.get(String(userId));
  if (!saved) return null;
  if (Date.now() - saved.at > POSE_MEMORY_MS) {
    lastPoses.delete(String(userId));
    return null;
  }
  return saved;
}

function gridPose(index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: GRID_ORIGIN_X + row * GRID_ROW_DX,
    y: GRID_ORIGIN_Y + col * GRID_COL_DY,
    heading: START_HEADING,
    speed: 0,
  };
}

function colorForUser(userId) {
  const n = Number(userId);
  const i = Number.isFinite(n) ? Math.abs(n) : 0;
  return CAR_COLORS[i % CAR_COLORS.length];
}

function publicPlayer(p) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    color: p.color,
    x: p.x,
    y: p.y,
    heading: p.heading,
    speed: p.speed,
    seq: p.seq || 0,
    at: p.lastInputAt || Date.now(),
  };
}

function allPublicPlayers() {
  return Array.from(players.values()).map(publicPlayer);
}

function broadcast(msg, exceptWs = null) {
  const raw = JSON.stringify(msg);
  for (const ws of players.keys()) {
    if (ws !== exceptWs && ws.readyState === 1) {
      ws.send(raw);
    }
  }
}

function pruneStaleConnections() {
  for (const [ws, p] of players.entries()) {
    if (ws.readyState === 2 || ws.readyState === 3) {
      rememberPose(p);
      players.delete(ws);
    }
  }
}

function removeSocketForUser(userId) {
  for (const [ws, p] of players.entries()) {
    if (String(p.userId) === String(userId)) {
      rememberPose(p);
      players.delete(ws);
      try {
        ws.close(4000, "replaced");
      } catch {
        /* ignore */
      }
      return p;
    }
  }
  return null;
}

function removePlayer(ws, { notify = true, immediate = false } = {}) {
  const p = players.get(ws);
  if (!p) return;
  rememberPose(p);
  players.delete(ws);
  if (!notify) return;

  const key = String(p.userId);
  clearLeaveTimer(key);
  if (immediate) {
    broadcast({ type: "peer_left", playerId: p.id, userId: p.userId });
    return;
  }
  leaveTimers.set(
    key,
    setTimeout(() => {
      leaveTimers.delete(key);
      if (stillInRoom(p.userId)) return;
      broadcast({ type: "peer_left", playerId: p.id, userId: p.userId });
    }, 3000)
  );
}

function lineUpAllPlayers() {
  const list = Array.from(players.values()).sort((a, b) => Number(a.userId) - Number(b.userId));
  list.forEach((p, i) => {
    const pose = gridPose(i);
    p.x = pose.x;
    p.y = pose.y;
    p.heading = pose.heading;
    p.speed = 0;
    rememberPose(p);
  });
  return list.map(publicPlayer);
}

function applyIncomingMessage(ws, raw, { silent = false } = {}) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }

  const p = players.get(ws);
  if (!p) return;
  ws.isAlive = true;
  ws.missedPongs = 0;
  p.lastInputAt = Date.now();

  if (msg.type === "leave") {
    removePlayer(ws, { immediate: true });
    try {
      ws.close(1000, "left");
    } catch {
      /* ignore */
    }
    return;
  }

  if (msg.type === "start_race") {
    if (silent) return;
    const cars = lineUpAllPlayers();
    broadcast({ type: "start_race", cars });
    return;
  }

  if (msg.type !== "state") return;
  if (typeof msg.x === "number" && Number.isFinite(msg.x)) p.x = msg.x;
  if (typeof msg.y === "number" && Number.isFinite(msg.y)) p.y = msg.y;
  if (typeof msg.heading === "number" && Number.isFinite(msg.heading)) p.heading = msg.heading;
  if (typeof msg.speed === "number" && Number.isFinite(msg.speed)) p.speed = msg.speed;
  if (typeof msg.seq === "number" && Number.isFinite(msg.seq)) p.seq = msg.seq;
  rememberPose(p);
  if (!silent) {
    broadcast({ type: "peer_state", player: publicPlayer(p) }, ws);
  }
}

function parseJoinQuery(reqUrl) {
  try {
    const url = new URL(reqUrl, "http://localhost");
    const userId = Number(url.searchParams.get("userId"));
    const name = String(url.searchParams.get("name") || "Driver").trim().slice(0, 40);
    return {
      userId: Number.isFinite(userId) ? userId : null,
      name: name || "Driver",
    };
  } catch {
    return { userId: null, name: "Driver" };
  }
}

function attachSandpitRaceWebSocket(httpServer, { getPool }) {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      return;
    }
    if (pathname !== "/ws/sandpit-race") return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  const pingTimer = setInterval(() => {
    for (const [ws, p] of players.entries()) {
      if (p && Date.now() - (p.lastInputAt || 0) > 45000) {
        removePlayer(ws);
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
      try {
        ws.ping();
      } catch {
        /* ignore */
      }
    }
  }, PING_INTERVAL_MS);

  wss.on("close", () => clearInterval(pingTimer));

  wss.on("connection", (ws, req) => {
    pruneStaleConnections();

    const join = parseJoinQuery(req.url);
    if (join.userId == null) {
      try {
        ws.send(JSON.stringify({ type: "denied", reason: "auth" }));
      } catch {
        /* ignore */
      }
      ws.close();
      return;
    }

    const pending = [];
    ws.isAlive = true;
    ws.missedPongs = 0;
    ws.on("pong", () => {
      ws.isAlive = true;
      ws.missedPongs = 0;
    });
    ws.on("message", (raw) => {
      if (!players.has(ws)) {
        if (pending.length < 40) pending.push(raw);
        return;
      }
      applyIncomingMessage(ws, raw);
    });
    ws.on("close", () => removePlayer(ws));

    (async () => {
      const pool = typeof getPool === "function" ? getPool() : null;
      const allowed = await userHasAccessGrant(pool, join.userId, "sandpit");
      if (ws.readyState !== 1) return;

      if (!allowed) {
        try {
          ws.send(JSON.stringify({ type: "denied", reason: "permission" }));
        } catch {
          /* ignore */
        }
        ws.close();
        return;
      }

      if (
        players.size >= MAX_PLAYERS &&
        !Array.from(players.values()).some((p) => String(p.userId) === String(join.userId))
      ) {
        try {
          ws.send(JSON.stringify({ type: "full" }));
        } catch {
          /* ignore */
        }
        ws.close();
        return;
      }

      const previous = removeSocketForUser(join.userId);
      const leavePending = clearLeaveTimer(join.userId);
      const remembered = previous || recalledPose(join.userId);
      const wasAlreadyHere = Boolean(previous || leavePending || remembered);
      const pose = remembered
        ? {
            x: remembered.x,
            y: remembered.y,
            heading: remembered.heading,
            speed: remembered.speed || 0,
          }
        : gridPose(players.size);

      const player = {
        id: String(join.userId),
        userId: join.userId,
        name: join.name,
        color: colorForUser(join.userId),
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        speed: pose.speed,
        seq: remembered && Number.isFinite(remembered.seq) ? remembered.seq : 0,
        lastInputAt: Date.now(),
      };
      players.set(ws, player);

      for (const raw of pending) applyIncomingMessage(ws, raw, { silent: true });
      pending.length = 0;

      try {
        ws.send(
          JSON.stringify({
            type: "joined",
            player: publicPlayer(player),
            cars: allPublicPlayers(),
          })
        );
      } catch {
        /* ignore */
      }

      if (wasAlreadyHere) {
        broadcast({ type: "peer_state", player: publicPlayer(player) }, ws);
      } else {
        broadcast({ type: "peer_joined", player: publicPlayer(player) }, ws);
      }
    })().catch(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  });

  return wss;
}

module.exports = { attachSandpitRaceWebSocket };
