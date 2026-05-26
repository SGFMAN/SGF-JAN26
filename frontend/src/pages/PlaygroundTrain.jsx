import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as THREE from "three";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const SELECT_OUTLINE_COLOR = 0x55ff55;

/** 1 world unit = 1 metre in the scene (1:1, no extra scaling). */
const METRES_PER_UNIT = 1;

/**
 * British Rail permanent way (1960s main line, standard gauge).
 * Gauge = 1435 mm between inner faces of running rails (BR / UIC standard).
 * Sleeper spacing 700 mm centres on straight / >600 m curves (CEN56 / BS113A, 25 t axle).
 */
const BR_TRACK = {
  gaugeM: 1.435,
  /** Rail section: head 66×30 mm, web 28×85 mm, base 66×30 mm (145 mm total). */
  railHeadWidthM: 0.066,
  railWebWidthM: 0.028,
  railBaseWidthM: 0.066,
  railHeadHeightM: 0.03,
  railWebHeightM: 0.085,
  railBaseHeightM: 0.03,
  railHeightM: 0.145,
  sleeperLengthM: 2.6,
  sleeperWidthM: 0.25,
  sleeperDepthM: 0.125,
  sleeperSpacingM: 0.7,
  ballastWidthM: 3.0,
  ballastDepthM: 0.25,
  trackLengthM: 24,
  chairHeightM: 0.02,
};

function brRailCentreOffsetM() {
  return (BR_TRACK.gaugeM + BR_TRACK.railHeadWidthM) / 2;
}

function brRailBottomYM() {
  const sleeperTopY = BR_TRACK.ballastDepthM + BR_TRACK.sleeperDepthM;
  return sleeperTopY + BR_TRACK.chairHeightM;
}

/** One running rail: base + web + head stacked on Y, origin at bottom centre of base. */
function createBrRailGroup(lengthM, material) {
  const group = new THREE.Group();
  const len = lengthM;
  const h = BR_TRACK;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(h.railBaseWidthM, h.railBaseHeightM, len),
    material
  );
  base.position.y = h.railBaseHeightM / 2;
  base.castShadow = true;
  base.receiveShadow = true;

  const web = new THREE.Mesh(
    new THREE.BoxGeometry(h.railWebWidthM, h.railWebHeightM, len),
    material
  );
  web.position.y = h.railBaseHeightM + h.railWebHeightM / 2;
  web.castShadow = true;
  web.receiveShadow = true;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(h.railHeadWidthM, h.railHeadHeightM, len),
    material
  );
  head.position.y = h.railBaseHeightM + h.railWebHeightM + h.railHeadHeightM / 2;
  head.castShadow = true;
  head.receiveShadow = true;

  group.add(base, web, head);
  return group;
}

/** Box: Length = X, Height = Y, Width = Z (Three.js BoxGeometry order). */
const LIBRARY = [
  { id: "cube", label: "Cube", kind: "cube" },
  { id: "disc", label: "Disc", kind: "disc" },
  { id: "wheelBase", label: "Wheel Base", kind: "wheelBase" },
];
const BUILDER_STORAGE_KEY = "sgf-playground-train-builder-v2";

const DEFAULT_CUBE_EDITOR = {
  length: 1,
  height: 1,
  width: 1,
  x: 0,
  y: 0.5,
  z: 0,
};

const MIN_DISC_ARC_DEG = 0.5;
const MAX_DISC_ARC_DEG = 360;

const DEFAULT_DISC_EDITOR = {
  radius: 0.45,
  thickness: 0.12,
  startDegree: 0,
  endDegree: 360,
  x: 0,
  y: 0.06,
  z: 0,
};

const DEFAULT_WHEEL_BASE_EDITOR = {
  rowsWide: 2,
  gauge: 0.5,
  wheelsPerRow: 4,
  wheelBaseSpan: 1.2,
  wheelRadius: 0.12,
  wheelThickness: 0.08,
  x: 0,
  y: 0.12,
  z: 0,
};

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function metres(n) {
  return round3(Number(n) * METRES_PER_UNIT);
}

function resetModelScale(object) {
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
}

function readCubeEditor(mesh) {
  const { x, y, z } = mesh.position;
  mesh.geometry?.computeBoundingBox();
  const box = mesh.geometry?.boundingBox;
  const size = box
    ? box.getSize(new THREE.Vector3())
    : new THREE.Vector3(
        mesh.geometry?.parameters?.width ?? 1,
        mesh.geometry?.parameters?.height ?? 1,
        mesh.geometry?.parameters?.depth ?? 1
      );
  return {
    length: metres(size.x),
    height: metres(size.y),
    width: metres(size.z),
    x: metres(x),
    y: metres(y),
    z: metres(z),
  };
}

function applyCubeEditor(mesh, editor) {
  const length = Math.max(0.01, Number(editor.length) || 0.01) * METRES_PER_UNIT;
  const height = Math.max(0.01, Number(editor.height) || 0.01) * METRES_PER_UNIT;
  const width = Math.max(0.01, Number(editor.width) || 0.01) * METRES_PER_UNIT;
  const px = (Number(editor.x) || 0) * METRES_PER_UNIT;
  const py = (Number(editor.y) || 0) * METRES_PER_UNIT;
  const pz = (Number(editor.z) || 0) * METRES_PER_UNIT;

  mesh.position.set(px, py, pz);
  resetModelScale(mesh);

  const oldGeo = mesh.geometry;
  mesh.geometry = new THREE.BoxGeometry(length, height, width);
  oldGeo.dispose();
}

