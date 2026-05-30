import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createHumanoidRig, NIGHT_WALKER_HERO_COLORS } from "../utils/nightWalkerHumanoid";
import { getSecretAreaWsUrl } from "../utils/secretAreaWs";
/** Assets at C:/SGF/jacko/ */
import mjFaceUrl from "../../../jacko/MJ1.jpg";
import heheAudioUrl from "../../../jacko/hehe.mp3";
import shamoneAudioUrl from "../../../jacko/shamone.mp3";

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
const WELCOME_SIGN_BASE_EMISSIVE = 1.08;
const WELCOME_SIGN_FLASH_SPEED = 5.2;
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
const MOONWALK_DURATION = 2;
const SPIN_ARM_PREP_DURATION = 0.75;
const SPIN_FEDORA_GRAB_DURATION = 0.22;
const SPIN_ROTATE_DURATION = 1.6;
const SPIN_SWEEP_DURATION = SPIN_ROTATE_DURATION - SPIN_FEDORA_GRAB_DURATION;
const SPIN_DURATION = SPIN_ARM_PREP_DURATION + SPIN_ROTATE_DURATION;
const SPIN_CAPTION = "Shamone!";
const MOONWALK_CAMERA_PAN_OUT = 0.45;
const MOONWALK_SPEED = 4.8;
const MOONWALK_CAMERA_PAN_IN = 0.55;
const MOONWALK_SIDE_DISTANCE = 13;
const MOONWALK_SIDE_HEIGHT = 6.2;
const CHARACTER_SCALE = 0.5;
const MOONWALK_CAPTION_HEAD_Y = 7.4 * CHARACTER_SCALE;
const TRAP_STAND_DURATION = 10;
const TRAP_TILE_FALL_DELAY = 1;
const TRAP_TILE_DROP_SPEED = 10;
const TRAP_PLAYER_DROP_SPEED = 18;
const TRAP_PLAYER_FALL_DURATION = 1;
const TRAP_RESET_HOLD = 1.5;
const TRAP_MESSAGE = "Keep On Movin...!";
const PLAYER_Y = 4.1 * CHARACTER_SCALE;
const MOVE_SPEED = 7.5;
const TURN_SPEED = 2.8;
const CAMERA_DISTANCE = 12;
const CAMERA_HEIGHT = 7 * CHARACTER_SCALE;
const CAMERA_LOOK_Y = 2.3 * CHARACTER_SCALE;
const STATE_SEND_INTERVAL_MS = 50;
const PI2 = Math.PI * 2;
const DISCO_TILE_LIGHT = "#f0f0f0";
const DISCO_TILE_DARK = "#0c0c0c";
const DISCO_FLOOR_SPEED = 2.6;
const DANCE_FLOOR_BORDER_TILES = 2;
const DANCE_FLOOR_SIZE = 6;
const discoFloorColor = new THREE.Color();
const discoFloorBase = new THREE.Color();

function isDanceFloorTile(row, col) {
  const min = DANCE_FLOOR_BORDER_TILES;
  const max = min + DANCE_FLOOR_SIZE - 1;
  return row >= min && row <= max && col >= min && col <= max;
}

/** Local XZ footprints (unscaled) for desk + tower + monitor. */
const DESK_COLLISION_LOCAL = [
  { cx: 0, cz: 0.02, hx: 0.78, hz: 0.46 },
  { cx: 0.34, cz: -0.2, hx: 0.14, hz: 0.24 },
  { cx: 0, cz: -0.12, hx: 0.32, hz: 0.14 },
];

const FLESH_SKIN_COLOR = "#ffc4b0";
const FLESH_JOINT_COLOR = "#e89888";
const FLESH_SKIN_EMISSIVE = "#ff9078";
const FLESH_SKIN_ROUGHNESS = 0.46;
const FLESH_SKIN_EMISSIVE_INTENSITY = 0.14;

const MOONWALK_JACKET_RED = "#ff0a0a";
const MOONWALK_JACKET_EMISSIVE = "#ff2222";
const MOONWALK_PANTS_BLACK = "#0a0a0a";
const MOONWALK_SOCK_WHITE = "#f5f5f5";

