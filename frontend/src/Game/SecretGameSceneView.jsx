import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  applyWalkCycle,
  createHumanoidRig,
  NIGHT_WALKER_HERO_COLORS,
  resetPose,
} from "../utils/nightWalkerHumanoid";
import { ENTRY_SIDES } from "./secretGameSceneConfig";
import { detectSceneExit, resolveExitClickTarget } from "./secretGameSceneExit";
import {
  clampWalkTarget,
  isNearWalkPoint,
  isWalkPolygonActive,
  pointInWalkPolygon,
  polygonCentroid,
} from "./secretGameWalkPolygon";

const BASE_CHARACTER_SCALE = 0.44;
const ANKLE_LOCAL_Y = -3.55;
const WALK_SPEED = 3.6;
const WALK_PHASE_SPEED = 11;
const ARRIVE_DIST = 0.12;
const CLOSE_POINT_THRESHOLD = 1.0;

const PLAYER_MIN_X = -9;
const PLAYER_MAX_X = 9;
const PLAYER_MIN_Z = -11;
const PLAYER_MAX_Z = 7;
const WALK_BOUNDS = {
  minX: PLAYER_MIN_X,
  maxX: PLAYER_MAX_X,
  minZ: PLAYER_MIN_Z,
  maxZ: PLAYER_MAX_Z,
};

const Z_NEAR = 6;
const Z_FAR = -10;
const SCALE_NEAR = 0.95;
const SCALE_FAR = 0.6;

const CAMERA_POS = new THREE.Vector3(0, 6.4, 14.2);
const CAMERA_LOOK = new THREE.Vector3(0, 1.05, -2.5);

const WALK_AREA_COLOR = 0xffdd00;

const ENTRY_COLORS = {
  top: 0x00ccff,
  bottom: 0xff66aa,
  left: 0xff9900,
  right: 0xaa66ff,
};

function depthScaleFactor(z) {
  const t = THREE.MathUtils.clamp((z - Z_FAR) / (Z_NEAR - Z_FAR), 0, 1);
  const eased = Math.pow(t, 0.55);
  return THREE.MathUtils.lerp(SCALE_FAR, SCALE_NEAR, eased);
}

function createPlayerGroup() {
  const rig = createHumanoidRig({ ...NIGHT_WALKER_HERO_COLORS, withHeadLamp: false });

  const scalePivot = new THREE.Group();
  const ankleOffsetY = ANKLE_LOCAL_Y * BASE_CHARACTER_SCALE;
  const leanPivot = new THREE.Group();
  leanPivot.position.y = ankleOffsetY;
  rig.group.position.y = -ANKLE_LOCAL_Y * BASE_CHARACTER_SCALE;
  leanPivot.add(rig.group);
  scalePivot.add(leanPivot);

  const outerGroup = new THREE.Group();
  outerGroup.rotation.order = "YXZ";
  outerGroup.add(scalePivot);

  return {
    group: outerGroup,
    scalePivot,
    armRig: rig.armRig,
    legRig: rig.legRig,
    bodyMeshes: rig.bodyMeshes,
    materials: rig.materials,
  };
}

function createClickMarker() {
  const geometry = new THREE.RingGeometry(0.22, 0.34, 28);
  const material = new THREE.MeshBasicMaterial({
    color: "#22ff88",
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.visible = false;
  return { mesh, geometry, material };
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

function rebuildWalkAreaVisual(group, points, { closed, fillOpacity }) {
  disposeObject3D(group);
  group.clear();

  if (!points || points.length < 1) return;

  const y = 0.035;
  const linePoints = points.map((p) => new THREE.Vector3(p.x, y, p.z));
  if (closed && points.length >= 3) {
    linePoints.push(new THREE.Vector3(points[0].x, y, points[0].z));
  }
  if (linePoints.length >= 2) {
    const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
    const line = new THREE.Line(
      lineGeom,
      new THREE.LineBasicMaterial({ color: WALK_AREA_COLOR, transparent: true, opacity: 0.95 })
    );
    group.add(line);
  }

  for (const p of points) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 12),
      new THREE.MeshBasicMaterial({ color: WALK_AREA_COLOR })
    );
    dot.position.set(p.x, y + 0.02, p.z);
    group.add(dot);
  }

  if (closed && points.length >= 3) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].z);
    }
    shape.closePath();
    const fillGeom = new THREE.ShapeGeometry(shape);
    fillGeom.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(
      fillGeom,
      new THREE.MeshBasicMaterial({
        color: WALK_AREA_COLOR,
        transparent: true,
        opacity: fillOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    fill.position.y = y;
    group.add(fill);
  }
}

function rebuildEntryPointsVisual(group, entryPoints, activeSide) {
  disposeObject3D(group);
  group.clear();

  const y = 0.05;
  for (const side of ENTRY_SIDES) {
    const point = entryPoints?.[side];
    if (!point) continue;

    const color = ENTRY_COLORS[side];
    const isActive = side === activeSide;
    const radius = isActive ? 0.22 : 0.16;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.72, radius, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isActive ? 0.95 : 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point.x, y, point.z);
    group.add(ring);

    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.45, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isActive ? 1 : 0.8 })
    );
    dot.position.set(point.x, y + 0.02, point.z);
    group.add(dot);
  }
}

