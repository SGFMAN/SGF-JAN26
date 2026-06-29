import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { parsePlanTracePolygon } from "../utils/planTracePolygon";
import {
  buildTraceExternalWallGeometry,
  CAMERA_HEIGHT_STEP_M,
  DEFAULT_CAMERA_HEIGHT_M,
  MAX_CAMERA_HEIGHT_M,
  MIN_CAMERA_HEIGHT_M,
  TRACE_WALL_HEIGHT_M,
  TRACE_WALL_THICKNESS_M,
  tracePolygonToWallRing,
} from "../utils/tracePlan3D";
import { buildFootprintEdgeLinePositions } from "../utils/siteBoundaryMesh";
import { disposeThreeObject } from "../utils/siteBoundary3DRender";

import { UI } from "../utils/uiThemeTokens.js";
const WHITE = UI.cardBg;
const WALL_COLOR = 0xf3f4f6;
const EDGE_COLOR = 0x323233;
const GROUND_COLOR = 0x6b8f5a;

function buildTraceWallGroup(normalizedPoints) {
  const wallGeometry = buildTraceExternalWallGeometry(normalizedPoints);
  if (!wallGeometry) {
    throw new Error("Could not build wall geometry");
  }

  const group = new THREE.Group();

  const wallMesh = new THREE.Mesh(
    wallGeometry,
    new THREE.MeshBasicMaterial({
      color: WALL_COLOR,
      side: THREE.FrontSide,
      depthTest: true,
    })
  );
  wallMesh.renderOrder = 15;
  group.add(wallMesh);

  const topRing = tracePolygonToWallRing(normalizedPoints);
  if (topRing) {
    const edgePositions = buildFootprintEdgeLinePositions(topRing, 0, 0);
    if (edgePositions) {
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
      const edges = new THREE.LineSegments(
        edgeGeometry,
        new THREE.LineBasicMaterial({ color: EDGE_COLOR, depthTest: true })
      );
      group.add(edges);
    }

    const xs = [];
    const zs = [];
    for (let i = 0; i < topRing.length; i += 3) {
      xs.push(topRing[i]);
      zs.push(topRing[i + 2]);
    }
    const pad = 2;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minZ = Math.min(...zs) - pad;
    const maxZ = Math.max(...zs) + pad;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      new THREE.MeshBasicMaterial({ color: GROUND_COLOR, depthTest: true })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((minX + maxX) / 2, -0.01, (minZ + maxZ) / 2);
    ground.renderOrder = 10;
    group.add(ground);
  }

  return group;
}

function formatHeightM(heightM) {
  return `${(Math.round(heightM * 1000) / 1000).toFixed(1)} m`;
}

