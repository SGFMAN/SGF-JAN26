import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { createHumanoidRig, NIGHT_WALKER_HERO_COLORS } from "../utils/nightWalkerHumanoid";
import { getSecretAreaWsUrl } from "../utils/secretAreaWs";

/** Playable square arena (metres). */
const ARENA_SIZE_M = 50;
const GROUND_CELL_SIZE = 5;
const GROUND_TILE_COUNT = ARENA_SIZE_M / GROUND_CELL_SIZE;
const FLOOR_HALF_M = (GROUND_TILE_COUNT * GROUND_CELL_SIZE) / 2;
const PLAYER_COLLISION_RADIUS = 0.55;
const WALK_BOUNDS = FLOOR_HALF_M - PLAYER_COLLISION_RADIUS;
const WALL_HEIGHT_M = 10;
const WALL_THICKNESS_M = 0.65;
const WALL_GREY = "#8a8a8e";
const TERMINAL_DESK_SCALE = 2.5;
const CHARACTER_SCALE = 0.5;
const PLAYER_Y = 4.1 * CHARACTER_SCALE;
const MOVE_SPEED = 7.5;
const TURN_SPEED = 2.8;
const CAMERA_DISTANCE = 12;
const CAMERA_HEIGHT = 7 * CHARACTER_SCALE;
const CAMERA_LOOK_Y = 2.3 * CHARACTER_SCALE;
const STATE_SEND_INTERVAL_MS = 50;
const PI2 = Math.PI * 2;
const GROUND_GREEN = "#3a6b35";
const GROUND_GREEN_DARK = "#2a4f26";

/** Local XZ footprints (unscaled) for desk + tower + monitor. */
const DESK_COLLISION_LOCAL = [
  { cx: 0, cz: 0.02, hx: 0.78, hz: 0.46 },
  { cx: 0.34, cz: -0.2, hx: 0.14, hz: 0.24 },
  { cx: 0, cz: -0.12, hx: 0.32, hz: 0.14 },
];

const SLOT_COLORS = [
  { ...NIGHT_WALKER_HERO_COLORS, withHeadLamp: false },
  {
    skinColor: "#e7be92",
    clothColor: "#43a047",
    darkClothColor: "#2e6b32",
    jointColor: "#d9ab80",
    withHeadLamp: false,
  },
];

function applyWalkCycle(armRig, legRig, walkPhase) {
  const armSwing = Math.sin(walkPhase) * 0.62;
  const elbowBend = Math.max(0, Math.sin(walkPhase + 0.4)) * 0.24;
  const legSwing = Math.sin(walkPhase) * 0.75;
  const kneeBend = Math.max(0, Math.sin(walkPhase + 0.2)) * 0.42;
  const footRock = Math.sin(walkPhase + 0.8) * 0.2;

  if (armRig.left && armRig.right) {
    armRig.left.armPivot.rotation.x = armSwing;
    armRig.right.armPivot.rotation.x = -armSwing;
    armRig.left.forearmPivot.rotation.x = -elbowBend;
    armRig.right.forearmPivot.rotation.x = -Math.max(0, -Math.sin(walkPhase + 0.4)) * 0.24;
    armRig.left.hand.rotation.x = -armSwing * 0.25;
    armRig.right.hand.rotation.x = armSwing * 0.25;
  }

  if (legRig.left && legRig.right) {
    legRig.left.legPivot.rotation.x = -legSwing;
    legRig.right.legPivot.rotation.x = legSwing;
    legRig.left.lowerLegPivot.rotation.x = kneeBend;
    legRig.right.lowerLegPivot.rotation.x = Math.max(0, -Math.sin(walkPhase + 0.2)) * 0.42;
    legRig.left.foot.rotation.x = legRig.left.baseFootX + footRock;
    legRig.right.foot.rotation.x = legRig.right.baseFootX - footRock;
  }
}

