import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const SELECT_OUTLINE_COLOR = 0x55ff55;

/** Box: Length = X, Height = Y, Width = Z (Three.js BoxGeometry order). */
const LIBRARY = [{ id: "cube", label: "Cube", kind: "cube" }];
const BUILDER_STORAGE_KEY = "sgf-playground-train-builder-v1";

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function readCubeEditor(mesh) {
  const p = mesh.geometry.parameters;
  const { x, y, z } = mesh.position;
  return {
    length: round3(p.width),
    height: round3(p.height),
    width: round3(p.depth),
    x: round3(x),
    y: round3(y),
    z: round3(z),
  };
}

function applyCubeEditor(mesh, editor) {
  const length = Math.max(0.01, Number(editor.length) || 0.01);
  const height = Math.max(0.01, Number(editor.height) || 0.01);
  const width = Math.max(0.01, Number(editor.width) || 0.01);
  const px = Number(editor.x) || 0;
  const py = Number(editor.y) || 0;
  const pz = Number(editor.z) || 0;

  mesh.position.set(px, py, pz);

  const oldGeo = mesh.geometry;
  mesh.geometry = new THREE.BoxGeometry(length, height, width);
  oldGeo.dispose();
}

function attachSelectionOutline(mesh) {
  detachSelectionOutline(mesh);
  const edges = new THREE.EdgesGeometry(mesh.geometry, 12);
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: SELECT_OUTLINE_COLOR, toneMapped: false })
  );
  outline.name = "sgfSelectionOutline";
  outline.renderOrder = 999;
  mesh.add(outline);
}

function detachSelectionOutline(mesh) {
  const existing = mesh.getObjectByName("sgfSelectionOutline");
  if (existing) {
    existing.geometry?.dispose();
    existing.material?.dispose();
    mesh.remove(existing);
  }
}

/**
 * Track + sky scene with a small library of placeable bricks (cube first).
 */
