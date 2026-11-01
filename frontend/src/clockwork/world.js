import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  BUILDINGS,
  HOTSPOTS,
  NPC_SPOTS,
  PARTITIONS,
  SCALE,
  SOLIDS,
  WALL_THICK,
  canMove,
  clearLine,
  hotspotById,
  terrainHeight,
} from "./logic.js";
import { TOWN_SPAN, bakeTownGround, createTownTextures } from "./textures.js";

const WALKER_URL = "/models/walker.glb";

function dressWalker(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = true;
    if (/eyebrow|eyelash|hairline|ankle lining|teeth|held accessory/i.test(obj.name)) obj.visible = false;
  });
}

const WALKER_LOOKS = {
  hero: { scale: 1, shirt: "#3c7dff", pants: "#243044", shoes: "#f4f4f4", hair: "#161616", skin: "#f0c2a4" },
  bram: { scale: 1.08, shirt: "#1e3a5f", pants: "#2a2e33", shoes: "#111111", hair: "#c5c8ce", skin: "#e0b090", hat: "cap", hatColor: "#141820" },
  nell: { scale: 0.92, shirt: "#2f6b4f", pants: "#3a2a22", shoes: "#4a3020", hair: "#6b3a22", skin: "#f0c2a4", hat: "bow", hatColor: "#2f6b4f" },
  ivo: { scale: 1, shirt: "#6b4a2a", pants: "#3a342c", shoes: "#2a241c", hair: "#d9d3c7", skin: "#c48a62", hat: "goggles", hatColor: "#c6a15a" },
  odette: { scale: 0.97, shirt: "#5a3d6e", pants: "#2c2430", shoes: "#3a2428", hair: "#d5d0dc", skin: "#f3d0b4" },
  hugo: { scale: 1.12, shirt: "#8e2f2f", pants: "#1c1a18", shoes: "#111111", hair: "#1a120e", skin: "#e8b896", hat: "bowler", hatColor: "#161412" },
  pip: { scale: 0.9, shirt: "#e0b33a", pants: "#3d4a28", shoes: "#5a3a22", hair: "#e07a2f", skin: "#f0c8a4", hat: "cap", hatColor: "#3d4a28" },
  vesper: { scale: 1.06, shirt: "#241820", pants: "#140e12", shoes: "#0c0c0c", hair: "#4a1c24", skin: "#f6d2be", hat: "top", hatColor: "#140e12" },
  cole: { scale: 1.03, shirt: "#4e5854", pants: "#2a3034", shoes: "#1a1a1a", hair: "#2a2a2a", skin: "#d7a884", hat: "cap", hatColor: "#c4552a" },
};

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvasFromTexture(texture) {
  const image = texture?.image;
  if (!image?.width || !image?.height) return null;
  const board = document.createElement("canvas");
  board.width = image.width;
  board.height = image.height;
  const ctx = board.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return { canvas: board, ctx };
}

function textureFromCanvas(board, texture) {
  const next = new THREE.CanvasTexture(board);
  next.colorSpace = THREE.SRGBColorSpace;
  next.flipY = texture.flipY;
  next.wrapS = texture.wrapS;
  next.wrapT = texture.wrapT;
  next.needsUpdate = true;
  return next;
}

function flatMasked(texture, hex) {
  const made = canvasFromTexture(texture);
  if (!made) return null;
  made.ctx.globalCompositeOperation = "source-in";
  made.ctx.fillStyle = hex;
  made.ctx.fillRect(0, 0, made.canvas.width, made.canvas.height);
  return textureFromCanvas(made.canvas, texture);
}

function recolorSkin(texture, hex) {
  const made = canvasFromTexture(texture);
  if (!made) return null;
  const pic = made.ctx.getImageData(0, 0, made.canvas.width, made.canvas.height);
  const data = pic.data;
  const [tr, tg, tb] = hexRgb(hex);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const blue = b > r + 12 && b > g + 8;
    const sclera = lum > 185 && sat < 0.22;
    const dark = lum < 40;
    const lip = r > g + 18 && r > b + 12 && lum > 50 && lum < 190 && sat > 0.2;
    if (blue || sclera || dark || lip) continue;
    const shade = Math.min(1.35, Math.max(0.42, lum / 165));
    data[i] = Math.min(255, tr * shade);
    data[i + 1] = Math.min(255, tg * shade);
    data[i + 2] = Math.min(255, tb * shade);
  }
  made.ctx.putImageData(pic, 0, 0);
  return textureFromCanvas(made.canvas, texture);
}

function paintWalker(root, look) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const cloned = list.map((mat) => mat.clone());
    obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
    for (const mat of cloned) {
      const name = mat.name || "";
      if (/original top/i.test(name)) {
        mat.map = null;
        mat.color.set(look.shirt);
      } else if (/original bottom/i.test(name)) {
        mat.map = null;
        mat.color.set(look.pants);
      } else if (/shoes01/i.test(name) && mat.map) {
        mat.map = flatMasked(mat.map, look.shoes) || mat.map;
        mat.color.set("#ffffff");
      } else if (/short01/i.test(name) && mat.map) {
        mat.map = flatMasked(mat.map, look.hair) || mat.map;
        mat.color.set("#ffffff");
      } else if (/anatomical body\.body$/i.test(name) && mat.map) {
        mat.map = recolorSkin(mat.map, look.skin) || mat.map;
        mat.color.set("#ffffff");
      }
      mat.needsUpdate = true;
    }
  });
}

function playClip(actor, mode) {
  if (actor.mode === mode) return;
  const next = mode === "walk" ? actor.walk : actor.idle;
  const prev = mode === "walk" ? actor.idle : actor.walk;
  if (!next) return;
  actor.mode = mode;
  prev?.fadeOut(0.15);
  next.reset().fadeIn(0.15).play();
}

function mesh(geometry, material, x, y, z, parent) {
  const obj = new THREE.Mesh(geometry, material);
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}

