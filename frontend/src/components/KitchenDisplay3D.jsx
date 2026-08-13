import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  buildFootprintSlabGeometry,
  buildFootprintSlabOutlineGeometry,
  footprintBounds,
  resolveAlignedTraceRing,
  sanitizeFootprintRing,
} from "../utils/buildingUnitGeometry";
import { getTracePlanXZMapping, normalizedPointToXZ } from "../utils/tracePlan3D";
import { fetchAuthedImageBlobUrl } from "../utils/authedImageCache";
import { UI } from "../utils/uiThemeTokens.js";

/** Cabinetry carcass: floor → 879 mm. Benchtop slab: 880 → 900 mm (20 mm thick). */
const CABINET_TOP_M = 0.879;
const BENCHTOP_BOTTOM_M = 0.88;
const BENCHTOP_TOP_M = 0.9;
const WALL_HEIGHT_M = 2.6;
const WALL_THICKNESS_M = 0.1;
const CABINET_FALLBACK_COLOR = 0xb8b4af;
const BENCHTOP_FALLBACK_COLOR = 0xd6d3d1;
const WALL_FALLBACK_COLOR = 0xffffff;
const HYBRID_MODULE_WIDTH_M = 2.44;
const HYBRID_MODULE_HEIGHT_M = 0.36;
const FLOOR_FALLBACK_COLOR = 0xc4a574;
const OUTLINE_COLOR = 0x202124;
const CAMERA_ELEVATION_DEG = 30;
const CAMERA_AZIMUTH_DEG = 60;
const SHADING_FLAT = "flat";
const SHADING_LIT = "lit";

function loadFinishTextureFromUrl(url) {
  return fetchAuthedImageBlobUrl(url).then(async (blobUrl) => {
    if (!blobUrl) return null;
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = blobUrl;
    });
    if (!image) return null;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  });
}

function resolveBenchRings(kitchenBenches, footprintPoints, calibration) {
  const decks = Array.isArray(kitchenBenches) ? kitchenBenches : [];
  const rings = [];
  for (const deck of decks) {
    const pts = Array.isArray(deck?.points) ? deck.points : deck;
    if (!Array.isArray(pts) || pts.length < 3) continue;
    const resolved = resolveAlignedTraceRing(pts, footprintPoints, calibration);
    if (resolved.ring.length >= 3) rings.push(resolved.ring);
  }
  return rings;
}

function resolveZoneRing(kitchenZonePoints, footprintPoints, calibration) {
  if (!Array.isArray(kitchenZonePoints) || kitchenZonePoints.length < 4) return null;
  const resolved = resolveAlignedTraceRing(kitchenZonePoints, footprintPoints, calibration);
  return resolved.ring.length >= 3 ? resolved.ring : null;
}

function ringsBounds(rings) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const ring of rings) {
    const b = footprintBounds(ring);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    span: Math.max(maxX - minX, maxZ - minZ, 1.2),
  };
}

function pointInAabb(x, z, box, eps = 1e-6) {
  return (
    x >= box.minX - eps &&
    x <= box.maxX + eps &&
    z >= box.minZ - eps &&
    z <= box.maxZ + eps
  );
}

function ringIntersectsAabb(ring, box) {
  for (const p of ring) {
    if (pointInAabb(p.x, p.z, box)) return true;
  }
  const b = footprintBounds(ring);
  return !(b.maxX < box.minX || b.minX > box.maxX || b.maxZ < box.minZ || b.minZ > box.maxZ);
}

/** Liang–Barsky clip of segment to XZ AABB. */
function clipSegmentToAabb(a, b, box) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, a.x - box.minX)) return null;
  if (!clip(dx, box.maxX - a.x)) return null;
  if (!clip(-dz, a.z - box.minZ)) return null;
  if (!clip(dz, box.maxZ - a.z)) return null;
  if (t1 < t0) return null;
  return {
    a: { x: a.x + t0 * dx, z: a.z + t0 * dz },
    b: { x: a.x + t1 * dx, z: a.z + t1 * dz },
  };
}

