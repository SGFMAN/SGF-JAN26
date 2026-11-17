/** Off-screen Three.js inventory thumbnails for Lost Expedition items. */

import * as THREE from "three";
import { ITEMS } from "./logic.js";

const SIZE = 96;
const cache = new Map();
let renderer = null;
let scene = null;
let camera = null;
let light = null;
let fill = null;

function ensureStudio() {
  if (renderer) return;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.05, 20);
  camera.position.set(1.35, 1.05, 1.55);
  camera.lookAt(0, 0.15, 0);
  light = new THREE.DirectionalLight(0xfff2d8, 1.35);
  light.position.set(2.2, 3.4, 1.6);
  fill = new THREE.HemisphereLight(0xcfe8ff, 0x3a2a18, 0.7);
  scene.add(light, fill);
}

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.05,
  });
}

function add(mesh, parent, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildItem(id) {
  const root = new THREE.Group();
  switch (id) {
    case "rations": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), mat("#c4a574")), root, 0, 0.12, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12), mat("#d8d0c4", { metalness: 0.4 })), root, 0.22, 0.22, 0.05);
      break;
    }
    case "radioCrystal": {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat("#9fd4e8", { roughness: 0.2, metalness: 0.15 }));
      crystal.rotation.y = 0.4;
      add(crystal, root, 0, 0.28, 0);
      break;
    }
    case "oilFlask": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.42, 14), mat("#c4552a")), root, 0, 0.22, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), mat("#8a3a1a")), root, 0, 0.48, 0);
      break;
    }
    case "coins": {
      for (let i = 0; i < 3; i += 1) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 20), mat("#d4b36a", { metalness: 0.7, roughness: 0.35 }));
        coin.rotation.x = Math.PI / 2;
        add(coin, root, (i - 1) * 0.12, 0.08 + i * 0.03, i * 0.04);
      }
      break;
    }
    case "bridgePin": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 10), mat("#8a949c", { metalness: 0.65 })), root, 0, 0.28, 0).rotation.z = 0.2;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), mat("#a32030")), root, 0.05, 0.48, 0.02);
      break;
    }
    case "outpostKey":
    case "chamberKey":
    case "cacheKey": {
      const brass = id === "chamberKey" ? "#c9b08a" : "#d4b36a";
      add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 10, 18), mat(brass, { metalness: 0.7 })), root, -0.12, 0.28, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.05), mat(brass, { metalness: 0.7 })), root, 0.14, 0.28, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), mat(brass, { metalness: 0.7 })), root, 0.28, 0.22, 0);
      break;
    }
    case "charcoal": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), mat("#2a2a2a")), root, 0, 0.28, 0).rotation.z = 0.55;
      break;
    }
    case "wrench": {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.1), mat("#7a848c", { metalness: 0.75 }));
      add(body, root, 0, 0.22, 0);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 14, Math.PI), mat("#7a848c", { metalness: 0.75 })), root, -0.28, 0.22, 0).rotation.z = Math.PI / 2;
      break;
    }
    case "dynamoCrank": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 10), mat("#a09070", { metalness: 0.5 })), root, 0, 0.24, 0).rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10), mat("#a09070", { metalness: 0.5 })), root, 0.2, 0.34, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), mat("#6a5a40")), root, 0.2, 0.48, 0);
      break;
    }
    case "lantern": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 12), mat("#4a4034", { metalness: 0.4 })), root, 0, 0.08, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 12), mat("#e0b33a", { roughness: 0.35 })), root, 0, 0.28, 0);
      add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 12), mat("#4a4034", { metalness: 0.4 })), root, 0, 0.48, 0);
      break;
    }
    case "railToken": {
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), mat("#c6a15a", { metalness: 0.75 }));
      disk.rotation.x = Math.PI / 2;
      add(disk, root, 0, 0.16, 0);
      break;
    }
    case "templeRubbing":
    case "expeditionLog": {
      const paper = id === "expeditionLog" ? "#efe6d4" : "#e8dcc4";
      add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.55), mat(paper)), root, 0, 0.12, 0);
      if (id === "expeditionLog") {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.58), mat("#6b4a2a")), root, 0, 0.08, 0);
      }
      break;
    }
    case "mosaicA": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), mat("#e8c050")), root, 0, 0.1, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), mat("#f4e080")), root, 0, 0.18, 0);
      break;
    }
    case "mosaicB": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), mat("#4a8ab8")), root, 0, 0.1, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.06), mat("#d0e8f4")), root, 0, 0.16, -0.06);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.06), mat("#d0e8f4")), root, 0, 0.16, 0.06);
      break;
    }
    case "mosaicC": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.4), mat("#f4f0e0")), root, 0, 0.1, 0);
      add(new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), mat("#fff8c8")), root, 0, 0.2, 0);
      break;
    }
    case "mosaicSet": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.4), mat("#d8c8a0")), root, 0, 0.1, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.32), mat("#e8c050")), root, -0.18, 0.14, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.32), mat("#4a8ab8")), root, 0, 0.14, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.32), mat("#f4f0e0")), root, 0.18, 0.14, 0);
      break;
    }
    case "goldenIdol": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), mat("#8a7a5a")), root, 0, 0.08, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.28, 12), mat("#c9a24a", { metalness: 0.35 })), root, 0, 0.28, 0);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), mat("#c9a24a", { metalness: 0.35 })), root, 0, 0.5, 0);
      break;
    }
    case "bronzeMirror": {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24), mat("#8e6a3a", { metalness: 0.8, roughness: 0.3 }));
      disc.rotation.x = Math.PI / 2;
      add(disc, root, 0, 0.28, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 10), mat("#6a4a28")), root, 0, 0.08, 0);
      break;
    }
    case "channelStone": {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 0.28), mat("#7a7268")), root, 0, 0.12, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.32), mat("#6a6258")), root, 0.08, 0.2, 0);
      break;
    }
    case "sealPick": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), mat("#9aa0a6", { metalness: 0.6 })), root, 0, 0.28, 0).rotation.z = 0.4;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), mat("#9aa0a6", { metalness: 0.6 })), root, 0.18, 0.42, 0);
      break;
    }
    case "climbingRope": {
      for (let i = 0; i < 4; i += 1) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16 + i * 0.02, 0.035, 8, 18), mat("#8b5a2b"));
        ring.rotation.x = Math.PI / 2;
        add(ring, root, 0, 0.12 + i * 0.05, 0);
      }
      break;
    }
    case "starLens": {
      add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 10, 20), mat("#c6a15a", { metalness: 0.7 })), root, 0, 0.26, 0);
      add(new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), mat("#cfd8e0", { roughness: 0.15, metalness: 0.2 })), root, 0, 0.26, 0.01);
      break;
    }
    case "brassGear": {
      const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 24), mat("#e0b45a", { metalness: 0.75, roughness: 0.35 }));
      gear.rotation.x = Math.PI / 2;
      add(gear, root, 0, 0.22, 0);
      for (let i = 0; i < 8; i += 1) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.1), mat("#e0b45a", { metalness: 0.75 }));
        const a = (i / 8) * Math.PI * 2;
        add(tooth, root, Math.cos(a) * 0.26, 0.22, Math.sin(a) * 0.26);
      }
      break;
    }
    case "signalFlare": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), mat("#c4552a")), root, 0, 0.28, 0).rotation.z = 0.35;
      add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 10), mat("#f0d060")), root, 0.16, 0.48, 0);
      break;
    }
    case "fuseWire": {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 12), mat("#a8b0b8", { roughness: 0.2, metalness: 0.3 })), root, 0, 0.24, 0).rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 8), mat("#c4552a")), root, 0, 0.24, 0).rotation.z = Math.PI / 2;
      break;
    }
    default: {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), mat("#888888")), root, 0, 0.2, 0);
    }
  }
  return root;
}

function fitCamera(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.2);
  camera.position.set(center.x + span * 1.55, center.y + span * 1.05, center.z + span * 1.7);
  camera.near = 0.05;
  camera.far = 40;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

export function getItemIcon(id) {
  if (typeof document === "undefined") return "";
  if (cache.has(id)) return cache.get(id);
  ensureStudio();
  while (scene.children.length > 2) {
    const child = scene.children[scene.children.length - 1];
    scene.remove(child);
    child.traverse?.((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
  const model = buildItem(id);
  scene.add(model);
  fitCamera(model);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  cache.set(id, url);
  scene.remove(model);
  model.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  return url;
}

export function warmItemIcons() {
  if (typeof document === "undefined") return;
  for (const id of Object.keys(ITEMS)) getItemIcon(id);
}

export function disposeItemIcons() {
  cache.clear();
  if (renderer) {
    renderer.dispose();
    renderer = null;
    scene = null;
    camera = null;
    light = null;
    fill = null;
  }
}