export default function TracePlan3DModal({ savedPolygon, onClose }) {
  const containerRef = useRef(null);
  const orbitApiRef = useRef(null);
  const [error, setError] = useState("");
  const [cameraHeightM, setCameraHeightM] = useState(DEFAULT_CAMERA_HEIGHT_M);

  const normalizedPoints = useMemo(() => {
    const { points } = parsePlanTracePolygon(savedPolygon);
    return points;
  }, [savedPolygon]);

  useEffect(() => {
    orbitApiRef.current?.setCameraHeight(cameraHeightM);
  }, [cameraHeightM]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || normalizedPoints.length < 3) return undefined;

    let disposed = false;
    let animationId = null;
    let renderer = null;
    let resizeObserver = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2332);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(12, 18, 10);
    keyLight.castShadow = true;
    scene.add(keyLight);
    scene.add(new THREE.HemisphereLight(0xb8d4f0, 0x3d4f2f, 0.35));

    const structureGroup = new THREE.Group();
    scene.add(structureGroup);

    let rotationY = 0;
    let dragging = false;
    let lastX = 0;
    let cameraHeight = cameraHeightM;
    const lookAtTarget = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    let cameraDistance = 10;
    let minCameraDistance = 2;
    let maxCameraDistance = 80;

    const updateCameraFromOrbit = () => {
      camera.position.copy(lookAtTarget).addScaledVector(cameraDirection, cameraDistance);
      camera.position.y = cameraHeight;
      lookAtTarget.y = cameraHeight;
      camera.lookAt(lookAtTarget);
    };

    const fitCameraToStructure = () => {
      const box = new THREE.Box3().setFromObject(structureGroup);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxHorizontal = Math.max(size.x, size.z, 1);
      const distance = maxHorizontal * 1.15 + 5;

      lookAtTarget.set(center.x, cameraHeight, center.z);
      camera.position.set(center.x + distance * 0.75, cameraHeight, center.z + distance * 0.75);
      camera.lookAt(lookAtTarget);
      camera.near = 0.1;
      camera.far = 500;
      camera.updateProjectionMatrix();
    };

    const syncCameraOrbitFromFit = () => {
      lookAtTarget.y = cameraHeight;
      camera.position.y = cameraHeight;
      cameraDirection.copy(camera.position).sub(lookAtTarget);
      cameraDirection.y = 0;
      cameraDistance = cameraDirection.length();
      if (cameraDistance < 0.001) {
        cameraDirection.set(0.75, 0, 0.75).normalize();
        cameraDistance = 12;
      } else {
        cameraDirection.normalize();
      }
      minCameraDistance = Math.max(3, cameraDistance * 0.25);
      maxCameraDistance = cameraDistance * 2.5;
      updateCameraFromOrbit();
    };

    orbitApiRef.current = {
      setCameraHeight(heightM) {
        cameraHeight = heightM;
        updateCameraFromOrbit();
      },
    };

    const onPointerDown = (event) => {
      dragging = true;
      lastX = event.clientX;
      container.setPointerCapture(event.pointerId);
      container.style.cursor = "grabbing";
    };

    const onPointerMove = (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      if (dx === 0) return;
      rotationY += dx * 0.008;
      structureGroup.rotation.set(0, rotationY, 0);
    };

    const onPointerUp = (event) => {
      dragging = false;
      try {
        container.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      container.style.cursor = "grab";
    };

    const onWheel = (event) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1.1 : 0.9;
      cameraDistance = Math.max(minCameraDistance, Math.min(maxCameraDistance, cameraDistance * factor));
      updateCameraFromOrbit();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.style.cursor = "grab";
    container.style.touchAction = "none";

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 1 || h < 1) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    try {
      const walls = buildTraceWallGroup(normalizedPoints);
      structureGroup.add(walls);
      fitCameraToStructure();
      syncCameraOrbitFromFit();
      structureGroup.rotation.set(0, rotationY, 0);
      setError("");
    } catch (err) {
      if (!disposed) setError(err.message || "Could not build 3D model");
    }

    const renderLoop = () => {
      if (disposed) return;
      animationId = requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      disposed = true;
      orbitApiRef.current = null;
      if (animationId != null) cancelAnimationFrame(animationId);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      resizeObserver?.disconnect();
      disposeThreeObject(scene);
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [normalizedPoints]);

  function adjustCameraHeight(deltaSteps) {
    setCameraHeightM((prev) => {
      const next = prev + deltaSteps * CAMERA_HEIGHT_STEP_M;
      return Math.max(MIN_CAMERA_HEIGHT_M, Math.min(MAX_CAMERA_HEIGHT_M, next));
    });
  }

  const controlButtonStyle = {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    color: WHITE,
    width: "32px",
    height: "32px",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1,
    padding: 0,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trace-3d-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1001,
        padding: "16px",
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a2332",
          borderRadius: "12px",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 20px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 id="trace-3d-title" style={{ margin: 0, fontSize: "1.35rem", color: WHITE }}>
              3D Visualiser
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "rgba(255,255,255,0.65)" }}>
              External walls · {TRACE_WALL_HEIGHT_M} m high · {TRACE_WALL_THICKNESS_M * 1000} mm thick — drag to rotate, scroll to zoom
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginLeft: "auto",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: WHITE,
                fontSize: "0.9rem",
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.65)" }}>Camera height</span>
              <button
                type="button"
                onClick={() => adjustCameraHeight(-1)}
                disabled={cameraHeightM <= MIN_CAMERA_HEIGHT_M}
                style={{
                  ...controlButtonStyle,
                  opacity: cameraHeightM <= MIN_CAMERA_HEIGHT_M ? 0.4 : 1,
                  cursor: cameraHeightM <= MIN_CAMERA_HEIGHT_M ? "not-allowed" : "pointer",
                }}
                aria-label="Lower camera height by 500 mm"
              >
                −
              </button>
              <span style={{ minWidth: "52px", textAlign: "center", fontWeight: 600 }}>
                {formatHeightM(cameraHeightM)}
              </span>
              <button
                type="button"
                onClick={() => adjustCameraHeight(1)}
                disabled={cameraHeightM >= MAX_CAMERA_HEIGHT_M}
                style={{
                  ...controlButtonStyle,
                  opacity: cameraHeightM >= MAX_CAMERA_HEIGHT_M ? 0.4 : 1,
                  cursor: cameraHeightM >= MAX_CAMERA_HEIGHT_M ? "not-allowed" : "pointer",
                }}
                aria-label="Raise camera height by 500 mm"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "8px",
                fontSize: "1rem",
                cursor: "pointer",
                color: WHITE,
                padding: "6px 12px",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Close
            </button>
          </div>
        </div>

        {normalizedPoints.length < 3 && (
          <div style={{ padding: "24px", color: WHITE }}>
            No trace polygon saved. Use Trace Plan to outline the floor plan first.
          </div>
        )}

        {error && normalizedPoints.length >= 3 && (
          <div style={{ padding: "20px", margin: "16px", color: "#842029", background: "#fdecea", borderRadius: "8px" }}>
            {error}
          </div>
        )}

        <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: "relative" }} />
      </div>
    </div>
  );
}
