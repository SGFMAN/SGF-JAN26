import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import {
  FOX_KEEPERS,
  SEAL_ORDER,
  QUEST_POEM,
  buildFoxQuestProps,
  clearQuestGroup,
  setPedestalLit,
  createSealBeam,
  foxHomePosition,
  isOnStoneRing,
  stoneRingAvoid,
  sampleDomeRoofY,
} from "./foxQuest.js";

const MAN = {
  url: "/models/dusk-hero.glb?punch=1",
  swimUrl: "/models/scuba-diver.glb",
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Jog_Fwd_Loop",
  jump: "Jump_Start",
  jumpLoop: "Jump_Loop",
  land: "Jump_Land",
  swim: "Swim_Fwd_Loop",
  swimIdle: "Swim_Idle_Loop",
  punches: ["Punch_Jab", "Punch_Cross"],
};
const WALK_SPEED = 2.35;
const RUN_SPEED = 4.4;
const SWIM_SPEED = 2.15;
const TURN_SPEED = 2.4;
const JUMP_SPEED = 3.9;
const GRAVITY = 9.81;
const CAM_BACK = 4.2;
const CAM_UP = 1.45;
const CAM_PITCH_DEFAULT = 0.22;
const CAM_RETURN_SPEED = 4.2;
const BODY_RADIUS = 0.7;
// Same threshold as the old head-under check — swim only once water reaches head height.
const SWIM_DEPTH = 1.7;
// How far the root sits below the waterline while swimming on the surface.
const SWIM_FLOAT = 0.22;
const DIVE_SPEED = 1.85;
const DIVE_START_DEPTH = 1.15;
const DIVE_SURFACE_SNAP = 0.28;
const AIR_SECONDS = 30;
const AIR_REFILL_SECONDS = 6;
const FOX = {
  url: "/models/fox.glb",
  idle: "Survey",
  walk: "Walk",
  run: "Run",
  count: 6,
  height: 0.72,
  walkSpeed: 1.35,
  runSpeed: 3.1,
};
const DEMON = {
  url: "/models/demon.glb",
  walk: "Walk",
  run: "Run",
  count: 2,
  height: 1.9,
  walkSpeed: 1.7,
  runSpeed: 5.2,
  aggroRange: 26,
  attackRange: 1.85,
  attackCooldown: 2.8,
  retreatTime: 2.8,
  hp: 2,
  hitRange: 2.35,
  flyHeight: 22,
  flyDuration: 3.4,
};
const DUSK_ZENITH = new THREE.Color("#0b1016");
const UNDERWATER_FOG = new THREE.Color("#1a4d6e");
const UNDERWATER_BG = new THREE.Color("#071828");
const SWAMP_FOG = new THREE.Color("#5c6b78");
const SWAMP_FOG_DEEP = new THREE.Color("#1a222b");

const DEFAULT_TERRAIN = {
  width: 220,
  depth: 220,
  height: 60,
  rockMaxHeight: 0,
  rockFrequency: 0.35,
  rockSize: 2.2,
  rockBias: 0,
  dirtAmplitude: 8.5,
  dirtFrequency: 0.5,
  seaLevel: 2,
};

const LOOK = {
  brightness: 1.8,
  contrast: 1.0,
  saturation: 1.0,
  tint: 0,
};

const DEFAULT_NPC = {
  foxes: true,
  demons: false,
};

const TERRAIN_TABS = [
  { id: "world", label: "World" },
  { id: "rocks", label: "Rocks" },
  { id: "dirt", label: "Dirt" },
  { id: "grass", label: "Grass" },
  { id: "water", label: "Water" },
  { id: "npcs", label: "NPCs" },
];

function paintForestFloor() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const paint = canvas.getContext("2d");
  paint.fillStyle = "#3b2a1b";
  paint.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i += 1) {
    const roll = Math.random();
    paint.fillStyle = roll < 0.34 ? "#2a1d12" : roll < 0.67 ? "#4d3824" : "#5c4630";
    paint.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 4, 2 + Math.random() * 3);
  }
  for (let i = 0; i < 460; i += 1) {
    paint.fillStyle = i % 3 === 0 ? "#3d4a26" : i % 3 === 1 ? "#6a4528" : "#243018";
    paint.beginPath();
    paint.ellipse(
      Math.random() * 512,
      Math.random() * 512,
      4 + Math.random() * 11,
      2 + Math.random() * 5,
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    paint.fill();
  }
  paint.strokeStyle = "#24160e";
  paint.lineWidth = 1.4;
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    paint.beginPath();
    paint.moveTo(x, y);
    paint.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 16);
    paint.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeDomeMaterial(repeat = 28, layer = 0) {
  const depth = layer / 2;
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: layer > 0,
    depthWrite: layer === 0,
    uniforms: {
      uRepeat: { value: repeat },
      uLayer: { value: depth },
      uAperture: { value: 0 },
      fogNear: { value: SWAMP_FOG_DEEP.clone() },
      fogFar: { value: SWAMP_FOG.clone() },
      fogLite: { value: new THREE.Color("#8a98a6") },
      trunkColor: { value: new THREE.Color("#05070a") },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uRepeat;
      uniform float uLayer;
      uniform float uAperture;
      uniform vec3 fogNear;
      uniform vec3 fogFar;
      uniform vec3 fogLite;
      uniform vec3 trunkColor;
      varying vec2 vUv;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i.x + i.y * 57.0);
        float b = hash(i.x + 1.0 + i.y * 57.0);
        float c = hash(i.x + (i.y + 1.0) * 57.0);
        float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      // Gnarled swamp trunk. yGround is 0 at the rim and 1 at the dome top.
      float swampTree(float x, float yGround, float seed, float lean) {
        float cell = floor(x);
        float f = fract(x);
        if (hash(cell + seed + 3.0) > 0.42) return 0.0;

        float center = 0.22 + hash(cell + seed) * 0.56;
        float width = 0.04 + hash(cell + seed + 19.0) * 0.09;
        float sway = (hash(cell + seed + 41.0) - 0.5) * lean * (0.35 + yGround);
        float d = abs(f - center - sway);
        float trunk = 1.0 - smoothstep(width * 0.4, width, d);

        float branch = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float by = 0.42 + hash(cell + seed + fi * 13.0) * 0.45;
          float bh = 0.035 + hash(cell + seed + fi * 17.0) * 0.05;
          float bx = center + sway + (hash(cell + seed + fi * 29.0) - 0.5) * 0.55;
          float along = abs(yGround - by);
          float across = abs(f - bx - (yGround - by) * (hash(cell + fi) - 0.5) * 1.4);
          branch = max(branch, (1.0 - smoothstep(bh, bh * 2.2, along)) * (1.0 - smoothstep(0.01, 0.045, across)));
        }

        float moss = 0.0;
        float mx = center + (hash(cell + seed + 71.0) - 0.5) * width * 2.0;
        float my = 0.55 + hash(cell + seed + 83.0) * 0.3;
        if (yGround < my && abs(f - mx) < width * 1.8) {
          float fall = (my - yGround) * (3.0 + hash(cell + seed) * 4.0);
          moss = (1.0 - smoothstep(0.0, 0.55, fall)) * (1.0 - smoothstep(width * 0.2, width * 1.6, abs(f - mx)));
          moss *= 0.35 + 0.65 * noise(vec2(f * 30.0, yGround * 18.0 + seed));
        }

        float bark = 0.7 + 0.3 * sin((yGround + hash(cell + seed)) * 28.0);
        return max(trunk * bark, max(branch * 0.85, moss));
      }

      void main() {
        float x = vUv.x * uRepeat;
        // Hemisphere UVs: pole ~1.0, equator ~0.5 → remap to ground(0) … top(1).
        float y = clamp((vUv.y - 0.5) * 2.0, 0.0, 1.0);

        vec3 mist = mix(fogNear, fogFar, smoothstep(0.05, 0.62, y));
        mist = mix(mist, fogLite, smoothstep(0.5, 0.95, y) * 0.55);
        mist += fogLite * (0.05 * noise(vec2(x * 0.35, y * 2.2)));

        float lowMist = smoothstep(0.38, 0.0, y);
        mist = mix(mist, fogFar * 0.85, lowMist * 0.55);

        float treeScale = mix(1.15, 0.7, uLayer);
        float trees =
          swampTree(x * treeScale + 2.0 + uLayer * 7.0, y, 11.0 + uLayer * 20.0, 0.08) * mix(1.0, 0.35, uLayer) +
          swampTree(x * (treeScale * 0.72) + 8.0, y, 47.0 + uLayer * 13.0, 0.11) * mix(0.75, 0.2, uLayer);

        float fogWash = mix(0.15, 0.82, uLayer);
        trees *= 1.0 - fogWash * 0.85;
        vec3 col = mix(mist, trunkColor, clamp(trees, 0.0, 1.0));

        float bank = smoothstep(0.28, 0.0, y);
        float roots = noise(vec2(x * 2.4, y * 14.0)) * bank;
        col = mix(col, vec3(0.02, 0.025, 0.03), bank * 0.88);
        col = mix(col, trunkColor, roots * 0.45);

        // Fade the dome ceiling to black — starts mid-wall so the zenith goes dark early.
        float ceilingFade = smoothstep(0.38, 0.92, y);
        col = mix(col, vec3(0.0), ceilingFade);

        float open = smoothstep(0.62, 0.96, y) * clamp(uAperture, 0.0, 1.0);
        col = mix(col, vec3(0.55, 0.18, 0.95), open * 0.55);
        float alpha = mix(1.0, 0.5, uLayer) * (1.0 - open * 0.92);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

function addDomeShell(parent, materials, radiusX, height, radiusZ) {
  const rim = Math.PI * (radiusX + radiusZ);
  for (let layer = 0; layer < 3; layer += 1) {
    const grow = 1 + layer * 0.035;
    const geo = new THREE.SphereGeometry(1, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = makeDomeMaterial(Math.max(18, rim / (2.6 + layer * 0.4)), layer);
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(radiusX * grow, height * grow, radiusZ * grow);
    mesh.renderOrder = layer;
    parent.add(mesh);
  }
}

function clampInsideEllipse(point, radiusX, radiusZ, margin) {
  const rx = Math.max(1, radiusX - margin);
  const rz = Math.max(1, radiusZ - margin);
  const nx = point.x / rx;
  const nz = point.z / rz;
  const d2 = nx * nx + nz * nz;
  if (d2 <= 1) return;
  const d = Math.sqrt(d2);
  point.x = (nx / d) * rx;
  point.z = (nz / d) * rz;
}

function lowestSkinnedY(model) {
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  let minY = Infinity;
  model.updateMatrixWorld(true);
  model.traverse((obj) => {
    if (!obj.isSkinnedMesh) return;
    obj.skeleton.update();
    const positions = obj.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      local.fromBufferAttribute(positions, i);
      obj.applyBoneTransform(i, local);
      world.copy(local).applyMatrix4(obj.matrixWorld);
      if (world.y < minY) minY = world.y;
    }
  });
  return minY;
}

function fitCharacter(model) {
  const skip = /pole|target|_end|leaf|\bik\b/i;
  const point = new THREE.Vector3();
  const parent = model.parent;
  const savedPos = parent ? parent.position.clone() : null;
  const savedRot = parent ? parent.rotation.clone() : null;
  if (parent) {
    parent.position.set(0, 0, 0);
    parent.rotation.set(0, 0, 0);
    parent.updateMatrixWorld(true);
  }
  const measure = () => {
    let minY = Infinity;
    let maxY = -Infinity;
    const feet = [];
    model.updateMatrixWorld(true);
    model.traverse((obj) => {
      if (!obj.isBone || skip.test(obj.name)) return;
      obj.getWorldPosition(point);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      if (/foot/i.test(obj.name)) feet.push(point.clone());
    });
    const foot = feet.length
      ? feet.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / feet.length)
      : new THREE.Vector3(0, Number.isFinite(minY) ? minY : 0, 0);
    return { height: Math.max(0.2, maxY - minY), foot };
  };

  model.position.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.rotation.set(0, 0, 0);
  const raw = measure();
  model.scale.setScalar(1.8 / raw.height);
  const fitted = measure();
  model.position.set(-fitted.foot.x, -fitted.foot.y, -fitted.foot.z);
  const sole = lowestSkinnedY(model);
  // Plant the skinned sole on y=0; a tiny sink keeps shoes from hovering on dirt.
  if (Number.isFinite(sole)) model.position.y -= sole + 0.02;
  if (parent && savedPos && savedRot) {
    parent.position.copy(savedPos);
    parent.rotation.copy(savedRot);
    parent.updateMatrixWorld(true);
  }
  return 1.8;
}