function ringEdgeSegments(ring) {
  const clean = sanitizeFootprintRing(ring);
  const segs = [];
  for (let i = 0; i < clean.length; i += 1) {
    segs.push({ a: clean[i], b: clean[(i + 1) % clean.length] });
  }
  return segs;
}

function finishColor(texture, colorHex, fallbackColor) {
  return texture ? 0xffffff : colorHex != null ? colorHex : fallbackColor;
}

function makeFlatMaterial(texture, colorHex, fallbackColor, extra = {}) {
  return new THREE.MeshBasicMaterial({
    map: texture || null,
    color: finishColor(texture, colorHex, fallbackColor),
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    ...extra,
  });
}

function makeLitMaterial(texture, colorHex, fallbackColor, roughness, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: texture || null,
    color: finishColor(texture, colorHex, fallbackColor),
    roughness,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    ...extra,
  });
}

function makeOutlineMaterial() {
  return new THREE.LineBasicMaterial({ color: OUTLINE_COLOR });
}

function addOutlinedSlab(parent, ring, bottomY, topY, flatMat, litMat, shadingMode) {
  const geom = buildFootprintSlabGeometry(ring, bottomY, topY);
  if (!geom) return;
  const mesh = new THREE.Mesh(geom, shadingMode === SHADING_LIT ? litMat : flatMat);
  mesh.userData.flatMat = flatMat;
  mesh.userData.litMat = litMat;
  mesh.userData.isFinishMesh = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  const outlineGeom = buildFootprintSlabOutlineGeometry(ring, bottomY, topY);
  if (!outlineGeom) return;
  parent.add(new THREE.LineSegments(outlineGeom, makeOutlineMaterial()));
}

function addWallSegment(parent, a, b, bottomY, topY, flatMat, litMat, shadingMode) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.02) return;
  const height = topY - bottomY;
  const dirX = dx / len;
  const dirZ = dz / len;
  const geom = new THREE.BoxGeometry(len, height, WALL_THICKNESS_M);
  const mesh = new THREE.Mesh(geom, shadingMode === SHADING_LIT ? litMat : flatMat);
  mesh.userData.flatMat = flatMat;
  mesh.userData.litMat = litMat;
  mesh.userData.isFinishMesh = true;
  mesh.position.set((a.x + b.x) / 2, bottomY + height / 2, (a.z + b.z) / 2);
  mesh.rotation.y = Math.atan2(-dirZ, dirX);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  // Vertical corners + top/bottom long edges via EdgesGeometry.
  const edges = new THREE.EdgesGeometry(geom);
  const outline = new THREE.LineSegments(edges, makeOutlineMaterial());
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  parent.add(outline);
}

/**
 * Kitchen right-pane preview clipped to the Trace Plan kitchen zone.
 */