const SLOT_COLORS = [
  { ...NIGHT_WALKER_HERO_COLORS, withHeadLamp: false },
  {
    skinColor: FLESH_SKIN_COLOR,
    clothColor: "#43a047",
    darkClothColor: "#2e6b32",
    jointColor: FLESH_JOINT_COLOR,
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

const MOONWALK_HEAD_TURN_RADIANS = Math.PI / 2;

function resetMoonwalkHeadRotation(head) {
  if (!head) return;
  head.rotation.set(0, 0, 0);
}

function applyMoonwalkHeadTurn(head, moonwalkTimer) {
  if (!head) return;
  const turnT = easeOutCubic(Math.min(1, moonwalkTimer / MOONWALK_DURATION));
  head.rotation.y = MOONWALK_HEAD_TURN_RADIANS * turnT;
  head.rotation.x = 0;
  head.rotation.z = 0;
}

const SPIN_ARM_FORWARD_X = -Math.PI / 2;

const SPIN_ARM_FORWARD_POSE = {
  upperArmX: 0,
  upperArmZOffset: 0,
  forearmX: 0,
  forearmZ: 0,
};

const SPIN_ARM_HAT_POSE = {
  upperArmX: -1.12,
  upperArmZOffset: 0.18,
  forearmX: -1.22,
  forearmZ: -0.48,
};

const SPIN_ARM_SWEEP_SHOULDER_X = 0.72;
const SPIN_ARM_SWEEP_SHOULDER_Z = 0.16;

const SPIN_OPPOSITE_LEG_POSE = {
  legX: -0.78,
  kneeX: 0.95,
  footX: 0.18,
};

function applySpinRightArmReach(armRig, progressT) {
  applySpinRightArmPose(armRig, progressT, progressT);
}

function applySpinRightArmSweep(armRig, sweepT) {
  const baseUpperZ = armRig.right.baseUpperArmZ ?? armRig.right.side * 0.22;
  const t = easeOutCubic(Math.min(1, Math.max(0, sweepT)));

  const shoulderX =
    SPIN_ARM_FORWARD_X + (SPIN_ARM_SWEEP_SHOULDER_X - SPIN_ARM_FORWARD_X) * t;
  armRig.right.armPivot.rotation.set(shoulderX, 0, SPIN_ARM_SWEEP_SHOULDER_Z * t);

  armRig.right.upperArmPivot.rotation.set(
    SPIN_ARM_HAT_POSE.upperArmX,
    0,
    baseUpperZ + SPIN_ARM_HAT_POSE.upperArmZOffset
  );
  armRig.right.upperArm.rotation.set(0, 0, 0);
  armRig.right.forearmPivot.rotation.set(
    SPIN_ARM_HAT_POSE.forearmX,
    0,
    SPIN_ARM_HAT_POSE.forearmZ
  );
  armRig.right.hand.rotation.x = armRig.right.baseHandX;
}

function applySpinLeftArm(armRig, progressT) {
  const leftEase = easeOutCubic(Math.min(1, Math.max(0, progressT)));
  armRig.left.armPivot.rotation.set(0.06 * leftEase, 0, -0.32 * leftEase);
  armRig.left.forearmPivot.rotation.set(-0.1 * leftEase, 0, 0);
  armRig.left.hand.rotation.x = armRig.left.baseHandX;
}

function applySpinRightArmPose(armRig, forwardT, reachT) {
  const baseUpperZ = armRig.right.baseUpperArmZ ?? armRig.right.side * 0.22;
  const forwardEase = easeOutCubic(Math.min(1, Math.max(0, forwardT)));
  const reachEase = easeOutCubic(Math.min(1, Math.max(0, reachT)));

  armRig.right.armPivot.rotation.set(SPIN_ARM_FORWARD_X * forwardEase, 0, 0);

  const upperX =
    SPIN_ARM_FORWARD_POSE.upperArmX +
    (SPIN_ARM_HAT_POSE.upperArmX - SPIN_ARM_FORWARD_POSE.upperArmX) * reachEase;
  const upperZ = baseUpperZ + SPIN_ARM_HAT_POSE.upperArmZOffset * reachEase;
  armRig.right.upperArmPivot.rotation.set(upperX, 0, upperZ);
  armRig.right.upperArm.rotation.set(0, 0, 0);

  const forearmX =
    SPIN_ARM_FORWARD_POSE.forearmX +
    (SPIN_ARM_HAT_POSE.forearmX - SPIN_ARM_FORWARD_POSE.forearmX) * reachEase;
  const forearmZ =
    SPIN_ARM_FORWARD_POSE.forearmZ +
    (SPIN_ARM_HAT_POSE.forearmZ - SPIN_ARM_FORWARD_POSE.forearmZ) * reachEase;
  armRig.right.forearmPivot.rotation.set(forearmX, 0, forearmZ);
  armRig.right.hand.rotation.x = armRig.right.baseHandX;
}

function applySpinLegs(legRig, progressT) {
  if (!legRig.left || !legRig.right) return;
  const t = easeOutCubic(Math.min(1, Math.max(0, progressT)));

  legRig.right.legPivot.rotation.set(legRig.right.baseLegPivotX, 0, 0);
  legRig.right.lowerLegPivot.rotation.x = legRig.right.baseLowerPivotX;
  legRig.right.foot.rotation.x = legRig.right.baseFootX;

  legRig.left.legPivot.rotation.set(
    SPIN_OPPOSITE_LEG_POSE.legX * t,
    0,
    0
  );
  legRig.left.lowerLegPivot.rotation.x = SPIN_OPPOSITE_LEG_POSE.kneeX * t;
  legRig.left.foot.rotation.x = legRig.left.baseFootX + SPIN_OPPOSITE_LEG_POSE.footX * t;
}

function resetSpinLegs(legRig) {
  if (!legRig.left || !legRig.right) return;
  legRig.left.legPivot.rotation.set(legRig.left.baseLegPivotX, 0, 0);
  legRig.right.legPivot.rotation.set(legRig.right.baseLegPivotX, 0, 0);
  legRig.left.lowerLegPivot.rotation.x = legRig.left.baseLowerPivotX;
  legRig.right.lowerLegPivot.rotation.x = legRig.right.baseLowerPivotX;
  legRig.left.foot.rotation.x = legRig.left.baseFootX;
  legRig.right.foot.rotation.x = legRig.right.baseFootX;
}

function syncRemoteDance(player, dance) {
  if (player.dance === dance) return;
  if (player.dance) {
    removeMoonwalkCostume(player);
    resetMoonwalkHeadRotation(player.head);
    resetSpinLegs(player.legRig);
    player.spinFedoraGrabbed = false;
  }
  player.dance = dance || null;
  player.danceT = 0;
  if (dance === "moonwalk") {
    equipMoonwalkCostume(player);
  } else if (dance === "spin") {
    equipSpinCostume(player);
  }
}

function applyRemoteSpinPose(player, spinTimer) {
  const { armRig, legRig } = player;

  if (spinTimer < SPIN_ARM_PREP_DURATION) {
    const armProgress = spinTimer / SPIN_ARM_PREP_DURATION;
    applySpinPose(armRig, legRig, armProgress, player);
    return;
  }

  const rotateElapsed = spinTimer - SPIN_ARM_PREP_DURATION;
  if (rotateElapsed < SPIN_FEDORA_GRAB_DURATION) {
    applySpinRightArmReach(armRig, 1);
    applySpinLeftArm(armRig, 1);
    updateSpinFedoraGrab(player, rotateElapsed / SPIN_FEDORA_GRAB_DURATION);
  } else {
    if (!player.spinFedoraGrabbed) {
      attachSpinFedoraToHand(player);
    }
    const sweepProgress = Math.min(
      1,
      (rotateElapsed - SPIN_FEDORA_GRAB_DURATION) / SPIN_SWEEP_DURATION
    );
    applySpinRightArmSweep(armRig, sweepProgress);
    applySpinLeftArm(armRig, 1);
    if (player.fedora?.mode === "held") {
      lerpHeldFedoraTransform(player.fedora, 1);
    }
  }
  applySpinLegs(legRig, 1);
}

function applyRemoteDancePose(player) {
  if (player.dance === "moonwalk") {
    player.walkPhase = player.danceT * 11;
    applyMoonwalkCycle(player.armRig, player.legRig, player.walkPhase);
    applyMoonwalkHeadTurn(player.head, player.danceT);
    return;
  }
  if (player.dance === "spin") {
    applyRemoteSpinPose(player, player.danceT);
  }
}

function applySpinPose(armRig, legRig, spinProgress, player) {
  const progressT = Math.min(1, Math.max(0, spinProgress));

  if (armRig.left && armRig.right) {
    applySpinRightArmReach(armRig, progressT);
    applySpinLeftArm(armRig, progressT);

    if (player?.fedora?.mode === "head" && player.fedora.group) {
      player.fedora.group.position.y = SPIN_FEDORA_HEAD_Y;
    }
  }

  applySpinLegs(legRig, progressT);
}

function resetPose(armRig, legRig) {
  const reset = (current, target) => current + (target - current) * 0.15;
  const resetRot3 = (rot, tx, ty, tz) => {
    rot.x = reset(rot.x, tx);
    rot.y = reset(rot.y, ty);
    rot.z = reset(rot.z, tz);
  };
  if (armRig.left && armRig.right) {
    resetRot3(armRig.left.armPivot.rotation, 0, 0, 0);
    resetRot3(armRig.right.armPivot.rotation, 0, 0, 0);
    resetRot3(armRig.left.forearmPivot.rotation, 0, 0, 0);
    resetRot3(armRig.right.forearmPivot.rotation, 0, 0, 0);
    resetRot3(armRig.left.upperArmPivot?.rotation ?? armRig.left.upperArm.rotation, 0, 0, armRig.left.baseUpperArmZ ?? armRig.left.side * 0.22);
    resetRot3(armRig.right.upperArmPivot?.rotation ?? armRig.right.upperArm.rotation, 0, 0, armRig.right.baseUpperArmZ ?? armRig.right.side * 0.22);
    resetRot3(armRig.left.upperArm.rotation, 0, 0, 0);
    resetRot3(armRig.right.upperArm.rotation, 0, 0, 0);
    armRig.left.hand.rotation.x = reset(armRig.left.hand.rotation.x, armRig.left.baseHandX);
    armRig.right.hand.rotation.x = reset(armRig.right.hand.rotation.x, armRig.right.baseHandX);
  }
  if (legRig.left && legRig.right) {
    resetRot3(legRig.left.legPivot.rotation, legRig.left.baseLegPivotX, 0, 0);
    resetRot3(legRig.right.legPivot.rotation, legRig.right.baseLegPivotX, 0, 0);
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
    if (!remote?.group || remote.group === player) continue;
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
    skinMat: rig.skinMat,
    jointMat: rig.jointMat,
    clothMat: rig.clothMat,
    darkClothMat: rig.darkClothMat,
    armRig: rig.armRig,
    legRig: rig.legRig,
    bodyMeshes: rig.bodyMeshes,
    materials: rig.materials,
    fedora: null,
    dreads: null,
    jacket: null,
    moonwalkLegAccents: null,
    moonwalkFace: null,
    kneeCylinder: null,
    walkPhase: 0,
    moving: false,
    dance: null,
    danceT: 0,
    targetDance: null,
    targetDanceT: 0,
    isRemote: false,
    spinFedoraGrabbed: false,
    targetTrapRow: -1,
    targetTrapCol: -1,
    targetTrapElapsed: 0,
    lastTrapTile: null,
    targetShowKneeCylinder: false,
    targetKneeCylinderGrowT: 0,
    lastSillyStringPulse: 0,
    targetSillyStringPulse: 0,
    targetX: 0,
    targetZ: 0,
    targetRy: 0,
  };
}

function createMoonwalkFedoraAsset() {
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

  return { group, geoms, materials };
}

function buildMoonwalkFedora(head) {
  const fedora = createMoonwalkFedoraAsset();
  fedora.group.position.set(0, 0.28, 0.02);
  fedora.group.rotation.x = -0.1;
  head.add(fedora.group);
  return { ...fedora, attachTarget: head, mode: "head" };
}

const SPIN_FEDORA_HEAD_Y = 0.28;
const SPIN_FEDORA_GRAB_TRANSFER = 0.42;

function attachSpinFedoraToHand(player) {
  if (!player?.fedora?.group || !player?.armRig?.right || player.fedora.mode === "held") return;
  const side = player.armRig.right.side;
  const forearmPivot = player.armRig.right.forearmPivot;
  const { group, geoms, materials } = player.fedora;

  player.fedora.attachTarget.remove(group);
  group.position.set(0.06 * side, -0.88, 0.07);
  group.rotation.set(0.04, -0.08 * side, -0.34 * side);
  group.scale.setScalar(0.9);
  forearmPivot.add(group);
  for (const child of group.children) {
    child.renderOrder = 4;
  }

  player.fedora = {
    group,
    geoms,
    materials,
    attachTarget: forearmPivot,
    mode: "held",
    side,
    heldFrom: { x: 0.06 * side, y: -0.88, z: 0.07, rx: 0.04, ry: -0.08 * side, rz: -0.34 * side },
    heldTo: { x: 0.04 * side, y: -1.06, z: 0.12, rx: 0.52, ry: -0.22 * side, rz: -1.02 * side },
  };
  player.spinFedoraGrabbed = true;
  if (!player.isRemote) playSpinAudio();
}

function lerpHeldFedoraTransform(fedora, t) {
  const e = easeOutCubic(t);
  const from = fedora.heldFrom;
  const to = fedora.heldTo;
  fedora.group.position.set(
    from.x + (to.x - from.x) * e,
    from.y + (to.y - from.y) * e,
    from.z + (to.z - from.z) * e
  );
  fedora.group.rotation.set(
    from.rx + (to.rx - from.rx) * e,
    from.ry + (to.ry - from.ry) * e,
    from.rz + (to.rz - from.rz) * e
  );
}

function updateSpinFedoraGrab(player, grabT) {
  if (!player?.fedora?.group) return;

  if (player.fedora.mode === "head") {
    player.fedora.group.position.y = SPIN_FEDORA_HEAD_Y + grabT * 0.05;
    if (grabT >= SPIN_FEDORA_GRAB_TRANSFER) {
      attachSpinFedoraToHand(player);
    }
  }

  if (player.fedora.mode === "held") {
    const handT = Math.min(1, (grabT - SPIN_FEDORA_GRAB_TRANSFER) / (1 - SPIN_FEDORA_GRAB_TRANSFER));
    lerpHeldFedoraTransform(player.fedora, handT);
  }
}

function ensureSpinFedoraHeld(player) {
  if (!player?.fedora?.group || !player?.armRig?.right) return;
  if (player.fedora.mode !== "held") {
    attachSpinFedoraToHand(player);
  }
  lerpHeldFedoraTransform(player.fedora, 1);
}

function buildHeldMoonwalkFedora(forearmPivot, side) {
  const fedora = createMoonwalkFedoraAsset();
  // Palm at brim edge; crown tipped out beside the head (MJ hat-tip grip).
  fedora.group.position.set(0.04 * side, -1.34, 0.11);
  fedora.group.rotation.set(0.52, -0.22 * side, -1.02 * side);
  fedora.group.scale.setScalar(0.9);
  forearmPivot.add(fedora.group);
  for (const child of fedora.group.children) {
    child.renderOrder = 4;
  }
  return { ...fedora, attachTarget: forearmPivot };
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

  const headRadius = 0.58;
  const surfaceR = headRadius + 0.045;

  const group = new THREE.Group();
  const dreadMat = regMat({ color: "#0a0a0a", roughness: 0.94, metalness: 0.04 });
  const strandGeom = regGeom(new THREE.CylinderGeometry(0.042, 0.034, 1.05, 8));
  const longStrandGeom = regGeom(new THREE.CylinderGeometry(0.046, 0.03, 1.55, 8));

  group.position.set(0, 0.38, 0);

  const isOnFaceArc = (angle) => {
    let delta = angle - Math.PI / 2;
    while (delta > Math.PI) delta -= PI2;
    while (delta < -Math.PI) delta += PI2;
    return Math.abs(delta) <= Math.PI / 4 + 0.04;
  };

  const addStrand = (angle, seed, { lenScale = 1, yShift = 0 } = {}) => {
    const ringR = surfaceR + (seed % 4) * 0.014;
    const x = Math.cos(angle) * ringR;
    const z = Math.sin(angle) * ringR;
    const long = lenScale >= 1 && (seed % 3 === 0 || seed % 5 === 0);
    const baseLen = long ? 1.55 : 1.05 + (seed % 3) * 0.12;
    const len = baseLen * lenScale;
    const useLongGeom = long && lenScale >= 1;
    const strand = new THREE.Mesh(useLongGeom ? longStrandGeom : strandGeom, dreadMat);
    strand.scale.y = len / (useLongGeom ? 1.55 : 1.05);
    strand.position.set(x, -len * 0.38 + 0.14 + yShift, z);
    strand.rotation.x = 0.12 + (seed % 4) * 0.05;
    strand.rotation.z = Math.sin(angle) * 0.12;
    strand.renderOrder = 3;
    group.add(strand);
  };

  for (let i = 0; i < 52; i += 1) {
    const angle = (i / 52) * PI2;
    if (isOnFaceArc(angle)) continue;
    addStrand(angle, i);
  }

  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * PI2 + 0.1;
    if (isOnFaceArc(angle)) continue;
    addStrand(angle, i + 60, { yShift: -0.06 });
  }

  addStrand(Math.PI / 2, 100, { lenScale: 0.5 });

  group.renderOrder = 3;
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
  const jacketMat = regMat({
    color: MOONWALK_JACKET_RED,
    emissive: MOONWALK_JACKET_EMISSIVE,
    emissiveIntensity: 0.42,
    roughness: 0.38,
    metalness: 0.06,
  });

  const torso = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.67, 0.84, 2.9, 20)), jacketMat);
  torso.position.y = 1.62;
  group.add(torso);

  const hem = new THREE.Mesh(regGeom(new THREE.CylinderGeometry(0.84, 0.86, 0.12, 20)), jacketMat);
  hem.position.y = 0.22;
  group.add(hem);

  const collar = new THREE.Mesh(regGeom(new THREE.TorusGeometry(0.34, 0.055, 8, 18)), jacketMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 3.06, 0.04);
  group.add(collar);

  bodyGroup.add(group);
  return { group, geoms, materials };
}