function resetPose(armRig, legRig) {
  const reset = (current, target) => current + (target - current) * 0.15;
  if (armRig.left && armRig.right) {
    armRig.left.armPivot.rotation.x = reset(armRig.left.armPivot.rotation.x, 0);
    armRig.right.armPivot.rotation.x = reset(armRig.right.armPivot.rotation.x, 0);
    armRig.left.forearmPivot.rotation.x = reset(armRig.left.forearmPivot.rotation.x, 0);
    armRig.right.forearmPivot.rotation.x = reset(armRig.right.forearmPivot.rotation.x, 0);
    armRig.left.hand.rotation.x = reset(armRig.left.hand.rotation.x, armRig.left.baseHandX);
    armRig.right.hand.rotation.x = reset(armRig.right.hand.rotation.x, armRig.right.baseHandX);
  }
  if (legRig.left && legRig.right) {
    legRig.left.legPivot.rotation.x = reset(legRig.left.legPivot.rotation.x, legRig.left.baseLegPivotX);
    legRig.right.legPivot.rotation.x = reset(legRig.right.legPivot.rotation.x, legRig.right.baseLegPivotX);
    legRig.left.lowerLegPivot.rotation.x = reset(
      legRig.left.lowerLegPivot.rotation.x,
      legRig.left.baseLowerPivotX
    );
    legRig.right.lowerLegPivot.rotation.x = reset(
      legRig.right.lowerLegPivot.rotation.x,
      legRig.right.baseLowerPivotX
    );
    legRig.left.foot.rotation.x = reset(legRig.left.foot.rotation.x, legRig.left.baseFootX);
    legRig.right.foot.rotation.x = reset(legRig.right.foot.rotation.x, legRig.right.baseFootX);
  }
}

function localBoxToWorldAabb(gx, gz, rotY, scale, { cx, cz, hx, hz }) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const shx = hx * scale;
  const shz = hz * scale;
  const scx = cx * scale;
  const scz = cz * scale;
  const corners = [
    [scx - shx, scz - shz],
    [scx + shx, scz - shz],
    [scx - shx, scz + shz],
    [scx + shx, scz + shz],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = gx + lx * cos - lz * sin;
    const wz = gz + lx * sin + lz * cos;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    hx: (maxX - minX) / 2,
    hz: (maxZ - minZ) / 2,
  };
}

function buildDeskWorldColliders(deskGroup) {
  const scale = deskGroup.scale.x;
  const { x: gx, z: gz } = deskGroup.position;
  const rotY = deskGroup.rotation.y;
  return DESK_COLLISION_LOCAL.map((box) => localBoxToWorldAabb(gx, gz, rotY, scale, box));
}

function circleHitsAabb(px, pz, radius, box) {
  const closestX = Math.max(box.x - box.hx, Math.min(px, box.x + box.hx));
  const closestZ = Math.max(box.z - box.hz, Math.min(pz, box.z + box.hz));
  const dx = px - closestX;
  const dz = pz - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

function clampXZ(x, z, bound) {
  return {
    x: Math.max(-bound, Math.min(bound, x)),
    z: Math.max(-bound, Math.min(bound, z)),
  };
}

function remotePlayerList(remotePlayers) {
  if (remotePlayers instanceof Map) {
    return [...remotePlayers.values()];
  }
  return [...remotePlayers];
}

function circleHitsAnyDesk(px, pz, radius, deskColliders) {
  for (const box of deskColliders) {
    if (circleHitsAabb(px, pz, radius, box)) return true;
  }
  return false;
}

function pushOutOfAabb(px, pz, radius, box) {
  const closestX = Math.max(box.x - box.hx, Math.min(px, box.x + box.hx));
  const closestZ = Math.max(box.z - box.hz, Math.min(pz, box.z + box.hz));
  const dx = px - closestX;
  const dz = pz - closestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) return { x: px, z: pz };
  const dist = Math.sqrt(Math.max(distSq, 1e-8));
  const push = radius - dist;
  return { x: px + (dx / dist) * push, z: pz + (dz / dist) * push };
}

function resolveDeskCollisions(px, pz, radius, deskColliders, walkBound) {
  let x = px;
  let z = pz;
  for (let i = 0; i < deskColliders.length; i += 1) {
    const next = pushOutOfAabb(x, z, radius, deskColliders[i]);
    x = next.x;
    z = next.z;
  }
  return clampXZ(x, z, walkBound);
}