function fitPropModel(model, targetHeight) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(0.001, size.y);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y -= box.min.y;
}

function playAction(actor, key, { loop = true } = {}) {
  const next = actor?.[key];
  if (!next) return;
  if (actor.mode === key && next.isRunning()) return;
  const prev = actor.current;
  next.enabled = true;
  next.paused = false;
  next.setEffectiveWeight(1);
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  next.clampWhenFinished = !loop;
  next.reset().play();
  if (prev && prev !== next) prev.crossFadeTo(next, 0.12, false);
  actor.current = next;
  actor.mode = key;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clearGroup(group, shared = new Set()) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      if (obj.geometry && !shared.has(obj.geometry)) obj.geometry.dispose();
    });
  }
}

function sampleRockSize(rand, maxSize) {
  const minSize = Math.min(0.18, maxSize * 0.08);
  const power = 2.6;
  return minSize + (maxSize - minSize) * Math.pow(rand(), power);
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function hash2(ix, iz, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + seed * 1013904223;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fz = fade(z - z0);
  const v00 = hash2(x0, z0, seed);
  const v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fz;
}

function fbm2(x, z, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 4; i += 1) {
    sum += (valueNoise2(x * freq, z * freq, seed + i * 97) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / Math.max(0.0001, norm);
}

function buildDirtField(terrain) {
  const amp = Math.max(0, terrain.dirtAmplitude);
  const frequency = Math.max(0, Math.min(1, terrain.dirtFrequency));
  const halfW = terrain.width / 2;
  const halfD = terrain.depth / 2;
  const seed = Math.floor(terrain.width * 19 + terrain.depth * 23 + amp * 131 + frequency * 1000);
  const scale = 0.012 + frequency * 0.11;

  const sample = (x, z) => {
    if (amp <= 0.001) return 0;
    return amp * fbm2(x * scale, z * scale, seed);
  };

  return { sample, halfW, halfD, amp };
}

function sampleRockY(x, z, rocks) {
  let y = -Infinity;
  for (let i = 0; i < rocks.length; i += 1) {
    const rock = rocks[i];
    const dx = x - rock.x;
    const dz = z - rock.z;
    const rx = rock.rxSpan * 1.05;
    const d2 = dx * dx + dz * dz;
    if (d2 > rx * rx) continue;
    // Flat-top cylinder with a short lip — hemisphere tops put feet through the rock midsection.
    const r = Math.sqrt(d2) / rx;
    const lip = r < 0.82 ? 1 : Math.sqrt(Math.max(0, 1 - ((r - 0.82) / 0.18) ** 2));
    const top = rock.midY + rock.rySpan * 0.95 * lip;
    if (top > y) y = top;
  }
  return y;
}

function sampleSurfaceY(x, z, dirt, rocks) {
  const dirtY = dirt ? dirt.sample(x, z) : 0;
  const rockY = sampleRockY(x, z, rocks);
  return Number.isFinite(rockY) ? Math.max(dirtY, rockY) : dirtY;
}

function dirtSupportUnderRock(rock, dirt) {
  if (!dirt) return 0;
  let support = -Infinity;
  const offs = [0, 0.55, -0.55];
  for (let i = 0; i < offs.length; i += 1) {
    for (let j = 0; j < offs.length; j += 1) {
      const x = rock.x + offs[i] * rock.rxSpan * 0.75;
      const z = rock.z + offs[j] * rock.rxSpan * 0.75;
      support = Math.max(support, dirt.sample(x, z));
    }
  }
  return Number.isFinite(support) ? support : 0;
}

function rockSupportFromOthers(rock, others) {
  let support = -Infinity;
  for (let i = 0; i < others.length; i += 1) {
    const other = others[i];
    if (other === rock) continue;
    const dist = Math.hypot(rock.x - other.x, rock.z - other.z);
    const overlap = rock.rxSpan + other.rxSpan - dist;
    // Need a wide seat. Tip / edge balances are ignored so the rock keeps falling.
    if (overlap < Math.min(rock.rxSpan, other.rxSpan) * 0.62) continue;
    const top = other.midY + other.rySpan * 0.9;
    if (top > support) support = top;
  }
  return support;
}

function settleRocks(rocks, dirt) {
  // Drop lowest rocks first so upper ones can rest on a settled pile.
  rocks.sort((a, b) => a.spawnY - b.spawnY || a.rySpan - b.rySpan);
  const settled = [];
  for (let i = 0; i < rocks.length; i += 1) {
    const rock = rocks[i];
    let y = rock.spawnY;
    const gravity = Math.max(0.35, rock.rySpan * 0.55);
    for (let step = 0; step < 48; step += 1) {
      const dirtY = dirtSupportUnderRock(rock, dirt);
      const rockY = rockSupportFromOthers(rock, settled);
      const support = Number.isFinite(rockY) ? Math.max(dirtY, rockY) : dirtY;
      const target = support + rock.rySpan * 0.9;
      if (y <= target + 0.02) {
        y = target;
        break;
      }
      y -= gravity;
      if (y < target) y = target;
    }
    rock.midY = y;
    rock.baseY = y - rock.rySpan;
    settled.push(rock);
  }

  // Second pass: anything still perched on a narrow tip falls the rest of the way.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < rocks.length; i += 1) {
      const rock = rocks[i];
      const others = rocks.filter((item) => item !== rock);
      const dirtY = dirtSupportUnderRock(rock, dirt);
      const rockY = rockSupportFromOthers(rock, others);
      const support = Number.isFinite(rockY) ? Math.max(dirtY, rockY) : dirtY;
      const target = support + rock.rySpan * 0.9;
      if (rock.midY > target + 0.04) {
        rock.midY = target;
        rock.baseY = target - rock.rySpan;
      }
    }
  }
}

function buildRockField(terrain, dirt) {
  const halfW = terrain.width / 2;
  const halfD = terrain.depth / 2;
  const maxH = Math.max(0, terrain.rockMaxHeight);
  const maxSize = Math.max(0.2, terrain.rockSize);
  const frequency = Math.max(0, Math.min(1, terrain.rockFrequency));
  const bias = THREE.MathUtils.clamp(terrain.rockBias ?? 0, -1, 1);
  const dirtAmp = Math.max(0.001, terrain.dirtAmplitude || 0);
  const rocks = [];
  if (maxH <= 0.05 || frequency <= 0.001) return rocks;

  const area = terrain.width * terrain.depth;
  const clusterCount = Math.max(1, Math.round(area * 0.0018 * frequency * frequency * 28));
  const rand = mulberry32(
    Math.floor(
      terrain.width * 13 +
        terrain.depth * 17 +
        maxH * 101 +
        frequency * 1000 +
        maxSize * 77 +
        bias * 500
    )
  );
  const margin = Math.max(2.5, maxSize * 1.2);

  const slopeChance = (x, z) => {
    if (Math.abs(bias) < 0.01 || !dirt) return 1;
    const normalized = THREE.MathUtils.clamp(dirt.sample(x, z) / dirtAmp, -1, 1);
    // bias > 0 prefers hills, bias < 0 prefers valleys
    const score = 0.5 + 0.5 * normalized * bias;
    return THREE.MathUtils.clamp(score, 0.04, 0.98);
  };

  const inBowl = (x, z, pad = 1.2) => {
    const rx = Math.max(1, halfW - pad);
    const rz = Math.max(1, halfD - pad);
    const nx = x / rx;
    const nz = z / rz;
    return nx * nx + nz * nz <= 1;
  };

  for (let c = 0; c < clusterCount; c += 1) {
    let cx = 0;
    let cz = 0;
    let placed = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      cx = (rand() * 2 - 1) * (halfW - margin);
      cz = (rand() * 2 - 1) * (halfD - margin);
      if (inBowl(cx, cz, margin)) {
        placed = true;
        break;
      }
    }
    if (!placed) continue;
    if (Math.hypot(cx, cz) < 4.5) continue;
    if (rand() > slopeChance(cx, cz)) continue;
    const pileKind = rand();
    const pileHeight =
      maxH *
      (pileKind < 0.55 ? 0.18 + rand() * 0.28 : pileKind < 0.86 ? 0.42 + rand() * 0.28 : 0.72 + rand() * 0.28);
    const pileRadius = 3.5 + pileHeight * (1.1 + rand() * 0.9) + maxSize * 0.8;
    const rockBudget = Math.round(10 + pileHeight * 7 + frequency * 18 + rand() * 12);

    for (let i = 0; i < rockBudget; i += 1) {
      const ang = rand() * Math.PI * 2;
      const radial = Math.pow(rand(), 0.72) * pileRadius;
      const x = cx + Math.cos(ang) * radial;
      const z = cz + Math.sin(ang) * radial;
      if (!inBowl(x, z, 1.2)) continue;
      if (Math.hypot(x, z) < 3.2) continue;
      if (rand() > Math.min(1, slopeChance(x, z) + 0.12)) continue;

      const falloff = Math.max(0, 1 - radial / Math.max(0.001, pileRadius));
      const localCap = pileHeight * Math.pow(falloff, 1.15);
      if (localCap < 0.12) continue;

      const size = sampleRockSize(rand, Math.min(maxSize, 0.35 + localCap * 0.55));
      const height = size * (0.55 + rand() * 0.75);
      const radius = size * (0.42 + rand() * 0.28);
      const rxSpan = radius * 1.2;
      const rySpan = height * 0.58;
      const dirtY = dirt ? dirt.sample(x, z) : 0;
      rocks.push({
        x,
        z,
        radius: rxSpan,
        height: rySpan * 2,
        baseY: dirtY + localCap,
        midY: dirtY + localCap + rySpan,
        spawnY: dirtY + localCap + rySpan + 2 + rand() * 3,
        rxSpan,
        rySpan,
        ry: rand() * Math.PI * 2,
        shade: 0.78 + rand() * 0.28,
      });
    }
  }

  settleRocks(rocks, dirt);
  rocks.sort((a, b) => a.baseY - b.baseY);
  return rocks;
}

