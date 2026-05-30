import React, { useEffect, useRef, useState } from "react";
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
const WALL_LABEL_TEXT = "Michael's House of Dance";
const WELCOME_SIGN_TEXT = "All Children Welcome";
const TERMINAL_DESK_SCALE = 2.5;
const TERMINAL_INTERACT_RADIUS = 4.2;
const TERMINAL_ZOOM_DURATION = 0.9;
const TERMINAL_VIEW_FILL = 0.96;
const DOOR_WIDTH = 3.4;
const DOOR_HEIGHT = 5.7;
const DOOR_HALF_WIDTH = DOOR_WIDTH / 2;
const DOOR_INTERACT_RADIUS = 4.5;
const DOOR_OPEN_DURATION = 1.1;
const DOOR_SLIDE_OFFSET = DOOR_HALF_WIDTH + 0.1;
const OUTSIDE_WALK_M = 8;
const DOOR_OPEN_PASS_THRESHOLD = 0.85;
const TERMINAL_CORNER_INSET = 5;
const TERMINAL_MENU_SPAWN = {
  x: FLOOR_HALF_M - TERMINAL_CORNER_INSET - 2.4,
  z: FLOOR_HALF_M - TERMINAL_CORNER_INSET - 2.4,
  ry: -Math.PI / 4,
};
/** East wall, south of the terminal desk (same wall, further from the PC). */
const DOOR_CENTER_Z = 6;
const DOOR_EXIT_TRIGGER_X = FLOOR_HALF_M + 2.2;
const DOORWAY_FADE_DURATION = 1.15;
const MOONWALK_DURATION = 3;
const MOONWALK_CAMERA_PAN_OUT = 0.45;
const MOONWALK_SPEED = 4.8;
const MOONWALK_CAMERA_PAN_IN = 0.55;
const MOONWALK_SIDE_DISTANCE = 13;
const MOONWALK_SIDE_HEIGHT = 6.2;
const CHARACTER_SCALE = 0.5;
const MOONWALK_CAPTION_HEAD_Y = 7.4 * CHARACTER_SCALE;
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

