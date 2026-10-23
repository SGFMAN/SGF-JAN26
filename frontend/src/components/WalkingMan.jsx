import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const MODEL_URL = "/models/walker.glb";
const EYE_HEIGHT = 1.65;
const PACK_COUNT = 100;
const MEET_DISTANCE = 0.95;
const WALK_SPEED = 1.4;
const FIGHT_TIME = 1.2;
const FALL_TIME = 0.65;

function arenaRadius(count) {
  return Math.min(14, 4.2 + 0.98 * Math.sqrt(count));
}

function matchDistance(radius) {
  return ((radius + 0.55) / Math.tan(THREE.MathUtils.degToRad(21))) * 0.88;
}

function pointInCircle(radius) {
  const max = Math.max(0.3, radius - 0.8);
  const r = Math.sqrt(Math.random()) * max;
  const a = Math.random() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

function paintGrass() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const paint = canvas.getContext("2d");
  paint.fillStyle = "#2f8a36";
  paint.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i += 1) {
    paint.fillStyle = i % 2 ? "#267a2c" : "#43a048";
    paint.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  paint.globalAlpha = 0.14;
  for (let y = 0; y < 256; y += 32) {
    paint.fillStyle = (y / 32) % 2 ? "#ffffff" : "#000000";
    paint.fillRect(0, y, 256, 32);
  }
  return canvas;
}

