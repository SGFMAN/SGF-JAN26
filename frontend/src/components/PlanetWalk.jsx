import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/** New astronaut with built-in Idle / Walk / Run / Jump — no retargeting. */
const MODEL_URL = "/models/astronaut-hatch.glb";
const WALK_SPEED = 2.35;
const RUN_SPEED = 4.4;
const CAM_BACK = 3.9;
const CAM_UP = 1.35;
const DIAMETER_FRAC = 0.9;
const PLANET_SIZE_SCALE = 2;
const TARGET_HEIGHT = 1.46;
const HEAD_SCALE = 0.68;
const TORSO_WIDTH = 0.78;
const TURN_SPEED = 2.4;
const EARTH_G = 9.81;
const MIN_G = 0.55;
const JUMP_SPEED = 3.9;
const DEFAULT_GRAVITY_SLIDER = (EARTH_G - 5) / (EARTH_G - MIN_G);
const DEFAULT_MOON_SIZE = 8;
/** Terrain height slider 1–10. */
const DEFAULT_RELIEF = 9;
const RELIEF_AT_MAX = 0.22;
/** 0 = flat, 100 = mountains/valleys cover the whole surface. */
const DEFAULT_FEATURE_COVER = 70;
const JUMP_LAUNCH_AT = 0.28;
/** Half wingspan 5m + 1m border. */
const SHIP_PAD_RADIUS_M = 6;
/** Soft apron beyond the flat pad so the grade blends into surrounding terrain. */
const SHIP_PAD_CLEAR_MARGIN_M = 5;
/** Painted white circle line width in metres. */
const SHIP_PAD_LINE_WIDTH_M = 0.35;
const SHIP_THRUST = 22;
/** Sea-level drag. Fades with altitude so a long burn can still climb out. */
const SHIP_DRAG = 0.32;
/** Seconds of holding Space to go from 0% to 100% thrust. */
const THRUST_SPOOL_UP_SEC = 10;
/** Release decays faster so cutting thrust actually falls back. */
const THRUST_SPOOL_DOWN_SEC = 2;
/** Ship origin sits just above the surface (gear feet are near local y=0). */
const SHIP_GROUND_CLEARANCE = 0.18;
const SHIP_BANK_SPEED = 1.9;
const SHIP_PITCH_SPEED = 1.7;
const SHIP_MAX_BANK = 0.95;
const SHIP_MAX_PITCH = 0.85;
const SHIP_EXIT_COOLDOWN = 2.8;

function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise3(x, y, z) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const n000 = hash3(x0, y0, z0);
  const n100 = hash3(x0 + 1, y0, z0);
  const n010 = hash3(x0, y0 + 1, z0);
  const n110 = hash3(x0 + 1, y0 + 1, z0);
  const n001 = hash3(x0, y0, z0 + 1);
  const n101 = hash3(x0 + 1, y0, z0 + 1);
  const n011 = hash3(x0, y0 + 1, z0 + 1);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1);
  const nx00 = n000 * (1 - ux) + n100 * ux;
  const nx10 = n010 * (1 - ux) + n110 * ux;
  const nx01 = n001 * (1 - ux) + n101 * ux;
  const nx11 = n011 * (1 - ux) + n111 * ux;
  const nxy0 = nx00 * (1 - uy) + nx10 * uy;
  const nxy1 = nx01 * (1 - uy) + nx11 * uy;
  return nxy0 * (1 - uz) + nxy1 * uz;
}

