import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  applyWalkCycle,
  createHumanoidRig,
  NIGHT_WALKER_HERO_COLORS,
  resetPose,
} from "../utils/nightWalkerHumanoid";
import bdFlashImage from "../images/bd.png";

const CHARACTER_SCALE = 0.4;
const ANKLE_LOCAL_Y = -3.55;
const PLAYER_Y = 4.1 * CHARACTER_SCALE;
const MOVE_SPEED = 4.6;
const NPC_SPEED = 1.55;
const TURN_SPEED = 2.8;
const CAMERA_DISTANCE = 3.7;
const CAMERA_HEIGHT = 1.96;
const CAMERA_LOOK_Y = 0.9;
const PLAYER_RADIUS = 0.34;
const NPC_VIEW_DIST = 16;
const NPC_VIEW_DIST_SQ = NPC_VIEW_DIST * NPC_VIEW_DIST;
const NPC_NEAR_DIST_SQ = 8 * 8;

const HX = 44;
const HZ = 30;
const WALL = 0.32;
const FLOOR_H = 4.55;
const SLAB = 0.3;
const LEVELS = [0, FLOOR_H, FLOOR_H * 2];
const ATRIUM_HX = 14.4;
const ATRIUM_HZ = 10.4;
const SHOP_D = 2.15;
const ELEV_XS = [-2.25, 2.25];
const ELEV_Z = HZ - 1.15;
const ELEV_HALF = 0.92;
const ELEV_RIDE_SEC = 1.35;
const CABIN_H = FLOOR_H - 0.12;

const PLAYER_COLORS = { ...NIGHT_WALKER_HERO_COLORS, withHeadLamp: false };

const SKIN_TONES = [
  { skinColor: "#f3d5c0", jointColor: "#e3b39a" },
  { skinColor: "#ffc4b0", jointColor: "#e89888" },
  { skinColor: "#e8c4a0", jointColor: "#d0a078" },
  { skinColor: "#d4a574", jointColor: "#b88858" },
  { skinColor: "#c68642", jointColor: "#a86c32" },
  { skinColor: "#a86b3c", jointColor: "#8a552c" },
  { skinColor: "#8d5524", jointColor: "#6e4018" },
  { skinColor: "#6b3b1f", jointColor: "#4e2a14" },
  { skinColor: "#4a2c18", jointColor: "#321e10" },
  { skinColor: "#f0c8b0", jointColor: "#d9a890" },
  { skinColor: "#c4a882", jointColor: "#a88c68" },
  { skinColor: "#b07a4a", jointColor: "#8e5e38" },
];

const OUTFITS = [
  { clothColor: "#e53935", darkClothColor: "#8e1e1c" },
  { clothColor: "#1e88e5", darkClothColor: "#0d47a1" },
  { clothColor: "#43a047", darkClothColor: "#1b5e20" },
  { clothColor: "#fdd835", darkClothColor: "#5d4037" },
  { clothColor: "#8e24aa", darkClothColor: "#4a148c" },
  { clothColor: "#fb8c00", darkClothColor: "#e65100" },
  { clothColor: "#00acc1", darkClothColor: "#006064" },
  { clothColor: "#ec407a", darkClothColor: "#880e4f" },
  { clothColor: "#fafafa", darkClothColor: "#37474f" },
  { clothColor: "#212121", darkClothColor: "#111111" },
  { clothColor: "#6d4c41", darkClothColor: "#3e2723" },
  { clothColor: "#5c6bc0", darkClothColor: "#1a237e" },
  { clothColor: "#26a69a", darkClothColor: "#004d40" },
  { clothColor: "#7cb342", darkClothColor: "#33691e" },
  { clothColor: "#ef6c00", darkClothColor: "#bf360c" },
  { clothColor: "#ab47bc", darkClothColor: "#6a1b9a" },
  { clothColor: "#29b6f6", darkClothColor: "#01579b" },
  { clothColor: "#d4e157", darkClothColor: "#827717" },
];

