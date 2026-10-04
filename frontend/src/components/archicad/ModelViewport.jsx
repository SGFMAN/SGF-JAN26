import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import grassImage from "../../images/grass.jpg";

const VIEWS = {
  front: new THREE.Vector3(0, 0.15, 1),
  rear: new THREE.Vector3(0, 0.15, -1),
  left: new THREE.Vector3(-1, 0.15, 0),
  right: new THREE.Vector3(1, 0.15, 0),
  top: new THREE.Vector3(0, 1, 0.001),
  threeD: new THREE.Vector3(1, 0.72, 1).normalize(),
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function frameBuildingBox(root) {
  const boxes = [];
  const lengths = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!child.isMesh || child.visible === false || child.userData.role === "ground") return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    boxes.push(box);
    lengths.push(Math.max(size.x, size.y, size.z));
  });
  if (!boxes.length) return new THREE.Box3();
  const centers = boxes.map((box) => box.getCenter(new THREE.Vector3()));
  const origin = new THREE.Vector3(
    median(centers.map((center) => center.x)),
    median(centers.map((center) => center.y)),
    median(centers.map((center) => center.z))
  );
  const distances = centers.map((center) => center.distanceTo(origin)).sort((a, b) => a - b);
  const typicalDistance = distances[Math.floor(distances.length * 0.9)] || 0;
  const clusterLimit = Math.max(typicalDistance * 1.75, 12);
  const clustered = lengths.filter((_, index) => centers[index].distanceTo(origin) <= clusterLimit).sort((a, b) => a - b);
  const typicalLength = clustered[Math.floor(clustered.length * 0.9)] || 0;
  const lengthLimit = Math.max(typicalLength * 4, 8);
  const fitted = new THREE.Box3();
  centers.forEach((center, index) => {
    if (center.distanceTo(origin) <= clusterLimit && lengths[index] <= lengthLimit) fitted.union(boxes[index]);
  });
  if (fitted.isEmpty()) {
    centers.forEach((center, index) => {
      if (center.distanceTo(origin) <= clusterLimit) fitted.union(boxes[index]);
    });
  }
  return fitted.isEmpty() ? new THREE.Box3().setFromObject(root) : fitted;
}

function disposeObject(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "alphaMap"].forEach((key) => {
        const texture = material[key];
        if (!texture || texture.userData?.keep) return;
        texture.dispose?.();
      });
      material.dispose?.();
    });
  });
}

function pitchedSheetFaces(mesh) {
  const geometry = mesh.geometry;
  const position = geometry?.getAttribute?.("position");
  if (!position) return null;
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const sheet = [];
  const rest = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  let area = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    edge1.subVectors(b, a);
    edge2.subVectors(c, a);
    faceNormal.crossVectors(edge1, edge2).applyMatrix3(normalMatrix);
    const length = faceNormal.length();
    const upward = length > 1e-8 ? faceNormal.y / length : 0;
    if (upward > 0.75 && upward < 0.97) {
      sheet.push(ia, ib, ic);
      area += length * 0.5;
    } else {
      rest.push(ia, ib, ic);
    }
  }
  if (area < 8 || sheet.length < 3) return null;
  return { sheet, rest, area };
}