/** Push local player out of overlap with remotes (also uses network target to reduce lerping-into stuck). */
function separateFromPlayers(px, pz, radius, remotePlayers, selfGroup, walkBound) {
  const minDist = radius * 2;
  let x = px;
  let z = pz;
  const others = remotePlayerList(remotePlayers);

  for (let iter = 0; iter < 6; iter += 1) {
    let changed = false;
    for (const remote of others) {
      if (!remote?.group || remote.group === selfGroup) continue;

      const points = [
        { x: remote.group.position.x, z: remote.group.position.z },
        { x: remote.targetX, z: remote.targetZ },
      ];

      for (const { x: rx, z: rz } of points) {
        let dx = x - rx;
        let dz = z - rz;
        let distSq = dx * dx + dz * dz;
        if (distSq >= minDist * minDist) continue;

        if (distSq < 1e-8) {
          const angle = Math.atan2(x - rx, z - rz) + 0.3;
          x = rx + Math.sin(angle) * minDist;
          z = rz + Math.cos(angle) * minDist;
        } else {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          x += (dx / dist) * overlap;
          z += (dz / dist) * overlap;
        }

        changed = true;
      }
    }

    const clamped = clampXZ(x, z, walkBound);
    x = clamped.x;
    z = clamped.z;
    if (!changed) break;
  }

  return { x, z };
}

function slideMoveFromCircle(px, pz, ox, oz, dx, dz, rx, rz, minDist) {
  const mx = ox + dx;
  const mz = oz + dz;
  let sdx = mx - rx;
  let sdz = mz - rz;
  let distSq = sdx * sdx + sdz * sdz;
  if (distSq >= minDist * minDist) return { x: mx, z: mz };

  const mvx = mx - ox;
  const mvz = mz - oz;
  if (mvx * mvx + mvz * mvz < 1e-10) return { x: ox, z: oz };

  if (distSq < 1e-8) return { x: ox, z: oz };

  const dist = Math.sqrt(distSq);
  sdx /= dist;
  sdz /= dist;
  const mvLen = Math.sqrt(mvx * mvx + mvz * mvz);
  const mvnx = mvx / mvLen;
  const mvnz = mvz / mvLen;
  const dot = mvnx * sdx + mvnz * sdz;
  const slideX = mvx - sdx * dot * mvLen;
  const slideZ = mvz - sdz * dot * mvLen;

  return { x: ox + slideX, z: oz + slideZ };
}

function applyPlayerMove(player, dx, dz, walkBound, deskColliders, remotePlayers) {
  if (dx === 0 && dz === 0) return;

  const radius = PLAYER_COLLISION_RADIUS;
  const minDist = radius * 2;
  const ox = player.position.x;
  const oz = player.position.z;
  const others = remotePlayerList(remotePlayers);

  let { x: px, z: pz } = clampXZ(ox + dx, oz + dz, walkBound);

  if (circleHitsAnyDesk(px, pz, radius, deskColliders)) {
    const tx = clampXZ(ox + dx, oz, walkBound);
    const tz = clampXZ(ox, oz + dz, walkBound);
    if (!circleHitsAnyDesk(tx.x, tx.z, radius, deskColliders)) {
      px = tx.x;
      pz = tx.z;
    } else if (!circleHitsAnyDesk(ox, tz.z, radius, deskColliders)) {
      px = ox;
      pz = tz.z;
    } else {
      return;
    }
  }

  for (const remote of others) {
    if (!remote?.group || remote.group === selfGroup) continue;
    const slid = slideMoveFromCircle(
      px,
      pz,
      ox,
      oz,
      px - ox,
      pz - oz,
      remote.group.position.x,
      remote.group.position.z,
      minDist
    );
    px = clampXZ(slid.x, slid.z, walkBound).x;
    pz = clampXZ(slid.x, slid.z, walkBound).z;
  }

  ({ x: px, z: pz } = resolveDeskCollisions(px, pz, radius, deskColliders, walkBound));
  ({ x: px, z: pz } = separateFromPlayers(px, pz, radius, remotePlayers, player, walkBound));

  player.position.x = px;
  player.position.z = pz;
}

function resolveLocalPlayerOverlaps(player, walkBound, deskColliders, remotePlayers) {
  const radius = PLAYER_COLLISION_RADIUS;
  let { x: px, z: pz } = resolveDeskCollisions(
    player.position.x,
    player.position.z,
    radius,
    deskColliders,
    walkBound
  );
  ({ x: px, z: pz } = separateFromPlayers(px, pz, radius, remotePlayers, player, walkBound));
  player.position.x = px;
  player.position.z = pz;
}

