import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

const SECRET_MAP_KEY = "sgf-secret-game-map-v1";
const MAP_GRID = 30;
// One editor cell = one logical tile. 3D playfield: 5× the original 200m edge.
const MAP_WORLD_SIZE = 200 * 5;
const MAP_3D_SCALE = MAP_WORLD_SIZE / 200; // 5, vs legacy 200m; use for camera, moves, scene scale
const EDITOR_CELL_PX = 18;
const CELL_TYPES = new Set(["grass", "road", "footpath", "building", "water"]);

/** 1×1 road cell center lines: same rules in map editor and 3D. */
function getRoadCellLineMode(cells, r, c) {
  if (cells[r][c] !== "road") return null;
  const w = c > 0 && cells[r][c - 1] === "road";
  const e2 = c < MAP_GRID - 1 && cells[r][c + 1] === "road";
  const n = r > 0 && cells[r - 1][c] === "road";
  const s = r < MAP_GRID - 1 && cells[r + 1][c] === "road";
  const throughX = w && e2;
  const throughZ = n && s;
  if (throughX && !throughZ) return "ew";
  if (throughZ && !throughX) return "ns";
  if (throughX && throughZ) return "stop";
  if (w || e2) return "ew";
  if (n || s) return "ns";
  return "ew";
}

function makeDefaultMap() {
  return Array.from({ length: MAP_GRID }, () => Array.from({ length: MAP_GRID }, () => "grass"));
}

function loadMapFromStorage() {
  try {
    const raw = localStorage.getItem(SECRET_MAP_KEY);
    if (!raw) return makeDefaultMap();
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length !== MAP_GRID) return makeDefaultMap();
    return data.map((row) => {
      if (!Array.isArray(row) || row.length !== MAP_GRID) {
        return Array.from({ length: MAP_GRID }, () => "grass");
      }
      return row.map((cell) => (CELL_TYPES.has(cell) ? cell : "grass"));
    });
  } catch {
    return makeDefaultMap();
  }
}

/** Starting pack size; each wave cleared with the chainsaw adds 10 more. */
const GANG_COUNT = 20;
const GANG_WAVE_SIZE_STEP = 10;
const GANG_ALERT_GRID_CHEBYSHEV = 5;
const PI2 = Math.PI * 2;

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function randomNpcColors() {
  const skinL = 0.48 + Math.random() * 0.22;
  const skinS = 0.22 + Math.random() * 0.32;
  const skinH = 15 + Math.random() * 38;
  const clothH = Math.random() * 360;
  const darkH = (clothH + 25 + Math.random() * 40) % 360;
  return {
    skin: hslToHex(skinH, skinS, skinL),
    cloth: hslToHex(clothH, 0.55 + Math.random() * 0.35, 0.38 + Math.random() * 0.18),
    darkCloth: hslToHex(darkH, 0.45 + Math.random() * 0.35, 0.18 + Math.random() * 0.12),
    joint: hslToHex(skinH + 8, skinS * 0.7, skinL - 0.08),
  };
}

function worldXZToGrid(x, z, MAP_HALF, CELL) {
  const c = Math.floor((x + MAP_HALF) / CELL);
  const r = Math.floor((MAP_HALF - z) / CELL);
  return {
    r: Math.max(0, Math.min(MAP_GRID - 1, r)),
    c: Math.max(0, Math.min(MAP_GRID - 1, c)),
  };
}

function gridChebyshev(r1, c1, r2, c2) {
  return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
}

function gridCellCenterWorld(r, c, MAP_HALF, CELL) {
  return {
    x: -MAP_HALF + (c + 0.5) * CELL,
    z: MAP_HALF - (r + 0.5) * CELL,
  };
}

function isNpcWalkableCell(kind) {
  return kind === "grass" || kind === "road" || kind === "footpath";
}

function pickRandomWalkableCell(cells, rng) {
  for (let k = 0; k < 1200; k += 1) {
    const r = Math.floor(rng() * MAP_GRID);
    const c = Math.floor(rng() * MAP_GRID);
    if (isNpcWalkableCell(cells[r][c])) return { r, c };
  }
  return { r: 5, c: 5 };
}

/**
 * Same rig as the playable character; optional head-lamp block for the hero only.
 * Each instance owns its own geometries and materials.
 */
function createHumanoidRig({ skinColor, clothColor, darkClothColor, jointColor, withHeadLamp }) {
  const group = new THREE.Group();
  const bodyMeshes = [];
  const materials = [];
  const regMat = (params) => {
    const m = new THREE.MeshStandardMaterial(params);
    materials.push(m);
    return m;
  };

  const skinMat = regMat({ color: skinColor, roughness: 0.78 });
  const clothMat = regMat({ color: clothColor, roughness: 0.7 });
  const darkClothMat = regMat({ color: darkClothColor, roughness: 0.72 });
  const jointMat = regMat({ color: jointColor, roughness: 0.82 });

  const addBodyMesh = (mesh, parent = group) => {
    bodyMeshes.push(mesh);
    parent.add(mesh);
    return mesh;
  };

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 3.1, 20), clothMat);
  torso.position.y = 1.55;
  addBodyMesh(torso);

  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.7, 20), darkClothMat);
  hips.position.y = -0.2;
  addBodyMesh(hips);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.55, 16), jointMat);
  neck.position.y = 3.35;
  addBodyMesh(neck);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.9, 20), skinMat);
  head.position.y = 4.03;
  addBodyMesh(head);
  const headTopOffsetY = head.position.y + 0.5;

  let headLampPivot = null;

  if (withHeadLamp) {
    const strapMat = regMat({ color: "#1a1e28", roughness: 0.85 });
    const headStrap = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 28, Math.PI * 1.15), strapMat);
    headStrap.rotation.x = Math.PI / 2;
    headStrap.position.set(0, 0.32, 0.02);
    addBodyMesh(headStrap, head);

    const lampHousingMat = regMat({ color: "#2a303c", metalness: 0.35, roughness: 0.45 });
    const lampLensMat = regMat({
      color: "#ffe9c8",
      emissive: "#ffaa66",
      emissiveIntensity: 0.85,
      roughness: 0.28,
      metalness: 0.08,
    });
    headLampPivot = new THREE.Group();
    headLampPivot.position.set(0.06, 0.38, 0.44);
    head.add(headLampPivot);
    const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.22, 16), lampHousingMat);
    lampHousing.rotation.x = Math.PI / 2;
    addBodyMesh(lampHousing, headLampPivot);
    const lampLens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), lampLensMat);
    lampLens.position.z = 0.12;
    addBodyMesh(lampLens, headLampPivot);
  }

  const armRig = { left: null, right: null };
  const legRig = { left: null, right: null };

  const buildArm = (side) => {
    const elbowX = 1.05 * side;
    const shoulderX = 0.78 * side;
    const elbowLocalX = elbowX - shoulderX;

    const armPivot = new THREE.Group();
    armPivot.position.set(shoulderX, 2.85, 0);
    group.add(armPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 16), clothMat), armPivot);
    const upperArm = addBodyMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 1.1, 14), clothMat),
      armPivot
    );
    upperArm.position.set(elbowLocalX * 0.5, -0.64, 0);
    upperArm.rotation.z = side * 0.22;

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(elbowLocalX, -1.29, 0);
    armPivot.add(forearmPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 14), clothMat), forearmPivot);
    addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 14), clothMat), forearmPivot).position.set(
      0,
      -0.61,
      0
    );
    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), jointMat), forearmPivot).position.set(0, -1.14, 0);

    const hand = addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 12), skinMat), forearmPivot);
    hand.position.set(0.06 * side, -1.39, 0.02);
    hand.rotation.z = Math.PI / 2;

    const rig = { side, armPivot, forearmPivot, upperArm, hand, baseHandX: hand.rotation.x };
    if (side > 0) armRig.right = rig;
    else armRig.left = rig;
  };

  const buildLeg = (side) => {
    const x = 0.5 * side;
    const legPivot = new THREE.Group();
    legPivot.position.set(x, -0.58, 0);
    group.add(legPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), darkClothMat), legPivot);

    addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 1.45, 14), darkClothMat), legPivot).position.set(
      0,
      -0.76,
      0
    );

    const lowerLegPivot = new THREE.Group();
    lowerLegPivot.position.set(0, -1.52, 0);
    legPivot.add(lowerLegPivot);

    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), darkClothMat), lowerLegPivot);
    addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.35, 14), darkClothMat), lowerLegPivot).position.set(
      0,
      -0.76,
      0
    );
    addBodyMesh(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), jointMat), lowerLegPivot).position.set(0, -1.45, 0.06);

    const foot = addBodyMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 14), darkClothMat), lowerLegPivot);
    foot.position.set(0, -1.7, 0.35);
    foot.rotation.x = Math.PI / 2;

    const rig = {
      side,
      legPivot,
      lowerLegPivot,
      upperLeg: null,
      foot,
      baseLegPivotX: legPivot.rotation.x,
      baseLowerPivotX: lowerLegPivot.rotation.x,
      baseFootX: foot.rotation.x,
    };
    if (side > 0) legRig.right = rig;
    else legRig.left = rig;
  };

  buildArm(1);
  buildArm(-1);
  buildLeg(1);
  buildLeg(-1);

  return {
    group,
    bodyMeshes,
    materials,
    armRig,
    legRig,
    head,
    headTopOffsetY,
    headLampPivot,
  };
}