const SHOP_COLORS = [
  "#c62828",
  "#1565c0",
  "#2e7d32",
  "#6a1b9a",
  "#ef6c00",
  "#00838f",
  "#ad1457",
  "#4527a0",
  "#558b2f",
  "#37474f",
  "#0277bd",
  "#d84315",
];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function addHumanoid(scene, colors, scale = CHARACTER_SCALE, npc = false) {
  const rig = createHumanoidRig({
    ...colors,
    withHeadLamp: false,
    lowPoly: npc,
    cheap: npc,
  });
  rig.group.scale.setScalar(scale);

  const leanPivot = new THREE.Group();
  leanPivot.position.y = ANKLE_LOCAL_Y * scale;
  rig.group.position.y = -ANKLE_LOCAL_Y * scale;
  leanPivot.add(rig.group);

  const outerGroup = new THREE.Group();
  outerGroup.rotation.order = "YXZ";
  outerGroup.add(leanPivot);
  scene.add(outerGroup);

  return {
    group: outerGroup,
    armRig: rig.armRig,
    legRig: rig.legRig,
    walkPhase: Math.random() * Math.PI * 2,
  };
}

function meshBox(w, h, d, color, extras = {}) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({
      color,
      emissive: extras.emissive ?? "#000000",
      emissiveIntensity: extras.emissiveIntensity ?? 0,
      transparent: extras.transparent ?? false,
      opacity: extras.opacity ?? 1,
      side: extras.side ?? THREE.FrontSide,
    })
  );
}

function place(scene, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);
  return mesh;
}

function aabb(minX, maxX, minZ, maxZ) {
  return { minX, maxX, minZ, maxZ };
}

function separateAabb(px, pz, r, box) {
  const cx = clamp(px, box.minX, box.maxX);
  const cz = clamp(pz, box.minZ, box.maxZ);
  let dx = px - cx;
  let dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return { px, pz };
  if (d2 < 1e-8) {
    const left = px - box.minX;
    const right = box.maxX - px;
    const down = pz - box.minZ;
    const up = box.maxZ - pz;
    const m = Math.min(left, right, down, up);
    if (m === left) return { px: box.minX - r, pz };
    if (m === right) return { px: box.maxX + r, pz };
    if (m === down) return { px, pz: box.minZ - r };
    return { px, pz: box.maxZ + r };
  }
  const d = Math.sqrt(d2);
  const k = (r - d) / d;
  return { px: px + dx * k, pz: pz + dz * k };
}

function inAtrium(px, pz, pad = 0) {
  return Math.abs(px) < ATRIUM_HX + pad && Math.abs(pz) < ATRIUM_HZ + pad;
}

function pushOutAtrium(px, pz, r) {
  const box = aabb(-ATRIUM_HX, ATRIUM_HX, -ATRIUM_HZ, ATRIUM_HZ);
  if (Math.abs(px) >= ATRIUM_HX + r || Math.abs(pz) >= ATRIUM_HZ + r) return { px, pz };
  return separateAabb(px, pz, r, box);
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material;
    if (!mats) return;
    const list = Array.isArray(mats) ? mats : [mats];
    for (const mat of list) {
      mat.map?.dispose?.();
      mat.dispose();
    }
  });
}

function addFloorPlate(scene, y, hole) {
  const tile = hole ? "#d2c7b6" : "#e8dcc8";
  if (!hole) {
    place(scene, meshBox(HX * 2, SLAB, HZ * 2, tile), 0, y - SLAB / 2, 0);
    const atriumRug = meshBox(ATRIUM_HX * 2, 0.04, ATRIUM_HZ * 2, "#c2a57a");
    place(scene, atriumRug, 0, y + 0.02, 0);
    const grid = new THREE.GridHelper(HX * 2, 32, "#b9a990", "#d7cbb8");
    grid.position.y = y + 0.03;
    scene.add(grid);
    return;
  }
  const leftW = HX - ATRIUM_HX;
  place(scene, meshBox(leftW, SLAB, HZ * 2, tile), -(HX + ATRIUM_HX) / 2, y - SLAB / 2, 0);
  place(scene, meshBox(leftW, SLAB, HZ * 2, tile), (HX + ATRIUM_HX) / 2, y - SLAB / 2, 0);
  const midW = ATRIUM_HX * 2;
  const stripD = HZ - ATRIUM_HZ;
  place(scene, meshBox(midW, SLAB, stripD, tile), 0, y - SLAB / 2, (ATRIUM_HZ + HZ) / 2);
  place(scene, meshBox(midW, SLAB, stripD, tile), 0, y - SLAB / 2, -(ATRIUM_HZ + HZ) / 2);
}