function isolateRoofSheeting(root) {
  root.updateMatrixWorld(true);
  const found = [];
  root.traverse((child) => {
    if (!child.isMesh || !/IfcBuildingElementPart/i.test(child.name || "")) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const faces = pitchedSheetFaces(child);
    if (!faces || !material?.color) return;
    found.push({ mesh: child, material, faces, color: material.color.getHexString() });
  });
  const areaByColor = new Map();
  for (const item of found) areaByColor.set(item.color, (areaByColor.get(item.color) || 0) + item.faces.area);
  let sheetColor = "";
  let bestArea = 0;
  for (const [color, area] of areaByColor) {
    if (area > bestArea) {
      bestArea = area;
      sheetColor = color;
    }
  }
  if (!sheetColor) return [];
  const footprint = new THREE.Box3();
  const sheetMaterials = [];
  for (const item of found) {
    if (item.color !== sheetColor) continue;
    const source = item.mesh.geometry;
    const sheetGeometry = source.clone();
    sheetGeometry.setIndex(item.faces.sheet);
    const remainder = source.clone();
    remainder.setIndex(item.faces.rest);
    item.mesh.geometry = remainder;
    source.dispose();
    if (item.faces.rest.length < 3) item.mesh.visible = false;
    const material = item.material.clone();
    const sheetMesh = new THREE.Mesh(sheetGeometry, material);
    sheetMesh.name = item.mesh.name;
    sheetMesh.position.copy(item.mesh.position);
    sheetMesh.quaternion.copy(item.mesh.quaternion);
    sheetMesh.scale.copy(item.mesh.scale);
    sheetMesh.castShadow = false;
    sheetMesh.receiveShadow = false;
    sheetMesh.userData.role = "roof";
    item.mesh.parent.add(sheetMesh);
    footprint.union(new THREE.Box3().setFromObject(sheetMesh));
    sheetMaterials.push(material);
  }
  if (!footprint.isEmpty()) {
    const peak = footprint.max.y;
    root.traverse((child) => {
      if (!child.isMesh || !child.visible || child.userData.role) return;
      if (!/IfcBuildingElementProxy/i.test(child.name || "")) return;
      const box = new THREE.Box3().setFromObject(child);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      if (center.x < footprint.min.x - 0.8 || center.x > footprint.max.x + 0.8) return;
      if (center.z < footprint.min.z - 0.8 || center.z > footprint.max.z + 0.8) return;
      const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
      if (dims[0] > 0.95 || dims[2] < 1.2) return;
      const climbsTheRoof = size.y > 0.45 && box.max.y > peak - 1.35;
      const capsTheRoof = center.y > peak - 1.15 && size.y < 0.35;
      if (!climbsTheRoof && !capsTheRoof) return;
      const source = Array.isArray(child.material) ? child.material[0] : child.material;
      if (!source?.color) return;
      const material = source.clone();
      child.material = material;
      child.userData.role = "roof";
      sheetMaterials.push(material);
    });
  }
  if (footprint.isEmpty()) return sheetMaterials;
  const margin = 0.4;
  root.traverse((child) => {
    if (!child.isMesh || !child.visible || child.userData.role === "ground") return;
    const center = new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3());
    const outsideX = center.x < footprint.min.x - margin || center.x > footprint.max.x + margin;
    const outsideZ = center.z < footprint.min.z - margin || center.z > footprint.max.z + margin;
    if (outsideX || outsideZ) child.visible = false;
  });
  return sheetMaterials;
}