export default function SecretGameSceneView({
  sceneSrc,
  sceneLabel,
  walkPolygon = [],
  entryPoints = {},
  sceneLinks = {},
  initialSpawn = null,
  interactionMode = "play",
  defineEntrySide = null,
  onWalkPolygonComplete,
  onEntryPointComplete,
  onDefinePathCancel,
  onDefineEntryCancel,
  onSceneExit,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const interactionModeRef = useRef(interactionMode);
  const defineEntrySideRef = useRef(defineEntrySide);
  const walkPolygonRef = useRef(walkPolygon);
  const entryPointsRef = useRef(entryPoints);
  const sceneLinksRef = useRef(sceneLinks);
  const initialSpawnRef = useRef(initialSpawn);
  const onWalkPolygonCompleteRef = useRef(onWalkPolygonComplete);
  const onEntryPointCompleteRef = useRef(onEntryPointComplete);
  const onDefinePathCancelRef = useRef(onDefinePathCancel);
  const onDefineEntryCancelRef = useRef(onDefineEntryCancel);
  const onSceneExitRef = useRef(onSceneExit);
  const draftPointsRef = useRef([]);
  const overlayGroupRef = useRef(null);
  const redrawOverlayRef = useRef(() => {});
  const setPlayerPositionRef = useRef(() => {});

  useEffect(() => {
    interactionModeRef.current = interactionMode;
    defineEntrySideRef.current = defineEntrySide;
    if (interactionMode === "definePath") {
      draftPointsRef.current = [...walkPolygonRef.current];
    } else {
      draftPointsRef.current = [];
    }
    redrawOverlayRef.current();
  }, [interactionMode, defineEntrySide]);

  useEffect(() => {
    walkPolygonRef.current = walkPolygon;
    if (interactionModeRef.current === "definePath") {
      redrawOverlayRef.current();
    }
  }, [walkPolygon]);

  useEffect(() => {
    entryPointsRef.current = entryPoints;
    if (interactionModeRef.current === "defineEntry") {
      redrawOverlayRef.current();
    }
  }, [entryPoints]);

  useEffect(() => {
    sceneLinksRef.current = sceneLinks;
  }, [sceneLinks]);

  useEffect(() => {
    initialSpawnRef.current = initialSpawn;
    setPlayerPositionRef.current?.(initialSpawn);
  }, [initialSpawn]);

  useEffect(() => {
    onWalkPolygonCompleteRef.current = onWalkPolygonComplete;
  }, [onWalkPolygonComplete]);

  useEffect(() => {
    onEntryPointCompleteRef.current = onEntryPointComplete;
  }, [onEntryPointComplete]);

  useEffect(() => {
    onDefinePathCancelRef.current = onDefinePathCancel;
  }, [onDefinePathCancel]);

  useEffect(() => {
    onDefineEntryCancelRef.current = onDefineEntryCancel;
  }, [onDefineEntryCancel]);

  useEffect(() => {
    onSceneExitRef.current = onSceneExit;
  }, [onSceneExit]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    camera.position.copy(CAMERA_POS);
    camera.lookAt(CAMERA_LOOK);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xfff4e8, 1.05);
    keyLight.position.set(4, 10, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xa8c8ff, 0.42);
    fillLight.position.set(-6, 5, 4);
    scene.add(fillLight);

    const overlayGroup = new THREE.Group();
    scene.add(overlayGroup);
    overlayGroupRef.current = overlayGroup;

    const player = createPlayerGroup();
    scene.add(player.group);

    const clickMarker = createClickMarker();
    scene.add(clickMarker.mesh);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();

    const defaultSpawn = () => {
      const spawn = initialSpawnRef.current || polygonCentroid(walkPolygonRef.current);
      return { x: spawn.x, z: spawn.z };
    };

    let playerX = defaultSpawn().x;
    let playerZ = defaultSpawn().z;
    let targetX = playerX;
    let targetZ = playerZ;
    let hasTarget = false;
    let walkPhase = 0;
    let markerPulse = 0;
    let exitTriggered = false;
    let rafId = 0;
    let lastT = performance.now();

    const applyPlayerPosition = (spawn) => {
      const next = spawn || defaultSpawn();
      playerX = next.x;
      playerZ = next.z;
      targetX = next.x;
      targetZ = next.z;
      hasTarget = false;
      clickMarker.mesh.visible = false;
    };
    setPlayerPositionRef.current = applyPlayerPosition;

    const redrawOverlay = () => {
      const mode = interactionModeRef.current;
      if (mode === "definePath") {
        const points = draftPointsRef.current;
        rebuildWalkAreaVisual(overlayGroup, points, {
          closed: false,
          fillOpacity: 0.14,
        });
        if (points.length >= 3) {
          const y = 0.035;
          const preview = [...points, points[0]].map((p) => new THREE.Vector3(p.x, y, p.z));
          const previewGeom = new THREE.BufferGeometry().setFromPoints(preview);
          const previewLine = new THREE.Line(
            previewGeom,
            new THREE.LineDashedMaterial({
              color: WALK_AREA_COLOR,
              transparent: true,
              opacity: 0.45,
              dashSize: 0.35,
              gapSize: 0.2,
            })
          );
          previewLine.computeLineDistances();
          overlayGroup.add(previewLine);
        }
        return;
      }

      if (mode === "defineEntry") {
        rebuildEntryPointsVisual(
          overlayGroup,
          entryPointsRef.current,
          defineEntrySideRef.current
        );
        return;
      }

      disposeObject3D(overlayGroup);
      overlayGroup.clear();
    };
    redrawOverlayRef.current = redrawOverlay;
    redrawOverlay();

    const screenToGround = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
      return { x: hitPoint.x, z: hitPoint.z };
    };

    const resolveWalkPoint = (raw) => {
      if (!raw) return null;
      if (interactionModeRef.current !== "play") {
        return { x: raw.x, z: raw.z };
      }
      return clampWalkTarget(raw.x, raw.z, walkPolygonRef.current, WALK_BOUNDS);
    };

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      const raw = screenToGround(e.clientX, e.clientY);
      if (!raw) return;

      if (interactionModeRef.current === "definePath") {
        const draft = draftPointsRef.current;
        if (draft.length >= 3 && isNearWalkPoint(raw.x, raw.z, draft[0], CLOSE_POINT_THRESHOLD)) {
          onWalkPolygonCompleteRef.current?.(draft.map((p) => ({ x: p.x, z: p.z })));
          draftPointsRef.current = [];
          redrawOverlay();
          return;
        }
        draftPointsRef.current = [...draft, { x: raw.x, z: raw.z }];
        redrawOverlay();
        return;
      }

      if (interactionModeRef.current === "defineEntry") {
        const side = defineEntrySideRef.current;
        if (!side) return;
        const point = { x: raw.x, z: raw.z };
        onEntryPointCompleteRef.current?.(side, point);
        redrawOverlay();
        return;
      }

      const exitClick = resolveExitClickTarget(raw.x, raw.z, entryPointsRef.current, sceneLinksRef.current);
      if (exitClick) {
        targetX = exitClick.x;
        targetZ = exitClick.z;
        hasTarget = true;
        clickMarker.mesh.position.set(targetX, 0.04, targetZ);
        clickMarker.mesh.visible = true;
        markerPulse = 0;
        return;
      }

      const dest = resolveWalkPoint(raw);
      if (!dest) return;
      if (
        isWalkPolygonActive(walkPolygonRef.current) &&
        !pointInWalkPolygon(dest.x, dest.z, walkPolygonRef.current)
      ) {
        return;
      }
      targetX = dest.x;
      targetZ = dest.z;
      hasTarget = true;
      clickMarker.mesh.position.set(targetX, 0.04, targetZ);
      clickMarker.mesh.visible = true;
      markerPulse = 0;
    };

    const onKeyDown = (e) => {
      const mode = interactionModeRef.current;
      if (mode === "definePath") {
        if (e.key === "Escape") {
          draftPointsRef.current = [];
          redrawOverlay();
          onDefinePathCancelRef.current?.();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          draftPointsRef.current = draftPointsRef.current.slice(0, -1);
          redrawOverlay();
        }
        return;
      }
      if (mode === "defineEntry" && e.key === "Escape") {
        onDefineEntryCancelRef.current?.();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 1 || h < 1) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const tick = (now) => {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      if (interactionModeRef.current === "play") {
        const walkingToExit =
          hasTarget &&
          Boolean(
            resolveExitClickTarget(
              targetX,
              targetZ,
              entryPointsRef.current,
              sceneLinksRef.current
            )
          );

        const dx = targetX - playerX;
        const dz = targetZ - playerZ;
        const dist = Math.hypot(dx, dz);
        const moving = hasTarget && dist > ARRIVE_DIST;

        if (moving) {
          const step = Math.min(dist, WALK_SPEED * dt);
          const nx = dx / dist;
          const nz = dz / dist;
          const nextX = playerX + nx * step;
          const nextZ = playerZ + nz * step;
          if (walkingToExit) {
            playerX = nextX;
            playerZ = nextZ;
          } else {
            const clamped = clampWalkTarget(nextX, nextZ, walkPolygonRef.current, WALK_BOUNDS);
            playerX = clamped.x;
            playerZ = clamped.z;
          }
          walkPhase += dt * WALK_PHASE_SPEED;
          applyWalkCycle(player.armRig, player.legRig, walkPhase);
          player.group.rotation.y = Math.atan2(dx, dz);
        } else {
          if (hasTarget && dist <= ARRIVE_DIST) {
            if (walkingToExit) {
              playerX = targetX;
              playerZ = targetZ;
            } else {
              const arrived = clampWalkTarget(targetX, targetZ, walkPolygonRef.current, WALK_BOUNDS);
              playerX = arrived.x;
              playerZ = arrived.z;
            }
            clickMarker.mesh.visible = false;
            hasTarget = false;
          }
          resetPose(player.armRig, player.legRig);
        }

        if (isWalkPolygonActive(walkPolygonRef.current) && !walkingToExit) {
          const inside = clampWalkTarget(playerX, playerZ, walkPolygonRef.current, WALK_BOUNDS);
          playerX = inside.x;
          playerZ = inside.z;
        }

        if (!exitTriggered) {
          const exitDirection = detectSceneExit(
            playerX,
            playerZ,
            targetX,
            targetZ,
            hasTarget,
            entryPointsRef.current,
            sceneLinksRef.current
          );
          if (exitDirection) {
            exitTriggered = true;
            hasTarget = false;
            clickMarker.mesh.visible = false;
            onSceneExitRef.current?.(exitDirection);
          }
        }
      }

      const depthScale = depthScaleFactor(playerZ);
      player.scalePivot.scale.setScalar(BASE_CHARACTER_SCALE * depthScale);
      player.group.position.set(playerX, 0, playerZ);

      if (clickMarker.mesh.visible) {
        markerPulse += dt * 5;
        clickMarker.material.opacity = 0.55 + Math.sin(markerPulse) * 0.25;
        const pulse = 1 + Math.sin(markerPulse * 1.4) * 0.08;
        clickMarker.mesh.scale.set(pulse, pulse, pulse);
      }

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      setPlayerPositionRef.current = () => {};
      disposeObject3D(overlayGroup);
      clickMarker.geometry.dispose();
      clickMarker.material.dispose();
      player.bodyMeshes.forEach((mesh) => mesh.geometry.dispose());
      player.materials.forEach((mat) => mat.dispose());
      renderer.dispose();
    };
  }, []);

  const editing = interactionMode === "definePath" || interactionMode === "defineEntry";

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <img
        src={sceneSrc}
        alt={sceneLabel}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: editing ? "crosshair" : "crosshair",
        }}
      />
    </div>
  );
}