function addMall(scene) {
  const colliders = [];
  const wallH = FLOOR_H * 3 + 0.4;
  const wallY = wallH / 2;
  const wallCol = "#d7dce3";

  place(scene, meshBox(HX * 2 + WALL * 2, wallH, WALL, wallCol), 0, wallY, HZ + WALL / 2);
  place(scene, meshBox(HX * 2 + WALL * 2, wallH, WALL, wallCol), 0, wallY, -(HZ + WALL / 2));
  place(scene, meshBox(WALL, wallH, HZ * 2, wallCol), HX + WALL / 2, wallY, 0);
  place(scene, meshBox(WALL, wallH, HZ * 2, wallCol), -(HX + WALL / 2), wallY, 0);

  LEVELS.forEach((y, i) => {
    addFloorPlate(scene, y, i > 0);
    if (i > 0) {
      const railH = 0.95;
      const railY = y + railH / 2;
      const rail = "#9aa3ad";
      place(scene, meshBox(ATRIUM_HX * 2 + 0.12, railH, 0.08, rail), 0, railY, ATRIUM_HZ);
      place(scene, meshBox(ATRIUM_HX * 2 + 0.12, railH, 0.08, rail), 0, railY, -ATRIUM_HZ);
      place(scene, meshBox(0.08, railH, ATRIUM_HZ * 2, rail), ATRIUM_HX, railY, 0);
      place(scene, meshBox(0.08, railH, ATRIUM_HZ * 2, rail), -ATRIUM_HX, railY, 0);
      const trim = "#8d97a3";
      place(scene, meshBox(HX * 2, 0.14, 0.1, trim), 0, y + 0.05, HZ - 0.02);
      place(scene, meshBox(HX * 2, 0.14, 0.1, trim), 0, y + 0.05, -(HZ - 0.02));
      place(scene, meshBox(0.1, 0.14, HZ * 2, trim), HX - 0.02, y + 0.05, 0);
      place(scene, meshBox(0.1, 0.14, HZ * 2, trim), -(HX - 0.02), y + 0.05, 0);
    }
  });

  place(scene, meshBox(HX * 2 + WALL * 2, 0.22, HZ * 2 + WALL * 2, "#d8d0c4"), 0, FLOOR_H * 3 + 0.05, 0);
  const skylight = meshBox(ATRIUM_HX * 2 + 1.2, 0.08, ATRIUM_HZ * 2 + 1.2, "#cfe8ff", {
    emissive: "#b9d8ff",
    emissiveIntensity: 0.55,
    roughness: 0.3,
  });
  place(scene, skylight, 0, FLOOR_H * 3 + 0.18, 0);

  const shopSpecs = [];
  const shopAlong = 3.8;
  const pitch = 4.25;
  let colorI = 0;
  const nextColor = () => SHOP_COLORS[colorI++ % SHOP_COLORS.length];
  const zMin = -HZ + 2.1;
  const zMax = HZ - 4.8;
  for (let z = zMin; z <= zMax; z += pitch) {
    shopSpecs.push({ x: -(HX - SHOP_D / 2), z, w: SHOP_D, d: shopAlong, color: nextColor(), face: "west" });
    shopSpecs.push({ x: HX - SHOP_D / 2, z, w: SHOP_D, d: shopAlong, color: nextColor(), face: "east" });
  }
  const xMin = -HX + 2.3;
  const xMax = HX - 2.3;
  for (let x = xMin; x <= xMax; x += pitch) {
    shopSpecs.push({ x, z: -(HZ - SHOP_D / 2), w: shopAlong, d: SHOP_D, color: nextColor(), face: "south" });
  }
  const elevClear = 6.2;
  for (let x = xMin; x <= -elevClear; x += pitch) {
    shopSpecs.push({ x, z: HZ - SHOP_D / 2, w: shopAlong, d: SHOP_D, color: nextColor(), face: "north" });
  }
  for (let x = elevClear; x <= xMax; x += pitch) {
    shopSpecs.push({ x, z: HZ - SHOP_D / 2, w: shopAlong, d: SHOP_D, color: nextColor(), face: "north" });
  }

  for (const shop of shopSpecs) {
    LEVELS.forEach((y) => {
      const h = FLOOR_H - SLAB - 0.15;
      const body = meshBox(shop.w, h, shop.d, "#f4f0ea");
      place(scene, body, shop.x, y + h / 2, shop.z);
      const front = meshBox(
        shop.w * 0.86,
        h * 0.62,
        0.08,
        shop.color,
        { emissive: shop.color, emissiveIntensity: 0.18, roughness: 0.45 }
      );
      if (shop.face === "west" || shop.face === "east") {
        front.position.set(
          shop.face === "east" ? shop.x - shop.w / 2 - 0.04 : shop.x + shop.w / 2 + 0.04,
          y + h * 0.52,
          shop.z
        );
        front.rotation.y = Math.PI / 2;
      } else {
        const faceZ =
          shop.face === "north" ? shop.z - shop.d / 2 - 0.04 : shop.z + shop.d / 2 + 0.04;
        front.position.set(shop.x, y + h * 0.52, faceZ);
      }
      front.matrixAutoUpdate = false;
      front.updateMatrix();
      scene.add(front);
    });
    colliders.push(aabb(shop.x - shop.w / 2, shop.x + shop.w / 2, shop.z - shop.d / 2, shop.z + shop.d / 2));
  }

  return colliders;
}

