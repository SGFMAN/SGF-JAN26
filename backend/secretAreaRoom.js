const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const MAX_PLAYERS = 2;

/** @type {Map<import('ws').WebSocket, { id: string, slot: number, x: number, z: number, ry: number, moving: boolean }>} */
const players = new Map();

function publicPlayer(p) {
  return {
    id: p.id,
    slot: p.slot,
    x: p.x,
    z: p.z,
    ry: p.ry,
    moving: p.moving,
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

function attachSecretAreaWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/secret-area" });

  wss.on("connection", (ws) => {
    if (players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ type: "full" }));
      ws.close();
      return;
    }

    const slot = players.size;
    const spawn = spawnForSlot(slot);
    const player = {
      id: crypto.randomUUID(),
      slot,
      x: spawn.x,
      z: spawn.z,
      ry: spawn.ry,
      moving: false,
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
      if (msg.type !== "state" || !players.has(ws)) return;
      const p = players.get(ws);
      if (typeof msg.x === "number") p.x = msg.x;
      if (typeof msg.z === "number") p.z = msg.z;
      if (typeof msg.ry === "number") p.ry = msg.ry;
      p.moving = !!msg.moving;
      broadcast(
        {
          type: "peer_state",
          player: publicPlayer(p),
        },
        ws
      );
    });

    ws.on("close", () => {
      const p = players.get(ws);
      if (!p) return;
      players.delete(ws);
      broadcast({ type: "peer_left", playerId: p.id, slot: p.slot });
    });
  });

  return wss;
}

module.exports = { attachSecretAreaWebSocket, MAX_PLAYERS };