function fbm3(x, y, z, octaves, lac, gain) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += (valueNoise3(x * freq, y * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / Math.max(0.0001, norm);
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function reliefFromSlider(slider) {
  const t = THREE.MathUtils.clamp(slider, 1, 10) / 10;
  return t * RELIEF_AT_MAX;
}

/**
 * -1..1 height: mountain patches, valley patches, quiet flats,
 * plus fine hills/dips. cover01: 0 = flat, 1 = fully featured.
 */
function sampleTerrain(nx, ny, nz, seed, cover01 = 1) {
  const cover = THREE.MathUtils.clamp(cover01, 0, 1);
  if (cover <= 0.0001) return 0;

  const s = seed * 17.13;
  const px = nx + s * 0.01;
  const py = ny - s * 0.007;
  const pz = nz + s * 0.013;

  // Higher cover → denser / more frequent mountain & valley patches.
  const biomeFreq = THREE.MathUtils.lerp(0.65, 2.6, cover);
  const biome = fbm3(
    px * biomeFreq + s,
    py * biomeFreq,
    pz * biomeFreq - s * 0.5,
    4,
    2.0,
    0.55
  );
  // Low cover: only strong biome peaks become features (sparse).
  // High cover: weak thresholds → almost everything is mountain or valley.
  const lo = THREE.MathUtils.lerp(0.38, 0.02, cover);
  const hi = THREE.MathUtils.lerp(0.78, 0.22, cover);
  const mountainW = smoothstep(lo, hi, biome);
  const valleyW = smoothstep(lo, hi, -biome);
  const plainW = 1 - Math.max(mountainW, valleyW);

  const detailFreq = THREE.MathUtils.lerp(2.4, 4.2, cover);
  const ridgeNoise = fbm3(px * detailFreq + 20, py * detailFreq, pz * detailFreq + 9, 5, 2.1, 0.5);
  const ridges = Math.pow(1 - Math.abs(ridgeNoise), 2.2) * mountainW;

  const bowlNoise = fbm3(px * (detailFreq * 0.85) - 11, py * (detailFreq * 0.85) + 4, pz * (detailFreq * 0.85), 4, 2.05, 0.52);
  const bowls = -Math.pow(Math.abs(bowlNoise), 1.35) * valleyW;

  const plains = fbm3(px * 2.2 + 5, py * 2.2, pz * 2.2 - 3, 3, 2.0, 0.5) * 0.12 * plainW;

  const microFreq = THREE.MathUtils.lerp(6, 14, cover);
  const micro = fbm3(px * microFreq + 2, py * microFreq - 1, pz * microFreq, 4, 2.15, 0.48) * 0.16;
  const grain = fbm3(px * 22 + 8, py * 22, pz * 22 - 6, 3, 2.2, 0.45) * 0.05;

  const craterCount = Math.round(THREE.MathUtils.lerp(2, 14, cover));
  let craters = 0;
  for (let c = 0; c < craterCount; c += 1) {
    const cx = hash3(seed + c * 3.1, 1.7, 2.3) * 2 - 1;
    const cy = hash3(seed + c * 5.9, 4.1, 0.8) * 2 - 1;
    const cz = hash3(seed + c * 8.2, 2.2, 6.4) * 2 - 1;
    const cl = Math.hypot(cx, cy, cz) || 1;
    const d = Math.hypot(nx - cx / cl, ny - cy / cl, nz - cz / cl);
    const rad = 0.1 + hash3(seed, c, 9.1) * 0.16;
    if (d < rad) {
      const t = 1 - d / rad;
      craters -= t * t * (0.2 + hash3(c, seed, 3.3) * 0.35);
    }
  }

  const h = (ridges * 0.95 + bowls * 0.9 + plains + micro + grain + craters * 0.55) * cover;
  return THREE.MathUtils.clamp(h, -1, 1);
}

function makeShipTexture(kind) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (kind === "hull") {
    ctx.fillStyle = "#c5ccd4";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 48) {
        const shade = 180 + ((x * 13 + y * 7) % 40);
        ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 8})`;
        ctx.fillRect(x + 1, y + 1, 46, 30);
        ctx.strokeStyle = "rgba(40,45,55,0.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, 46, 30);
        ctx.fillStyle = "rgba(30,35,45,0.35)";
        for (let r = 0; r < 4; r += 1) {
          ctx.beginPath();
          ctx.arc(x + 8 + r * 10, y + 8, 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + 8 + r * 10, y + 24, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // hazard stripe band
    for (let i = 0; i < 14; i += 1) {
      ctx.fillStyle = i % 2 ? "#e8b000" : "#1a1a1a";
      ctx.fillRect(i * 36, size - 36, 36, 28);
    }
  } else if (kind === "wing") {
    const grd = ctx.createLinearGradient(0, 0, size, size);
    grd.addColorStop(0, "#9aa3ad");
    grd.addColorStop(0.5, "#d0d6de");
    grd.addColorStop(1, "#8b949e");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(25,30,40,0.5)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, i * 42);
      ctx.lineTo(size, i * 42 + 20);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(20,80,160,0.25)";
    ctx.fillRect(40, 80, size - 80, 60);
    ctx.fillStyle = "#2a3340";
    ctx.fillRect(60, 200, 120, 18);
    ctx.fillRect(220, 260, 160, 14);
  } else if (kind === "heat") {
    for (let y = 0; y < size; y += 16) {
      for (let x = 0; x < size; x += 16) {
        const n = (x * 3 + y * 5) % 50;
        ctx.fillStyle = `rgb(${90 + n},${55 + n * 0.4},${40 + n * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(x + 8, y);
        ctx.lineTo(x + 16, y + 8);
        ctx.lineTo(x + 8, y + 16);
        ctx.lineTo(x, y + 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.stroke();
      }
    }
  } else if (kind === "deck") {
    ctx.fillStyle = "#5a6068";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(200,210,220,0.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i < size; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.fillStyle = "#c9a227";
    ctx.fillRect(0, size * 0.45, size, 10);
    ctx.fillRect(0, size * 0.55, size, 10);
  } else {
    // carbon / engine
    ctx.fillStyle = "#14161a";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i += 1) {
      ctx.fillStyle = `rgba(${40 + (i % 20)},${42 + (i % 15)},${48},0.4)`;
      ctx.fillRect((i * 37) % size, (i * 53) % size, 40, 8);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

/** Build a ~10m wingspan lander (2m craft + 1m gear) with rear ramp + under-wing nacelles. */
function createSpaceship() {
  const root = new THREE.Group();
  root.name = "spaceship";

  const hullMap = makeShipTexture("hull");
  hullMap.repeat.set(2, 2);
  const wingMap = makeShipTexture("wing");
  wingMap.repeat.set(3, 1);
  const heatMap = makeShipTexture("heat");
  heatMap.repeat.set(2, 2);
  const deckMap = makeShipTexture("deck");
  deckMap.repeat.set(2, 4);
  const carbonMap = makeShipTexture("carbon");
  carbonMap.repeat.set(2, 2);

  const hullMat = new THREE.MeshStandardMaterial({
    map: hullMap,
    metalness: 0.62,
    roughness: 0.34,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    map: wingMap,
    metalness: 0.7,
    roughness: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    map: carbonMap,
    color: "#3a4048",
    metalness: 0.82,
    roughness: 0.28,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: "#7a8896",
    metalness: 0.55,
    roughness: 0.4,
  });
  const heatMat = new THREE.MeshStandardMaterial({
    map: heatMap,
    metalness: 0.25,
    roughness: 0.7,
  });
  const engineMat = new THREE.MeshStandardMaterial({
    map: carbonMap,
    metalness: 0.88,
    roughness: 0.22,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: "#6eb6ff",
    emissive: "#2a6fd4",
    emissiveIntensity: 1.4,
    metalness: 0.15,
    roughness: 0.35,
  });
  const glowHotMat = new THREE.MeshStandardMaterial({
    color: "#ffaa55",
    emissive: "#ff6a1a",
    emissiveIntensity: 1.8,
    metalness: 0.1,
    roughness: 0.4,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: "#a8e0ff",
    metalness: 0.05,
    roughness: 0.05,
    transmission: 0.55,
    transparent: true,
    opacity: 0.85,
    thickness: 0.4,
  });
  const rampMat = new THREE.MeshStandardMaterial({
    map: deckMap,
    metalness: 0.45,
    roughness: 0.55,
  });
  const lightMat = new THREE.MeshStandardMaterial({
    color: "#fff4d0",
    emissive: "#ffd080",
    emissiveIntensity: 2.2,
  });

  const walk = new THREE.Group();
  walk.name = "shipWalk";

  function addBox(parent, w, h, d, mat, x, y, z, cast = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (cast) m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Deck / cabin floor at y = 1 (top of landing gear).
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 6.2), rampMat);
  deck.position.set(0, 1.04, 0.2);
  deck.receiveShadow = true;
  walk.add(deck);
  addBox(walk, 2.35, 0.03, 0.08, accentMat, 0, 1.1, -2.7, false);
  addBox(walk, 2.35, 0.03, 0.08, accentMat, 0, 1.1, 2.9, false);

  // Layered fuselage
  addBox(root, 2.2, 1.7, 5.4, hullMat, 0, 1.85, 0.15);
  addBox(root, 2.35, 0.12, 5.5, darkMat, 0, 2.72, 0.15);
  addBox(root, 2.0, 0.35, 5.1, heatMat, 0, 1.12, 0.15);
  addBox(root, 0.08, 1.5, 5.0, darkMat, -1.12, 1.85, 0.15);
  addBox(root, 0.08, 1.5, 5.0, darkMat, 1.12, 1.85, 0.15);

  // Nose / cockpit cluster
  addBox(root, 1.7, 1.15, 1.5, hullMat, 0, 1.7, 3.25);
  addBox(root, 1.5, 0.25, 1.3, heatMat, 0, 1.15, 3.3);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), glassMat);
  canopy.position.set(0, 2.4, 2.95);
  canopy.castShadow = true;
  root.add(canopy);
  addBox(root, 1.35, 0.08, 0.9, darkMat, 0, 2.55, 2.95);
  addBox(root, 0.18, 0.18, 0.18, lightMat, -0.85, 1.85, 3.9);
  addBox(root, 0.18, 0.18, 0.18, lightMat, 0.85, 1.85, 3.9);

  // Sensor boom / antenna
  addBox(root, 0.06, 0.9, 0.06, accentMat, 0.7, 3.2, 1.2);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), darkMat);
  dish.position.set(0.7, 3.55, 1.2);
  root.add(dish);
  addBox(root, 0.04, 0.55, 0.04, accentMat, -0.65, 3.05, -0.8);

  // Wings — 10m tip-to-tip with thickness and flaps
  addBox(root, 10, 0.16, 2.5, wingMat, 0, 1.55, 0.1);
  addBox(root, 9.6, 0.08, 0.7, darkMat, 0, 1.48, -0.95);
  addBox(root, 0.9, 0.12, 1.8, hullMat, -3.6, 1.62, 0.15);
  addBox(root, 0.9, 0.12, 1.8, hullMat, 3.6, 1.62, 0.15);
  addBox(root, 0.22, 0.95, 0.75, darkMat, -4.9, 1.9, 0.1);
  addBox(root, 0.22, 0.95, 0.75, darkMat, 4.9, 1.9, 0.1);
  addBox(root, 0.5, 0.06, 1.2, accentMat, -4.2, 1.66, 0.9);
  addBox(root, 0.5, 0.06, 1.2, accentMat, 4.2, 1.66, 0.9);
  // wing root fairings
  addBox(root, 1.2, 0.45, 1.6, hullMat, -1.6, 1.55, 0.1);
  addBox(root, 1.2, 0.45, 1.6, hullMat, 1.6, 1.55, 0.1);

  const thrusterFlames = [];

  function makeFlameMat(color) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }

  function makeNacelle(x) {
    const g = new THREE.Group();
    // Vertical VTOL pod — nozzle faces down (-Y).
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.35, 24), engineMat);
    pod.position.y = 0.15;
    pod.castShadow = true;
    g.add(pod);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.35, 24), darkMat);
    sleeve.position.y = 0.55;
    g.add(sleeve);
    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.28, 24), darkMat);
    intake.position.y = 0.85;
    g.add(intake);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 24), accentMat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.98;
    g.add(lip);
    // fan discs at top intake
    for (let i = 0; i < 3; i += 1) {
      const fan = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.08), accentMat);
      fan.position.y = 0.72;
      fan.rotation.y = (i * Math.PI) / 3;
      g.add(fan);
    }
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.35, 20), glowMat);
    nozzle.position.y = -0.55;
    g.add(nozzle);
    const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 8, 20), darkMat);
    nozzleRing.rotation.x = Math.PI / 2;
    nozzleRing.position.y = -0.72;
    g.add(nozzleRing);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.2, 12), glowHotMat);
    core.position.y = -0.68;
    g.add(core);

    // Layered thrust plume (purple → blue → red → yellow), hidden until thrusting.
    const plume = new THREE.Group();
    plume.name = "thrusterPlume";
    plume.visible = false;
    const layers = [
      { h: 2.4, rTop: 0.38, rBot: 0.08, y: -1.95, color: 0xffee66 }, // yellow tip
      { h: 1.85, rTop: 0.42, rBot: 0.14, y: -1.65, color: 0xff5533 }, // red
      { h: 1.35, rTop: 0.46, rBot: 0.2, y: -1.35, color: 0x4488ff }, // blue
      { h: 0.9, rTop: 0.5, rBot: 0.28, y: -1.05, color: 0xaa44ff }, // purple near nozzle
    ];
    const flameMeshes = [];
    for (const L of layers) {
      const mat = makeFlameMat(L.color);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(L.rBot, L.rTop, L.h, 16, 1, true), mat);
      cone.position.y = L.y;
      plume.add(cone);
      flameMeshes.push({ mesh: cone, mat, baseH: L.h, baseY: L.y });
    }
    // Inner hot core streak
    const coreFlame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.18, 1.6, 10, 1, true),
      makeFlameMat(0xfff0a0)
    );
    coreFlame.position.y = -1.55;
    plume.add(coreFlame);
    flameMeshes.push({ mesh: coreFlame, mat: coreFlame.material, baseH: 1.6, baseY: -1.55 });
    g.add(plume);
    thrusterFlames.push({ plume, layers: flameMeshes, phase: Math.random() * Math.PI * 2 });

    // Short pylon from wing down to pod
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.7), hullMat);
    pylon.position.set(0, 1.15, 0);
    pylon.castShadow = true;
    g.add(pylon);
    addBox(g, 0.4, 0.12, 0.55, darkMat, 0, 1.35, 0);
    g.position.set(x, 0.55, -0.1);
    return g;
  }
  root.add(makeNacelle(-3.25));
  root.add(makeNacelle(3.25));

  // Landing gear pedestals (~1m)
  function makeGear(x, z) {
    const g = new THREE.Group();
    addBox(g, 0.16, 0.85, 0.16, darkMat, 0, 0.45, 0);
    addBox(g, 0.08, 0.55, 0.08, accentMat, 0.12, 0.5, 0);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 12), accentMat);
    foot.position.y = 0.05;
    g.add(foot);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 10), darkMat);
    pad.position.y = 0.12;
    g.add(pad);
    g.position.set(x, 0, z);
    return g;
  }
  root.add(makeGear(-0.9, 1.85));
  root.add(makeGear(0.9, 1.85));
  root.add(makeGear(-0.9, -1.65));
  root.add(makeGear(0.9, -1.65));

  // Side vents / greebles
  for (let i = 0; i < 5; i += 1) {
    addBox(root, 0.12, 0.28, 0.45, darkMat, -1.2, 1.45 + (i % 2) * 0.35, -1.5 + i * 0.7);
    addBox(root, 0.12, 0.28, 0.45, darkMat, 1.2, 1.45 + (i % 2) * 0.35, -1.5 + i * 0.7);
  }
  addBox(root, 0.7, 0.35, 0.9, darkMat, -0.9, 2.35, -1.8);
  addBox(root, 0.7, 0.35, 0.9, darkMat, 0.9, 2.35, -1.8);

  // Rear ramp — slowly slides forward into the bay when boarding.
  const rampLength = 3.2;
  const rampWidth = 1.8;
  const rampAngle = Math.atan2(1.0, rampLength);
  const rampHyp = Math.hypot(1.0, rampLength);
  const rampZ = -3.1 - rampLength * 0.35;
  const rampParts = [];

  function addRampPart(obj, openPos, openRotX, closedPos, closedRotX) {
    rampParts.push({
      obj,
      openPos: openPos.clone(),
      openRotX,
      closedPos: closedPos.clone(),
      closedRotX,
    });
  }

  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampWidth, 0.08, rampHyp), rampMat);
  ramp.rotation.x = -rampAngle;
  ramp.position.set(0, 0.5, rampZ);
  ramp.receiveShadow = true;
  ramp.castShadow = true;
  ramp.name = "shipRamp";
  ramp.userData.isRamp = true;
  walk.add(ramp);
  // Closed: level with the deck and retracted into the fuselage.
  addRampPart(
    ramp,
    new THREE.Vector3(0, 0.5, rampZ),
    -rampAngle,
    new THREE.Vector3(0, 1.08, -0.55),
    0
  );

  const rampStripe = addBox(walk, rampWidth * 0.92, 0.02, 0.06, accentMat, 0, 0.55, rampZ, false);
  addRampPart(
    rampStripe,
    new THREE.Vector3(0, 0.55, rampZ),
    0,
    new THREE.Vector3(0, 1.14, -0.55),
    0
  );

  const rampTop = new THREE.Object3D();
  rampTop.name = "rampTop";
  rampTop.position.set(0, 1.02, -2.7);
  walk.add(rampTop);
  const rampFoot = new THREE.Object3D();
  rampFoot.name = "rampFoot";
  rampFoot.position.set(0, 0.04, rampZ - Math.cos(rampAngle) * (rampHyp * 0.5) - 0.35);
  walk.add(rampFoot);

  // Rear hatch frame + interior hint
  addBox(root, 2.05, 1.55, 0.14, darkMat, 0, 1.78, -2.55);
  addBox(root, 1.7, 1.25, 0.06, new THREE.MeshStandardMaterial({ map: carbonMap, metalness: 0.5, roughness: 0.5 }), 0, 1.75, -2.48);
  addBox(root, 0.2, 0.2, 0.15, lightMat, -0.95, 2.35, -2.6);
  addBox(root, 0.2, 0.2, 0.15, lightMat, 0.95, 2.35, -2.6);

  root.add(walk);
  root.userData.walk = walk;
  root.userData.ramp = ramp;
  root.userData.rampTop = rampTop;
  root.userData.rampFoot = rampFoot;
  root.userData.thrusterFlames = thrusterFlames;
  root.userData.setRampOpen = (t) => {
    // Ease so the last stretch of the slide eases in.
    const k = THREE.MathUtils.clamp(t, 0, 1);
    const e = k * k * (3 - 2 * k);
    for (const part of rampParts) {
      part.obj.position.lerpVectors(part.closedPos, part.openPos, e);
      part.obj.rotation.x = THREE.MathUtils.lerp(part.closedRotX, part.openRotX, e);
    }
  };
  root.userData.setRampOpen(1);
  root.userData.setThrust = (level, t = 0) => {
    const k = THREE.MathUtils.clamp(typeof level === "number" ? level : level ? 1 : 0, 0, 1);
    for (const thr of thrusterFlames) {
      thr.plume.visible = k > 0.015;
      if (k <= 0.015) continue;
      const flicker = 0.82 + 0.18 * Math.sin(t * 28 + thr.phase) + 0.08 * Math.sin(t * 51 + thr.phase * 1.7);
      const len = (0.25 + 0.75 * k) * flicker;
      const girth = (0.45 + 0.55 * k) * (0.9 + flicker * 0.15);
      thr.plume.scale.set(girth, len, girth);
      for (const layer of thr.layers) {
        layer.mat.opacity = (0.35 + 0.6 * k) * (0.55 + 0.4 * flicker);
      }
    }
  };
  return root;
}