function addElevators(scene) {
  const elevators = [];
  for (const x of ELEV_XS) {
    const shaftH = FLOOR_H * 3 + 0.2;
    const frame = meshBox(2.15, shaftH, 0.12, "#607080", { metalness: 0.35, roughness: 0.4 });
    place(scene, frame, x, shaftH / 2, ELEV_Z + ELEV_HALF + 0.06);
    place(scene, meshBox(0.12, shaftH, 2.05, "#607080", { metalness: 0.35, roughness: 0.4 }), x - ELEV_HALF - 0.08, shaftH / 2, ELEV_Z);
    place(scene, meshBox(0.12, shaftH, 2.05, "#607080", { metalness: 0.35, roughness: 0.4 }), x + ELEV_HALF + 0.08, shaftH / 2, ELEV_Z);

    const cabin = new THREE.Group();
    const floor = meshBox(1.7, 0.08, 1.7, "#c5d0dc", { metalness: 0.2 });
    floor.position.y = 0.04;
    cabin.add(floor);
    const back = meshBox(1.7, CABIN_H, 0.06, "#9eb4c8", {
      transparent: true,
      opacity: 0.45,
      roughness: 0.2,
      metalness: 0.15,
    });
    back.position.set(0, CABIN_H / 2, ELEV_HALF - 0.08);
    cabin.add(back);
    const left = meshBox(0.06, CABIN_H, 1.65, "#9eb4c8", { transparent: true, opacity: 0.4, roughness: 0.2 });
    left.position.set(-ELEV_HALF + 0.1, CABIN_H / 2, 0);
    cabin.add(left);
    const right = meshBox(0.06, CABIN_H, 1.65, "#9eb4c8", { transparent: true, opacity: 0.4, roughness: 0.2 });
    right.position.set(ELEV_HALF - 0.1, CABIN_H / 2, 0);
    cabin.add(right);
    const ceiling = meshBox(1.7, 0.06, 1.7, "#c5d0dc");
    ceiling.position.y = CABIN_H - 0.04;
    cabin.add(ceiling);
    const light = meshBox(0.42, 0.03, 0.42, "#f7f9fc", { emissive: "#dce6f2", emissiveIntensity: 0.22 });
    light.position.y = CABIN_H - 0.08;
    cabin.add(light);
    cabin.position.set(x, LEVELS[0], ELEV_Z);
    scene.add(cabin);

    LEVELS.forEach((y) => {
      place(
        scene,
        meshBox(1.9, 0.05, 1.4, "#4fc3f7", { emissive: "#4fc3f7", emissiveIntensity: 0.35 }),
        x,
        y + 0.04,
        ELEV_Z - 1.15
      );
    });

    elevators.push({
      x,
      z: ELEV_Z,
      floor: 0,
      moving: false,
      fromY: LEVELS[0],
      toY: LEVELS[0],
      t: 1,
      cabin,
    });
  }
  return elevators;
}

