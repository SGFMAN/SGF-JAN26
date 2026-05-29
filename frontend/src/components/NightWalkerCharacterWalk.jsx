import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { createHumanoidRig, NIGHT_WALKER_HERO_COLORS } from "../utils/nightWalkerHumanoid";
import { getSecretAreaWsUrl } from "../utils/secretAreaWs";

const WALK_BOUNDS = 52;
const PLAYER_Y = 4.1;
const MOVE_SPEED = 7.5;
const TURN_SPEED = 2.8;
const CAMERA_DISTANCE = 12;
const CAMERA_HEIGHT = 7;
const STATE_SEND_INTERVAL_MS = 50;
const PI2 = Math.PI * 2;

const SLOT_COLORS = [
  { ...NIGHT_WALKER_HERO_COLORS, withHeadLamp: true },
  {
    skinColor: "#e7be92",
    clothColor: "#43a047",
    darkClothColor: "#2e6b32",
    jointColor: "#d9ab80",
    withHeadLamp: true,
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

function addPlayerToScene(scene, slot, isLocal) {
  const palette = { ...SLOT_COLORS[slot] };
  if (!isLocal) palette.withHeadLamp = false;
  const rig = createHumanoidRig(palette);
  scene.add(rig.group);
  return {
    id: null,
    slot,
    group: rig.group,
    armRig: rig.armRig,
    legRig: rig.legRig,
    headLampPivot: rig.headLampPivot,
    bodyMeshes: rig.bodyMeshes,
    materials: rig.materials,
    walkPhase: 0,
    moving: false,
    targetX: 0,
    targetZ: 0,
    targetRy: 0,
  };
}

function disposePlayer(scene, player) {
  scene.remove(player.group);
  player.bodyMeshes.forEach((mesh) => mesh.geometry.dispose());
  player.materials.forEach((m) => m.dispose());
}

/**
 * Secret area — up to two players via WebSocket; arrow keys move your character.
 */
export default function NightWalkerCharacterWalk({ onRoomFull }) {
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
    let headLampTarget = null;
    let headLampGroundDecal = null;
    let animateFn = null;

    function ensureRemote(playerData) {
      if (playerData.id === localPlayerId || remotes.has(playerData.id)) return;
      const remote = addPlayerToScene(scene, playerData.slot, false);
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
      scene.fog = new THREE.Fog("#0a1830", 40, 140);

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

      const groundSize = WALK_BOUNDS * 2 + 24;
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(groundSize, groundSize),
        new THREE.MeshStandardMaterial({ color: "#3a6b35", roughness: 0.95, metalness: 0.04 })
      );
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);

      localPlayer = addPlayerToScene(scene, localSlot, true);
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

      const headLampGroundY = 0.04;
      headLampTarget = new THREE.Object3D();
      scene.add(headLampTarget);
      const headLampSpot = new THREE.SpotLight(0xfff0dd, 4.6, 120, 1.12, 0.78, 1.4);
      headLampSpot.target = headLampTarget;
      if (localPlayer.headLampPivot) localPlayer.headLampPivot.add(headLampSpot);

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
        transparent: true,
        depthWrite: false,
      });
      headLampGroundDecal = new THREE.Mesh(new THREE.CircleGeometry(10, 64), groundSpotMat);
      headLampGroundDecal.rotation.x = -Math.PI / 2;
      headLampGroundDecal.renderOrder = 2;
      scene.add(headLampGroundDecal);

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
      const headLampGroundPt = new THREE.Vector3();
      const headLampRight = new THREE.Vector3();
      let headLampSwaySmoothed = 0;

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
        const { armRig, legRig, headLampPivot } = localPlayer;

        const turnInput =
          (keys.has("arrowleft") ? 1 : 0) + (keys.has("arrowright") ? -1 : 0);
        const moveInput =
          (keys.has("arrowup") ? 1 : 0) + (keys.has("arrowdown") ? -1 : 0);
        const moving = moveInput !== 0;

        if (turnInput !== 0) {
          player.rotation.y += turnInput * TURN_SPEED * dt;
        }

        if (moving) {
          forwardDir.set(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
          player.position.addScaledVector(forwardDir, moveInput * MOVE_SPEED * dt);
          player.position.x = Math.max(-WALK_BOUNDS, Math.min(WALK_BOUNDS, player.position.x));
          player.position.z = Math.max(-WALK_BOUNDS, Math.min(WALK_BOUNDS, player.position.z));
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

        for (const remote of remotes.values()) {
          lerpRemote(remote, dt);
        }

        if (headLampPivot) {
          const lampLead = 7.6;
          const ryLamp = player.rotation.y;
          const swayTarget = moving ? Math.sin(localPlayer.walkPhase) * 0.675 : 0;
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
          headLampGroundDecal.position.set(
            headLampGroundPt.x,
            headLampGroundY + 0.028,
            headLampGroundPt.z
          );
        }

        cameraQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
        rotatedCameraOffset.copy(cameraOffset).applyQuaternion(cameraQuat);
        cameraTarget.copy(player.position).add(rotatedCameraOffset);
        camera.position.lerp(cameraTarget, 0.08);
        lookTarget.copy(player.position).add(new THREE.Vector3(0, 2.3, 0));
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
        scene.remove(ground);
        ground.geometry.dispose();
        ground.material.dispose();
        disposePlayer(scene, localPlayer);
        for (const remote of remotes.values()) {
          disposePlayer(scene, remote);
        }
        remotes.clear();
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
    }

    connect();

    return () => {
      disposed = true;
      if (typeof mountEl._secretCleanup === "function") mountEl._secretCleanup();
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

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