function applyMoonwalkCycle(armRig, legRig, walkPhase) {
  const armSwing = Math.sin(walkPhase) * 0.58;
  const elbowBend = Math.max(0, Math.sin(walkPhase + 0.35)) * 0.22;
  const legSwing = Math.sin(walkPhase) * 0.88;
  const kneeBend = Math.max(0, Math.sin(walkPhase + 0.15)) * 0.48;
  const footRock = Math.sin(walkPhase + 0.75) * 0.22;

  if (armRig.left && armRig.right) {
    armRig.left.armPivot.rotation.x = armSwing;
    armRig.right.armPivot.rotation.x = -armSwing;
    armRig.left.forearmPivot.rotation.x = -elbowBend;
    armRig.right.forearmPivot.rotation.x = -Math.max(0, -Math.sin(walkPhase + 0.35)) * 0.22;
    armRig.left.hand.rotation.x = -armSwing * 0.22;
    armRig.right.hand.rotation.x = armSwing * 0.22;
  }

  if (legRig.left && legRig.right) {
    legRig.left.legPivot.rotation.x = -legSwing;
    legRig.right.legPivot.rotation.x = legSwing;
    legRig.left.lowerLegPivot.rotation.x = kneeBend;
    legRig.right.lowerLegPivot.rotation.x = Math.max(0, -Math.sin(walkPhase + 0.15)) * 0.48;
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

/** Arena bounds; east edge opens by the terminal when the glass door is slid open. */
function clampPlayerXZ(x, z, doorOpenT) {
  let xMin = -WALK_BOUNDS;
  let xMax = WALK_BOUNDS;
  const zMin = -WALK_BOUNDS;
  const zMax = WALK_BOUNDS;
  if (
    doorOpenT >= DOOR_OPEN_PASS_THRESHOLD &&
    Math.abs(z - DOOR_CENTER_Z) <= DOOR_HALF_WIDTH + PLAYER_COLLISION_RADIUS
  ) {
    xMax = FLOOR_HALF_M + OUTSIDE_WALK_M;
  }
  return {
    x: Math.max(xMin, Math.min(xMax, x)),
    z: Math.max(zMin, Math.min(zMax, z)),
  };
}

function getDoorPanelColliders(doorOpenT) {
  if (doorOpenT >= 0.95) return [];
  const slide = easeOutCubic(doorOpenT);
  const x = FLOOR_HALF_M - 0.35;
  const panelHalfW = DOOR_HALF_WIDTH / 2 - 0.06;
  return [
    {
      x,
      z: DOOR_CENTER_Z - DOOR_HALF_WIDTH / 2 - slide * DOOR_SLIDE_OFFSET,
      hx: 0.28,
      hz: panelHalfW,
    },
    {
      x,
      z: DOOR_CENTER_Z + DOOR_HALF_WIDTH / 2 + slide * DOOR_SLIDE_OFFSET,
      hx: 0.28,
      hz: panelHalfW,
    },
  ];
}

function mergeObstacleColliders(deskColliders, doorOpenT) {
  return deskColliders.concat(getDoorPanelColliders(doorOpenT));
}

function remotePlayerList(remotePlayers) {
  if (remotePlayers instanceof Map) {
    return [...remotePlayers.values()];
  }
  return [...remotePlayers];
}

function circleHitsAnyObstacle(px, pz, radius, obstacleColliders) {
  for (const box of obstacleColliders) {
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

function resolveObstacleCollisions(px, pz, radius, obstacleColliders, doorOpenT) {
  let x = px;
  let z = pz;
  for (let i = 0; i < obstacleColliders.length; i += 1) {
    const next = pushOutOfAabb(x, z, radius, obstacleColliders[i]);
    x = next.x;
    z = next.z;
  }
  return clampPlayerXZ(x, z, doorOpenT);
}

/** Push local player out of overlap with remotes (also uses network target to reduce lerping-into stuck). */
function separateFromPlayers(px, pz, radius, remotePlayers, selfGroup, doorOpenT) {
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

    const clamped = clampPlayerXZ(x, z, doorOpenT);
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

function applyPlayerMove(player, dx, dz, doorOpenT, obstacleColliders, remotePlayers) {
  if (dx === 0 && dz === 0) return;

  const radius = PLAYER_COLLISION_RADIUS;
  const minDist = radius * 2;
  const ox = player.position.x;
  const oz = player.position.z;
  const others = remotePlayerList(remotePlayers);

  let { x: px, z: pz } = clampPlayerXZ(ox + dx, oz + dz, doorOpenT);

  if (circleHitsAnyObstacle(px, pz, radius, obstacleColliders)) {
    const tx = clampPlayerXZ(ox + dx, oz, doorOpenT);
    const tz = clampPlayerXZ(ox, oz + dz, doorOpenT);
    if (!circleHitsAnyObstacle(tx.x, tx.z, radius, obstacleColliders)) {
      px = tx.x;
      pz = tx.z;
    } else if (!circleHitsAnyObstacle(ox, tz.z, radius, obstacleColliders)) {
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
    const clamped = clampPlayerXZ(slid.x, slid.z, doorOpenT);
    px = clamped.x;
    pz = clamped.z;
  }

  ({ x: px, z: pz } = resolveObstacleCollisions(px, pz, radius, obstacleColliders, doorOpenT));
  ({ x: px, z: pz } = separateFromPlayers(px, pz, radius, remotePlayers, player, doorOpenT));

  player.position.x = px;
  player.position.z = pz;
}

function resolveLocalPlayerOverlaps(player, doorOpenT, obstacleColliders, remotePlayers) {
  const radius = PLAYER_COLLISION_RADIUS;
  let { x: px, z: pz } = resolveObstacleCollisions(
    player.position.x,
    player.position.z,
    radius,
    obstacleColliders,
    doorOpenT
  );
  ({ x: px, z: pz } = separateFromPlayers(px, pz, radius, remotePlayers, player, doorOpenT));
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
    head: rig.head,
    armRig: rig.armRig,
    legRig: rig.legRig,
    bodyMeshes: rig.bodyMeshes,
    materials: rig.materials,
    fedora: null,
    dreads: null,
    jacket: null,
    walkPhase: 0,
    moving: false,
    targetX: 0,
    targetZ: 0,
    targetRy: 0,
  };
}

function buildMoonwalkFedora(head) {
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
  const feltMat = regMat({ color: "#1c1c1e", roughness: 0.9, metalness: 0.06 });
  const bandMat = regMat({ color: "#7a1520", roughness: 0.78 });

  const brim = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.84, 0.84, 0.055, 24)), feltMat);
  brim.position.y = 0.26;
  group.add(brim);

  const crown = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.5, 0.56, 0.36, 20)), feltMat);
  crown.position.y = 0.48;
  group.add(crown);

  const band = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.57, 0.57, 0.07, 20)), bandMat);
  band.position.y = 0.36;
  group.add(band);

  group.position.set(0, 0.5, 0.02);
  group.rotation.x = -0.1;
  head.add(group);

  return { group, geoms, materials };
}

function buildMoonwalkDreads(head) {
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
  const dreadMat = regMat({ color: "#0a0a0a", roughness: 0.94, metalness: 0.04 });
  const strandGeom = regGeom(new THREE.CylinderGeometry(0.042, 0.034, 1.05, 8));
  const longStrandGeom = regGeom(new THREE.CylinderGeometry(0.046, 0.03, 1.55, 8));

  group.position.set(0, 0.4, -0.04);

  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * PI2;
    const ringR = 0.34 + (i % 4) * 0.045;
    const x = Math.cos(angle) * ringR;
    const z = Math.sin(angle) * ringR;
    const long = i % 3 === 0 || i % 5 === 0;
    const len = long ? 1.55 : 1.05 + (i % 3) * 0.12;
    const strand = new THREE.Mesh(long ? longStrandGeom : strandGeom, dreadMat);
    strand.scale.y = len / (long ? 1.55 : 1.05);
    strand.position.set(x, -len * 0.42 + 0.08, z);
    strand.rotation.x = 0.12 + (i % 4) * 0.05;
    strand.rotation.z = Math.sin(angle) * 0.12;
    group.add(strand);
  }

  for (let i = 0; i < 7; i += 1) {
    const x = -0.36 + i * 0.12;
    const len = 1.35 + (i % 3) * 0.2;
    const strand = new THREE.Mesh(longStrandGeom, dreadMat);
    strand.scale.y = len / 1.55;
    strand.position.set(x, -len * 0.44 + 0.06, -0.36);
    strand.rotation.x = 0.28;
    strand.rotation.z = (i - 3) * 0.04;
    group.add(strand);
  }

  head.add(group);
  return { group, geoms, materials };
}