function loopPoints(inset) {
  const x = HX - SHOP_D - inset;
  const z = HZ - SHOP_D - inset * 0.8;
  return [
    { x: -x, z: -z },
    { x: x, z: -z },
    { x: x, z: Math.min(z * 0.42, HZ - 5) },
    { x: -x, z: Math.min(z * 0.42, HZ - 5) },
  ];
}

function atriumLoop() {
  const x = ATRIUM_HX + 2.2;
  const z = ATRIUM_HZ + 2.2;
  return [
    { x: -x, z: -z },
    { x: x, z: -z },
    { x: x, z: z },
    { x: -x, z: z },
  ];
}

function addNpcs(scene) {
  const npcs = [];
  const outer = loopPoints(1.5);
  const inner = atriumLoop();
  const crossPaths = [
    [
      { x: -HX * 0.55, z: ATRIUM_HZ + 1.1 },
      { x: HX * 0.55, z: ATRIUM_HZ + 1.1 },
    ],
    [
      { x: -HX * 0.55, z: -(ATRIUM_HZ + 1.1) },
      { x: HX * 0.55, z: -(ATRIUM_HZ + 1.1) },
    ],
    [
      { x: ATRIUM_HX + 1.6, z: -HZ * 0.5 },
      { x: ATRIUM_HX + 1.6, z: HZ * 0.35 },
    ],
    [
      { x: -(ATRIUM_HX + 1.6), z: -HZ * 0.5 },
      { x: -(ATRIUM_HX + 1.6), z: HZ * 0.35 },
    ],
  ];
  let n = 0;

  const spawnWalker = (floor, waypoints, start, reverse, speedScale) => {
    const skin = SKIN_TONES[n % SKIN_TONES.length];
    const outfit = OUTFITS[(n * 5 + floor) % OUTFITS.length];
    const scale = CHARACTER_SCALE * (0.92 + ((n * 17) % 9) * 0.012);
    const npc = addHumanoid(scene, { ...skin, ...outfit }, scale, true);
    const pts = reverse ? [...waypoints].reverse() : waypoints;
    const idx = start % pts.length;
    const pos = pts[idx];
    npc.group.position.set(pos.x, LEVELS[floor] + PLAYER_Y * (scale / CHARACTER_SCALE), pos.z);
    const next = pts[(idx + 1) % pts.length];
    npc.group.rotation.y = Math.atan2(next.x - pos.x, next.z - pos.z);
    npcs.push({
      ...npc,
      floor,
      waypoints: pts,
      wp: idx,
      speed: NPC_SPEED * speedScale,
      idle: false,
      scale,
    });
    n += 1;
  };

  for (let floor = 0; floor < LEVELS.length; floor += 1) {
    for (let i = 0; i < 6; i += 1) {
      spawnWalker(floor, outer, i * 3 + floor, i % 2 === 1, 0.75 + (i % 8) * 0.05);
    }
    for (let i = 0; i < 6; i += 1) {
      spawnWalker(floor, inner, i * 2 + floor, i % 2 === 0, 0.8 + (i % 7) * 0.04);
    }
    for (let c = 0; c < crossPaths.length; c += 1) {
      const waypoints =
        floor === 0 && c === 0
          ? [
              { x: -HX * 0.5, z: 0.4 },
              { x: HX * 0.5, z: 0.4 },
            ]
          : crossPaths[c];
      spawnWalker(floor, waypoints, floor % waypoints.length, c % 2 === 1, 0.85 + c * 0.08);
    }
    for (let idleI = 0; idleI < 2; idleI += 1) {
      const idleSkin = SKIN_TONES[(floor * 4 + idleI * 3 + 2) % SKIN_TONES.length];
      const idleOutfit = OUTFITS[(floor * 7 + idleI * 5 + 4) % OUTFITS.length];
      const idle = addHumanoid(scene, { ...idleSkin, ...idleOutfit }, CHARACTER_SCALE, true);
      const ix = idleI === 0 ? -(HX - SHOP_D - 1.8) : HX - SHOP_D - 1.8;
      const iz = floor === 2 ? -8.5 : 6.2 + idleI * 4;
      idle.group.position.set(ix, LEVELS[floor] + PLAYER_Y, iz);
      idle.group.rotation.y = ix > 0 ? -Math.PI / 2 : Math.PI / 2;
      npcs.push({
        ...idle,
        floor,
        waypoints: [],
        wp: 0,
        speed: 0,
        idle: true,
        scale: CHARACTER_SCALE,
      });
      n += 1;
    }
  }
  return npcs;
}