function addPlayerToScene(scene, slot) {
  const rig = createHumanoidRig(SLOT_COLORS[slot]);
  rig.group.scale.setScalar(CHARACTER_SCALE);
  scene.add(rig.group);
  return {
    id: null,
    slot,
    group: rig.group,
    armRig: rig.armRig,
    legRig: rig.legRig,
    bodyMeshes: rig.bodyMeshes,
    materials: rig.materials,
    walkPhase: 0,
    moving: false,
    targetX: 0,
    targetZ: 0,
    targetRy: 0,
  };
}

function buildCheckeredGround(scene) {
  const half = FLOOR_HALF_M;
  const cols = GROUND_TILE_COUNT;
  const tileGeom = new THREE.PlaneGeometry(GROUND_CELL_SIZE, GROUND_CELL_SIZE);
  const matLight = new THREE.MeshStandardMaterial({
    color: GROUND_GREEN,
    roughness: 0.95,
    metalness: 0.04,
  });
  const matDark = new THREE.MeshStandardMaterial({
    color: GROUND_GREEN_DARK,
    roughness: 0.95,
    metalness: 0.04,
  });
  const group = new THREE.Group();
  for (let row = 0; row < cols; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tile = new THREE.Mesh(tileGeom, (row + col) % 2 === 0 ? matLight : matDark);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(
        -half + col * GROUND_CELL_SIZE + GROUND_CELL_SIZE / 2,
        0,
        -half + row * GROUND_CELL_SIZE + GROUND_CELL_SIZE / 2
      );
      group.add(tile);
    }
  }
  scene.add(group);
  return { group, tileGeom, matLight, matDark };
}

function buildPerimeterWalls(scene) {
  const wallMat = new THREE.MeshStandardMaterial({
    color: WALL_GREY,
    roughness: 0.88,
    metalness: 0.06,
  });
  const group = new THREE.Group();
  const h = WALL_HEIGHT_M;
  const t = WALL_THICKNESS_M;
  const floorSpan = GROUND_TILE_COUNT * GROUND_CELL_SIZE;
  const span = floorSpan + t;
  const geomAlongX = new THREE.BoxGeometry(span, h, t);
  const geomAlongZ = new THREE.BoxGeometry(t, h, span);

  const north = new THREE.Mesh(geomAlongX, wallMat);
  north.position.set(0, h / 2, FLOOR_HALF_M + t / 2);
  group.add(north);

  const south = new THREE.Mesh(geomAlongX, wallMat);
  south.position.set(0, h / 2, -FLOOR_HALF_M - t / 2);
  group.add(south);

  const east = new THREE.Mesh(geomAlongZ, wallMat);
  east.position.set(FLOOR_HALF_M + t / 2, h / 2, 0);
  group.add(east);

  const west = new THREE.Mesh(geomAlongZ, wallMat);
  west.position.set(-FLOOR_HALF_M - t / 2, h / 2, 0);
  group.add(west);

  scene.add(group);
  return { group, geomAlongX, geomAlongZ, wallMat };
}