function buildMoonwalkJacket(bodyGroup) {
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
  const jacketMat = regMat({ color: "#c62828", roughness: 0.7, metalness: 0.1 });
  const darkMat = regMat({ color: "#7f1010", roughness: 0.75 });

  const torso = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.67, 0.84, 2.9, 20)), jacketMat);
  torso.position.y = 1.62;
  group.add(torso);

  const hem = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.84, 0.86, 0.12, 20)), darkMat);
  hem.position.y = 0.22;
  group.add(hem);

  for (const sx of [-1, 1]) {
    const sleeve = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.21, 0.17, 0.82, 12)), jacketMat);
    sleeve.position.set(0.8 * sx, 2.52, 0.02);
    sleeve.rotation.z = sx * 0.38;
    group.add(sleeve);

    const cuff = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.175, 0.175, 0.1, 12)), darkMat);
    cuff.position.set(0.95 * sx, 2.12, 0.04);
    cuff.rotation.z = sx * 0.38;
    group.add(cuff);
  }

  const collar = new THREE.Mesh(regGeom(new THREE.TorusGeometry(0.34, 0.055, 8, 18)), darkMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 3.06, 0.04);
  group.add(collar);

  bodyGroup.add(group);
  return { group, geoms, materials };
}

function removeMoonwalkFedora(player) {
  if (!player?.fedora) return;
  player.head.remove(player.fedora.group);
  player.fedora.geoms.forEach((g) => g.dispose());
  player.fedora.materials.forEach((m) => m.dispose());
  player.fedora = null;
}

function removeMoonwalkDreads(player) {
  if (!player?.dreads) return;
  player.head.remove(player.dreads.group);
  player.dreads.geoms.forEach((g) => g.dispose());
  player.dreads.materials.forEach((m) => m.dispose());
  player.dreads = null;
}

function removeMoonwalkJacket(player) {
  if (!player?.jacket) return;
  player.group.remove(player.jacket.group);
  player.jacket.geoms.forEach((g) => g.dispose());
  player.jacket.materials.forEach((m) => m.dispose());
  player.jacket = null;
}

function removeMoonwalkCostume(player) {
  removeMoonwalkFedora(player);
  removeMoonwalkDreads(player);
  removeMoonwalkJacket(player);
}

function equipMoonwalkCostume(player) {
  if (!player?.head || !player?.group) return;
  if (!player.jacket) player.jacket = buildMoonwalkJacket(player.group);
  if (!player.dreads) player.dreads = buildMoonwalkDreads(player.head);
  if (!player.fedora) player.fedora = buildMoonwalkFedora(player.head);
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

function buildNeonSign(text, width, height, { fontSize = 118, emissiveIntensity = 0.95, color = "pink" } = {}) {
  const palette =
    color === "yellow"
      ? {
          border: "#ffd700",
          borderInner: "#8a7010",
          shadow: "#ffcc00",
          outer: "#ffb300",
          mid: "#ffe566",
          core: "#fff9cc",
          emissive: "#ffcc00",
        }
      : {
          border: "#ff2da8",
          borderInner: "#5c1048",
          shadow: "#ff0090",
          outer: "#ff1493",
          mid: "#ff5ec4",
          core: "#ffe8f7",
          emissive: "#ff1493",
        };

  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + 4;

  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bgGrad.addColorStop(0, "#0f0514");
  bgGrad.addColorStop(0.5, "#1a0822");
  bgGrad.addColorStop(1, "#0f0514");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 7;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.strokeStyle = palette.borderInner;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 52;
  ctx.fillStyle = palette.outer;
  ctx.fillText(text, cx, cy);

  ctx.shadowBlur = 24;
  ctx.fillStyle = palette.mid;
  ctx.fillText(text, cx, cy);

  ctx.shadowBlur = 0;
  ctx.fillStyle = palette.core;
  ctx.fillText(text, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geom = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: palette.emissive,
    emissiveMap: texture,
    emissiveIntensity,
    roughness: 0.32,
    metalness: 0.12,
  });
  const mesh = new THREE.Mesh(geom, mat);
  return { mesh, texture, canvas, geom, mat };
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

  const eastX = FLOOR_HALF_M + t / 2;
  const doorZ0 = -span / 2;
  const doorZ1 = DOOR_CENTER_Z - DOOR_HALF_WIDTH;
  const doorZ2 = DOOR_CENTER_Z + DOOR_HALF_WIDTH;
  const doorZ3 = span / 2;
  const eastSouthLen = doorZ1 - doorZ0;
  const eastNorthLen = doorZ3 - doorZ2;
  const eastSouthGeom = new THREE.BoxGeometry(t, h, eastSouthLen);
  const eastNorthGeom = new THREE.BoxGeometry(t, h, eastNorthLen);
  const eastSouth = new THREE.Mesh(eastSouthGeom, wallMat);
  eastSouth.position.set(eastX, h / 2, doorZ0 + eastSouthLen / 2);
  group.add(eastSouth);
  const eastNorth = new THREE.Mesh(eastNorthGeom, wallMat);
  eastNorth.position.set(eastX, h / 2, doorZ2 + eastNorthLen / 2);
  group.add(eastNorth);

  const lintelH = h - DOOR_HEIGHT;
  const eastLintelGeom = new THREE.BoxGeometry(t, lintelH, DOOR_WIDTH + t * 0.6);
  const eastLintel = new THREE.Mesh(eastLintelGeom, wallMat);
  eastLintel.position.set(eastX, DOOR_HEIGHT + lintelH / 2, DOOR_CENTER_Z);
  group.add(eastLintel);

  const west = new THREE.Mesh(geomAlongZ, wallMat);
  west.position.set(-FLOOR_HALF_M - t / 2, h / 2, 0);
  group.add(west);

  const labels = [];
  const signH = 2.35;
  const signY = 5.4;
  const signInset = 0.1;
  const addLabel = (x, y, z, rotY, signW) => {
    const label = buildNeonSign(WALL_LABEL_TEXT, signW, signH);
    label.mesh.position.set(x, y, z);
    label.mesh.rotation.y = rotY;
    group.add(label.mesh);
    labels.push(label);
  };

  addLabel(0, signY, FLOOR_HALF_M - signInset, Math.PI, span - 2);
  addLabel(0, signY, -FLOOR_HALF_M + signInset, 0, span - 2);
  addLabel(-FLOOR_HALF_M + signInset, signY, 0, Math.PI / 2, span - 2);
  addLabel(FLOOR_HALF_M - signInset, signY, doorZ0 + eastSouthLen / 2, -Math.PI / 2, eastSouthLen - 1.5);
  addLabel(FLOOR_HALF_M - signInset, signY, doorZ2 + eastNorthLen / 2, -Math.PI / 2, eastNorthLen - 1.5);

  const welcome = buildNeonSign(WELCOME_SIGN_TEXT, 21, 2.4, {
    fontSize: 102,
    emissiveIntensity: 1.08,
    color: "yellow",
  });
  welcome.mesh.position.set(0, 2.9, -FLOOR_HALF_M + signInset);
  welcome.mesh.rotation.y = 0;
  group.add(welcome.mesh);
  labels.push(welcome);

  scene.add(group);
  return {
    group,
    geomAlongX,
    geomAlongZ,
    eastSouthGeom,
    eastNorthGeom,
    eastLintelGeom,
    wallMat,
    labels,
  };
}

