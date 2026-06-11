import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { fetchMonumentBox, fetchFloorPlanImageBlob, floorPlanDimensionsMeters, loadImageSizeFromBlob } from "../utils/floorPlanMap";
import {
  assignEarthUVs,
  assignGrassUVs,
  createEarthMaterial,
  createEarthTexture,
  createGrassMaterial,
  createGrassTexture,
} from "../utils/earthTexture";
import {
  buildEarthVolumeMesh,
  buildBuildingOutlineLinePositions,
  buildExtrudedFootprintMesh,
  buildFootprintEdgeLinePositions,
  buildFootprintTopCapMesh,
  buildFloorPlanOutlineLinePositions,
  footprintRingAtY,
  FLOOR_PLAN_UPPER_HEIGHT_M,
  buildHeightTopSurfaceMesh,
  buildSiteSlabMesh,
  cornerRelativeHeightsM,
  extractOuterRings,
  SITE_THICKNESS_M,
} from "../utils/siteBoundaryMesh";

const WHITE = "#fff";
const MONUMENT = "#323233";
const FLOOR_PLAN_SUBFLOOR_COLOR = 0x323233;
const FLOOR_PLAN_UPPER_COLOR = 0xd1d5db;
const BUILDING_WALL_COLOR = 0xffffff;
const BUILDING_ROOF_COLOR = FLOOR_PLAN_UPPER_COLOR;
const BUILDING_EDGE_COLOR = 0x323233;
const FOOTPRINT_BOTTOM_Y = 0;

function addExtrudedFootprintMesh(boundaryGroup, topRingPositions, color, options = {}) {
  const bottomYM = options.bottomYM ?? FOOTPRINT_BOTTOM_Y;
  const volume = buildExtrudedFootprintMesh(topRingPositions, bottomYM, options);
  if (!volume) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(volume.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(volume.indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 15;
  boundaryGroup.add(mesh);
}

function addFlatFootprintCap(boundaryGroup, topRingPositions, color) {
  const cap = buildFootprintTopCapMesh(topRingPositions);
  if (!cap) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(cap.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(cap.indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.FrontSide,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 16;
  boundaryGroup.add(mesh);
}

function addFootprintEdgeLines(
  boundaryGroup,
  topRingPositions,
  bottomYM = FOOTPRINT_BOTTOM_Y,
  color = BUILDING_EDGE_COLOR
) {
  const positions = buildFootprintEdgeLinePositions(topRingPositions, bottomYM);
  if (!positions) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      depthTest: true,
      depthWrite: false,
    })
  );
  lines.renderOrder = 18;
  boundaryGroup.add(lines);
}

function fitCameraToObject(camera, object, padding = 1.4) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = (camera.fov * Math.PI) / 180;
  let dist = maxDim / (2 * Math.tan(fov / 2));
  dist *= padding;

  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.65, center.z + dist * 0.55);
  camera.lookAt(center);
  camera.near = Math.max(0.1, dist / 100);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
}

function addBoundaryScene(boundaryGroup, ring, siteCornerLevels, earthMaterial, grassMaterial) {
  const slabData = buildSiteSlabMesh(ring);
  if (!slabData) throw new Error("Could not build site boundary");

  const cornerHeights = cornerRelativeHeightsM(ring, siteCornerLevels);
  if (!cornerHeights) throw new Error("Could not calculate corner heights");

  const earthVolume = buildEarthVolumeMesh(ring, slabData.topPositions, cornerHeights);
  if (!earthVolume) throw new Error("Could not build earth volume");

  const earthGeometry = new THREE.BufferGeometry();
  earthGeometry.setAttribute("position", new THREE.BufferAttribute(earthVolume.positions, 3));
  earthGeometry.setIndex(earthVolume.indices);
  const earthUvs = new Float32Array((earthVolume.positions.length / 3) * 2);
  assignEarthUVs(earthVolume.positions, earthUvs);
  earthGeometry.setAttribute("uv", new THREE.BufferAttribute(earthUvs, 2));
  earthGeometry.computeVertexNormals();
  boundaryGroup.add(new THREE.Mesh(earthGeometry, earthMaterial));

  const topSurface = buildHeightTopSurfaceMesh(ring, slabData.topPositions, cornerHeights);
  if (!topSurface) throw new Error("Could not build grass top surface");

  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute("position", new THREE.BufferAttribute(topSurface.positions, 3));
  grassGeometry.setIndex(new THREE.BufferAttribute(topSurface.indices, 1));
  const grassUvs = new Float32Array((topSurface.positions.length / 3) * 2);
  assignGrassUVs(topSurface.positions, grassUvs);
  grassGeometry.setAttribute("uv", new THREE.BufferAttribute(grassUvs, 2));
  grassGeometry.computeVertexNormals();
  boundaryGroup.add(new THREE.Mesh(grassGeometry, grassMaterial));

  return cornerHeights;
}