function makeGrassBladeGeo() {
  const geo = new THREE.BufferGeometry();
  // Two crossed triangles — base sits below y=0 so lean still keeps roots in dirt.
  const positions = new Float32Array([
    -0.05, -0.14, 0, 0.05, -0.14, 0, 0, 0.42, 0.01,
    0, -0.14, -0.05, 0, -0.14, 0.05, 0.01, 0.42, 0,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildGrassField(terrain, dirt) {
  const blades = [];
  if (!dirt) return blades;

  const halfW = terrain.width / 2;
  const halfD = terrain.depth / 2;
  const sea = terrain.seaLevel;
  const area = terrain.width * terrain.depth;
  // Locked at max frequency (1.0 on the old slider scale).
  const target = Math.round(area * 0.58 * Math.pow(1 / 0.3, 2));
  const maxThickness = Math.max(0.05, 1.1 * 0.35);
  const colorSteps = 10;
  const grassColor = 0.6;
  const maxLength = 3;
  // Band of "shore" height above the waterline where blades grow long.
  const shoreBand = Math.max(0.45, (terrain.dirtAmplitude || 1) * 0.12);
  const elevRange = Math.max(0.35, terrain.dirtAmplitude || 1);
  const rand = mulberry32(
    Math.floor(terrain.width * 31 + terrain.depth * 47 + sea * 13)
  );
  const dryMargin = 0.06;
  let attempts = 0;
  const maxAttempts = target * 8;

  while (blades.length < target && attempts < maxAttempts) {
    attempts += 1;
    const x = (rand() * 2 - 1) * halfW;
    const z = (rand() * 2 - 1) * halfD;
    const nx = x / halfW;
    const nz = z / halfD;
    if (nx * nx + nz * nz > 0.94) continue;
    const y = dirt.sample(x, z);
    // Grass only on dry land above the waterline.
    if (y <= sea + dryMargin) continue;

    // Long at the water edge, short inland, even shorter on hill tops.
    const elev = y - sea;
    const atShore = elev <= shoreBand;
    const hillT = THREE.MathUtils.clamp(elev / elevRange, 0, 1);
    const inlandLength = THREE.MathUtils.lerp(maxLength * 0.18, maxLength * 0.045, hillT);
    const heightScale = (atShore ? maxLength : inlandLength) * (0.88 + rand() * 0.24);

    // Most blades stay thin; max thickness is only a rare outlier ceiling.
    const averageWidth = heightScale * 0.22;
    const maxWidth = Math.max(averageWidth, heightScale * maxThickness);
    const widthScale = averageWidth + (maxWidth - averageWidth) * Math.pow(rand(), 2.8);
    // Discrete green band index: 0 = black … last = color-slider max green.
    const colorIndex = Math.floor(rand() * colorSteps);
    blades.push({
      x,
      y,
      z,
      ry: rand() * Math.PI * 2,
      scaleY: heightScale,
      scaleX: Math.max(0.03, widthScale),
      leanX: (rand() - 0.5) * 0.35,
      leanZ: (rand() - 0.5) * 0.35,
      colorIndex,
      colorSteps,
      grassColor,
    });
  }
  return blades;
}

function SliderRow({ label, value, min, max, step, unit, onChange }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: "0.72rem", color: "#e8dcf6" }}>
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{label}</span>
        <span style={{ opacity: 0.85 }}>
          {Number(value).toFixed(step < 1 ? 1 : 0)}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: "100%", accentColor: "#b48ad6" }}
      />
    </label>
  );
}