/** Sliding glass door on the east wall, beside the terminal. */
function buildSlidingGlassDoor(scene) {
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
  group.position.set(FLOOR_HALF_M, 0, DOOR_CENTER_Z);
  group.rotation.y = -Math.PI / 2;

  const frameMat = regMat({ color: "#4a4f58", roughness: 0.45, metalness: 0.55 });
  const trackMat = regMat({ color: "#353940", roughness: 0.5, metalness: 0.6 });
  const glassMat = regMat({
    color: "#9ed4f5",
    transparent: true,
    opacity: 0.42,
    roughness: 0.08,
    metalness: 0.12,
    side: THREE.DoubleSide,
  });

  const panelW = DOOR_HALF_WIDTH;
  const panelD = 0.05;
  const panelZ = WALL_THICKNESS_M / 2 + 0.02;
  const panelGeom = regGeom(new THREE.BoxGeometry(panelW, DOOR_HEIGHT, panelD));
  const leftPanel = new THREE.Mesh(panelGeom, glassMat);
  leftPanel.position.set(-panelW / 2, DOOR_HEIGHT / 2, panelZ);
  group.add(leftPanel);

  const rightPanel = new THREE.Mesh(panelGeom, glassMat);
  rightPanel.position.set(panelW / 2, DOOR_HEIGHT / 2, panelZ);
  group.add(rightPanel);

  const trackH = 0.08;
  const topTrack = new THREE.Mesh(regGeom(new THREE.BoxGeometry(DOOR_WIDTH + 0.4, trackH, 0.14)), trackMat);
  topTrack.position.set(0, DOOR_HEIGHT + trackH / 2, 0.08);
  group.add(topTrack);

  const bottomTrack = new THREE.Mesh(regGeom(new THREE.BoxGeometry(DOOR_WIDTH + 0.4, trackH, 0.18)), trackMat);
  bottomTrack.position.set(0, trackH / 2, 0.1);
  group.add(bottomTrack);

  const jambW = 0.12;
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(regGeom(new THREE.BoxGeometry(jambW, DOOR_HEIGHT + trackH * 2, 0.16)), frameMat);
    jamb.position.set(sx * (DOOR_HALF_WIDTH + jambW / 2), DOOR_HEIGHT / 2 + trackH / 2, 0.06);
    group.add(jamb);
  }

  scene.add(group);

  const setOpenAmount = (t) => {
    const slide = easeOutCubic(Math.max(0, Math.min(1, t)));
    leftPanel.position.x = -panelW / 2 - slide * DOOR_SLIDE_OFFSET;
    rightPanel.position.x = panelW / 2 + slide * DOOR_SLIDE_OFFSET;
  };

  const approachPadGeom = regGeom(new THREE.PlaneGeometry(DOOR_WIDTH + 6, OUTSIDE_WALK_M));
  const approachPadMat = regMat({ color: GROUND_GREEN_DARK, roughness: 0.95, metalness: 0.04 });
  const approachPad = new THREE.Mesh(approachPadGeom, approachPadMat);
  approachPad.rotation.x = -Math.PI / 2;
  approachPad.position.set(0, 0.02, -OUTSIDE_WALK_M / 2);
  group.add(approachPad);

  return {
    group,
    geoms,
    materials,
    setOpenAmount,
    interactX: FLOOR_HALF_M - 2.2,
    interactZ: DOOR_CENTER_Z,
  };
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
  return { group, geoms, materials, screen };
}