/** Cylinder sector on Y: start/end in degrees (0–360), arc = end − start with wrap. */
function discArcSpec(startDegree, endDegree) {
  let start = Number(startDegree);
  let end = Number(endDegree);
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = start + MAX_DISC_ARC_DEG;

  start = ((start % 360) + 360) % 360;
  end = ((end % 360) + 360) % 360;

  let span = end - start;
  if (span <= 0) span += MAX_DISC_ARC_DEG;

  if (span >= MAX_DISC_ARC_DEG - 1e-6) {
    return { fullCircle: true, thetaStart: 0, thetaLength: Math.PI * 2 };
  }

  span = THREE.MathUtils.clamp(span, MIN_DISC_ARC_DEG, MAX_DISC_ARC_DEG - 1e-6);
  return {
    fullCircle: false,
    thetaStart: THREE.MathUtils.degToRad(start),
    thetaLength: THREE.MathUtils.degToRad(span),
  };
}

/** Solid pie-slice / disc: top, bottom, curved face, and both radial end caps. */
function createDiscGeometry(radius, thickness, startDegree, endDegree) {
  const r = Math.max(0.05, Number(radius) || 0.05) * METRES_PER_UNIT;
  const h = Math.max(0.02, Number(thickness) || 0.02) * METRES_PER_UNIT;
  const arc = discArcSpec(startDegree, endDegree);
  const startRad = arc.fullCircle ? 0 : arc.thetaStart;
  const endRad = arc.fullCircle ? Math.PI * 2 : arc.thetaStart + arc.thetaLength;
  const curveSegments = Math.max(
    12,
    Math.ceil(48 * (arc.fullCircle ? 1 : arc.thetaLength / (Math.PI * 2)))
  );

  const shape = new THREE.Shape();
  if (arc.fullCircle) {
    shape.absarc(0, 0, r, 0, Math.PI * 2, false);
  } else {
    shape.moveTo(0, 0);
    shape.lineTo(r * Math.cos(startRad), r * Math.sin(startRad));
    shape.absarc(0, 0, r, startRad, endRad, false);
    shape.lineTo(0, 0);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    curveSegments,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function syncDiscUserData(mesh, radius, thickness, startDegree, endDegree) {
  mesh.userData.sgfDiscArc = {
    radius: round3(Math.max(0.05, Number(radius) || 0.05)),
    thickness: round3(Math.max(0.02, Number(thickness) || 0.02)),
    startDegree: round3(Number(startDegree) || 0),
    endDegree: round3(
      Number.isFinite(Number(endDegree)) ? Number(endDegree) : MAX_DISC_ARC_DEG
    ),
  };
}

function assignDiscGeometry(mesh, radius, thickness, startDegree, endDegree) {
  const oldGeo = mesh.geometry;
  mesh.geometry = createDiscGeometry(radius, thickness, startDegree, endDegree);
  oldGeo?.dispose();
  syncDiscUserData(mesh, radius, thickness, startDegree, endDegree);
}

function readDiscEditor(mesh) {
  const { x, y, z } = mesh.position;
  const ud = mesh.userData.sgfDiscArc;
  if (ud) {
    return {
      radius: ud.radius,
      thickness: ud.thickness,
      startDegree: ud.startDegree,
      endDegree: ud.endDegree,
      x: metres(x),
      y: metres(y),
      z: metres(z),
    };
  }
  const p = mesh.geometry?.parameters;
  const startRad = p?.thetaStart ?? 0;
  const lenRad = p?.thetaLength ?? Math.PI * 2;
  const fullCircle = Math.abs(lenRad - Math.PI * 2) < 0.02;
  const startDegree = round3(THREE.MathUtils.radToDeg(startRad));
  let endDegree = fullCircle
    ? MAX_DISC_ARC_DEG
    : round3(THREE.MathUtils.radToDeg(startRad + lenRad));
  if (!fullCircle && endDegree < startDegree) endDegree = round3(endDegree + 360);
  return {
    radius: round3(p?.radiusTop ?? p?.radiusBottom ?? 0.45),
    thickness: round3(p?.height ?? 0.12),
    startDegree,
    endDegree,
    x: metres(x),
    y: metres(y),
    z: metres(z),
  };
}

function applyDiscEditor(mesh, editor) {
  mesh.position.set(
    (Number(editor.x) || 0) * METRES_PER_UNIT,
    (Number(editor.y) || 0) * METRES_PER_UNIT,
    (Number(editor.z) || 0) * METRES_PER_UNIT
  );
  resetModelScale(mesh);
  assignDiscGeometry(mesh, editor.radius, editor.thickness, editor.startDegree, editor.endDegree);
}

function parseWheelBaseEditor(editor) {
  const rowsWide = Math.min(2, Math.max(1, Math.round(Number(editor.rowsWide) || 1)));
  const wheelsPerRow = Math.min(8, Math.max(1, Math.round(Number(editor.wheelsPerRow) || 1)));
  return {
    rowsWide,
    gauge: Math.max(0, Number(editor.gauge) || 0) * METRES_PER_UNIT,
    wheelsPerRow,
    wheelBaseSpan: Math.max(0, Number(editor.wheelBaseSpan) || 0) * METRES_PER_UNIT,
    wheelRadius: Math.max(0.03, Number(editor.wheelRadius) || 0.03) * METRES_PER_UNIT,
    wheelThickness: Math.max(0.02, Number(editor.wheelThickness) || 0.02) * METRES_PER_UNIT,
    x: (Number(editor.x) || 0) * METRES_PER_UNIT,
    y: (Number(editor.y) || 0) * METRES_PER_UNIT,
    z: (Number(editor.z) || 0) * METRES_PER_UNIT,
  };
}

function wheelRowZPositions(count, span) {
  if (count <= 1) return [0];
  const half = span / 2;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => round3(-half + i * step));
}

function wheelRowXPositions(rowsWide, gauge) {
  if (rowsWide <= 1) return [0];
  const half = gauge / 2;
  return [round3(-half), round3(half)];
}

function clearWheelMeshes(group) {
  if (group.userData.sgfWheelGeo) {
    group.userData.sgfWheelGeo.dispose();
    group.userData.sgfWheelGeo = null;
  }
  const toRemove = [...group.children].filter((c) => c.name === "sgfWheel");
  for (const child of toRemove) {
    group.remove(child);
  }
}

function rebuildWheelBase(group, editor, material) {
  const p = parseWheelBaseEditor(editor);
  clearWheelMeshes(group);
  const rowXs = wheelRowXPositions(p.rowsWide, p.gauge);
  const rowZs = wheelRowZPositions(p.wheelsPerRow, p.wheelBaseSpan);
  const wheelGeo = new THREE.CylinderGeometry(
    p.wheelRadius,
    p.wheelRadius,
    p.wheelThickness,
    24
  );
  group.userData.sgfWheelGeo = wheelGeo;
  for (const x of rowXs) {
    for (const z of rowZs) {
      const wheel = new THREE.Mesh(wheelGeo, material);
      wheel.name = "sgfWheel";
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0, z);
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      group.add(wheel);
    }
  }
  group.position.set(p.x, p.y, p.z);
  resetModelScale(group);
  group.userData.sgfWheelBase = {
    rowsWide: p.rowsWide,
    gauge: round3(p.gauge / METRES_PER_UNIT),
    wheelsPerRow: p.wheelsPerRow,
    wheelBaseSpan: round3(p.wheelBaseSpan / METRES_PER_UNIT),
    wheelRadius: round3(p.wheelRadius / METRES_PER_UNIT),
    wheelThickness: round3(p.wheelThickness / METRES_PER_UNIT),
  };
}