let mjFaceTextureCache = null;
let mjFaceTextureAnisotropy = 16;
let moonwalkAudio = null;
let spinAudio = null;

function playMoonwalkAudio() {
  if (!moonwalkAudio) {
    moonwalkAudio = new Audio(heheAudioUrl);
    moonwalkAudio.preload = "auto";
  }
  moonwalkAudio.currentTime = 0;
  const playPromise = moonwalkAudio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {});
  }
}

function stopMoonwalkAudio() {
  if (!moonwalkAudio) return;
  moonwalkAudio.pause();
  moonwalkAudio.currentTime = 0;
}

function playSpinAudio() {
  if (!spinAudio) {
    spinAudio = new Audio(shamoneAudioUrl);
    spinAudio.preload = "auto";
  }
  spinAudio.currentTime = 0;
  const playPromise = spinAudio.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {});
  }
}

function stopSpinAudio() {
  if (!spinAudio) return;
  spinAudio.pause();
  spinAudio.currentTime = 0;
}

function getMjFaceTexture() {
  if (!mjFaceTextureCache) {
    mjFaceTextureCache = new THREE.TextureLoader().load(mjFaceUrl);
    mjFaceTextureCache.colorSpace = THREE.SRGBColorSpace;
    applySharpTextureSettings(mjFaceTextureCache, mjFaceTextureAnisotropy);
  }
  return mjFaceTextureCache;
}