/** Unit-sphere depth of the dug flat pad plane (chord through the pad rim). */
function padPlaneDepth(padRadiusM, planetRadiusM) {
  const R = Math.max(4, planetRadiusM);
  const flatAng = Math.min(Math.PI * 0.45, padRadiusM / R);
  return Math.cos(flatAng);
}

/**
 * Displace the unit sphere, dig a true planar landing shelf at padDir (cuts into
 * the sphere so the site is flat, not sphere-curved), and paint the white circle.
 */
function applyTerrain(geometry, basePositions, seed, reliefAmp, cover01, padDir = null, padRadiusM = SHIP_PAD_RADIUS_M, planetRadiusM = 20) {
  const pos = geometry.attributes.position;
  const amp = Math.max(0, reliefAmp);
  const R = Math.max(4, planetRadiusM);
  const flatAng = Math.min(Math.PI * 0.45, padRadiusM / R);
  const apronAng = Math.min(Math.PI * 0.49, (padRadiusM + SHIP_PAD_CLEAR_MARGIN_M) / R);
  const planeD = Math.cos(flatAng);
  const ringAng = flatAng;
  const ringHalf = (SHIP_PAD_LINE_WIDTH_M * 0.5) / R;
  const pdx = padDir ? padDir.x : 0;
  const pdy = padDir ? padDir.y : 0;
  const pdz = padDir ? padDir.z : 0;

  let colorAttr = geometry.getAttribute("color");
  if (!colorAttr || colorAttr.count !== pos.count) {
    colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geometry.setAttribute("color", colorAttr);
  }

  for (let i = 0; i < pos.count; i += 1) {
    const bx = basePositions[i * 3];
    const by = basePositions[i * 3 + 1];
    const bz = basePositions[i * 3 + 2];
    const len = Math.hypot(bx, by, bz) || 1;
    const nx = bx / len;
    const ny = by / len;
    const nz = bz / len;
    let h = sampleTerrain(nx, ny, nz, seed, cover01);

    let cr = 1;
    let cg = 1;
    let cb = 1;
    let digBlend = 0;

    if (padDir) {
      const dot = THREE.MathUtils.clamp(nx * pdx + ny * pdy + nz * pdz, -1, 1);
      const ang = Math.acos(dot);
      if (ang <= flatAng) {
        // Clear relief, then dig to the planar shelf.
        h = 0;
        digBlend = 1;
        cr = 0.82;
        cg = 0.8;
        cb = 0.76;
      } else if (ang < apronAng) {
        digBlend = 1 - smoothstep(flatAng, apronAng, ang);
        h = THREE.MathUtils.lerp(h, 0, digBlend);
        cr = THREE.MathUtils.lerp(1, 0.82, digBlend);
        cg = THREE.MathUtils.lerp(1, 0.8, digBlend);
        cb = THREE.MathUtils.lerp(1, 0.76, digBlend);
      }
      const dRing = Math.abs(ang - ringAng);
      if (dRing <= ringHalf) {
        const edge = 1 - smoothstep(ringHalf * 0.35, ringHalf, dRing);
        cr = THREE.MathUtils.lerp(cr, 1.15, edge);
        cg = THREE.MathUtils.lerp(cg, 1.15, edge);
        cb = THREE.MathUtils.lerp(cb, 1.12, edge);
      }
    }

    const r = 1 + amp * h;
    let sx = nx * r;
    let sy = ny * r;
    let sz = nz * r;

    if (padDir && digBlend > 0) {
      // Project along pad normal onto the chord plane — carves into the sphere.
      const along = sx * pdx + sy * pdy + sz * pdz;
      const fx = sx - pdx * (along - planeD);
      const fy = sy - pdy * (along - planeD);
      const fz = sz - pdz * (along - planeD);
      sx = THREE.MathUtils.lerp(sx, fx, digBlend);
      sy = THREE.MathUtils.lerp(sy, fy, digBlend);
      sz = THREE.MathUtils.lerp(sz, fz, digBlend);
    }

    pos.setXYZ(i, sx, sy, sz);
    colorAttr.setXYZ(i, cr, cg, cb);
  }
  pos.needsUpdate = true;
  colorAttr.needsUpdate = true;
  geometry.computeVertexNormals();

  // Force pad-face normals to the plane so lighting reads as a true flat shelf.
  if (padDir) {
    const nrm = geometry.attributes.normal;
    for (let i = 0; i < pos.count; i += 1) {
      const bx = basePositions[i * 3];
      const by = basePositions[i * 3 + 1];
      const bz = basePositions[i * 3 + 2];
      const len = Math.hypot(bx, by, bz) || 1;
      const dot = THREE.MathUtils.clamp((bx / len) * pdx + (by / len) * pdy + (bz / len) * pdz, -1, 1);
      const ang = Math.acos(dot);
      if (ang <= flatAng) {
        nrm.setXYZ(i, pdx, pdy, pdz);
      } else if (ang < apronAng) {
        const blend = 1 - smoothstep(flatAng, apronAng, ang);
        const nx = THREE.MathUtils.lerp(nrm.getX(i), pdx, blend);
        const ny = THREE.MathUtils.lerp(nrm.getY(i), pdy, blend);
        const nz = THREE.MathUtils.lerp(nrm.getZ(i), pdz, blend);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nrm.setXYZ(i, nx / nl, ny / nl, nz / nl);
      }
    }
    nrm.needsUpdate = true;
  }

  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
}