export default function ForestDusk() {
  const mountRef = useRef(null);
  const underlayRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [terrain, setTerrain] = useState(DEFAULT_TERRAIN);
  const [npc, setNpc] = useState(DEFAULT_NPC);
  const [breath, setBreath] = useState({ show: false, air: 1 });
  const [dialogue, setDialogue] = useState(null);
  const [questHud, setQuestHud] = useState({ spoken: 0, total: FOX_KEEPERS.length, phase: "seek" });
  const terrainRef = useRef(terrain);
  const npcRef = useRef(npc);
  terrainRef.current = terrain;
  npcRef.current = npc;

  useEffect(() => {
    const spec = MAN;
    setStatus("loading");
    const mount = mountRef.current;
    const underlay = underlayRef.current;
    if (!mount) return undefined;

    let alive = true;
    const scene = new THREE.Scene();
    scene.background = DUSK_ZENITH;
    scene.fog = new THREE.Fog(SWAMP_FOG_DEEP, 24, 78);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.zIndex = "0";

    scene.add(new THREE.HemisphereLight(0x6a7888, 0x1a1814, 0.78));
    const moon = new THREE.DirectionalLight(0xb8c4d0, 0.95);
    moon.position.set(-18, 28, 12);
    scene.add(moon);
    const fill = new THREE.DirectionalLight(0x2a3540, 0.4);
    fill.position.set(10, 8, -16);
    scene.add(fill);

    const floorTex = paintForestFloor();
    const wallMaterials = [];
    const groundMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, metalness: 0 });
    const rockMat = new THREE.MeshStandardMaterial({
      color: "#5a534c",
      roughness: 0.96,
      metalness: 0.02,
      flatShading: true,
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.88,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        aboveColor: { value: new THREE.Color("#245a84") },
        belowColor: { value: new THREE.Color("#6fbfde") },
        lineColor: { value: new THREE.Color("#d7f1ff") },
        seaLevel: { value: terrainRef.current.seaLevel },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 aboveColor;
        uniform vec3 belowColor;
        uniform vec3 lineColor;
        uniform float seaLevel;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float ripple = 0.5 + 0.5 * sin(vWorldPos.x * 1.6 + vWorldPos.z * 1.25);
          bool under = cameraPosition.y < seaLevel;

          if (under) {
            // Underside of the waterline: bright sheet overhead.
            float rim = pow(1.0 - clamp(abs(viewDir.y), 0.0, 1.0), 1.35);
            vec3 col = mix(belowColor, lineColor, 0.28 + ripple * 0.22 + rim * 0.45);
            float alpha = 0.72 + rim * 0.22;
            gl_FragColor = vec4(col, alpha);
          } else {
            vec3 col = mix(aboveColor, belowColor, ripple * 0.18);
            float alpha = 0.5 + ripple * 0.08;
            gl_FragColor = vec4(col, alpha);
          }
        }
      `,
    });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const grassGeo = makeGrassBladeGeo();

    const worldRoot = new THREE.Group();
    const rockRoot = new THREE.Group();
    const grassRoot = new THREE.Group();
    const waterRoot = new THREE.Group();
    const animalRoot = new THREE.Group();
    const puzzleRoot = new THREE.Group();
    scene.add(worldRoot);
    scene.add(rockRoot);
    scene.add(grassRoot);
    scene.add(waterRoot);
    scene.add(animalRoot);
    scene.add(puzzleRoot);

    const animals = [];
    const enemies = [];
    let questProps = null;
    const sealBeam = createSealBeam();
    scene.add(sealBeam);
    const quest = {
      spoken: new Set(),
      progress: 0,
      solved: false,
      roofOpen: 0,
      onRoof: false,
      ascending: null,
      prompt: "",
      posted: "",
    };

    function syncQuestHud(extra = {}) {
      const phase = quest.solved ? "open" : quest.spoken.size >= FOX_KEEPERS.length ? "seal" : "seek";
      const post = `${quest.spoken.size}|${phase}|${quest.prompt}|${extra.line || ""}`;
      if (post === quest.posted) return;
      quest.posted = post;
      setQuestHud({
        spoken: quest.spoken.size,
        total: FOX_KEEPERS.length,
        phase,
        prompt: quest.prompt,
      });
    }

    function setDomeAperture(amount) {
      for (let i = 0; i < wallMaterials.length; i += 1) {
        const mat = wallMaterials[i];
        if (mat.uniforms?.uAperture) mat.uniforms.uAperture.value = amount;
      }
    }

    function layoutQuest() {
      questProps = buildFoxQuestProps(puzzleRoot, world);
      for (let i = 0; i < (questProps?.pedestals || []).length; i += 1) {
        setPedestalLit(questProps.pedestals[i], false);
      }
      quest.progress = 0;
      if (quest.solved) {
        quest.roofOpen = 1;
        setDomeAperture(1);
        placeSealBeam();
      } else {
        setDomeAperture(quest.roofOpen);
        sealBeam.visible = false;
      }
      placeFoxHomes();
    }

    function placeSealBeam() {
      if (!questProps) return;
      const sx = questProps.shrine.x;
      const sz = questProps.shrine.z;
      const baseY = world.dirt.sample(sx, sz);
      const topY = world.wallH * 0.98;
      const h = Math.max(4, topY - baseY);
      sealBeam.position.set(sx, baseY + h * 0.5, sz);
      sealBeam.scale.set(1, h, 1);
      sealBeam.visible = quest.solved;
    }

    function placeFoxHomes() {
      for (let i = 0; i < animals.length; i += 1) {
        const fox = animals[i];
        const keeper = FOX_KEEPERS[i] || FOX_KEEPERS[0];
        const home = foxHomePosition(
          world,
          keeper,
          questProps ? stoneRingAvoid(questProps.shrine, questProps.pedestals) : null
        );
        fox.keeperId = keeper.id;
        fox.homeX = home.x;
        fox.homeZ = home.z;
        fox.x = home.x;
        fox.z = home.z;
        fox.yaw = Math.atan2(-home.x, -home.z);
        fox.state = "idle";
        fox.timer = 1.5 + i * 0.3;
        fox.root.position.set(home.x, home.y, home.z);
        fox.root.rotation.y = fox.yaw;
        // Collar glow
        fox.root.traverse((obj) => {
          if (obj.isMesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((mat) => {
              if (mat.emissive) {
                mat.emissive = new THREE.Color(keeper.color);
                mat.emissiveIntensity = quest.spoken.has(keeper.id) ? 0.55 : 0.22;
              }
            });
          }
        });
      }
    }

    const world = {
      halfW: terrainRef.current.width / 2,
      halfD: terrainRef.current.depth / 2,
      wallH: terrainRef.current.height,
      rocks: [],
      dirt: buildDirtField(terrainRef.current),
      seaLevel: terrainRef.current.seaLevel,
      fogNear: 28,
      fogFar: 86,
      key: "",
    };
    const fogAbove = SWAMP_FOG_DEEP.clone();
    const fogNow = SWAMP_FOG_DEEP.clone();
    const bgNow = DUSK_ZENITH.clone();

    const sharedGeo = new Set([rockGeo, grassGeo]);

    function rebuildWorld(next) {
      const key = [
        next.width,
        next.depth,
        next.height,
        next.rockMaxHeight,
        next.rockFrequency,
        next.rockSize,
        next.rockBias,
        next.dirtAmplitude,
        next.dirtFrequency,
        next.seaLevel,
      ].join("|");
      if (key === world.key) return;
      world.key = key;
      world.halfW = next.width / 2;
      world.halfD = next.depth / 2;
      world.wallH = next.height;
      world.seaLevel = next.seaLevel;
      world.dirt = buildDirtField(next);

      clearGroup(worldRoot, sharedGeo);
      clearGroup(rockRoot, sharedGeo);
      clearGroup(grassRoot, sharedGeo);
      clearGroup(waterRoot, sharedGeo);
      while (wallMaterials.length) {
        const mat = wallMaterials.pop();
        mat.dispose();
      }

      // Grid mesh (not a circle fan) so dirt hills keep natural non-radial topology/UVs.
      const segments = Math.max(48, Math.min(128, Math.round(Math.max(next.width, next.depth) / 1.5)));
      const groundGeo = new THREE.PlaneGeometry(next.width, next.depth, segments, segments);
      groundGeo.rotateX(-Math.PI / 2);
      const groundPos = groundGeo.attributes.position;
      const groundUv = groundGeo.attributes.uv;
      for (let i = 0; i < groundPos.count; i += 1) {
        let x = groundPos.getX(i);
        let z = groundPos.getZ(i);
        const nx = x / world.halfW;
        const nz = z / world.halfD;
        const d2 = nx * nx + nz * nz;
        if (d2 > 1) {
          const d = Math.sqrt(d2);
          x = (nx / d) * world.halfW;
          z = (nz / d) * world.halfD;
          groundPos.setX(i, x);
          groundPos.setZ(i, z);
        }
        groundPos.setY(i, world.dirt.sample(x, z));
        groundUv.setXY(i, x / next.width + 0.5, z / next.depth + 0.5);
      }
      groundPos.needsUpdate = true;
      groundUv.needsUpdate = true;
      groundGeo.computeVertexNormals();
      const ground = new THREE.Mesh(groundGeo, groundMat);
      worldRoot.add(ground);

      // Swamp bowl: inward-facing hemisphere shell (no cube walls / ceiling).
      addDomeShell(worldRoot, wallMaterials, world.halfW, next.height, world.halfD);

      const repeats = Math.max(8, Math.round(Math.max(next.width, next.depth) / 4));
      floorTex.repeat.set(repeats, repeats);
      floorTex.needsUpdate = true;

      const fogFar = Math.max(56, Math.hypot(next.width, next.depth) * 0.72);
      world.fogNear = fogFar * 0.32;
      world.fogFar = fogFar;
      scene.fog.near = world.fogNear;
      scene.fog.far = world.fogFar;
      scene.fog.color.copy(fogAbove);
      scene.background = bgNow.copy(DUSK_ZENITH);
      camera.far = fogFar + 80;
      camera.updateProjectionMatrix();

      world.rocks = buildRockField(next, world.dirt);
      const rockCount = world.rocks.length;
      if (rockCount > 0) {
        const mesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const euler = new THREE.Euler();
        const color = new THREE.Color();
        for (let i = 0; i < rockCount; i += 1) {
          const rock = world.rocks[i];
          position.set(rock.x, rock.midY, rock.z);
          euler.set(0, rock.ry, 0);
          quaternion.setFromEuler(euler);
          scale.set(rock.rxSpan, rock.rySpan, rock.rxSpan);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(i, matrix);
          color.setRGB(0.34 * rock.shade, 0.31 * rock.shade, 0.28 * rock.shade);
          mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        rockRoot.add(mesh);
      }

      const grassBlades = buildGrassField(next, world.dirt);
      if (grassBlades.length > 0) {
        const mesh = new THREE.InstancedMesh(grassGeo, grassMat, grassBlades.length);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const euler = new THREE.Euler();
        const color = new THREE.Color();
        for (let i = 0; i < grassBlades.length; i += 1) {
          const blade = grassBlades[i];
          // Plant deep so leaning outliers stay rooted in the dirt.
          position.set(blade.x, blade.y - 0.06 * blade.scaleY, blade.z);
          euler.set(blade.leanX, blade.ry, blade.leanZ);
          quaternion.setFromEuler(euler);
          scale.set(blade.scaleX, blade.scaleY, blade.scaleX);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(i, matrix);
          const maxGreen = blade.grassColor ?? 0.6;
          const steps = Math.max(1, blade.colorSteps || 10);
          const t = steps <= 1 ? 1 : blade.colorIndex / (steps - 1);
          const intensity = maxGreen * t;
          color.setRGB(0.35 * intensity, 0.95 * intensity, 0.22 * intensity);
          mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        grassRoot.add(mesh);
      }

      // Water fills every part of the dirt that sits below sea level.
      waterMat.uniforms.seaLevel.value = next.seaLevel;
      const waterGeo = new THREE.CircleGeometry(1, Math.max(48, Math.min(96, segments)));
      waterGeo.rotateX(-Math.PI / 2);
      const waterPos = waterGeo.attributes.position;
      const waterPad = 0.98;
      for (let i = 0; i < waterPos.count; i += 1) {
        waterPos.setX(i, waterPos.getX(i) * world.halfW * waterPad);
        waterPos.setZ(i, waterPos.getZ(i) * world.halfD * waterPad);
      }
      waterPos.needsUpdate = true;
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.y = next.seaLevel;
      water.renderOrder = 3;
      waterRoot.add(water);
      waterRoot.visible = next.seaLevel > -7.5;
      placeCreaturesOnDryLand();
      layoutQuest();
    }

    function pickDryLandSpot(rand, margin = 6, minFromOrigin = 10) {
      const halfW = world.halfW;
      const halfD = world.halfD;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const x = (rand() * 2 - 1) * (halfW - margin);
        const z = (rand() * 2 - 1) * (halfD - margin);
        if ((x / halfW) ** 2 + (z / halfD) ** 2 > 0.85) continue;
        if (Math.hypot(x, z) < minFromOrigin) continue;
        const y = world.dirt.sample(x, z);
        if (y <= world.seaLevel + 0.25) continue;
        return { x, z, y };
      }
      return null;
    }

    function placeCreaturesOnDryLand() {
      const rand = mulberry32(Math.floor(world.halfW * 91 + world.halfD * 73 + world.seaLevel * 11));
      const placeList = (list, minFromOrigin) => {
        for (let i = 0; i < list.length; i += 1) {
          const creature = list[i];
          const spot = pickDryLandSpot(rand, 6, minFromOrigin);
          if (!spot) continue;
          creature.x = spot.x;
          creature.z = spot.z;
          creature.yaw = rand() * Math.PI * 2;
          creature.state = "idle";
          creature.timer = 1 + rand() * 3;
          creature.attackCool = 0;
          if (creature.hp != null) {
            creature.hp = DEMON.hp;
            creature.alive = true;
            creature.hitsOnPlayer = 0;
            creature.flyY = null;
            creature.root.visible = true;
            if (!creature.root.parent) animalRoot.add(creature.root);
          }
          creature.root.position.set(spot.x, spot.y, spot.z);
          creature.root.rotation.y = creature.yaw;
        }
      };
      placeFoxHomes();
      placeList(enemies, 18);
    }

    function updateAnimals(dt) {
      const foxesOn = npcRef.current.foxes;
      for (let i = 0; i < animals.length; i += 1) {
        const fox = animals[i];
        fox.root.visible = foxesOn;
        if (!foxesOn) continue;
        fox.timer -= dt;
        if (fox.timer <= 0) {
          const roll = Math.random();
          if (roll < 0.4) {
            fox.state = "idle";
            fox.timer = 2 + Math.random() * 4;
          } else if (roll < 0.88) {
            fox.state = "walk";
            fox.yaw += (Math.random() - 0.5) * 1.2;
            fox.timer = 2 + Math.random() * 3.5;
          } else {
            fox.state = "run";
            fox.yaw += (Math.random() - 0.5) * 0.7;
            fox.timer = 0.9 + Math.random() * 1.4;
          }
        }

        // Talking fox is posed by the conversation update.
        if (quest.talk && quest.talk.fox === fox) continue;

        if (fox.state === "walk" || fox.state === "run") {
          const speed = fox.state === "run" ? FOX.runSpeed : FOX.walkSpeed;
          const nextX = fox.x + Math.sin(fox.yaw) * speed * dt;
          const nextZ = fox.z + Math.cos(fox.yaw) * speed * dt;
          const nextY = world.dirt.sample(nextX, nextZ);
          const blockedByStones =
            questProps && isOnStoneRing(questProps.shrine, questProps.pedestals, nextX, nextZ);
          // Never step into water or onto the altar ring — turn back toward home.
          if (nextY <= world.seaLevel + 0.35 || blockedByStones) {
            if (fox.homeX != null) fox.yaw = Math.atan2(fox.homeX - fox.x, fox.homeZ - fox.z);
            else fox.yaw += Math.PI * (0.6 + Math.random() * 0.8);
            fox.state = "idle";
            fox.timer = 0.8 + Math.random();
          } else {
            fox.x = nextX;
            fox.z = nextZ;
            clampInsideEllipse(fox, world.halfW, world.halfD, 2.5);
            // Stay near their landmark so they remain findable.
            if (fox.homeX != null) {
              const hx = fox.x - fox.homeX;
              const hz = fox.z - fox.homeZ;
              if (Math.hypot(hx, hz) > 9) {
                fox.yaw = Math.atan2(fox.homeX - fox.x, fox.homeZ - fox.z);
                fox.state = "walk";
              }
            }
          }
        }

        // If somehow wet, or standing on the altar ring, snap home onto dry land.
        const standingOnStones =
          questProps && isOnStoneRing(questProps.shrine, questProps.pedestals, fox.x, fox.z);
        if ((world.dirt.sample(fox.x, fox.z) <= world.seaLevel + 0.35 || standingOnStones) && fox.homeX != null) {
          fox.x = fox.homeX;
          fox.z = fox.homeZ;
          fox.state = "idle";
          fox.timer = 1.2;
        }

        const ground = sampleSurfaceY(fox.x, fox.z, world.dirt, world.rocks);
        fox.root.position.set(fox.x, ground, fox.z);
        fox.root.rotation.y = fox.yaw;

        if (fox.state === "run" && fox.run) playAction(fox, "run");
        else if (fox.state === "walk" && fox.walk) playAction(fox, "walk");
        else if (fox.idle) playAction(fox, "idle");
        fox.mixer.update(dt);
      }
    }

    function nearestFox(playerPos, range = 3.1, { ignoreLatch = false } = {}) {
      let best = null;
      let bestDist = range;
      for (let i = 0; i < animals.length; i += 1) {
        const fox = animals[i];
        if (!fox.root.visible) continue;
        const d = Math.hypot(fox.x - playerPos.x, fox.z - playerPos.z);
        if (!ignoreLatch && fox.awaitLeave && d < range + 1.4) continue;
        if (fox.awaitLeave && d >= range + 1.4) fox.awaitLeave = false;
        if (d < bestDist) {
          bestDist = d;
          best = fox;
        }
      }
      return best;
    }

    function nearestPedestal(playerPos, range = 2.4) {
      if (!questProps) return null;
      let best = null;
      let bestDist = range;
      for (let i = 0; i < questProps.pedestals.length; i += 1) {
        const ped = questProps.pedestals[i];
        const d = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
        if (d < bestDist) {
          bestDist = d;
          best = ped;
        }
      }
      return best;
    }

    function nearCabin(playerPos, range = 3.4) {
      if (!questProps?.cabin) return false;
      return Math.hypot(questProps.cabin.x - playerPos.x, questProps.cabin.z - playerPos.z) < range;
    }

    function beginFoxTalk(fox) {
      if (quest.talk || !fox) return;
      const keeper = FOX_KEEPERS[fox.keeperId] || FOX_KEEPERS[0];
      const firstMeet = !quest.spoken.has(keeper.id);
      quest.spoken.add(keeper.id);
      fox.root.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat) => {
            if (mat.emissiveIntensity != null) mat.emissiveIntensity = 0.55;
          });
        }
      });
      const lines = firstMeet
        ? keeper.firstLines.slice()
        : quest.spoken.size >= FOX_KEEPERS.length
          ? keeper.spokenLines.slice()
          : keeper.againLines.slice();
      fox.state = "idle";
      fox.timer = 99;
      punching = null;
      hopVel = 0;
      hopHeight = 0;
      grounded = true;
      jumpPhase = null;
      const first = lines[0] || "…";
      quest.talk = {
        fox,
        keeper,
        lines,
        index: 0,
        age: 0,
        hold: Math.max(3.2, Math.min(8, first.length * 0.06)),
      };
      setDialogue({
        name: `${keeper.name}, ${keeper.title}`,
        text: first,
        color: keeper.color,
      });
      if (quest.spoken.size >= FOX_KEEPERS.length && !quest.solved) {
        quest.prompt = "All six foxes have spoken. Press the stones in the right order.";
      } else {
        quest.prompt = `Foxes spoken to ${quest.spoken.size}/${FOX_KEEPERS.length}`;
      }
      syncQuestHud({ line: first });
    }

    function updateFoxTalk(dt) {
      if (!quest.talk) return false;
      const session = quest.talk;
      const fox = session.fox;
      if (!fox?.root) {
        quest.talk = null;
        setDialogue(null);
        return false;
      }

      // Face each other and hold still.
      const toFox = Math.atan2(fox.x - pos.x, fox.z - pos.z);
      facingYaw = toFox;
      fox.yaw = toFox + Math.PI;
      fox.state = "idle";
      fox.timer = 99;
      const ground = sampleSurfaceY(fox.x, fox.z, world.dirt, world.rocks);
      fox.root.position.set(fox.x, ground, fox.z);
      fox.root.rotation.y = fox.yaw;
      if (fox.idle) playAction(fox, "idle");
      fox.mixer.update(dt);

      session.age += dt;
      if (session.age >= session.hold) {
        session.index += 1;
        if (session.index >= session.lines.length) {
          fox.awaitLeave = true;
          fox.timer = 1.2 + Math.random();
          quest.talk = null;
          setDialogue(null);
          if (quest.spoken.size >= FOX_KEEPERS.length && !quest.solved) {
            quest.prompt = "All six foxes have spoken. Press the stones in the right order.";
          }
          syncQuestHud();
          return false;
        }
        const text = session.lines[session.index];
        session.age = 0;
        session.hold = Math.max(3.2, Math.min(8, text.length * 0.06));
        setDialogue({
          name: `${session.keeper.name}, ${session.keeper.title}`,
          text,
          color: session.keeper.color,
        });
        syncQuestHud({ line: text });
      }
      return true;
    }

    function readPoemBoard() {
      setDialogue({
        name: "Cabin board",
        text: QUEST_POEM.join(" "),
        color: "#cbb6ef",
      });
      quest.prompt = quest.spoken.size >= FOX_KEEPERS.length
        ? "All six foxes have spoken. Press the stones in the right order."
        : `Foxes spoken to ${quest.spoken.size}/${FOX_KEEPERS.length}`;
      syncQuestHud();
    }

    function tryPedestal(ped) {
      if (quest.solved) return;
      if (quest.spoken.size < FOX_KEEPERS.length) {
        setDialogue({
          name: "Stone ring",
          text: "These stones will not work yet. Talk to all six foxes first.",
          color: "#9aa3b2",
        });
        return;
      }
      const expected = SEAL_ORDER[quest.progress];
      if (ped.id === expected) {
        setPedestalLit(ped, true);
        quest.progress += 1;
        if (quest.progress >= SEAL_ORDER.length) {
          quest.solved = true;
          quest.prompt = "The roof is open. Step into the purple beam.";
          setDialogue({
            name: "Roof",
            text: "The roof is open. A purple beam is shining through.",
            color: "#d09cff",
          });
          placeSealBeam();
        } else {
          setDialogue({
            name: "Stone ring",
            text: "That stone was right. It is lit.",
            color: FOX_KEEPERS[ped.id].color,
          });
          quest.prompt = `Seal progress ${quest.progress}/${SEAL_ORDER.length}`;
        }
      } else {
        quest.progress = 0;
        for (let i = 0; i < questProps.pedestals.length; i += 1) {
          setPedestalLit(questProps.pedestals[i], false);
        }
        setDialogue({
          name: "Stone ring",
          text: "That was the wrong stone. The ring has reset.",
          color: "#b07070",
        });
        quest.prompt = "Wrong order. Start again.";
      }
      syncQuestHud();
    }

    function handleQuestInteract(playerPos) {
      // Fox talk is automatic on approach — Enter is only for board / stones.
      if (nearCabin(playerPos)) {
        readPoemBoard();
        return true;
      }
      const ped = nearestPedestal(playerPos);
      if (ped) {
        tryPedestal(ped);
        return true;
      }
      return false;
    }

    function updateQuestWorld(dt, playerPos) {
      if (quest.solved && quest.roofOpen < 1) {
        quest.roofOpen = Math.min(1, quest.roofOpen + dt * 0.28);
        setDomeAperture(quest.roofOpen);
        placeSealBeam();
      }
      if (sealBeam.visible) {
        sealBeam.rotation.y += dt * 0.35;
        const pulse = 0.48 + Math.sin(performance.now() * 0.004) * 0.12;
        sealBeam.material.opacity = pulse;
      }

      // Clear leave-latches when the player walks away.
      for (let i = 0; i < animals.length; i += 1) {
        const fox = animals[i];
        if (!fox.awaitLeave) continue;
        if (Math.hypot(fox.x - playerPos.x, fox.z - playerPos.z) > 4.8) fox.awaitLeave = false;
      }

      if (!quest.talk && !quest.ascending && !quest.onRoof) {
        if (nearCabin(playerPos)) quest.prompt = "Enter — read the board";
        else if (nearestPedestal(playerPos)) {
          quest.prompt =
            quest.spoken.size < FOX_KEEPERS.length
              ? "Enter — talk to all six foxes first"
              : "Enter — press this stone";
        }
        syncQuestHud();
      }

      if (quest.solved && !quest.onRoof && !quest.ascending && !quest.talk && questProps) {
        const dx = playerPos.x - questProps.shrine.x;
        const dz = playerPos.z - questProps.shrine.z;
        if (Math.hypot(dx, dz) < 2.1) {
          quest.ascending = {
            t: 0,
            dur: 3.2,
            fromY: sampleSurfaceY(playerPos.x, playerPos.z, world.dirt, world.rocks),
            toX: questProps.shrine.x * 0.08,
            toZ: questProps.shrine.z * 0.08,
          };
          diving = false;
          punching = null;
          hopVel = 0;
          hopHeight = 0;
          quest.prompt = "Rising…";
          syncQuestHud();
        }
      }
    }

    function carriedBusy() {
      return !!(abduction && (abduction.phase === "grab" || abduction.phase === "fly"));
    }

    let abduction = null;

    function pickWaterDropSpot(fromX, fromZ) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < 72; i += 1) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 28;
        const x = fromX + Math.sin(ang) * dist;
        const z = fromZ + Math.cos(ang) * dist;
        if ((x / world.halfW) ** 2 + (z / world.halfD) ** 2 > 0.72) continue;
        const y = world.dirt.sample(x, z);
        const depth = world.seaLevel - y;
        if (depth < SWIM_DEPTH * 0.55) continue;
        const score = depth * 3 - Math.hypot(x - fromX, z - fromZ) * 0.04;
        if (score > bestScore) {
          bestScore = score;
          best = { x, z };
        }
      }
      if (best) return best;
      return { x: fromX * 0.25, z: fromZ * 0.25 };
    }

    function startAbduction(demon) {
      const drop = pickWaterDropSpot(demon.x, demon.z);
      abduction = {
        demon,
        phase: "grab",
        t: 0,
        startX: demon.x,
        startZ: demon.z,
        dropX: drop.x,
        dropZ: drop.z,
      };
      demon.state = "abduct";
      demon.yaw = Math.atan2(drop.x - demon.x, drop.z - demon.z);
      punching = null;
      hopVel = 0;
      hopHeight = 0;
      grounded = false;
      jumpPhase = null;
    }

    function updateAbduction(dt) {
      if (!abduction) return;
      const demon = abduction.demon;
      if (!demon.alive) {
        abduction = null;
        return;
      }
      abduction.t += dt;
      const ground = sampleSurfaceY(demon.x, demon.z, world.dirt, world.rocks);

      if (abduction.phase === "grab") {
        const u = Math.min(1, abduction.t / 0.9);
        const climb = Math.max(world.seaLevel, ground) + DEMON.flyHeight * 0.45;
        demon.flyY = THREE.MathUtils.lerp(ground, climb, u * u);
        demon.root.position.set(demon.x, demon.flyY, demon.z);
        demon.root.rotation.y = demon.yaw;
        demon.root.rotation.x = -u * 0.28;
        if (u >= 1) {
          abduction.phase = "fly";
          abduction.t = 0;
          abduction.startX = demon.x;
          abduction.startZ = demon.z;
        }
      } else if (abduction.phase === "fly") {
        const u = Math.min(1, abduction.t / DEMON.flyDuration);
        const ease = u * u * (3 - 2 * u);
        demon.x = THREE.MathUtils.lerp(abduction.startX, abduction.dropX, ease);
        demon.z = THREE.MathUtils.lerp(abduction.startZ, abduction.dropZ, ease);
        const peak = Math.max(world.seaLevel, ground) + DEMON.flyHeight;
        demon.flyY = peak + Math.sin(u * Math.PI) * 3.5;
        demon.yaw = Math.atan2(abduction.dropX - abduction.startX, abduction.dropZ - abduction.startZ);
        demon.root.position.set(demon.x, demon.flyY, demon.z);
        demon.root.rotation.y = demon.yaw;
        demon.root.rotation.x = -0.32;
        if (u >= 1) {
          abduction.phase = "drop";
          abduction.t = 0;
          pos.x = demon.x;
          pos.z = demon.z;
          // Splash into the water from a short fall above the surface.
          const bed = world.dirt.sample(pos.x, pos.z);
          hopHeight = Math.max(0.8, world.seaLevel + 1.5 - bed);
          hopVel = -5.5;
          grounded = false;
          jumpPhase = "air";
          punching = null;
        }
      } else if (abduction.phase === "drop") {
        // Peel off and stay airborne for a while before landing.
        const fleeDur = 3.4;
        const u = Math.min(1, abduction.t / fleeDur);
        demon.yaw += 0.35 * dt;
        demon.x += Math.sin(demon.yaw) * DEMON.runSpeed * 1.45 * dt;
        demon.z += Math.cos(demon.yaw) * DEMON.runSpeed * 1.45 * dt;
        clampInsideEllipse(demon, world.halfW, world.halfD, 2.2);
        const landY = sampleSurfaceY(demon.x, demon.z, world.dirt, world.rocks);
        const cruise = Math.max(world.seaLevel, landY) + DEMON.flyHeight * 1.15;
        // Hold altitude most of the flee, then settle in the last stretch.
        const descend = Math.max(0, (u - 0.78) / 0.22);
        demon.flyY = THREE.MathUtils.lerp(cruise, landY, descend * descend);
        demon.root.position.set(demon.x, demon.flyY, demon.z);
        demon.root.rotation.y = demon.yaw;
        demon.root.rotation.x = THREE.MathUtils.lerp(-0.28, 0, descend);
        if (u >= 1) {
          demon.flyY = null;
          demon.root.rotation.x = 0;
          demon.hitsOnPlayer = 0;
          demon.state = "retreat";
          demon.timer = 4.5;
          demon.attackCool = DEMON.attackCooldown * 1.4;
          abduction = null;
        }
      }

      if (demon.run) playAction(demon, "run");
      demon.mixer.timeScale = 1.3;
      demon.mixer.update(dt);
    }

    function punchHitDemons(playerPos, yaw) {
      if (abduction || !npcRef.current.demons) return;
      for (let i = 0; i < enemies.length; i += 1) {
        const demon = enemies[i];
        if (!demon.alive) continue;
        const dx = demon.x - playerPos.x;
        const dz = demon.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > DEMON.hitRange) continue;
        const toDemon = Math.atan2(dx, dz);
        let ang = Math.abs(toDemon - yaw);
        if (ang > Math.PI) ang = Math.PI * 2 - ang;
        if (ang > 1.15) continue;

        demon.hp -= 1;
        demon.x += Math.sin(toDemon) * 1.4;
        demon.z += Math.cos(toDemon) * 1.4;
        clampInsideEllipse(demon, world.halfW, world.halfD, 2.2);
        demon.state = "retreat";
        demon.yaw = toDemon;
        demon.timer = 1.4 + Math.random() * 0.6;
        demon.attackCool = Math.max(demon.attackCool, 1.2);

        if (demon.hp <= 0) {
          demon.alive = false;
          demon.state = "dead";
          demon.root.visible = false;
          if (demon.root.parent) demon.root.parent.remove(demon.root);
        }
      }
    }

    function updateEnemies(dt, playerPos) {
      const demonsOn = npcRef.current.demons;
      if (!demonsOn && abduction) {
        const demon = abduction.demon;
        abduction = null;
        if (demon) {
          demon.state = "idle";
          demon.timer = 2;
          demon.flyY = null;
          demon.root.rotation.x = 0;
        }
        hopVel = 0;
        hopHeight = 0;
        grounded = true;
        jumpPhase = null;
        characterRoot.rotation.x = 0;
        characterRoot.rotation.z = 0;
      }
      for (let i = 0; i < enemies.length; i += 1) {
        const demon = enemies[i];
        if (!demon.alive) continue;
        demon.root.visible = demonsOn && demon.alive;
        if (!demonsOn) continue;
        if (demon.state === "abduct") continue;
        demon.attackCool = Math.max(0, demon.attackCool - dt);
        const dx = playerPos.x - demon.x;
        const dz = playerPos.z - demon.z;
        const dist = Math.hypot(dx, dz);
        const toPlayer = Math.atan2(dx, dz);

        if (demon.state === "retreat") {
          // Back off after a hit so the player isn't juggled.
          demon.timer -= dt;
          demon.x += Math.sin(demon.yaw) * DEMON.runSpeed * 1.05 * dt;
          demon.z += Math.cos(demon.yaw) * DEMON.runSpeed * 1.05 * dt;
          if (demon.timer <= 0) {
            demon.state = "idle";
            demon.timer = 1.2 + Math.random();
          }
        } else if (dist < DEMON.attackRange && demon.attackCool <= 0) {
          demon.attackCool = DEMON.attackCooldown;
          demon.hitsOnPlayer += 1;
          // Two hits before the player lands two punches → talon grab + water drop.
          if (demon.hitsOnPlayer >= 2 && demon.hp > 0 && !abduction) {
            startAbduction(demon);
          } else {
            const push = 2.6;
            playerPos.x -= Math.sin(toPlayer) * push;
            playerPos.z -= Math.cos(toPlayer) * push;
            clampInsideEllipse(playerPos, world.halfW, world.halfD, BODY_RADIUS);
            if (grounded) {
              hopVel = 2.6;
              hopHeight = 0.02;
              grounded = false;
              jumpPhase = "air";
            }
            demon.state = "retreat";
            demon.yaw = toPlayer + Math.PI + (Math.random() - 0.5) * 0.5;
            demon.timer = DEMON.retreatTime + Math.random() * 0.8;
          }
        } else if (dist < DEMON.aggroRange) {
          demon.state = "chase";
          demon.yaw = toPlayer;
          demon.x += Math.sin(demon.yaw) * DEMON.runSpeed * dt;
          demon.z += Math.cos(demon.yaw) * DEMON.runSpeed * dt;
        } else {
          demon.timer -= dt;
          if (demon.timer <= 0) {
            const roll = Math.random();
            if (roll < 0.4) {
              demon.state = "idle";
              demon.timer = 2 + Math.random() * 3;
            } else {
              demon.state = "patrol";
              demon.yaw += (Math.random() - 0.5) * 1.6;
              demon.timer = 3 + Math.random() * 4;
            }
          }
          if (demon.state === "patrol") {
            demon.x += Math.sin(demon.yaw) * DEMON.walkSpeed * dt;
            demon.z += Math.cos(demon.yaw) * DEMON.walkSpeed * dt;
          }
        }

        clampInsideEllipse(demon, world.halfW, world.halfD, 2.2);
        const dirtY = world.dirt.sample(demon.x, demon.z);
        if (dirtY <= world.seaLevel + 0.2) {
          demon.yaw += Math.PI * 0.7;
          if (demon.state === "retreat") demon.timer = Math.min(demon.timer, 0.4);
          else {
            demon.state = "idle";
            demon.timer = 1.5;
          }
        }

        const ground = sampleSurfaceY(demon.x, demon.z, world.dirt, world.rocks);
        demon.root.position.set(demon.x, ground, demon.z);
        demon.root.rotation.y = demon.yaw;
        demon.root.rotation.x = 0;

        if (demon.state === "chase" || demon.state === "retreat") {
          if (demon.run) playAction(demon, "run");
          demon.mixer.timeScale = demon.state === "retreat" ? 1.25 : 1.15;
        } else if (demon.state === "patrol" && demon.walk) {
          playAction(demon, "walk");
          demon.mixer.timeScale = 1;
        } else if (demon.walk) {
          playAction(demon, "walk");
          demon.mixer.timeScale = 0.55;
        }
        demon.mixer.update(dt);
      }
    }

    rebuildWorld(terrainRef.current);

    const characterRoot = new THREE.Group();
    scene.add(characterRoot);
    const pos = { x: 0, z: 8 };
    let facingYaw = 0;
    let hopVel = 0;
    let hopHeight = 0;
    let grounded = true;
    let jumpPressed = false;
    let punchPressed = false;
    let punching = null;
    let jumpPhase = null;
    let landTime = 0;
    let lookHeight = 1.05;
    let diving = false;
    let submerge = 0;
    // Positive = nose down / swim deeper. Mouse look drives this while diving.
    let divePitch = 0.7;
    const life = { air: 1, posted: "" };

    function syncBreathHud() {
      const show = diving || life.air < 0.995;
      const post = `${show ? 1 : 0}|${life.air.toFixed(3)}|${diving ? 1 : 0}`;
      if (post === life.posted) return;
      life.posted = post;
      setBreath({ show, air: life.air });
    }

    const keys = new Set();
    let camYawOffset = 0;
    let camPitch = CAM_PITCH_DEFAULT;
    let camDist = 1;
    let camReturning = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let actor = null;

    function resize() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function updateCamera(groundY) {
      const yaw = facingYaw + camYawOffset;
      const dist = CAM_BACK * camDist;
      const back = dist * Math.cos(camPitch);
      const lift = CAM_UP + Math.sin(camPitch) * dist;
      const feetY = groundY + hopHeight;
      camera.position.set(pos.x - Math.sin(yaw) * back, feetY + lift, pos.z - Math.cos(yaw) * back);
      clampInsideEllipse(camera.position, world.halfW, world.halfD, 0.4);
      const camCeil = quest.onRoof || quest.ascending ? world.wallH + 18 : world.wallH - 0.35;
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, -world.wallH, camCeil);
      camera.lookAt(pos.x, feetY + lookHeight, pos.z);
    }

    function applyUnderwaterLook(feetY) {
      const chestY = feetY + lookHeight * 0.55;
      const depth = world.seaLevel - chestY;
      const under = THREE.MathUtils.clamp(depth / 2.2, 0, 1);
      const toSurface = Math.max(0.5, world.seaLevel - camera.position.y);
      fogNow.copy(fogAbove).lerp(UNDERWATER_FOG, under);
      bgNow.copy(DUSK_ZENITH).lerp(UNDERWATER_BG, under);
      scene.fog.color.copy(fogNow);
      scene.background = bgNow;
      // Keep enough fog range to still see the waterline overhead.
      scene.fog.near = THREE.MathUtils.lerp(world.fogNear, Math.max(0.8, world.fogNear * 0.2), under);
      scene.fog.far = THREE.MathUtils.lerp(world.fogFar, Math.max(18, toSurface + 16), under);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.78, under);
      return under;
    }

    const loader = new GLTFLoader();
    loader.load(
      FOX.url,
      (gltf) => {
        if (!alive) return;
        const template = gltf.scene;
        const clips = Object.fromEntries((gltf.animations || []).map((clip) => [clip.name, clip]));
        for (let i = 0; i < FOX.count; i += 1) {
          const model = cloneSkinned(template);
          model.traverse((obj) => {
            if (obj.isMesh) {
              obj.frustumCulled = false;
              obj.castShadow = false;
              obj.receiveShadow = false;
            }
          });
          fitPropModel(model, FOX.height);
          const root = new THREE.Group();
          root.add(model);
          root.visible = npcRef.current.foxes;
          animalRoot.add(root);
          const mixer = new THREE.AnimationMixer(model);
          const make = (name) => (name && clips[name] ? mixer.clipAction(clips[name]) : null);
          animals.push({
            root,
            mixer,
            idle: make(FOX.idle),
            walk: make(FOX.walk),
            run: make(FOX.run),
            current: null,
            mode: "",
            x: 0,
            z: 0,
            yaw: 0,
            state: "idle",
            timer: 1 + i * 0.4,
          });
        }
        placeCreaturesOnDryLand();
        for (let i = 0; i < animals.length; i += 1) {
          const fox = animals[i];
          if (fox.idle) playAction(fox, "idle");
        }
      },
      undefined,
      () => {}
    );

    loader.load(
      DEMON.url,
      (gltf) => {
        if (!alive) return;
        const template = gltf.scene;
        const clips = Object.fromEntries((gltf.animations || []).map((clip) => [clip.name, clip]));
        for (let i = 0; i < DEMON.count; i += 1) {
          const model = cloneSkinned(template);
          model.traverse((obj) => {
            if (obj.isMesh) {
              obj.frustumCulled = false;
              obj.castShadow = false;
              obj.receiveShadow = false;
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((mat) => {
                  if (mat.emissive) mat.emissive = new THREE.Color("#4a1030");
                  if (mat.emissiveIntensity != null) mat.emissiveIntensity = 0.35;
                });
              }
            }
          });
          fitPropModel(model, DEMON.height);
          const root = new THREE.Group();
          root.add(model);
          root.visible = npcRef.current.demons;
          animalRoot.add(root);
          const mixer = new THREE.AnimationMixer(model);
          const make = (name) => (name && clips[name] ? mixer.clipAction(clips[name]) : null);
          enemies.push({
            root,
            mixer,
            walk: make(DEMON.walk),
            run: make(DEMON.run),
            idle: null,
            current: null,
            mode: "",
            x: 0,
            z: 0,
            yaw: 0,
            state: "idle",
            timer: 2 + i,
            attackCool: 0,
            hp: DEMON.hp,
            alive: true,
            hitsOnPlayer: 0,
            flyY: null,
          });
        }
        placeCreaturesOnDryLand();
        for (let i = 0; i < enemies.length; i += 1) {
          const demon = enemies[i];
          if (demon.walk) playAction(demon, "walk");
        }
      },
      undefined,
      () => {}
    );

    loader.load(
      spec.url,
      (gltf) => {
        if (!alive) return;
        const model = gltf.scene;
        model.traverse((obj) => {
          if (obj.isMesh) obj.frustumCulled = false;
        });
        characterRoot.add(model);
        fitCharacter(model);
        lookHeight = 1.05;

        const clips = Object.fromEntries((gltf.animations || []).map((clip) => [clip.name, clip]));
        const mixer = new THREE.AnimationMixer(model);
        const make = (name) => (name && clips[name] ? mixer.clipAction(clips[name]) : null);
        actor = {
          mixer,
          idle: make(spec.idle),
          walk: make(spec.walk),
          run: make(spec.run),
          jump: make(spec.jump),
          jumpLoop: make(spec.jumpLoop),
          land: make(spec.land),
          swim: null,
          swimIdle: null,
          punches: (spec.punches || []).map(make).filter(Boolean),
          punch: null,
          current: null,
          mode: "",
        };
        mixer.addEventListener("finished", (event) => {
          if (event.action === punching) punching = null;
        });
        if (!actor.idle || !actor.walk || !actor.run || !actor.jump) {
          setStatus("error");
          return;
        }
        playAction(actor, "idle");
        setStatus("ready");

        // Same skeleton as dusk-hero — pull swim clips from the scuba pack.
        loader.load(
          spec.swimUrl,
          (swimGltf) => {
            if (!alive || !actor) return;
            const swimClips = Object.fromEntries((swimGltf.animations || []).map((clip) => [clip.name, clip]));
            if (swimClips[spec.swim]) actor.swim = mixer.clipAction(swimClips[spec.swim]);
            if (swimClips[spec.swimIdle]) actor.swimIdle = mixer.clipAction(swimClips[spec.swimIdle]);
          },
          undefined,
          () => {}
        );
      },
      undefined,
      () => {
        if (alive) setStatus("error");
      }
    );

    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === " " || event.code === "Space") {
        if (!keys.has(" ")) jumpPressed = true;
        keys.add(" ");
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) punchPressed = true;
        return;
      }
      keys.add(key);
      if (event.key === "Shift") keys.add("shift");
    };
    const onKeyUp = (event) => {
      const key = event.key.toLowerCase();
      if (key === " " || event.code === "Space") keys.delete(" ");
      else keys.delete(key);
      if (event.key === "Shift") keys.delete("shift");
    };
    const onDown = (event) => {
      if (event.button !== 0) return;
      dragging = true;
      camReturning = false;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.style.cursor = "grabbing";
    };
    const onUp = () => {
      if (dragging && !diving) camReturning = true;
      dragging = false;
      renderer.domElement.style.cursor = "grab";
    };
    const onMove = (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      camYawOffset -= dx * 0.005;
      if (diving) {
        // Drag up = swim up, drag down = swim down.
        divePitch = THREE.MathUtils.clamp(divePitch + dy * 0.0055, -0.95, 1.15);
        camPitch = THREE.MathUtils.clamp(CAM_PITCH_DEFAULT + divePitch * 0.42, -0.55, 1.05);
      } else {
        camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.003, -0.35, 0.75);
      }
    };
    const onWheel = (event) => {
      event.preventDefault();
      camDist = THREE.MathUtils.clamp(camDist + event.deltaY * 0.0012, 0.55, 2.4);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);
    resize();

    let last = performance.now();
    let frame = 0;
    const loop = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      rebuildWorld(terrainRef.current);

      if (camReturning && !dragging && !diving) {
        const t = 1 - Math.exp(-CAM_RETURN_SPEED * dt);
        camYawOffset = THREE.MathUtils.lerp(camYawOffset, 0, t);
        camPitch = THREE.MathUtils.lerp(camPitch, CAM_PITCH_DEFAULT, t);
        if (Math.abs(camYawOffset) < 0.001 && Math.abs(camPitch - CAM_PITCH_DEFAULT) < 0.001) {
          camYawOffset = 0;
          camPitch = CAM_PITCH_DEFAULT;
          camReturning = false;
        }
      }

      const carried =
        abduction && (abduction.phase === "grab" || abduction.phase === "fly");
      // Auto-start fox talks on approach before controls resolve this frame.
      if (!quest.talk && !quest.ascending && !quest.onRoof && !carried) {
        const near = nearestFox(pos, 2.85);
        if (near) beginFoxTalk(near);
      }
      const talking = !!quest.talk;
      const ascending = !!quest.ascending;
      const controlLocked = carried || talking || ascending;

      let turn = 0;
      let throttle = 0;
      if (!controlLocked) {
        if (keys.has("a") || keys.has("arrowleft")) turn += 1;
        if (keys.has("d") || keys.has("arrowright")) turn -= 1;
        if (turn) facingYaw += turn * TURN_SPEED * dt;
        if (keys.has("w") || keys.has("arrowup")) throttle += 1;
        if (keys.has("s") || keys.has("arrowdown")) throttle -= 1;
      }

      const groundY = sampleSurfaceY(pos.x, pos.z, world.dirt, world.rocks);
      // Wade until water reaches head height, then switch to swimming.
      const swimming = !carried && !talking && !ascending && !quest.onRoof && world.seaLevel - groundY >= SWIM_DEPTH;
      if (!swimming && diving) {
        diving = false;
        submerge = 0;
        divePitch = 0.7;
        camReturning = true;
      }

      const moving = !controlLocked && throttle !== 0;
      const running = moving && keys.has("shift") && !swimming;
      const moveSpeed = swimming ? SWIM_SPEED : running ? RUN_SPEED : WALK_SPEED;

      if (controlLocked) {
        punchPressed = false;
        jumpPressed = false;
        punching = null;
        if (talking || ascending) {
          diving = false;
          submerge = 0;
        }
      }

      if (!controlLocked && swimming && punchPressed) {
        // Enter while surface-swimming starts a dive; punch stays land-only.
        if (!diving) {
          diving = true;
          submerge = DIVE_START_DEPTH;
          divePitch = 0.85;
          camReturning = false;
          camPitch = CAM_PITCH_DEFAULT + divePitch * 0.42;
          punching = null;
        }
      } else if (!controlLocked && !swimming && punchPressed && grounded && !jumpPhase && !punching) {
        if (!handleQuestInteract(pos) && actor?.punches?.length) {
          punching = actor.punches[Math.floor(Math.random() * actor.punches.length)];
          punchHitDemons(pos, facingYaw);
        }
      }
      punchPressed = false;

      if (!controlLocked && !swimming && !quest.onRoof && jumpPressed && grounded && !jumpPhase && !punching) {
        hopVel = JUMP_SPEED;
        hopHeight = 0.001;
        grounded = false;
        jumpPhase = "start";
        landTime = 0;
      }
      jumpPressed = false;

      if (talking) {
        hopVel = 0;
        hopHeight = 0;
        grounded = true;
        jumpPhase = null;
        updateFoxTalk(dt);
      } else if (ascending) {
        hopVel = 0;
        hopHeight = 0;
        grounded = false;
        jumpPhase = null;
        quest.ascending.t += dt;
        const u = Math.min(1, quest.ascending.t / quest.ascending.dur);
        const ease = u * u * (3 - 2 * u);
        pos.x = THREE.MathUtils.lerp(pos.x, quest.ascending.toX, 0.08);
        pos.z = THREE.MathUtils.lerp(pos.z, quest.ascending.toZ, 0.08);
        const roofY = sampleDomeRoofY(pos.x, pos.z, world.halfW, world.halfD, world.wallH) ?? world.wallH * 0.92;
        const liftY = THREE.MathUtils.lerp(quest.ascending.fromY, roofY, ease);
        characterRoot.position.set(pos.x, liftY, pos.z);
        characterRoot.rotation.y = facingYaw;
        characterRoot.rotation.x = 0;
        characterRoot.rotation.z = 0;
        if (u >= 1) {
          quest.ascending = null;
          quest.onRoof = true;
          quest.prompt = "You are on the roof.";
          syncQuestHud();
        }
      } else if (carried) {
        // Held in the demon's feet — position applied after enemy update.
        hopVel = 0;
        hopHeight = 0;
        grounded = false;
        jumpPhase = null;
      } else if (swimming) {
        hopVel = 0;
        hopHeight = 0;
        grounded = true;
        jumpPhase = null;
        punching = null;
        if (moving) {
          const dir = throttle < 0 ? -1 : 1;
          pos.x += Math.sin(facingYaw) * moveSpeed * dir * dt;
          pos.z += Math.cos(facingYaw) * moveSpeed * dir * dt;
        }
        if (diving) {
          const maxSub = Math.max(0.35, world.seaLevel - SWIM_FLOAT - groundY - 0.12);
          // Mouse pitch steers vertical: look/drag down to descend, up to rise.
          submerge += Math.sin(divePitch) * DIVE_SPEED * 1.25 * dt;
          submerge = THREE.MathUtils.clamp(submerge, 0, maxSub);
          if (submerge <= DIVE_SURFACE_SNAP && divePitch < -0.12) {
            diving = false;
            submerge = 0;
            divePitch = 0.7;
            camReturning = true;
          }
        }
      } else if (!grounded) {
        hopVel -= GRAVITY * dt;
        hopHeight += hopVel * dt;
        if (moving) {
          const dir = throttle < 0 ? -1 : 1;
          pos.x += Math.sin(facingYaw) * moveSpeed * dir * dt;
          pos.z += Math.cos(facingYaw) * moveSpeed * dir * dt;
        }
        if (hopHeight <= 0) {
          hopHeight = 0;
          hopVel = 0;
          grounded = true;
          if (jumpPhase === "start" || jumpPhase === "air") {
            if (actor?.land) {
              jumpPhase = "land";
              landTime = 0;
            } else jumpPhase = null;
          }
        }
      } else if (moving && !punching) {
        const dir = throttle < 0 ? -1 : 1;
        pos.x += Math.sin(facingYaw) * moveSpeed * dir * dt;
        pos.z += Math.cos(facingYaw) * moveSpeed * dir * dt;
      }
      if (jumpPhase === "land") {
        landTime += dt;
        if (landTime > 0.42) jumpPhase = null;
      }
      if (!carried && !ascending) {
        if (quest.onRoof) {
          const rx = world.halfW * 0.92;
          const rz = world.halfD * 0.92;
          clampInsideEllipse(pos, rx, rz, BODY_RADIUS);
        } else {
          clampInsideEllipse(pos, world.halfW, world.halfD, BODY_RADIUS);
        }
      }

      updateAnimals(dt);
      updateEnemies(dt, pos);
      updateAbduction(dt);
      if (!talking) updateQuestWorld(dt, pos);

      const hanging = abduction && (abduction.phase === "grab" || abduction.phase === "fly");
      const groundNow = sampleSurfaceY(pos.x, pos.z, world.dirt, world.rocks);
      const swimNow = !hanging && !quest.onRoof && !ascending && world.seaLevel - groundNow >= SWIM_DEPTH;

      let feetY;
      if (hanging) {
        const demon = abduction.demon;
        // Origins are at the feet — keep ankles snug in the talons.
        const hangY = (demon.flyY ?? demon.root.position.y) - 0.06;
        pos.x = demon.x;
        pos.z = demon.z;
        feetY = hangY;
        characterRoot.position.set(demon.x, hangY, demon.z);
        characterRoot.rotation.y = demon.yaw + Math.PI;
        // Dangle upside-down from the talons.
        characterRoot.rotation.x = Math.PI;
        characterRoot.rotation.z = Math.sin(performance.now() * 0.012) * 0.08;
      } else if (ascending) {
        feetY = characterRoot.position.y;
      } else if (quest.onRoof) {
        const roofY = sampleDomeRoofY(pos.x, pos.z, world.halfW, world.halfD, world.wallH);
        feetY = roofY ?? world.wallH * 0.9;
        grounded = true;
        hopHeight = 0;
        hopVel = 0;
        characterRoot.position.set(pos.x, feetY, pos.z);
        characterRoot.rotation.y = facingYaw;
        characterRoot.rotation.x = 0;
        characterRoot.rotation.z = 0;
      } else {
        // Trigger uses head-depth; float keeps him on the surface, not sunk 1.7m under.
        if (swimNow && diving) {
          const maxSub = Math.max(0.35, world.seaLevel - SWIM_FLOAT - groundNow - 0.12);
          submerge = Math.min(submerge, maxSub);
          feetY = world.seaLevel - SWIM_FLOAT - submerge;
        } else if (swimNow) {
          feetY = world.seaLevel - SWIM_FLOAT;
        } else {
          feetY = groundNow + hopHeight;
        }
        // Once the fall crosses the waterline, settle into a swim.
        if (!swimNow && !grounded && world.seaLevel - groundNow >= SWIM_DEPTH * 0.45) {
          const bodyY = groundNow + hopHeight;
          if (bodyY <= world.seaLevel + 0.15) {
            hopHeight = 0;
            hopVel = 0;
            grounded = true;
            jumpPhase = null;
            diving = false;
            submerge = 0;
            divePitch = 0.7;
            feetY = world.seaLevel - SWIM_FLOAT;
          }
        }
        characterRoot.position.set(pos.x, feetY, pos.z);
        characterRoot.rotation.y = facingYaw;
        characterRoot.rotation.x = diving ? divePitch : 0;
        characterRoot.rotation.z = 0;
      }

      if (diving) {
        life.air = Math.max(0, life.air - dt / AIR_SECONDS);
        if (life.air <= 0) {
          // Out of air — kick back to the surface.
          life.air = 0;
          diving = false;
          submerge = 0;
          divePitch = 0.7;
          camReturning = true;
        }
      } else {
        life.air = Math.min(1, life.air + dt / AIR_REFILL_SECONDS);
      }
      syncBreathHud();

      if (actor) {
        if (hanging) {
          actor.mixer.timeScale = 0.7;
          if (actor.jumpLoop) playAction(actor, "jumpLoop");
          else playAction(actor, "idle");
        } else if (talking || ascending) {
          actor.mixer.timeScale = 1;
          playAction(actor, "idle");
        } else if (swimNow || swimming) {
          actor.mixer.timeScale = diving ? (moving ? 1.15 : 1.05) : moving ? 1.05 : 1;
          if (moving && actor.swim) playAction(actor, "swim");
          else if (!moving && actor.swimIdle) playAction(actor, "swimIdle");
          else if (moving) playAction(actor, "walk");
          else playAction(actor, "idle");
        } else if (punching) {
          actor.mixer.timeScale = 1;
          actor.punch = punching;
          playAction(actor, "punch", { loop: false });
        } else if (jumpPhase === "start") {
          actor.mixer.timeScale = 1.35;
          playAction(actor, "jump", { loop: false });
        } else if (jumpPhase === "air" && actor.jumpLoop) {
          actor.mixer.timeScale = 1;
          playAction(actor, "jumpLoop");
        } else if (jumpPhase === "land" && actor.land) {
          actor.mixer.timeScale = 1.5;
          playAction(actor, "land", { loop: false });
        } else if (moving) {
          actor.mixer.timeScale = running ? moveSpeed / 3 : moveSpeed / 1.45;
          playAction(actor, running && actor.run ? "run" : "walk");
        } else {
          actor.mixer.timeScale = 1;
          playAction(actor, "idle");
        }
        actor.mixer.update(dt);
        if (jumpPhase === "start" && actor.jumpLoop && actor.mode === "jump" && actor.jump.time > 0.42) {
          jumpPhase = "air";
        }
      }

      updateCamera(hanging || swimNow || swimming || talking || ascending || quest.onRoof ? feetY : groundNow);
      const under = applyUnderwaterLook(feetY);
      if (underlay) {
        underlay.style.opacity = String(under * 0.55);
      }
      renderer.domElement.style.filter = [
        `brightness(${LOOK.brightness})`,
        `contrast(${LOOK.contrast})`,
        `saturate(${LOOK.saturation})`,
        `hue-rotate(${LOOK.tint}deg)`,
      ].join(" ");
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", resize);
      clearGroup(worldRoot, sharedGeo);
      clearGroup(rockRoot, sharedGeo);
      clearGroup(grassRoot, sharedGeo);
      clearGroup(waterRoot, sharedGeo);
      clearGroup(animalRoot, sharedGeo);
      clearQuestGroup(puzzleRoot);
      scene.remove(sealBeam);
      sealBeam.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      animals.length = 0;
      enemies.length = 0;
      while (wallMaterials.length) {
        const mat = wallMaterials.pop();
        mat.dispose();
      }
      floorTex.dispose();
      groundMat.dispose();
      rockMat.dispose();
      grassMat.dispose();
      waterMat.dispose();
      rockGeo.dispose();
      grassGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  const [openTab, setOpenTab] = useState(null);
  const setField = (key) => (value) => setTerrain((current) => ({ ...current, [key]: value }));
  const setNpcField = (key) => (event) =>
    setNpc((current) => ({ ...current, [key]: event.target.checked }));
  const toggleTab = (id) => setOpenTab((current) => (current === id ? null : id));

  const panelStyle = {
    width: 230,
    display: "grid",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(8, 12, 24, 0.78)",
    backdropFilter: "blur(8px)",
    color: "#f2e9fb",
    fontFamily: "inherit",
  };

  const tabBtn = (id, label) => {
    const active = openTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggleTab(id)}
        style={{
          writingMode: "vertical-lr",
          border: "1px solid rgba(255,255,255,0.28)",
          borderRadius: 8,
          padding: "10px 7px",
          background: active ? "rgba(120, 78, 160, 0.7)" : "rgba(8, 12, 24, 0.72)",
          color: "#f2e9fb",
          fontSize: "0.72rem",
          letterSpacing: "0.08em",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0, background: "#120816" }}>
      <div
        ref={underlayRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(18, 78, 120, 0.35), rgba(8, 40, 70, 0.62))",
          opacity: 0,
          transition: "opacity 120ms linear",
        }}
      />
      {status !== "ready" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e6d8f4",
            fontSize: "0.95rem",
            pointerEvents: "none",
          }}
        >
          {status === "error" ? "Could not load the man." : "Loading the wood…"}
        </div>
      ) : null}
      {questHud?.spoken != null ? (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 5,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(8, 12, 24, 0.72)",
            color: "#f2e9fb",
            fontSize: "0.75rem",
            letterSpacing: "0.04em",
            pointerEvents: "none",
          }}
        >
          Foxes {questHud.spoken}/{questHud.total}
          {questHud.prompt ? ` · ${questHud.prompt}` : ""}
        </div>
      ) : null}
      {dialogue ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 64,
            transform: "translateX(-50%)",
            zIndex: 6,
            width: "min(520px, calc(100% - 32px))",
            padding: "14px 16px",
            borderRadius: 12,
            border: `1px solid ${dialogue.color || "rgba(255,255,255,0.25)"}`,
            background: "rgba(8, 12, 24, 0.88)",
            backdropFilter: "blur(10px)",
            color: "#f2e9fb",
            pointerEvents: "none",
            boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              marginBottom: 8,
              color: dialogue.color || "#d7c4f5",
              opacity: 0.95,
            }}
          >
            {dialogue.name}
          </div>
          <div style={{ fontSize: "0.95rem", lineHeight: 1.45 }}>{dialogue.text}</div>
        </div>
      ) : null}
      {breath.show ? (
        <div
          style={{
            position: "absolute",
            top: 72,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 5,
            width: 168,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(170, 220, 255, 0.35)",
            background: "rgba(4, 18, 32, 0.78)",
            backdropFilter: "blur(8px)",
            color: "#d7f1ff",
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              marginBottom: 8,
              opacity: 0.9,
            }}
          >
            <span>AIR</span>
            <span>{Math.ceil(breath.air * AIR_SECONDS)}s</span>
          </div>
          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(1, breath.air)) * 100}%`,
                height: "100%",
                borderRadius: 999,
                background:
                  breath.air < 0.25
                    ? "linear-gradient(90deg, #7a1f2b, #e05a4f)"
                    : "linear-gradient(90deg, #1b6f9c, #7fd0ff)",
                transition: "width 80ms linear, background 200ms ease",
              }}
            />
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 72,
          left: 16,
          zIndex: 4,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>{TERRAIN_TABS.map((tab) => tabBtn(tab.id, tab.label))}</div>
        {openTab ? (
          <div style={panelStyle}>
            {openTab === "world" ? (
              <>
                <div style={{ fontSize: "0.78rem", letterSpacing: "0.04em", opacity: 0.9 }}>World</div>
                <SliderRow label="Width" value={terrain.width} min={40} max={220} step={2} unit=" m" onChange={setField("width")} />
                <SliderRow label="Depth" value={terrain.depth} min={40} max={220} step={2} unit=" m" onChange={setField("depth")} />
                <SliderRow label="Height" value={terrain.height} min={8} max={60} step={1} unit=" m" onChange={setField("height")} />
              </>
            ) : null}
            {openTab === "rocks" ? (
              <>
                <div style={{ fontSize: "0.78rem", letterSpacing: "0.04em", opacity: 0.9 }}>Rocks</div>
                <SliderRow
                  label="Max height"
                  value={terrain.rockMaxHeight}
                  min={0}
                  max={28}
                  step={0.5}
                  unit=" m"
                  onChange={setField("rockMaxHeight")}
                />
                <SliderRow
                  label="Frequency"
                  value={terrain.rockFrequency}
                  min={0}
                  max={1}
                  step={0.01}
                  unit=""
                  onChange={setField("rockFrequency")}
                />
                <SliderRow
                  label="Rock size"
                  value={terrain.rockSize}
                  min={0.4}
                  max={6}
                  step={0.1}
                  unit=" m"
                  onChange={setField("rockSize")}
                />
                <SliderRow
                  label="Hills ↔ valleys"
                  value={terrain.rockBias}
                  min={-1}
                  max={1}
                  step={0.05}
                  unit=""
                  onChange={setField("rockBias")}
                />
              </>
            ) : null}
            {openTab === "dirt" ? (
              <>
                <div style={{ fontSize: "0.78rem", letterSpacing: "0.04em", opacity: 0.9 }}>Dirt</div>
                <SliderRow
                  label="Hill / valley max depth"
                  value={terrain.dirtAmplitude}
                  min={0}
                  max={18}
                  step={0.5}
                  unit=" m"
                  onChange={setField("dirtAmplitude")}
                />
                <SliderRow
                  label="Hill / valley frequency"
                  value={terrain.dirtFrequency}
                  min={0}
                  max={1}
                  step={0.01}
                  unit=""
                  onChange={setField("dirtFrequency")}
                />
              </>
            ) : null}
            {openTab === "grass" ? (
              <div style={{ fontSize: "0.78rem", letterSpacing: "0.04em", opacity: 0.9 }}>Grass</div>
            ) : null}
            {openTab === "water" ? (
              <>
                <div style={{ fontSize: "0.78rem", letterSpacing: "0.04em", opacity: 0.9 }}>Water</div>
                <SliderRow
                  label="Sea level"
                  value={terrain.seaLevel}
                  min={-8}
                  max={16}
                  step={0.5}
                  unit=" m"
                  onChange={setField("seaLevel")}
                />
              </>
            ) : null}
            {openTab === "npcs" ? (
              <>
                <div style={{ fontSize: "0.78rem", letterSpacing: "0.04em", opacity: 0.9 }}>NPCs</div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.78rem",
                    color: "#e8dcf6",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={npc.foxes}
                    onChange={setNpcField("foxes")}
                    style={{ accentColor: "#b48ad6" }}
                  />
                  Foxes
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.78rem",
                    color: "#e8dcf6",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={npc.demons}
                    onChange={setNpcField("demons")}
                    style={{ accentColor: "#b48ad6" }}
                  />
                  Devil
                </label>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 18,
          textAlign: "center",
          color: "#f2e9fb",
          fontSize: "0.8rem",
          letterSpacing: "0.03em",
          opacity: 0.8,
          pointerEvents: "none",
        }}
      >
        A / D turn · W / S walk · Shift run · Space jump · Enter punch / dive · drag look steers dive up/down · wheel zoom
      </div>
    </div>
  );
}