export default function WalkingMan() {
  const mountRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [count, setCount] = useState(PACK_COUNT);
  const [showWinner, setShowWinner] = useState(false);
  const countRef = useRef(PACK_COUNT);
  const restartRef = useRef(() => {});
  countRef.current = count;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let alive = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#8ebbe0");
    scene.fog = new THREE.Fog("#8ebbe0", 55, 120);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
    let yaw = 0.35;
    let zoom = 1;
    let winnerOrbit = false;
    const distanceRef = { current: matchDistance(arenaRadius(PACK_COUNT)) };
    const look = { x: 0, z: 0 };
    const radiusRef = { current: arenaRadius(PACK_COUNT) };
    const winnerRef = { current: false };
    let winnerIndex = -1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.zIndex = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xd5ecff, 0x3e7a32, 0.75));
    const sun = new THREE.DirectionalLight(0xfff6e4, 1.7);
    sun.position.set(8, 14, 6);
    scene.add(sun);

    const grassTex = new THREE.CanvasTexture(paintGrass());
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(18, 18);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.4, 128),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    scene.add(ring);

    const clock = new THREE.Clock();
    const men = [];
    const agents = [];
    let frame = 0;
    let source = null;
    let centerX = 0;
    let centerZ = 0;
    let footDrop = 0;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w < 1 || h < 1) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let dragging = false;
    let lastX = 0;
    const onDown = (event) => {
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.style.cursor = "grabbing";
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      yaw -= dx * 0.008;
    };
    const onUp = () => {
      dragging = false;
      renderer.domElement.style.cursor = "grab";
    };
    const onWheel = (event) => {
      event.preventDefault();
      zoom = Math.min(3.5, Math.max(0.22, zoom * Math.exp(event.deltaY * 0.0011)));
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const placeCamera = (delta) => {
      const champ = winnerIndex >= 0 ? agents[winnerIndex] : null;
      const aimX = winnerRef.current && champ ? champ.x : 0;
      const aimZ = winnerRef.current && champ ? champ.z : 0;
      const aimDist = (winnerRef.current ? 4.1 : matchDistance(radiusRef.current)) * zoom;
      const blend = Math.min(1, delta * 2.4);
      look.x += (aimX - look.x) * blend;
      look.z += (aimZ - look.z) * blend;
      distanceRef.current += (aimDist - distanceRef.current) * blend;
      const zoomSettled = Math.abs(aimDist - distanceRef.current) < 0.2
        && Math.hypot(aimX - look.x, aimZ - look.z) < 0.25;
      winnerOrbit = winnerRef.current && (winnerOrbit || zoomSettled);
      if (winnerOrbit && !dragging) yaw += delta * 0.4;
      camera.position.set(
        look.x + Math.sin(yaw) * distanceRef.current,
        EYE_HEIGHT,
        look.z + Math.cos(yaw) * distanceRef.current
      );
      camera.lookAt(look.x, winnerRef.current ? 1.25 : 1.05, look.z);
    };

    const setRing = (radius) => {
      ring.geometry.dispose();
      ring.geometry = new THREE.RingGeometry(Math.max(0.3, radius - 0.2), radius + 0.2, 160);
    };

    const clampInside = (agent) => {
      const limit = Math.max(0.4, radiusRef.current - 0.6);
      const d = Math.hypot(agent.x, agent.z);
      if (d > limit) {
        agent.x *= limit / d;
        agent.z *= limit / d;
      }
    };

    const nearestRoamer = (index) => {
      const n = Math.max(0, countRef.current | 0);
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < n; j += 1) {
        if (j === index || agents[j].state !== "roam") continue;
        const d = Math.hypot(agents[j].x - agents[index].x, agents[j].z - agents[index].z);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best;
    };

    const aimAtNearest = (index) => {
      const agent = agents[index];
      const other = nearestRoamer(index);
      if (other >= 0) {
        agent.tx = agents[other].x;
        agent.tz = agents[other].z;
        return;
      }
      const spot = pointInCircle(radiusRef.current);
      agent.tx = spot.x;
      agent.tz = spot.z;
    };

    const setMode = (agent, mode) => {
      if (agent.mode === mode) return;
      agent.mode = mode;
      agent.mixer.timeScale = 1;
      if (mode === "idle" && agent.idle) {
        agent.idle.reset().fadeIn(0.12).play();
        agent.walk?.fadeOut(0.12);
      } else if (agent.walk) {
        agent.walk.reset().fadeIn(0.15).play();
        agent.idle?.fadeOut(0.15);
      }
    };

    const placeMan = (agent, man, extraX = 0, extraZ = 0) => {
      man.position.set(agent.x - centerX + extraX, -footDrop, agent.z - centerZ + extraZ);
      man.rotation.order = "YXZ";
      man.rotation.y = agent.heading;
      man.rotation.z = 0;
      man.rotation.x = agent.state === "down" ? -agent.fall * (Math.PI / 2) : 0;
    };

    const resetBout = (nextCount) => {
      const shown = Math.max(1, Math.min(PACK_COUNT, nextCount | 0));
      const radius = arenaRadius(shown);
      radiusRef.current = radius;
      setRing(radius);
      winnerRef.current = false;
      winnerOrbit = false;
      winnerIndex = -1;
      setShowWinner(false);
      const used = [];
      for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const man = men[i];
        if (i >= shown) {
          agent.state = "out";
          man.visible = false;
          continue;
        }
        let spot = pointInCircle(radius);
        for (let attempt = 0; attempt < 16; attempt += 1) {
          const clear = used.every((p) => Math.hypot(p.x - spot.x, p.z - spot.z) > 1.05);
          if (clear) break;
          spot = pointInCircle(radius);
        }
        used.push(spot);
        agent.x = spot.x;
        agent.z = spot.z;
        agent.tx = spot.x;
        agent.tz = spot.z;
        agent.state = "roam";
        agent.timer = 0;
        agent.opponent = -1;
        agent.fall = 0;
        agent.seekT = Math.random() * 0.3;
        agent.heading = Math.random() * Math.PI * 2;
        agent.mode = "";
        man.visible = true;
        agent.mixer.timeScale = 1;
        if (agent.walk) {
          agent.walk.reset().play();
          agent.mixer.setTime(Math.random() * (agent.walk.getClip()?.duration || 1));
        }
        agent.idle?.stop();
        agent.mode = "walk";
        aimAtNearest(i);
        placeMan(agent, man);
      }
    };
    restartRef.current = () => resetBout(countRef.current);

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (!alive) return;
        source = gltf.scene;
        source.traverse((obj) => {
          if (!obj.isMesh) return;
          obj.frustumCulled = false;
          if (/eyebrow|eyelash|hairline|ankle lining|teeth|held accessory/i.test(obj.name)) {
            obj.visible = false;
          }
        });
        const box = new THREE.Box3().setFromObject(source);
        const center = box.getCenter(new THREE.Vector3());
        centerX = center.x;
        centerZ = center.z;
        footDrop = box.min.y;
        const walkClip =
          gltf.animations.find((item) => item.name === "Walk_Relaxed") ||
          gltf.animations.find((item) => /walk/i.test(item.name)) ||
          gltf.animations[0];
        const idleClip = gltf.animations.find((item) => item.name === "Idle_Standing");
        const handleGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.1, 8);
        const guardGeo = new THREE.BoxGeometry(0.058, 0.01, 0.02);
        const bladeGeo = new THREE.CylinderGeometry(0.0015, 0.013, 0.2, 4);
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.72, metalness: 0.05 });
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x8d8f96, roughness: 0.35, metalness: 0.75 });
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd5d8e0, roughness: 0.22, metalness: 0.9 });
        const putDagger = (man) => {
          const hand = man.getObjectByName("hand_r");
          if (!hand) return;
          const dagger = new THREE.Group();
          const handle = new THREE.Mesh(handleGeo, handleMat);
          handle.position.y = 0.02;
          const guard = new THREE.Mesh(guardGeo, guardMat);
          guard.position.y = 0.075;
          const blade = new THREE.Mesh(bladeGeo, bladeMat);
          blade.position.y = 0.18;
          blade.rotation.y = Math.PI / 4;
          dagger.add(handle, guard, blade);
          dagger.position.set(0.012, 0.045, 0.028);
          dagger.traverse((obj) => {
            if (obj.isMesh) obj.frustumCulled = false;
          });
          hand.add(dagger);
        };
        const chestNumber = (n) => {
          const canvas = document.createElement("canvas");
          canvas.width = 128;
          canvas.height = 80;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, 128, 80);
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 64px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 8;
          ctx.strokeStyle = "rgba(6, 17, 39, 0.85)";
          ctx.strokeText(String(n), 64, 42);
          ctx.fillText(String(n), 64, 42);
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          const geo = new THREE.PlaneGeometry(0.26, 0.16);
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          });
          const front = new THREE.Mesh(geo, mat);
          front.position.set(centerX, 1.16, 0.16);
          front.renderOrder = 2;
          const back = new THREE.Mesh(geo, mat);
          back.position.set(centerX, 1.16, -0.135);
          back.rotation.y = Math.PI;
          back.renderOrder = 2;
          const badges = new THREE.Group();
          badges.add(front, back);
          return badges;
        };

        for (let index = 0; index < PACK_COUNT; index += 1) {
          const man = cloneSkeleton(source);
          man.traverse((obj) => {
            if (obj.isMesh) obj.frustumCulled = false;
          });
          man.rotation.order = "YXZ";
          putDagger(man);
          man.add(chestNumber(index + 1));
          scene.add(man);
          const mixer = new THREE.AnimationMixer(man);
          const walk = walkClip ? mixer.clipAction(walkClip) : null;
          const idle = idleClip ? mixer.clipAction(idleClip) : null;
          if (walk) {
            walk.setLoop(THREE.LoopRepeat, Infinity);
            walk.play();
          }
          if (idle) idle.setLoop(THREE.LoopRepeat, Infinity);
          men.push(man);
          agents.push({
            x: 0,
            z: 0,
            tx: 0,
            tz: 0,
            state: "out",
            timer: 0,
            opponent: -1,
            fall: 0,
            seekT: 0,
            heading: 0,
            mode: "",
            mixer,
            walk,
            idle,
            armR: man.getObjectByName("upperarm_r"),
            armL: man.getObjectByName("upperarm_l"),
          });
        }
        resetBout(countRef.current);
        setStatus("ready");
      },
      undefined,
      () => {
        if (alive) setStatus("error");
      }
    );

    let tickFailed = false;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.05);
      try {
      const n = Math.min(agents.length, Math.max(0, countRef.current | 0));

      if (!winnerRef.current && n > 0) {
        const taken = new Set();
        for (let i = 0; i < n; i += 1) {
          if (agents[i].state !== "roam" || taken.has(i)) continue;
          let best = -1;
          let bestD = MEET_DISTANCE;
          for (let j = i + 1; j < n; j += 1) {
            if (agents[j].state !== "roam" || taken.has(j)) continue;
            const d = Math.hypot(agents[i].x - agents[j].x, agents[i].z - agents[j].z);
            if (d < bestD) {
              bestD = d;
              best = j;
            }
          }
          if (best >= 0) {
            taken.add(i);
            taken.add(best);
            agents[i].state = "fight";
            agents[best].state = "fight";
            agents[i].opponent = best;
            agents[best].opponent = i;
            agents[i].timer = 0;
            setMode(agents[i], "idle");
            setMode(agents[best], "idle");
          }
        }

        for (let i = 0; i < n; i += 1) {
          const agent = agents[i];
          if (agent.state === "fight" && i < agent.opponent) {
            agent.timer += delta;
            const other = agents[agent.opponent];
            if (agent.timer >= FIGHT_TIME) {
              const loser = Math.random() < 0.5 ? i : agent.opponent;
              const winner = loser === i ? agent.opponent : i;
              agents[loser].state = "down";
              agents[loser].fall = 0;
              agents[loser].opponent = -1;
              agents[loser].mixer.timeScale = 0;
              agents[winner].state = "roam";
              agents[winner].opponent = -1;
              agents[winner].timer = 0;
              setMode(agents[winner], "walk");
              aimAtNearest(winner);
            } else {
              agent.heading = Math.atan2(other.x - agent.x, other.z - agent.z);
              other.heading = Math.atan2(agent.x - other.x, agent.z - other.z);
            }
          } else if (agent.state === "down") {
            agent.fall = Math.min(1, agent.fall + delta / FALL_TIME);
          } else if (agent.state === "roam" && !taken.has(i)) {
            agent.seekT -= delta;
            if (agent.seekT <= 0) {
              aimAtNearest(i);
              agent.seekT = 0.4;
            }
            const dx = agent.tx - agent.x;
            const dz = agent.tz - agent.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 0.4) aimAtNearest(i);
            else {
              const step = Math.min(dist, WALK_SPEED * delta);
              agent.x += (dx / dist) * step;
              agent.z += (dz / dist) * step;
              agent.heading = Math.atan2(dx, dz);
              clampInside(agent);
            }
          }
        }

        let aliveCount = 0;
        let falling = false;
        let champ = -1;
        for (let i = 0; i < n; i += 1) {
          const state = agents[i].state;
          if (state === "roam" || state === "fight") {
            aliveCount += 1;
            champ = i;
          } else if (state === "down" && agents[i].fall < 1) falling = true;
        }
        if (aliveCount === 1 && champ >= 0 && agents[champ].state === "roam" && !falling) {
          agents[champ].state = "winner";
          setMode(agents[champ], "idle");
          agents[champ].mixer.update(0.05);
          agents[champ].mixer.timeScale = 0;
          winnerIndex = champ;
          winnerRef.current = true;
          setShowWinner(true);
        }
      }

      for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const man = men[i];
        if (!man || agent.state === "out") continue;
        if (agent.mixer.timeScale !== 0) agent.mixer.update(delta);
        let extraX = 0;
        let extraZ = 0;
        if (agent.state === "fight" && agent.opponent >= 0 && agents[agent.opponent]) {
          const lead = i < agent.opponent ? agent : agents[agent.opponent];
          const other = agents[agent.opponent];
          const dx = other.x - agent.x;
          const dz = other.z - agent.z;
          const len = Math.hypot(dx, dz) || 1;
          const lunge = Math.sin((lead?.timer || 0) * 16) * 0.16;
          extraX = (dx / len) * lunge;
          extraZ = (dz / len) * lunge;
          const swing = Math.sin((lead?.timer || 0) * 28);
          if (agent.armR) agent.armR.rotation.x -= 1.15 + swing * 0.85;
          if (agent.armL) agent.armL.rotation.x -= 0.45 + Math.sin(swing * Math.PI) * 0.4;
        }
        placeMan(agent, man, extraX, extraZ);
      }
      } catch (err) {
        if (!tickFailed) {
          console.error(err);
          tickFailed = true;
        }
      }

      placeCamera(delta);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      alive = false;
      restartRef.current = () => {};
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      agents.forEach((agent) => agent.mixer?.stopAllAction());
      const seen = new Set();
      const disposeRoot = (root) => {
        root?.traverse((obj) => {
          if (obj.geometry && !seen.has(obj.geometry)) {
            seen.add(obj.geometry);
            obj.geometry.dispose();
          }
          const materials = obj.material
            ? Array.isArray(obj.material)
              ? obj.material
              : [obj.material]
            : [];
          materials.forEach((material) => {
            if (seen.has(material)) return;
            seen.add(material);
            Object.values(material).forEach((value) => {
              if (value && value.isTexture) value.dispose();
            });
            material.dispose();
          });
        });
      };
      disposeRoot(scene);
      disposeRoot(source);
      grassTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    restartRef.current();
  }, [count]);

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0 }}>
      {status !== "ready" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.92)",
            fontSize: "0.95rem",
            pointerEvents: "none",
            textShadow: "0 1px 4px rgba(0,0,0,0.45)",
          }}
        >
          {status === "error" ? "Could not load the walker." : "Loading walkers…"}
        </div>
      ) : null}
      {showWinner ? (
        <div
          style={{
            position: "absolute",
            top: "16%",
            left: 0,
            right: 0,
            zIndex: 4,
            textAlign: "center",
            color: "#ffffff",
            fontSize: "4.2rem",
            fontWeight: 800,
            letterSpacing: "0.14em",
            pointerEvents: "none",
            textShadow: "0 3px 18px rgba(0,0,0,0.55)",
          }}
        >
          WINNER
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 8,
          padding: "16px 22px 14px",
          background: "linear-gradient(transparent, rgba(6, 17, 39, 0.78))",
          color: "rgba(255,255,255,0.92)",
          fontSize: "0.85rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => restartRef.current()}
            style={{
              border: "1px solid rgba(255,255,255,0.75)",
              background: "rgba(6, 17, 39, 0.72)",
              color: "white",
              borderRadius: 8,
              padding: "6px 14px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Start Over
          </button>
        </div>
        <div style={{ textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{count}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
          <span>1</span>
          <input
            type="range"
            min={1}
            max={PACK_COUNT}
            value={count}
            aria-label="Number of men"
            onChange={(event) => setCount(Number(event.target.value))}
            style={{ flex: 1, accentColor: "#8fb4d4", cursor: "pointer" }}
          />
          <span>100</span>
        </div>
      </div>
    </div>
  );
}