function assignGrassUVs(mesh) {
  const position = mesh.geometry?.getAttribute?.("position");
  if (!position) return;
  const uv = new Float32Array(position.count * 2);
  const point = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    uv[index * 2] = point.x / 2;
    uv[index * 2 + 1] = point.z / 2;
  }
  mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function styleSiteMesh(root, texture) {
  root.updateMatrixWorld(true);
  const material = new THREE.MeshStandardMaterial({
    map: texture || null,
    color: texture ? 0xffffff : 0x3d8c3a,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  let found = false;
  root.traverse((child) => {
    if (!child.isMesh) return;
    const type = elementType(child);
    if (type !== "IfcSlab" && type !== "IfcGeographicElement") return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    if (size.x < 22 || size.z < 22) return;
    if (size.y > Math.max(2.5, Math.min(size.x, size.z) * 0.08)) return;
    assignGrassUVs(child);
    child.material = material;
    child.userData.role = "ground";
    child.visible = true;
    child.castShadow = false;
    child.receiveShadow = false;
    found = true;
  });
  if (!found) material.dispose();
}

function elementType(mesh) {
  return String(mesh.name || "").replace(/[_ ]#\d+(?:_\d+)?$/, "");
}

function meshMaterial(mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

function takeMaterials(items, role) {
  const materials = [];
  for (const item of items) {
    const mesh = item.mesh || item;
    if (!mesh?.isMesh || mesh.userData.role) continue;
    const source = meshMaterial(mesh);
    if (!source?.color) continue;
    const material = source.clone();
    mesh.material = material;
    mesh.userData.role = role;
    materials.push(material);
  }
  return materials;
}

function visibleWallColour(wallSkins) {
  if (!wallSkins.length) return [];
  const bounds = new THREE.Box3();
  for (const item of wallSkins) bounds.union(item.box);
  const center = bounds.getCenter(new THREE.Vector3());
  const hits = new Map();
  const raycaster = new THREE.Raycaster();
  const meshes = wallSkins.map((item) => item.mesh);
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
  const sides = [
    { origin: (t, y) => new THREE.Vector3(bounds.min.x - 3, y, center.z + t), direction: new THREE.Vector3(1, 0, 0) },
    { origin: (t, y) => new THREE.Vector3(bounds.max.x + 3, y, center.z + t), direction: new THREE.Vector3(-1, 0, 0) },
    { origin: (t, y) => new THREE.Vector3(center.x + t, y, bounds.min.z - 3), direction: new THREE.Vector3(0, 0, 1) },
    { origin: (t, y) => new THREE.Vector3(center.x + t, y, bounds.max.z + 3), direction: new THREE.Vector3(0, 0, -1) },
  ];
  for (const y of [bounds.min.y + 0.7, bounds.min.y + 1.6]) {
    for (const side of sides) {
      for (let t = -span / 2; t <= span / 2; t += 0.9) {
        raycaster.set(side.origin(t, y), side.direction);
        raycaster.far = span + 8;
        const hit = raycaster.intersectObjects(meshes, false)[0]?.object;
        const hex = hit ? meshMaterial(hit)?.color?.getHexString?.() || "" : "";
        if (hex) hits.set(hex, (hits.get(hex) || 0) + 1);
      }
    }
  }
  let colour = "";
  let best = 0;
  for (const [hex, count] of hits) {
    if (count > best) {
      best = count;
      colour = hex;
    }
  }
  if (!colour) return wallSkins;
  return wallSkins.filter((item) => item.material?.color?.getHexString?.() === colour);
}

function collectFinishMaterials(root) {
  root.updateMatrixWorld(true);
  const visible = [];
  root.traverse((child) => {
    if (!child.isMesh || child.visible === false || child.userData.role) return;
    const box = new THREE.Box3().setFromObject(child);
    if (box.isEmpty()) return;
    visible.push({
      mesh: child,
      type: elementType(child),
      box,
      size: box.getSize(new THREE.Vector3()),
      material: meshMaterial(child),
    });
  });

  const windows = visible.filter((item) => item.type === "IfcWindow" && (item.material?.opacity ?? 1) >= 0.9);
  const doors = visible.filter((item) => item.type === "IfcDoor" && (item.material?.opacity ?? 1) >= 0.9);

  const balusterCounts = new Map();
  for (const item of visible) {
    if (item.type !== "IfcBuildingElementProxy") continue;
    const { x, y, z } = item.size;
    const hex = item.material?.color?.getHexString?.() || "";
    if (hex && x < 0.12 && z < 0.12 && y > 0.4 && y < 1.15) balusterCounts.set(hex, (balusterCounts.get(hex) || 0) + 1);
  }
  let balusterColor = "";
  let balusterBest = 7;
  for (const [hex, count] of balusterCounts) {
    if (count > balusterBest) {
      balusterBest = count;
      balusterColor = hex;
    }
  }
  const balustrade = balusterColor
    ? visible.filter((item) => {
        if (item.type !== "IfcBuildingElementProxy") return false;
        if (item.material?.color?.getHexString?.() !== balusterColor) return false;
        return item.size.y < 1.3 && Math.max(item.size.x, item.size.z) < 3;
      })
    : [];

  const gutterColors = new Set();
  for (const item of visible) {
    if (item.type !== "IfcBuildingElementProxy" || item.box.min.y <= 2.2 || item.size.y >= 0.55) continue;
    const dims = [item.size.x, item.size.y, item.size.z].sort((a, b) => a - b);
    const hex = item.material?.color?.getHexString?.() || "";
    if (hex && dims[2] > 1.2 && dims[0] < 0.35) gutterColors.add(hex);
  }
  const gutters = visible.filter((item) => {
    const fascia =
      (item.type === "IfcWall" || item.type === "IfcBeam") &&
      item.box.min.y > 2.35 &&
      item.size.y < 0.4 &&
      Math.max(item.size.x, item.size.z) > 0.25;
    if (fascia) return true;
    const hex = item.material?.color?.getHexString?.() || "";
    if (item.type !== "IfcBuildingElementProxy" || !gutterColors.has(hex) || item.box.min.y <= 2.2 || item.size.y >= 0.55) return false;
    const dims = [item.size.x, item.size.y, item.size.z].sort((a, b) => a - b);
    return dims[0] < 0.4;
  });

  const baseboards = visible.filter(
    (item) =>
      item.type === "IfcSlab" &&
      item.box.max.y <= 0.4 &&
      item.box.min.y < 0.15 &&
      item.size.y <= 1.2 &&
      Math.max(item.size.x, item.size.z) >= 0.8
  );

  const wallSkins = visible.filter((item) => {
    if (item.type !== "IfcBuildingElementPart") return false;
    const thin = Math.min(item.size.x, item.size.z);
    return item.size.y > 1.2 && thin < 3.2 && thin > 0.02;
  });
  const claddingSkins = visibleWallColour(wallSkins);
  const wallTops = claddingSkins.map((item) => item.box.max.y).sort((a, b) => a - b);
  const wallPlate = wallTops[Math.floor(wallTops.length * 0.5)] || 0;
  const claddingMeshes = [...claddingSkins];
  const claimedSkin = new Set(claddingSkins.map((item) => item.mesh));
  for (const item of visible) {
    if (item.type !== "IfcBuildingElementPart" || claimedSkin.has(item.mesh)) continue;
    if (item.box.min.y < wallPlate - 0.15) continue;
    const thin = Math.min(item.size.x, item.size.z);
    if (item.size.y > 0.5 && thin < 3.2 && thin > 0.02) claddingMeshes.push(item);
  }

  return {
    windows: takeMaterials(windows, "windows"),
    doors: takeMaterials(doors, "doors"),
    balustrade: takeMaterials(balustrade, "balustrade"),
    gutters: takeMaterials(gutters, "gutters"),
    baseboards: takeMaterials(baseboards, "baseboards"),
    cladding: takeMaterials(claddingMeshes, "cladding"),
  };
}

export default function ModelViewport({ modelUrl, requestHeaders, onReady, onError, onSelect, apiRef, finishColors = null }) {
  const mountRef = useRef(null);
  const headersRef = useRef(requestHeaders);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onSelectRef = useRef(onSelect);
  const finishRef = useRef(finishColors);
  headersRef.current = requestHeaders;
  onReadyRef.current = onReady;
  onErrorRef.current = onError;
  onSelectRef.current = onSelect;
  finishRef.current = finishColors;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f2ee");

    const perspective = new THREE.PerspectiveCamera(40, 1, 0.05, 5000);
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.05, 5000);
    let camera = perspective;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor("#f4f2ee", 1);
    const grassTexture = new THREE.TextureLoader().load(grassImage);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.colorSpace = THREE.SRGBColorSpace;
    grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;
    grassTexture.userData.keep = true;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0xf7f4ee, 0xc8bfb2, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff6e8, 2.1);
    sun.position.set(18, 28, 12);
    scene.add(sun);
    scene.add(sun.target);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshLambertMaterial({ color: 0xe7e1d8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.visible = false;
    scene.add(ground);

    const building = new THREE.Group();
    scene.add(building);
    let helper = null;
    const goal = {
      position: new THREE.Vector3(8, 6, 8),
      target: new THREE.Vector3(),
      active: false,
    };
    const fitState = {
      center: new THREE.Vector3(),
      minY: 0,
      radius: 8,
      note: "",
    };

    let sized = false;
    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width < 2 || height < 2) return;
      sized = true;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
      const half = Math.max(fitState.radius, 0.5);
      ortho.left = -half * aspect;
      ortho.right = half * aspect;
      ortho.top = half;
      ortho.bottom = -half;
      ortho.updateProjectionMatrix();
    };

    const placeGround = () => {
      const radius = Math.max(8, fitState.radius * 1.8);
      ground.geometry.dispose();
      ground.geometry = new THREE.CircleGeometry(radius, 64);
      ground.position.set(fitState.center.x, fitState.minY - 0.04, fitState.center.z);
      const span = radius * 2.2;
      sun.position.set(fitState.center.x + span, fitState.minY + span, fitState.center.z + span);
    };

    const frameCamera = (direction, { animate = true } = {}) => {
      const dist = Math.max(fitState.radius * 2.2, 4);
      const dir = direction.clone();
      if (dir.lengthSq() < 1e-8) dir.copy(VIEWS.threeD);
      const offset = dir.normalize().multiplyScalar(dist);
      goal.target.copy(fitState.center);
      goal.position.copy(fitState.center).add(offset);
      if (direction.y > 0.9) goal.position.z += fitState.radius * 0.01;
      sun.position.copy(fitState.center).add(new THREE.Vector3(fitState.radius * 1.4, fitState.radius * 2.4, fitState.radius));
      sun.target.position.copy(fitState.center);
      if (!animate) {
        camera.position.copy(goal.position);
        controls.target.copy(goal.target);
        goal.active = false;
      } else {
        goal.active = true;
      }
      camera.near = Math.max(0.02, fitState.radius / 200);
      let groundReach = 0;
      building.traverse((child) => {
        if (!child.isMesh || child.userData.role !== "ground") return;
        const box = new THREE.Box3().setFromObject(child);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        groundReach = Math.max(groundReach, center.distanceTo(fitState.center) + box.getSize(new THREE.Vector3()).length() * 0.5);
      });
      camera.far = Math.max(100, fitState.radius * 40, groundReach * 2.5);
      camera.updateProjectionMatrix();
      controls.update();
    };

    const measure = () => {
      building.scale.setScalar(1);
      const raw = new THREE.Box3();
      building.traverse((child) => {
        if (!child.isMesh || child.visible === false || child.userData.role === "ground") return;
        raw.union(new THREE.Box3().setFromObject(child));
      });
      if (raw.isEmpty()) return false;
      const rawSize = raw.getSize(new THREE.Vector3());
      const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z);
      if (maxDim > 2000) {
        building.scale.setScalar(0.001);
        fitState.note = "Shown in metres. The file's units looked like millimetres, so the view is scaled without changing the model.";
      } else {
        fitState.note = "";
      }
      const fitted = frameBuildingBox(building);
      if (fitted.isEmpty()) return false;
      fitted.getCenter(fitState.center);
      fitState.minY = fitted.min.y;
      const fittedSize = fitted.getSize(new THREE.Vector3());
      fitState.radius = Math.max(fittedSize.length() * 0.5, 0.5);
      placeGround();
      resize();
      return true;
    };

    const clearSelection = () => {
      if (helper) {
        scene.remove(helper);
        helper.geometry?.dispose?.();
        helper.material?.dispose?.();
        helper = null;
      }
    };

    const selectObject = (object) => {
      clearSelection();
      if (!object) {
        onSelectRef.current?.("");
        return;
      }
      let named = object;
      while (named && !named.name && named.parent) named = named.parent;
      helper = new THREE.BoxHelper(object, 0xc4552a);
      scene.add(helper);
      onSelectRef.current?.(named?.name || "Unnamed part");
    };

    const navKeys = new Set();
    let navShift = false;
    const typingTarget = (element) => {
      const tag = element?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(element?.isContentEditable);
    };
    const NAV_CODES = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyE",
      "KeyC",
      "KeyQ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
      "Equal",
      "Minus",
      "NumpadAdd",
      "NumpadSubtract",
    ]);
    const onNavKeyDown = (event) => {
      if (event.repeat && event.code.startsWith("Shift")) return;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") navShift = true;
      if (!NAV_CODES.has(event.code) || typingTarget(event.target)) return;
      navKeys.add(event.code);
      goal.active = false;
      event.preventDefault();
    };
    const onNavKeyUp = (event) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") navShift = false;
      navKeys.delete(event.code);
    };
    const onNavBlur = () => {
      navKeys.clear();
      navShift = false;
    };
    window.addEventListener("keydown", onNavKeyDown);
    window.addEventListener("keyup", onNavKeyUp);
    window.addEventListener("blur", onNavBlur);

    let pointer = null;
    const onPointerDown = (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event) => {
      if (!pointer || !building.children.length) return;
      const moved = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
      pointer = null;
      if (moved > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(building.children, true);
      selectObject(hits[0]?.object || null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const useCamera = (next) => {
      const position = camera.position.clone();
      const target = controls.target.clone();
      camera = next;
      camera.position.copy(position);
      controls.object = camera;
      controls.target.copy(target);
      resize();
      controls.update();
    };

    const finishes = {
      roof: [],
      cladding: [],
      baseboards: [],
      windows: [],
      doors: [],
      balustrade: [],
      gutters: [],
    };
    const paintFinish = (key, hex) => {
      if (!hex) return;
      for (const material of finishes[key] || []) {
        if (material?.color) material.color.set(hex);
      }
    };
    const applyStoredFinishes = () => {
      const chosen = finishRef.current || {};
      paintFinish("roof", chosen.roof);
      paintFinish("cladding", chosen.cladding);
      paintFinish("baseboards", chosen.baseboards);
      paintFinish("windows", chosen.windows);
      paintFinish("doors", chosen.doors);
      paintFinish("balustrade", chosen.balustrade);
      paintFinish("gutters", chosen.gutters);
    };

    const api = {
      setRoofColor: (hex) => paintFinish("roof", hex),
      setCladdingColor: (hex) => paintFinish("cladding", hex),
      setBaseboardColor: (hex) => paintFinish("baseboards", hex),
      setWindowColor: (hex) => paintFinish("windows", hex),
      setDoorColor: (hex) => paintFinish("doors", hex),
      setBalustradeColor: (hex) => paintFinish("balustrade", hex),
      setGutterColor: (hex) => paintFinish("gutters", hex),
      setView: (name) => {
        const direction = VIEWS[name] || VIEWS.threeD;
        frameCamera(direction, { animate: true });
      },
      reset: () => frameCamera(VIEWS.threeD, { animate: true }),
      fit: () => {
        if (measure()) frameCamera(camera.position.clone().sub(fitState.center), { animate: true });
      },
      setProjection: (mode) => {
        useCamera(mode === "ortho" ? ortho : perspective);
        frameCamera(camera.position.clone().sub(fitState.center), { animate: false });
      },
      capture: () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      },
    };
    if (apiRef) apiRef.current = api;

    let frame = 0;
    let lastNav = performance.now();
    const navForward = new THREE.Vector3();
    const navRight = new THREE.Vector3();
    const navMove = new THREE.Vector3();
    const navOffset = new THREE.Vector3();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastNav) / 1000);
      lastNav = now;
      if (!sized) resize();
      if (navKeys.size) {
        goal.active = false;
        camera.getWorldDirection(navForward);
        navForward.y = 0;
        if (navForward.lengthSq() < 1e-8) navForward.set(0, 0, -1);
        navForward.normalize();
        navRight.crossVectors(navForward, camera.up).normalize();
        navMove.set(0, 0, 0);
        if (navKeys.has("KeyW") || navKeys.has("ArrowUp")) navMove.add(navForward);
        if (navKeys.has("KeyS") || navKeys.has("ArrowDown")) navMove.sub(navForward);
        if (navKeys.has("KeyD") || navKeys.has("ArrowRight")) navMove.add(navRight);
        if (navKeys.has("KeyA") || navKeys.has("ArrowLeft")) navMove.sub(navRight);
        if (navKeys.has("KeyE") || navKeys.has("PageUp")) navMove.y += 1;
        if (navKeys.has("KeyC") || navKeys.has("KeyQ") || navKeys.has("PageDown")) navMove.y -= 1;
        if (navMove.lengthSq() > 0) {
          navMove.normalize();
          const speed = Math.max(fitState.radius * 0.7, 1.2) * (navShift ? 3 : 1);
          navMove.multiplyScalar(speed * dt);
          camera.position.add(navMove);
          controls.target.add(navMove);
        }
        const zoomIn = navKeys.has("Equal") || navKeys.has("NumpadAdd");
        const zoomOut = navKeys.has("Minus") || navKeys.has("NumpadSubtract");
        if (zoomIn || zoomOut) {
          if (camera.isOrthographicCamera) {
            const nextZoom = camera.zoom * (zoomIn ? 1 + 0.9 * dt : 1 - 0.9 * dt);
            camera.zoom = Math.min(16, Math.max(0.2, nextZoom));
            camera.updateProjectionMatrix();
          } else {
            navOffset.copy(camera.position).sub(controls.target);
            const distance = navOffset.length();
            const next = Math.min(
              Math.max(fitState.radius * 12, 20),
              Math.max(Math.max(fitState.radius * 0.12, 0.4), distance * (zoomIn ? 1 - 0.85 * dt : 1 + 0.85 * dt))
            );
            if (distance > 1e-4) camera.position.copy(controls.target).add(navOffset.multiplyScalar(next / distance));
          }
        }
      }
      if (goal.active) {
        camera.position.lerp(goal.position, 0.12);
        controls.target.lerp(goal.target, 0.12);
        if (camera.position.distanceTo(goal.position) < fitState.radius * 0.01) goal.active = false;
      }
      controls.update();
      if (helper) helper.update();
      renderer.render(scene, camera);
    };
    tick();

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    frameCamera(VIEWS.threeD, { animate: false });

    const banner = document.createElement("div");
    banner.style.cssText =
      "position:absolute;left:16px;right:16px;top:16px;z-index:3;font-weight:700;color:#323233;background:rgba(255,255,255,0.94);padding:12px 14px;border-radius:10px;display:none";
    mount.appendChild(banner);
    const showBanner = (text) => {
      banner.textContent = text || "";
      banner.style.display = text ? "block" : "none";
    };

    let cancelled = false;
    const loader = new GLTFLoader();
    const showModel = (gltf) => {
      try {
        if (cancelled) {
          disposeObject(gltf.scene);
          return;
        }
        clearSelection();
        while (building.children.length) {
          const child = building.children.pop();
          disposeObject(child);
          building.remove(child);
        }
        gltf.scene.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = false;
          child.receiveShadow = false;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material) => {
            if (!material) return;
            material.side = THREE.DoubleSide;
            if (material.transparent && material.opacity === 0) material.opacity = 1;
          });
        });
        building.position.set(0, 0, 0);
        building.scale.setScalar(1);
        building.add(gltf.scene);
        styleSiteMesh(building, grassTexture);
        finishes.roof = isolateRoofSheeting(building);
        const found = collectFinishMaterials(building);
        finishes.cladding = found.cladding;
        finishes.baseboards = found.baseboards;
        finishes.windows = found.windows;
        finishes.doors = found.doors;
        finishes.balustrade = found.balustrade;
        finishes.gutters = found.gutters;
        applyStoredFinishes();
        if (!measure()) {
          showBanner("This model has no visible building.");
          onErrorRef.current?.("This model has no visible building.");
          return;
        }
        frameCamera(VIEWS.threeD, { animate: false });
        camera.lookAt(fitState.center);
        controls.target.copy(fitState.center);
        controls.update();
        renderer.render(scene, camera);
        showBanner("");
        onReadyRef.current?.({ note: fitState.note });
      } catch (error) {
        const message = error?.message || "The model could not be opened.";
        showBanner(message);
        onErrorRef.current?.(message);
      }
    };

    if (modelUrl) {
      showBanner("Loading the building…");
      fetch(modelUrl, {
        headers: headersRef.current || {},
        credentials: "include",
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || "The model could not be opened.");
          }
          return response.arrayBuffer();
        })
        .then((buffer) => {
          if (cancelled) return;
          loader.parse(buffer, "", showModel, (error) => {
            if (cancelled) return;
            const message = error?.message || "The model could not be opened.";
            showBanner(message);
            onErrorRef.current?.(message);
          });
        })
        .catch((error) => {
          if (cancelled) return;
          const message = error?.message || "The model could not be opened.";
          showBanner(message);
          onErrorRef.current?.(message);
        });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onNavKeyDown);
      window.removeEventListener("keyup", onNavKeyUp);
      window.removeEventListener("blur", onNavBlur);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      clearSelection();
      disposeObject(building);
      grassTexture.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      banner.remove();
      if (apiRef) apiRef.current = null;
    };
  }, [modelUrl, apiRef]);

  return <div ref={mountRef} style={{ position: "absolute", inset: 0, minHeight: 480, touchAction: "none" }} />;
}