async function addFloorPlanVolume(boundaryGroup, ring, siteCornerLevels, placedUnit) {
  const { plan, center, bearing = 0 } = placedUnit || {};
  if (!plan?.id || !plan?.scale?.metersPerPixel || !center?.lat || !center?.lng) {
    return;
  }

  const blob = await fetchFloorPlanImageBlob(plan.id);
  const { width, height } = await loadImageSizeFromBlob(blob);
  const dims = floorPlanDimensionsMeters(plan, width, height);
  if (!dims) return;

  const outline = buildFloorPlanOutlineLinePositions(
    ring,
    siteCornerLevels,
    center.lat,
    center.lng,
    dims.widthM,
    dims.heightM,
    bearing
  );
  if (!outline) return;

  addExtrudedFootprintMesh(boundaryGroup, outline.positions, FLOOR_PLAN_SUBFLOOR_COLOR, {
    doubleSided: true,
    bottomYM: FOOTPRINT_BOTTOM_Y,
  });

  const upperTopY = outline.outlineYM + FLOOR_PLAN_UPPER_HEIGHT_M;
  const upperRing = footprintRingAtY(outline.positions, upperTopY);
  addExtrudedFootprintMesh(boundaryGroup, upperRing, FLOOR_PLAN_UPPER_COLOR, {
    doubleSided: true,
    bottomYM: outline.outlineYM,
  });
  addFootprintEdgeLines(boundaryGroup, upperRing, outline.outlineYM);
}

function addBuildingVolumes(boundaryGroup, siteRing, siteCornerLevels, buildingsGeoJson) {
  const features = buildingsGeoJson?.features || [];
  if (!features.length) return;

  for (const feature of features) {
    const rings = extractOuterRings(feature.geometry);
    for (const ring of rings) {
      const outline = buildBuildingOutlineLinePositions(ring, siteRing, siteCornerLevels);
      if (!outline) continue;
      addExtrudedFootprintMesh(boundaryGroup, outline.positions, BUILDING_WALL_COLOR, {
        includeTopCap: false,
        doubleSided: true,
      });
      addFlatFootprintCap(boundaryGroup, outline.positions, BUILDING_ROOF_COLOR);
      addFootprintEdgeLines(boundaryGroup, outline.positions);
    }
  }
}

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

        const rings = extractOuterRings(siteGeometry);
        if (!rings.length) {
          setStatus("error");
          setStatusDetail("No site boundary geometry");
          return;
        }

        const data = await fetchMonumentBox(siteGeometry, lookupState);
        if (disposed) return;

        const levels = data.siteCornerLevels;
        const complete =
          levels && ["nw", "ne", "se", "sw"].every((id) => Number.isFinite(levels[id]?.ahdM));

        if (!complete) {
          setStatus("error");
          setStatusDetail(
            data.missing?.length
              ? `Missing monument data (${data.missing.join(", ").toUpperCase()})`
              : "Could not calculate site corner levels"
          );
          return;
        }

        const cornerHeights = addBoundaryScene(
          boundaryGroup,
          rings[0],
          levels,
          earthMaterial,
          grassMaterial
        );
        const maxRelative = Math.max(...cornerHeights.map((c) => c.relativeM));

        if (placedUnit) {
          setStatusDetail("Loading unit footprint…");
          try {
            await addFloorPlanVolume(boundaryGroup, rings[0], levels, placedUnit);
          } catch {
            /* unit outline is optional */
          }
          if (disposed) return;
        }

        addBuildingVolumes(boundaryGroup, rings[0], levels, buildingsGeoJson);

        fitCameraToObject(camera, boundaryGroup);
        syncCameraOrbitFromFit();
        boundaryGroup.rotation.set(0, rotationY, 0);

        setSiteFallM(maxRelative);
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
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
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