export default function PlaygroundTrain() {
  const mountRef = useRef(null);
  const sceneApiRef = useRef(null);
  const [addSeq, setAddSeq] = useState(0);

  const [selectedLibraryId, setSelectedLibraryId] = useState(LIBRARY[0].id);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [editor, setEditor] = useState({
    length: 0.5,
    height: 0.5,
    width: 0.5,
    x: 0,
    y: 0.35,
    z: 0,
  });
  const editorFromSceneRef = useRef(false);

  const selectPart = useCallback((id) => {
    const api = sceneApiRef.current;
    if (!api || !id) return;
    const entry = api.parts.get(id);
    if (!entry) return;
    api.setSelectedMesh(entry.mesh);
    const next = readCubeEditor(entry.mesh);
    editorFromSceneRef.current = true;
    setSelectedPartId(id);
    setSelectedLabel(entry.label);
    setEditor(next);
    requestAnimationFrame(() => {
      editorFromSceneRef.current = false;
    });
  }, []);

  const clearSelection = useCallback(() => {
    sceneApiRef.current?.setSelectedMesh(null);
    setSelectedPartId(null);
    setSelectedLabel("");
  }, []);

  const centerSelectedPiece = useCallback(() => {
    const api = sceneApiRef.current;
    if (!api || !selectedPartId) return;
    const entry = api.parts.get(selectedPartId);
    if (!entry) return;
    entry.mesh.position.x = 0;
    editorFromSceneRef.current = true;
    setEditor((prev) => ({ ...prev, x: 0 }));
    requestAnimationFrame(() => {
      editorFromSceneRef.current = false;
    });
    if (api.getSelectedMesh() === entry.mesh) {
      attachSelectionOutline(entry.mesh);
    }
    api.saveLayout?.();
  }, [selectedPartId]);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#87ceeb");
    scene.fog = new THREE.Fog("#87ceeb", 12, 45);

    const camera = new THREE.PerspectiveCamera(
      50,
      mountEl.clientWidth / Math.max(1, mountEl.clientHeight),
      0.1,
      200
    );
    camera.position.set(8, 5.5, 8);
    const lookAtTarget = new THREE.Vector3(0, 0.3, 0);
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(new THREE.Vector3().copy(camera.position).sub(lookAtTarget));

    const applyCameraFromSpherical = () => {
      const offset = new THREE.Vector3().setFromSpherical(spherical);
      camera.position.copy(lookAtTarget).add(offset);
      camera.lookAt(lookAtTarget);
    };
    applyCameraFromSpherical();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountEl.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(10, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 48;
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    scene.add(sun);

    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: "#3d6b3d", roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const bedGeo = new THREE.BoxGeometry(3.2, 0.08, 24);
    const bedMat = new THREE.MeshStandardMaterial({ color: "#6b5b4f", roughness: 1 });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(0, 0.04, 0);
    bed.receiveShadow = true;
    scene.add(bed);

    const railGeo = new THREE.BoxGeometry(0.12, 0.14, 20);
    const railMat = new THREE.MeshStandardMaterial({
      color: "#8a9099",
      metalness: 0.45,
      roughness: 0.35,
    });
    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(-0.55, 0.16, 0);
    railL.castShadow = true;
    const railR = railL.clone();
    railR.position.x = 0.55;
    scene.add(railL, railR);

    const sleeperGeo = new THREE.BoxGeometry(2.4, 0.06, 0.35);
    const sleeperMat = new THREE.MeshStandardMaterial({ color: "#5c4033", roughness: 0.9 });
    for (let z = -9; z <= 9; z += 1.2) {
      const s = new THREE.Mesh(sleeperGeo, sleeperMat);
      s.position.set(0, 0.1, z);
      s.receiveShadow = true;
      s.castShadow = true;
      scene.add(s);
    }

    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);

    const brickMat = new THREE.MeshStandardMaterial({
      color: "#6d4c9a",
      roughness: 0.65,
      metalness: 0.15,
    });

    const parts = new Map();
    const pickables = [];
    let pieceSeq = 0;

    const saveLayout = () => {
      try {
        const pieces = [];
        for (const [id, entry] of parts) {
          if (entry.kind !== "cube") continue;
          const ed = readCubeEditor(entry.mesh);
          pieces.push({
            id,
            kind: "cube",
            label: entry.label,
            length: ed.length,
            height: ed.height,
            width: ed.width,
            x: ed.x,
            y: ed.y,
            z: ed.z,
          });
        }
        localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({ v: 1, pieces }));
      } catch (e) {
        console.error("Train builder save failed:", e);
      }
    };

    const loadLayout = () => {
      try {
        const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.v !== 1 || !Array.isArray(data.pieces)) return;
        let maxSeq = 0;
        for (const spec of data.pieces) {
          if (spec.kind !== "cube" || typeof spec.id !== "string") continue;
          const L = Math.max(0.01, Number(spec.length) || 0.5);
          const H = Math.max(0.01, Number(spec.height) || 0.5);
          const W = Math.max(0.01, Number(spec.width) || 0.5);
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), brickMat);
          mesh.position.set(Number(spec.x) || 0, Number(spec.y) || 0, Number(spec.z) || 0);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.sgfPieceId = spec.id;
          mesh.userData.sgfKind = "cube";
          piecesGroup.add(mesh);
          parts.set(spec.id, { mesh, label: spec.label || "Cube", kind: "cube" });
          pickables.push(mesh);
          const m = /^piece-(\d+)$/.exec(spec.id);
          if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
        }
        pieceSeq = Math.max(pieceSeq, maxSeq);
      } catch (e) {
        console.error("Train builder load failed:", e);
      }
    };

    loadLayout();

    let selectedMesh = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const setSelectedMesh = (mesh) => {
      if (selectedMesh) detachSelectionOutline(selectedMesh);
      selectedMesh = mesh;
      if (selectedMesh) attachSelectionOutline(selectedMesh);
    };

    const addCubePiece = () => {
      pieceSeq += 1;
      const id = `piece-${pieceSeq}`;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), brickMat);
      mesh.position.set(0, 0.35, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.sgfPieceId = id;
      mesh.userData.sgfKind = "cube";
      piecesGroup.add(mesh);
      parts.set(id, { mesh, label: `Cube ${pieceSeq}`, kind: "cube" });
      pickables.push(mesh);
      saveLayout();
      return id;
    };

    sceneApiRef.current = {
      parts,
      setSelectedMesh,
      getSelectedMesh: () => selectedMesh,
      addCubePiece,
      pickables,
      saveLayout,
    };

    let orbitDragging = false;
    let orbitPointerId = null;
    let lastOrbitX = 0;
    let lastOrbitY = 0;

    const onPointerDown = (event) => {
      if (event.button === 2) {
        event.preventDefault();
        orbitDragging = true;
        orbitPointerId = event.pointerId;
        lastOrbitX = event.clientX;
        lastOrbitY = event.clientY;
        renderer.domElement.style.cursor = "grabbing";
        try {
          renderer.domElement.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      if (event.button !== 0) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      if (hits.length > 0) {
        const id = hits[0].object.userData.sgfPieceId;
        if (id) {
          selectPart(id);
          return;
        }
      }
      clearSelection();
    };

    const onPointerMove = (event) => {
      if (!orbitDragging || event.pointerId !== orbitPointerId) return;
      const dx = event.clientX - lastOrbitX;
      const dy = event.clientY - lastOrbitY;
      lastOrbitX = event.clientX;
      lastOrbitY = event.clientY;
      spherical.theta -= dx * 0.006;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.006, 0.1, Math.PI - 0.1);
      applyCameraFromSpherical();
    };

    const endOrbit = (event) => {
      if (!orbitDragging) return;
      if (event.pointerId !== orbitPointerId) return;
      orbitDragging = false;
      orbitPointerId = null;
      renderer.domElement.style.cursor = "pointer";
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onContextMenu = (event) => {
      event.preventDefault();
    };

    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", endOrbit);
    renderer.domElement.addEventListener("pointercancel", endOrbit);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    const ZOOM_DIST_MIN = 3;
    const ZOOM_DIST_MAX = 55;
    const onWheel = (event) => {
      event.preventDefault();
      const scale = 1 + event.deltaY * 0.0012;
      spherical.radius = THREE.MathUtils.clamp(spherical.radius * scale, ZOOM_DIST_MIN, ZOOM_DIST_MAX);
      applyCameraFromSpherical();
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, Math.max(1, h));
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mountEl);

    return () => {
      saveLayout();
      sceneApiRef.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", endOrbit);
      renderer.domElement.removeEventListener("pointercancel", endOrbit);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      renderer.domElement.removeEventListener("wheel", onWheel);
      parts.forEach(({ mesh }) => detachSelectionOutline(mesh));
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      bedGeo.dispose();
      bedMat.dispose();
      railGeo.dispose();
      railMat.dispose();
      sleeperGeo.dispose();
      sleeperMat.dispose();
      brickMat.dispose();
      parts.forEach(({ mesh }) => mesh.geometry.dispose());
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, [selectPart, clearSelection]);

  useEffect(() => {
    if (addSeq < 1) return;
    const api = sceneApiRef.current;
    if (!api?.addCubePiece) return;
    const id = api.addCubePiece();
    selectPart(id);
  }, [addSeq, selectPart]);

  const handleAddClick = () => {
    const lib = LIBRARY.find((l) => l.id === selectedLibraryId);
    if (!lib || lib.kind !== "cube") return;
    setAddSeq((n) => n + 1);
  };

  useEffect(() => {
    if (editorFromSceneRef.current || !selectedPartId) return;
    const api = sceneApiRef.current;
    if (!api) return;
    const entry = api.parts.get(selectedPartId);
    if (!entry || entry.kind !== "cube") return;
    applyCubeEditor(entry.mesh, editor);
    if (api.getSelectedMesh() === entry.mesh) {
      attachSelectionOutline(entry.mesh);
    }
    api.saveLayout?.();
  }, [editor, selectedPartId]);

  const onEditorField = (field, value) => {
    setEditor((prev) => ({ ...prev, [field]: value }));
  };

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: "6px",
    border: `1px solid ${MONUMENT}33`,
    fontSize: "0.85rem",
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#555",
    marginBottom: "4px",
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: SECTION_GREY,
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
          padding: "10px 14px",
          background: LIGHT_MONUMENT,
          borderBottom: `1px solid rgba(0,0,0,0.2)`,
          boxSizing: "border-box",
        }}
      >
        <Link
          to="/projects"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: "10px",
            border: "2px solid rgba(255,255,255,0.4)",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: WHITE,
            background: "rgba(255,255,255,0.1)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          ← Back to main
        </Link>
        <span
          style={{
            fontSize: "0.88rem",
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Builder — library + placed bricks · wheel zoom · right‑drag orbit
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
        }}
      >
        <div ref={mountRef} style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0, position: "relative" }} />
        <div
          style={{
            flex: "0 0 clamp(220px, 26vw, 280px)",
            width: "clamp(220px, 26vw, 280px)",
            minWidth: "220px",
            background: WHITE,
            borderLeft: `1px solid ${MONUMENT}22`,
            padding: "14px",
            boxSizing: "border-box",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: MONUMENT, marginBottom: "8px" }}>Library</div>
          <div style={{ marginBottom: "10px" }}>
            {LIBRARY.map((item) => (
              <label
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.88rem",
                  marginBottom: "6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="libraryPiece"
                  checked={selectedLibraryId === item.id}
                  onChange={() => setSelectedLibraryId(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddClick}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "10px",
              border: `2px solid ${MONUMENT}`,
              background: "#3949ab",
              color: WHITE,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: "16px",
            }}
          >
            Add
          </button>

          {selectedPartId ? (
            <>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: MONUMENT, marginBottom: "8px" }}>
                {selectedLabel}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#2e7d32",
                  fontWeight: 600,
                  marginBottom: "10px",
                }}
              >
                Selected — green outline
              </div>
              {[
                ["length", "Length (X)"],
                ["width", "Width (Z)"],
                ["height", "Height (Y)"],
                ["x", "X position"],
                ["y", "Y position"],
                ["z", "Z position"],
              ].map(([key, label]) => (
                <label key={key} style={{ display: "block", marginBottom: "10px" }}>
                  <span style={labelStyle}>{label}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editor[key]}
                    onChange={(e) => onEditorField(key, e.target.value)}
                    style={inputStyle}
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={centerSelectedPiece}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "8px",
                  border: `2px solid #2e7d32`,
                  background: "#e8f5e9",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#1b5e20",
                  marginBottom: "8px",
                }}
              >
                Center on track (X)
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "8px",
                  border: `1px solid ${MONUMENT}44`,
                  background: SECTION_GREY,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: MONUMENT,
                }}
              >
                Deselect
              </button>
            </>
          ) : (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#666", lineHeight: 1.45 }}>
              Choose a library piece and click <strong>Add</strong>. Click a brick to select it and edit size or
              position. <strong>Center</strong> sets X to 0 over the track. Wheel zoom, right‑drag rotates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