function disposePlayer(scene, player) {
  scene.remove(player.group);
  player.bodyMeshes.forEach((mesh) => mesh.geometry.dispose());
  player.materials.forEach((m) => m.dispose());
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/** Distance along screen normal so the monitor fills the camera view. */
function computeTerminalCameraDistance(screenMesh, camera) {
  const box = new THREE.Box3().setFromObject(screenMesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distForHeight = (size.y * 0.5) / Math.tan(vFov / 2);
  const distForWidth = (size.x * 0.5) / Math.tan(hFov / 2);
  return Math.max(distForHeight, distForWidth) / TERMINAL_VIEW_FILL;
}

/** Project the monitor mesh bounds to pixel coordinates within the canvas mount. */
function projectScreenRect(screenMesh, camera, width, height) {
  const box = new THREE.Box3().setFromObject(screenMesh);
  const { min, max } = box;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const v = new THREE.Vector3();
  for (const c of corners) {
    v.copy(c).project(camera);
    const px = (v.x * 0.5 + 0.5) * width;
    const py = (-v.y * 0.5 + 0.5) * height;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    left: minX,
    top: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Project a world point to pixel coordinates within the canvas mount. */
function projectWorldPoint(worldPos, camera, width, height) {
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return null;
  return {
    left: (v.x * 0.5 + 0.5) * width,
    top: (-v.y * 0.5 + 0.5) * height,
  };
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
 * @param {{
 *   onRoomFull?: () => void,
 *   disconnectRef?: React.MutableRefObject<(() => void) | null>,
 *   terminalViewActive?: boolean,
 *   onTerminalOpen?: () => void,
 *   onTerminalFrame?: (frame: { progress: number, rect: { left: number, top: number, width: number, height: number } | null }) => void,
 *   onDoorwayFade?: (opacity: number) => void,
 *   onDoorwayEntered?: () => void,
 *   spawnAtTerminal?: boolean,
 *   snapTerminalZoom?: boolean,
 * }} props
 */
export default function NightWalkerCharacterWalk({
  onRoomFull,
  disconnectRef,
  terminalViewActive = false,
  onTerminalOpen,
  onTerminalFrame,
  onDoorwayFade,
  onDoorwayEntered,
  spawnAtTerminal = false,
  snapTerminalZoom = false,
}) {
  const mountRef = useRef(null);
  const mountWrapRef = useRef(null);
  const [moonwalkCaption, setMoonwalkCaption] = useState(null);
  const setMoonwalkCaptionRef = useRef(setMoonwalkCaption);
  setMoonwalkCaptionRef.current = setMoonwalkCaption;
  const onRoomFullRef = useRef(onRoomFull);
  const onTerminalOpenRef = useRef(onTerminalOpen);
  const onTerminalFrameRef = useRef(onTerminalFrame);
  const onDoorwayFadeRef = useRef(onDoorwayFade);
  const onDoorwayEnteredRef = useRef(onDoorwayEntered);
  const terminalViewActiveRef = useRef(terminalViewActive);
  const spawnAtTerminalRef = useRef(spawnAtTerminal);
  const snapTerminalZoomRef = useRef(snapTerminalZoom);
  onRoomFullRef.current = onRoomFull;
  onTerminalOpenRef.current = onTerminalOpen;
  onTerminalFrameRef.current = onTerminalFrame;
  onDoorwayFadeRef.current = onDoorwayFade;
  onDoorwayEnteredRef.current = onDoorwayEntered;
  terminalViewActiveRef.current = terminalViewActive;
  spawnAtTerminalRef.current = spawnAtTerminal;
  snapTerminalZoomRef.current = snapTerminalZoom;

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
    let slidingDoor = null;
    let deskColliders = [];
    let doorOpenT = 0;
    let doorOpening = false;
    let doorwayFadeT = 0;
    let doorwayTransitioning = false;
    let doorwayEnteredFired = false;
    let moonwalkActive = false;
    let moonwalkTimer = 0;
    let moonwalkOrigin = { x: 0, z: 0, ry: 0 };
    let animateFn = null;
    const terminalWorldPos = new THREE.Vector3();
    const screenWorldPos = new THREE.Vector3();
    const screenWorldQuat = new THREE.Quaternion();
    const screenForward = new THREE.Vector3();
    const terminalCamPos = new THREE.Vector3();
    const terminalLookAt = new THREE.Vector3();
    const gameplayCamPos = new THREE.Vector3();
    const gameplayLookAt = new THREE.Vector3();
    const blendedCamPos = new THREE.Vector3();
    const blendedLookAt = new THREE.Vector3();
    const moonwalkSideCamPos = new THREE.Vector3();
    const moonwalkSideLookAt = new THREE.Vector3();
    const moonwalkHeadWorld = new THREE.Vector3();
    let lastMoonwalkCaptionKey = "";
    let terminalZoomT = 0;
    /** @type {{ x: number, z: number, ry: number } | null} */
    let terminalPlayerFreeze = null;
    let lastTerminalFrameProgress = -1;

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
      slidingDoor = buildSlidingGlassDoor(scene);
      cornerTerminal = buildCornerTerminalDesk(scene);
      cornerTerminal.group.updateMatrixWorld(true);
      deskColliders = buildDeskWorldColliders(cornerTerminal.group);

      localPlayer = addPlayerToScene(scene, localSlot);
      localPlayer.id = localPlayerId;
      const spawn = initialPlayers.find((p) => p.id === localPlayerId);
      let startX = spawn?.x ?? (localSlot === 0 ? -6 : 6);
      let startZ = spawn?.z ?? 0;
      let startRy = spawn?.ry ?? 0;
      if (spawnAtTerminalRef.current) {
        startX = TERMINAL_MENU_SPAWN.x;
        startZ = TERMINAL_MENU_SPAWN.z;
        startRy = TERMINAL_MENU_SPAWN.ry;
      }
      localPlayer.group.position.set(startX, PLAYER_Y, startZ);
      localPlayer.group.rotation.y = startRy;
      if (spawnAtTerminalRef.current) {
        sendState(startX, startZ, startRy, false);
      }

      if (spawnAtTerminalRef.current && terminalViewActiveRef.current) {
        terminalPlayerFreeze = { x: startX, z: startZ, ry: startRy };
        if (snapTerminalZoomRef.current) {
          terminalZoomT = 1;
        }
      }

      for (const p of initialPlayers) {
        if (p.id !== localPlayerId) ensureRemote(p);
      }

      const keys = new Set();
      const onKeyDown = (e) => {
        const k = e.key.toLowerCase();
        if (k === "m" && !moonwalkActive && !terminalViewActiveRef.current && !doorwayTransitioning && localPlayer) {
          e.preventDefault();
          moonwalkOrigin = {
            x: localPlayer.group.position.x,
            z: localPlayer.group.position.z,
            ry: localPlayer.group.rotation.y,
          };
          moonwalkActive = true;
          moonwalkTimer = 0;
          equipMoonwalkCostume(localPlayer);
          return;
        }
        if (k === " " && !terminalViewActiveRef.current && !doorwayTransitioning && !moonwalkActive && localPlayer) {
          const px = localPlayer.group.position.x;
          const pz = localPlayer.group.position.z;

          cornerTerminal.group.getWorldPosition(terminalWorldPos);
          const distTerminal = Math.hypot(px - terminalWorldPos.x, pz - terminalWorldPos.z);
          if (distTerminal <= TERMINAL_INTERACT_RADIUS) {
            e.preventDefault();
            terminalPlayerFreeze = {
              x: px,
              z: pz,
              ry: localPlayer.group.rotation.y,
            };
            sendState(px, pz, localPlayer.group.rotation.y, false);
            onTerminalOpenRef.current?.();
            return;
          }

          if (slidingDoor && doorOpenT < 0.99) {
            const distDoor = Math.hypot(px - slidingDoor.interactX, pz - slidingDoor.interactZ);
            if (distDoor <= DOOR_INTERACT_RADIUS) {
              e.preventDefault();
              doorOpening = true;
              return;
            }
          }
        }
        keys.add(k);
      };
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

        const wantsTerminal = terminalViewActiveRef.current;
        const terminalCameraActive = wantsTerminal || terminalZoomT > 0.001;
        const gameplayLocked = doorwayTransitioning || doorwayFadeT > 0 || moonwalkActive;

        const turnInput = terminalCameraActive || gameplayLocked
          ? 0
          : (keys.has("arrowleft") ? 1 : 0) + (keys.has("arrowright") ? -1 : 0);
        const moveInput = terminalCameraActive || gameplayLocked
          ? 0
          : (keys.has("arrowup") ? 1 : 0) + (keys.has("arrowdown") ? -1 : 0);
        const moving = moveInput !== 0;

        for (const remote of remotes.values()) {
          lerpRemote(remote, dt);
        }

        if (doorOpening && doorOpenT < 1) {
          doorOpenT = Math.min(1, doorOpenT + dt / DOOR_OPEN_DURATION);
        }
        if (slidingDoor) {
          slidingDoor.setOpenAmount(doorOpenT);
        }
        const obstacleColliders = mergeObstacleColliders(deskColliders, doorOpenT);

        if (
          !doorwayTransitioning &&
          !terminalCameraActive &&
          doorOpenT >= DOOR_OPEN_PASS_THRESHOLD &&
          Math.abs(player.position.z - DOOR_CENTER_Z) <= DOOR_HALF_WIDTH + PLAYER_COLLISION_RADIUS &&
          player.position.x >= DOOR_EXIT_TRIGGER_X
        ) {
          doorwayTransitioning = true;
        }

        if (doorwayTransitioning) {
          doorwayFadeT = Math.min(1, doorwayFadeT + dt / DOORWAY_FADE_DURATION);
          onDoorwayFadeRef.current?.(doorwayFadeT);
          if (doorwayFadeT >= 1 && !doorwayEnteredFired) {
            doorwayEnteredFired = true;
            onDoorwayEnteredRef.current?.();
          }
        }

        if (wantsTerminal && !terminalPlayerFreeze) {
          terminalPlayerFreeze = {
            x: player.position.x,
            z: player.position.z,
            ry: player.rotation.y,
          };
        }

        const playerX = terminalPlayerFreeze?.x ?? player.position.x;
        const playerZ = terminalPlayerFreeze?.z ?? player.position.z;
        const playerRy = terminalPlayerFreeze?.ry ?? player.rotation.y;

        if (terminalPlayerFreeze) {
          player.position.x = terminalPlayerFreeze.x;
          player.position.z = terminalPlayerFreeze.z;
          player.rotation.y = terminalPlayerFreeze.ry;
        }

        cameraQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), playerRy);
        rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
        gameplayCamPos.set(playerX, PLAYER_Y, playerZ).add(rotatedCameraOffset);
        gameplayLookAt.set(playerX, PLAYER_Y + CAMERA_LOOK_Y, playerZ);

        if (!terminalCameraActive) {
          if (terminalPlayerFreeze) {
            terminalPlayerFreeze = null;
            sendState(player.position.x, player.position.z, player.rotation.y, false);
          }
          resolveLocalPlayerOverlaps(player, doorOpenT, obstacleColliders, remotes);

          if (moonwalkActive) {
            moonwalkTimer += dt;
            player.rotation.y = moonwalkOrigin.ry;
            // Forward walk animation; body slides backward (moonwalk glide).
            const stepX = -Math.sin(moonwalkOrigin.ry) * MOONWALK_SPEED * dt;
            const stepZ = -Math.cos(moonwalkOrigin.ry) * MOONWALK_SPEED * dt;
            applyPlayerMove(player, stepX, stepZ, doorOpenT, obstacleColliders, remotes);
            resolveLocalPlayerOverlaps(player, doorOpenT, obstacleColliders, remotes);
            localPlayer.walkPhase += dt * 11;
            applyMoonwalkCycle(armRig, legRig, localPlayer.walkPhase);

            const now = performance.now();
            if (now - lastStateSend >= STATE_SEND_INTERVAL_MS) {
              lastStateSend = now;
              lastMovingSent = true;
              sendState(player.position.x, player.position.z, player.rotation.y, true);
            }

            if (moonwalkTimer >= MOONWALK_DURATION) {
              moonwalkActive = false;
              moonwalkTimer = 0;
              lastMovingSent = false;
              lastMoonwalkCaptionKey = "";
              setMoonwalkCaptionRef.current(null);
              removeMoonwalkCostume(localPlayer);
              resetPose(armRig, legRig);
              sendState(player.position.x, player.position.z, player.rotation.y, false);
            }
          } else if (turnInput !== 0) {
            player.rotation.y += turnInput * TURN_SPEED * dt;
          }

          if (!moonwalkActive && moving) {
            const stepX = Math.sin(player.rotation.y) * moveInput * MOVE_SPEED * dt;
            const stepZ = Math.cos(player.rotation.y) * moveInput * MOVE_SPEED * dt;
            applyPlayerMove(player, stepX, stepZ, doorOpenT, obstacleColliders, remotes);
            resolveLocalPlayerOverlaps(player, doorOpenT, obstacleColliders, remotes);
            localPlayer.walkPhase += dt * 9.5;
            applyWalkCycle(armRig, legRig, localPlayer.walkPhase);
          } else if (!moonwalkActive) {
            resetPose(armRig, legRig);
          }

          const now = performance.now();
          if (
            !moonwalkActive &&
            (moving !== lastMovingSent || now - lastStateSend >= STATE_SEND_INTERVAL_MS)
          ) {
            lastStateSend = now;
            lastMovingSent = moving;
            sendState(player.position.x, player.position.z, player.rotation.y, moving);
          }

          if (moonwalkActive) {
            const camRy = moonwalkOrigin.ry;
            const camX = player.position.x;
            const camZ = player.position.z;

            cameraQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), camRy);
            rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
            gameplayCamPos.set(camX, PLAYER_Y, camZ).add(rotatedCameraOffset);
            gameplayLookAt.set(camX, PLAYER_Y + CAMERA_LOOK_Y, camZ);

            const sideOffset = new THREE.Vector3(MOONWALK_SIDE_DISTANCE, MOONWALK_SIDE_HEIGHT, 0);
            sideOffset.applyQuaternion(cameraQuat);
            moonwalkSideCamPos.set(camX, PLAYER_Y, camZ).add(sideOffset);
            moonwalkSideLookAt.copy(gameplayLookAt);

            const panIn = easeOutCubic(Math.min(1, moonwalkTimer / MOONWALK_CAMERA_PAN_IN));
            const panOut = easeOutCubic(
              Math.max(0, (moonwalkTimer - (MOONWALK_DURATION - MOONWALK_CAMERA_PAN_OUT)) / MOONWALK_CAMERA_PAN_OUT)
            );
            const moonwalkCamBlend = panIn * (1 - panOut);

            if (moonwalkCamBlend > 0.001) {
              blendedCamPos.copy(gameplayCamPos).lerp(moonwalkSideCamPos, moonwalkCamBlend);
              blendedLookAt.copy(gameplayLookAt).lerp(moonwalkSideLookAt, moonwalkCamBlend);
              camera.position.lerp(blendedCamPos, 0.14);
              camera.lookAt(blendedLookAt);
            } else {
              camera.position.lerp(gameplayCamPos, 0.08);
              camera.lookAt(gameplayLookAt);
            }
          } else {
            camera.position.lerp(gameplayCamPos, 0.08);
            camera.lookAt(gameplayLookAt);
          }

          if (cornerTerminal?.screen?.material?.emissiveIntensity !== undefined) {
            cornerTerminal.screen.material.emissiveIntensity = 0.9;
          }
          if (lastTerminalFrameProgress !== 0) {
            lastTerminalFrameProgress = 0;
            onTerminalFrameRef.current?.({ progress: 0, rect: null });
          }
        } else if (cornerTerminal?.screen) {
          resetPose(armRig, legRig);

          if (wantsTerminal) {
            terminalZoomT = Math.min(1, terminalZoomT + dt / TERMINAL_ZOOM_DURATION);
          } else {
            terminalZoomT = Math.max(0, terminalZoomT - dt / TERMINAL_ZOOM_DURATION);
          }
          const zoomEase = easeOutCubic(terminalZoomT);

          const screen = cornerTerminal.screen;
          if (screen.material?.emissiveIntensity !== undefined) {
            screen.material.emissiveIntensity = 0.9 + zoomEase * 0.55;
          }

          screen.getWorldPosition(screenWorldPos);
          screen.getWorldQuaternion(screenWorldQuat);
          screenForward.set(0, 0, 1).applyQuaternion(screenWorldQuat);
          const camDist = computeTerminalCameraDistance(screen, camera);
          terminalCamPos.copy(screenWorldPos).addScaledVector(screenForward, camDist);
          terminalLookAt.copy(screenWorldPos);

          blendedCamPos.copy(gameplayCamPos).lerp(terminalCamPos, zoomEase);
          blendedLookAt.copy(gameplayLookAt).lerp(terminalLookAt, zoomEase);
          camera.position.copy(blendedCamPos);
          camera.lookAt(blendedLookAt);

          const w = mountEl.clientWidth;
          const h = mountEl.clientHeight;
          const rect = projectScreenRect(screen, camera, w, h);
          if (lastTerminalFrameProgress !== terminalZoomT) {
            lastTerminalFrameProgress = terminalZoomT;
            onTerminalFrameRef.current?.({ progress: terminalZoomT, rect });
          }
        }

        renderer.render(scene, camera);

        if (moonwalkActive && !terminalCameraActive) {
          player.updateMatrixWorld(true);
          moonwalkHeadWorld.set(0, MOONWALK_CAPTION_HEAD_Y, 0);
          player.localToWorld(moonwalkHeadWorld);
          const w = mountEl.clientWidth;
          const h = mountEl.clientHeight;
          const pt = projectWorldPoint(moonwalkHeadWorld, camera, w, h);
          if (pt) {
            const key = `${Math.round(pt.left)}:${Math.round(pt.top)}`;
            if (key !== lastMoonwalkCaptionKey) {
              lastMoonwalkCaptionKey = key;
              setMoonwalkCaptionRef.current(pt);
            }
          } else if (lastMoonwalkCaptionKey !== "hidden") {
            lastMoonwalkCaptionKey = "hidden";
            setMoonwalkCaptionRef.current(null);
          }
        } else if (lastMoonwalkCaptionKey !== "") {
          lastMoonwalkCaptionKey = "";
          setMoonwalkCaptionRef.current(null);
        }
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
          perimeterWalls.eastSouthGeom.dispose();
          perimeterWalls.eastNorthGeom.dispose();
          perimeterWalls.eastLintelGeom.dispose();
          perimeterWalls.wallMat.dispose();
          if (perimeterWalls.labels) {
            for (const label of perimeterWalls.labels) {
              label.geom.dispose();
              label.mat.dispose();
              label.texture.dispose();
            }
          }
        }
        if (slidingDoor) {
          scene.remove(slidingDoor.group);
          slidingDoor.geoms.forEach((g) => g.dispose());
          slidingDoor.materials.forEach((m) => m.dispose());
        }
        if (cornerTerminal) {
          scene.remove(cornerTerminal.group);
          cornerTerminal.geoms.forEach((g) => g.dispose());
          cornerTerminal.materials.forEach((m) => m.dispose());
        }
        disposePlayer(scene, localPlayer);
        removeMoonwalkCostume(localPlayer);
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

  useEffect(() => {
    terminalViewActiveRef.current = terminalViewActive;
  }, [terminalViewActive]);

  return (
    <div
      ref={mountWrapRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
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
      {moonwalkCaption ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: moonwalkCaption.left,
            top: moonwalkCaption.top,
            transform: "translate(-50%, calc(-100% - 52px))",
            zIndex: 20,
            pointerEvents: "none",
            filter: "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35))",
          }}
        >
          <div
            style={{
              position: "relative",
              background: "#fff",
              color: "#1a1a1a",
              fontFamily: "Comic Sans MS, Chalkboard SE, sans-serif",
              fontSize: "clamp(0.95rem, 2vw, 1.2rem)",
              fontWeight: 700,
              padding: "8px 14px",
              borderRadius: "14px",
              border: "2px solid #222",
              whiteSpace: "nowrap",
            }}
          >
            He he!
            <span
              style={{
                position: "absolute",
                left: "50%",
                bottom: -10,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderTop: "10px solid #222",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: "50%",
                bottom: -7,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "8px solid #fff",
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