function gravityFromSlider(slider01) {
  const t = THREE.MathUtils.clamp(slider01, 0, 1);
  return THREE.MathUtils.lerp(EARTH_G, MIN_G, t);
}

function pickClip(clips, names) {
  const lower = clips.map((clip) => ({ clip, name: String(clip.name || "").toLowerCase() }));
  for (const want of names) {
    const exact = lower.find((entry) => entry.name === want || entry.name.startsWith(`${want} `));
    if (exact) return exact.clip;
  }
  for (const want of names) {
    const hit = lower.find((entry) => entry.name.includes(want));
    if (hit) return hit.clip;
  }
  return null;
}

function playAction(actor, key, { loop = true, fade = 0.15 } = {}) {
  if (!actor?.[key]) return;
  const next = actor[key];
  if (actor.mode === key && next.isRunning()) return;
  const prev = actor.current;
  next.enabled = true;
  next.paused = false;
  next.setEffectiveWeight(1);
  next.setEffectiveTimeScale(1);
  next.reset();
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  next.clampWhenFinished = !loop;
  next.play();
  if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
  actor.current = next;
  actor.mode = key;
}

function loadMoonTextures() {
  const loader = new THREE.TextureLoader();
  const load = (url, colorSpace = null) =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (texture) => {
          texture.anisotropy = 8;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          if (colorSpace) texture.colorSpace = colorSpace;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  return Promise.all([
    load("/textures/moon_albedo.jpg", THREE.SRGBColorSpace),
    load("/textures/moon_bump.jpg"),
  ]).then(([albedo, bump]) => ({ albedo, bump }));
}

function makeStars() {
  const count = 2200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 90 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xe8eef8,
      size: 0.28,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
}

/** Scale once and plant feet on characterRoot local origin (y=0). */
function fitCharacter(character, targetHeight) {
  character.position.set(0, 0, 0);
  character.scale.set(1, 1, 1);
  character.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(character);
  let size = box.getSize(new THREE.Vector3());
  if (size.y > 0.0001) character.scale.setScalar(targetHeight / size.y);
  character.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(character);
  size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  character.position.set(-center.x, -box.min.y, -center.z);
  return Math.max(0.5, size.y);
}

export default function PlanetWalk() {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [gravitySlider, setGravitySlider] = useState(DEFAULT_GRAVITY_SLIDER);
  const [moonSize, setMoonSize] = useState(DEFAULT_MOON_SIZE);
  const [reliefSlider, setReliefSlider] = useState(DEFAULT_RELIEF);
  const [featureCover, setFeatureCover] = useState(DEFAULT_FEATURE_COVER);
  const gravitySliderRef = useRef(DEFAULT_GRAVITY_SLIDER);
  const moonSizeRef = useRef(DEFAULT_MOON_SIZE);
  const reliefSliderRef = useRef(DEFAULT_RELIEF);
  const featureCoverRef = useRef(DEFAULT_FEATURE_COVER);
  const thrustHudRef = useRef(null);
  const thrustFillRef = useRef(null);
  const thrustReadoutRef = useRef(null);
  const refitPlanetRef = useRef(() => {});
  const rebuildTerrainRef = useRef(() => {});
  const terraformRef = useRef(() => {});

  useEffect(() => {
    gravitySliderRef.current = gravitySlider;
  }, [gravitySlider]);

  useEffect(() => {
    moonSizeRef.current = moonSize;
    refitPlanetRef.current();
  }, [moonSize]);

  useEffect(() => {
    reliefSliderRef.current = reliefSlider;
    rebuildTerrainRef.current();
  }, [reliefSlider]);

  useEffect(() => {
    featureCoverRef.current = featureCover;
    rebuildTerrainRef.current();
  }, [featureCover]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let alive = true;
    let radius = 6;
    let frame = 0;
    const CAM_PITCH_DEFAULT = 0.28;
    const CAM_RETURN_SPEED = 4.2;
    let camPitch = CAM_PITCH_DEFAULT;
    let camYawOffset = 0;
    let camDist = 1;
    let camReturning = false;
    const keys = new Set();
    let jumpPressed = false;

    let hopHeight = 0;
    let hopVel = 0;
    let grounded = true;
    let airThrottle = 0;
    let airSpeed = 0;
    let airFacing = 0;
    let jumpPhase = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");
    scene.fog = new THREE.FogExp2("#000000", 0.0045);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x1a1c22, 0.08));
    const sun = new THREE.DirectionalLight(0xfff1dd, 3.4);
    sun.position.set(18, 8, 4);
    scene.add(sun);
    const sunFill = new THREE.DirectionalLight(0x6a7a96, 0.12);
    sunFill.position.set(-10, -4, -8);
    scene.add(sunFill);
    scene.add(makeStars());

    const planet = new THREE.Group();
    scene.add(planet);

    let planetTex = null;
    let planetBump = null;
    let terrainSeed = Math.floor(Math.random() * 100000);
    const globeMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
      metalness: 0,
      flatShading: false,
      vertexColors: true,
    });
    const globeGeo = new THREE.SphereGeometry(1, 192, 128);
    const basePositions = Float32Array.from(globeGeo.attributes.position.array);
    // Any fixed site away from the north-pole spawn; terrain is graded flat there.
    const shipSurfaceDir = new THREE.Vector3(0.72, 0.42, -0.55).normalize();
    applyTerrain(
      globeGeo,
      basePositions,
      terrainSeed,
      reliefFromSlider(reliefSliderRef.current),
      featureCoverRef.current / 100,
      shipSurfaceDir,
      SHIP_PAD_RADIUS_M,
      20
    );
    const globe = new THREE.Mesh(globeGeo, globeMat);
    globe.geometry.computeBoundingSphere();
    planet.add(globe);

    // Spaceship sits on the graded flat; inverse-scaled so world size stays in metres.
    const spaceship = createSpaceship();
    const shipAnchor = new THREE.Group();
    shipAnchor.name = "shipAnchor";
    shipAnchor.add(spaceship);
    planet.add(shipAnchor);
    const shipWalk = spaceship.userData.walk;
    const rampMesh = spaceship.userData.ramp;
    const rampTop = spaceship.userData.rampTop;
    const rampFoot = spaceship.userData.rampFoot;
    const shipUp = new THREE.Vector3();
    const shipForward = new THREE.Vector3();
    const shipRight = new THREE.Vector3();
    const shipOrient = new THREE.Matrix4();
    const northPole = new THREE.Vector3(0, 1, 0);
    const tmpV = new THREE.Vector3();
    const tmpV2 = new THREE.Vector3();
    const shipFlyVel = new THREE.Vector3();
    const shipThrustDir = new THREE.Vector3();
    const shipNose = new THREE.Vector3(0, 0, 1);
    const shipRadialUp = new THREE.Vector3(0, 1, 0);
    let shipPitch = 0;
    let shipRoll = 0;
    let thrustLevel = 0;
    let rampOpen = 1; // 1 = deployed, 0 = sealed into craft
    const RAMP_CLOSE_SPEED = 0.38; // ~2.5s slow slide into the bay
    let playMode = "walk"; // walk | fly | exiting
    let enterCooldown = 0;
    let exitAnimT = 0;
    let exitFromQuat = new THREE.Quaternion();
    let exitToQuat = new THREE.Quaternion();
    let shipFlying = false;

    const localSurfDir = new THREE.Vector3();
    const invPlanet = new THREE.Matrix4();
    const downRay = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3();
    const rayDir = new THREE.Vector3(0, -1, 0);
    const rayTargets = [globe, shipWalk];

    function currentRelief() {
      return reliefFromSlider(reliefSliderRef.current);
    }

    function currentCover() {
      return THREE.MathUtils.clamp(featureCoverRef.current, 0, 100) / 100;
    }

    function orientShipAnchor() {
      shipUp.copy(shipSurfaceDir);
      shipForward.copy(northPole).addScaledVector(shipUp, -northPole.dot(shipUp));
      if (shipForward.lengthSq() < 1e-8) shipForward.set(0, 0, 1);
      shipForward.normalize();
      shipRight.crossVectors(shipForward, shipUp).normalize();
      shipForward.crossVectors(shipUp, shipRight).normalize();
      shipOrient.makeBasis(shipRight, shipUp, shipForward.clone().negate());
      shipAnchor.quaternion.setFromRotationMatrix(shipOrient);
    }

    function placeSpaceshipOnSurface() {
      if (shipFlying) return;
      // Sit on the dug planar shelf (chord plane), not the curved sphere surface.
      const localR = padPlaneDepth(SHIP_PAD_RADIUS_M, radius);
      shipAnchor.position.copy(shipSurfaceDir).multiplyScalar(localR);
      orientShipAnchor();
      const s = 1 / Math.max(0.001, radius);
      shipAnchor.scale.setScalar(s);
    }

    /**
     * Keep the level nose tangent to the planet. Heading is parallel-transported
     * as the craft moves so "forward" follows the curve instead of a fixed world axis.
     */
    function transportNose(nextUp) {
      shipRight.crossVectors(shipRadialUp, nextUp);
      const sinA = shipRight.length();
      const cosA = THREE.MathUtils.clamp(shipRadialUp.dot(nextUp), -1, 1);
      if (sinA > 1e-6) {
        shipRight.multiplyScalar(1 / sinA);
        shipNose.applyAxisAngle(shipRight, Math.atan2(sinA, cosA));
      }
      shipNose.addScaledVector(nextUp, -shipNose.dot(nextUp));
      if (shipNose.lengthSq() < 1e-8) {
        shipNose.set(1, 0, 0).addScaledVector(nextUp, -nextUp.x);
        if (shipNose.lengthSq() < 1e-8) shipNose.set(0, 1, 0).addScaledVector(nextUp, -nextUp.y);
      }
      shipNose.normalize();
      shipRadialUp.copy(nextUp);
    }

    function orientShipToPlanet() {
      const dist = Math.max(0.001, spaceship.position.length());
      shipUp.copy(spaceship.position).multiplyScalar(1 / dist);
      transportNose(shipUp);
      shipRight.crossVectors(shipUp, shipNose).normalize();
      shipNose.crossVectors(shipRight, shipUp).normalize();
      shipOrient.makeBasis(shipRight, shipUp, shipNose);
      spaceship.quaternion.setFromRotationMatrix(shipOrient);
      spaceship.rotateX(shipPitch);
      spaceship.rotateZ(shipRoll);
    }

    function surfaceRadiusUnderShip() {
      const dist = Math.max(0.001, spaceship.position.length());
      // Use shipThrustDir as a scratch radial; thrust overwrites it later. Don't touch rayDir
      // (walk mode casts that straight down in world space).
      shipThrustDir.copy(spaceship.position).multiplyScalar(1 / dist);
      rayOrigin.copy(shipThrustDir).multiplyScalar(dist + 8);
      shipThrustDir.negate();
      downRay.set(rayOrigin, shipThrustDir);
      downRay.near = 0;
      downRay.far = dist + 8 + radius * 2;
      const hits = downRay.intersectObject(globe, true);
      if (!hits.length) return radius;
      return hits[0].point.length();
    }

    /** Analytic fallback — mesh is faceted, so prefer raycast for standing height. */
    function analyticSurfaceY() {
      invPlanet.copy(planet.matrixWorld).invert();
      localSurfDir.set(0, 1, 0).transformDirection(invPlanet).normalize();
      const h = sampleTerrain(localSurfDir.x, localSurfDir.y, localSurfDir.z, terrainSeed, currentCover());
      return radius * (1 + currentRelief() * h);
    }

    function pickSurfaceHit() {
      planet.updateMatrixWorld(true);
      if (spaceship.parent === scene) spaceship.updateMatrixWorld(true);
      const ceiling = radius * (1 + currentRelief() + 0.12) + 8;
      rayOrigin.set(0, ceiling, 0);
      downRay.set(rayOrigin, rayDir);
      downRay.near = 0;
      downRay.far = ceiling + radius * 0.5;
      const targets = shipFlying ? [globe] : rayTargets;
      const hits = downRay.intersectObjects(targets, true);
      if (!hits.length) return null;
      let best = hits[0];
      for (let i = 1; i < hits.length; i += 1) {
        if (hits[i].point.y > best.point.y) best = hits[i];
      }
      return best;
    }

    /** Hit globe, pad, or ship deck/ramp under the astronaut (world +Y). */
    function surfaceRadiusAtNorthPole() {
      const hit = pickSurfaceHit();
      if (hit) return hit.point.y;
      return analyticSurfaceY();
    }

    function rebuildTerrain() {
      applyTerrain(
        globeGeo,
        basePositions,
        terrainSeed,
        currentRelief(),
        currentCover(),
        shipSurfaceDir,
        SHIP_PAD_RADIUS_M,
        radius
      );
      placeSpaceshipOnSurface();
    }

    rebuildTerrainRef.current = rebuildTerrain;
    terraformRef.current = () => {
      terrainSeed = Math.floor(Math.random() * 100000);
      rebuildTerrain();
    };

    function bringPointToNorthPole(worldPoint) {
      tmpV.copy(worldPoint).normalize();
      const axis = tmpV2.crossVectors(tmpV, worldUp);
      if (axis.lengthSq() < 1e-10) return;
      axis.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(tmpV.dot(worldUp), -1, 1));
      planet.rotateOnWorldAxis(axis, angle);
      planet.updateMatrixWorld(true);
    }

    function dockShipToPad() {
      if (spaceship.parent !== shipAnchor) {
        shipAnchor.add(spaceship);
        spaceship.position.set(0, 0, 0);
        spaceship.quaternion.identity();
        spaceship.scale.set(1, 1, 1);
      }
      shipFlying = false;
      shipFlyVel.set(0, 0, 0);
      shipPitch = 0;
      shipRoll = 0;
      thrustLevel = 0;
      if (thrustHudRef.current) thrustHudRef.current.style.display = "none";
      spaceship.rotation.set(0, 0, 0);
      rampOpen = 1;
      spaceship.userData.setRampOpen?.(1);
      spaceship.userData.setThrust?.(false);
      placeSpaceshipOnSurface();
      planet.updateMatrixWorld(true);
    }

    function enterFlyMode() {
      if (playMode !== "walk" || enterCooldown > 0) return;
      planet.updateMatrixWorld(true);
      spaceship.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      spaceship.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      scene.add(spaceship);
      spaceship.position.copy(worldPos);
      // Flight is Y-up; heading from ship nose so the ramp (local -Z) stays behind the camera.
      tmpV.set(0, 0, 1).applyQuaternion(worldQuat);
      tmpV.y = 0;
      if (tmpV.lengthSq() > 1e-8) {
        tmpV.normalize();
        facingYaw = Math.atan2(tmpV.x, tmpV.z);
      }
      shipPitch = 0;
      shipRoll = 0;
      spaceship.rotation.order = "YXZ";
      spaceship.rotation.set(0, facingYaw, 0);
      spaceship.scale.copy(worldScale);
      shipFlying = true;
      shipFlyVel.set(0, 0, 0);
      thrustLevel = 0;
      {
        const d = Math.max(0.001, worldPos.length());
        shipRadialUp.copy(worldPos).multiplyScalar(1 / d);
        shipNose.set(0, 0, 1).applyQuaternion(worldQuat);
        shipNose.addScaledVector(shipRadialUp, -shipNose.dot(shipRadialUp));
        if (shipNose.lengthSq() < 1e-6) {
          shipNose.set(Math.sin(facingYaw), 0, Math.cos(facingYaw));
          shipNose.addScaledVector(shipRadialUp, -shipNose.dot(shipRadialUp));
        }
        if (shipNose.lengthSq() < 1e-8) shipNose.set(1, 0, 0);
        shipNose.normalize();
      }
      playMode = "fly";
      characterRoot.visible = false;
      hopHeight = 0;
      hopVel = 0;
      grounded = true;
      jumpPhase = null;
      camYawOffset = 0;
      camPitch = CAM_PITCH_DEFAULT;
      camReturning = false;
      // Ramp starts open on board, then slides shut into the craft.
      rampOpen = 1;
      spaceship.userData.setRampOpen?.(1);
    }

    function beginExitFlyMode() {
      if (playMode !== "fly") return;
      dockShipToPad();
      characterRoot.visible = true;
      // Start at ramp top, then walk to foot so enter doesn't retrigger.
      rampTop.getWorldPosition(tmpV);
      bringPointToNorthPole(tmpV);
      exitFromQuat.copy(planet.quaternion);
      rampFoot.getWorldPosition(tmpV);
      const q0 = planet.quaternion.clone();
      bringPointToNorthPole(tmpV);
      exitToQuat.copy(planet.quaternion);
      planet.quaternion.copy(q0);
      exitAnimT = 0;
      playMode = "exiting";
      if (actor) playAction(actor, "walk");
      facingYaw = 0;
    }

    loadMoonTextures()
      .then(({ albedo, bump }) => {
        if (!alive) {
          albedo.dispose();
          bump.dispose();
          return;
        }
        planetTex = albedo;
        planetBump = bump;
        globeMat.map = albedo;
        globeMat.bumpMap = bump;
        globeMat.bumpScale = 0.085;
        globeMat.roughnessMap = bump;
        globeMat.roughness = 0.92;
        globeMat.needsUpdate = true;
      })
      .catch(() => {
        if (alive) setStatus((prev) => (prev === "ready" ? prev : "error"));
      });

    const characterRoot = new THREE.Group();
    scene.add(characterRoot);
    let character = null;
    let modelHeight = TARGET_HEIGHT;
    let actor = null;

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    new Promise((resolve, reject) => loader.load(MODEL_URL, resolve, undefined, reject))
      .then((gltf) => {
        if (!alive) return;
        character = gltf.scene;
        character.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.frustumCulled = false;
            if (obj.material) {
              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              for (const mat of mats) {
                if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.needsUpdate = true;
              }
            }
          }
        });

        const head = character.getObjectByName("head");
        if (head) head.scale.multiplyScalar(HEAD_SCALE);
        const torso = character.getObjectByName("torso");
        if (torso) {
          torso.scale.x *= TORSO_WIDTH;
          torso.scale.z *= TORSO_WIDTH;
        }

        modelHeight = fitCharacter(character, TARGET_HEIGHT);
        characterRoot.add(character);

        const clips = gltf.animations || [];
        const mixer = new THREE.AnimationMixer(character);
        const make = (clip) => {
          if (!clip) return null;
          const action = mixer.clipAction(clip);
          action.enabled = true;
          return action;
        };

        actor = {
          mixer,
          idle: make(pickClip(clips, ["idle"])),
          walk: make(pickClip(clips, ["walk"])),
          run: make(pickClip(clips, ["run"])),
          jump: make(pickClip(clips, ["jump"])),
          current: null,
          mode: "",
        };

        if (!actor.idle || !actor.walk || !actor.jump) {
          setStatus("error");
          return;
        }
        playAction(actor, "idle", { loop: true, fade: 0 });
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });

    let facingYaw = 0;
    const forward = new THREE.Vector3();
    const spinAxis = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    function fitRadiusToScreen() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const tanHalf = Math.tan(hFov / 2);
      const denom = 1 - DIAMETER_FRAC * tanHalf;
      let base = denom > 0.05 ? (DIAMETER_FRAC * CAM_BACK * tanHalf) / denom : 5.5;
      base *= PLANET_SIZE_SCALE;
      // Slider 3/10 = current size; 1 smaller, 10 larger.
      const sizeMul = THREE.MathUtils.clamp(moonSizeRef.current, 1, 10) / DEFAULT_MOON_SIZE;
      radius = THREE.MathUtils.clamp(base * sizeMul, 2.2, 90);
      planet.scale.setScalar(radius);
    }
    refitPlanetRef.current = () => {
      fitRadiusToScreen();
      rebuildTerrain();
      updateCamera();
    };

    function updateCamera() {
      if (playMode === "fly" && shipFlying) {
        // Chase cam in the planet's local horizon, so it follows the curve with the craft.
        const distLen = Math.max(0.001, spaceship.position.length());
        tmpV.copy(spaceship.position).multiplyScalar(1 / distLen);
        tmpV2.copy(shipNose).applyAxisAngle(tmpV, camYawOffset);
        const dist = CAM_BACK * 2.15 * camDist;
        const back = dist * Math.cos(camPitch);
        const lift = CAM_UP * 1.35 + Math.sin(camPitch) * dist;
        camera.up.copy(tmpV);
        camera.position.copy(spaceship.position);
        camera.position.addScaledVector(tmpV2, -back);
        camera.position.addScaledVector(tmpV, lift);
        tmpV2.copy(spaceship.position).addScaledVector(tmpV, 1.15);
        camera.lookAt(tmpV2);
        return;
      }
      camera.up.set(0, 1, 0);
      const surfY = surfaceRadiusAtNorthPole();
      const charY = surfY + hopHeight;
      const lookY = charY + modelHeight * 0.55;
      const yaw = facingYaw + camYawOffset;
      const dist = CAM_BACK * camDist;
      const back = dist * Math.cos(camPitch);
      const lift = CAM_UP + Math.sin(camPitch) * dist;
      camera.position.set(-Math.sin(yaw) * back, charY + lift, -Math.cos(yaw) * back);
      camera.lookAt(0, lookY, 0);
    }

    fitRadiusToScreen();
    rebuildTerrain();
    updateCamera();

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (event.code === "Escape") {
        event.preventDefault();
        if (playMode === "fly") beginExitFlyMode();
        return;
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === " " || event.code === "Space") {
        if (!keys.has(" ")) jumpPressed = true;
        keys.add(" ");
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
      if (dragging) camReturning = true;
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
      camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.003, -0.35, 0.75);
    };
    const onWheel = (event) => {
      event.preventDefault();
      camDist = THREE.MathUtils.clamp(camDist + event.deltaY * 0.0012, 0.55, 2.4);
    };
    const onResize = () => {
      fitRadiusToScreen();
      updateCamera();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    let last = performance.now();
    const loop = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (enterCooldown > 0) enterCooldown = Math.max(0, enterCooldown - dt);

      if (camReturning && !dragging) {
        const t = 1 - Math.exp(-CAM_RETURN_SPEED * dt);
        camYawOffset = THREE.MathUtils.lerp(camYawOffset, 0, t);
        camPitch = THREE.MathUtils.lerp(camPitch, CAM_PITCH_DEFAULT, t);
        if (Math.abs(camYawOffset) < 0.001 && Math.abs(camPitch - CAM_PITCH_DEFAULT) < 0.001) {
          camYawOffset = 0;
          camPitch = CAM_PITCH_DEFAULT;
          camReturning = false;
        }
      }

      const spaceHeld = keys.has(" ");
      if (!(playMode === "fly" && shipFlying) && thrustHudRef.current) {
        thrustHudRef.current.style.display = "none";
      }

      if (playMode === "fly" && shipFlying) {
        jumpPressed = false;
        // A/D bank, W/S pitch — no yaw. Space spools thrust along craft up (engine axis).
        let bankInput = 0;
        if (keys.has("a") || keys.has("arrowleft")) bankInput -= 1;
        if (keys.has("d") || keys.has("arrowright")) bankInput += 1;
        let pitchInput = 0;
        if (keys.has("w") || keys.has("arrowup")) pitchInput += 1; // tilt nose forward
        if (keys.has("s") || keys.has("arrowdown")) pitchInput -= 1; // tilt nose back

        if (bankInput) {
          shipRoll = THREE.MathUtils.clamp(
            shipRoll + bankInput * SHIP_BANK_SPEED * dt,
            -SHIP_MAX_BANK,
            SHIP_MAX_BANK
          );
        } else {
          shipRoll = THREE.MathUtils.lerp(shipRoll, 0, 1 - Math.exp(-3.2 * dt));
        }
        if (pitchInput) {
          shipPitch = THREE.MathUtils.clamp(
            shipPitch + pitchInput * SHIP_PITCH_SPEED * dt,
            -SHIP_MAX_PITCH,
            SHIP_MAX_PITCH
          );
        } else {
          shipPitch = THREE.MathUtils.lerp(shipPitch, 0, 1 - Math.exp(-3.2 * dt));
        }

        if (spaceHeld) thrustLevel = Math.min(1, thrustLevel + dt / THRUST_SPOOL_UP_SEC);
        else thrustLevel = Math.max(0, thrustLevel - dt / THRUST_SPOOL_DOWN_SEC);

        if (rampOpen > 0) {
          rampOpen = Math.max(0, rampOpen - RAMP_CLOSE_SPEED * dt);
          spaceship.userData.setRampOpen?.(rampOpen);
        }

        // Belly toward the planet before thrust, so engines push off the local ground.
        orientShipToPlanet();

        const r = Math.max(0.5, spaceship.position.length());
        shipUp.copy(spaceship.position).multiplyScalar(1 / r);
        const g = gravityFromSlider(gravitySliderRef.current);
        const falloff = (radius * radius) / (r * r);
        shipFlyVel.addScaledVector(shipUp, -g * falloff * dt);
        if (thrustLevel > 0) {
          shipThrustDir.set(0, 1, 0).applyQuaternion(spaceship.quaternion);
          shipFlyVel.addScaledVector(shipThrustDir, SHIP_THRUST * thrustLevel * dt);
        }

        const alt = r - radius;
        const atmo = Math.exp(-Math.max(0, alt) / Math.max(6, radius * 0.4));
        shipFlyVel.multiplyScalar(Math.max(0, 1 - SHIP_DRAG * atmo * dt));
        spaceship.position.addScaledVector(shipFlyVel, dt);

        // Radial ground: rest on the surface under the craft, anywhere on the sphere.
        const minR = surfaceRadiusUnderShip() + SHIP_GROUND_CLEARANCE;
        const distNow = Math.max(0.001, spaceship.position.length());
        if (distNow < minR) {
          shipUp.copy(spaceship.position).multiplyScalar(1 / distNow);
          spaceship.position.copy(shipUp).multiplyScalar(minR);
          const radialVel = shipFlyVel.dot(shipUp);
          if (radialVel < 0) shipFlyVel.addScaledVector(shipUp, -radialVel);
          const grip = 1 - Math.exp(-1.4 * dt);
          const outward = shipFlyVel.dot(shipUp);
          shipFlyVel.addScaledVector(shipUp, -outward);
          shipFlyVel.multiplyScalar(1 - grip);
          shipFlyVel.addScaledVector(shipUp, outward);
        }

        orientShipToPlanet();
        spaceship.userData.setThrust?.(thrustLevel, performance.now() * 0.001);
        if (thrustHudRef.current) thrustHudRef.current.style.display = "block";
        const thrustPct = Math.round(thrustLevel * 100);
        if (thrustFillRef.current) thrustFillRef.current.style.width = `${thrustPct}%`;
        if (thrustReadoutRef.current) thrustReadoutRef.current.textContent = `${thrustPct}%`;
        updateCamera();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(loop);
        return;
      }

      let turn = 0;
      if (keys.has("a") || keys.has("arrowleft")) turn += 1;
      if (keys.has("d") || keys.has("arrowright")) turn -= 1;
      if (turn) facingYaw += turn * TURN_SPEED * dt;

      let throttle = 0;
      if (keys.has("w") || keys.has("arrowup")) throttle += 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle -= 1;
      const moving = throttle !== 0;
      const running = moving && keys.has("shift");
      const moveSpeed = running ? RUN_SPEED : WALK_SPEED;

      if (playMode === "exiting") {
        jumpPressed = false;
        exitAnimT = Math.min(1, exitAnimT + dt / 1.55);
        planet.quaternion.slerpQuaternions(exitFromQuat, exitToQuat, exitAnimT);
        planet.updateMatrixWorld(true);
        characterRoot.position.set(0, surfaceRadiusAtNorthPole(), 0);
        characterRoot.rotation.y = facingYaw;
        characterRoot.visible = true;
        if (actor) {
          playAction(actor, "walk");
          actor.mixer.update(dt);
        }
        if (exitAnimT >= 1) {
          playMode = "walk";
          enterCooldown = SHIP_EXIT_COOLDOWN;
          if (actor) playAction(actor, "idle");
        }
        updateCamera();
        renderer.render(scene, camera);
        frame = requestAnimationFrame(loop);
        return;
      }

      // --- Walk mode ---
      if (jumpPressed && grounded && !jumpPhase && actor?.jump) {
        playAction(actor, "jump", { loop: false, fade: 0.08 });
        jumpPhase = "crouch";
        airThrottle = moving ? throttle : 0;
        airSpeed = moving ? moveSpeed : 0;
        airFacing = facingYaw;
      }
      jumpPressed = false;

      if (jumpPhase === "crouch" && actor?.jump) {
        const dur = Math.max(0.001, actor.jump.getClip().duration);
        if (actor.jump.time >= dur * JUMP_LAUNCH_AT) {
          hopVel = JUMP_SPEED;
          hopHeight = 0.001;
          grounded = false;
          jumpPhase = "air";
        } else if (airThrottle !== 0 && airSpeed > 0) {
          const angle = (airSpeed * 0.4 * dt) / Math.max(0.5, radius);
          forward.set(Math.sin(airFacing), 0, Math.cos(airFacing));
          if (airThrottle < 0) forward.negate();
          spinAxis.crossVectors(forward, worldUp).normalize();
          if (spinAxis.lengthSq() > 0.0001) planet.rotateOnWorldAxis(spinAxis, angle);
        }
      }

      if (grounded && !jumpPhase) {
        if (moving) {
          const angle = (moveSpeed * dt) / Math.max(0.5, radius);
          forward.set(Math.sin(facingYaw), 0, Math.cos(facingYaw));
          if (throttle < 0) forward.negate();
          spinAxis.crossVectors(forward, worldUp).normalize();
          if (spinAxis.lengthSq() > 0.0001) planet.rotateOnWorldAxis(spinAxis, angle);
        }
      } else if (!grounded) {
        const g = gravityFromSlider(gravitySliderRef.current);
        hopVel -= g * dt;
        hopHeight += hopVel * dt;
        if (airThrottle !== 0 && airSpeed > 0) {
          const angle = (airSpeed * dt) / Math.max(0.5, radius);
          forward.set(Math.sin(airFacing), 0, Math.cos(airFacing));
          if (airThrottle < 0) forward.negate();
          spinAxis.crossVectors(forward, worldUp).normalize();
          if (spinAxis.lengthSq() > 0.0001) planet.rotateOnWorldAxis(spinAxis, angle);
        }
        if (hopHeight <= 0) {
          hopHeight = 0;
          hopVel = 0;
          grounded = true;
          airThrottle = 0;
          airSpeed = 0;
          jumpPhase = null;
        }
      }

      planet.updateMatrixWorld(true);
      characterRoot.position.set(0, surfaceRadiusAtNorthPole() + hopHeight, 0);
      characterRoot.rotation.y = facingYaw;

      // Board only after climbing to the top of the ramp (not at the foot / mid-ramp).
      if (enterCooldown <= 0 && grounded && !jumpPhase) {
        rampTop.getWorldPosition(tmpV);
        const toTop = Math.hypot(tmpV.x, tmpV.z);
        const heightOk = Math.abs(tmpV.y - characterRoot.position.y) < 1.25;
        if (toTop < 1.15 && heightOk) enterFlyMode();
      }

      if (actor) {
        if (!jumpPhase) {
          if (moving) playAction(actor, running && actor.run ? "run" : "walk");
          else playAction(actor, "idle");
        } else if (jumpPhase === "air" && actor.jump) {
          const jump = actor.jump;
          const mid = jump.getClip().duration * 0.55;
          if (jump.time > mid) {
            jump.paused = true;
            jump.time = mid;
          }
        }
        actor.mixer.update(dt);
      }

      updateCamera();
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
      window.removeEventListener("resize", onResize);
      planetTex?.dispose();
      planetBump?.dispose();
      globe.geometry.dispose();
      globe.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  const gNow = gravityFromSlider(gravitySlider);
  const hangSec = (2 * JUMP_SPEED) / gNow;

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0, background: "#050814" }}>
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 18,
          zIndex: 2,
          color: "#dce7ff",
          fontFamily: "Georgia, 'Palatino Linotype', serif",
          textShadow: "0 1px 3px #000",
          pointerEvents: "none",
          maxWidth: 420,
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>Little Planet</div>
        <div style={{ marginTop: 6, fontSize: 14, opacity: 0.8, lineHeight: 1.45 }}>
          Walk: WASD · Space jump · climb ramp to board · Fly: A/D bank · W/S tilt · hold Space to spool thrust · Esc exit
          {status === "loading" ? " · loading astronaut…" : null}
          {status === "error" ? " · astronaut failed to load" : null}
        </div>
      </div>
      <div
        ref={thrustHudRef}
        style={{
          display: "none",
          position: "absolute",
          left: "50%",
          bottom: 28,
          transform: "translateX(-50%)",
          width: 280,
          zIndex: 2,
          pointerEvents: "none",
          color: "#dce7ff",
          fontFamily: "Georgia, 'Palatino Linotype', serif",
          textShadow: "0 1px 3px #000",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, letterSpacing: "0.12em" }}>
          <span>THRUST</span>
          <span ref={thrustReadoutRef}>0%</span>
        </div>
        <div
          style={{
            marginTop: 6,
            height: 12,
            background: "rgba(0,0,0,0.5)",
            border: "1px solid rgba(220,231,255,0.4)",
          }}
        >
          <div ref={thrustFillRef} style={{ height: "100%", width: "0%", background: "#7eb6ff" }} />
        </div>
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.7, textAlign: "center" }}>
          Hold Space · 10s to full thrust
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 18,
          zIndex: 2,
          width: 220,
          padding: "12px 14px",
          color: "#dce7ff",
          fontFamily: "Georgia, 'Palatino Linotype', serif",
          textShadow: "0 1px 3px #000",
          background: "rgba(0,0,0,0.35)",
          borderRadius: 8,
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>
            Moon size
          </div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
            <span>Small</span>
            <span>Huge</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={moonSize}
            onChange={(event) => setMoonSize(Number(event.target.value))}
            style={{ width: "100%", marginTop: 6, cursor: "pointer" }}
            aria-label="Moon size"
          />
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            {moonSize} / 10
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>
            Terrain height
          </div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
            <span>Flat</span>
            <span>Extreme</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={reliefSlider}
            onChange={(event) => setReliefSlider(Number(event.target.value))}
            style={{ width: "100%", marginTop: 6, cursor: "pointer" }}
            aria-label="Terrain height"
          />
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            {reliefSlider} / 10
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>
            Feature cover
          </div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
            <span>Flat</span>
            <span>Covered</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={featureCover}
            onChange={(event) => setFeatureCover(Number(event.target.value))}
            style={{ width: "100%", marginTop: 6, cursor: "pointer" }}
            aria-label="Feature cover"
          />
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            {featureCover} / 100
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.85 }}>
            Gravity
          </div>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
            <span>Earth</span>
            <span>Float</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={gravitySlider}
            onChange={(event) => setGravitySlider(Number(event.target.value))}
            style={{ width: "100%", marginTop: 6, cursor: "pointer" }}
            aria-label="Gravity"
          />
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
            {gNow.toFixed(2)} m/s² · ~{hangSec.toFixed(1)}s hang
          </div>
        </div>
        <button
          type="button"
          onClick={() => terraformRef.current()}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid rgba(220,231,255,0.35)",
            background: "rgba(255,255,255,0.08)",
            color: "#dce7ff",
            fontFamily: "Georgia, 'Palatino Linotype', serif",
            fontSize: 13,
            letterSpacing: "0.04em",
            cursor: "pointer",
          }}
        >
          Terraform New
        </button>
      </div>
    </div>
  );
}