/** Finds a walkable tile far from spawn and biased toward map edges — good for a hidden pickup. */
function pickHiddenChainsawCell(cells, playerGrid) {
  let best = { r: 4, c: MAP_GRID - 7 };
  let bestScore = -1;
  for (let r = 0; r < MAP_GRID; r += 1) {
    for (let c = 0; c < MAP_GRID; c += 1) {
      if (!isNpcWalkableCell(cells[r][c])) continue;
      const dPlayer = gridChebyshev(r, c, playerGrid.r, playerGrid.c);
      if (dPlayer < 11) continue;
      const edge = Math.min(r, c, MAP_GRID - 1 - r, MAP_GRID - 1 - c);
      const score = dPlayer + (8 - edge) * 3;
      if (score > bestScore) {
        bestScore = score;
        best = { r, c };
      }
    }
  }
  return best;
}

function gangPackScatterOffset(slotIndex, memberCount, packFormRadius) {
  const n = Math.max(1, memberCount);
  const ang = (slotIndex / n) * PI2;
  return { ox: Math.sin(ang) * packFormRadius, oz: Math.cos(ang) * packFormRadius };
}

/** Procedural chainsaw: `chainPivot.rotation.x` drives visible chain motion. */
function createChainsawVisual(materialsOut, geometriesOut) {
  const regMat = (params) => {
    const m = new THREE.MeshStandardMaterial(params);
    materialsOut.push(m);
    return m;
  };
  const regGeom = (geometry) => {
    geometriesOut.push(geometry);
    return geometry;
  };

  const group = new THREE.Group();

  const body = new THREE.Mesh(
    regGeom(new THREE.BoxGeometry(0.46, 0.5, 0.94)),
    regMat({ color: "#e25620", roughness: 0.52, metalness: 0.18 })
  );
  body.position.set(0, 0, -0.05);
  group.add(body);

  const tank = new THREE.Mesh(
    regGeom(new THREE.BoxGeometry(0.28, 0.22, 0.62)),
    regMat({ color: "#b83818", roughness: 0.55, metalness: 0.1 })
  );
  tank.position.set(0, 0.32, -0.2);
  group.add(tank);

  const handleTop = new THREE.Mesh(
    regGeom(new THREE.CylinderGeometry(0.09, 0.11, 0.62, 12)),
    regMat({ color: "#242428", roughness: 0.78 })
  );
  handleTop.rotation.x = Math.PI / 2;
  handleTop.position.set(0, 0.28, -0.66);
  group.add(handleTop);

  const rearGrip = new THREE.Mesh(
    regGeom(new THREE.TorusGeometry(0.17, 0.052, 10, 22, Math.PI * 1.05)),
    regMat({ color: "#35353c", roughness: 0.72 })
  );
  rearGrip.rotation.set(Math.PI * 0.48, Math.PI / 2, 0);
  rearGrip.position.set(0, -0.14, -0.86);
  group.add(rearGrip);

  const bar = new THREE.Mesh(
    regGeom(new THREE.BoxGeometry(0.12, 0.12, 2.08)),
    regMat({ color: "#717178", metalness: 0.52, roughness: 0.32 })
  );
  bar.position.set(0, 0.1, 1.14);
  group.add(bar);

  const chainPivot = new THREE.Group();
  chainPivot.position.set(0, 0.1, 1.14);
  group.add(chainPivot);

  const chainMat = regMat({ color: "#161616", roughness: 0.35, metalness: 0.55 });
  const loop = new THREE.Mesh(
    regGeom(new THREE.TorusGeometry(0.12, 0.028, 8, 40, Math.PI * 2)),
    chainMat
  );
  loop.rotation.x = Math.PI / 2;
  chainPivot.add(loop);

  const guide = new THREE.Mesh(
    regGeom(new THREE.BoxGeometry(0.16, 0.05, 1.95)),
    regMat({ color: "#585860", roughness: 0.42, metalness: 0.4 })
  );
  guide.position.z = -0.04;
  chainPivot.add(guide);

  const tip = new THREE.Mesh(
    regGeom(new THREE.CylinderGeometry(0.065, 0.05, 0.09, 8)),
    regMat({ color: "#696970", roughness: 0.35, metalness: 0.55 })
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0, 2.12);
  group.add(tip);

  return { group, chainPivot };
}