export default function KitchenDisplay3D({
  kitchenBenches = [],
  kitchenZonePoints = [],
  footprintPoints = [],
  internalWallSegments = [],
  calibration = null,
  claddingColorHex = null,
  hybridImageUrl = null,
  hybridScale = 1,
  cabinetImageUrl = null,
  cabinetColorHex = null,
  benchtopImageUrl = null,
  benchtopColorHex = null,
}) {
  const mountRef = useRef(null);
  const applyShadingRef = useRef(null);
  const shadingModeRef = useRef(SHADING_FLAT);
  const orbitRef = useRef({
    azimuth: THREE.MathUtils.degToRad(CAMERA_AZIMUTH_DEG),
    elevation: THREE.MathUtils.degToRad(CAMERA_ELEVATION_DEG),
    distance: null,
  });
  const [shadingMode, setShadingMode] = useState(SHADING_FLAT);

  const zoneRing = resolveZoneRing(kitchenZonePoints, footprintPoints, calibration);
  const hasZone = Boolean(zoneRing);

  useEffect(() => {
    shadingModeRef.current = shadingMode;
    applyShadingRef.current?.(shadingMode);
  }, [shadingMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !hasZone) return undefined;

    let cancelled = false;
    let rafId = 0;
    let renderer = null;
    let scene = null;
    let camera = null;
    let modelGroup = null;
    let lightGroup = null;
    let resizeObserver = null;
    let removeOrbitListeners = null;
    const ownedMaterials = [];

    const scale =
      Number.isFinite(Number(hybridScale)) && Number(hybridScale) > 0
        ? Number(hybridScale)
        : 1;
    const moduleW = HYBRID_MODULE_WIDTH_M * scale;
    const moduleH = HYBRID_MODULE_HEIGHT_M * scale;

    (async () => {
      const [floorTexture, cabinetTexture, benchtopTexture] = await Promise.all([
        hybridImageUrl ? loadFinishTextureFromUrl(hybridImageUrl) : Promise.resolve(null),
        cabinetImageUrl ? loadFinishTextureFromUrl(cabinetImageUrl) : Promise.resolve(null),
        benchtopImageUrl ? loadFinishTextureFromUrl(benchtopImageUrl) : Promise.resolve(null),
      ]);
      if (cancelled) {
        floorTexture?.dispose();
        cabinetTexture?.dispose();
        benchtopTexture?.dispose();
        return;
      }

      scene = new THREE.Scene();
      scene.background = new THREE.Color(UI.inputBg || "#f5f5f5");
      camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      mount.appendChild(canvas);

      lightGroup = new THREE.Group();
      lightGroup.add(new THREE.AmbientLight(0xffffff, 0.72));
      const key = new THREE.DirectionalLight(0xffffff, 0.95);
      key.position.set(4, 8, 3);
      key.castShadow = true;
      lightGroup.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.28);
      fill.position.set(-3, 4, -2);
      lightGroup.add(fill);
      scene.add(lightGroup);

      modelGroup = new THREE.Group();
      scene.add(modelGroup);

      const zoneBounds = ringsBounds([zoneRing]);
      if (!zoneBounds) return;
      const floorSizeX = Math.max(0.5, zoneBounds.maxX - zoneBounds.minX);
      const floorSizeZ = Math.max(0.5, zoneBounds.maxZ - zoneBounds.minZ);
      const floorY = 0.002;

      const floorGeom = new THREE.PlaneGeometry(floorSizeX, floorSizeZ, 1, 1);
      floorGeom.rotateX(-Math.PI / 2);
      floorGeom.translate(zoneBounds.cx, floorY, zoneBounds.cz);
      const pos = floorGeom.getAttribute("position");
      const uvs = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i += 1) {
        uvs[i * 2] = (pos.getX(i) - zoneBounds.minX) / moduleW;
        uvs[i * 2 + 1] = (pos.getZ(i) - zoneBounds.minZ) / moduleH;
      }
      floorGeom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

      const floorFlat = makeFlatMaterial(floorTexture, null, FLOOR_FALLBACK_COLOR, {
        side: THREE.DoubleSide,
      });
      const floorLit = makeLitMaterial(floorTexture, null, FLOOR_FALLBACK_COLOR, 0.82, {
        side: THREE.DoubleSide,
      });
      ownedMaterials.push(floorFlat, floorLit);
      const floorMesh = new THREE.Mesh(floorGeom, floorFlat);
      floorMesh.userData.flatMat = floorFlat;
      floorMesh.userData.litMat = floorLit;
      floorMesh.userData.isFinishMesh = true;
      floorMesh.receiveShadow = true;
      modelGroup.add(floorMesh);

      // Floor perimeter outline (zone rectangle).
      const floorOutlineRing = [
        { x: zoneBounds.minX, z: zoneBounds.minZ },
        { x: zoneBounds.maxX, z: zoneBounds.minZ },
        { x: zoneBounds.maxX, z: zoneBounds.maxZ },
        { x: zoneBounds.minX, z: zoneBounds.maxZ },
      ];
      const floorOutlineGeom = buildFootprintSlabOutlineGeometry(
        floorOutlineRing,
        floorY,
        floorY + 0.001
      );
      if (floorOutlineGeom) {
        modelGroup.add(new THREE.LineSegments(floorOutlineGeom, makeOutlineMaterial()));
      }

      const cabinetFlat = makeFlatMaterial(cabinetTexture, cabinetColorHex, CABINET_FALLBACK_COLOR);
      const cabinetLit = makeLitMaterial(
        cabinetTexture,
        cabinetColorHex,
        CABINET_FALLBACK_COLOR,
        0.78
      );
      const benchtopFlat = makeFlatMaterial(
        benchtopTexture,
        benchtopColorHex,
        BENCHTOP_FALLBACK_COLOR
      );
      const benchtopLit = makeLitMaterial(
        benchtopTexture,
        benchtopColorHex,
        BENCHTOP_FALLBACK_COLOR,
        0.55
      );
      const wallFlat = makeFlatMaterial(null, claddingColorHex, WALL_FALLBACK_COLOR);
      const wallLit = makeLitMaterial(null, claddingColorHex, WALL_FALLBACK_COLOR, 0.62);
      ownedMaterials.push(cabinetFlat, cabinetLit, benchtopFlat, benchtopLit, wallFlat, wallLit);

      const applyShading = (mode) => {
        const lit = mode === SHADING_LIT;
        lightGroup.visible = lit;
        modelGroup.traverse((obj) => {
          if (!obj.isMesh || !obj.userData?.isFinishMesh) return;
          obj.material = lit ? obj.userData.litMat : obj.userData.flatMat;
        });
      };
      applyShadingRef.current = applyShading;
      applyShading(shadingModeRef.current);

      const benchRings = resolveBenchRings(kitchenBenches, footprintPoints, calibration).filter(
        (ring) => ringIntersectsAabb(ring, zoneBounds)
      );
      for (const ring of benchRings) {
        addOutlinedSlab(
          modelGroup,
          ring,
          0,
          CABINET_TOP_M,
          cabinetFlat,
          cabinetLit,
          shadingModeRef.current
        );
        addOutlinedSlab(
          modelGroup,
          ring,
          BENCHTOP_BOTTOM_M,
          BENCHTOP_TOP_M,
          benchtopFlat,
          benchtopLit,
          shadingModeRef.current
        );
      }

      // External wall edges clipped to kitchen zone.
      const extResolved = resolveAlignedTraceRing(footprintPoints, footprintPoints, calibration);
      if (extResolved.ring.length >= 3) {
        for (const seg of ringEdgeSegments(extResolved.ring)) {
          const clipped = clipSegmentToAabb(seg.a, seg.b, zoneBounds);
          if (!clipped) continue;
          addWallSegment(
            modelGroup,
            clipped.a,
            clipped.b,
            0,
            WALL_HEIGHT_M,
            wallFlat,
            wallLit,
            shadingModeRef.current
          );
        }
      }

      // Internal walls clipped to kitchen zone.
      const mapping = getTracePlanXZMapping(footprintPoints, calibration);
      if (mapping && Array.isArray(internalWallSegments)) {
        for (const seg of internalWallSegments) {
          if (!seg?.a || !seg?.b) continue;
          const a = normalizedPointToXZ(seg.a, mapping);
          const b = normalizedPointToXZ(seg.b, mapping);
          const clipped = clipSegmentToAabb(a, b, zoneBounds);
          if (!clipped) continue;
          addWallSegment(
            modelGroup,
            clipped.a,
            clipped.b,
            0,
            WALL_HEIGHT_M,
            wallFlat,
            wallLit,
            shadingModeRef.current
          );
        }
      }

      const target = new THREE.Vector3(zoneBounds.cx, BENCHTOP_TOP_M * 0.45, zoneBounds.cz);
      const defaultDistance = Math.max(3.5, zoneBounds.span * 1.6);
      let azimuth = orbitRef.current.azimuth;
      let elevation = orbitRef.current.elevation;
      let distance =
        Number.isFinite(orbitRef.current.distance) && orbitRef.current.distance > 0
          ? orbitRef.current.distance
          : defaultDistance;
      const minDistance = Math.max(1.5, zoneBounds.span * 0.45);
      const maxDistance = Math.max(12, zoneBounds.span * 4);
      const minElev = THREE.MathUtils.degToRad(5);
      const maxElev = THREE.MathUtils.degToRad(85);
      distance = Math.max(minDistance, Math.min(maxDistance, distance));

      const updateCamera = () => {
        camera.position.set(
          target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
          target.y + distance * Math.sin(elevation),
          target.z + distance * Math.cos(elevation) * Math.cos(azimuth)
        );
        camera.lookAt(target);
        orbitRef.current = { azimuth, elevation, distance };
      };
      updateCamera();

      const setSize = () => {
        const w = Math.max(1, mount.clientWidth);
        const h = Math.max(1, mount.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      setSize();
      resizeObserver = new ResizeObserver(setSize);
      resizeObserver.observe(mount);

      let dragging = false;
      let lastX = null;
      let lastY = null;

      const onPointerDown = (event) => {
        if (event.button !== 0 && event.button !== 2) return;
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
      };
      const onPointerMove = (event) => {
        if (!dragging || lastX == null || lastY == null) {
          lastX = event.clientX;
          lastY = event.clientY;
          return;
        }
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        if (dx === 0 && dy === 0) return;
        azimuth -= dx * 0.008;
        elevation = Math.max(minElev, Math.min(maxElev, elevation + dy * 0.008));
        updateCamera();
      };
      const endDrag = (event) => {
        if (!dragging) return;
        dragging = false;
        lastX = null;
        lastY = null;
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // already released
        }
        canvas.style.cursor = "grab";
      };
      const onWheel = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const raw =
          event.deltaMode === 1
            ? event.deltaY * 16
            : event.deltaMode === 2
              ? event.deltaY * 800
              : event.deltaY;
        distance = Math.max(
          minDistance,
          Math.min(maxDistance, distance * Math.exp(raw * 0.0015))
        );
        updateCamera();
      };
      const onContextMenu = (event) => event.preventDefault();

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("contextmenu", onContextMenu);
      removeOrbitListeners = () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", endDrag);
        canvas.removeEventListener("pointercancel", endDrag);
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("contextmenu", onContextMenu);
      };

      const tick = () => {
        if (cancelled) return;
        rafId = requestAnimationFrame(tick);
        renderer.render(scene, camera);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      applyShadingRef.current = null;
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      removeOrbitListeners?.();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement?.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      }
      if (modelGroup) {
        const seenGeom = new Set();
        const seenMat = new Set();
        const seenMap = new Set();
        modelGroup.traverse((obj) => {
          if (obj.geometry && !seenGeom.has(obj.geometry)) {
            seenGeom.add(obj.geometry);
            obj.geometry.dispose();
          }
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
              if (seenMat.has(m)) continue;
              seenMat.add(m);
              if (m.map && !seenMap.has(m.map)) {
                seenMap.add(m.map);
                m.map.dispose();
              }
              m.dispose();
            }
          }
        });
      }
      for (const m of ownedMaterials) {
        try {
          m.dispose();
        } catch {
          // ignore
        }
      }
    };
  }, [
    hasZone,
    kitchenBenches,
    kitchenZonePoints,
    footprintPoints,
    internalWallSegments,
    calibration,
    claddingColorHex,
    hybridImageUrl,
    hybridScale,
    cabinetImageUrl,
    cabinetColorHex,
    benchtopImageUrl,
    benchtopColorHex,
  ]);

  const isFlat = shadingMode === SHADING_FLAT;

  if (!hasZone) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          width: "100%",
          height: "100%",
          borderRadius: "8px",
          border: `1px solid ${UI.outline}`,
          background: UI.inputBg || "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: UI.textMuted,
          fontSize: "1rem",
          textAlign: "center",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        Define the kitchen zone on Trace Plan (Rooms → Define kitchen).
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        width: "100%",
        height: "100%",
        position: "relative",
        borderRadius: "8px",
        border: `1px solid ${UI.outline}`,
        overflow: "hidden",
        background: UI.inputBg || "#f5f5f5",
        boxSizing: "border-box",
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
        }}
      />
      <button
        type="button"
        onClick={() =>
          setShadingMode((prev) => (prev === SHADING_FLAT ? SHADING_LIT : SHADING_FLAT))
        }
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 2,
          padding: "8px 12px",
          borderRadius: "8px",
          border: `1px solid ${UI.outline}`,
          background: UI.cardBg,
          color: UI.textPrimary,
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
        title={isFlat ? "Switch to lit shading" : "Switch to flat colour"}
      >
        {isFlat ? "Lit view" : "Flat colour"}
      </button>
    </div>
  );
}
