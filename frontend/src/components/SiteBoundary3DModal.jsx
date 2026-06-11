import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createEarthMaterial,
  createEarthTexture,
  createGrassMaterial,
  createGrassTexture,
} from "../utils/earthTexture";
import {
  disposeThreeObject,
  fitCameraToObject,
  populateSiteBoundary3DGroup,
} from "../utils/siteBoundary3DRender";
import { SITE_THICKNESS_M } from "../utils/siteBoundaryMesh";

const WHITE = "#fff";

export default function SiteBoundary3DModal({
  siteGeometry,
  lookupState = "VIC",
  placedUnit = null,
  buildingsGeoJson = null,
  onBack,
}) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [statusDetail, setStatusDetail] = useState("");
  const [siteFallM, setSiteFallM] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !siteGeometry) return undefined;

    let disposed = false;
    let animationId = null;
    let renderer = null;
    let resizeObserver = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2332);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(40, 60, 30);
    scene.add(keyLight);

    const earthTexture = createEarthTexture();
    const earthMaterial = createEarthMaterial(earthTexture);
    const grassTexture = createGrassTexture();
    const grassMaterial = createGrassMaterial(grassTexture);

    const boundaryGroup = new THREE.Group();
    scene.add(boundaryGroup);

    let rotationY = 0;
    let dragging = false;
    let lastX = 0;
    const lookAtTarget = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    let cameraDistance = 10;
    let minCameraDistance = 2;
    let maxCameraDistance = 500;

    const updateCameraFromOrbit = () => {
      camera.position.copy(lookAtTarget).addScaledVector(cameraDirection, cameraDistance);
      camera.lookAt(lookAtTarget);
    };

    const syncCameraOrbitFromFit = () => {
      const box = new THREE.Box3().setFromObject(boundaryGroup);
      box.getCenter(lookAtTarget);
      cameraDirection.copy(camera.position).sub(lookAtTarget);
      cameraDistance = cameraDirection.length();
      if (cameraDistance < 0.001) {
        cameraDirection.set(0.55, 0.65, 0.55).normalize();
        cameraDistance = 10;
      } else {
        cameraDirection.normalize();
      }
      minCameraDistance = Math.max(1, cameraDistance * 0.08);
      maxCameraDistance = cameraDistance * 4;
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
      boundaryGroup.rotation.set(0, rotationY, 0);
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

    const renderLoop = () => {
      if (disposed) return;
      animationId = requestAnimationFrame(renderLoop);
      renderer.render(scene, camera);
    };
    renderLoop();

    (async () => {
      try {
        setStatus("loading");
        setStatusDetail("Loading site levels…");

        const { maxRelativeFall } = await populateSiteBoundary3DGroup(boundaryGroup, {
          siteGeometry,
          lookupState,
          placedUnit,
          buildingsGeoJson,
          earthMaterial,
          grassMaterial,
        });
        if (disposed) return;

        fitCameraToObject(camera, boundaryGroup);
        syncCameraOrbitFromFit();
        boundaryGroup.rotation.set(0, rotationY, 0);

        setSiteFallM(maxRelativeFall);
        setStatus("ready");
        setStatusDetail("");
      } catch (err) {
        if (disposed) return;
        setStatus("error");
        setStatusDetail(err.message || "Failed to load 3D site");
      }
    })();

    return () => {
      disposed = true;
      if (animationId != null) cancelAnimationFrame(animationId);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      resizeObserver?.disconnect();
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      disposeThreeObject(scene);
      earthTexture.dispose();
      grassTexture.dispose();
    };
  }, [siteGeometry, lookupState, placedUnit, buildingsGeoJson]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-3d-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#1a2332",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
          background: "rgba(0,0,0,0.35)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: "8px 14px",
            fontSize: "0.9rem",
            fontWeight: 600,
            borderRadius: "8px",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.08)",
            color: WHITE,
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <h2
          id="site-3d-title"
          style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: WHITE }}
        >
          3d Visualisation
        </h2>
        {siteFallM != null && status === "ready" && (
          <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "rgba(255,255,255,0.75)" }}>
            Site fall: {siteFallM.toFixed(2)} m (above {SITE_THICKNESS_M} m slab)
          </span>
        )}
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div
          ref={containerRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        {status === "loading" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: WHITE,
              fontSize: "0.95rem",
              pointerEvents: "none",
            }}
          >
            {statusDetail || "Loading…"}
          </div>
        )}
        {status === "error" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              color: WHITE,
              textAlign: "center",
              fontSize: "0.95rem",
            }}
          >
            {statusDetail}
          </div>
        )}
        {status === "ready" && (
          <div
            style={{
              position: "absolute",
              left: "16px",
              bottom: "16px",
              padding: "8px 12px",
              borderRadius: "8px",
              background: "rgba(0,0,0,0.45)",
              color: "rgba(255,255,255,0.85)",
              fontSize: "0.8rem",
              pointerEvents: "none",
            }}
          >
            Drag horizontally to rotate · Scroll to zoom
          </div>
        )}
      </div>
    </div>
  );
}