export function mountTown(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor("#b7c3d4");
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#c5ceda", 28, 96);
  scene.background = new THREE.Color("#b7c3d4");
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 220);
  camera.layers.enable(1);
  scene.add(new THREE.HemisphereLight("#d7e4f4", "#6d6754", 0.95));
  const sun = new THREE.DirectionalLight("#fff0d4", 1.22);
  sun.position.set(24, 40, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const geometries = [];
  const materials = [];
  const owned = [];
  const trackGeo = (geometry) => {
    geometries.push(geometry);
    return geometry;
  };
  const trackMat = (material) => {
    materials.push(material);
    return material;
  };
  const tex = createTownTextures();
  const groundMap = bakeTownGround();
  owned.push(groundMap);

  const sky = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(180, 48, 28)),
    trackMat(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 vDir; void main(){ float h = clamp(vDir.y*0.5+0.5,0.0,1.0); vec3 col = mix(vec3(0.86,0.78,0.66), vec3(0.55,0.68,0.82), smoothstep(0.0,0.72,h)); gl_FragColor = vec4(col,1.0); }",
    }))
  );
  scene.add(sky);

  const ground = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(TOWN_SPAN, TOWN_SPAN)),
    trackMat(new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, metalness: 0 }))
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  function mapped(entry, color, rx, ry, roughness = 0.9, metalness = 0.04) {
    const map = entry.map.clone();
    map.repeat.set(rx, ry);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.needsUpdate = true;
    owned.push(map);
    let normal = null;
    if (entry.normal) {
      normal = entry.normal.clone();
      normal.repeat.set(rx, ry);
      normal.wrapS = THREE.RepeatWrapping;
      normal.wrapT = THREE.RepeatWrapping;
      normal.needsUpdate = true;
      owned.push(normal);
    }
    return trackMat(new THREE.MeshStandardMaterial({ map, normalMap: normal, color, roughness, metalness }));
  }

  const glassMat = trackMat(new THREE.MeshStandardMaterial({
    color: "#b7d0d8",
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.55,
  }));
  const brassMat = mapped(tex.maps.brass, "#ffffff", 1, 1, 0.35, 0.72);
  const metalMat = mapped(tex.maps.metal, "#ffffff", 1, 1, 0.42, 0.55);
  const woodMat = mapped(tex.maps.planks, "#ffffff", 1, 1, 0.84, 0.02);
  const clothMat = trackMat(new THREE.MeshStandardMaterial({ color: "#8e2d3a", roughness: 0.95 }));
  const darkMat = trackMat(new THREE.MeshStandardMaterial({ color: "#2a241c", roughness: 0.8 }));
  const stonePlain = mapped(tex.maps.stone, "#ded8ce", 1, 1, 0.92, 0);
  const loftMat = mapped(tex.maps.stone, "#6a645c", 1.4, 1, 0.95, 0);
  loftMat.side = THREE.DoubleSide;

  const buildingMat = {
    station: mapped(tex.maps.stone, "#e6e0d6", 3, 2, 0.92, 0.02),
    tower: mapped(tex.maps.stone, "#efeae2", 2, 4, 0.9, 0.02),
    hotel: mapped(tex.maps.plaster, "#f3e6d0", 2, 2, 0.94, 0),
    library: mapped(tex.maps.stone, "#d9d3c8", 2.4, 2, 0.92, 0.02),
    workshop: mapped(tex.maps.brick, "#ffffff", 2.2, 1.6, 0.9, 0.02),
    mansion: mapped(tex.maps.brick, "#6e5c62", 2.6, 2.4, 0.88, 0.04),
    factory: mapped(tex.maps.brick, "#8d8a86", 3, 2, 0.92, 0.05),
  };
  const roofMat = mapped(tex.maps.tiles, "#ffffff", 2, 2, 0.86, 0.02);
  const floorMat = mapped(tex.maps.planks, "#a67c52", 3, 3, 0.86, 0);

  const pickables = [];
  const spinners = [];
  const puffs = [];
  const lamps = [];
  function tag(obj, id) {
    obj.traverse((child) => {
      child.userData.hotspot = id;
    });
    pickables.push(obj);
    return obj;
  }

  function box(w, h, d, material, x, y, z, parent = scene) {
    const obj = mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), material, x, y, z, parent);
    obj.castShadow = true;
    obj.receiveShadow = true;
    return obj;
  }

  function placeWindows(b, material) {
    const floors = [1.45, 1.45 + SCALE.storey];
    const walls = ["minX", "maxX", "minZ", "maxZ"];
    for (const wall of walls) {
      const vertical = wall === "minX" || wall === "maxX";
      const spanMin = vertical ? b.minZ : b.minX;
      const spanMax = vertical ? b.maxZ : b.maxX;
      const span = spanMax - spanMin;
      const count = Math.max(2, Math.round(span / 4.5));
      for (let i = 0; i < count; i += 1) {
        const along = spanMin + ((i + 0.5) * span) / count;
        if (b.door.wall === wall && Math.abs(along - b.door.center) < b.door.width * 0.5 + 0.7) continue;
        for (const y of floors) {
          if (y + 0.7 > b.h - 0.4) continue;
          let x = (b.minX + b.maxX) / 2;
          let z = (b.minZ + b.maxZ) / 2;
          if (wall === "minZ") z = b.minZ - 0.02;
          if (wall === "maxZ") z = b.maxZ + 0.02;
          if (wall === "minX") x = b.minX - 0.02;
          if (wall === "maxX") x = b.maxX + 0.02;
          if (vertical) z = along;
          else x = along;
          const pane = mesh(trackGeo(new THREE.PlaneGeometry(0.85, 1.15)), glassMat, x, y, z, scene);
          if (wall === "minX") pane.rotation.y = -Math.PI / 2;
          if (wall === "maxX") pane.rotation.y = Math.PI / 2;
          if (wall === "minZ") pane.rotation.y = Math.PI;
          pane.material = material ? pane.material : glassMat;
        }
      }
    }
  }

  function wallRun(b, wall, material) {
    const t = WALL_THICK;
    const h = b.h;
    const vertical = wall === "minX" || wall === "maxX";
    const spanMin = vertical ? b.minZ : b.minX;
    const spanMax = vertical ? b.maxZ : b.maxX;
    const doorHere = b.door.wall === wall;
    const gaps = [];
    if (doorHere) {
      const a = Math.max(spanMin, b.door.center - b.door.width / 2);
      const c = Math.min(spanMax, b.door.center + b.door.width / 2);
      if (a > spanMin + 0.05) gaps.push([spanMin, a]);
      if (spanMax > c + 0.05) gaps.push([c, spanMax]);
    } else {
      gaps.push([spanMin, spanMax]);
    }
    const place = (along, length, y, height) => {
      let x = (b.minX + b.maxX) / 2;
      let z = (b.minZ + b.maxZ) / 2;
      let w = length;
      let d = t;
      if (wall === "minZ") z = b.minZ + t / 2;
      if (wall === "maxZ") z = b.maxZ - t / 2;
      if (wall === "minX") x = b.minX + t / 2;
      if (wall === "maxX") x = b.maxX - t / 2;
      if (vertical) {
        z = along;
        w = t;
        d = length;
      } else {
        x = along;
      }
      box(w, height, d, material, x, y, z);
    };
    for (const [a, c] of gaps) place((a + c) / 2, c - a, h / 2, h);
    if (doorHere) {
      const lintelH = h - SCALE.doorHeight;
      place(b.door.center, b.door.width, SCALE.doorHeight + lintelH / 2, lintelH);
      const half = b.door.width / 2;
      const jamb = 0.18;
      const proud = 0.12;
      const y = SCALE.doorHeight / 2;
      if (vertical) {
        const x = wall === "maxX" ? b.maxX + proud : b.minX - proud;
        box(proud, SCALE.doorHeight, jamb, darkMat, x, y, b.door.center - half);
        box(proud, SCALE.doorHeight, jamb, darkMat, x, y, b.door.center + half);
        box(proud, 0.16, b.door.width + jamb, darkMat, x, SCALE.doorHeight + 0.04, b.door.center);
      } else {
        const z = wall === "maxZ" ? b.maxZ + proud : b.minZ - proud;
        box(jamb, SCALE.doorHeight, proud, darkMat, b.door.center - half, y, z);
        box(jamb, SCALE.doorHeight, proud, darkMat, b.door.center + half, y, z);
        box(b.door.width + jamb, 0.16, proud, darkMat, b.door.center, SCALE.doorHeight + 0.04, z);
      }
    }
  }

  const doorLeaves = {};
  function addDoorLeaf(id, wall, center, width, x, z, material) {
    const leaf = box(wall === "minX" || wall === "maxX" ? 0.12 : width, SCALE.doorHeight, wall === "minX" || wall === "maxX" ? width : 0.12, material, x, SCALE.doorHeight / 2, z);
    doorLeaves[id] = leaf;
    return leaf;
  }

  for (const b of BUILDINGS) {
    const mat = buildingMat[b.id];
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const floor = mesh(trackGeo(new THREE.PlaneGeometry(b.maxX - b.minX - 1, b.maxZ - b.minZ - 1)), floorMat, cx, 0.02, cz, scene);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    for (const wall of ["minX", "maxX", "minZ", "maxZ"]) wallRun(b, wall, mat);
    placeWindows(b, glassMat);
    const roof = box(b.maxX - b.minX + 0.8, 0.34, b.maxZ - b.minZ + 0.8, roofMat, cx, b.h + 0.16, cz);
    roof.castShadow = true;
    if (b.id !== "tower") {
      box(0.7, 1.5, 0.7, darkMat, b.minX + 1.4, b.h + 0.9, b.minZ + 1.4);
    }
    const sign = mesh(trackGeo(new THREE.PlaneGeometry(b.id === "hotel" ? 2.4 : 1.8, 0.48)), trackMat(new THREE.MeshBasicMaterial({ map: tex.sign(b.name) })), 0, SCALE.doorHeight + 0.55, 0, scene);
    const outward = 0.08;
    if (b.door.wall === "maxZ") {
      sign.position.set(b.door.center, SCALE.doorHeight + 0.55, b.maxZ + outward);
    } else if (b.door.wall === "minZ") {
      sign.position.set(b.door.center, SCALE.doorHeight + 0.55, b.minZ - outward);
      sign.rotation.y = Math.PI;
    } else if (b.door.wall === "maxX") {
      sign.position.set(b.maxX + outward, SCALE.doorHeight + 0.55, b.door.center);
      sign.rotation.y = Math.PI / 2;
    } else {
      sign.position.set(b.minX - outward, SCALE.doorHeight + 0.55, b.door.center);
      sign.rotation.y = -Math.PI / 2;
    }
  }

  const mansion = BUILDINGS.find((b) => b.id === "mansion");
  addDoorLeaf("mansion", "minZ", 0, mansion.door.width, 0, mansion.minZ + 0.2, darkMat);
  const factory = BUILDINGS.find((b) => b.id === "factory");
  addDoorLeaf("factory", "minX", 0, factory.door.width, factory.minX + 0.2, 0, metalMat);
  function partitionWall(part, height, material) {
    const left = part.doorCenter - part.doorWidth / 2 - part.minX;
    const rightStart = part.doorCenter + part.doorWidth / 2;
    const right = part.maxX - rightStart;
    if (left > 0.08) box(left, height, part.thickness, material, part.minX + left / 2, height / 2, part.z);
    if (right > 0.08) box(right, height, part.thickness, material, rightStart + right / 2, height / 2, part.z);
    const lintel = height - SCALE.doorHeight;
    if (lintel > 0.08) {
      box(part.doorWidth, lintel, part.thickness, material, part.doorCenter, SCALE.doorHeight + lintel / 2, part.z);
    }
  }
  const room = PARTITIONS.find((p) => p.id === "room");
  partitionWall(room, 8.2, buildingMat.hotel);
  doorLeaves.room = box(room.doorWidth * 0.96, SCALE.doorHeight * 0.98, 0.1, woodMat, room.doorCenter, SCALE.doorHeight / 2, room.z);
  const loft = PARTITIONS.find((p) => p.id === "loft");
  partitionWall(loft, 16, buildingMat.tower);
  doorLeaves.loft = box(loft.doorWidth * 0.96, SCALE.doorHeight * 0.98, 0.1, woodMat, 0, SCALE.doorHeight / 2, loft.z);

  function shell(w, h, x, y, z) {
    const panel = mesh(trackGeo(new THREE.PlaneGeometry(w, h)), loftMat, x, y, z, scene);
    panel.layers.set(1);
    return panel;
  }
  const loftX0 = -3.65;
  const loftX1 = 3.65;
  const loftZ0 = 1.7;
  const loftZ1 = 4.05;
  const loftY1 = 7.2;
  const midX = 0;
  const midY = loftY1 / 2;
  const spanX = loftX1 - loftX0;
  const spanZ = loftZ1 - loftZ0;
  const floorL = shell(spanX, spanZ, midX, 0.04, (loftZ0 + loftZ1) / 2);
  floorL.rotation.x = -Math.PI / 2;
  const ceilL = shell(spanX, spanZ, midX, loftY1, (loftZ0 + loftZ1) / 2);
  ceilL.rotation.x = Math.PI / 2;
  const northL = shell(spanX, loftY1, midX, midY, loftZ1);
  northL.rotation.y = Math.PI;
  const westL = shell(spanZ, loftY1, loftX0, midY, (loftZ0 + loftZ1) / 2);
  westL.rotation.y = Math.PI / 2;
  const eastL = shell(spanZ, loftY1, loftX1, midY, (loftZ0 + loftZ1) / 2);
  eastL.rotation.y = -Math.PI / 2;
  const doorHalf = loft.doorWidth / 2;
  const leftW = -doorHalf - loftX0;
  const rightW = loftX1 - doorHalf;
  const southLeft = shell(leftW, loftY1, loftX0 + leftW / 2, midY, loftZ0);
  southLeft.rotation.y = Math.PI;
  const southRight = shell(rightW, loftY1, doorHalf + rightW / 2, midY, loftZ0);
  southRight.rotation.y = Math.PI;
  const southLintel = shell(loft.doorWidth, loftY1 - SCALE.doorHeight, 0, SCALE.doorHeight + (loftY1 - SCALE.doorHeight) / 2, loftZ0);
  southLintel.rotation.y = Math.PI;

  const loftAmbient = new THREE.AmbientLight("#1a140e", 0.045);
  loftAmbient.layers.set(1);
  scene.add(loftAmbient);
  const loftLamp = new THREE.PointLight("#ffc98a", 0, 9, 2);
  loftLamp.position.set(0, 2.4, 3.2);
  loftLamp.layers.set(1);
  scene.add(loftLamp);
  const bulb = mesh(trackGeo(new THREE.SphereGeometry(0.08, 8, 8)), trackMat(new THREE.MeshStandardMaterial({ color: "#ffd7a1", emissive: "#ffb15a", emissiveIntensity: 0.05 })), 0, 2.35, 3.15, scene);
  bulb.layers.set(1);

  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 512;
  plaqueCanvas.height = 320;
  const pg = plaqueCanvas.getContext("2d");
  pg.fillStyle = "#c6a15a";
  pg.fillRect(0, 0, 512, 320);
  pg.fillStyle = "#2a2116";
  pg.font = "700 42px Georgia";
  pg.textAlign = "center";
  pg.fillText("CHARTER", 256, 70);
  pg.font = "600 64px Georgia";
  pg.fillText("4   ·   1   ·   7", 256, 170);
  pg.font = "400 26px Georgia";
  pg.fillText("The railway may not pretend otherwise.", 256, 250);
  const plaqueMap = new THREE.CanvasTexture(plaqueCanvas);
  plaqueMap.colorSpace = THREE.SRGBColorSpace;
  owned.push(plaqueMap);
  const plaqueMat = trackMat(new THREE.MeshStandardMaterial({ color: "#2a2418", roughness: 0.45, metalness: 0.4 }));
  const plaque = mesh(trackGeo(new THREE.PlaneGeometry(1.3, 0.82)), plaqueMat, -3.55, 1.6, 3.2, scene);
  plaque.rotation.y = Math.PI / 2;
  plaque.layers.set(1);
  tag(plaque, "plaque");

  const strike = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const wheel = mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12)), brassMat, -0.42 + i * 0.42, 1.45, 3.95, strike);
    wheel.rotation.x = Math.PI / 2;
    wheel.layers.set(1);
  }
  strike.layers.set(1);
  scene.add(strike);
  tag(strike, "strike");

  const clockCanvas = document.createElement("canvas");
  clockCanvas.width = 256;
  clockCanvas.height = 256;
  const cg = clockCanvas.getContext("2d");
  cg.fillStyle = "#f4efe4";
  cg.beginPath();
  cg.arc(128, 128, 120, 0, Math.PI * 2);
  cg.fill();
  cg.strokeStyle = "#2a241c";
  cg.lineWidth = 8;
  cg.stroke();
  cg.fillStyle = "#2a241c";
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    cg.beginPath();
    cg.arc(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, 4, 0, Math.PI * 2);
    cg.fill();
  }
  const clockMap = new THREE.CanvasTexture(clockCanvas);
  clockMap.colorSpace = THREE.SRGBColorSpace;
  owned.push(clockMap);
  const clockFace = mesh(trackGeo(new THREE.CircleGeometry(1.15, 24)), trackMat(new THREE.MeshBasicMaterial({ map: clockMap })), 0, 6.6, -4.34, scene);
  clockFace.rotation.y = Math.PI;
  tag(clockFace, "face");
  const hourHand = box(0.08, 0.55, 0.04, darkMat, 0, 6.6, -4.46);
  const minuteHand = box(0.06, 0.85, 0.04, darkMat, 0, 6.6, -4.5);
  hourHand.geometry.translate(0, 0.22, 0);
  minuteHand.geometry.translate(0, 0.36, 0);
  hourHand.rotation.z = Math.PI * 0.55;
  minuteHand.rotation.z = -Math.PI * 0.45;

  function gear(radius, mat) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(trackGeo(new THREE.TorusGeometry(radius, radius * 0.16, 6, 14)), mat));
    for (let i = 0; i < 8; i += 1) {
      const tooth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(radius * 0.22, radius * 0.34, radius * 0.18)), mat);
      const angle = (i / 8) * Math.PI * 2;
      tooth.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      tooth.rotation.z = angle;
      group.add(tooth);
    }
    return group;
  }
  const towerGear = gear(0.7, brassMat);
  towerGear.position.set(5.6, 6.9, 0);
  towerGear.userData.spin = 0.45;
  scene.add(towerGear);
  spinners.push(towerGear);
  box(1.15, 0.1, 0.12, metalMat, 4.75, 6.9, 0);
  const shopGear = gear(0.55, brassMat);
  shopGear.position.set(14.7, 3.4, 20);
  shopGear.rotation.y = Math.PI / 2;
  shopGear.userData.spin = -0.7;
  scene.add(shopGear);
  spinners.push(shopGear);
  box(1.1, 0.1, 0.12, metalMat, 15.55, 3.4, 20);

  for (const [x, z] of [[-11, -16.5], [11, -16.5], [-11, 10], [11, 10], [0, 22], [30, 0]]) {
    box(0.12, 3.2, 0.12, darkMat, x, 1.6, z);
    const lantern = box(0.28, 0.34, 0.28, trackMat(new THREE.MeshStandardMaterial({ color: "#ffd7a1", emissive: "#ffb15a", emissiveIntensity: 0.8 })), x, 3.25, z);
    const light = new THREE.PointLight("#ffc98a", 0.45, 8, 2);
    light.position.set(x, 3.25, z);
    scene.add(light);
    lamps.push(lantern);
  }

  const steamMat = trackMat(new THREE.MeshBasicMaterial({ color: "#e7eef2", transparent: true, opacity: 0.28, depthWrite: false }));
  for (const spot of [[-34.2, 9.4, -18.2], [2.2, 17.4, 2.2], [50, 10.6, 8], [14.3, 2.95, -33.2]]) {
    const puff = mesh(trackGeo(new THREE.SphereGeometry(0.35, 8, 8)), steamMat, spot[0], spot[1], spot[2], scene);
    puff.userData.base = spot[1];
    puff.userData.phase = spot[0];
    puffs.push(puff);
  }

  const foliage = trackMat(new THREE.MeshStandardMaterial({ color: "#2f6a3a", roughness: 1 }));
  for (const tree of SOLIDS.filter((item) => item.id.startsWith("tree"))) {
    mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.24, 1.7, 6)), woodMat, tree.x, 0.85, tree.z, scene);
    mesh(trackGeo(new THREE.IcosahedronGeometry(0.85, 1)), foliage, tree.x, 2.05, tree.z, scene);
  }
  const fountain = SOLIDS.find((item) => item.id === "fountain");
  box(2.1, 0.45, 2.1, stonePlain, fountain.x, 0.28, fountain.z);
  mesh(trackGeo(new THREE.CylinderGeometry(0.7, 0.8, 0.12, 12)), trackMat(new THREE.MeshStandardMaterial({ color: "#6ea8b8", roughness: 0.2, metalness: 0.1 })), fountain.x, 0.52, fountain.z, scene);
  tag(box(0.4, 0.9, 0.4, stonePlain, fountain.x, 0.9, fountain.z), "fountain");
  const statue = SOLIDS.find((s) => s.id === "statue");
  box(0.8, 1.15, 0.8, stonePlain, statue.x, 0.58, statue.z);
  tag(mesh(trackGeo(new THREE.SphereGeometry(0.28, 10, 8)), stonePlain, statue.x, 1.45, statue.z, scene), "statue");

  for (const stall of SOLIDS.filter((s) => s.id.startsWith("stall"))) {
    box(0.1, 2.1, 0.1, woodMat, stall.x - 0.8, 1.05, stall.z - 0.6);
    box(0.1, 2.1, 0.1, woodMat, stall.x + 0.8, 1.05, stall.z - 0.6);
    box(0.1, 2.1, 0.1, woodMat, stall.x - 0.8, 1.05, stall.z + 0.6);
    box(0.1, 2.1, 0.1, woodMat, stall.x + 0.8, 1.05, stall.z + 0.6);
    const awning = mesh(trackGeo(new THREE.PlaneGeometry(2.1, 1.6)), clothMat, stall.x, 2.15, stall.z, scene);
    awning.rotation.x = Math.PI / 2;
    box(1.8, 0.12, 0.8, woodMat, stall.x, SCALE.counter, stall.z + 0.15);
  }
  const parrotSpot = hotspotById("parrot");
  const parrot = new THREE.Group();
  box(0.08, SCALE.counter, 0.08, brassMat, parrotSpot.x, SCALE.counter / 2, parrotSpot.z);
  parrot.position.set(parrotSpot.x, SCALE.counter + 0.16, parrotSpot.z);
  parrot.add(new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.12, 8, 8)), brassMat));
  const beak = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(0.04, 0.12, 6)), darkMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.z = 0.12;
  parrot.add(beak);
  scene.add(parrot);
  tag(parrot, "parrot");
  tag(box(0.9, 0.7, 0.06, darkMat, -8.8, 1.45, -20.5), "board");
  const paper = mesh(trackGeo(new THREE.PlaneGeometry(0.28, 0.36)), trackMat(new THREE.MeshBasicMaterial({ color: "#f4ecd8" })), -8.55, 1.5, -20.42, scene);
  box(0.08, 1.7, 0.08, woodMat, -9.3, 0.85, -20.5);
  box(0.08, 1.7, 0.08, woodMat, -8.3, 0.85, -20.5);

  const benchSpot = hotspotById("bench");
  box(1.3, 0.08, 0.42, woodMat, benchSpot.x, SCALE.chair, benchSpot.z);
  box(0.08, SCALE.chair, 0.08, darkMat, benchSpot.x - 0.55, SCALE.chair / 2, benchSpot.z);
  box(0.08, SCALE.chair, 0.08, darkMat, benchSpot.x + 0.55, SCALE.chair / 2, benchSpot.z);
  tag(box(0.16, 3.1, 0.16, darkMat, -6.6, 1.55, 8.8), "townsign");
  const townPlate = mesh(trackGeo(new THREE.PlaneGeometry(1.1, 0.42)), trackMat(new THREE.MeshBasicMaterial({ map: tex.sign("BRINDLEWICK") })), -6.6, 2.3, 8.95, scene);
  tag(townPlate, "townsign");

  const bagSpot = hotspotById("bag");
  const bag = box(0.55, 0.32, 0.34, clothMat, bagSpot.x, 0.2, bagSpot.z);
  tag(bag, "bag");
  const cageSpot = hotspotById("cage");
  tag(box(1.1, 1.3, 0.8, metalMat, cageSpot.x, 0.65, cageSpot.z), "cage");
  const posterSpot = hotspotById("poster");
  tag(mesh(trackGeo(new THREE.PlaneGeometry(0.7, 0.9)), trackMat(new THREE.MeshBasicMaterial({ color: "#d7efe8" })), posterSpot.x, 1.55, -39.42, scene), "poster");

  const reg = hotspotById("register");
  tag(box(1.3, SCALE.table, 0.6, woodMat, reg.x, SCALE.table / 2, reg.z), "register");
  const drawer = hotspotById("drawer");
  tag(box(0.7, 0.7, 0.45, woodMat, drawer.x, 0.35, drawer.z), "drawer");
  const coatSpot = hotspotById("coat");
  box(0.08, 0.4, 0.08, woodMat, coatSpot.x, 1.7, -2.62);
  const coat = box(0.55, 0.9, 0.12, darkMat, coatSpot.x, 1.15, -2.7);
  tag(coat, "coat");

  const book = hotspotById("book");
  tag(box(0.28, 0.05, 0.2, darkMat, book.x, 0.035, book.z), "book");
  const atlas = hotspotById("atlas");
  tag(box(1.2, SCALE.table, 0.7, woodMat, atlas.x, SCALE.table / 2, atlas.z), "atlas");
  box(0.34, 0.06, 0.24, clothMat, atlas.x, SCALE.table + 0.04, atlas.z);
  const cabinet = hotspotById("cabinet");
  tag(box(1.2, 1.9, 0.4, brassMat, cabinet.x, 0.95, 23.25), "cabinet");

  const viseSpot = hotspotById("vise");
  const benchTop = box(2.4, 0.1, 0.8, woodMat, 29.6, SCALE.bench, 18);
  benchTop.receiveShadow = true;
  box(0.12, SCALE.bench, 0.12, woodMat, 28.6, SCALE.bench / 2, 17.7);
  box(0.12, SCALE.bench, 0.12, woodMat, 30.6, SCALE.bench / 2, 17.7);
  tag(box(0.28, 0.22, 0.22, metalMat, viseSpot.x, SCALE.bench + 0.16, viseSpot.z), "vise");
  const blankSpot = hotspotById("blank");
  const blank = mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12)), brassMat, blankSpot.x, SCALE.bench + 0.08, blankSpot.z, scene);
  tag(blank, "blank");
  const ledger = hotspotById("ledger");
  tag(box(0.34, 0.04, 0.24, darkMat, ledger.x, SCALE.bench + 0.08, ledger.z), "ledger");
  const toolbox = hotspotById("toolbox");
  tag(box(0.46, 0.28, 0.28, metalMat, toolbox.x, 0.14, toolbox.z), "toolbox");

  const hatchSpot = hotspotById("hatch");
  const hatch = box(0.9, 0.06, 0.9, metalMat, hatchSpot.x, 0.05, hatchSpot.z);
  tag(hatch, "hatch");
  const fittedGear = gear(0.22, brassMat);
  fittedGear.position.set(hatchSpot.x, 0.16, hatchSpot.z);
  fittedGear.rotation.x = Math.PI / 2;
  fittedGear.visible = false;
  scene.add(fittedGear);
  const hookSpot = hotspotById("hook");
  box(0.1, 2.1, 0.1, woodMat, hookSpot.x, 1.05, hookSpot.z);
  const hook = box(0.34, 0.08, 0.08, metalMat, hookSpot.x, 1.85, hookSpot.z);
  tag(hook, "hook");
  const hungBob = mesh(trackGeo(new THREE.SphereGeometry(0.14, 10, 8)), brassMat, hookSpot.x, 1.55, hookSpot.z, scene);
  hungBob.visible = false;

  const keySpot = hotspotById("keytable");
  box(1.1, SCALE.table, 0.6, woodMat, keySpot.x, SCALE.table / 2, keySpot.z);
  const keyMesh = box(0.46, 0.04, 0.08, brassMat, keySpot.x, SCALE.table + 0.04, keySpot.z);
  tag(keyMesh, "keytable");
  const hopper = hotspotById("hopper");
  const coalPile = mesh(trackGeo(new THREE.DodecahedronGeometry(0.26, 0)), darkMat, hopper.x, 0.26, hopper.z, scene);
  tag(coalPile, "hopper");
  box(1.2, 1.5, 0.8, metalMat, hopper.x, 0.75, hopper.z + 0.7);

  tag(box(0.16, 0.36, 0.36, metalMat, 37.88, 1.2, 0), "valve");
  const signal = hotspotById("signal");
  box(0.12, 3.1, 0.12, darkMat, signal.x, 1.55, signal.z);
  const signalArm = box(1.1, 0.08, 0.08, clothMat, signal.x + 0.4, 2.55, signal.z);
  tag(signalArm, "signal");

  const railMat = metalMat;
  for (let sx = 11; sx <= 27; sx += 1.1) box(0.22, 0.05, 2.3, woodMat, sx, 0.04, -33.2);
  box(17, 0.08, 0.1, railMat, 19, 0.1, -32.3);
  box(17, 0.08, 0.1, railMat, 19, 0.1, -34.1);
  const engine = new THREE.Group();
  const boiler = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.7, 0.7, 3.1, 14)), metalMat);
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(-0.15, 1.55, 0);
  boiler.castShadow = true;
  engine.add(boiler);
  const cabMat = trackMat(new THREE.MeshStandardMaterial({ color: "#6e2c28", roughness: 0.72 }));
  box(1.45, 2.05, 1.5, cabMat, 1.7, 1.85, 0, engine);
  const chimney = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 0.85, 8)), darkMat);
  chimney.position.set(-1.3, 2.5, 0);
  engine.add(chimney);
  mesh(trackGeo(new THREE.SphereGeometry(0.14, 8, 8)), brassMat, -1.65, 1.65, 0, engine);
  for (const wx of [-1.05, 0.05, 0.95]) {
    for (const wz of [-0.9, 0.9]) {
      const wheel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.55, 0.55, 0.14, 12)), darkMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.55, wz);
      wheel.castShadow = true;
      engine.add(wheel);
    }
  }
  engine.position.set(15.6, 0, -33.2);
  scene.add(engine);
  tag(engine, "engine");
  const tender = box(2.3, 1.65, 1.65, darkMat, 19.6, 1.0, -33.2);
  tag(tender, "tender");

  const clickGeo = trackGeo(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 8));
  const clickMat = trackMat(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  for (const spot of HOTSPOTS) {
    tag(mesh(clickGeo, clickMat, spot.x, 1.15, spot.z, scene), spot.id);
  }

  function addHat(group, look) {
    if (!look.hat) return;
    const hatMat = trackMat(new THREE.MeshStandardMaterial({ color: look.hatColor || "#222", roughness: 0.65 }));
    const hat = new THREE.Group();
    if (look.hat === "top") {
      const brim = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.025, 12)), hatMat);
      const crown = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.11, 0.24, 10)), hatMat);
      crown.position.y = 0.13;
      hat.add(brim, crown);
    } else if (look.hat === "bowler") {
      hat.add(new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)), hatMat));
    } else if (look.hat === "cap") {
      hat.add(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 10)), hatMat));
    } else if (look.hat === "bow") {
      hat.add(new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.07, 0.04)), hatMat));
    } else if (look.hat === "goggles") {
      const band = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.07, 0.015, 6, 10)), hatMat);
      band.position.set(-0.06, 0, 0.1);
      const bandB = band.clone();
      bandB.position.x = 0.06;
      hat.add(band, bandB);
      hat.position.set(0, 1.58, 0.04);
      group.add(hat);
      return;
    }
    hat.position.set(0, 1.74, 0.02);
    group.add(hat);
  }

  let actors = null;
  let heroInLoft = false;
  let alive = true;
  const start = getState().pose || { x: 0, z: -20.5, yaw: Math.PI, camYaw: 0, camPitch: 0.42, camDist: 4.8 };
  let px = start.x;
  let pz = start.z;
  let yaw = start.yaw || 0;
  let hop = 0;
  let vy = 0;
  let camYaw = start.camYaw ?? 0;
  let camPitch = start.camPitch ?? 0.42;
  let camDist = start.camDist ?? 4.8;

  const loader = new GLTFLoader();
  loader.load(WALKER_URL, (gltf) => {
    if (!alive) return;
    const source = gltf.scene;
    dressWalker(source);
    const bounds = new THREE.Box3().setFromObject(source);
    const center = bounds.getCenter(new THREE.Vector3());
    const rig = {
      footDrop: bounds.min.y,
      centerX: center.x,
      centerZ: center.z,
      walkClip: gltf.animations.find((item) => item.name === "Walk_Relaxed")
        || gltf.animations.find((item) => /walk/i.test(item.name))
        || gltf.animations[0],
      idleClip: gltf.animations.find((item) => item.name === "Idle_Standing"),
    };
    const makeActor = (look) => {
      const group = cloneSkeleton(source);
      dressWalker(group);
      paintWalker(group, look);
      addHat(group, look);
      group.scale.setScalar(look.scale || 1);
      group.rotation.order = "YXZ";
      scene.add(group);
      const mixer = new THREE.AnimationMixer(group);
      const walk = rig.walkClip ? mixer.clipAction(rig.walkClip) : null;
      const idle = rig.idleClip ? mixer.clipAction(rig.idleClip) : null;
      walk?.setLoop(THREE.LoopRepeat, Infinity);
      idle?.setLoop(THREE.LoopRepeat, Infinity);
      idle?.play();
      return { group, mixer, walk, idle, mode: idle ? "idle" : "", yaw: 0, scale: look.scale || 1 };
    };
    const hero = makeActor(WALKER_LOOKS.hero);
    const npcs = {};
    for (const id of Object.keys(NPC_SPOTS)) npcs[id] = makeActor(WALKER_LOOKS[id]);
    actors = { ...rig, hero, npcs };
    for (const [id, body] of Object.entries(npcs)) {
      const [x, z, face] = NPC_SPOTS[id];
      const s = body.scale;
      body.yaw = face;
      body.group.position.set(x - rig.centerX * s, terrainHeight() - rig.footDrop * s, z - rig.centerZ * s);
      body.group.rotation.y = face;
      body.group.traverse((obj) => {
        obj.userData.hotspot = id;
      });
      pickables.push(body.group);
    }
  });

  function placeHero() {
    if (!actors) return;
    const groundY = terrainHeight(px, pz) + hop;
    const s = actors.hero.scale;
    actors.hero.group.position.set(px - actors.centerX * s, groundY - actors.footDrop * s, pz - actors.centerZ * s);
    actors.hero.group.rotation.y = yaw;
  }

  function update(dt, input) {
    const state = getState();
    camYaw += input.lookX || 0;
    camPitch = Math.max(0.18, Math.min(1.15, camPitch + (input.lookY || 0)));
    camDist = Math.max(3.2, Math.min(9.5, camDist + (input.wheel || 0)));
    input.lookX = 0;
    input.lookY = 0;
    input.wheel = 0;
    let moving = false;
    const metersPerSecond = input.keys.has("shift") ? 6.6 : 3.55;
    if (!input.blocked) {
      const sx = Math.sin(camYaw);
      const sz = Math.cos(camYaw);
      let mx = 0;
      let mz = 0;
      if (input.keys.has("w")) {
        mx -= sx;
        mz -= sz;
      }
      if (input.keys.has("s")) {
        mx += sx;
        mz += sz;
      }
      if (input.keys.has("a")) {
        mx -= sz;
        mz += sx;
      }
      if (input.keys.has("d")) {
        mx += sz;
        mz -= sx;
      }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        let left = metersPerSecond * dt;
        while (left > 0) {
          const step = Math.min(0.16, left);
          const nx = px + mx * step;
          const nz = pz + mz * step;
          if (canMove(px, pz, nx, nz, state)) {
            px = nx;
            pz = nz;
          } else if (canMove(px, pz, nx, pz, state)) {
            px = nx;
          } else if (canMove(px, pz, px, nz, state)) {
            pz = nz;
          }
          left -= step;
        }
        const face = Math.atan2(mx, mz);
        yaw += Math.atan2(Math.sin(face - yaw), Math.cos(face - yaw)) * Math.min(1, dt * 10);
        moving = true;
      }
      if (input.jump && hop <= 0.02 && vy <= 0) {
        vy = 5.1;
        input.jump = false;
      }
      vy -= 14 * dt;
      hop += vy * dt;
      if (hop <= 0) {
        hop = 0;
        vy = 0;
      }
    }
    if (actors) {
      actors.hero.mixer.timeScale = moving ? Math.max(0.85, metersPerSecond / 1.45) : 1;
      playClip(actors.hero, moving ? "walk" : "idle");
      actors.hero.mixer.update(dt);
      for (const body of Object.values(actors.npcs)) {
        playClip(body, "idle");
        body.mixer.update(dt);
      }
    }
    placeHero();

    doorLeaves.mansion.visible = !state.flags.gateOpen;
    doorLeaves.factory.visible = !state.flags.valveOpen;
    doorLeaves.room.visible = !state.flags.roomOpen;
    doorLeaves.loft.visible = !state.flags.loftOpen;
    bag.visible = !state.flags.bagTaken;
    blank.visible = !state.flags.blankTaken;
    coat.visible = !state.flags.bobTaken;
    paper.visible = !state.flags.scrapTaken;
    keyMesh.visible = !state.flags.keyTaken;
    coalPile.visible = !state.flags.coalTaken;
    fittedGear.visible = !!state.flags.hatchOpen;
    hungBob.visible = !!state.flags.bobHung;
    hatch.rotation.z = state.flags.hatchOpen ? 0.7 : 0;
    signalArm.rotation.z = state.flags.signalDropped ? -0.9 : 0.15;
    const gas = !!state.flags.valveOpen;
    loftLamp.intensity = gas ? 14 : 0;
    bulb.material.emissiveIntensity = gas ? 1.4 : 0.04;
    if (gas && plaqueMat.map !== plaqueMap) {
      plaqueMat.map = plaqueMap;
      plaqueMat.color.set("#ffffff");
      plaqueMat.needsUpdate = true;
    }
    if (state.flags.strikeSet) minuteHand.rotation.z += dt * 0.4;
    const inLoft = px > -3.6 && px < 3.6 && pz > 1.75 && pz < 4.2;
    if (actors && inLoft !== heroInLoft) {
      heroInLoft = inLoft;
      actors.hero.group.traverse((obj) => obj.layers.set(inLoft ? 1 : 0));
    }
    for (const item of spinners) item.rotation.z += dt * (item.userData.spin || 0.4);
    const now = performance.now() / 1000;
    for (const puff of puffs) {
      const wave = (now + puff.userData.phase) % 2.4;
      puff.position.y = puff.userData.base + wave * 0.8;
      puff.scale.setScalar(0.6 + wave * 0.45);
    }
    if (lamps[0]) lamps[0].material.emissiveIntensity = 0.65 + Math.sin(now * 9) * 0.12;

    const cp = Math.cos(camPitch);
    let desired = camDist;
    const shellAt = (x, z) => {
      for (const b of BUILDINGS) {
        if (x > b.minX + 0.15 && x < b.maxX - 0.15 && z > b.minZ + 0.15 && z < b.maxZ - 0.15) return b.id;
      }
      return "";
    };
    const playerShell = shellAt(px, pz);
    for (let t = camDist; t >= 2.2; t -= 0.35) {
      const cx = px + Math.sin(camYaw) * cp * t;
      const cz = pz + Math.cos(camYaw) * cp * t;
      if (!clearLine(px, pz, cx, cz, state)) continue;
      if (shellAt(cx, cz) !== playerShell) continue;
      desired = t;
      break;
    }
    camera.position.set(
      px + Math.sin(camYaw) * cp * desired,
      terrainHeight() + hop + 1.55 + Math.sin(camPitch) * desired,
      pz + Math.cos(camYaw) * cp * desired
    );
    camera.lookAt(px, terrainHeight() + hop + 1.25, pz);
    sun.position.set(px + 22, 40, pz + 12);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    return { moving };
  }

  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(1);
  const pointer = new THREE.Vector2();

  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    const state = getState();
    for (const hit of hits) {
      let node = hit.object;
      let id = null;
      while (node) {
        if (node.userData?.hotspot) {
          id = node.userData.hotspot;
          break;
        }
        node = node.parent;
      }
      if (!id) continue;
      const spot = hotspotById(id);
      if (!spot) continue;
      if (Math.hypot(px - spot.x, pz - spot.z) > Math.max(2.6, spot.r)) continue;
      if (!clearLine(px, pz, spot.x, spot.z, state)) continue;
      return id;
    }
    return null;
  }

  function nearest() {
    const state = getState();
    let best = null;
    let bestD = Infinity;
    for (const spot of HOTSPOTS) {
      const d = Math.hypot(px - spot.x, pz - spot.z);
      const reach = Math.max(2.05, spot.r);
      if (d < reach && d < bestD && clearLine(px, pz, spot.x, spot.z, state)) {
        best = spot.id;
        bestD = d;
      }
    }
    return best;
  }

  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function destroy() {
    alive = false;
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    owned.forEach((texture) => texture.dispose());
    tex.dispose();
    if (actors) {
      actors.hero.mixer.stopAllAction();
      Object.values(actors.npcs).forEach((body) => body.mixer.stopAllAction());
    }
    renderer.dispose();
  }

  resize();
  return {
    update,
    nearest,
    pick,
    resize,
    destroy,
    getPose: () => ({ x: px, z: pz, yaw, camYaw, camPitch, camDist }),
  };
}