function applySharpTextureSettings(texture, anisotropy = mjFaceTextureAnisotropy) {
  texture.anisotropy = anisotropy;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

function configureMjFaceTexture(renderer) {
  mjFaceTextureAnisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 16;
  if (mjFaceTextureCache) {
    applySharpTextureSettings(mjFaceTextureCache, mjFaceTextureAnisotropy);
  }
}

function createMoonwalkFaceTexture() {
  const texture = getMjFaceTexture().clone();
  texture.repeat.set(0.86, 0.88);
  texture.offset.set(0.07, 0.06);
  applySharpTextureSettings(texture, mjFaceTextureAnisotropy);
  return texture;
}

const MOONWALK_FACE_ARC = Math.PI / 2;
const MOONWALK_FACE_ARC_START = -Math.PI / 4;
const MOONWALK_SKIN_COLOR = FLESH_SKIN_COLOR;
const MOONWALK_JOINT_COLOR = FLESH_JOINT_COLOR;
const MOONWALK_SKIN_EMISSIVE = FLESH_SKIN_EMISSIVE;

function applyMoonwalkSkinTone(player) {
  if (!player?.skinMat || !player?.jointMat) return;

  if (!player.moonwalkSkinSnapshot) {
    player.moonwalkSkinSnapshot = [
      {
        mat: player.skinMat,
        color: player.skinMat.color.clone(),
        roughness: player.skinMat.roughness,
        emissive: player.skinMat.emissive.clone(),
        emissiveIntensity: player.skinMat.emissiveIntensity,
      },
      {
        mat: player.jointMat,
        color: player.jointMat.color.clone(),
        roughness: player.jointMat.roughness,
        emissive: player.jointMat.emissive.clone(),
        emissiveIntensity: player.jointMat.emissiveIntensity,
      },
    ];
  }

  player.skinMat.color.set(MOONWALK_SKIN_COLOR);
  player.skinMat.emissive.set(MOONWALK_SKIN_EMISSIVE);
  player.skinMat.emissiveIntensity = 0.2;
  player.skinMat.roughness = FLESH_SKIN_ROUGHNESS;

  player.jointMat.color.set(MOONWALK_JOINT_COLOR);
  player.jointMat.emissive.set("#e87868");
  player.jointMat.emissiveIntensity = 0.12;
  player.jointMat.roughness = 0.52;
}

function restoreMoonwalkSkinTone(player) {
  if (!player.moonwalkSkinSnapshot) return;
  for (const entry of player.moonwalkSkinSnapshot) {
    entry.mat.color.copy(entry.color);
    entry.mat.roughness = entry.roughness;
    entry.mat.emissive.copy(entry.emissive);
    entry.mat.emissiveIntensity = entry.emissiveIntensity;
  }
  player.moonwalkSkinSnapshot = null;
}

function applyMoonwalkClothTone(player) {
  if (!player?.clothMat) return;

  if (!player.moonwalkClothSnapshot) {
    player.moonwalkClothSnapshot = {
      color: player.clothMat.color.clone(),
      emissive: player.clothMat.emissive.clone(),
      emissiveIntensity: player.clothMat.emissiveIntensity,
      roughness: player.clothMat.roughness,
    };
  }

  player.clothMat.color.set(MOONWALK_JACKET_RED);
  player.clothMat.emissive.set(MOONWALK_JACKET_EMISSIVE);
  player.clothMat.emissiveIntensity = 0.35;
  player.clothMat.roughness = 0.4;
}

function restoreMoonwalkClothTone(player) {
  if (!player.moonwalkClothSnapshot || !player.clothMat) return;
  player.clothMat.color.copy(player.moonwalkClothSnapshot.color);
  player.clothMat.emissive.copy(player.moonwalkClothSnapshot.emissive);
  player.clothMat.emissiveIntensity = player.moonwalkClothSnapshot.emissiveIntensity;
  player.clothMat.roughness = player.moonwalkClothSnapshot.roughness;
  player.moonwalkClothSnapshot = null;
}

function applyMoonwalkPantsTone(player) {
  if (!player?.darkClothMat) return;

  if (!player.moonwalkPantsSnapshot) {
    player.moonwalkPantsSnapshot = {
      color: player.darkClothMat.color.clone(),
      emissive: player.darkClothMat.emissive.clone(),
      emissiveIntensity: player.darkClothMat.emissiveIntensity,
      roughness: player.darkClothMat.roughness,
      metalness: player.darkClothMat.metalness,
    };
  }

  player.darkClothMat.color.set(MOONWALK_PANTS_BLACK);
  player.darkClothMat.emissive.set("#000000");
  player.darkClothMat.emissiveIntensity = 0;
  player.darkClothMat.roughness = 0.78;
  player.darkClothMat.metalness = 0.06;
}

function restoreMoonwalkPantsTone(player) {
  if (!player.moonwalkPantsSnapshot || !player.darkClothMat) return;
  player.darkClothMat.color.copy(player.moonwalkPantsSnapshot.color);
  player.darkClothMat.emissive.copy(player.moonwalkPantsSnapshot.emissive);
  player.darkClothMat.emissiveIntensity = player.moonwalkPantsSnapshot.emissiveIntensity;
  player.darkClothMat.roughness = player.moonwalkPantsSnapshot.roughness;
  player.darkClothMat.metalness = player.moonwalkPantsSnapshot.metalness;
  player.moonwalkPantsSnapshot = null;
}

function buildMoonwalkLegAccents(legRig) {
  const geoms = [];
  const materials = [];
  const footSnapshots = [];
  const regGeom = (geometry) => {
    geoms.push(geometry);
    return geometry;
  };
  const regMat = (params) => {
    const m = new THREE.MeshStandardMaterial(params);
    materials.push(m);
    return m;
  };

  const socks = [];
  const sockMat = regMat({ color: MOONWALK_SOCK_WHITE, roughness: 0.72, metalness: 0.04 });
  const sockGeom = regGeom(new THREE.CylinderGeometry(0.19, 0.21, 0.3, 12));
  const shoeMat = regMat({
    color: "#050505",
    metalness: 0.92,
    roughness: 0.08,
    emissive: "#888888",
    emissiveIntensity: 0.35,
  });

  for (const side of ["left", "right"]) {
    const rig = legRig[side];
    if (!rig?.lowerLegPivot || !rig?.foot) continue;

    const sock = new THREE.Mesh(sockGeom, sockMat);
    sock.position.set(0, -1.5, 0.1);
    sock.rotation.x = 0.18;
    rig.lowerLegPivot.add(sock);
    socks.push(sock);

    footSnapshots.push({ foot: rig.foot, material: rig.foot.material });
    rig.foot.material = shoeMat;
  }

  return { geoms, materials, footSnapshots, socks };
}

function removeMoonwalkLegAccents(player) {
  if (!player?.moonwalkLegAccents) return;
  for (const sock of player.moonwalkLegAccents.socks || []) {
    sock.parent?.remove(sock);
  }
  for (const snap of player.moonwalkLegAccents.footSnapshots) {
    snap.foot.material = snap.material;
  }
  player.moonwalkLegAccents.geoms.forEach((g) => g.dispose());
  player.moonwalkLegAccents.materials.forEach((m) => m.dispose());
  player.moonwalkLegAccents = null;
  restoreMoonwalkPantsTone(player);
}

function buildMoonwalkFace(head) {
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

  const savedHead = {
    map: head.material.map,
    emissiveMap: head.material.emissiveMap,
    emissive: head.material.emissive.clone(),
    emissiveIntensity: head.material.emissiveIntensity,
    color: head.material.color.clone(),
    roughness: head.material.roughness,
    metalness: head.material.metalness,
    scale: head.scale.clone(),
    visible: head.visible,
  };

  head.material.map = null;
  head.material.emissiveMap = null;
  head.material.needsUpdate = true;
  head.visible = true;

  const faceGeom = regGeom(
    new THREE.CylinderGeometry(
      0.592,
      0.592,
      0.9,
      48,
      3,
      true,
      MOONWALK_FACE_ARC_START,
      MOONWALK_FACE_ARC
    )
  );

  const textures = [];
  const texture = createMoonwalkFaceTexture();
  textures.push(texture);

  const faceMat = new THREE.MeshBasicMaterial({
    map: texture,
    toneMapped: true,
  });
  materials.push(faceMat);

  const faceMesh = new THREE.Mesh(faceGeom, faceMat);
  faceMesh.scale.set(1.05, 1.07, 1.05);
  faceMesh.renderOrder = 1;
  head.add(faceMesh);

  return { group: faceMesh, geoms, materials, textures, savedHead };
}

function removeMoonwalkFace(player) {
  if (!player?.moonwalkFace) return;
  if (player.moonwalkFace.group) {
    player.head.remove(player.moonwalkFace.group);
  }
  player.moonwalkFace.geoms.forEach((g) => g.dispose());
  player.moonwalkFace.materials.forEach((m) => m.dispose());
  player.moonwalkFace.textures?.forEach((t) => t.dispose());

  restoreMoonwalkSkinTone(player);

  player.head.visible = player.moonwalkFace.savedHead.visible;
  player.head.material.map = player.moonwalkFace.savedHead.map;
  player.head.material.emissiveMap = player.moonwalkFace.savedHead.emissiveMap;
  player.head.material.emissive.copy(player.moonwalkFace.savedHead.emissive);
  player.head.material.emissiveIntensity = player.moonwalkFace.savedHead.emissiveIntensity;
  player.head.material.metalness = player.moonwalkFace.savedHead.metalness;
  player.head.material.needsUpdate = true;
  player.head.scale.copy(player.moonwalkFace.savedHead.scale);
  player.moonwalkFace = null;
}

function removeMoonwalkFedora(player) {
  if (!player?.fedora) return;
  player.fedora.attachTarget?.remove(player.fedora.group);
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
  removeMoonwalkFace(player);
  removeMoonwalkLegAccents(player);
  restoreMoonwalkClothTone(player);
}

function equipMoonwalkCostume(player) {
  if (!player?.head || !player?.group) return;
  if (!player.moonwalkFace) player.moonwalkFace = buildMoonwalkFace(player.head);
  applyMoonwalkSkinTone(player);
  applyMoonwalkClothTone(player);
  applyMoonwalkPantsTone(player);
  if (!player.moonwalkLegAccents) {
    player.moonwalkLegAccents = buildMoonwalkLegAccents(player.legRig);
  }
  if (!player.jacket) player.jacket = buildMoonwalkJacket(player.group);
  if (!player.dreads) player.dreads = buildMoonwalkDreads(player.head);
  if (!player.fedora) player.fedora = buildMoonwalkFedora(player.head);
}

function equipSpinCostume(player) {
  if (!player?.head || !player?.group || !player?.armRig?.right) return;
  player.spinFedoraGrabbed = false;
  if (!player.moonwalkFace) player.moonwalkFace = buildMoonwalkFace(player.head);
  applyMoonwalkSkinTone(player);
  applyMoonwalkClothTone(player);
  applyMoonwalkPantsTone(player);
  if (!player.moonwalkLegAccents) {
    player.moonwalkLegAccents = buildMoonwalkLegAccents(player.legRig);
  }
  if (!player.jacket) player.jacket = buildMoonwalkJacket(player.group);
  if (!player.dreads) player.dreads = buildMoonwalkDreads(player.head);
  if (!player.fedora) player.fedora = buildMoonwalkFedora(player.head);
}

const KNEE_CYLINDER_Y = -0.35;
const KNEE_CYLINDER_Z = 0.59;
const KNEE_CYLINDER_HEIGHT = 1.84;
const KNEE_CYLINDER_MESH_LIFT = 1.64;
const KNEE_CYLINDER_BODY_Y = KNEE_CYLINDER_MESH_LIFT - KNEE_CYLINDER_HEIGHT;
const KNEE_CYLINDER_TIP_Y = KNEE_CYLINDER_MESH_LIFT;
const KNEE_CYLINDER_RADIUS = 0.19;
const KNEE_CYLINDER_TIP_RADIUS = 0.2;
const KNEE_CYLINDER_TILT_X = 0.82;
const KNEE_CYLINDER_GROW_DURATION = 0.6;

function applyKneeCylinderGrow(kneeCylinder, progressT) {
  const t = Math.min(1, Math.max(0, progressT));
  const grow = easeOutCubic(t);
  const length = KNEE_CYLINDER_HEIGHT * grow;

  kneeCylinder.tip.visible = true;
  kneeCylinder.tip.position.y = KNEE_CYLINDER_TIP_Y;

  kneeCylinder.mesh.visible = grow > 0.02;
  kneeCylinder.mesh.scale.y = Math.max(grow, 0.001);
  kneeCylinder.mesh.position.y = KNEE_CYLINDER_BODY_Y + length / 2;
  kneeCylinder.growT = t;
}

function equipKneeCylinder(player) {
  if (!player?.group || player.kneeCylinder) return;
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

  const fleshMat = regMat({
    color: FLESH_SKIN_COLOR,
    emissive: FLESH_SKIN_EMISSIVE,
    emissiveIntensity: FLESH_SKIN_EMISSIVE_INTENSITY,
    roughness: FLESH_SKIN_ROUGHNESS,
    metalness: 0.02,
  });

  const pivot = new THREE.Group();
  pivot.position.set(0, KNEE_CYLINDER_Y, KNEE_CYLINDER_Z);
  pivot.rotation.x = KNEE_CYLINDER_TILT_X;

  const mesh = new THREE.Mesh(
    regGeom(new THREE.CylinderGeometry(
      KNEE_CYLINDER_RADIUS,
      KNEE_CYLINDER_RADIUS,
      KNEE_CYLINDER_HEIGHT,
      14
    )),
    fleshMat
  );
  mesh.renderOrder = 2;

  const tip = new THREE.Mesh(
    regGeom(new THREE.SphereGeometry(KNEE_CYLINDER_TIP_RADIUS, 14, 12)),
    fleshMat
  );
  tip.renderOrder = 2;

  pivot.add(mesh);
  pivot.add(tip);
  player.group.add(pivot);

  const kneeCylinder = {
    pivot,
    mesh,
    tip,
    geoms,
    materials,
    growT: 0,
    growing: true,
  };
  applyKneeCylinderGrow(kneeCylinder, 0);
  player.kneeCylinder = kneeCylinder;
}

function removeKneeCylinder(player) {
  if (!player?.kneeCylinder) return;
  player.group.remove(player.kneeCylinder.pivot);
  player.kneeCylinder.geoms.forEach((g) => g.dispose());
  player.kneeCylinder.materials.forEach((m) => m.dispose());
  player.kneeCylinder = null;
}

function updateKneeCylinderGrow(player, dt) {
  const kc = player?.kneeCylinder;
  if (!kc?.growing) return;
  applyKneeCylinderGrow(kc, kc.growT + dt / KNEE_CYLINDER_GROW_DURATION);
  if (kc.growT >= 1) kc.growing = false;
}

function toggleKneeCylinder(player) {
  if (!player) return;
  if (player.kneeCylinder) removeKneeCylinder(player);
  else equipKneeCylinder(player);
}

function syncRemoteKneeCylinder(player, show, growT = 0) {
  if (!player) return;
  if (!show) {
    if (player.kneeCylinder) removeKneeCylinder(player);
    return;
  }
  if (!player.kneeCylinder) equipKneeCylinder(player);
  const t = Math.min(1, Math.max(0, growT));
  if (t > player.kneeCylinder.growT) {
    applyKneeCylinderGrow(player.kneeCylinder, t);
    if (t >= 1) player.kneeCylinder.growing = false;
  }
}

const SILLY_STRING_SPAWN_INTERVAL = 0.034;
const SILLY_STRING_PARTICLES_PER_SPAWN = 6;
const SILLY_STRING_PARTICLE_LIFE = 1.05;
const SILLY_STRING_SPEED = 7.5;
const sillyStringParticles = [];
const sillyStringOrigin = new THREE.Vector3();
const sillyStringBody = new THREE.Vector3();
const sillyStringDir = new THREE.Vector3();
const sillyStringSide = new THREE.Vector3();

function getKneeCylinderNozzle(player, origin, dir) {
  const kc = player?.kneeCylinder;
  if (!kc?.tip || (kc.growT ?? 0) < 1) return false;
  kc.tip.getWorldPosition(origin);
  kc.pivot.localToWorld(sillyStringBody.set(0, KNEE_CYLINDER_BODY_Y, 0), sillyStringBody);
  dir.copy(origin).sub(sillyStringBody);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  else dir.normalize();
  return true;
}

function spawnSillyStringBurst(scene, player) {
  if (!scene || !getKneeCylinderNozzle(player, sillyStringOrigin, sillyStringDir)) return;

  sillyStringSide.crossVectors(sillyStringDir, new THREE.Vector3(0, 1, 0));
  if (sillyStringSide.lengthSq() < 1e-4) sillyStringSide.set(1, 0, 0);
  else sillyStringSide.normalize();

  for (let i = 0; i < SILLY_STRING_PARTICLES_PER_SPAWN; i += 1) {
    const radius = 0.035 + Math.random() * 0.04;
    const geom = new THREE.SphereGeometry(radius, 7, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(sillyStringOrigin);
    mesh.renderOrder = 5;
    scene.add(mesh);

    const speed = SILLY_STRING_SPEED + Math.random() * 3.5;
    const velocity = sillyStringDir
      .clone()
      .multiplyScalar(speed)
      .add(sillyStringSide.clone().multiplyScalar((Math.random() - 0.5) * 2.4))
      .add(new THREE.Vector3(0, (Math.random() - 0.15) * 2.2, 0));

    sillyStringParticles.push({
      mesh,
      geom,
      mat,
      velocity,
      life: SILLY_STRING_PARTICLE_LIFE * (0.75 + Math.random() * 0.45),
      age: 0,
    });
  }
}

function updateSillyStrings(scene, dt) {
  if (!scene) return;
  for (let i = sillyStringParticles.length - 1; i >= 0; i -= 1) {
    const p = sillyStringParticles[i];
    p.age += dt;
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.velocity.y -= 3.2 * dt;
    p.velocity.multiplyScalar(1 - dt * 0.35);
    p.mat.opacity = Math.max(0, 1 - p.age / p.life);
    if (p.age >= p.life) {
      scene.remove(p.mesh);
      p.geom.dispose();
      p.mat.dispose();
      sillyStringParticles.splice(i, 1);
    }
  }
}

function clearSillyStrings(scene) {
  if (!scene) return;
  for (const p of sillyStringParticles) {
    scene.remove(p.mesh);
    p.geom.dispose();
    p.mat.dispose();
  }
  sillyStringParticles.length = 0;
}

function syncRemoteSillyString(scene, player, targetPulse) {
  if (!player || targetPulse <= player.lastSillyStringPulse) return;
  let spawned = 0;
  while (player.lastSillyStringPulse < targetPulse && spawned < 8) {
    player.lastSillyStringPulse += 1;
    spawnSillyStringBurst(scene, player);
    spawned += 1;
  }
}

function getGroundTileAt(x, z, tileGrid, half) {
  if (Math.abs(x) > half || Math.abs(z) > half) return null;
  const col = Math.floor((x + half) / GROUND_CELL_SIZE);
  const row = Math.floor((z + half) / GROUND_CELL_SIZE);
  if (row < 0 || row >= GROUND_TILE_COUNT || col < 0 || col >= GROUND_TILE_COUNT) return null;
  return tileGrid[row][col];
}

function resetTrapTile(tile) {
  if (!tile) return;
  tile.mesh.position.y = tile.baseY;
}

function clearRemoteTrapVisual(remote) {
  if (remote?.lastTrapTile) {
    resetTrapTile(remote.lastTrapTile);
    remote.lastTrapTile = null;
  }
}

function applyRemoteTrapVisual(groundTiles, remote) {
  const row = remote.targetTrapRow;
  const col = remote.targetTrapCol;
  const elapsed = remote.targetTrapElapsed;
  const { group } = remote;

  if (!groundTiles?.tileGrid || row < 0 || col < 0 || elapsed <= 0) {
    clearRemoteTrapVisual(remote);
    group.position.y = PLAYER_Y;
    return;
  }

  const tile = groundTiles.tileGrid[row]?.[col];
  if (!tile) return;

  remote.lastTrapTile = tile;
  const tileFallEnd = TRAP_TILE_FALL_DELAY;
  const playerFallEnd = tileFallEnd + TRAP_PLAYER_FALL_DURATION;

  if (elapsed < tileFallEnd) {
    tile.mesh.position.y = tile.baseY - TRAP_TILE_DROP_SPEED * elapsed;
  } else if (elapsed < playerFallEnd) {
    tile.mesh.position.y = tile.baseY - TRAP_TILE_DROP_SPEED * tileFallEnd;
  } else {
    resetTrapTile(tile);
    remote.lastTrapTile = null;
  }

  if (elapsed < tileFallEnd) {
    group.position.y = PLAYER_Y;
  } else if (elapsed < playerFallEnd) {
    group.position.y = PLAYER_Y - TRAP_PLAYER_DROP_SPEED * (elapsed - tileFallEnd);
  } else {
    group.position.y = PLAYER_Y;
  }
}

function updateDiscoFloor(groundTiles, timeSec) {
  if (!groundTiles?.tileGrid) return;

  const cols = GROUND_TILE_COUNT;
  const beat = timeSec * DISCO_FLOOR_SPEED;

  for (let row = 0; row < cols; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const tile = groundTiles.tileGrid[row][col];
      if (!tile?.isDanceFloor || !tile?.mat) continue;

      const waveA = Math.sin(beat + row * 0.9 + col * 0.65);
      const waveB = Math.sin(beat * 0.75 - col * 0.8 + row * 0.45);
      const glow = Math.max(0, waveA * 0.55 + waveB * 0.45);
      const lit = glow > 0.12;

      const hue = ((row * 0.17 + col * 0.11 + timeSec * 0.14) % 1 + 1) % 1;
      discoFloorColor.setHSL(hue, 0.92, lit ? 0.52 : 0.08);
      discoFloorBase.set(tile.isLight ? DISCO_TILE_LIGHT : DISCO_TILE_DARK);

      tile.mat.emissive.copy(discoFloorColor);
      tile.mat.emissiveIntensity = lit ? 0.18 + glow * 0.82 : 0.025;
      tile.mat.color.copy(discoFloorBase);
      if (lit) {
        tile.mat.color.lerp(discoFloorColor, glow * 0.5);
      }
    }
  }
}

function buildCheckeredGround(scene) {
  const half = FLOOR_HALF_M;
  const cols = GROUND_TILE_COUNT;
  const tileGeom = new THREE.PlaneGeometry(GROUND_CELL_SIZE, GROUND_CELL_SIZE);
  const borderMatLight = new THREE.MeshStandardMaterial({
    color: DISCO_TILE_LIGHT,
    roughness: 0.16,
    metalness: 0.42,
  });
  const borderMatDark = new THREE.MeshStandardMaterial({
    color: DISCO_TILE_DARK,
    roughness: 0.1,
    metalness: 0.52,
  });
  const tileMaterials = [];
  const group = new THREE.Group();
  const tileGrid = [];
  for (let row = 0; row < cols; row += 1) {
    tileGrid[row] = [];
    for (let col = 0; col < cols; col += 1) {
      const isLight = (row + col) % 2 === 0;
      const isDanceFloor = isDanceFloorTile(row, col);
      let mat;
      if (isDanceFloor) {
        mat = new THREE.MeshStandardMaterial({
          color: isLight ? DISCO_TILE_LIGHT : DISCO_TILE_DARK,
          roughness: 0.12,
          metalness: 0.48,
          emissive: "#000000",
          emissiveIntensity: 0,
        });
        tileMaterials.push(mat);
      } else {
        mat = isLight ? borderMatLight : borderMatDark;
      }
      const tile = new THREE.Mesh(tileGeom, mat);
      tile.rotation.x = -Math.PI / 2;
      const tileX = -half + col * GROUND_CELL_SIZE + GROUND_CELL_SIZE / 2;
      const tileZ = -half + row * GROUND_CELL_SIZE + GROUND_CELL_SIZE / 2;
      tile.position.set(tileX, 0, tileZ);
      tileGrid[row][col] = { row, col, mesh: tile, mat, isLight, isDanceFloor, baseY: 0 };
      group.add(tile);
    }
  }
  scene.add(group);
  return { group, tileGeom, tileGrid, half, tileMaterials, borderMatLight, borderMatDark };
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

  if (text) {
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
  }

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
  const addLabel = (x, y, z, rotY, signW, text = WALL_LABEL_TEXT) => {
    const label = buildNeonSign(text, signW, signH);
    label.mesh.position.set(x, y, z);
    label.mesh.rotation.y = rotY;
    group.add(label.mesh);
    labels.push(label);
  };

  addLabel(0, signY, FLOOR_HALF_M - signInset, Math.PI, span - 2);
  addLabel(0, signY, -FLOOR_HALF_M + signInset, 0, span - 2);
  addLabel(-FLOOR_HALF_M + signInset, signY, 0, Math.PI / 2, span - 2);
  addLabel(FLOOR_HALF_M - signInset, signY, doorZ0 + eastSouthLen / 2, -Math.PI / 2, eastSouthLen - 1.5, "");
  addLabel(FLOOR_HALF_M - signInset, signY, doorZ2 + eastNorthLen / 2, -Math.PI / 2, eastNorthLen - 1.5, "");

  const welcome = buildNeonSign(WELCOME_SIGN_TEXT, 21, 2.4, {
    fontSize: 102,
    emissiveIntensity: WELCOME_SIGN_BASE_EMISSIVE,
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
    welcomeSign: welcome,
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
  const approachPadMat = regMat({
    color: DISCO_TILE_DARK,
    roughness: 0.1,
    metalness: 0.52,
    emissive: "#1a1a2a",
    emissiveIntensity: 0.04,
  });
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
  removeKneeCylinder(player);
  removeMoonwalkCostume(player);
  restoreMoonwalkSkinTone(player);
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
  const [speechBubble, setSpeechBubble] = useState(null);
  const setSpeechBubbleRef = useRef(setSpeechBubble);
  setSpeechBubbleRef.current = setSpeechBubble;
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
            remote.targetDance = msg.player.dance ?? null;
            remote.targetDanceT = msg.player.danceT ?? 0;
            remote.targetTrapRow = msg.player.trapRow ?? -1;
            remote.targetTrapCol = msg.player.trapCol ?? -1;
            remote.targetTrapElapsed = msg.player.trapElapsed ?? 0;
            remote.targetShowKneeCylinder = !!msg.player.showKneeCylinder;
            remote.targetKneeCylinderGrowT = msg.player.kneeCylinderGrowT ?? 0;
            remote.targetSillyStringPulse = msg.player.sillyStringPulse ?? 0;
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
    let spinActive = false;
    let spinTimer = 0;
    let spinOrigin = { x: 0, z: 0, ry: 0 };
    let sillyStringPulse = 0;
    let sillyStringSpawnTimer = 0;
    let trapStandTimer = 0;
    let trapStandTileKey = null;
    let trapFallTimer = 0;
    let trapPlayerFallTimer = 0;
    let trapResetTimer = 0;
    let trapActiveTile = null;
    let playerSpawn = { x: 0, z: 0, ry: 0 };
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
    const speechBubbleHeadWorld = new THREE.Vector3();
    let lastSpeechBubbleKey = "";
    let terminalZoomT = 0;
    /** @type {{ x: number, z: number, ry: number } | null} */
    let terminalPlayerFreeze = null;
    let lastTerminalFrameProgress = -1;

    function ensureRemote(playerData) {
      if (playerData.id === localPlayerId || remotes.has(playerData.id)) return;
      const remote = addPlayerToScene(scene, playerData.slot);
      remote.id = playerData.id;
      remote.isRemote = true;
      remote.group.position.set(playerData.x, PLAYER_Y, playerData.z);
      remote.group.rotation.y = playerData.ry;
      remote.targetX = playerData.x;
      remote.targetZ = playerData.z;
      remote.targetRy = playerData.ry;
      remote.moving = !!playerData.moving;
      remote.targetDance = playerData.dance ?? null;
      remote.targetDanceT = playerData.danceT ?? 0;
      remote.targetTrapRow = playerData.trapRow ?? -1;
      remote.targetTrapCol = playerData.trapCol ?? -1;
      remote.targetTrapElapsed = playerData.trapElapsed ?? 0;
      remote.targetShowKneeCylinder = !!playerData.showKneeCylinder;
      remote.targetKneeCylinderGrowT = playerData.kneeCylinderGrowT ?? 0;
      remote.targetSillyStringPulse = playerData.sillyStringPulse ?? 0;
      remote.lastSillyStringPulse = playerData.sillyStringPulse ?? 0;
      remote.dance = null;
      remote.danceT = 0;
      if (remote.targetDance) {
        syncRemoteDance(remote, remote.targetDance);
        remote.danceT = remote.targetDanceT;
      }
      syncRemoteKneeCylinder(
        remote,
        remote.targetShowKneeCylinder,
        remote.targetKneeCylinderGrowT
      );
      remotes.set(playerData.id, remote);
    }

    function removeRemote(playerId) {
      const remote = remotes.get(playerId);
      if (!remote) return;
      clearRemoteTrapVisual(remote);
      disposePlayer(scene, remote);
      remotes.delete(playerId);
    }

    function getLocalTrapElapsed() {
      if (trapPhase === "idle") return 0;
      if (trapPhase === "tileFalling") return trapFallTimer;
      if (trapPhase === "playerFalling") {
        return TRAP_TILE_FALL_DELAY + trapPlayerFallTimer;
      }
      if (trapPhase === "resetting") {
        return TRAP_TILE_FALL_DELAY + TRAP_PLAYER_FALL_DURATION + trapResetTimer;
      }
      return 0;
    }

    function sendState(x, z, ry, moving, dance = null, danceT = 0) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      let trapRow = -1;
      let trapCol = -1;
      let trapElapsed = 0;
      if (trapPhase !== "idle" && trapActiveTile) {
        trapRow = trapActiveTile.row;
        trapCol = trapActiveTile.col;
        trapElapsed = getLocalTrapElapsed();
      }
      ws.send(
        JSON.stringify({
          type: "state",
          x,
          z,
          ry,
          moving,
          dance,
          danceT,
          trapRow,
          trapCol,
          trapElapsed,
          showKneeCylinder: !!localPlayer?.kneeCylinder,
          kneeCylinderGrowT: localPlayer?.kneeCylinder?.growT ?? 0,
          sillyStringPulse,
        })
      );
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
      configureMjFaceTexture(renderer);

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
      localPlayer.isRemote = false;
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
      playerSpawn = { x: startX, z: startZ, ry: startRy };
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
        if (
          k === "m" &&
          trapPhase === "idle" &&
          !moonwalkActive &&
          !spinActive &&
          !terminalViewActiveRef.current &&
          !doorwayTransitioning &&
          localPlayer
        ) {
          e.preventDefault();
          moonwalkOrigin = {
            x: localPlayer.group.position.x,
            z: localPlayer.group.position.z,
            ry: localPlayer.group.rotation.y,
          };
          moonwalkActive = true;
          moonwalkTimer = 0;
          equipMoonwalkCostume(localPlayer);
          playMoonwalkAudio();
          sendState(moonwalkOrigin.x, moonwalkOrigin.z, moonwalkOrigin.ry, true, "moonwalk", 0);
          return;
        }
        if (
          k === "s" &&
          trapPhase === "idle" &&
          !moonwalkActive &&
          !spinActive &&
          !terminalViewActiveRef.current &&
          !doorwayTransitioning &&
          localPlayer
        ) {
          e.preventDefault();
          spinOrigin = {
            x: localPlayer.group.position.x,
            z: localPlayer.group.position.z,
            ry: localPlayer.group.rotation.y,
          };
          spinActive = true;
          spinTimer = 0;
          equipSpinCostume(localPlayer);
          sendState(spinOrigin.x, spinOrigin.z, spinOrigin.ry, false, "spin", 0);
          return;
        }
        if (k === "p" && localPlayer && !terminalViewActiveRef.current) {
          e.preventDefault();
          toggleKneeCylinder(localPlayer);
          const g = localPlayer.group;
          sendState(g.position.x, g.position.z, g.rotation.y, lastMovingSent);
          return;
        }
        if (
          k === " " &&
          trapPhase === "idle" &&
          !terminalViewActiveRef.current &&
          !doorwayTransitioning &&
          !moonwalkActive &&
          !spinActive &&
          localPlayer
        ) {
          if (localPlayer.kneeCylinder?.growT >= 1) {
            e.preventDefault();
            keys.add(k);
            return;
          }

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

        if (remote.targetDance !== remote.dance) {
          syncRemoteDance(remote, remote.targetDance);
        }
        remote.danceT = remote.targetDanceT;

        if (remote.dance === "moonwalk" || remote.dance === "spin") {
          applyRemoteDancePose(remote);
        } else if (remote.moving) {
          remote.walkPhase += dt * 9.5;
          applyWalkCycle(remote.armRig, remote.legRig, remote.walkPhase);
        } else {
          resetPose(remote.armRig, remote.legRig);
        }

        applyRemoteTrapVisual(groundTiles, remote);
        syncRemoteKneeCylinder(
          remote,
          remote.targetShowKneeCylinder,
          remote.targetKneeCylinderGrowT
        );
        updateKneeCylinderGrow(remote, dt);
        syncRemoteSillyString(scene, remote, remote.targetSillyStringPulse);
      };

      animateFn = () => {
        rafId = window.requestAnimationFrame(animateFn);
        const dt = Math.min(clock.getDelta(), 0.033);
        updateDiscoFloor(groundTiles, clock.getElapsedTime());
        const player = localPlayer.group;
        const { armRig, legRig } = localPlayer;

        updateKneeCylinderGrow(localPlayer, dt);
        updateSillyStrings(scene, dt);

        const canSpraySillyString =
          !terminalCameraActive &&
          !doorwayTransitioning &&
          trapPhase === "idle" &&
          !moonwalkActive &&
          !spinActive &&
          localPlayer?.kneeCylinder?.growT >= 1 &&
          keys.has(" ");
        if (canSpraySillyString) {
          sillyStringSpawnTimer -= dt;
          if (sillyStringSpawnTimer <= 0) {
            spawnSillyStringBurst(scene, localPlayer);
            sillyStringPulse += 1;
            sillyStringSpawnTimer = SILLY_STRING_SPAWN_INTERVAL;
          }
        } else {
          sillyStringSpawnTimer = 0;
        }

        const wantsTerminal = terminalViewActiveRef.current;
        const terminalCameraActive = wantsTerminal || terminalZoomT > 0.001;
        const trapActive = trapPhase !== "idle";
        const gameplayLocked =
          doorwayTransitioning || doorwayFadeT > 0 || moonwalkActive || spinActive || trapActive;

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
        const playerCamY = player.position.y;
        gameplayCamPos.set(playerX, playerCamY, playerZ).add(rotatedCameraOffset);
        gameplayLookAt.set(playerX, playerCamY + CAMERA_LOOK_Y, playerZ);

        if (!terminalCameraActive) {
          if (terminalPlayerFreeze) {
            terminalPlayerFreeze = null;
            sendState(player.position.x, player.position.z, player.rotation.y, false);
          }
          resolveLocalPlayerOverlaps(player, doorOpenT, obstacleColliders, remotes);

          if (trapPhase === "idle" && !moonwalkActive && !spinActive && groundTiles?.tileGrid) {
            const tile = getGroundTileAt(
              player.position.x,
              player.position.z,
              groundTiles.tileGrid,
              groundTiles.half
            );
            const tileKey = tile ? `${tile.row}:${tile.col}` : null;
            if (!tile?.isDanceFloor) {
              trapStandTimer = 0;
              trapStandTileKey = tileKey;
            } else if (!moving && tileKey) {
              if (tileKey === trapStandTileKey) {
                trapStandTimer += dt;
              } else {
                trapStandTileKey = tileKey;
                trapStandTimer = 0;
              }
              if (trapStandTimer >= TRAP_STAND_DURATION) {
                trapPhase = "tileFalling";
                trapFallTimer = 0;
                trapActiveTile = tile;
                trapStandTimer = 0;
                trapStandTileKey = null;
                sendState(player.position.x, player.position.z, player.rotation.y, false);
              }
            } else {
              trapStandTimer = 0;
              trapStandTileKey = tileKey;
            }
          } else if (trapPhase === "tileFalling" && trapActiveTile) {
            trapFallTimer += dt;
            trapActiveTile.mesh.position.y -= TRAP_TILE_DROP_SPEED * dt;
            if (trapFallTimer >= TRAP_TILE_FALL_DELAY) {
              trapPhase = "playerFalling";
              trapPlayerFallTimer = 0;
              lastSpeechBubbleKey = "trap-pending";
            }
          } else if (trapPhase === "playerFalling") {
            trapPlayerFallTimer += dt;
            player.position.y -= TRAP_PLAYER_DROP_SPEED * dt;
            if (trapPlayerFallTimer >= TRAP_PLAYER_FALL_DURATION) {
              trapPhase = "resetting";
              trapResetTimer = 0;
              resetTrapTile(trapActiveTile);
              player.position.set(playerSpawn.x, PLAYER_Y, playerSpawn.z);
              player.rotation.y = playerSpawn.ry;
              sendState(playerSpawn.x, playerSpawn.z, playerSpawn.ry, false);
            }
          } else if (trapPhase === "resetting") {
            trapResetTimer += dt;
            if (trapResetTimer >= TRAP_RESET_HOLD) {
              trapPhase = "idle";
              trapActiveTile = null;
              trapFallTimer = 0;
              trapPlayerFallTimer = 0;
              trapResetTimer = 0;
              lastSpeechBubbleKey = "";
              setSpeechBubbleRef.current(null);
            }
          }

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
              sendState(
                player.position.x,
                player.position.z,
                player.rotation.y,
                true,
                "moonwalk",
                moonwalkTimer
              );
            }

            if (moonwalkTimer >= MOONWALK_DURATION) {
              moonwalkActive = false;
              moonwalkTimer = 0;
              lastMovingSent = false;
              lastSpeechBubbleKey = "";
              setSpeechBubbleRef.current(null);
              stopMoonwalkAudio();
              resetMoonwalkHeadRotation(localPlayer.head);
              removeMoonwalkCostume(localPlayer);
              resetPose(armRig, legRig);
              sendState(player.position.x, player.position.z, player.rotation.y, false);
            }
          } else if (spinActive) {
            spinTimer += dt;
            player.position.x = spinOrigin.x;
            player.position.z = spinOrigin.z;

            if (spinTimer < SPIN_ARM_PREP_DURATION) {
              const armProgress = spinTimer / SPIN_ARM_PREP_DURATION;
              player.rotation.y = spinOrigin.ry;
              applySpinPose(armRig, legRig, armProgress, localPlayer);
            } else {
              const rotateElapsed = spinTimer - SPIN_ARM_PREP_DURATION;
              const spinProgress = Math.min(1, rotateElapsed / SPIN_ROTATE_DURATION);
              const spinEase = easeOutCubic(spinProgress);
              player.rotation.y = spinOrigin.ry + PI2 * spinEase;

              if (rotateElapsed < SPIN_FEDORA_GRAB_DURATION) {
                applySpinRightArmReach(armRig, 1);
                applySpinLeftArm(armRig, 1);
                updateSpinFedoraGrab(
                  localPlayer,
                  rotateElapsed / SPIN_FEDORA_GRAB_DURATION
                );
              } else {
                if (!localPlayer.spinFedoraGrabbed) {
                  attachSpinFedoraToHand(localPlayer);
                }
                const sweepProgress = Math.min(
                  1,
                  (rotateElapsed - SPIN_FEDORA_GRAB_DURATION) / SPIN_SWEEP_DURATION
                );
                applySpinRightArmSweep(armRig, sweepProgress);
                applySpinLeftArm(armRig, 1);
                if (localPlayer.fedora?.mode === "held") {
                  lerpHeldFedoraTransform(localPlayer.fedora, 1);
                }
              }
            }

            applySpinLegs(legRig, 1);

            const spinNow = performance.now();
            if (spinNow - lastStateSend >= STATE_SEND_INTERVAL_MS) {
              lastStateSend = spinNow;
              lastMovingSent = false;
              sendState(
                player.position.x,
                player.position.z,
                player.rotation.y,
                false,
                "spin",
                spinTimer
              );
            }

            if (spinTimer >= SPIN_DURATION) {
              spinActive = false;
              spinTimer = 0;
              player.rotation.y = spinOrigin.ry;
              lastMovingSent = false;
              lastSpeechBubbleKey = "";
              setSpeechBubbleRef.current(null);
              stopSpinAudio();
              resetMoonwalkHeadRotation(localPlayer.head);
              removeMoonwalkCostume(localPlayer);
              resetSpinLegs(legRig);
              resetPose(armRig, legRig);
              sendState(player.position.x, player.position.z, player.rotation.y, false);
            }
          } else if (turnInput !== 0) {
            player.rotation.y += turnInput * TURN_SPEED * dt;
          }

          if (!moonwalkActive && !spinActive && moving) {
            const stepX = Math.sin(player.rotation.y) * moveInput * MOVE_SPEED * dt;
            const stepZ = Math.cos(player.rotation.y) * moveInput * MOVE_SPEED * dt;
            applyPlayerMove(player, stepX, stepZ, doorOpenT, obstacleColliders, remotes);
            resolveLocalPlayerOverlaps(player, doorOpenT, obstacleColliders, remotes);
            localPlayer.walkPhase += dt * 9.5;
            applyWalkCycle(armRig, legRig, localPlayer.walkPhase);
          } else if (!moonwalkActive && !spinActive) {
            resetPose(armRig, legRig);
          }

          const now = performance.now();
          if (
            !moonwalkActive &&
            !spinActive &&
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
            gameplayCamPos.set(camX, playerCamY, camZ).add(rotatedCameraOffset);
            gameplayLookAt.set(camX, playerCamY + CAMERA_LOOK_Y, camZ);

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

            applyMoonwalkHeadTurn(localPlayer.head, moonwalkTimer);
          } else if (spinActive) {
            const camRy = spinOrigin.ry;
            const camX = spinOrigin.x;
            const camZ = spinOrigin.z;

            cameraQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), camRy);
            rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
            gameplayCamPos.set(camX, playerCamY, camZ).add(rotatedCameraOffset);
            gameplayLookAt.set(camX, playerCamY + CAMERA_LOOK_Y, camZ);
            camera.position.lerp(gameplayCamPos, 0.08);
            camera.lookAt(gameplayLookAt);
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

        if (perimeterWalls?.welcomeSign?.mat) {
          const flashOn = Math.sin(performance.now() * 0.001 * WELCOME_SIGN_FLASH_SPEED) > 0;
          perimeterWalls.welcomeSign.mat.emissiveIntensity = flashOn
            ? WELCOME_SIGN_BASE_EMISSIVE
            : WELCOME_SIGN_BASE_EMISSIVE * 0.16;
        }

        renderer.render(scene, camera);

        const showHeadBubble =
          !terminalCameraActive &&
          (moonwalkActive ||
            spinActive ||
            trapPhase === "playerFalling" ||
            trapPhase === "resetting");
        if (showHeadBubble) {
          player.updateMatrixWorld(true);
          speechBubbleHeadWorld.set(0, MOONWALK_CAPTION_HEAD_Y, 0);
          player.localToWorld(speechBubbleHeadWorld);
          const w = mountEl.clientWidth;
          const h = mountEl.clientHeight;
          const pt = projectWorldPoint(speechBubbleHeadWorld, camera, w, h);
          const bubbleText = moonwalkActive ? "He he!" : spinActive ? SPIN_CAPTION : TRAP_MESSAGE;
          if (pt) {
            const key = `${bubbleText}:${Math.round(pt.left)}:${Math.round(pt.top)}`;
            if (key !== lastSpeechBubbleKey) {
              lastSpeechBubbleKey = key;
              setSpeechBubbleRef.current({ left: pt.left, top: pt.top, text: bubbleText });
            }
          } else if (lastSpeechBubbleKey !== "hidden") {
            lastSpeechBubbleKey = "hidden";
            setSpeechBubbleRef.current(null);
          }
        } else if (lastSpeechBubbleKey !== "") {
          lastSpeechBubbleKey = "";
          setSpeechBubbleRef.current(null);
        }
      };
      animateFn();
      mountEl.focus();

      mountEl._secretCleanup = () => {
        stopMoonwalkAudio();
        stopSpinAudio();
        clearSillyStrings(scene);
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
          groundTiles.tileMaterials?.forEach((mat) => mat.dispose());
          groundTiles.borderMatLight?.dispose();
          groundTiles.borderMatDark?.dispose();
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
      stopMoonwalkAudio();
      stopSpinAudio();
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
      {speechBubble?.left != null && speechBubble?.top != null ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: speechBubble.left,
            top: speechBubble.top,
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
            {speechBubble.text}
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
