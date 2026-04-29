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
const CELL_TYPES = new Set(["grass", "road", "footpath", "building"]);

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
  if (throughX && throughZ) return "both";
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

export default function SecretGame() {
  const mountRef = useRef(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [paintValue, setPaintValue] = useState("grass"); // "grass" | "road" | "footpath" | "building"
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
    const buildingMats = [
      new THREE.MeshStandardMaterial({ color: "#8f9bad", roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: "#a89b8c", roughness: 0.88 }),
      new THREE.MeshStandardMaterial({ color: "#7f8b7d", roughness: 0.84 }),
      new THREE.MeshStandardMaterial({ color: "#9a8b99", roughness: 0.86 }),
    ];
    const lampLights = [];
    const tileH = Math.max(0.12, CELL * 0.012);
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
        } else {
          const mat = kind === "road" ? roadMat : kind === "footpath" ? pathMat : (r + c) % 2 === 0 ? grassA : grassB;
          const tile = addStatic(new THREE.Mesh(new THREE.BoxGeometry(CELL, tileH, CELL), mat));
          tile.position.set(x, tileH * 0.5, z);
        }
      }
    }

    // White center lines on 1×1 road cells (map editor: one cell; 3D: one cell = CELL wide).
    const lineH2 = Math.max(0.04, CELL * 0.0011);
    const lineT = Math.max(0.2, CELL * 0.005);
    const yLine = tileH + lineH2 * 0.5;
    for (let rr = 0; rr < MAP_GRID; rr += 1) {
      for (let cc = 0; cc < MAP_GRID; cc += 1) {
        const mode = getRoadCellLineMode(cells, rr, cc);
        if (!mode) continue;
        const xMid = -MAP_HALF + (cc + 0.5) * CELL;
        const zMid = MAP_HALF - (rr + 0.5) * CELL;
        const lineL = CELL * 0.82;
        if (mode === "ew" || mode === "both") {
          const m = new THREE.Mesh(new THREE.BoxGeometry(lineL, lineH2, lineT), roadLineMat);
          m.position.set(xMid, yLine, zMid);
          addStatic(m);
        }
        if (mode === "ns" || mode === "both") {
          const m = new THREE.Mesh(new THREE.BoxGeometry(lineT, lineH2, lineL), roadLineMat);
          m.position.set(xMid, yLine, zMid);
          addStatic(m);
        }
      }
    }

    // Player body (prototype): cylinders + spheres for joints.
    const player = new THREE.Group();
    const bodyMeshes = [];
    const addBodyMesh = (mesh, parent = player) => {
      bodyMeshes.push(mesh);
      parent.add(mesh);
      return mesh;
    };

    const skinMat = new THREE.MeshStandardMaterial({ color: "#e7be92", roughness: 0.78 });
    const clothMat = new THREE.MeshStandardMaterial({ color: "#4f6bff", roughness: 0.7 });
    const darkClothMat = new THREE.MeshStandardMaterial({ color: "#2f3e7a", roughness: 0.72 });
    const jointMat = new THREE.MeshStandardMaterial({ color: "#d9ab80", roughness: 0.82 });

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.78, 3.1, 20),
      clothMat
    );
    torso.position.y = 1.55;
    addBodyMesh(torso);

    const hips = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.74, 0.7, 20),
      darkClothMat
    );
    hips.position.y = -0.2;
    addBodyMesh(hips);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.55, 16),
      jointMat
    );
    neck.position.y = 3.35;
    addBodyMesh(neck);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 0.9, 20),
      skinMat
    );
    head.position.y = 4.03;
    addBodyMesh(head);
    const headTopOffsetY = head.position.y + 0.5;

    const armRig = { left: null, right: null };
    const legRig = { left: null, right: null };

    const buildArm = (side) => {
      const elbowX = 1.05 * side;
      const shoulderX = 0.78 * side;
      const elbowLocalX = elbowX - shoulderX;

      const armPivot = new THREE.Group();
      armPivot.position.set(shoulderX, 2.85, 0);
      player.add(armPivot);

      const shoulder = addBodyMesh(
        new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 16), clothMat),
        armPivot
      );
      shoulder.position.set(0, 0, 0);

      const upperArm = addBodyMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 1.1, 14), clothMat),
        armPivot
      );
      upperArm.position.set(elbowLocalX * 0.5, -0.64, 0);
      upperArm.rotation.z = side * 0.22;

      const forearmPivot = new THREE.Group();
      forearmPivot.position.set(elbowLocalX, -1.29, 0);
      armPivot.add(forearmPivot);

      const elbow = addBodyMesh(
        new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 14), clothMat),
        forearmPivot
      );
      elbow.position.set(0, 0, 0);

      const lowerArm = addBodyMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 14), clothMat),
        forearmPivot
      );
      lowerArm.position.set(0, -0.61, 0);

      const wrist = addBodyMesh(
        new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 12), jointMat),
        forearmPivot
      );
      wrist.position.set(0, -1.14, 0);

      const hand = addBodyMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 12), skinMat),
        forearmPivot
      );
      hand.position.set(0.06 * side, -1.39, 0.02);
      hand.rotation.z = Math.PI / 2;

      const rig = {
        side,
        armPivot,
        forearmPivot,
        upperArm,
        hand,
        baseHandX: hand.rotation.x,
      };
      if (side > 0) armRig.right = rig;
      else armRig.left = rig;
    };

    const buildLeg = (side) => {
      const x = 0.5 * side;
      const legPivot = new THREE.Group();
      legPivot.position.set(x, -0.58, 0);
      player.add(legPivot);

      const hipJoint = addBodyMesh(
        new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), darkClothMat),
        legPivot
      );
      hipJoint.position.set(0, 0, 0);

      const upperLeg = addBodyMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 1.45, 14), darkClothMat),
        legPivot
      );
      upperLeg.position.set(0, -0.76, 0);

      const lowerLegPivot = new THREE.Group();
      lowerLegPivot.position.set(0, -1.52, 0);
      legPivot.add(lowerLegPivot);

      const knee = addBodyMesh(
        new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 14), darkClothMat),
        lowerLegPivot
      );
      knee.position.set(0, 0, 0);

      const lowerLeg = addBodyMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.35, 14), darkClothMat),
        lowerLegPivot
      );
      lowerLeg.position.set(0, -0.76, 0);

      const ankle = addBodyMesh(
        new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), jointMat),
        lowerLegPivot
      );
      ankle.position.set(0, -1.45, 0.06);

      const foot = addBodyMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 14), darkClothMat),
        lowerLegPivot
      );
      foot.position.set(0, -1.7, 0.35);
      foot.rotation.x = Math.PI / 2;

      const rig = {
        side,
        legPivot,
        lowerLegPivot,
        upperLeg,
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

    // Lift the whole rig so feet/legs sit above the ground plane and stay visible.
    player.position.set(0, 4.1, 0);
    scene.add(player);

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
    let cameraYawOffset = 0;
    let cameraDistance = 12 * MAP_3D_SCALE;
    let cameraHeight = 7 * MAP_3D_SCALE;

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
      const isSprinting = keys.has(" ");

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

      if (turnInput !== 0) {
        const turnSpeed = 2.8;
        player.rotation.y += turnInput * turnSpeed * dt;
      }

      if (moveInput !== 0) {
        const moveSpeed = (isSprinting ? 22 : 7.5) * MAP_3D_SCALE;
        // Local forward for this rig/camera setup points to +Z.
        forwardDir.set(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
        player.position.addScaledVector(forwardDir, moveInput * moveSpeed * dt);

        // Basic walk cycle: opposite swing on left/right limbs.
        walkPhase += dt * (isSprinting ? 16 : 9.5);
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

        if (isSprinting) {
          // Emit simple sweat droplets from the head while sprinting.
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
        // Ease back to neutral when standing still.
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
          legRig.left.lowerLegPivot.rotation.x = reset(legRig.left.lowerLegPivot.rotation.x, legRig.left.baseLowerPivotX);
          legRig.right.lowerLegPivot.rotation.x = reset(legRig.right.lowerLegPivot.rotation.x, legRig.right.baseLowerPivotX);
          legRig.left.foot.rotation.x = reset(legRig.left.foot.rotation.x, legRig.left.baseFootX);
          legRig.right.foot.rotation.x = reset(legRig.right.foot.rotation.x, legRig.right.baseFootX);
        }
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
      [skinMat, clothMat, darkClothMat, jointMat].forEach((mat) => mat.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, [worldMap]);

  return (
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
          Secret Game
        </h1>
      </div>

      <div
        style={{
          width: "calc(100vw - 64px)",
          maxWidth: "1120px",
          margin: "24px auto 80px",
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
            Player: <strong>Arrow keys</strong>. Sprint: <strong>Space</strong>. Camera: <strong>WASD</strong>.
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
          }}
        />
      </div>

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
              30 &times; 30 grid (auto-saves) &mdash; one cell in the editor is one tile; in 3D each tile is {MAP_3D_SCALE}&times; as wide and deep on the world as before ({MAP_WORLD_SIZE}m map). White lines preview road center marks. 3D updates after a short pause.
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
                    <span style={{ width: "12px", height: "12px", background: tool.color, display: "inline-block" }} />
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
                  const thick = 2;
                  const cOff = blockPx * 0.5 - thick * 0.5;
                  return (
                    <div
                      key={`ew-ns-${r}-${c}`}
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
                      {(mode === "ew" || mode === "both") && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: cOff,
                            width: blockPx,
                            height: thick,
                            background: "rgba(255,255,255,0.9)",
                            borderRadius: 1,
                          }}
                        />
                      )}
                      {(mode === "ns" || mode === "both") && (
                        <div
                          style={{
                            position: "absolute",
                            left: cOff,
                            top: 0,
                            width: thick,
                            height: blockPx,
                            background: "rgba(255,255,255,0.9)",
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
    </div>
  );
}
