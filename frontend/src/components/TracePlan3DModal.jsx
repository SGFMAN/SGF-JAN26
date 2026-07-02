import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { parsePlanTracePolygon } from "../utils/planTracePolygon";
import {
  buildTraceExternalWallGeometry,
  buildTraceInternalWallsGeometry,
  buildTraceInternalWallsOutlinePositions,
  buildTraceSubfloorGeometry,
  DEFAULT_CAMERA_HEIGHT_M,
  MAX_CAMERA_HEIGHT_M,
  MIN_CAMERA_HEIGHT_M,
  TRACE_SUBFLOOR_COLOR,
  TRACE_WALL_BASE_M,
  TRACE_WALL_HEIGHT_M,
  TRACE_WALL_THICKNESS_M,
  TRACE_WALL_TOP_M,
  tracePlanLookAtHeight,
  tracePolygonWallRings,
} from "../utils/tracePlan3D";
import { buildFootprintEdgeLinePositions } from "../utils/siteBoundaryMesh";
import { disposeThreeObject } from "../utils/siteBoundary3DRender";

import { UI } from "../utils/uiThemeTokens.js";
const WHITE = UI.cardBg;
const WALL_COLOR = 0xf3f4f6;
const EDGE_COLOR = 0x323233;
const GROUND_COLOR = 0x6b8f5a;
const MIN_LOOK_AT_Y_M = 0.2;
const VIEW_HEIGHT_SENSITIVITY = 0.028;
const VIEW_ANGLE_SENSITIVITY = 0.012;

function addWallOutline(group, topRing, bottomYM, offsetM = 0) {
  const edgePositions = buildFootprintEdgeLinePositions(topRing, bottomYM, offsetM);
  addOutlineLinePositions(group, edgePositions, 21);
}

function addOutlineLinePositions(group, edgePositions, renderOrder = 20) {
  if (!edgePositions?.length) return;

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: EDGE_COLOR,
      depthTest: true,
      depthWrite: false,
      transparent: false,
    })
  );
  edges.renderOrder = renderOrder;
  group.add(edges);
}