function createWheelBaseGroup(editor, material) {
  const group = new THREE.Group();
  rebuildWheelBase(group, editor, material);
  return group;
}

function readWheelBaseEditor(group) {
  const ud = group.userData.sgfWheelBase || {};
  const { x, y, z } = group.position;
  return {
    rowsWide: ud.rowsWide ?? DEFAULT_WHEEL_BASE_EDITOR.rowsWide,
    gauge: ud.gauge ?? DEFAULT_WHEEL_BASE_EDITOR.gauge,
    wheelsPerRow: ud.wheelsPerRow ?? DEFAULT_WHEEL_BASE_EDITOR.wheelsPerRow,
    wheelBaseSpan: ud.wheelBaseSpan ?? DEFAULT_WHEEL_BASE_EDITOR.wheelBaseSpan,
    wheelRadius: ud.wheelRadius ?? DEFAULT_WHEEL_BASE_EDITOR.wheelRadius,
    wheelThickness: ud.wheelThickness ?? DEFAULT_WHEEL_BASE_EDITOR.wheelThickness,
    x: metres(x),
    y: metres(y),
    z: metres(z),
  };
}

function applyWheelBaseEditor(group, editor, material) {
  rebuildWheelBase(group, editor, material);
}

function disposePieceObject(root) {
  if (root.userData.sgfWheelGeo) {
    root.userData.sgfWheelGeo.dispose();
    root.userData.sgfWheelGeo = null;
    return;
  }
  if (root.geometry) root.geometry.dispose();
}

function readEditorForPart(entry) {
  if (entry.kind === "disc") return readDiscEditor(entry.mesh);
  if (entry.kind === "wheelBase") return readWheelBaseEditor(entry.mesh);
  return readCubeEditor(entry.mesh);
}

function applyEditorForPart(entry, editor, pieceMat) {
  if (entry.kind === "disc") applyDiscEditor(entry.mesh, editor);
  else if (entry.kind === "wheelBase") applyWheelBaseEditor(entry.mesh, editor, pieceMat);
  else applyCubeEditor(entry.mesh, editor);
}

function meshRotationFields(mesh) {
  return {
    rotX: round3(mesh.rotation.x),
    rotY: round3(mesh.rotation.y),
    rotZ: round3(mesh.rotation.z),
  };
}