/** Desk + terminal in the north-east corner (faces toward room centre). */
function buildCornerTerminalDesk(scene) {
  const geoms = [];
  const materials = [];
  const regGeom = (geometry) => {
    geoms.push(geometry);
    return geometry;
  };
  const regMat = (params) => {
    const m = new THREE.MeshStandardMaterial(params);
    materials.push(m);
    return m;
  };

  const group = new THREE.Group();
  const cornerInset = 5;
  group.position.set(FLOOR_HALF_M - cornerInset, 0, FLOOR_HALF_M - cornerInset);
  group.rotation.y = -Math.PI * 0.75;

  const woodMat = regMat({ color: "#6b5344", roughness: 0.82 });
  const metalMat = regMat({ color: "#3a3f48", roughness: 0.55, metalness: 0.35 });
  const legMat = regMat({ color: "#2a2a30", roughness: 0.9 });
  const bezelMat = regMat({ color: "#1e2228", roughness: 0.72 });
  const screenMat = regMat({
    color: "#061a10",
    emissive: "#22ff88",
    emissiveIntensity: 0.9,
    roughness: 0.35,
  });

  const deskH = 0.76;
  const topW = 1.5;
  const topD = 0.85;
  const topT = 0.07;

  const top = new THREE.Mesh(regGeom(new THREE.BoxGeometry(topW, topT, topD)), woodMat);
  top.position.y = deskH;
  group.add(top);

  const legH = deskH - topT / 2;
  const legGeom = regGeom(new THREE.BoxGeometry(0.09, legH, 0.09));
  const legInset = 0.12;
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(sx * (topW / 2 - legInset), legH / 2, sz * (topD / 2 - legInset));
    group.add(leg);
  }

  const monW = 0.58;
  const monH = 0.4;
  const monD = 0.05;
  const monY = deskH + topT / 2 + monH / 2 + 0.08;
  const monZ = -0.12;

  const stand = new THREE.Mesh(regGeom(new THREE.BoxGeometry(0.12, 0.06, 0.18)), metalMat);
  stand.position.set(0, deskH + topT / 2 + 0.03, monZ);
  group.add(stand);

  const monitor = new THREE.Mesh(regGeom(new THREE.BoxGeometry(monW, monH, monD)), bezelMat);
  monitor.position.set(0, monY, monZ);
  group.add(monitor);

  const screen = new THREE.Mesh(regGeom(new THREE.BoxGeometry(monW * 0.88, monH * 0.82, 0.02)), screenMat);
  screen.position.set(0, monY, monZ + monD / 2 + 0.012);
  group.add(screen);

  const keyboard = new THREE.Mesh(regGeom(new THREE.BoxGeometry(0.52, 0.025, 0.18)), metalMat);
  keyboard.position.set(0.05, deskH + topT / 2 + 0.015, 0.22);
  group.add(keyboard);

  const towerH = 0.48;
  const tower = new THREE.Mesh(regGeom(new THREE.BoxGeometry(0.22, towerH, 0.42)), metalMat);
  // Right of desk centre, shifted toward front (keyboard side) to clear back corner legs.
  tower.position.set(0.34, towerH / 2, -0.2);
  group.add(tower);

  group.scale.setScalar(TERMINAL_DESK_SCALE);
  scene.add(group);
  return { group, geoms, materials };
}

function disposePlayer(scene, player) {
  scene.remove(player.group);
  player.bodyMeshes.forEach((mesh) => mesh.geometry.dispose());
  player.materials.forEach((m) => m.dispose());
}

function leaveSecretAreaSocket(socket) {
  if (!socket) return;
  try {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "leave" }));
    }
  } catch {
    /* ignore */
  }
  try {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "client_leave");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Secret area — up to two players via WebSocket; arrow keys move your character.
 * @param {{ onRoomFull?: () => void, disconnectRef?: React.MutableRefObject<(() => void) | null> }} props
 */