function buildTraceWallGroup(normalizedPoints, internalWallSegments = []) {
  const subfloorGeometry = buildTraceSubfloorGeometry(normalizedPoints);
  const wallGeometry = buildTraceExternalWallGeometry(normalizedPoints);
  if (!subfloorGeometry || !wallGeometry) {
    throw new Error("Could not build wall geometry");
  }

  const group = new THREE.Group();
  const externalWallMaterial = new THREE.MeshBasicMaterial({
    color: WALL_COLOR,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    transparent: false,
    opacity: 1,
  });
  const internalWallMaterial = new THREE.MeshBasicMaterial({
    color: WALL_COLOR,
    side: THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
    transparent: false,
    opacity: 1,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const subfloorMesh = new THREE.Mesh(
    subfloorGeometry,
    new THREE.MeshBasicMaterial({
      color: TRACE_SUBFLOOR_COLOR,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      transparent: false,
      opacity: 1,
    })
  );
  subfloorMesh.renderOrder = 8;
  group.add(subfloorMesh);

  const wallMesh = new THREE.Mesh(wallGeometry, externalWallMaterial);
  wallMesh.renderOrder = 10;
  group.add(wallMesh);

  const internalGeometry = buildTraceInternalWallsGeometry(normalizedPoints, internalWallSegments);
  if (internalGeometry) {
    const internalMesh = new THREE.Mesh(internalGeometry, internalWallMaterial);
    internalMesh.renderOrder = 15;
    group.add(internalMesh);

    const internalOutlines = buildTraceInternalWallsOutlinePositions(
      normalizedPoints,
      internalWallSegments,
      TRACE_WALL_BASE_M,
      0.003
    );
    addOutlineLinePositions(group, internalOutlines, 16);
  }

  const rings = tracePolygonWallRings(normalizedPoints);
  if (rings) {
    addWallOutline(group, rings.outer, rings.wallBaseYM, 0.003);
    addWallOutline(group, rings.inner, rings.wallBaseYM, 0.003);

    const xs = [];
    const zs = [];
    for (let i = 0; i < rings.outer.length; i += 3) {
      xs.push(rings.outer[i]);
      zs.push(rings.outer[i + 2]);
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

export default function TracePlan3DModal({ savedPolygon, onClose }) {
  const containerRef = useRef(null);
  const [error, setError] = useState("");

  const normalizedPoints = useMemo(() => {
    const { points } = parsePlanTracePolygon(savedPolygon);
    return points;
  }, [savedPolygon]);

  const internalWallSegments = useMemo(() => {
    const { internalWallSegments: segments } = parsePlanTracePolygon(savedPolygon);
    return segments;
  }, [savedPolygon]);

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
    /** @type {"rotate" | "view" | null} */
    let dragMode = null;
    let lastX = 0;
    let lastY = 0;
    let cameraHeight = DEFAULT_CAMERA_HEIGHT_M;
    let lookAtY = tracePlanLookAtHeight(DEFAULT_CAMERA_HEIGHT_M);
    const lookAtTarget = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    let cameraDistance = 10;
    let minCameraDistance = 2;
    let maxCameraDistance = 80;

    const clampCameraHeight = (value) =>
      Math.max(MIN_CAMERA_HEIGHT_M, Math.min(MAX_CAMERA_HEIGHT_M, value));

    const clampLookAtY = (value) =>
      Math.max(MIN_LOOK_AT_Y_M, Math.min(TRACE_WALL_TOP_M, value));

    const updateCameraFromOrbit = () => {
      lookAtTarget.y = lookAtY;
      camera.position.copy(lookAtTarget).addScaledVector(cameraDirection, cameraDistance);
      camera.position.y = cameraHeight;
      camera.lookAt(lookAtTarget);
    };

    const fitCameraToStructure = () => {
      const box = new THREE.Box3().setFromObject(structureGroup);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxHorizontal = Math.max(size.x, size.z, 1);
      const distance = maxHorizontal * 1.15 + 5;

      lookAtTarget.set(center.x, lookAtY, center.z);
      camera.position.set(center.x + distance * 0.75, cameraHeight, center.z + distance * 0.75);
      camera.lookAt(lookAtTarget);
      camera.near = 0.1;
      camera.far = 500;
      camera.updateProjectionMatrix();
    };

    const syncCameraOrbitFromFit = () => {
      lookAtTarget.y = lookAtY;
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

    const onPointerDown = (event) => {
      if (event.button === 2) {
        event.preventDefault();
        dragMode = "view";
        lastX = event.clientX;
        lastY = event.clientY;
        container.setPointerCapture(event.pointerId);
        container.style.cursor = "grabbing";
        return;
      }
      if (event.button !== 0) return;
      dragMode = "rotate";
      lastX = event.clientX;
      lastY = event.clientY;
      container.setPointerCapture(event.pointerId);
      container.style.cursor = "grabbing";
    };

    const onPointerMove = (event) => {
      if (!dragMode) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      if (dragMode === "rotate") {
        if (dx === 0) return;
        rotationY += dx * 0.008;
        structureGroup.rotation.set(0, rotationY, 0);
        return;
      }

      if (dragMode === "view") {
        if (dx === 0 && dy === 0) return;
        cameraHeight = clampCameraHeight(cameraHeight + dy * VIEW_HEIGHT_SENSITIVITY);
        lookAtY = clampLookAtY(lookAtY - dx * VIEW_ANGLE_SENSITIVITY);
        updateCameraFromOrbit();
      }
    };

    const endDrag = (event) => {
      if (!dragMode) return;
      dragMode = null;
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

    const onContextMenu = (event) => {
      event.preventDefault();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointerleave", endDrag);
    container.addEventListener("pointercancel", endDrag);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("contextmenu", onContextMenu);
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
      const walls = buildTraceWallGroup(normalizedPoints, internalWallSegments);
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
      if (animationId != null) cancelAnimationFrame(animationId);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", endDrag);
      container.removeEventListener("pointerleave", endDrag);
      container.removeEventListener("pointercancel", endDrag);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("contextmenu", onContextMenu);
      resizeObserver?.disconnect();
      disposeThreeObject(scene);
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [normalizedPoints, internalWallSegments]);

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
              Subfloor to 649 mm · walls from 650 mm · {TRACE_WALL_HEIGHT_M} m high · {TRACE_WALL_THICKNESS_M * 1000} mm thick — left-drag rotate · right-drag height / angle · scroll zoom
            </p>
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
              marginLeft: "auto",
            }}
          >
            Close
          </button>
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