function applyMeshRotation(mesh, spec) {
  mesh.rotation.set(
    Number(spec.rotX) || 0,
    Number(spec.rotY) || 0,
    Number(spec.rotZ) || 0
  );
}

const ROTATE_MENU_ITEMS = [
  { axis: "x", label: "Rotate 90° on X" },
  { axis: "y", label: "Rotate 90° on Y" },
  { axis: "z", label: "Rotate 90° on Z" },
];

function attachSelectionOutline(object) {
  detachSelectionOutline(object);
  let edges;
  if (object.geometry) {
    edges = new THREE.EdgesGeometry(object.geometry, 12);
  } else {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.updateMatrixWorld(true);
    object.worldToLocal(center);
    const boxGeo = new THREE.BoxGeometry(
      Math.max(0.02, size.x),
      Math.max(0.02, size.y),
      Math.max(0.02, size.z)
    );
    edges = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    const outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: SELECT_OUTLINE_COLOR, toneMapped: false })
    );
    outline.name = "sgfSelectionOutline";
    outline.position.copy(center);
    outline.renderOrder = 999;
    object.add(outline);
    return;
  }
  const outline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: SELECT_OUTLINE_COLOR, toneMapped: false })
  );
  outline.name = "sgfSelectionOutline";
  outline.renderOrder = 999;
  object.add(outline);
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
  const [editor, setEditor] = useState({ ...DEFAULT_CUBE_EDITOR });
  const [editorKind, setEditorKind] = useState("cube");
  const editorFromSceneRef = useRef(false);
  const openPieceContextMenuRef = useRef(null);
  const pieceMenuRef = useRef(null);
  const selectPartRef = useRef(null);
  const clearSelectionRef = useRef(null);
  const selectedPartIdRef = useRef(null);
  const contextMenuPieceIdRef = useRef(null);
  const [pieceContextMenu, setPieceContextMenu] = useState(null);

  const closePieceContextMenu = useCallback(() => {
    setPieceContextMenu(null);
  }, []);

  const selectPart = useCallback((id) => {
    const api = sceneApiRef.current;
    if (!api || !id) return;
    let entry = api.parts.get(id);
    if (!entry && api.piecesGroup) {
      const mesh = api.piecesGroup.children.find((c) => c.userData?.sgfPieceId === id);
      if (mesh) {
        const kind = mesh.userData.sgfKind || "cube";
        const label =
          kind === "disc" ? "Disc" : kind === "wheelBase" ? "Wheel Base" : "Cube";
        entry = { mesh, label, kind };
        api.parts.set(id, entry);
        api.syncPickables?.();
      }
    }
    if (!entry) return;
    api.setSelectedMesh(entry.mesh);
    const next = readEditorForPart(entry);
    editorFromSceneRef.current = true;
    selectedPartIdRef.current = id;
    setSelectedPartId(id);
    setSelectedLabel(entry.label);
    setEditorKind(entry.kind);
    setEditor(next);
    requestAnimationFrame(() => {
      editorFromSceneRef.current = false;
    });
  }, []);

  const clearSelection = useCallback(() => {
    sceneApiRef.current?.setSelectedMesh(null);
    selectedPartIdRef.current = null;
    setSelectedPartId(null);
    setSelectedLabel("");
    setEditorKind("cube");
  }, []);

  selectPartRef.current = selectPart;
  clearSelectionRef.current = clearSelection;

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

  const rotatePieceAxis = useCallback(
    (axis, pieceId) => {
      const id = pieceId || pieceContextMenu?.pieceId || selectedPartId;
      const api = sceneApiRef.current;
      if (!id || !api?.rotatePiece90) return;
      api.rotatePiece90(id, axis);
      closePieceContextMenu();
      const entry = api.parts.get(id);
      if (entry) {
        editorFromSceneRef.current = true;
        setEditor(readEditorForPart(entry));
        setEditorKind(entry.kind);
        requestAnimationFrame(() => {
          editorFromSceneRef.current = false;
        });
      }
    },
    [closePieceContextMenu, pieceContextMenu?.pieceId, selectedPartId]
  );

  const deletePiece = useCallback(
    (pieceId) => {
      const id =
        pieceId ||
        contextMenuPieceIdRef.current ||
        pieceContextMenu?.pieceId ||
        selectedPartIdRef.current ||
        selectedPartId;
      const api = sceneApiRef.current;
      if (!id || !api?.removePiece) return;
      const removed = api.removePiece(id);
      if (removed || !api.parts.has(id)) {
        if (selectedPartIdRef.current === id) clearSelection();
      }
      contextMenuPieceIdRef.current = null;
      closePieceContextMenu();
    },
    [clearSelection, closePieceContextMenu, pieceContextMenu?.pieceId, selectedPartId]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (!selectedPartId) return;
      e.preventDefault();
      deletePiece(selectedPartId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deletePiece, selectedPartId]);

  useEffect(() => {
    if (!pieceContextMenu) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closePieceContextMenu();
    };
    let onPointer = null;
    const timer = window.setTimeout(() => {
      onPointer = (e) => {
        if (pieceMenuRef.current?.contains(e.target)) return;
        closePieceContextMenu();
      };
      window.addEventListener("pointerdown", onPointer);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (onPointer) window.removeEventListener("pointerdown", onPointer);
    };
  }, [closePieceContextMenu, pieceContextMenu]);

  useEffect(() => {
    openPieceContextMenuRef.current = (pieceId, clientX, clientY) => {
      contextMenuPieceIdRef.current = pieceId;
      setPieceContextMenu({ pieceId, x: clientX, y: clientY });
    };
    return () => {
      openPieceContextMenuRef.current = null;
    };
  }, []);

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

    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    const railCentreX = brRailCentreOffsetM();
    const railBottomY = brRailBottomYM();
    const sleeperCentreY = BR_TRACK.ballastDepthM + BR_TRACK.sleeperDepthM / 2;

    const bedGeo = new THREE.BoxGeometry(
      BR_TRACK.ballastWidthM,
      BR_TRACK.ballastDepthM,
      BR_TRACK.trackLengthM
    );
    const bedMat = new THREE.MeshStandardMaterial({ color: "#6b5b4f", roughness: 1 });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.set(0, BR_TRACK.ballastDepthM / 2, 0);
    bed.receiveShadow = true;
    trackGroup.add(bed);

    const railMat = new THREE.MeshStandardMaterial({
      color: "#8a9099",
      metalness: 0.45,
      roughness: 0.35,
    });
    const railL = createBrRailGroup(BR_TRACK.trackLengthM, railMat);
    railL.position.set(-railCentreX, railBottomY, 0);
    const railR = createBrRailGroup(BR_TRACK.trackLengthM, railMat);
    railR.position.set(railCentreX, railBottomY, 0);
    trackGroup.add(railL, railR);

    const sleeperGeo = new THREE.BoxGeometry(
      BR_TRACK.sleeperLengthM,
      BR_TRACK.sleeperDepthM,
      BR_TRACK.sleeperWidthM
    );
    const sleeperMat = new THREE.MeshStandardMaterial({ color: "#5c4033", roughness: 0.9 });
    const sleeperCount = Math.floor(BR_TRACK.trackLengthM / BR_TRACK.sleeperSpacingM) + 1;
    const sleeperStartZ = -((sleeperCount - 1) * BR_TRACK.sleeperSpacingM) / 2;
    for (let i = 0; i < sleeperCount; i += 1) {
      const s = new THREE.Mesh(sleeperGeo, sleeperMat);
      s.position.set(0, sleeperCentreY, sleeperStartZ + i * BR_TRACK.sleeperSpacingM);
      s.receiveShadow = true;
      s.castShadow = true;
      trackGroup.add(s);
    }

    const piecesGroup = new THREE.Group();
    scene.add(piecesGroup);

    const pieceMat = new THREE.MeshStandardMaterial({
      color: "#d0d0d0",
      roughness: 0.7,
      metalness: 0.05,
    });

    const parts = new Map();
    const pickables = [];
    let pieceSeq = 0;

    const syncPickables = () => {
      pickables.length = 0;
      for (const child of piecesGroup.children) {
        if (child.userData?.sgfPieceId) pickables.push(child);
      }
    };

    const saveLayout = () => {
      try {
        const pieces = [];
        for (const [id, entry] of parts) {
          if (entry.kind === "disc") {
            const ed = readDiscEditor(entry.mesh);
            pieces.push({
              id,
              kind: "disc",
              label: entry.label,
              radius: ed.radius,
              thickness: ed.thickness,
              startDegree: ed.startDegree,
              endDegree: ed.endDegree,
              x: ed.x,
              y: ed.y,
              z: ed.z,
              ...meshRotationFields(entry.mesh),
            });
          } else if (entry.kind === "wheelBase") {
            const ed = readWheelBaseEditor(entry.mesh);
            pieces.push({
              id,
              kind: "wheelBase",
              label: entry.label,
              rowsWide: ed.rowsWide,
              gauge: ed.gauge,
              wheelsPerRow: ed.wheelsPerRow,
              wheelBaseSpan: ed.wheelBaseSpan,
              wheelRadius: ed.wheelRadius,
              wheelThickness: ed.wheelThickness,
              x: ed.x,
              y: ed.y,
              z: ed.z,
              ...meshRotationFields(entry.mesh),
            });
          } else if (entry.kind === "cube") {
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
              ...meshRotationFields(entry.mesh),
            });
          }
        }
        localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({ v: 2, pieces }));
      } catch (e) {
        console.error("Train builder save failed:", e);
      }
    };

    const loadLayout = () => {
      try {
        const raw =
          localStorage.getItem(BUILDER_STORAGE_KEY) ||
          localStorage.getItem("sgf-playground-train-builder-v1");
        if (!raw) return;
        const data = JSON.parse(raw);
        if ((data.v !== 1 && data.v !== 2) || !Array.isArray(data.pieces)) return;
        let maxSeq = 0;
        for (const spec of data.pieces) {
          if (typeof spec.id !== "string") continue;
          let kind = "cube";
          if (spec.kind === "disc") kind = "disc";
          else if (spec.kind === "wheelBase") kind = "wheelBase";
          let mesh;
          if (kind === "disc") {
            mesh = new THREE.Mesh(new THREE.BufferGeometry(), pieceMat);
            assignDiscGeometry(
              mesh,
              spec.radius,
              spec.thickness,
              spec.startDegree,
              spec.endDegree
            );
          } else if (kind === "wheelBase") {
            mesh = createWheelBaseGroup(
              {
                rowsWide: spec.rowsWide,
                gauge: spec.gauge,
                wheelsPerRow: spec.wheelsPerRow,
                wheelBaseSpan: spec.wheelBaseSpan,
                wheelRadius: spec.wheelRadius,
                wheelThickness: spec.wheelThickness,
                x: spec.x,
                y: spec.y,
                z: spec.z,
              },
              pieceMat
            );
          } else {
            const L = Math.max(0.01, Number(spec.length) || 0.5);
            const H = Math.max(0.01, Number(spec.height) || 0.5);
            const W = Math.max(0.01, Number(spec.width) || 0.5);
            mesh = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), pieceMat);
          }
          mesh.position.set(
            (Number(spec.x) || 0) * METRES_PER_UNIT,
            (Number(spec.y) || 0) * METRES_PER_UNIT,
            (Number(spec.z) || 0) * METRES_PER_UNIT
          );
          resetModelScale(mesh);
          applyMeshRotation(mesh, spec);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.sgfPieceId = spec.id;
          mesh.userData.sgfKind = kind;
          piecesGroup.add(mesh);
          const label =
            spec.label ||
            (kind === "disc" ? "Disc" : kind === "wheelBase" ? "Wheel Base" : "Cube");
          parts.set(spec.id, { mesh, label, kind });
          pickables.push(mesh);
          const m = /^piece-(\d+)$/.exec(spec.id);
          if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
        }
        pieceSeq = Math.max(pieceSeq, maxSeq);
      } catch (e) {
        console.error("Train builder load failed:", e);
      }
    };

    const reconcilePieces = () => {
      const seenIds = new Set();
      for (const child of [...piecesGroup.children]) {
        const id = child.userData?.sgfPieceId;
        if (!id) {
          piecesGroup.remove(child);
          disposePieceObject(child);
          continue;
        }
        if (seenIds.has(id)) {
          piecesGroup.remove(child);
          disposePieceObject(child);
          continue;
        }
        seenIds.add(id);
        if (!parts.has(id)) {
          const kind = child.userData.sgfKind || "cube";
          const label =
            kind === "disc" ? "Disc" : kind === "wheelBase" ? "Wheel Base" : "Cube";
          parts.set(id, { mesh: child, label, kind });
        }
      }
      for (const [id, entry] of [...parts.entries()]) {
        if (entry.mesh.parent !== piecesGroup) {
          parts.delete(id);
          const idx = pickables.indexOf(entry.mesh);
          if (idx >= 0) pickables.splice(idx, 1);
        }
      }
      syncPickables();
    };

    loadLayout();
    reconcilePieces();

    let selectedMesh = null;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const setSelectedMesh = (mesh) => {
      if (selectedMesh) detachSelectionOutline(selectedMesh);
      selectedMesh = mesh;
      if (selectedMesh) attachSelectionOutline(selectedMesh);
    };

    const rotatePiece90 = (id, axis) => {
      const entry = parts.get(id);
      if (!entry) return;
      const halfTurn = Math.PI / 2;
      if (axis === "x") entry.mesh.rotation.x += halfTurn;
      else if (axis === "y") entry.mesh.rotation.y += halfTurn;
      else if (axis === "z") entry.mesh.rotation.z += halfTurn;
      if (selectedMesh === entry.mesh) attachSelectionOutline(entry.mesh);
      saveLayout();
    };

    const removePiece = (id) => {
      if (!id) return false;
      const meshes = piecesGroup.children.filter((c) => c.userData?.sgfPieceId === id);
      if (meshes.length === 0 && !parts.has(id)) return false;

      if (meshes.length === 0) {
        parts.delete(id);
        syncPickables();
        if (selectedPartIdRef.current === id) clearSelectionRef.current?.();
        saveLayout();
        return true;
      }

      for (const mesh of meshes) {
        if (selectedMesh === mesh) setSelectedMesh(null);
        else detachSelectionOutline(mesh);
        piecesGroup.remove(mesh);
        disposePieceObject(mesh);
      }
      parts.delete(id);
      syncPickables();
      if (selectedPartIdRef.current === id) clearSelectionRef.current?.();
      saveLayout();
      return true;
    };

    const addPiece = (kind) => {
      pieceSeq += 1;
      const id = `piece-${pieceSeq}`;
      let mesh;
      let label;
      if (kind === "disc") {
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), pieceMat);
        assignDiscGeometry(
          mesh,
          DEFAULT_DISC_EDITOR.radius,
          DEFAULT_DISC_EDITOR.thickness,
          DEFAULT_DISC_EDITOR.startDegree,
          DEFAULT_DISC_EDITOR.endDegree
        );
        mesh.position.set(
          DEFAULT_DISC_EDITOR.x,
          DEFAULT_DISC_EDITOR.y,
          DEFAULT_DISC_EDITOR.z
        );
        label = `Disc ${pieceSeq}`;
        mesh.userData.sgfKind = "disc";
      } else if (kind === "wheelBase") {
        mesh = createWheelBaseGroup({ ...DEFAULT_WHEEL_BASE_EDITOR }, pieceMat);
        label = `Wheel Base ${pieceSeq}`;
        mesh.userData.sgfKind = "wheelBase";
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(
            DEFAULT_CUBE_EDITOR.length * METRES_PER_UNIT,
            DEFAULT_CUBE_EDITOR.height * METRES_PER_UNIT,
            DEFAULT_CUBE_EDITOR.width * METRES_PER_UNIT
          ),
          pieceMat
        );
        mesh.position.set(
          DEFAULT_CUBE_EDITOR.x * METRES_PER_UNIT,
          DEFAULT_CUBE_EDITOR.y * METRES_PER_UNIT,
          DEFAULT_CUBE_EDITOR.z * METRES_PER_UNIT
        );
        resetModelScale(mesh);
        label = `Cube ${pieceSeq}`;
        mesh.userData.sgfKind = "cube";
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.sgfPieceId = id;
      piecesGroup.add(mesh);
      parts.set(id, {
        mesh,
        label,
        kind: kind === "disc" ? "disc" : kind === "wheelBase" ? "wheelBase" : "cube",
      });
      syncPickables();
      saveLayout();
      return id;
    };

    sceneApiRef.current = {
      parts,
      piecesGroup,
      pieceMat,
      setSelectedMesh,
      getSelectedMesh: () => selectedMesh,
      addPiece,
      rotatePiece90,
      removePiece,
      pickables,
      syncPickables,
      saveLayout,
    };

    let orbitDragging = false;
    let orbitPointerId = null;
    let lastOrbitX = 0;
    let lastOrbitY = 0;

    const pickPieceIdAtClient = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(piecesGroup, true);
      for (const hit of hits) {
        let o = hit.object;
        while (o && o !== piecesGroup) {
          const id = o.userData?.sgfPieceId;
          if (id) return id;
          o = o.parent;
        }
      }
      return null;
    };

    const tryOpenPieceMenu = (clientX, clientY) => {
      const hitId = pickPieceIdAtClient(clientX, clientY);
      if (!hitId) return false;
      selectPartRef.current?.(hitId);
      openPieceContextMenuRef.current?.(hitId, clientX, clientY);
      return true;
    };

    const onPointerDown = (event) => {
      if (event.button === 2) {
        event.preventDefault();
        if (tryOpenPieceMenu(event.clientX, event.clientY)) return;
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

      const hitId = pickPieceIdAtClient(event.clientX, event.clientY);
      if (hitId) {
        selectPartRef.current?.(hitId);
        return;
      }
      clearSelectionRef.current?.();
    };

    const onMouseDown = (event) => {
      if (event.button !== 2) return;
      if (tryOpenPieceMenu(event.clientX, event.clientY)) {
        event.preventDefault();
        event.stopPropagation();
      }
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
      tryOpenPieceMenu(event.clientX, event.clientY);
    };

    renderer.domElement.style.cursor = "pointer";
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
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
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", endOrbit);
      renderer.domElement.removeEventListener("pointercancel", endOrbit);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      renderer.domElement.removeEventListener("wheel", onWheel);
      parts.forEach(({ mesh }) => detachSelectionOutline(mesh));
      renderer.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      trackGroup.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      bedMat.dispose();
      railMat.dispose();
      sleeperMat.dispose();
      pieceMat.dispose();
      parts.forEach(({ mesh }) => disposePieceObject(mesh));
      if (renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (addSeq < 1) return;
    const api = sceneApiRef.current;
    if (!api?.addPiece) return;
    const lib = LIBRARY.find((l) => l.id === selectedLibraryId);
    const kind = lib?.kind || "cube";
    const id = api.addPiece(kind);
    selectPart(id);
  }, [addSeq, selectPart, selectedLibraryId]);

  const handleAddClick = () => {
    const lib = LIBRARY.find((l) => l.id === selectedLibraryId);
    if (!lib) return;
    setAddSeq((n) => n + 1);
  };

  useEffect(() => {
    if (editorFromSceneRef.current || !selectedPartId) return;
    const api = sceneApiRef.current;
    if (!api) return;
    const entry = api.parts.get(selectedPartId);
    if (!entry) {
      clearSelection();
      return;
    }
    applyEditorForPart(entry, editor, api.pieceMat);
    if (api.getSelectedMesh() === entry.mesh) {
      attachSelectionOutline(entry.mesh);
    }
    api.saveLayout?.();
  }, [clearSelection, editor, selectedPartId]);

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
          Builder — 1 m units · BR track gauge 1435 mm · right‑click piece · right‑drag to orbit
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
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: MONUMENT, marginBottom: "4px" }}>Library</div>
          <p style={{ margin: "0 0 10px", fontSize: "0.72rem", color: "#666", lineHeight: 1.4 }}>
            Dimensions are metres (1:1). Track gauge 1.435 m; rail 145 mm (66+28+66 mm head/web/base).
          </p>
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
              {editorKind === "wheelBase" ? (
                <>
                  <label style={{ display: "block", marginBottom: "10px" }}>
                    <span style={labelStyle}>Wheels wide</span>
                    <select
                      value={String(editor.rowsWide ?? 2)}
                      onChange={(e) => onEditorField("rowsWide", e.target.value)}
                      style={inputStyle}
                    >
                      <option value="1">1 row</option>
                      <option value="2">2 rows</option>
                    </select>
                  </label>
                  {Number(editor.rowsWide) === 2 ? (
                    <label style={{ display: "block", marginBottom: "10px" }}>
                      <span style={labelStyle}>Gauge — between rows (m, X)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editor.gauge ?? ""}
                        onChange={(e) => onEditorField("gauge", e.target.value)}
                        style={inputStyle}
                      />
                    </label>
                  ) : null}
                  <label style={{ display: "block", marginBottom: "10px" }}>
                    <span style={labelStyle}>Wheels per row</span>
                    <select
                      value={String(editor.wheelsPerRow ?? 4)}
                      onChange={(e) => onEditorField("wheelsPerRow", e.target.value)}
                      style={inputStyle}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "block", marginBottom: "10px" }}>
                    <span style={labelStyle}>Wheel base — first–last centre (m, Z)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editor.wheelBaseSpan ?? ""}
                      onChange={(e) => onEditorField("wheelBaseSpan", e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: "10px" }}>
                    <span style={labelStyle}>Wheel radius (m)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.03"
                      value={editor.wheelRadius ?? ""}
                      onChange={(e) => onEditorField("wheelRadius", e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: "10px" }}>
                    <span style={labelStyle}>Wheel thickness — axle (m, X)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.02"
                      value={editor.wheelThickness ?? ""}
                      onChange={(e) => onEditorField("wheelThickness", e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                  {[
                    ["x", "X position (m)"],
                    ["y", "Y position (m)"],
                    ["z", "Z position (m)"],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: "block", marginBottom: "10px" }}>
                      <span style={labelStyle}>{label}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editor[key] ?? ""}
                        onChange={(e) => onEditorField(key, e.target.value)}
                        style={inputStyle}
                      />
                    </label>
                  ))}
                </>
              ) : (
                (editorKind === "disc"
                  ? [
                      ["radius", "Radius (m)"],
                      ["thickness", "Thickness (m, Y)"],
                      ["startDegree", "Start (°)"],
                      ["endDegree", "End (°) — arc = end − start"],
                      ["x", "X position (m)"],
                      ["y", "Y position (m)"],
                      ["z", "Z position (m)"],
                    ]
                  : [
                      ["length", "Length (m, X)"],
                      ["width", "Width (m, Z)"],
                      ["height", "Height (m, Y)"],
                      ["x", "X position (m)"],
                      ["y", "Y position (m)"],
                      ["z", "Z position (m)"],
                    ]
                ).map(([key, label]) => (
                  <label key={key} style={{ display: "block", marginBottom: "10px" }}>
                    <span style={labelStyle}>{label}</span>
                    <input
                      type="number"
                      step={key.includes("Degree") ? "0.5" : "0.01"}
                      min={key.includes("Degree") ? 0 : undefined}
                      max={key.includes("Degree") ? 360 : undefined}
                      value={editor[key] ?? ""}
                      onChange={(e) => onEditorField(key, e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                ))
              )}
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
                onMouseDown={(e) => {
                  e.preventDefault();
                  deletePiece(selectedPartIdRef.current || selectedPartId);
                }}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "8px",
                  border: `2px solid #b71c1c`,
                  background: "#ffebee",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "#b71c1c",
                  marginBottom: "8px",
                }}
              >
                Delete piece
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
              Choose a library piece and click <strong>Add</strong>. Click a piece to select and edit.{" "}
              <strong>Right‑click a piece</strong> to rotate or delete. Right‑drag empty space to orbit
              the view.
            </p>
          )}
        </div>
      </div>

      {pieceContextMenu ? (
        <div
          ref={pieceMenuRef}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: pieceContextMenu.x,
            top: pieceContextMenu.y,
            zIndex: 100,
            minWidth: "168px",
            background: WHITE,
            border: `1px solid ${MONUMENT}33`,
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
            padding: "6px 0",
            overflow: "hidden",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            style={{
              padding: "6px 12px 4px",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#666",
              borderBottom: `1px solid ${MONUMENT}18`,
            }}
          >
            Piece
          </div>
          {ROTATE_MENU_ITEMS.map(({ axis, label }) => (
            <button
              key={axis}
              type="button"
              role="menuitem"
              onClick={() => rotatePieceAxis(axis, pieceContextMenu.pieceId)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                border: "none",
                background: "transparent",
                fontSize: "0.88rem",
                fontWeight: 600,
                color: MONUMENT,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#e8eaf6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {label}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${MONUMENT}18`, marginTop: "4px" }} />
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deletePiece(contextMenuPieceIdRef.current || pieceContextMenu.pieceId);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              fontSize: "0.88rem",
              fontWeight: 700,
              color: "#b71c1c",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#ffebee";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