export default function NightWalkerCharacterWalk({ onRoomFull, disconnectRef }) {
  const mountRef = useRef(null);
  const onRoomFullRef = useRef(onRoomFull);
  onRoomFullRef.current = onRoomFull;

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return undefined;

    let ws = null;
    let joined = false;
    let disposed = false;
    let localSlot = 0;
    let localPlayerId = null;
    let rafId = 0;
    let lastStateSend = 0;
    let lastMovingSent = false;

    const remotes = new Map();

    const disconnect = () => {
      const socket = ws;
      ws = null;
      leaveSecretAreaSocket(socket);
    };

    if (disconnectRef) {
      disconnectRef.current = disconnect;
    }

    const onPageHide = () => disconnect();
    window.addEventListener("pagehide", onPageHide);

    const connect = () => {
      ws = new WebSocket(getSecretAreaWsUrl());

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "full") {
          onRoomFullRef.current?.();
          return;
        }

        if (msg.type === "joined" && !joined) {
          joined = true;
          localSlot = msg.slot;
          localPlayerId = msg.playerId;
          startScene(msg.players || []);
          return;
        }

        if (!sceneStarted) return;

        if (msg.type === "peer_joined" && msg.player && msg.player.id !== localPlayerId) {
          ensureRemote(msg.player);
        }

        if (msg.type === "peer_state" && msg.player && msg.player.id !== localPlayerId) {
          const remote = remotes.get(msg.player.id);
          if (remote) {
            remote.targetX = msg.player.x;
            remote.targetZ = msg.player.z;
            remote.targetRy = msg.player.ry;
            remote.moving = !!msg.player.moving;
          } else {
            ensureRemote(msg.player);
          }
        }

        if (msg.type === "peer_left" && msg.playerId) {
          removeRemote(msg.playerId);
        }
      };

    };

    let sceneStarted = false;
    let scene = null;
    let renderer = null;
    let localPlayer = null;
    let groundTiles = null;
    let perimeterWalls = null;
    let cornerTerminal = null;
    let deskColliders = [];
    let animateFn = null;

    function ensureRemote(playerData) {
      if (playerData.id === localPlayerId || remotes.has(playerData.id)) return;
      const remote = addPlayerToScene(scene, playerData.slot);
      remote.id = playerData.id;
      remote.group.position.set(playerData.x, PLAYER_Y, playerData.z);
      remote.group.rotation.y = playerData.ry;
      remote.targetX = playerData.x;
      remote.targetZ = playerData.z;
      remote.targetRy = playerData.ry;
      remote.moving = !!playerData.moving;
      remotes.set(playerData.id, remote);
    }

    function removeRemote(playerId) {
      const remote = remotes.get(playerId);
      if (!remote) return;
      disposePlayer(scene, remote);
      remotes.delete(playerId);
    }

    function sendState(x, z, ry, moving) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "state", x, z, ry, moving }));
    }

    function startScene(initialPlayers) {
      if (sceneStarted || disposed) return;
      sceneStarted = true;

      scene = new THREE.Scene();
      scene.background = new THREE.Color("#061127");
      scene.fog = new THREE.Fog("#0a1830", 28, 72);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
      mountEl.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(
        60,
        mountEl.clientWidth / mountEl.clientHeight,
        0.1,
        400
      );

      scene.add(new THREE.HemisphereLight(0x8bb6ff, 0x102030, 0.42));
      const dir = new THREE.DirectionalLight(0x9ab8ff, 0.52);
      dir.position.set(26, 34, 12);
      scene.add(dir);

      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(6, 24, 20),
        new THREE.MeshStandardMaterial({
          color: "#d9e6ff",
          emissive: "#6a86c9",
          emissiveIntensity: 0.35,
        })
      );
      moon.position.set(-38, 48, -52);
      scene.add(moon);

      groundTiles = buildCheckeredGround(scene);
      perimeterWalls = buildPerimeterWalls(scene);
      cornerTerminal = buildCornerTerminalDesk(scene);
      cornerTerminal.group.updateMatrixWorld(true);
      deskColliders = buildDeskWorldColliders(cornerTerminal.group);

      localPlayer = addPlayerToScene(scene, localSlot);
      localPlayer.id = localPlayerId;
      const spawn = initialPlayers.find((p) => p.id === localPlayerId);
      const startX = spawn?.x ?? (localSlot === 0 ? -6 : 6);
      const startZ = spawn?.z ?? 0;
      const startRy = spawn?.ry ?? 0;
      localPlayer.group.position.set(startX, PLAYER_Y, startZ);
      localPlayer.group.rotation.y = startRy;

      for (const p of initialPlayers) {
        if (p.id !== localPlayerId) ensureRemote(p);
      }

      const keys = new Set();
      const onKeyDown = (e) => keys.add(e.key.toLowerCase());
      const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      const resize = () => {
        if (!mountRef.current || !renderer) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", resize);

      const clock = new THREE.Clock();
      const forwardDir = new THREE.Vector3();
      const cameraOffset = new THREE.Vector3(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
      const cameraTarget = new THREE.Vector3();
      const lookTarget = new THREE.Vector3();
      const rotatedCameraOffset = new THREE.Vector3();
      const cameraQuat = new THREE.Quaternion();

      const lerpRemote = (remote, dt) => {
        const g = remote.group;
        g.position.x += (remote.targetX - g.position.x) * Math.min(1, dt * 14);
        g.position.z += (remote.targetZ - g.position.z) * Math.min(1, dt * 14);
        let ryDiff = remote.targetRy - g.rotation.y;
        while (ryDiff > Math.PI) ryDiff -= PI2;
        while (ryDiff < -Math.PI) ryDiff += PI2;
        g.rotation.y += ryDiff * Math.min(1, dt * 14);
        if (remote.moving) {
          remote.walkPhase += dt * 9.5;
          applyWalkCycle(remote.armRig, remote.legRig, remote.walkPhase);
        } else {
          resetPose(remote.armRig, remote.legRig);
        }
      };

      animateFn = () => {
        rafId = window.requestAnimationFrame(animateFn);
        const dt = Math.min(clock.getDelta(), 0.033);
        const player = localPlayer.group;
        const { armRig, legRig } = localPlayer;

        const turnInput =
          (keys.has("arrowleft") ? 1 : 0) + (keys.has("arrowright") ? -1 : 0);
        const moveInput =
          (keys.has("arrowup") ? 1 : 0) + (keys.has("arrowdown") ? -1 : 0);
        const moving = moveInput !== 0;

        for (const remote of remotes.values()) {
          lerpRemote(remote, dt);
        }

        resolveLocalPlayerOverlaps(player, WALK_BOUNDS, deskColliders, remotes);

        if (turnInput !== 0) {
          player.rotation.y += turnInput * TURN_SPEED * dt;
        }

        if (moving) {
          forwardDir.set(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
          const stepX = Math.sin(player.rotation.y) * moveInput * MOVE_SPEED * dt;
          const stepZ = Math.cos(player.rotation.y) * moveInput * MOVE_SPEED * dt;
          applyPlayerMove(player, stepX, stepZ, WALK_BOUNDS, deskColliders, remotes);
          resolveLocalPlayerOverlaps(player, WALK_BOUNDS, deskColliders, remotes);
          localPlayer.walkPhase += dt * 9.5;
          applyWalkCycle(armRig, legRig, localPlayer.walkPhase);
        } else {
          resetPose(armRig, legRig);
        }

        const now = performance.now();
        if (moving !== lastMovingSent || now - lastStateSend >= STATE_SEND_INTERVAL_MS) {
          lastStateSend = now;
          lastMovingSent = moving;
          sendState(player.position.x, player.position.z, player.rotation.y, moving);
        }

        cameraQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
        rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
        cameraTarget.copy(player.position).add(rotatedCameraOffset);
        camera.position.lerp(cameraTarget, 0.08);
        lookTarget.copy(player.position).add(new THREE.Vector3(0, CAMERA_LOOK_Y, 0));
        camera.lookAt(lookTarget);

        renderer.render(scene, camera);
      };
      animateFn();
      mountEl.focus();

      mountEl._secretCleanup = () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("resize", resize);
        scene.remove(moon);
        moon.geometry.dispose();
        moon.material.dispose();
        if (groundTiles) {
          scene.remove(groundTiles.group);
          groundTiles.tileGeom.dispose();
          groundTiles.matLight.dispose();
          groundTiles.matDark.dispose();
        }
        if (perimeterWalls) {
          scene.remove(perimeterWalls.group);
          perimeterWalls.geomAlongX.dispose();
          perimeterWalls.geomAlongZ.dispose();
          perimeterWalls.wallMat.dispose();
        }
        if (cornerTerminal) {
          scene.remove(cornerTerminal.group);
          cornerTerminal.geoms.forEach((g) => g.dispose());
          cornerTerminal.materials.forEach((m) => m.dispose());
        }
        disposePlayer(scene, localPlayer);
        for (const remote of remotes.values()) {
          disposePlayer(scene, remote);
        }
        remotes.clear();
        renderer.dispose();
        if (renderer.domElement.parentNode === mountEl) {
          mountEl.removeChild(renderer.domElement);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", onPageHide);
      if (disconnectRef) disconnectRef.current = null;
      if (typeof mountEl._secretCleanup === "function") mountEl._secretCleanup();
      disconnect();
    };
  }, [disconnectRef]);

  return (
    <div
      ref={mountRef}
      tabIndex={0}
      role="application"
      aria-label="Walk with arrow keys"
      style={{
        position: "absolute",
        inset: 0,
        outline: "none",
        cursor: "default",
      }}
    />
  );
}