export default function SandpitEscapes() {
  const mountRef = useRef(null);
  const [hud, setHud] = useState({ floor: 1, elevator: false });
  const [flashImage, setFlashImage] = useState(false);

  useEffect(() => {
    let hideId = 0;
    const intervalId = window.setInterval(() => {
      setFlashImage(true);
      hideId = window.setTimeout(() => setFlashImage(false), 100);
    }, 10000);
    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(hideId);
    };
  }, []);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    let rafId = 0;
    const keys = new Set();
    let elevatorKey = "";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#b7c0cc");
    scene.fog = new THREE.Fog("#b7c0cc", 10, 18);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    mountEl.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(62, mountEl.clientWidth / mountEl.clientHeight, 0.1, 28);

    scene.add(new THREE.HemisphereLight(0xfff3e0, 0x8a8178, 1.05));
    const sun = new THREE.DirectionalLight(0xfff6e8, 0.72);
    sun.position.set(18, 28, 12);
    scene.add(sun);
    LEVELS.forEach((y) => {
      const lamp = new THREE.PointLight(0xfff2d0, 0.55, 28, 1.8);
      lamp.position.set(0, y + 3.4, 0);
      scene.add(lamp);
    });

    const colliders = addMall(scene);
    const elevators = addElevators(scene);
    const player = addHumanoid(scene, PLAYER_COLORS);
    player.group.position.set(0, PLAYER_Y, 1.1);
    player.group.rotation.y = 0;
    player.floor = 0;
    player.riding = null;
    const npcs = addNpcs(scene);

    const clock = new THREE.Clock();
    const cameraOffset = new THREE.Vector3(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
    const rotatedCameraOffset = new THREE.Vector3();
    const cameraQuat = new THREE.Quaternion();
    const camPos = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4();
    const npcSphere = new THREE.Sphere();
    let lastHud = "";
    let camReady = false;

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (
        k === "arrowup" ||
        k === "arrowdown" ||
        k === "arrowleft" ||
        k === "arrowright" ||
        k === "w" ||
        k === "a" ||
        k === "s" ||
        k === "d" ||
        k === "e" ||
        k === "q"
      ) {
        e.preventDefault();
      }
      if ((k === "e" || k === "q") && !e.repeat) elevatorKey = k;
      keys.add(k);
    };
    const onKeyUp = (e) => keys.delete(e.key.toLowerCase());

    const resize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    function resolveWalk(px, pz, floor) {
      px = clamp(px, -HX + PLAYER_RADIUS + 0.12, HX - PLAYER_RADIUS - 0.12);
      pz = clamp(pz, -HZ + PLAYER_RADIUS + 0.12, HZ - PLAYER_RADIUS - 0.12);
      for (const box of colliders) {
        const next = separateAabb(px, pz, PLAYER_RADIUS, box);
        px = next.px;
        pz = next.pz;
      }
      if (floor > 0) {
        const next = pushOutAtrium(px, pz, PLAYER_RADIUS + 0.12);
        px = next.px;
        pz = next.pz;
      }
      for (const el of elevators) {
        const inShaft = Math.abs(px - el.x) < ELEV_HALF + 0.12 && Math.abs(pz - el.z) < ELEV_HALF + 0.12;
        if (!inShaft) continue;
        const open = !el.moving && el.floor === floor;
        if (open) continue;
        const pushed = separateAabb(
          px,
          pz,
          PLAYER_RADIUS,
          aabb(el.x - ELEV_HALF, el.x + ELEV_HALF, el.z - ELEV_HALF, el.z + ELEV_HALF)
        );
        px = pushed.px;
        pz = pushed.pz;
      }
      return { px, pz };
    }

    function cabinAt(px, pz, floor) {
      let best = null;
      let bestD = 3.1;
      for (const el of elevators) {
        if (el.moving || el.floor !== floor) continue;
        const d = Math.hypot(px - el.x, pz - (el.z - 0.35));
        if (d < bestD) {
          best = el;
          bestD = d;
        }
      }
      return best;
    }

    function startRide(el, dir) {
      const nextFloor = clamp(el.floor + dir, 0, LEVELS.length - 1);
      if (nextFloor === el.floor) return;
      el.moving = true;
      el.fromY = LEVELS[el.floor];
      el.toY = LEVELS[nextFloor];
      el.t = 0;
      el.floor = nextFloor;
    }

    const tick = () => {
      rafId = window.requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.033);
      const body = player.group;

      for (const el of elevators) {
        if (!el.moving) continue;
        el.t = Math.min(1, el.t + dt / ELEV_RIDE_SEC);
        const ease = el.t * el.t * (3 - 2 * el.t);
        const y = el.fromY + (el.toY - el.fromY) * ease;
        el.cabin.position.y = y;
        if (player.riding === el) body.position.y = y + PLAYER_Y;
        if (el.t >= 1) {
          el.moving = false;
          el.cabin.position.y = el.toY;
          if (player.riding === el) {
            player.floor = el.floor;
            body.position.y = LEVELS[el.floor] + PLAYER_Y;
            player.riding = null;
          }
        }
      }

      const inCabin = player.riding || cabinAt(body.position.x, body.position.z, player.floor);

      if (elevatorKey && inCabin && !(player.riding && player.riding.moving)) {
        const el = player.riding || inCabin;
        const dir = elevatorKey === "e" ? 1 : -1;
        const nextFloor = clamp(el.floor + dir, 0, LEVELS.length - 1);
        if (nextFloor !== el.floor) {
          player.riding = el;
          body.position.x = el.x;
          body.position.z = el.z;
          startRide(el, dir);
        }
      }
      elevatorKey = "";

      if (!(player.riding && player.riding.moving)) {
        const turnInput =
          (keys.has("arrowleft") || keys.has("a") ? 1 : 0) +
          (keys.has("arrowright") || keys.has("d") ? -1 : 0);
        const moveInput =
          (keys.has("arrowup") || keys.has("w") ? 1 : 0) +
          (keys.has("arrowdown") || keys.has("s") ? -1 : 0);
        if (turnInput !== 0) body.rotation.y += turnInput * TURN_SPEED * dt;
        if (moveInput !== 0) {
          let nx = body.position.x + Math.sin(body.rotation.y) * moveInput * MOVE_SPEED * dt;
          let nz = body.position.z + Math.cos(body.rotation.y) * moveInput * MOVE_SPEED * dt;
          const next = resolveWalk(nx, nz, player.floor);
          body.position.x = next.px;
          body.position.z = next.pz;
          player.walkPhase += dt * 9.5;
          applyWalkCycle(player.armRig, player.legRig, player.walkPhase);
        } else {
          resetPose(player.armRig, player.legRig);
        }
        if (!player.riding) body.position.y = LEVELS[player.floor] + PLAYER_Y;
      } else {
        resetPose(player.armRig, player.legRig);
        body.position.x = player.riding.x;
        body.position.z = player.riding.z;
      }

      const camY = body.position.y;
      cameraQuat.setFromAxisAngle(up, body.rotation.y);
      rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
      camPos.set(body.position.x, camY, body.position.z).add(rotatedCameraOffset);
      camPos.x = clamp(camPos.x, -HX + 0.7, HX - 0.7);
      camPos.z = clamp(camPos.z, -HZ + SHOP_D + 0.7, HZ - 0.55);
      camPos.y = clamp(camPos.y, LEVELS[player.floor] + 1.55, LEVELS[player.floor] + FLOOR_H - 0.55);
      lookAt.set(body.position.x, camY + CAMERA_LOOK_Y, body.position.z);
      if (!camReady) {
        camera.position.copy(camPos);
        camReady = true;
      } else {
        camera.position.lerp(camPos, 0.14);
      }
      camera.lookAt(lookAt);
      camera.updateMatrixWorld();
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);

      const camX = camera.position.x;
      const camZ = camera.position.z;
      const camEyeY = camera.position.y;

      for (const npc of npcs) {
        const dxCam = npc.group.position.x - camX;
        const dyCam = npc.group.position.y - camEyeY;
        const dzCam = npc.group.position.z - camZ;
        const distSq = dxCam * dxCam + dyCam * dyCam + dzCam * dzCam;
        npcSphere.center.set(npc.group.position.x, npc.group.position.y + 0.7, npc.group.position.z);
        npcSphere.radius = 1.6;
        const inView = distSq < NPC_NEAR_DIST_SQ || frustum.intersectsSphere(npcSphere);
        const show = inView && distSq < NPC_VIEW_DIST_SQ;
        npc.group.visible = show;

        if (npc.idle || npc.waypoints.length === 0) {
          if (show) resetPose(npc.armRig, npc.legRig);
          continue;
        }
        const target = npc.waypoints[npc.wp];
        const dx = target.x - npc.group.position.x;
        const dz = target.z - npc.group.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.18) {
          npc.wp = (npc.wp + 1) % npc.waypoints.length;
        } else {
          const step = Math.min(dist, npc.speed * dt);
          npc.group.position.x += (dx / dist) * step;
          npc.group.position.z += (dz / dist) * step;
          npc.group.rotation.y = Math.atan2(dx, dz);
          if (show) {
            npc.walkPhase += dt * 8.2;
            applyWalkCycle(npc.armRig, npc.legRig, npc.walkPhase);
          }
        }
      }

      const footY = body.position.y - PLAYER_Y;
      let shownFloor = 0;
      for (let i = 1; i < LEVELS.length; i += 1) {
        if (Math.abs(footY - LEVELS[i]) < Math.abs(footY - LEVELS[shownFloor])) shownFloor = i;
      }
      const hudKey = `${shownFloor}|${Boolean(inCabin)}`;
      if (hudKey !== lastHud) {
        lastHud = hudKey;
        setHud({ floor: shownFloor + 1, elevator: Boolean(inCabin) });
      }

      renderer.render(scene, camera);
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", resize);
    tick();

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={mountRef}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: "#b7c0cc",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          zIndex: 2,
          color: "rgba(20, 24, 32, 0.9)",
          fontSize: "0.78rem",
          background: "rgba(255,255,255,0.72)",
          borderRadius: 8,
          padding: "6px 10px",
          pointerEvents: "none",
        }}
      >
        Level {hud.floor}
        {hud.elevator ? " · E up · Q down" : ""}
      </div>
      {flashImage ? (
        <img
          src={bdFlashImage}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 30,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </>
  );
}
