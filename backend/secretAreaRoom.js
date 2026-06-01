const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const MAX_PLAYERS = 2;
const PING_INTERVAL_MS = 15000;

/** @type {Map<import('ws').WebSocket, { id: string, slot: number, x: number, z: number, ry: number, moving: boolean, dance: string | null, danceT: number, trapRow: number, trapCol: number, trapElapsed: number }>} */
const players = new Map();

function publicPlayer(p) {
  return {
    id: p.id,
    slot: p.slot,
    x: p.x,
    z: p.z,
    ry: p.ry,
    moving: p.moving,
    dance: p.dance ?? null,
    danceT: p.danceT ?? 0,
    trapRow: p.trapRow ?? -1,
    trapCol: p.trapCol ?? -1,
    trapElapsed: p.trapElapsed ?? 0,
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

function spawnForSlot(slot) {
  return slot === 0 ? { x: -6, z: 0, ry: 0 } : { x: 6, z: 0, ry: 0 };
}

/** Drop closed/closing sockets so slot 0 frees when someone leaves. */
function pruneStaleConnections() {
  for (const [ws] of players.entries()) {
    if (ws.readyState === 3 || ws.readyState === 2) {
      players.delete(ws);
    }
  }
}

function nextAvailableSlot() {
  const used = new Set(Array.from(players.values()).map((p) => p.slot));
  if (!used.has(0)) return 0;
  if (!used.has(1)) return 1;
  return -1;
}

function removePlayer(ws, { notify = true } = {}) {
  const p = players.get(ws);
  if (!p) return;
  players.delete(ws);
  if (notify) {
    broadcast({ type: "peer_left", playerId: p.id, slot: p.slot });
  }
}

function attachSecretAreaWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/secret-area" });

  const pingTimer = setInterval(() => {
    for (const [ws] of players.entries()) {
      if (ws.isAlive === false) {
        removePlayer(ws);
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        removePlayer(ws);
      }
    }
  }, PING_INTERVAL_MS);

  wss.on("close", () => clearInterval(pingTimer));

  wss.on("connection", (ws) => {
    pruneStaleConnections();

    const slot = nextAvailableSlot();
    if (slot < 0) {
      ws.send(JSON.stringify({ type: "full" }));
      ws.close();
      return;
    }

    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const spawn = spawnForSlot(slot);
    const player = {
      id: crypto.randomUUID(),
      slot,
      x: spawn.x,
      z: spawn.z,
      ry: spawn.ry,
      moving: false,
      dance: null,
      danceT: 0,
      trapRow: -1,
      trapCol: -1,
      trapElapsed: 0,
    };
    players.set(ws, player);

    ws.send(
      JSON.stringify({
        type: "joined",
        slot: player.slot,
        playerId: player.id,
        players: allPublicPlayers(),
      })
    );

    broadcast({ type: "peer_joined", player: publicPlayer(player) }, ws);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === "leave") {
        removePlayer(ws);
        try {
          ws.close(1000, "left");
        } catch {
          /* ignore */
        }
        return;
      }

      if (!players.has(ws)) return;
      const p = players.get(ws);

      if (msg.type !== "state") return;
      if (typeof msg.x === "number") p.x = msg.x;
      if (typeof msg.z === "number") p.z = msg.z;
      if (typeof msg.ry === "number") p.ry = msg.ry;
      p.moving = !!msg.moving;
      if (msg.dance === "moonwalk" || msg.dance === "spin" || msg.dance === "lean") {
        p.dance = msg.dance;
        p.danceT = typeof msg.danceT === "number" ? msg.danceT : 0;
      } else {
        p.dance = null;
        p.danceT = 0;
      }
      if (typeof msg.trapRow === "number") p.trapRow = msg.trapRow;
      if (typeof msg.trapCol === "number") p.trapCol = msg.trapCol;
      if (typeof msg.trapElapsed === "number" && msg.trapElapsed > 0) {
        p.trapElapsed = msg.trapElapsed;
      } else {
        p.trapRow = -1;
        p.trapCol = -1;
        p.trapElapsed = 0;
      }
      broadcast(
        {
          type: "peer_state",
          player: publicPlayer(p),
        },
        ws
      );
    });

    const onGone = () => removePlayer(ws);
    ws.on("close", onGone);
    ws.on("error", onGone);
  });

  return wss;
}

module.exports = { attachSecretAreaWebSocket, MAX_PLAYERS };