export default function NightWalkerGame({ embedded = false }) {
  const mountRef = useRef(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [gangCaughtOverlay, setGangCaughtOverlay] = useState(false);
  const [paintValue, setPaintValue] = useState("grass"); // "grass" | "road" | "footpath" | "building" | "water"
  const initialMapRef = useRef(null);
  if (initialMapRef.current == null) {
    initialMapRef.current = loadMapFromStorage();
  }
  const [designerGrid, setDesignerGrid] = useState(() => initialMapRef.current);
  const [worldMap, setWorldMap] = useState(() => initialMapRef.current);
  const isPaintDraggingRef = useRef(false);

  useEffect(() => {
    const endDrag = () => {
      isPaintDraggingRef.current = false;
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SECRET_MAP_KEY, JSON.stringify(designerGrid));
    } catch {
      // ignore quota / private mode
    }
  }, [designerGrid]);

  useEffect(() => {
    const t = setTimeout(() => {
      setWorldMap((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(designerGrid)) return prev;
        return designerGrid.map((row) => [...row]);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [designerGrid]);

  const paintCell = (rowIdx, colIdx) => {
    setDesignerGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[rowIdx][colIdx] = paintValue;
      return next;
    });
  };

  const clearDesigner = () => {
    setDesignerGrid(makeDefaultMap());
  };

  const editorRoadMidlines = useMemo(() => {
    const out = [];
    for (let r = 0; r < MAP_GRID; r += 1) {
      for (let c = 0; c < MAP_GRID; c += 1) {
        const mode = getRoadCellLineMode(designerGrid, r, c);
        if (mode) out.push({ r, c, mode });
      }
    }
    return out;
  }, [designerGrid]);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return undefined;

    setGangCaughtOverlay(false);

    const scene = new THREE.Scene();
    const nightSky = new THREE.Color("#061127");
    scene.background = nightSky;
    scene.fog = new THREE.Fog("#0a1830", 90 * MAP_3D_SCALE, 280 * MAP_3D_SCALE);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    mountEl.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(60, mountEl.clientWidth / mountEl.clientHeight, 0.1, 500 * MAP_3D_SCALE);
    camera.position.set(0, 8 * MAP_3D_SCALE, 14 * MAP_3D_SCALE);
    camera.lookAt(0, 2, 0);

    const hemi = new THREE.HemisphereLight(0x8bb6ff, 0x102030, 0.42);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0x9ab8ff, 0.52);
    dir.position.set(26 * MAP_3D_SCALE, 34 * MAP_3D_SCALE, 12 * MAP_3D_SCALE);
    scene.add(dir);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6, 24, 20),
      new THREE.MeshStandardMaterial({
        color: "#d9e6ff",
        emissive: "#6a86c9",
        emissiveIntensity: 0.35,
        roughness: 0.8,
        metalness: 0.02,
      })
    );
    moon.position.set(-160 * MAP_3D_SCALE, 115 * MAP_3D_SCALE, -210 * MAP_3D_SCALE);
    scene.add(moon);

    const starCount = 1400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = (360 + Math.random() * 240) * MAP_3D_SCALE;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.52;
      const x = radius * Math.cos(theta) * Math.cos(phi);
      const y = 120 + radius * Math.sin(phi);
      const z = radius * Math.sin(theta) * Math.cos(phi);
      const idx = i * 3;
      starPos[idx] = x;
      starPos[idx + 1] = y;
      starPos[idx + 2] = z;
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: "#f4f8ff",
      size: 1.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
    });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);

    // 30×30 designer cells; terrain is MAP_WORLD_SIZE meters (5× legacy 200 m).
    const MAP_SIZE = MAP_WORLD_SIZE;
    const MAP_HALF = MAP_SIZE * 0.5;
    const CELL = MAP_SIZE / MAP_GRID;
    const cells = worldMap;
    const staticWorld = [];
    const addStatic = (mesh) => {
      staticWorld.push(mesh);
      scene.add(mesh);
      return mesh;
    };
    const grassA = new THREE.MeshStandardMaterial({ color: "#3a6b35", roughness: 0.95, metalness: 0.04 });
    const grassB = new THREE.MeshStandardMaterial({ color: "#4d8c45", roughness: 0.95, metalness: 0.04 });
    const roadMat = new THREE.MeshStandardMaterial({ color: "#2f3337", roughness: 0.95 });
    const roadLineMat = new THREE.MeshStandardMaterial({
      color: "#f5f5f2",
      emissive: "#e8e8e0",
      emissiveIntensity: 0.12,
      roughness: 0.42,
    });
    const pathMat = new THREE.MeshStandardMaterial({ color: "#6e737c", roughness: 0.9 });
    const earthBankMat = new THREE.MeshStandardMaterial({ color: "#5c4330", roughness: 0.97, metalness: 0.02 });
    const earthUndersideMat = new THREE.MeshStandardMaterial({ color: "#3f2f24", roughness: 0.98, metalness: 0.02 });
    const grassSideMat = new THREE.MeshStandardMaterial({ color: "#3d5f34", roughness: 0.93, metalness: 0.04 });
    const roadSideMat = new THREE.MeshStandardMaterial({ color: "#2b2f34", roughness: 0.94, metalness: 0.04 });
    const pathSideMat = new THREE.MeshStandardMaterial({ color: "#555a63", roughness: 0.91, metalness: 0.03 });
    const buildingMats = [
      new THREE.MeshStandardMaterial({ color: "#8f9bad", roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: "#a89b8c", roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: "#7f8b7d", roughness: 0.84 }),
      new THREE.MeshStandardMaterial({ color: "#9a8b99", roughness: 0.86 }),
    ];
    const lampLights = [];
    const tileH = Math.max(0.12, CELL * 0.012);
    const WATER_BELOW_GRASS_M = 0.5;
    const waterMat = new THREE.MeshStandardMaterial({
      color: "#2f9fd8",
      metalness: 0.1,
      roughness: 0.12,
      transparent: true,
      opacity: 0.62,
      emissive: "#0a4666",
      emissiveIntensity: 0.2,
      depthWrite: false,
    });

    const neighborKindAt = (nr, nc) =>
      nr < 0 || nr >= MAP_GRID || nc < 0 || nc >= MAP_GRID ? "__edge__" : cells[nr][nc];

    /** Box materials: order is +x, -x, +y, -y, +z, -z (Three.js). */
    const buildTerrainTileMats = (kind, topMat, r, c) => {
      const nk = neighborKindAt;
      const lateralForNeighbor = (nrow, ncol) => {
        const n = nk(nrow, ncol);
        if (n === "water" || n === "__edge__") return earthBankMat;
        if (kind === "road") return roadSideMat;
        if (kind === "footpath") return pathSideMat;
        return grassSideMat;
      };
      return [
        lateralForNeighbor(r, c + 1),
        lateralForNeighbor(r, c - 1),
        topMat,
        earthUndersideMat,
        lateralForNeighbor(r - 1, c),
        lateralForNeighbor(r + 1, c),
      ];
    };

    const terrainBoxGeom = new THREE.BoxGeometry(CELL, tileH, CELL);

    for (let r = 0; r < MAP_GRID; r += 1) {
      for (let c = 0; c < MAP_GRID; c += 1) {
        const kind = cells[r][c];
        const x = -MAP_HALF + (c + 0.5) * CELL;
        const z = MAP_HALF - (r + 0.5) * CELL;
        if (kind === "building") {
          const h = MAP_3D_SCALE * (8 + ((r * 19 + c * 31) % 18));
          const w = CELL * 0.88;
          const b = addStatic(
            new THREE.Mesh(
              new THREE.BoxGeometry(w, h, w),
              buildingMats[(r * MAP_GRID + c) % buildingMats.length]
            )
          );
          b.position.set(x, h * 0.5, z);
        } else if (kind === "water") {
          const tile = addStatic(new THREE.Mesh(terrainBoxGeom, waterMat));
          tile.position.set(x, tileH * 0.5 - WATER_BELOW_GRASS_M, z);
        } else {
          const topMat =
            kind === "road"
              ? roadMat
              : kind === "footpath"
                ? pathMat
                : (r + c) % 2 === 0
                  ? grassA
                  : grassB;
          const mats = buildTerrainTileMats(kind, topMat, r, c);
          const tile = addStatic(new THREE.Mesh(terrainBoxGeom, mats));
          tile.position.set(x, tileH * 0.5, z);
        }
      }
    }

    // White center lines on 1×1 road cells (map editor: one cell; 3D: one cell = CELL wide).
    const lineH2 = Math.max(0.05, CELL * 0.0015);
    const lineT = Math.max(0.34, CELL * 0.0108);
    const yLine = tileH + lineH2 * 0.5;
    const lineAlong = CELL * 0.52;
    for (let rr = 0; rr < MAP_GRID; rr += 1) {
      for (let cc = 0; cc < MAP_GRID; cc += 1) {
        const mode = getRoadCellLineMode(cells, rr, cc);
        if (!mode) continue;
        const xMid = -MAP_HALF + (cc + 0.5) * CELL;
        const zMid = MAP_HALF - (rr + 0.5) * CELL;
        const lineL = lineAlong;
        if (mode === "ew") {
          const m = new THREE.Mesh(new THREE.BoxGeometry(lineL, lineH2, lineT), roadLineMat);
          m.position.set(xMid, yLine, zMid);
          addStatic(m);
        }
        if (mode === "ns") {
          const m = new THREE.Mesh(new THREE.BoxGeometry(lineT, lineH2, lineL), roadLineMat);
          m.position.set(xMid, yLine, zMid);
          addStatic(m);
        }
        if (mode === "stop") {
          const stopW = CELL * 0.42;
          const stopZ = lineT * 1.65;
          const m = new THREE.Mesh(new THREE.BoxGeometry(stopW, lineH2, stopZ), roadLineMat);
          m.position.set(xMid - CELL * 0.5 + stopW * 0.5, yLine, zMid - lineT * 0.72);
          addStatic(m);
        }
      }
    }

    const heroRig = createHumanoidRig({
      skinColor: "#e7be92",
      clothColor: "#4f6bff",
      darkClothColor: "#2f3e7a",
      jointColor: "#d9ab80",
      withHeadLamp: true,
    });
    const player = heroRig.group;
    const bodyMeshes = heroRig.bodyMeshes;
    const armRig = heroRig.armRig;
    const legRig = heroRig.legRig;
    const headTopOffsetY = heroRig.headTopOffsetY;
    const headLampPivot = heroRig.headLampPivot;
    player.position.set(0, 4.1, 0);
    scene.add(player);

    const playerStartGrid = worldXZToGrid(player.position.x, player.position.z, MAP_HALF, CELL);

    const PACK_FORM_RADIUS = 2.05 * MAP_3D_SCALE;

    /** @type {{ rig: ReturnType<typeof createHumanoidRig>, walkPhase: number, slot: number, aggressive: boolean, knockedDown: boolean, fallPhase: number, fallFaceY: number, fallTiltZ: number }[]} */
    const gangMembers = [];
    let gangPackTargetX = 0;
    let gangPackTargetZ = 0;
    let gangPackRetargetT = 5 + Math.random() * 6;

    const pickPackAnchorFarFromGrid = (refGrid) => {
      let cell = pickRandomWalkableCell(cells, Math.random);
      for (let tt = 0; tt < 140; tt += 1) {
        if (
          gridChebyshev(cell.r, cell.c, refGrid.r, refGrid.c) >
          Math.max(GANG_ALERT_GRID_CHEBYSHEV + 3, 8)
        ) {
          return cell;
        }
        cell = pickRandomWalkableCell(cells, Math.random);
      }
      return cell;
    };

    const spawnGangOfSize = (count, anchorRefGrid) => {
      const anchorCell = pickPackAnchorFarFromGrid(anchorRefGrid);
      const anch = gridCellCenterWorld(anchorCell.r, anchorCell.c, MAP_HALF, CELL);
      gangPackTargetX = anch.x;
      gangPackTargetZ = anch.z;
      gangPackRetargetT = 5 + Math.random() * 6;
      const packFwd = Math.random() * PI2;
      const denom = Math.max(count, 1);
      for (let gi = 0; gi < count; gi += 1) {
        const { ox, oz } = gangPackScatterOffset(gi, denom, PACK_FORM_RADIUS);
        const palette = randomNpcColors();
        const npcRig = createHumanoidRig({
          skinColor: palette.skin,
          clothColor: palette.cloth,
          darkClothColor: palette.darkCloth,
          jointColor: palette.joint,
          withHeadLamp: false,
        });
        npcRig.group.position.set(gangPackTargetX + ox, 4.1, gangPackTargetZ + oz);
        npcRig.group.rotation.y = packFwd + (Math.random() - 0.5) * 0.35;
        scene.add(npcRig.group);
        gangMembers.push({
          rig: npcRig,
          walkPhase: Math.random() * PI2,
          slot: gi,
          aggressive: false,
          knockedDown: false,
          fallPhase: 0,
          fallFaceY: 0,
          fallTiltZ: 0,
        });
      }
    };

    spawnGangOfSize(GANG_COUNT, playerStartGrid);

    // Head lamp: spotlight to ground + soft 10 m radius pool (map world units ≈ meters).
    const HEAD_LAMP_GROUND_RADIUS = 10;
    const headLampGroundY = tileH + 0.04;
    const headLampTarget = new THREE.Object3D();
    scene.add(headLampTarget);
    const headLampSpot = new THREE.SpotLight(0xfff0dd, 4.6, 260, 1.12, 0.78, 1.4);
    headLampSpot.position.set(0, 0, 0);
    headLampSpot.target = headLampTarget;
    headLampPivot.add(headLampSpot);

    const spotCanvas = document.createElement("canvas");
    spotCanvas.width = 256;
    spotCanvas.height = 256;
    const sctx = spotCanvas.getContext("2d");
    const rg = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, "rgba(255, 248, 228, 0.5)");
    rg.addColorStop(0.52, "rgba(255, 236, 200, 0.2)");
    rg.addColorStop(0.82, "rgba(255, 228, 185, 0.06)");
    rg.addColorStop(1, "rgba(255, 220, 175, 0)");
    sctx.fillStyle = rg;
    sctx.fillRect(0, 0, 256, 256);
    const headLampGroundTex = new THREE.CanvasTexture(spotCanvas);
    headLampGroundTex.colorSpace = THREE.SRGBColorSpace;

    const groundSpotMat = new THREE.MeshBasicMaterial({
      map: headLampGroundTex,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const headLampGroundDecal = new THREE.Mesh(new THREE.CircleGeometry(HEAD_LAMP_GROUND_RADIUS, 64), groundSpotMat);
    headLampGroundDecal.rotation.x = -Math.PI / 2;
    headLampGroundDecal.renderOrder = 2;
    scene.add(headLampGroundDecal);

    const chainsawResMats = [];
    const chainsawResGeoms = [];
    const { group: chainsawMeshGroup, chainPivot: chainsawChainPivot } = createChainsawVisual(chainsawResMats, chainsawResGeoms);
    const CHAINSAW_PICKUP_SPHERE_R = 2.35 * MAP_3D_SCALE;
    const chainsawSphereGeom = new THREE.SphereGeometry(CHAINSAW_PICKUP_SPHERE_R, 28, 24);
    chainsawResGeoms.push(chainsawSphereGeom);
    const chainsawSphereMat = new THREE.MeshPhysicalMaterial({
      color: "#ffdd22",
      emissive: "#aa8800",
      emissiveIntensity: 0.14,
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      metalness: 0.04,
      transmission: 0.42,
      thickness: 1.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    chainsawResMats.push(chainsawSphereMat);
    const chainsawHintSphere = new THREE.Mesh(chainsawSphereGeom, chainsawSphereMat);
    const sawSpinWrapper = new THREE.Group();
    chainsawMeshGroup.scale.setScalar(1.18);
    chainsawMeshGroup.position.y = -0.14;
    sawSpinWrapper.add(chainsawMeshGroup);
    const chainsawPickupRoot = new THREE.Group();
    chainsawPickupRoot.add(chainsawHintSphere);
    chainsawPickupRoot.add(sawSpinWrapper);
    const csCell = pickHiddenChainsawCell(cells, playerStartGrid);
    const csWorld = gridCellCenterWorld(csCell.r, csCell.c, MAP_HALF, CELL);
    const chainsawPickupY = tileH + CHAINSAW_PICKUP_SPHERE_R * 0.78;
    chainsawPickupRoot.position.set(csWorld.x, chainsawPickupY, csWorld.z);
    scene.add(chainsawPickupRoot);
    let chainsawAcquired = false;
    let chainsawSwingPhase = 0;
    const chainsawPickupRadSq = (CHAINSAW_PICKUP_SPHERE_R + MAP_3D_SCALE * 1.35) ** 2;

    const keys = new Set();
    const onKeyDown = (e) => {
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e) => {
      keys.delete(e.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const resize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    const cameraOffset = new THREE.Vector3(0, 7, -12);
    const cameraTarget = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const forwardDir = new THREE.Vector3();
    const rotatedCameraOffset = new THREE.Vector3();
    const cameraQuat = new THREE.Quaternion();
    const playerForward = new THREE.Vector3();
    const playerUp = new THREE.Vector3(0, 1, 0);
    const headLampGroundPt = new THREE.Vector3();
    const headLampRight = new THREE.Vector3();
    const sweatDrops = [];
    const sweatMaterial = new THREE.MeshStandardMaterial({
      color: "#7ec8ff",
      roughness: 0.3,
      metalness: 0.05,
      transparent: true,
      opacity: 0.9,
    });
    const sweatGeom = new THREE.SphereGeometry(0.08, 8, 8);
    let sweatCarry = 0;
    let walkPhase = 0;
    let headLampSwaySmoothed = 0;
    let cameraYawOffset = 0;
    let cameraDistance = 12 * MAP_3D_SCALE;
    let cameraHeight = 7 * MAP_3D_SCALE;

    let gangGameOver = false;
    /** Goes up when the pack is fully cut down; next wave is 10 NPCs larger. */
    let gangWaveTier = 0;
    const goreParts = [];
    const goreExtraMats = [];

    let squeezeT = 0;
    let gangChainsawKnockAccumulator = 0;
    let applesSpawned = false;
    let timeSinceApples = 0;
    /** Seconds to shrink chase ring onto player (full squash). */
    const SQUASH_DURATION = 7.5;
    /** Minimum time after capture before maul (longer apple spiral + beat after crush). */
    const MIN_TIME_AFTER_CAPTURE_MAUL = 8.8;
    /** World-radius (m) within which a gang member counts as encircling the player (ring is ~3.5× MAP_3D_SCALE). */
    const GANG_HEMMED_RADIUS = 32 * MAP_3D_SCALE;
    const GANG_HEMMED_RADIUS_SQ = GANG_HEMMED_RADIUS * GANG_HEMMED_RADIUS;

    /** Chainsaw knockdown only if NPC is inside this arc from the hero (≤ ~±75° ahead). */
    const CHAINSAW_KILL_MIN_FWD_DOT = 0.26;
    const CHAINSAW_KILL_REACH = 2.8 * MAP_3D_SCALE;
    const CHAINSAW_KILL_REACH_SQ = CHAINSAW_KILL_REACH * CHAINSAW_KILL_REACH;

    const appleSpirals = [];
    const appleBodyGeom = new THREE.SphereGeometry(0.165, 10, 10);
    const appleStemGeom = new THREE.CylinderGeometry(0.022, 0.032, 0.11, 6);
    const appleBodyMat = new THREE.MeshStandardMaterial({
      color: "#c41e1e",
      roughness: 0.4,
      metalness: 0.08,
    });
    const appleStemMat = new THREE.MeshStandardMaterial({ color: "#4a3020", roughness: 0.88 });

    const clearAppleSpiralsFromScene = () => {
      while (appleSpirals.length) {
        const a = appleSpirals.pop();
        scene.remove(a.root);
      }
    };

    const spawnGangApples = (cx, baseY, cz) => {
      for (let i = 0; i < 22; i += 1) {
        const body = new THREE.Mesh(appleBodyGeom, appleBodyMat);
        body.scale.set(1, 1.08, 1);
        const stem = new THREE.Mesh(appleStemGeom, appleStemMat);
        stem.position.y = 0.16;
        const g = new THREE.Group();
        g.add(body);
        g.add(stem);
        g.position.set(
          cx + (Math.random() - 0.5) * 0.45,
          baseY + Math.random() * 0.55,
          cz + (Math.random() - 0.5) * 0.45
        );
        scene.add(g);
        appleSpirals.push({
          root: g,
          angle: Math.random() * PI2,
          omega: 0.95 + Math.random() * 1.15,
          radius: 0.18 + Math.random() * 0.22,
          radiusGrow: 0.28 + Math.random() * 0.26,
          vy: 4.8 + Math.random() * 4.5,
          centerX: cx,
          centerZ: cz,
        });
      }
    };

    const SURROUND_R = 3.5 * MAP_3D_SCALE;
    /** Minimum ring radius — pack crushes inward onto the player before the maul. */
    const SURROUND_CRUSH_R = 0.2 * MAP_3D_SCALE;
    const WANDER_SPEED = 5.2 * MAP_3D_SCALE;
    const CHASE_SPEED = 20 * MAP_3D_SCALE;
    const MAP_CLAMP = MAP_HALF - CELL * 1.1;

    const horizDistSq = (ax, az, bx, bz) => {
      const dx = ax - bx;
      const dz = az - bz;
      return dx * dx + dz * dz;
    };

    const triggerMaul = () => {
      if (gangGameOver) return;
      clearAppleSpiralsFromScene();

      gangGameOver = true;
      setGangCaughtOverlay(true);
      player.visible = false;

      const px = player.position.x;
      const py = player.position.y;
      const pz = player.position.z;

      const fleshMat = new THREE.MeshStandardMaterial({ color: "#e7be92", roughness: 0.72 });
      goreExtraMats.push(fleshMat);
      const bloodMat = new THREE.MeshStandardMaterial({ color: "#7f080c", metalness: 0.05, roughness: 0.42 });
      goreExtraMats.push(bloodMat);
      const clothGoreMat = new THREE.MeshStandardMaterial({ color: "#394a8f", roughness: 0.62 });
      goreExtraMats.push(clothGoreMat);

      for (let i = 0; i < 92; i += 1) {
        const geo = new THREE.SphereGeometry(0.042 + Math.random() * 0.08, 4, 4);
        const m = new THREE.Mesh(geo, bloodMat);
        m.position.set(
          px + (Math.random() - 0.5) * 1.8,
          py + Math.random() * 3.2,
          pz + (Math.random() - 0.5) * 1.8
        );
        scene.add(m);
        goreParts.push({
          mesh: m,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 26,
            10 + Math.random() * 20,
            (Math.random() - 0.5) * 26
          ),
          angVel: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
          life: 2.8 + Math.random() * 2.5,
        });
      }

      for (let i = 0; i < 24; i += 1) {
        const wx = 0.14 + Math.random() * 0.26;
        const hy = 0.32 + Math.random() * 0.92;
        const geo = new THREE.BoxGeometry(wx, hy, wx * 1.05);
        const mat = Math.random() < 0.58 ? fleshMat : clothGoreMat;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          px + (Math.random() - 0.5) * 1.55,
          py + Math.random() * 2.4,
          pz + (Math.random() - 0.5) * 1.55
        );
        mesh.rotation.set(Math.random() * PI2, Math.random() * PI2, Math.random() * PI2);
        scene.add(mesh);
        goreParts.push({
          mesh,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 34,
            12 + Math.random() * 24,
            (Math.random() - 0.5) * 34
          ),
          angVel: new THREE.Vector3(
            Math.random() * 16 - 8,
            Math.random() * 16 - 8,
            Math.random() * 16 - 8
          ),
          life: 3.9 + Math.random(),
        });
      }

      for (let i = 0; i < 6; i += 1) {
        const geo = new THREE.CylinderGeometry(
          0.08 + Math.random() * 0.1,
          0.09 + Math.random() * 0.12,
          0.3 + Math.random() * 0.45,
          8
        );
        const mesh = new THREE.Mesh(geo, fleshMat);
        mesh.position.set(px + Math.sin(i) * 0.4, py + 2.9 + Math.random() * 0.5, pz + Math.cos(i) * 0.4);
        scene.add(mesh);
        goreParts.push({
          mesh,
          vel: new THREE.Vector3(Math.sin(i) * 24, 20 + Math.random() * 8, Math.cos(i) * 24),
          angVel: new THREE.Vector3(Math.random() * 22, Math.random() * 22, Math.random() * 22),
          life: 4.3,
        });
      }
    };

    let rafId = 0;
    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.033);

      const turnInput =
        (keys.has("arrowleft") ? 1 : 0) +
        (keys.has("arrowright") ? -1 : 0);
      const moveInput =
        (keys.has("arrowup") ? 1 : 0) +
        (keys.has("arrowdown") ? -1 : 0);
      const spaceHeld = keys.has(" ");
      const isSprinting = spaceHeld && !chainsawAcquired;
      const chainsawSwinging = spaceHeld && chainsawAcquired;

      // Camera control on WASD (separate from character movement).
      const camYawInput = (keys.has("a") ? 1 : 0) + (keys.has("d") ? -1 : 0);
      const camZoomInput = (keys.has("w") ? -1 : 0) + (keys.has("s") ? 1 : 0);
      if (camYawInput !== 0) {
        cameraYawOffset += camYawInput * 1.8 * dt;
      }
      if (camZoomInput !== 0) {
        const dMin = 6 * MAP_3D_SCALE;
        const dMax = 22 * MAP_3D_SCALE;
        cameraDistance = Math.min(dMax, Math.max(dMin, cameraDistance + camZoomInput * 10 * MAP_3D_SCALE * dt));
        cameraHeight = Math.min(12 * MAP_3D_SCALE, Math.max(4 * MAP_3D_SCALE, 4.5 * MAP_3D_SCALE + cameraDistance * 0.27));
      }

      const px = player.position.x;
      const pz = player.position.z;
      const pg = worldXZToGrid(px, pz, MAP_HALF, CELL);

      if (!gangGameOver) {
        if (!chainsawAcquired) {
          sawSpinWrapper.rotation.y += dt * 0.52;
          sawSpinWrapper.rotation.x += Math.sin(clock.elapsedTime * 1.05) * dt * 0.14;
          chainsawChainPivot.rotation.x += dt * 3.4;
          const dPickupX = px - chainsawPickupRoot.position.x;
          const dPickupZ = pz - chainsawPickupRoot.position.z;
          if (dPickupX * dPickupX + dPickupZ * dPickupZ <= chainsawPickupRadSq) {
            chainsawAcquired = true;
            chainsawPickupRoot.remove(chainsawHintSphere);
            chainsawPickupRoot.remove(sawSpinWrapper);
            scene.remove(chainsawPickupRoot);
            armRig.right.forearmPivot.add(sawSpinWrapper);
            sawSpinWrapper.position.set(0.02, -1.02, 0.1);
            sawSpinWrapper.rotation.set(1.95, -0.2, -0.92);
            chainsawMeshGroup.position.set(0, 0, 0);
            chainsawMeshGroup.scale.setScalar(1.12);
          }
        } else {
          chainsawChainPivot.rotation.x += dt * (chainsawSwinging ? 52 : 24);
          if (!chainsawSwinging) {
            sawSpinWrapper.rotation.y += dt * 0.14;
          }
        }

        if (turnInput !== 0) {
          const turnSpeed = 2.8;
          player.rotation.y += turnInput * turnSpeed * dt;
        }

        if (moveInput !== 0) {
          const moveSpeed = (isSprinting ? 22 : 7.5) * MAP_3D_SCALE;
          forwardDir.set(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
          player.position.addScaledVector(forwardDir, moveInput * moveSpeed * dt);

          walkPhase += dt * (isSprinting ? 16 : 9.5);
          const armSwing = Math.sin(walkPhase) * 0.62;
          const elbowBend = Math.max(0, Math.sin(walkPhase + 0.4)) * 0.24;
          const legSwing = Math.sin(walkPhase) * 0.75;
          const kneeBend = Math.max(0, Math.sin(walkPhase + 0.2)) * 0.42;
          const footRock = Math.sin(walkPhase + 0.8) * 0.2;

          if (armRig.left && armRig.right) {
            if (chainsawSwinging) {
              chainsawSwingPhase += dt * 16.5;
              const s = Math.sin(chainsawSwingPhase);
              const c = Math.cos(chainsawSwingPhase);
              const lift = 0.38 + Math.abs(c) * 0.58;
              armRig.right.armPivot.rotation.x = lift;
              armRig.right.armPivot.rotation.y = s * 1.22;
              armRig.right.armPivot.rotation.z = -s * 0.16;
              armRig.right.forearmPivot.rotation.x = -0.28 + Math.abs(s) * 0.72;
              armRig.right.forearmPivot.rotation.y = s * 0.12;
              armRig.left.armPivot.rotation.x = armSwing * 0.45 - 0.15;
              armRig.left.armPivot.rotation.y = -s * 0.52;
              armRig.left.forearmPivot.rotation.x = -elbowBend * 0.85;
              armRig.left.hand.rotation.x = -armSwing * 0.2;
              armRig.right.hand.rotation.x = armRig.right.baseHandX * 0.22;
              sawSpinWrapper.rotation.z = s * 0.42;
            } else if (chainsawAcquired) {
              armRig.right.armPivot.rotation.y += (0 - armRig.right.armPivot.rotation.y) * Math.min(1, dt * 10);
              armRig.right.armPivot.rotation.z += (0 - armRig.right.armPivot.rotation.z) * Math.min(1, dt * 10);
              armRig.left.armPivot.rotation.y += (0 - armRig.left.armPivot.rotation.y) * Math.min(1, dt * 8);
              armRig.right.forearmPivot.rotation.y += (0 - armRig.right.forearmPivot.rotation.y) * Math.min(1, dt * 8);
              sawSpinWrapper.rotation.z += (0 - sawSpinWrapper.rotation.z) * Math.min(1, dt * 10);
              armRig.left.armPivot.rotation.x = armSwing;
              armRig.right.armPivot.rotation.x = 1.06 + Math.sin(walkPhase * 1.02) * 0.065;
              armRig.left.forearmPivot.rotation.x = -elbowBend;
              armRig.right.forearmPivot.rotation.x = -0.88 + Math.sin(walkPhase * 1.02 + 0.45) * 0.06;
              armRig.left.hand.rotation.x = -armSwing * 0.25;
              armRig.right.hand.rotation.x = armRig.right.baseHandX * 0.32;
            } else {
              armRig.left.armPivot.rotation.x = armSwing;
              armRig.right.armPivot.rotation.x = -armSwing;
              armRig.left.forearmPivot.rotation.x = -elbowBend;
              armRig.right.forearmPivot.rotation.x = -Math.max(0, -Math.sin(walkPhase + 0.4)) * 0.24;
              armRig.left.hand.rotation.x = -armSwing * 0.25;
              armRig.right.hand.rotation.x = armSwing * 0.25;
            }
          }

          if (legRig.left && legRig.right) {
            legRig.left.legPivot.rotation.x = -legSwing;
            legRig.right.legPivot.rotation.x = legSwing;
            legRig.left.lowerLegPivot.rotation.x = kneeBend;
            legRig.right.lowerLegPivot.rotation.x = Math.max(0, -Math.sin(walkPhase + 0.2)) * 0.42;
            legRig.left.foot.rotation.x = legRig.left.baseFootX + footRock;
            legRig.right.foot.rotation.x = legRig.right.baseFootX - footRock;
          }

          if (isSprinting) {
            sweatCarry += dt * 20;
            playerForward.set(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
            while (sweatCarry >= 1) {
              sweatCarry -= 1;
              const drop = new THREE.Mesh(sweatGeom, sweatMaterial);
              const side = Math.random() < 0.5 ? -1 : 1;
              const jitterX = side * (0.22 + Math.random() * 0.2);
              const jitterY = 0.02 + Math.random() * 0.12;
              const jitterZ = -0.05 + Math.random() * 0.1;
              drop.position.set(
                player.position.x + jitterX,
                player.position.y + headTopOffsetY + jitterY,
                player.position.z + jitterZ
              );
              scene.add(drop);
              sweatDrops.push({
                mesh: drop,
                life: 0.8 + Math.random() * 0.55,
                vel: new THREE.Vector3(
                  side * (1.0 + Math.random() * 0.7) + playerForward.x * -2.4,
                  0.45 + Math.random() * 0.5,
                  (-1.4 + Math.random() * 0.8) + playerForward.z * -2.4
                ),
              });
            }
          }
        } else {
          const reset = (current, target) => current + (target - current) * 0.15;
          if (armRig.left && armRig.right) {
            if (chainsawSwinging) {
              chainsawSwingPhase += dt * 16.5;
              const s = Math.sin(chainsawSwingPhase);
              const c = Math.cos(chainsawSwingPhase);
              const lift = 0.36 + Math.abs(c) * 0.62;
              armRig.right.armPivot.rotation.x = lift;
              armRig.right.armPivot.rotation.y = s * 1.22;
              armRig.right.armPivot.rotation.z = -s * 0.16;
              armRig.right.forearmPivot.rotation.x = -0.26 + Math.abs(s) * 0.74;
              armRig.right.forearmPivot.rotation.y = s * 0.12;
              armRig.left.armPivot.rotation.x = reset(armRig.left.armPivot.rotation.x, -0.12);
              armRig.left.armPivot.rotation.y = -s * 0.55;
              armRig.left.forearmPivot.rotation.x = reset(armRig.left.forearmPivot.rotation.x, -0.08);
              armRig.left.hand.rotation.x = reset(armRig.left.hand.rotation.x, armRig.left.baseHandX);
              armRig.right.hand.rotation.x = armRig.right.baseHandX * 0.22;
              sawSpinWrapper.rotation.z = s * 0.42;
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
            } else if (chainsawAcquired) {
              armRig.right.armPivot.rotation.y = reset(armRig.right.armPivot.rotation.y, 0);
              armRig.right.armPivot.rotation.z = reset(armRig.right.armPivot.rotation.z, 0);
              armRig.left.armPivot.rotation.y = reset(armRig.left.armPivot.rotation.y, 0);
              armRig.right.forearmPivot.rotation.y = reset(armRig.right.forearmPivot.rotation.y, 0);
              sawSpinWrapper.rotation.z += (0 - sawSpinWrapper.rotation.z) * Math.min(1, dt * 10);
              armRig.left.armPivot.rotation.x = reset(armRig.left.armPivot.rotation.x, 0);
              armRig.right.armPivot.rotation.x = reset(armRig.right.armPivot.rotation.x, 1.02);
              armRig.left.forearmPivot.rotation.x = reset(armRig.left.forearmPivot.rotation.x, 0);
              armRig.right.forearmPivot.rotation.x = reset(armRig.right.forearmPivot.rotation.x, -0.82);
              armRig.left.hand.rotation.x = reset(armRig.left.hand.rotation.x, armRig.left.baseHandX);
              armRig.right.hand.rotation.x = reset(armRig.right.hand.rotation.x, armRig.right.baseHandX * 0.3);
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
            } else {
              armRig.left.armPivot.rotation.x = reset(armRig.left.armPivot.rotation.x, 0);
              armRig.right.armPivot.rotation.x = reset(armRig.right.armPivot.rotation.x, 0);
              armRig.left.forearmPivot.rotation.x = reset(armRig.left.forearmPivot.rotation.x, 0);
              armRig.right.forearmPivot.rotation.x = reset(armRig.right.forearmPivot.rotation.x, 0);
              armRig.left.hand.rotation.x = reset(armRig.left.hand.rotation.x, armRig.left.baseHandX);
              armRig.right.hand.rotation.x = reset(armRig.right.hand.rotation.x, armRig.right.baseHandX);
            }
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

        /** One pack: if any member enters alert range, everyone chases (no split wander vs chase). */
        let packChasesPlayer = false;
        for (const gm of gangMembers) {
          if (gm.knockedDown) continue;
          const gn = worldXZToGrid(gm.rig.group.position.x, gm.rig.group.position.z, MAP_HALF, CELL);
          if (gridChebyshev(gn.r, gn.c, pg.r, pg.c) <= GANG_ALERT_GRID_CHEBYSHEV) {
            packChasesPlayer = true;
            break;
          }
        }
        for (const gm of gangMembers) {
          gm.aggressive = packChasesPlayer && !gm.knockedDown;
        }

        if (!packChasesPlayer) {
          gangPackRetargetT -= dt;
          if (gangPackRetargetT <= 0) {
            const cell = pickRandomWalkableCell(cells, Math.random);
            const w = gridCellCenterWorld(cell.r, cell.c, MAP_HALF, CELL);
            gangPackTargetX = w.x;
            gangPackTargetZ = w.z;
            gangPackRetargetT = 5.5 + Math.random() * 9;
          }
        }

        let packCentroidX = 0;
        let packCentroidZ = 0;
        let packActiveCount = 0;
        for (const gm of gangMembers) {
          if (gm.knockedDown) continue;
          packCentroidX += gm.rig.group.position.x;
          packCentroidZ += gm.rig.group.position.z;
          packActiveCount += 1;
        }
        if (packActiveCount < 1) {
          packCentroidX = px;
          packCentroidZ = pz;
        } else {
          packCentroidX /= packActiveCount;
          packCentroidZ /= packActiveCount;
        }

        if (applesSpawned) squeezeT += dt;
        const squashU = Math.min(1, squeezeT / SQUASH_DURATION);
        const squashEase = squashU * squashU * (3 - 2 * squashU);
        const dynamicSurroundR = THREE.MathUtils.lerp(SURROUND_R, SURROUND_CRUSH_R, squashEase);
        const towardPlayerBlend = THREE.MathUtils.lerp(0.45, 0.94, squashEase);
        const ringBlend = 1 - towardPlayerBlend;

        for (const gm of gangMembers) {
          const g = gm.rig.group;

          if (gm.knockedDown) {
            if (gm.fallPhase < 0.001) {
              gm.fallFaceY = g.rotation.y;
              gm.fallTiltZ = (Math.random() - 0.5) * 0.55;
            }
            gm.fallPhase = Math.min(1, gm.fallPhase + dt * 4.8);
            const e = gm.fallPhase * gm.fallPhase * (3 - 2 * gm.fallPhase);
            g.rotation.y = gm.fallFaceY;
            g.rotation.x = -Math.PI * 0.5 * e;
            g.rotation.z = gm.fallTiltZ * e;
            g.position.y = 4.1 - 1.05 * e;
            const ar = gm.rig.armRig;
            const lg = gm.rig.legRig;
            if (ar.left && ar.right) {
              ar.left.armPivot.rotation.x = 0.35 + e * 0.85;
              ar.right.armPivot.rotation.x = 0.25 + e * 0.95;
              ar.left.forearmPivot.rotation.x = -e * 0.4;
              ar.right.forearmPivot.rotation.x = -e * 0.35;
            }
            if (lg.left && lg.right) {
              lg.left.legPivot.rotation.x = e * 0.25;
              lg.right.legPivot.rotation.x = -e * 0.2;
              lg.left.lowerLegPivot.rotation.x = e * 0.55;
              lg.right.lowerLegPivot.rotation.x = e * 0.5;
            }
            continue;
          }

          let dirX = 0;
          let dirZ = 0;
          let speed = 0;

          if (gm.aggressive) {
            const ringAng =
              (gm.slot / Math.max(gangMembers.length, 1)) * PI2 + clock.getElapsedTime() * 0.28;
            const ix = px + Math.sin(ringAng) * dynamicSurroundR;
            const iz = pz + Math.cos(ringAng) * dynamicSurroundR;
            const toRingX = ix - g.position.x;
            const toRingZ = iz - g.position.z;
            const toPx = px - g.position.x;
            const toPz = pz - g.position.z;
            dirX = toRingX * ringBlend + toPx * towardPlayerBlend;
            dirZ = toRingZ * ringBlend + toPz * towardPlayerBlend;
            const toPackX = packCentroidX - g.position.x;
            const toPackZ = packCentroidZ - g.position.z;
            const packPull = 0.12 * (1 - squashEase * 0.82);
            dirX += (toPackX / (Math.hypot(toPackX, toPackZ) || 1)) * packPull;
            dirZ += (toPackZ / (Math.hypot(toPackX, toPackZ) || 1)) * packPull;
            const hlen = Math.hypot(dirX, dirZ) || 1;
            dirX /= hlen;
            dirZ /= hlen;
            speed = CHASE_SPEED * (1 + squashEase * 0.3);
          } else {
            const { ox: wOffX, oz: wOffZ } = gangPackScatterOffset(
              gm.slot,
              gangMembers.length,
              PACK_FORM_RADIUS
            );
            const wcx = gangPackTargetX + wOffX;
            const wcz = gangPackTargetZ + wOffZ;
            dirX = wcx - g.position.x;
            dirZ = wcz - g.position.z;
            const wlen = Math.hypot(dirX, dirZ);
            if (wlen < CELL * 0.22) {
              speed = 0;
            } else {
              dirX /= wlen;
              dirZ /= wlen;
              speed = WANDER_SPEED;
            }
          }

          if (speed > 0.001) {
            g.position.x += dirX * speed * dt;
            g.position.z += dirZ * speed * dt;
            g.position.x = Math.max(-MAP_CLAMP, Math.min(MAP_CLAMP, g.position.x));
            g.position.z = Math.max(-MAP_CLAMP, Math.min(MAP_CLAMP, g.position.z));
            g.rotation.y = Math.atan2(dirX, dirZ);
            gm.walkPhase += dt * (gm.aggressive ? 14.8 : 8.9);
            const wp = gm.walkPhase;
            const amp = gm.aggressive ? 0.68 : 0.46;
            const armSwing = Math.sin(wp) * amp;
            const elbowBend = Math.max(0, Math.sin(wp + 0.4)) * 0.21;
            const legSwing = Math.sin(wp) * 0.7;
            const kneeBend = Math.max(0, Math.sin(wp + 0.2)) * 0.37;
            const footRock = Math.sin(wp + 0.82) * 0.17;
            const ar = gm.rig.armRig;
            const lg = gm.rig.legRig;
            if (ar.left && ar.right) {
              ar.left.armPivot.rotation.x = armSwing;
              ar.right.armPivot.rotation.x = -armSwing;
              ar.left.forearmPivot.rotation.x = -elbowBend;
              ar.right.forearmPivot.rotation.x = -Math.max(0, -Math.sin(wp + 0.4)) * 0.21;
            }
            if (lg.left && lg.right) {
              lg.left.legPivot.rotation.x = -legSwing;
              lg.right.legPivot.rotation.x = legSwing;
              lg.left.lowerLegPivot.rotation.x = kneeBend;
              lg.right.lowerLegPivot.rotation.x = Math.max(0, -Math.sin(wp + 0.2)) * 0.37;
              lg.left.foot.rotation.x = lg.left.baseFootX + footRock;
              lg.right.foot.rotation.x = lg.right.baseFootX - footRock;
            }
          } else {
            const rst = (cur, tgt) => cur + (tgt - cur) * 0.12;
            const ar = gm.rig.armRig;
            const lg = gm.rig.legRig;
            if (ar.left && ar.right) {
              ar.left.armPivot.rotation.x = rst(ar.left.armPivot.rotation.x, 0);
              ar.right.armPivot.rotation.x = rst(ar.right.armPivot.rotation.x, 0);
            }
            if (lg.left && lg.right) {
              lg.left.legPivot.rotation.x = rst(lg.left.legPivot.rotation.x, lg.left.baseLegPivotX);
              lg.right.legPivot.rotation.x = rst(lg.right.legPivot.rotation.x, lg.right.baseLegPivotX);
            }
          }
        }

        let minGangDist = Infinity;
        let hemmedNearby = 0;
        for (const gm of gangMembers) {
          if (!gm.aggressive || gm.knockedDown) continue;
          const d2 = horizDistSq(gm.rig.group.position.x, gm.rig.group.position.z, px, pz);
          const d = Math.sqrt(d2);
          minGangDist = Math.min(minGangDist, d);
          if (d2 < GANG_HEMMED_RADIUS_SQ) hemmedNearby += 1;
        }

        const hemmedIn =
          packChasesPlayer &&
          (hemmedNearby >= 12 ||
            (hemmedNearby >= 8 && minGangDist < 8 * MAP_3D_SCALE) ||
            minGangDist < MAP_3D_SCALE * 3.5);

        if (chainsawAcquired && hemmedIn && packChasesPlayer) {
          gangChainsawKnockAccumulator += dt;
          const killFwdX = Math.sin(player.rotation.y);
          const killFwdZ = Math.cos(player.rotation.y);
          while (gangChainsawKnockAccumulator >= 0.1) {
            const knockPool = gangMembers.filter((gm) => {
              if (!gm.aggressive || gm.knockedDown) return false;
              const gx = gm.rig.group.position.x - px;
              const gz = gm.rig.group.position.z - pz;
              const d2 = gx * gx + gz * gz;
              if (d2 > CHAINSAW_KILL_REACH_SQ) return false;
              const len = Math.sqrt(d2);
              if (len < 1e-4) return true;
              const nx = gx / len;
              const nz = gz / len;
              return nx * killFwdX + nz * killFwdZ >= CHAINSAW_KILL_MIN_FWD_DOT;
            });
            if (!knockPool.length) break;
            gangChainsawKnockAccumulator -= 0.1;
            knockPool[Math.floor(Math.random() * knockPool.length)].knockedDown = true;
          }
        } else {
          gangChainsawKnockAccumulator = 0;
        }

        if (!applesSpawned && hemmedIn && packChasesPlayer && !chainsawAcquired) {
          spawnGangApples(px, player.position.y + 1.85, pz);
          applesSpawned = true;
          timeSinceApples = 0;
          squeezeT = 0;
        }

        if (applesSpawned) {
          timeSinceApples += dt;
          for (let ai = appleSpirals.length - 1; ai >= 0; ai -= 1) {
            const a = appleSpirals[ai];
            a.angle += a.omega * dt;
            a.radius += a.radiusGrow * MAP_3D_SCALE * 0.048 * dt;
            a.vy += -1.25 * dt;
            a.root.position.y += a.vy * dt;
            a.centerX += (px - a.centerX) * 0.018;
            a.centerZ += (pz - a.centerZ) * 0.018;
            a.root.position.x = a.centerX + Math.cos(a.angle) * a.radius;
            a.root.position.z = a.centerZ + Math.sin(a.angle) * a.radius;
            a.root.rotation.y += dt * 0.92;
            a.root.rotation.z += dt * 0.42;
            if (a.root.position.y > 140 * MAP_3D_SCALE) {
              scene.remove(a.root);
              appleSpirals.splice(ai, 1);
            }
          }
          if (timeSinceApples >= MIN_TIME_AFTER_CAPTURE_MAUL && squeezeT >= SQUASH_DURATION) {
            triggerMaul();
          }
        }

        if (
          chainsawAcquired &&
          gangMembers.length > 0 &&
          gangMembers.every((gm) => gm.knockedDown) &&
          !gangGameOver
        ) {
          gangWaveTier += 1;
          gangMembers.forEach((gm) => {
            scene.remove(gm.rig.group);
            gm.rig.bodyMeshes.forEach((mesh) => mesh.geometry.dispose());
            gm.rig.materials.forEach((m) => m.dispose());
          });
          gangMembers.length = 0;

          gangChainsawKnockAccumulator = 0;
          applesSpawned = false;
          squeezeT = 0;
          clearAppleSpiralsFromScene();

          chainsawAcquired = false;
          chainsawSwingPhase = 0;
          armRig.right.forearmPivot.remove(sawSpinWrapper);
          sawSpinWrapper.rotation.set(0, 0, 0);
          sawSpinWrapper.position.set(0, 0, 0);
          chainsawMeshGroup.scale.setScalar(1.18);
          chainsawMeshGroup.position.y = -0.14;
          chainsawPickupRoot.rotation.set(0, 0, 0);
          if (chainsawHintSphere.parent !== chainsawPickupRoot) chainsawPickupRoot.add(chainsawHintSphere);
          if (sawSpinWrapper.parent !== chainsawPickupRoot) chainsawPickupRoot.add(sawSpinWrapper);

          const hideCell = pickHiddenChainsawCell(cells, worldXZToGrid(px, pz, MAP_HALF, CELL));
          const hideW = gridCellCenterWorld(hideCell.r, hideCell.c, MAP_HALF, CELL);
          chainsawPickupRoot.position.set(hideW.x, chainsawPickupY, hideW.z);
          scene.add(chainsawPickupRoot);

          const nextWaveSize = GANG_COUNT + gangWaveTier * GANG_WAVE_SIZE_STEP;
          spawnGangOfSize(nextWaveSize, worldXZToGrid(px, pz, MAP_HALF, CELL));
        }
      } else {
        for (let i = goreParts.length - 1; i >= 0; i -= 1) {
          const p = goreParts[i];
          p.life -= dt;
          p.vel.addScaledVector(playerUp, -16 * dt);
          p.mesh.position.addScaledVector(p.vel, dt);
          p.mesh.rotation.x += p.angVel.x * dt;
          p.mesh.rotation.y += p.angVel.y * dt;
          p.mesh.rotation.z += p.angVel.z * dt;
          if (p.life <= 0 || p.mesh.position.y < 0.055) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            goreParts.splice(i, 1);
          }
        }

        for (const gm of gangMembers) {
          if (gm.knockedDown) continue;
          const g = gm.rig.group;
          const toX = px - g.position.x;
          const toZ = pz - g.position.z;
          const d = Math.hypot(toX, toZ) || 1;
          g.position.x += (toX / d) * 6.4 * MAP_3D_SCALE * dt;
          g.position.z += (toZ / d) * 6.4 * MAP_3D_SCALE * dt;
          g.rotation.y = Math.atan2(toX, toZ);
          gm.walkPhase += dt * 24;
          const wp = gm.walkPhase;
          const amp = 1.05;
          const ar = gm.rig.armRig;
          if (ar.left && ar.right) {
            ar.left.armPivot.rotation.x = Math.sin(wp) * amp + 0.25;
            ar.right.armPivot.rotation.x = -Math.sin(wp) * amp - 0.15;
          }
        }

        camera.position.x += (Math.random() - 0.5) * MAP_3D_SCALE * 0.1 * dt;
        camera.position.y += (Math.random() - 0.5) * MAP_3D_SCALE * 0.07 * dt;
      }

      for (let i = sweatDrops.length - 1; i >= 0; i -= 1) {
        const d = sweatDrops[i];
        d.life -= dt;
        d.vel.addScaledVector(playerUp, -7.6 * dt);
        d.mesh.position.addScaledVector(d.vel, dt);
        d.mesh.scale.setScalar(Math.max(0.2, d.life));
        d.mesh.material.opacity = Math.max(0, d.life * 1.1);
        if (d.life <= 0 || d.mesh.position.y < 0.02) {
          scene.remove(d.mesh);
          d.mesh.geometry.dispose();
          sweatDrops.splice(i, 1);
        }
      }

      if (!gangGameOver && headLampPivot) {
        const lampLead = 7.6;
        const ryLamp = player.rotation.y;
        const swayTarget =
          moveInput !== 0 ? Math.sin(walkPhase) * (isSprinting ? 1.075 : 0.675) * MAP_3D_SCALE : 0;
        headLampSwaySmoothed += (swayTarget - headLampSwaySmoothed) * Math.min(1, dt * 12);
        headLampRight.set(Math.cos(ryLamp), 0, -Math.sin(ryLamp));
        headLampGroundPt.set(
          player.position.x + Math.sin(ryLamp) * lampLead + headLampRight.x * headLampSwaySmoothed,
          headLampGroundY,
          player.position.z + Math.cos(ryLamp) * lampLead + headLampRight.z * headLampSwaySmoothed
        );
        headLampTarget.position.copy(headLampGroundPt);
        headLampPivot.lookAt(headLampGroundPt);
        headLampPivot.rotateY(Math.PI);
        headLampGroundDecal.position.set(headLampGroundPt.x, headLampGroundY + 0.028, headLampGroundPt.z);
      }

      cameraOffset.set(0, cameraHeight, -cameraDistance);
      cameraQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y + cameraYawOffset);
      rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
      cameraTarget.copy(player.position).add(rotatedCameraOffset);
      camera.position.lerp(cameraTarget, 0.08);
      lookTarget.copy(player.position).add(new THREE.Vector3(0, 2.3, 0));
      camera.lookAt(lookTarget);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      const staticGeom = new Set();
      const staticMats = new Set();
      staticWorld.forEach((mesh) => {
        if (mesh.geometry) staticGeom.add(mesh.geometry);
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => staticMats.add(m));
        else if (mesh.material) staticMats.add(mesh.material);
      });
      staticGeom.forEach((g) => g.dispose());
      staticMats.forEach((m) => m.dispose());
      lampLights.forEach((l) => scene.remove(l));
      moon.geometry.dispose();
      moon.material.dispose();
      starGeom.dispose();
      starMat.dispose();
      sweatDrops.forEach((d) => {
        scene.remove(d.mesh);
        d.mesh.geometry.dispose();
      });
      sweatGeom.dispose();
      sweatMaterial.dispose();
      bodyMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
      });
      heroRig.materials.forEach((m) => m.dispose());
      gangMembers.forEach((gm) => {
        scene.remove(gm.rig.group);
        gm.rig.bodyMeshes.forEach((mesh) => mesh.geometry.dispose());
        gm.rig.materials.forEach((m) => m.dispose());
      });
      goreParts.forEach((p) => {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
      });
      goreExtraMats.forEach((m) => m.dispose());
      clearAppleSpiralsFromScene();
      appleBodyGeom.dispose();
      appleStemGeom.dispose();
      appleBodyMat.dispose();
      appleStemMat.dispose();
      armRig.right.forearmPivot.remove(sawSpinWrapper);
      scene.remove(chainsawPickupRoot);
      chainsawResGeoms.forEach((g) => g.dispose());
      chainsawResMats.forEach((m) => m.dispose());
      scene.remove(headLampTarget);
      scene.remove(headLampGroundDecal);
      headLampGroundDecal.geometry.dispose();
      groundSpotMat.dispose();
      headLampGroundTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, [worldMap]);

  const gamePanel = (
    <div
      style={{
        width: "calc(100vw - 64px)",
        maxWidth: "1120px",
        margin: embedded ? "0 auto" : "24px auto 80px",
        background: SECTION_GREY,
        borderRadius: "18px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
        padding: "20px",
        boxSizing: "border-box",
        color: MONUMENT,
      }}
    >
        <div
          style={{
            background: WHITE,
            borderRadius: "12px",
            padding: "10px 14px",
            marginBottom: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "0.95rem", color: "#555" }}>
            Player: <strong>Arrow keys</strong>. <strong>Space</strong>: sprint (no chainsaw) or hold to swing the saw when armed. Camera: <strong>WASD</strong>.
            {" "}
            Start with twenty: they chase within five map squares; clear the whole pack with the saw to respawn them elsewhere, drop the weapon in a new hiding spot, and the next wave grows by ten. Red apples only if you&apos;re caught without the saw. A{" "}
            <strong style={{ color: "#b8860b" }}>yellow shimmer</strong> somewhere off the beaten path hides a pickup—run through it for the chainsaw.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setDesignerOpen(true)}
              style={{
                background: MONUMENT,
                color: WHITE,
                border: "1px solid #1e1e1f",
                borderRadius: "10px",
                padding: "8px 14px",
                fontSize: "0.95rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Map Designer
            </button>
            <Link
              to="/projects"
              style={{
                display: "inline-block",
                background: WHITE,
                color: MONUMENT,
                border: "1px solid #ccc",
                borderRadius: "10px",
                padding: "8px 14px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textDecoration: "none",
                letterSpacing: "0.3px",
              }}
            >
              ← Back to Main
            </Link>
          </div>
        </div>

        <div
          ref={mountRef}
          style={{
            width: "100%",
            height: "min(72vh, 760px)",
            borderRadius: "14px",
            overflow: "hidden",
            background: "#d4d7dd",
            position: "relative",
          }}
        />
        {gangCaughtOverlay ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 4200,
              background: "rgba(38,2,6,0.78)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: WHITE,
              pointerEvents: "none",
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "12px", letterSpacing: "0.06em" }}>
              Caught by the gang
            </div>
            <div style={{ fontSize: "1.05rem", maxWidth: "420px", lineHeight: 1.5, opacity: 0.92 }}>
              Reload the page or change the map (Map Designer) to play again.
            </div>
          </div>
        ) : null}
    </div>
  );

  return (
    <>
      {!embedded ? (
        <div
          className="page-container"
          style={{
            position: "fixed",
            inset: 0,
            background: LIGHT_MONUMENT,
            minHeight: "100vh",
            width: "100vw",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              margin: "32px auto 24px auto",
              width: "calc(100vw - 64px)",
              maxWidth: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              padding: "0 32px",
              boxSizing: "border-box",
            }}
          >
            <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
              <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
            </Link>
            <h1
              style={{
                margin: 0,
                fontSize: "2.4rem",
                fontWeight: 700,
                color: WHITE,
                letterSpacing: "1px",
              }}
            >
              Night Walker
            </h1>
          </div>
          {gamePanel}
        </div>
      ) : (
        <div
          style={{
            width: "calc(100vw - 64px)",
            maxWidth: "1120px",
            margin: "0 auto",
            padding: "0 20px",
            boxSizing: "border-box",
          }}
        >
          {gamePanel}
        </div>
      )}
      {designerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 5000,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
          onClick={() => setDesignerOpen(false)}
        >
          <div
            style={{
              width: "min(92vw, 980px)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#1c1f2a",
              borderRadius: "14px",
              padding: "18px",
              boxSizing: "border-box",
              boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "14px",
              }}
            >
              <h2 style={{ margin: 0, color: WHITE, fontSize: "1.25rem" }}>Map Designer</h2>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={clearDesigner}
                  style={{
                    background: "#444",
                    color: WHITE,
                    border: "1px solid #666",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setDesignerOpen(false)}
                  style={{
                    background: "#2d3347",
                    color: WHITE,
                    border: "1px solid #4c587c",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ color: "#cfd5e6", marginBottom: "10px", fontSize: "0.92rem" }}>
              30 &times; 30 grid (auto-saves) &mdash; one cell in the editor is one tile; in 3D each tile is {MAP_3D_SCALE}&times; as wide and deep on the world as before ({MAP_WORLD_SIZE}m map). White dashes mark road centres; four-way crossings show a stop bar instead. Water is translucent square tiles 500&nbsp;mm below turf; adjoining grass banks show brown earth sides. 3D updates after a short pause.
            </div>
            <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div
                style={{
                  minWidth: "120px",
                  background: "#171a24",
                  borderRadius: "8px",
                  padding: "10px",
                  boxSizing: "border-box",
                }}
              >
                {[
                  { key: "grass", label: "grass", color: "#3e8f3a" },
                  { key: "road", label: "road", color: "#0f1013" },
                  { key: "footpath", label: "footpath", color: "#7b7f87" },
                  { key: "water", label: "water", color: "linear-gradient(145deg,#0c4a5e,#248eb0)" },
                  { key: "building", label: "building", color: "#7d8494" },
                ].map((tool) => (
                  <button
                    key={tool.key}
                    type="button"
                    onClick={() => setPaintValue(tool.key)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: paintValue === tool.key ? "#2b334a" : "transparent",
                      color: WHITE,
                      border: "1px solid #3a4157",
                      borderRadius: "6px",
                      padding: "7px 8px",
                      cursor: "pointer",
                      marginBottom: "7px",
                      textAlign: "left",
                      textTransform: "lowercase",
                    }}
                  >
                    <span
                      style={{
                        width: "12px",
                        height: "12px",
                        display: "inline-block",
                        background: tool.color,
                        borderRadius: tool.key === "water" ? "2px" : 0,
                      }}
                    />
                    {tool.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: `repeat(30, ${EDITOR_CELL_PX}px)`,
                  gridAutoRows: `${EDITOR_CELL_PX}px`,
                  gap: 0,
                  background: "#222836",
                  padding: "8px",
                  borderRadius: "8px",
                  width: "fit-content",
                  userSelect: "none",
                  touchAction: "none",
                }}
              >
                {designerGrid.map((row, rowIdx) =>
                  row.map((cell, colIdx) => (
                    <button
                      key={`${rowIdx}-${colIdx}`}
                      type="button"
                      aria-label={`Cell ${rowIdx + 1},${colIdx + 1}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        isPaintDraggingRef.current = true;
                        paintCell(rowIdx, colIdx);
                      }}
                      onPointerEnter={() => {
                        if (isPaintDraggingRef.current) {
                          paintCell(rowIdx, colIdx);
                        }
                      }}
                      style={{
                        width: `${EDITOR_CELL_PX}px`,
                        height: `${EDITOR_CELL_PX}px`,
                        border: "1px solid #3a3f46",
                        borderRadius: 0,
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        background:
                          cell === "road"
                            ? "#0f1013"
                            : cell === "footpath"
                              ? "#7b7f87"
                              : cell === "water"
                                ? "linear-gradient(148deg, #0a3d50 0%, #1a6d88 42%, #2c9ec4 100%)"
                                : cell === "building"
                                  ? "#7d8494"
                                  : "#3e8f3a",
                      }}
                    />
                  ))
                )}
                {editorRoadMidlines.map(({ r, c, mode }) => {
                  const blockPx = EDITOR_CELL_PX;
                  const left = c * EDITOR_CELL_PX;
                  const top = r * EDITOR_CELL_PX;
                  const thick = 6;
                  const alongFrac = 0.52;
                  const alongPx = Math.round(blockPx * alongFrac);
                  const inset = (blockPx - alongPx) * 0.5;
                  const cOff = blockPx * 0.5 - thick * 0.5;
                  const thickStop = 6;
                  const stopWpx = Math.round(blockPx * 0.42);
                  return (
                    <div
                      key={`road-line-${r}-${c}-${mode}`}
                      style={{
                        position: "absolute",
                        left,
                        top,
                        width: blockPx,
                        height: blockPx,
                        pointerEvents: "none",
                        zIndex: 2,
                      }}
                    >
                      {mode === "ew" && (
                        <div
                          style={{
                            position: "absolute",
                            left: inset,
                            top: cOff,
                            width: alongPx,
                            height: thick,
                            background: "rgba(255,255,255,0.9)",
                            borderRadius: 1,
                          }}
                        />
                      )}
                      {mode === "ns" && (
                        <div
                          style={{
                            position: "absolute",
                            left: cOff,
                            top: inset,
                            width: thick,
                            height: alongPx,
                            background: "rgba(255,255,255,0.9)",
                            borderRadius: 1,
                          }}
                        />
                      )}
                      {mode === "stop" && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: Math.max(0, cOff - thickStop - 2),
                            width: stopWpx,
                            height: thickStop,
                            background: "rgba(255,255,255,0.95)",
                            borderRadius: 1,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
