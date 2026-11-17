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
import { JUNGLE_SPAN, bakeJungleGround, createJungleTextures, distToTrails } from "./textures.js";

const WALKER_URL = "/models/walker.glb";
const RIVER = { cx: -30, cz: -63.5, half: 55, width: 7 };
const GORGE = { cx: -48, cz: -58, half: 30, width: 5 };
const DIAG = Math.SQRT1_2;

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
  mara: { scale: 1.0, shirt: "#b8a070", pants: "#4a3f32", shoes: "#3a2c20", hair: "#2a1810", skin: "#9c6642", hat: "cap", hatColor: "#7a6a42" },
  rex: { scale: 0.98, shirt: "#3d6a7c", pants: "#2a2c34", shoes: "#1c1c1c", hair: "#1a1a1a", skin: "#e8b896", hat: "goggles", hatColor: "#c6a15a" },
  sven: { scale: 1.12, shirt: "#486a8e", pants: "#364456", shoes: "#2a2218", hair: "#d6a04a", skin: "#e0a882", hat: "cap", hatColor: "#c45a2a" },
  cook: { scale: 0.9, shirt: "#c9663a", pants: "#3a2f26", shoes: "#4a3424", hair: "#2a1a14", skin: "#c68a62", hat: "bow", hatColor: "#e8d070" },
  eli: { scale: 1.04, shirt: "#6c7a50", pants: "#5a4a36", shoes: "#2a2218", hair: "#8a8076", skin: "#b07850", hat: "bowler", hatColor: "#5a4630" },
  sergeant: { scale: 1.1, shirt: "#4c5c3a", pants: "#2e3626", shoes: "#14120e", hair: "#1c1c1c", skin: "#d7a884", hat: "cap", hatColor: "#2e3a24" },
  priest: { scale: 0.95, shirt: "#7a2f6a", pants: "#2a1e30", shoes: "#3a2428", hair: "#161010", skin: "#8a5a3c", hat: "bow", hatColor: "#d6a04a" },
  astronomer: { scale: 1.06, shirt: "#e6dfcf", pants: "#3a3a46", shoes: "#2a2a2a", hair: "#c9c9c4", skin: "#e49a78", hat: "top", hatColor: "#1c2430" },
  porter: { scale: 1.08, shirt: "#8a8c62", pants: "#4c3c2c", shoes: "#2c2218", hair: "#222222", skin: "#d2a07a", hat: "bowler", hatColor: "#3c3428" },
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

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function approach(cur, target, dt, rate = 6) {
  return cur + (target - cur) * Math.min(1, dt * rate);
}

/** Outward yaw for a plane/group whose local +z faces out of the given wall. */
function faceYaw(wall) {
  if (wall === "maxZ") return 0;
  if (wall === "minZ") return Math.PI;
  if (wall === "maxX") return Math.PI / 2;
  return -Math.PI / 2;
}

/** World point on the outer face of a wall at position `along`. */
function outerPoint(b, wall, along) {
  if (wall === "maxZ") return [along, b.maxZ];
  if (wall === "minZ") return [along, b.minZ];
  if (wall === "maxX") return [b.maxX, along];
  return [b.minX, along];
}

export function mountJungle(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor("#86a88c");
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#7fa585", 20, 88);
  scene.background = new THREE.Color("#86a88c");
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);
  scene.add(new THREE.HemisphereLight("#d2ecc8", "#34452c", 0.95));
  scene.add(new THREE.AmbientLight("#7a8a70", 0.62));
  const sun = new THREE.DirectionalLight("#fff0c8", 1.25);
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
  const tex = createJungleTextures();
  const groundMap = bakeJungleGround();
  owned.push(groundMap);

  const sky = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(200, 32, 20)),
    trackMat(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 vDir; void main(){ float h = clamp(vDir.y*0.5+0.5,0.0,1.0); vec3 col = mix(vec3(0.62,0.76,0.62), vec3(0.46,0.66,0.8), smoothstep(0.45,0.8,h)); gl_FragColor = vec4(col,1.0); }",
    }))
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const groundMat = trackMat(new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1, metalness: 0 }));
  groundMat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: tex.detail };
    shader.fragmentShader = `uniform sampler2D detailMap;\n${shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\n diffuseColor.rgb *= texture2D(detailMap, vMapUv * 90.0).rgb * 1.9;"
    )}`;
  };
  const ground = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(JUNGLE_SPAN, JUNGLE_SPAN)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = "jungleGround";
  scene.add(ground);
  const skirt = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(900, 900)), trackMat(new THREE.MeshStandardMaterial({ color: "#2b4a2c", roughness: 1 })));
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -0.05;
  scene.add(skirt);

  // ---------------------------------------------------------------- materials
  function surface(entry, opts = {}) {
    const { color = "#ffffff", rough = 0.9, metal = 0.02, tile = 2, repeat = null, side = null, normalScale = 0.8 } = opts;
    let map = entry.map;
    let normal = entry.normal;
    if (repeat) {
      map = map.clone();
      map.repeat.set(repeat[0], repeat[1]);
      map.needsUpdate = true;
      owned.push(map);
      if (normal) {
        normal = normal.clone();
        normal.repeat.set(repeat[0], repeat[1]);
        normal.needsUpdate = true;
        owned.push(normal);
      }
    }
    const params = { map, color, roughness: rough, metalness: metal };
    if (normal) {
      params.normalMap = normal;
      params.normalScale = new THREE.Vector2(normalScale, normalScale);
    }
    if (side) params.side = side;
    const material = trackMat(new THREE.MeshStandardMaterial(params));
    material.userData.tile = tile;
    return material;
  }
  const plain = (color, rough = 0.85, metal = 0) => trackMat(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  const glowMat = (color, emissive, intensity) => trackMat(new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.5 }));
  const both = THREE.DoubleSide;

  const M = {
    stone: surface(tex.maps.stone, { color: "#e2dccb", tile: 2.4, rough: 0.93 }),
    stoneDark: surface(tex.maps.stone, { color: "#8e8878", tile: 2.4, rough: 0.95 }),
    stoneFloor: surface(tex.maps.cobble, { color: "#b4ac9c", tile: 2.2, rough: 0.95 }),
    timber: surface(tex.maps.timber, { tile: 2.2, rough: 0.9 }),
    timberDark: surface(tex.maps.timber, { color: "#6b5846", tile: 2.2, rough: 0.9 }),
    floorWood: surface(tex.maps.timber, { color: "#cdb388", tile: 1.8, rough: 0.88 }),
    canvas: surface(tex.maps.canvas, { color: "#e6dcb8", tile: 1.6, rough: 1, side: both }),
    canvasOlive: surface(tex.maps.canvas, { color: "#8d9a62", tile: 1.6, rough: 1, side: both }),
    canvasRed: surface(tex.maps.canvas, { color: "#b05a3a", tile: 1.6, rough: 1, side: both }),
    roofCanvas: surface(tex.maps.canvas, { color: "#cbc197", repeat: [6, 3], rough: 1, side: both }),
    roofTin: surface(tex.maps.metal, { color: "#b9c0bf", repeat: [5, 3], rough: 0.55, metal: 0.5, side: both }),
    rock: surface(tex.maps.rock, { color: "#c4bcab", tile: 3.2, rough: 1 }),
    rockDark: surface(tex.maps.rock, { color: "#8a8478", tile: 3.2, rough: 1 }),
    metal: surface(tex.maps.metal, { tile: 1.6, rough: 0.5, metal: 0.6 }),
    metalDark: surface(tex.maps.metal, { color: "#6c7276", tile: 1.6, rough: 0.55, metal: 0.55 }),
    brass: surface(tex.maps.brass, { tile: 1, rough: 0.35, metal: 0.8 }),
    dirt: surface(tex.maps.dirt, { color: "#c9b090", tile: 3, rough: 1 }),
    leaves: surface(tex.maps.leaves, { repeat: [3, 2], rough: 1 }),
    dark: plain("#2a241c", 0.8),
    cloth: plain("#8e2d3a", 0.95),
    glass: trackMat(new THREE.MeshStandardMaterial({ color: "#a6c8cc", roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.45 })),
    window: plain("#1d2a2c", 0.3, 0.2),
    paint: plain("#5d6b3a", 0.7, 0.1),
    rubber: plain("#1c1c1c", 0.95),
    wax: plain("#a2271f", 0.4),
    bone: plain("#e6dcc2", 0.6),
    yellow: plain("#e0b020", 0.5, 0.2),
    red: plain("#c43a2a", 0.6),
    fireOrange: trackMat(new THREE.MeshBasicMaterial({ color: "#ffa534" })),
    fireYellow: trackMat(new THREE.MeshBasicMaterial({ color: "#ffe27a" })),
    axle: plain("#6c7276", 0.45, 0.7),
    bulb: glowMat("#ffe2a8", "#ffb347", 0.5),
    crystal: trackMat(new THREE.MeshStandardMaterial({ color: "#bfeaf0", emissive: "#44c8e0", emissiveIntensity: 0.1, roughness: 0.1, transparent: true, opacity: 0.85 })),
    ledOn: glowMat("#6dff8a", "#2fe05a", 1.4),
    ledOff: glowMat("#ff6a5a", "#d02a1a", 0.9),
    socketDark: plain("#14100c", 0.9),
    mist: trackMat(new THREE.MeshBasicMaterial({ color: "#dcecdc", transparent: true, opacity: 0.1, depthWrite: false })),
    smoke: trackMat(new THREE.MeshBasicMaterial({ color: "#b8bcb4", transparent: true, opacity: 0.3, depthWrite: false })),
    flareGlow: trackMat(new THREE.MeshBasicMaterial({ color: "#ff4030", transparent: true, opacity: 0.85, depthWrite: false, fog: false })),
  };
  const waterNormal = tex.maps.water.normal;
  const riverMat = trackMat(new THREE.MeshStandardMaterial({
    map: tex.maps.water.map,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    color: "#b4dcd4",
    roughness: 0.14,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
  }));
  const gorgeMat = trackMat(new THREE.MeshStandardMaterial({
    map: tex.maps.water.map,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    color: "#4a7c78",
    roughness: 0.2,
    metalness: 0.1,
  }));
  const aqueductWater = trackMat(new THREE.MeshStandardMaterial({
    map: tex.maps.water.map,
    color: "#bfe4e0",
    roughness: 0.12,
    transparent: true,
    opacity: 0.85,
  }));

  // ---------------------------------------------------------------- helpers
  const pickables = [];
  const spinners = [];
  const puffs = [];
  const binds = [];
  const bind = (fn) => binds.push(fn);
  const lerpers = {};

  function tag(obj, id) {
    obj.traverse((child) => {
      child.userData.hotspot = id;
    });
    pickables.push(obj);
    return obj;
  }

  function boxGeo(w, h, d, tile) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f += 1) {
      for (let i = 0; i < 4; i += 1) {
        const k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
      }
    }
    return geo;
  }

  function planeGeo(w, h, tile) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
    return geo;
  }

  function box(w, h, d, material, x, y, z, parent = scene) {
    const obj = mesh(trackGeo(boxGeo(w, h, d, material.userData.tile || 2)), material, x, y, z, parent);
    obj.castShadow = true;
    obj.receiveShadow = true;
    return obj;
  }

  function cyl(rt, rb, h, seg, material, x, y, z, parent = scene) {
    const obj = mesh(trackGeo(new THREE.CylinderGeometry(rt, rb, h, seg)), material, x, y, z, parent);
    obj.castShadow = true;
    obj.receiveShadow = true;
    return obj;
  }

  function ball(r, material, x, y, z, parent = scene, ws = 10, hs = 8) {
    const obj = mesh(trackGeo(new THREE.SphereGeometry(r, ws, hs)), material, x, y, z, parent);
    obj.castShadow = true;
    return obj;
  }

  function flat(w, h, material, x, y, z, parent = scene) {
    return mesh(trackGeo(new THREE.PlaneGeometry(w, h)), material, x, y, z, parent);
  }

  function grp(x, y, z, yaw = 0, parent = scene) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    parent.add(group);
    return group;
  }

  function signMat(title) {
    return trackMat(new THREE.MeshBasicMaterial({ map: tex.sign(title) }));
  }

  function gear(radius, material, teeth = 10) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(radius * 0.86, radius * 0.1, 6, 18)), material);
    ring.castShadow = true;
    group.add(ring);
    const hub = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, radius * 0.22, 10)), material);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);
    for (let i = 0; i < 4; i += 1) {
      const spoke = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(radius * 1.7, radius * 0.1, radius * 0.1)), material);
      spoke.rotation.z = (i / 4) * Math.PI;
      group.add(spoke);
    }
    for (let i = 0; i < teeth; i += 1) {
      const tooth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(radius * 0.26, radius * 0.3, radius * 0.18)), material);
      const angle = (i / teeth) * Math.PI * 2;
      tooth.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      tooth.rotation.z = angle - Math.PI / 2;
      tooth.castShadow = true;
      group.add(tooth);
    }
    return group;
  }

  const lights = {
    warehouse: new THREE.PointLight("#ffd29a", 0, 22, 2),
    tunnel: new THREE.PointLight("#ffd29a", 0, 16, 2),
    fire: new THREE.PointLight("#ff9a3a", 14, 18, 2),
    beacon: new THREE.PointLight("#e8f4ff", 0, 40, 2),
  };
  lights.warehouse.position.set(-100, 4, -2);
  lights.tunnel.position.set(-98, 2.5, 18);
  lights.fire.position.set(-14, 1.1, -100);
  lights.beacon.position.set(114, 3.2, 76);
  Object.values(lights).forEach((light) => scene.add(light));

  // ---------------------------------------------------------------- water, gorge, ford
  function ribbon(c, material, y, extra = 0) {
    const w = c.width + extra;
    const plane = mesh(trackGeo(planeGeo(c.half * 2, w, 6)), material, c.cx, y, c.cz, scene);
    plane.rotation.order = "YXZ";
    plane.rotation.y = -Math.PI / 4;
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    return plane;
  }
  ribbon(RIVER, M.dirt, 0.015, 2.4);
  ribbon(RIVER, riverMat, 0.045);
  ribbon(GORGE, M.rockDark, 0.012, 2.6);
  ribbon(GORGE, gorgeMat, 0.03);

  // River mist plus steam from the water near the ferry.
  for (let i = 0; i < 14; i += 1) {
    const puff = mesh(trackGeo(new THREE.SphereGeometry(1, 14, 10)), M.mist, 0, 0, 0, scene);
    puff.userData = { ox: -34 + (i % 7) * 1.7 - 5, oz: -70 + Math.floor(i / 7) * 3 - 3 + (i % 3), base: 0.35 + (i % 4) * 0.25, phase: i * 1.3, size: 1.2 + (i % 4) * 0.4, kind: "mist" };
    puff.scale.set(puff.userData.size, 0.3, puff.userData.size);
    puffs.push(puff);
  }

  // ---------------------------------------------------------------- shared decor geometry
  const dummy = new THREE.Object3D();
  const rng = mulberry(1357);

  // ---------------------------------------------------------------- buildings
  const leaves = [];
  function wallRun(b, wall, material, trim) {
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
      const jamb = 0.2;
      const proud = 0.14;
      const y = SCALE.doorHeight / 2;
      if (vertical) {
        const x = wall === "maxX" ? b.maxX + proud / 2 : b.minX - proud / 2;
        box(proud, SCALE.doorHeight, jamb, trim, x, y, b.door.center - half);
        box(proud, SCALE.doorHeight, jamb, trim, x, y, b.door.center + half);
        box(proud, 0.18, b.door.width + jamb, trim, x, SCALE.doorHeight + 0.05, b.door.center);
      } else {
        const z = wall === "maxZ" ? b.maxZ + proud / 2 : b.minZ - proud / 2;
        box(jamb, SCALE.doorHeight, proud, trim, b.door.center - half, y, z);
        box(jamb, SCALE.doorHeight, proud, trim, b.door.center + half, y, z);
        box(b.door.width + jamb, 0.18, proud, trim, b.door.center, SCALE.doorHeight + 0.05, z);
      }
    }
  }

  function placeWindows(b, slit) {
    const rows = [];
    for (let y = slit ? 3.2 : 1.9; y + 0.8 < b.h - 0.8; y += SCALE.storey + (slit ? 1 : 0)) rows.push(y);
    for (const wall of ["minX", "maxX", "minZ", "maxZ"]) {
      const vertical = wall === "minX" || wall === "maxX";
      const spanMin = vertical ? b.minZ : b.minX;
      const spanMax = vertical ? b.maxZ : b.maxX;
      const span = spanMax - spanMin;
      const count = Math.max(2, Math.round(span / 5));
      for (let i = 0; i < count; i += 1) {
        const along = spanMin + ((i + 0.5) * span) / count;
        if (b.door.wall === wall && Math.abs(along - b.door.center) < b.door.width * 0.5 + 0.9) continue;
        for (const y of rows) {
          const [x, z] = outerPoint(b, wall, along);
          const win = grp(x, y, z, faceYaw(wall));
          const fw = slit ? 0.3 : 0.95;
          const fh = slit ? 1.5 : 1.25;
          box(fw + 0.16, fh + 0.16, 0.08, M.timberDark, 0, 0, 0.04, win);
          flat(fw, fh, M.window, 0, 0, 0.09, win);
          if (!slit) {
            box(0.05, fh, 0.04, M.timberDark, 0, 0, 0.11, win);
            box(fw, 0.05, 0.04, M.timberDark, 0, 0, 0.11, win);
          }
        }
      }
    }
  }

  function addSign(b) {
    const [x, z] = outerPoint(b, b.door.wall, b.door.center);
    const y = SCALE.doorHeight + 0.72;
    const sign = grp(x, y, z, faceYaw(b.door.wall));
    box(2.34, 0.76, 0.06, M.timberDark, 0, 0, 0.03, sign);
    flat(2.2, 0.69, signMat(b.name), 0, 0, 0.07, sign);
  }

  function addAwning(b, material) {
    const [x, z] = outerPoint(b, b.door.wall, b.door.center);
    const awning = grp(x, 0, z, faceYaw(b.door.wall));
    const w = b.door.width + 0.9;
    const slab = box(w, 0.05, 1.6, material, 0, 2.5, 0.8, awning);
    slab.rotation.x = 0.22;
    for (const side of [-1, 1]) cyl(0.04, 0.04, 2.2, 6, M.timberDark, side * (w / 2 - 0.1), 1.1, 1.5, awning);
  }

  function makeLeaf(width, mat, vertical, bandMat) {
    const group = new THREE.Group();
    const thick = 0.14;
    const panel = box(vertical ? thick : width * 0.98, SCALE.doorHeight * 0.99, vertical ? width * 0.98 : thick, mat, 0, SCALE.doorHeight / 2, 0, group);
    panel.castShadow = true;
    for (const y of [0.5, SCALE.doorHeight - 0.5]) {
      box(vertical ? thick + 0.04 : width * 0.98, 0.12, vertical ? width * 0.98 : thick + 0.04, bandMat, 0, y, 0, group);
    }
    const handle = ball(0.09, M.brass, 0, 1.1, 0, group);
    handle.position[vertical ? "z" : "x"] = width * 0.34;
    handle.position[vertical ? "x" : "z"] = thick;
    return group;
  }

  function addLeaf(b, mat, bandMat) {
    const wall = b.door.wall;
    const vertical = wall === "minX" || wall === "maxX";
    const t = WALL_THICK;
    let x = b.door.center;
    let z = b.door.center;
    if (wall === "minZ") {
      x = b.door.center;
      z = b.minZ + t / 2;
    } else if (wall === "maxZ") {
      x = b.door.center;
      z = b.maxZ - t / 2;
    } else if (wall === "minX") {
      x = b.minX + t / 2;
      z = b.door.center;
    } else {
      x = b.maxX - t / 2;
      z = b.door.center;
    }
    const leaf = makeLeaf(b.door.width, mat, vertical, bandMat);
    leaf.position.set(x, 0, z);
    scene.add(leaf);
    leaves.push({ obj: leaf, building: b });
  }

  function hipRoof(b, material, rise, over) {
    const geo = trackGeo(new THREE.ConeGeometry(Math.SQRT1_2, rise, 4, 1));
    geo.rotateY(Math.PI / 4);
    geo.translate(0, rise / 2, 0);
    const roof = mesh(geo, material, (b.minX + b.maxX) / 2, b.h, (b.minZ + b.maxZ) / 2, scene);
    roof.scale.set(b.maxX - b.minX + over * 2, 1, b.maxZ - b.minZ + over * 2);
    roof.castShadow = true;
    roof.receiveShadow = true;
    return roof;
  }

  function cornerPosts(b, material) {
    for (const x of [b.minX + 0.05, b.maxX - 0.05]) {
      for (const z of [b.minZ + 0.05, b.maxZ - 0.05]) box(0.55, b.h + 0.2, 0.55, material, x, b.h / 2 + 0.1, z);
    }
  }

  function buildShell(b, cfg) {
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const floor = mesh(trackGeo(planeGeo(b.maxX - b.minX - 1, b.maxZ - b.minZ - 1, 2.2)), cfg.floor, cx, 0.03, cz, scene);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    for (const wall of ["minX", "maxX", "minZ", "maxZ"]) wallRun(b, wall, cfg.wall, cfg.trim);
    if (cfg.posts) cornerPosts(b, cfg.trim);
    if (cfg.windows) placeWindows(b, cfg.windows === "slit");
    addSign(b);
    if (cfg.awning) addAwning(b, cfg.awning);
    if (cfg.leaf) addLeaf(b, cfg.leaf, cfg.band || M.metalDark);
  }

  const byId = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

  // Camp: timber with canvas roofs and awnings.
  for (const id of ["radioHut", "workshop"]) {
    const b = byId[id];
    buildShell(b, { wall: M.timber, trim: M.timberDark, floor: M.floorWood, posts: true, windows: true, awning: M.canvas });
    hipRoof(b, M.roofCanvas, 2.4, 0.9);
    box(b.maxX - b.minX + 0.6, 0.16, 0.2, M.timberDark, (b.minX + b.maxX) / 2, b.h + 0.1, b.minZ - 0.2);
  }
  // Outpost: timber walls, tin roofs, locked leaves tied to the outpostDoor flag.
  for (const id of ["warehouse", "watchtower", "office"]) {
    const b = byId[id];
    buildShell(b, { wall: M.timber, trim: M.timberDark, floor: M.floorWood, posts: true, windows: true, awning: id === "watchtower" ? null : M.canvasOlive, leaf: M.timberDark, band: M.metalDark });
    hipRoof(b, M.roofTin, id === "watchtower" ? 3.6 : 2.2, 0.8);
  }
  // Temple hall: stone with a stepped roof and a heavy stone leaf.
  {
    const b = byId.templeHall;
    buildShell(b, { wall: M.stone, trim: M.stoneDark, floor: M.stoneFloor, windows: "slit", leaf: M.stoneDark, band: M.brass });
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    box(b.maxX - b.minX + 1.2, 0.5, b.maxZ - b.minZ + 1.2, M.stone, cx, b.h + 0.25, cz);
    box(b.maxX - b.minX - 3, 1.2, b.maxZ - b.minZ - 3, M.stoneDark, cx, b.h + 1.1, cz);
    box(b.maxX - b.minX - 8, 1.2, b.maxZ - b.minZ - 8, M.stone, cx, b.h + 2.3, cz);
    box(b.maxX - b.minX - 14, 1, b.maxZ - b.minZ - 14, M.stoneDark, cx, b.h + 3.4, cz);
    for (let i = 0; i < 4; i += 1) box(0.8, 0.5, 0.8, M.stoneDark, b.minX + 0.4 + (i % 2) * (b.maxX - b.minX - 0.8), b.h + 0.75, b.minZ + 0.4 + Math.floor(i / 2) * (b.maxZ - b.minZ - 0.8));
  }
  // Observatory: stone drum, domed roof that splits when the dome opens.
  const dome = { left: null, right: null };
  {
    const b = byId.observatory;
    buildShell(b, { wall: M.stone, trim: M.stoneDark, floor: M.stoneFloor, windows: "slit", leaf: M.metalDark, band: M.brass });
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const half = (b.maxX - b.minX) / 2 + 0.4;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, 8.6, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const cap = mesh(trackGeo(new THREE.ShapeGeometry(shape)), M.stoneDark, cx, b.h + 0.2, cz, scene);
    cap.rotation.x = -Math.PI / 2;
    const capUnder = mesh(cap.geometry, M.stoneDark, cx, b.h + 0.18, cz, scene);
    capUnder.rotation.x = Math.PI / 2;
    const ringMat = surface(tex.maps.metal, { color: "#6c7276", tile: 1.6, rough: 0.55, metal: 0.55, side: both });
    mesh(trackGeo(new THREE.CylinderGeometry(8.9, 8.9, 0.7, 28, 1, true)), ringMat, cx, b.h + 0.5, cz, scene);
    const domeMat = surface(tex.maps.brass, { color: "#8fb0a0", repeat: [6, 3], rough: 0.4, metal: 0.7, side: both });
    for (const [key, start] of [["left", 0], ["right", Math.PI]]) {
      const shell = mesh(trackGeo(new THREE.SphereGeometry(8.8, 24, 12, start, Math.PI, 0, Math.PI / 2)), domeMat, cx, b.h + 0.8, cz, scene);
      shell.castShadow = true;
      dome[key] = shell;
      shell.userData.baseZ = cz;
    }
    // Big animated wall gears inside the dome room.
    const gearSpecs = [
      { x: 101, y: 4.6, z: b.maxZ - 0.9, r: 1.0, spin: 0.5, yaw: 0 },
      { x: 103.1, y: 4.6, z: b.maxZ - 0.9, r: 0.8, spin: -0.625, yaw: 0 },
      { x: 104.8, y: 6.1, z: b.maxZ - 0.9, r: 0.65, spin: 0.77, yaw: 0 },
      { x: b.minX + 0.9, y: 5.6, z: 82, r: 2.0, spin: 0.22, yaw: Math.PI / 2 },
      { x: b.minX + 0.9, y: 5.6, z: 85.2, r: 1.2, spin: -0.37, yaw: Math.PI / 2 },
    ];
    for (const spec of gearSpecs) {
      const pivot = grp(spec.x, spec.y, spec.z, spec.yaw);
      const g = gear(spec.r, M.brass, Math.round(spec.r * 9) + 6);
      g.userData.spin = spec.spin;
      pivot.add(g);
      spinners.push(g);
    }
  }
  // Cave station: rock walls and slab roof.
  {
    const b = byId.caveStation;
    buildShell(b, { wall: M.rock, trim: M.rockDark, floor: M.stoneFloor, leaf: M.metalDark, band: M.brass });
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    box(b.maxX - b.minX + 0.8, 0.5, b.maxZ - b.minZ + 0.8, M.rock, cx, b.h + 0.25, cz);
    const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 9; i += 1) {
      const rock = mesh(rockGeo, M.rock, b.minX + 3 + rng() * (b.maxX - b.minX - 6), b.h + 0.6, b.minZ + 2 + rng() * (b.maxZ - b.minZ - 4), scene);
      rock.scale.set(1.4 + rng() * 1.6, 0.8 + rng() * 1.2, 1.4 + rng() * 1.6);
      rock.rotation.y = rng() * 3;
      rock.castShadow = true;
    }
  }
  // Partition visuals (chamber wall in the temple, tunnel mouth in the outpost).
  function partitionWall(part, height, material) {
    const left = part.doorCenter - part.doorWidth / 2 - part.minX;
    const rightStart = part.doorCenter + part.doorWidth / 2;
    const right = part.maxX - rightStart;
    if (left > 0.08) box(left, height, part.thickness, material, part.minX + left / 2, height / 2, part.z);
    if (right > 0.08) box(right, height, part.thickness, material, rightStart + right / 2, height / 2, part.z);
    const lintel = height - SCALE.doorHeight;
    if (lintel > 0.08) box(part.doorWidth, lintel, part.thickness, material, part.doorCenter, SCALE.doorHeight + lintel / 2, part.z);
  }
  const partLeaves = [];
  {
    const chamber = PARTITIONS.find((p) => p.id === "chamber");
    partitionWall(chamber, 6.2, M.stone);
    box(chamber.doorWidth + 0.5, 0.3, chamber.thickness + 0.2, M.brass, chamber.doorCenter, SCALE.doorHeight + 0.15, chamber.z);
    for (const side of [-1, 1]) box(0.3, SCALE.doorHeight, chamber.thickness + 0.2, M.stoneDark, chamber.doorCenter + side * (chamber.doorWidth / 2 + 0.1), SCALE.doorHeight / 2, chamber.z);
    const leaf = grp(chamber.doorCenter, 0, chamber.z);
    box(chamber.doorWidth * 0.97, SCALE.doorHeight * 0.99, 0.18, M.stoneDark, 0, SCALE.doorHeight / 2, 0, leaf);
    for (const y of [0.55, 1.15, 1.75]) box(chamber.doorWidth * 0.8, 0.07, 0.04, M.brass, 0, y, -0.1, leaf);
    partLeaves.push({ obj: leaf, part: chamber });
    tag(leaf, "chamberDoor");

    const tunnel = PARTITIONS.find((p) => p.id === "tunnel");
    partitionWall(tunnel, 5.2, M.rock);
    for (const side of [-1, 1]) {
      box(0.4, SCALE.doorHeight + 0.2, 0.9, M.timberDark, tunnel.doorCenter + side * (tunnel.doorWidth / 2 + 0.2), (SCALE.doorHeight + 0.2) / 2, tunnel.z);
      for (let i = 0; i < 2; i += 1) {
        const rock = mesh(trackGeo(new THREE.DodecahedronGeometry(1, 0)), M.rock, tunnel.doorCenter + side * (tunnel.doorWidth / 2 + 3.3 + i * 1.9), 1.0 + i * 0.4, tunnel.z + (i - 0.5) * 0.8, scene);
        rock.scale.set(1.8, 2.2 - i * 0.4, 1.8);
        rock.rotation.y = i * 1.3;
        rock.castShadow = true;
      }
    }
    box(tunnel.doorWidth + 0.8, 0.4, 1, M.timberDark, tunnel.doorCenter, SCALE.doorHeight + 0.2, tunnel.z);
    const leaf2 = grp(tunnel.doorCenter, 0, tunnel.z);
    box(tunnel.doorWidth * 0.97, SCALE.doorHeight * 0.99, 0.14, M.timberDark, 0, SCALE.doorHeight / 2, 0, leaf2);
    for (const y of [0.5, 1.2, 1.9]) box(tunnel.doorWidth * 0.98, 0.1, 0.18, M.metalDark, 0, y, 0, leaf2);
    partLeaves.push({ obj: leaf2, part: tunnel });
    const hangMat = glowMat("#ffe9b8", "#ffb347", 0.05);
    ball(0.14, hangMat, tunnel.doorCenter - 1.9, 2.6, tunnel.z - 0.6, scene);
    bind((st, fl) => {
      hangMat.emissiveIntensity = fl.tunnelLit ? 1.2 : 0.05;
    });
  }

  // ---------------------------------------------------------------- camp
  const hut = byId.radioHut;
  const shop = byId.workshop;

  // Radio hut interior: table + radio at the radio hotspot.
  {
    const radio = hotspotById("radio");
    const table = grp(radio.x, 0, radio.z);
    box(1.8, 0.08, 0.9, M.timberDark, 0, SCALE.table, 0, table);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.38, 0.38]) box(0.08, SCALE.table, 0.08, M.timberDark, sx, SCALE.table / 2, sz, table);
    const set = grp(0, SCALE.table + 0.04, 0, 0, table);
    box(0.78, 0.4, 0.36, plain("#3d4a3a", 0.6, 0.3), 0, 0.2, 0, set);
    box(0.5, 0.2, 0.02, M.socketDark, -0.08, 0.2, 0.19, set);
    const dial = cyl(0.11, 0.11, 0.04, 14, M.brass, -0.2, 0.2, 0.2, set);
    dial.rotation.x = Math.PI / 2;
    for (const kx of [0.14, 0.28]) {
      const knob = cyl(0.04, 0.04, 0.05, 8, M.metalDark, kx, 0.2, 0.2, set);
      knob.rotation.x = Math.PI / 2;
    }
    box(0.14, 0.05, 0.06, M.socketDark, 0.3, 0.41, 0.06, set);
    const crystal = mesh(trackGeo(new THREE.OctahedronGeometry(0.06, 0)), M.crystal, 0.3, 0.44, 0.06, set);
    crystal.scale.set(0.7, 1.4, 0.7);
    const led = ball(0.025, M.ledOff, 0.32, 0.32, 0.2, set, 6, 6);
    const antenna = cyl(0.012, 0.012, 1.4, 5, M.metalDark, -0.34, 0.9, -0.1, set);
    antenna.rotation.z = 0.12;
    const headset = mesh(trackGeo(new THREE.TorusGeometry(0.1, 0.018, 6, 12, Math.PI)), M.dark, 0.7, 0.04, 0.25, table);
    headset.rotation.x = Math.PI / 2;
    headset.position.y = SCALE.table + 0.06;
    tag(table, "radio");
    bind((st, fl) => {
      crystal.visible = !!fl.radioTuned;
      crystal.material.emissiveIntensity = 0.9;
      led.material = fl.radioTuned || fl.expeditionDone ? M.ledOn : M.ledOff;
    });
    box(0.45, 0.04, 0.45, M.floorWood, radio.x - 1.5, SCALE.chair, radio.z - 0.2);
    for (const sx of [-0.18, 0.18]) for (const sz of [-0.18, 0.18]) box(0.04, SCALE.chair, 0.04, M.timberDark, radio.x - 1.5 + sx, SCALE.chair / 2, radio.z - 0.2 + sz);
    box(0.45, 0.5, 0.04, M.floorWood, radio.x - 1.5, SCALE.chair + 0.28, radio.z - 0.4);
  }
  // Hut dressing: crate stack, shelf, wall map, lantern, roof mast.
  {
    for (const [x, y, z, s] of [[-5.6, 0.45, -102.4, 0.9], [-4.4, 0.4, -102.6, 0.8], [-5.2, 1.3, -102.4, 0.7]]) box(s, s, s, M.timber, x, y, z);
    box(0.5, 2.3, 3.2, M.timberDark, hut.minX + 0.85, 1.15, -97.5);
    for (const y of [0.5, 1.0, 1.5, 2.0]) box(0.52, 0.05, 3.2, M.floorWood, hut.minX + 0.85, y, -97.5);
    for (const [z, y] of [[-98.2, 1.18], [-97.2, 1.68], [-96.5, 0.68]]) box(0.3, 0.25, 0.4, M.canvasOlive, hut.minX + 0.85, y, z);
    flat(2.2, 1.4, M.canvas, 0, 2.3, hut.minZ + 0.55).rotation.y = 0;
    for (const [dx, dy] of [[-0.6, 0.3], [0.4, -0.2], [0.8, 0.4], [-0.1, -0.35]]) ball(0.07, M.red, dx, 2.3 + dy, hut.minZ + 0.58, scene, 6, 6);
    mesh(trackGeo(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 4)), M.dark, 0, 5.9, -96, scene);
    const hutBulb = glowMat("#ffe2a8", "#ffb347", 0.7);
    ball(0.16, hutBulb, 0, 3.4, -96, scene);
    bind((st, fl) => {
      hutBulb.emissiveIntensity = 0.7 + (fl.radioTuned ? 0.5 : 0);
    });
    cyl(0.05, 0.07, 6.6, 6, M.metalDark, 3, hut.h + 2.2, -99);
    box(1.1, 0.04, 0.04, M.metalDark, 3, hut.h + 4.6, -99);
  }

  // Tents at the tentA / tentB solids; tentB leans on the hut's south wall.
  {
    const makeTent = (x, z, yaw, w, len, hgt, material) => {
      const tent = grp(x, 0, z, yaw);
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(w / 2, 0);
      shape.lineTo(0, hgt);
      shape.closePath();
      const geo = trackGeo(new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false }));
      const body = mesh(geo, material, 0, 0, -len / 2, tent);
      body.castShadow = true;
      body.receiveShadow = true;
      box(w * 0.5, hgt * 0.72, 0.04, M.socketDark, 0, hgt * 0.38, len / 2 + 0.01, tent);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const stake = cyl(0.025, 0.025, 0.35, 5, M.timberDark, sx * (w / 2 + 0.35), 0.15, sz * (len / 2 - 0.1), tent);
          stake.rotation.z = -sx * 0.4;
        }
      }
      return tent;
    };
    makeTent(-8, -102.9, 0, 2.1, 2.7, 1.7, M.canvas);
    const lean = grp(5, 0, -104.9, 0);
    const slab = box(2.1, 0.05, 2.2, M.canvasOlive, 0, 1.0, -0.05, lean);
    slab.rotation.x = -0.55;
    for (const sx of [-1, 1]) cyl(0.04, 0.04, 0.6, 6, M.timberDark, sx * 1.0, 0.3, -0.98, lean);
    box(1.5, 0.16, 0.8, M.canvasRed, 0, 0.1, 0.1, lean);
  }

  // Pack on the ground at camp.
  {
    const spot = hotspotById("pack");
    const pack = grp(spot.x, 0, spot.z, 0.6);
    box(0.8, 0.5, 0.5, M.canvasOlive, 0, 0.25, 0, pack);
    const flap = box(0.82, 0.06, 0.52, M.canvasOlive, 0, 0.53, 0, pack);
    flap.rotation.x = -0.05;
    for (const sx of [-0.25, 0.25]) box(0.06, 0.54, 0.54, M.timberDark, sx, 0.27, 0, pack);
    flat(0.5, 0.16, signMat("SUPPLY DROP B"), 0, 0.28, 0.26, pack);
    box(0.3, 0.3, 0.1, M.canvasOlive, 0.5, 0.15, 0.1, pack);
    const empty = grp(spot.x, 0, spot.z, 0.6);
    box(0.9, 0.04, 0.7, M.canvasOlive, 0, 0.03, 0, empty);
    const crumple = ball(0.18, M.canvasOlive, 0.15, 0.1, 0.05, empty, 6, 5);
    crumple.scale.set(1.4, 0.4, 1);
    tag(pack, "pack");
    tag(empty, "pack");
    bind((st, fl) => {
      pack.visible = !fl.packOpened;
      empty.visible = !!fl.packOpened;
    });
  }

  // Workshop: workbench with vise and spare axle, peg board + wrench, jeep.
  {
    const bench = hotspotById("workbench");
    const peg = hotspotById("wrenchSpot");
    const benchG = grp(bench.x, 0, bench.z);
    box(3.3, 0.1, 0.85, M.floorWood, 0, SCALE.bench, 0, benchG);
    for (const sx of [-1.5, 1.5]) for (const sz of [-0.35, 0.35]) box(0.1, SCALE.bench, 0.1, M.timberDark, sx, SCALE.bench / 2, sz, benchG);
    box(3.1, 0.06, 0.7, M.timberDark, 0, 0.25, 0, benchG);
    // Return arm that carries the tool peg: spans z to the wrenchSpot.
    const ret = grp(peg.x, 0, (bench.z + peg.z) / 2 - 0.2);
    box(0.85, 0.1, 2.6, M.floorWood, 0, SCALE.bench, 0, ret);
    for (const sx of [-0.35, 0.35]) box(0.1, SCALE.bench, 0.1, M.timberDark, sx, SCALE.bench / 2, -1.2, ret);
    // Vise with a spare axle clamped in it (oil gloss follows the jeep axle).
    const vise = grp(bench.x - 0.9, SCALE.bench + 0.05, bench.z, 0, scene);
    box(0.34, 0.16, 0.3, M.metalDark, 0, 0.08, 0, vise);
    box(0.06, 0.22, 0.3, M.metalDark, -0.14, 0.27, 0, vise);
    box(0.06, 0.22, 0.3, M.metalDark, 0.14, 0.27, 0, vise);
    const spare = cyl(0.045, 0.045, 1.5, 8, M.axle, 0.05, 0.3, 0, vise);
    spare.rotation.z = Math.PI / 2;
    const hub = cyl(0.17, 0.17, 0.1, 12, M.axle, 0.8, 0.3, 0, vise);
    hub.rotation.z = Math.PI / 2;
    const spareWheel = cyl(0.3, 0.3, 0.14, 14, M.rubber, 0.88, 0.3, 0, vise);
    spareWheel.rotation.z = Math.PI / 2;
    tag(benchG, "workbench");
    // Peg board standing on the return arm.
    const board = grp(peg.x, SCALE.bench + 0.05, peg.z - 0.4, 0);
    box(0.95, 0.85, 0.05, M.timberDark, 0, 0.43, 0.02, board);
    flat(0.7, 0.18, signMat("SPANNER"), 0, 0.72, 0.06, board);
    box(0.52, 0.06, 0.01, M.socketDark, 0, 0.38, 0.055, board);
    box(0.12, 0.16, 0.01, M.socketDark, 0.3, 0.38, 0.055, board);
    const pegPin = cyl(0.02, 0.02, 0.14, 6, M.metalDark, -0.1, 0.5, 0.1, board);
    pegPin.rotation.x = Math.PI / 2;
    const wrench = grp(0, 0.38, 0.09, 0, board);
    box(0.5, 0.05, 0.03, M.metal, 0, 0, 0, wrench);
    const wrenchHead = mesh(trackGeo(new THREE.TorusGeometry(0.07, 0.025, 6, 10, Math.PI * 1.6)), M.metal, 0.3, 0, 0, wrench);
    wrenchHead.rotation.z = Math.PI * 1.2;
    const wrenchEnd = mesh(trackGeo(new THREE.TorusGeometry(0.05, 0.02, 6, 10)), M.metal, -0.27, 0, 0, wrench);
    wrenchEnd.castShadow = true;
    tag(board, "wrenchSpot");
    tag(wrench, "wrenchSpot");
    bind((st, fl) => {
      wrench.visible = !fl.wrenchTaken;
    });

    // Survey jeep at the jeep hotspot, hood toward the workbench side.
    const jeep = grp(22.5, 0, -105, 0);
    box(4.4, 0.22, 1.7, M.metalDark, 0, 0.55, 0, jeep);
    box(4.4, 0.5, 1.9, M.paint, 0, 0.9, 0, jeep);
    box(1.5, 0.34, 1.8, M.paint, 1.5, 1.25, 0, jeep);
    const shield = box(0.08, 0.6, 1.7, M.dark, 0.55, 1.5, 0, jeep);
    shield.rotation.z = 0.3;
    const shieldGlass = flat(1.6, 0.5, M.glass, 0.5, 1.5, 0, jeep);
    shieldGlass.rotation.y = Math.PI / 2;
    shieldGlass.rotation.x = 0;
    for (const sx of [-0.2, -1.2]) {
      box(0.5, 0.18, 1.5, M.cloth, sx, 1.2, 0, jeep);
      box(0.12, 0.5, 1.5, M.cloth, sx - 0.25, 1.5, 0, jeep);
    }
    for (const sz of [-0.8, 0.8]) cyl(0.04, 0.04, 1.3, 6, M.metalDark, -1.7, 1.55, sz, jeep);
    const rollBar = cyl(0.04, 0.04, 1.6, 6, M.metalDark, -1.7, 2.2, 0, jeep);
    rollBar.rotation.x = Math.PI / 2;
    const wheels = [];
    for (const [wx, wz] of [[1.5, -1.0], [1.5, 1.0], [-1.5, -1.0], [-1.5, 1.0]]) {
      const wheel = grp(wx, 0.5, wz, 0, jeep);
      const tire = cyl(0.5, 0.5, 0.38, 14, M.rubber, 0, 0, 0, wheel);
      tire.rotation.x = Math.PI / 2;
      const rim = cyl(0.24, 0.24, 0.4, 10, M.brass, 0, 0, 0, wheel);
      rim.rotation.x = Math.PI / 2;
      wheels.push(wheel);
    }
    const spareTire = cyl(0.42, 0.42, 0.26, 12, M.rubber, -2.45, 1.1, 0, jeep);
    spareTire.rotation.z = Math.PI / 2;
    // Rear axle with differential and the yellow bolt Sven marked.
    const axle = cyl(0.07, 0.07, 2.0, 8, M.axle, -1.5, 0.46, 0, jeep);
    axle.rotation.x = Math.PI / 2;
    ball(0.24, M.axle, -1.5, 0.46, 0, jeep, 10, 8);
    const bolt = box(0.14, 0.14, 0.14, M.yellow, -1.5, 0.72, 0, jeep);
    const drips = [];
    for (const dz of [-0.25, 0.1, 0.45]) {
      const drip = ball(0.035, plain("#3a2208", 0.1, 0.2), -1.5, 0.3 - Math.abs(dz) * 0.1, dz, jeep, 6, 6);
      drip.scale.y = 1.6;
      drips.push(drip);
    }
    const headlights = [];
    const headMat = glowMat("#fff1c8", "#ffe39a", 1.2);
    for (const sz of [-0.6, 0.6]) headlights.push(ball(0.12, M.glass, 2.28, 1.2, sz, jeep, 8, 6));
    const exhaust = cyl(0.04, 0.04, 0.5, 6, M.dark, -2.3, 0.4, 0.6, jeep);
    exhaust.rotation.z = Math.PI / 2;
    tag(jeep, "jeep");
    for (let i = 0; i < 4; i += 1) {
      const puff = mesh(trackGeo(new THREE.SphereGeometry(0.22, 7, 6)), M.smoke, 20.0, 0.5, -104.4, scene);
      puff.userData = { kind: "exhaust", phase: i * 0.6 };
      puffs.push(puff);
    }
    bind((st, fl, dt, now) => {
      const oiled = !!fl.axleOiled;
      M.axle.color.set(oiled ? "#3b2b14" : "#6c7276");
      M.axle.roughness = oiled ? 0.12 : 0.45;
      drips.forEach((drip) => {
        drip.visible = oiled;
      });
      bolt.rotation.y = fl.jeepStarted ? Math.PI / 4 : 0;
      const squash = fl.jeepStarted ? 1 : 0.8;
      wheels.forEach((wheel) => {
        wheel.scale.y = squash;
        wheel.scale.z = 1;
        wheel.position.y = 0.5 * squash;
      });
      headlights.forEach((light) => {
        light.material = fl.jeepStarted ? headMat : M.glass;
      });
      jeep.position.y = fl.jeepStarted ? Math.sin(now * 38) * 0.008 : 0;
    });

    // Barrels, tool shelf and a lamp for the shop.
    for (const [x, z] of [[30.4, -106.5], [29.2, -106.8], [30.6, -105.2]]) cyl(0.35, 0.35, 0.95, 10, M.metalDark, x, 0.48, z);
    box(0.5, 2.0, 3.0, M.timberDark, shop.maxX - 0.9, 1.0, -98);
    for (const y of [0.5, 1.0, 1.5]) box(0.52, 0.05, 3.0, M.floorWood, shop.maxX - 0.9, y, -98);
    for (const [z, y] of [[-99, 1.12], [-97.6, 0.62]]) box(0.3, 0.22, 0.4, M.metal, shop.maxX - 0.9, y, z);
    ball(0.15, M.bulb, 24, 3.6, -98, scene);
    cyl(0.05, 0.05, 2.6, 6, M.timberDark, 24, shop.h - 1.3 + 0.2, -98);
  }

  // Cook fire, log seats and pot.
  {
    const fire = SOLIDS.find((s) => s.id === "cookpit");
    const pit = grp(fire.x, 0, fire.z);
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      const stone = mesh(trackGeo(new THREE.DodecahedronGeometry(0.16, 0)), M.rock, Math.cos(a) * 0.52, 0.1, Math.sin(a) * 0.52, pit);
      stone.scale.y = 0.8;
      stone.castShadow = true;
    }
    for (let i = 0; i < 3; i += 1) {
      const log = cyl(0.06, 0.07, 0.7, 6, M.timberDark, 0, 0.12, 0, pit);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 3) * Math.PI;
    }
    const flameA = mesh(trackGeo(new THREE.ConeGeometry(0.2, 0.7, 7)), M.fireOrange, 0, 0.45, 0, pit);
    const flameB = mesh(trackGeo(new THREE.ConeGeometry(0.11, 0.5, 6)), M.fireYellow, 0.04, 0.38, 0.02, pit);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = cyl(0.025, 0.025, 1.7, 5, M.timberDark, Math.cos(a) * 0.55, 0.8, Math.sin(a) * 0.55, pit);
      leg.rotation.z = -Math.cos(a) * 0.35;
      leg.rotation.x = Math.sin(a) * 0.35;
    }
    const pot = ball(0.2, M.dark, 0, 0.92, 0, pit, 10, 7);
    pot.scale.y = 0.85;
    for (const [lx, lz, ry] of [[-1.5, 0.3, 0.2], [1.3, -0.9, 1.2], [0.4, 1.5, 2.4]]) {
      const seat = cyl(0.14, 0.14, 1.2, 7, M.timber, lx, 0.15, lz, pit);
      seat.rotation.z = Math.PI / 2;
      seat.rotation.y = ry;
    }
    for (let i = 0; i < 4; i += 1) {
      const puff = mesh(trackGeo(new THREE.SphereGeometry(0.2, 7, 6)), M.smoke, fire.x, 1.4, fire.z, scene);
      puff.userData = { kind: "smoke", phase: i * 0.7, x: fire.x, z: fire.z };
      puffs.push(puff);
    }
    bind((st, fl, dt, now) => {
      const flick = 0.9 + Math.sin(now * 11) * 0.08 + Math.sin(now * 17.3) * 0.06;
      flameA.scale.set(flick, 1 + Math.sin(now * 9) * 0.12, flick);
      flameB.scale.set(1, 1 + Math.sin(now * 13 + 1) * 0.18, 1);
      lights.fire.intensity = 13 * flick;
    });
  }

  // Totem near the hut door, supply drop crates.
  {
    const totem = grp(-2, 0, -87.5);
    cyl(0.22, 0.26, 3.1, 8, M.timber, 0, 1.55, 0, totem);
    for (const [y, mat] of [[0.8, M.canvasRed], [1.5, M.yellow], [2.2, M.canvasOlive]]) {
      box(0.5, 0.5, 0.5, mat, 0, y, 0.05, totem);
      box(0.1, 0.1, 0.06, M.dark, -0.1, y + 0.05, 0.32, totem);
      box(0.1, 0.1, 0.06, M.dark, 0.1, y + 0.05, 0.32, totem);
    }
    const wing = box(1.1, 0.08, 0.04, M.canvasRed, 0, 2.5, 0, totem);
    wing.rotation.z = 0.2;
    box(0.4, 0.4, 0.4, M.timber, 13, 0.2, -92);
    box(0.5, 0.5, 0.5, M.timberDark, 13.6, 0.25, -91.6);
    cyl(0.04, 0.04, 4.2, 6, M.timberDark, 10.6, 2.1, -91);
    const flag = flat(1.0, 0.6, M.canvasRed, 11.1, 3.7, -91);
    flag.material = M.canvasRed;
  }

  // Buried cache.
  {
    const spot = hotspotById("cache");
    const cache = grp(spot.x, 0, spot.z);
    const mound = ball(1.0, M.dirt, 0, 0, 0, cache, 12, 6);
    mound.scale.set(1, 0.45, 1);
    const hole = mesh(trackGeo(new THREE.CircleGeometry(0.42, 12)), M.socketDark, 0, 0.46, 0, cache);
    hole.rotation.x = -Math.PI / 2;
    const lid = grp(0, 0.43, 0, 0, cache);
    const lidPlate = box(0.8, 0.07, 0.6, M.brass, 0, 0.0, 0, lid);
    lidPlate.castShadow = true;
    const handle = mesh(trackGeo(new THREE.TorusGeometry(0.1, 0.02, 6, 10)), M.brass, 0, 0.08, 0, lid);
    handle.rotation.x = Math.PI / 2;
    lid.position.set(0, 0.43, 0);
    tag(cache, "cache");
    bind((st, fl, dt) => {
      const open = fl.cacheOpened ? 1 : 0;
      lerpers.cache = approach(lerpers.cache ?? 0, open, dt, 3);
      lid.rotation.x = -lerpers.cache * 1.2;
      lid.position.z = -0.3 * lerpers.cache;
      hole.visible = lerpers.cache > 0.1;
    });
  }

  // ---------------------------------------------------------------- signposts
  function signpost(id, x, z, yaw, boards) {
    const post = grp(x, 0, z, yaw);
    box(0.16, 2.5, 0.16, M.timber, 0, 1.25, 0, post);
    boards.forEach((board, i) => {
      const arm = grp(0, 2.15 - i * 0.55, 0, board.angle || 0, post);
      box(1.7, 0.42, 0.06, M.timberDark, board.dx || 0.7, 0, 0, arm);
      flat(1.6, 0.34, signMat(board.text), board.dx || 0.7, 0, 0.04, arm);
      const back = flat(1.6, 0.34, signMat(board.text), board.dx || 0.7, 0, -0.04, arm);
      back.rotation.y = Math.PI;
    });
    ball(0.12, M.brass, 0, 2.55, 0, post, 8, 6);
    tag(post, id);
  }
  signpost("trailA", 0, -78, 0.4, [{ text: "NORTH TO TEMPLE" }, { text: "WEST", angle: Math.PI * 0.9, dx: 0.7 }]);
  signpost("trailB", -68, -38, -0.8, [{ text: "OUTPOST" }, { text: "CAMP", angle: Math.PI, dx: 0.7 }]);
  signpost("trailC", -40, 62, 0.3, [{ text: "TEMPLE" }, { text: "OUTPOST", angle: Math.PI, dx: 0.7 }]);
  signpost("trailD", 52, 88, -0.2, [{ text: "OBSERVATORY" }, { text: "TEMPLE", angle: Math.PI, dx: 0.7 }]);
  for (const [x, z] of [[54, 85], [56, 91], [49, 84]]) {
    cyl(0.025, 0.025, 1.6, 5, M.timberDark, x, 0.8, z);
    flat(0.45, 0.28, M.canvasRed, x + 0.23, 1.4, z);
  }

  // ---------------------------------------------------------------- river crossing, ferry, bridge
  {
    const ferry = hotspotById("ferry");
    const n = new THREE.Vector3(-DIAG, 0, DIAG);
    const yaw = -Math.atan2(n.z, n.x);
    const at = (t, y = 0) => new THREE.Vector3(ferry.x + n.x * t, y, ferry.z + n.z * t);
    // Near dock.
    const dockC = at(1.5);
    const dock = grp(dockC.x, 0, dockC.z, yaw);
    box(3.6, 0.1, 1.5, M.floorWood, 0, 0.12, 0, dock);
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.65, 0.65]) cyl(0.08, 0.08, 0.7, 6, M.timberDark, sx, 0.0, sz, dock);
    const farC = at(8.4);
    const farDock = grp(farC.x, 0, farC.z, yaw);
    box(1.8, 0.1, 1.3, M.floorWood, 0, 0.12, 0, farDock);
    // Ferry rope between two posts across the river.
    const p1 = at(0.9);
    const p2 = at(8.9);
    cyl(0.09, 0.1, 1.8, 6, M.timberDark, p1.x, 0.9, p1.z);
    cyl(0.09, 0.1, 1.8, 6, M.timberDark, p2.x, 0.9, p2.z);
    const mid = at(4.9);
    const rope = grp(mid.x, 1.5, mid.z, yaw);
    const ropeLine = cyl(0.015, 0.015, 8.0, 4, M.dark, 0, 0, 0, rope);
    ropeLine.rotation.z = Math.PI / 2;
    // Boat that slides along the rope once the ferryman is paid.
    const boat = grp(0, 0.05, 0, yaw);
    const hullBottom = box(3.0, 0.07, 0.7, M.timber, 0, 0.1, 0, boat);
    hullBottom.castShadow = true;
    for (const sz of [-1, 1]) {
      const side = box(3.0, 0.34, 0.06, M.timberDark, 0, 0.28, sz * 0.38, boat);
      side.rotation.x = -sz * 0.35;
    }
    for (const sx of [-1, 1]) box(0.06, 0.34, 0.8, M.timberDark, sx * 1.5, 0.28, 0, boat);
    box(0.4, 0.04, 0.8, M.timber, 0.2, 0.36, 0, boat);
    const pole = cyl(0.025, 0.025, 3.2, 5, M.timber, -0.2, 0.9, 0.5, boat);
    pole.rotation.z = 0.5;
    tag(boat, "ferry");
    tag(dock, "ferry");
    bind((st, fl, dt, now) => {
      lerpers.ferry = approach(lerpers.ferry ?? 0, fl.ferryPaid ? 1 : 0, dt, 0.8);
      const t = 3.1 + lerpers.ferry * 4.8;
      const p = at(t);
      boat.position.set(p.x, 0.06 + Math.sin(now * 1.6 + t) * 0.015, p.z);
      boat.rotation.z = Math.sin(now * 1.3) * 0.02;
    });
  }

  // Rope bridge over the gorge, centred on the bridge hotspot.
  {
    const spot = hotspotById("bridge");
    const yaw = -Math.atan2(DIAG, -DIAG);
    const bridge = grp(spot.x, 0, spot.z, yaw);
    const deck = grp(0, 0, 0, 0, bridge);
    box(11.4, 0.12, 2.3, M.floorWood, 0, 0.1, 0, deck);
    for (const sz of [-1.1, 1.1]) box(11.4, 0.14, 0.12, M.timberDark, 0, 0.14, sz, deck);
    for (const x of [-5.3, -2.65, 0, 2.65, 5.3]) {
      for (const sz of [-1.2, 1.2]) {
        box(0.16, 1.1, 0.16, M.timberDark, x, 0.65, sz, deck);
      }
    }
    for (const x of [-5.5, 5.5]) for (const sz of [-1.2, 1.2]) cyl(0.2, 0.22, 1.6, 7, M.timber, x, 0.8, sz, bridge);
    const tight = grp(0, 0, 0, 0, deck);
    const slack = grp(0, 0, 0, 0, deck);
    for (const sz of [-1.2, 1.2]) {
      for (const y of [1.1, 0.6]) box(11.0, 0.05, 0.05, M.dark, 0, y, sz, tight);
      for (const half of [-1, 1]) {
        const seg = box(5.6, 0.05, 0.05, M.dark, half * 2.7, 0.8, sz, slack);
        seg.rotation.z = half * 0.2;
      }
    }
    // Pin brackets at midspan: the pin only appears once the bridge is secured.
    for (const sz of [-1.45, 1.45]) {
      box(0.4, 1.3, 0.34, M.timberDark, 0, 0.7, sz, deck);
      cyl(0.06, 0.06, 0.02, 8, M.socketDark, 0, 1.36, sz, deck);
    }
    const pin = grp(0, 1.12, 1.45, 0, deck);
    cyl(0.045, 0.045, 0.55, 8, M.metal, 0, 0.1, 0, pin);
    ball(0.075, M.metal, 0, 0.4, 0, pin, 8, 6);
    flat(0.1, 0.22, M.red, 0.1, 0.2, 0, pin).rotation.y = Math.PI / 2;
    tag(bridge, "bridge");
    bind((st, fl, dt, now) => {
      pin.visible = !!fl.bridgePinned;
      tight.visible = !!fl.bridgePinned;
      slack.visible = !fl.bridgePinned;
      deck.rotation.z = fl.bridgePinned ? 0 : Math.sin(now * 1.1) * 0.02;
    });
  }

  // Rope barrier at westGate.
  {
    const gate = SOLIDS.find((s) => s.id === "westGate");
    const barrier = grp(gate.x, 0, gate.z, -Math.atan2(0.6, 0.8));
    for (const sx of [-1.35, 1.35]) {
      cyl(0.08, 0.1, 1.3, 6, M.timberDark, sx, 0.65, 0, barrier);
      ball(0.09, M.red, sx, 1.35, 0, barrier, 6, 6);
    }
    for (const y of [1.1, 0.7]) {
      const rope = box(2.7, 0.04, 0.04, M.dark, 0, y - 0.1, 0, barrier);
      rope.rotation.z = 0;
    }
    flat(0.9, 0.3, signMat("CLOSED"), 0, 0.8, 0.04, barrier);
    flat(0.9, 0.3, signMat("CLOSED"), 0, 0.8, -0.04, barrier).rotation.y = Math.PI;
    bind((st, fl) => {
      barrier.visible = !fl.bridgePinned;
    });
  }

  // Outpost gate: swings open with the outpostDoor flag.
  {
    const spot = hotspotById("outpostDoor");
    const yaw = -Math.atan2(0.4969, 0.8678);
    const gate = grp(spot.x, 0, spot.z, yaw);
    for (const sx of [-2.0, 2.0]) {
      box(0.55, 3.4, 0.55, M.stoneDark, sx, 1.7, 0, gate);
      box(0.7, 0.18, 0.7, M.metalDark, sx, 3.45, 0, gate);
    }
    box(4.6, 0.32, 0.45, M.timberDark, 0, 3.25, 0, gate);
    flat(2.4, 0.4, signMat("OUTPOST WEST"), 0, 3.25, 0.24, gate);
    flat(2.4, 0.4, signMat("OUTPOST WEST"), 0, 3.25, -0.24, gate).rotation.y = Math.PI;
    for (const side of [-1, 1]) {
      box(2.1, 2.3, 0.16, M.timber, side * 3.35, 1.15, 0, gate);
      for (let i = 0; i < 3; i += 1) cyl(0.02, 0.1, 0.4, 4, M.timberDark, side * (2.6 + i * 0.75), 2.45, 0, gate);
    }
    const pivot = grp(-1.75, 0, 0, 0, gate);
    const leafG = grp(1.7, 0, 0, 0, pivot);
    box(3.4, 2.2, 0.12, M.metalDark, 0, 1.2, 0, leafG);
    const brace = box(3.8, 0.12, 0.06, M.metal, 0, 1.2, 0.08, leafG);
    brace.rotation.z = 0.55;
    for (const y of [0.4, 1.2, 2.0]) box(3.4, 0.1, 0.16, M.metal, 0, y, 0, leafG);
    tag(gate, "outpostDoor");
    bind((st, fl, dt) => {
      lerpers.gate = approach(lerpers.gate ?? 0, fl.outpostDoor ? 1 : 0, dt, 3);
      pivot.rotation.y = -lerpers.gate * 1.45;
    });
  }

  // ---------------------------------------------------------------- warehouse: dynamo, crates, bulbs
  {
    const b = byId.warehouse;
    const spot = hotspotById("dynamo");
    const crate = grp(spot.x, 0, spot.z + 0.1);
    box(1.3, 0.85, 1.0, M.timber, 0, 0.43, 0, crate);
    const housing = cyl(0.32, 0.32, 0.9, 14, M.paint, 0, 1.17, 0, crate);
    housing.rotation.z = Math.PI / 2;
    for (const sx of [-0.46, 0.46]) {
      const capBand = cyl(0.34, 0.34, 0.06, 14, M.brass, sx, 1.17, 0, crate);
      capBand.rotation.z = Math.PI / 2;
    }
    box(0.7, 0.14, 0.5, M.metalDark, 0, 0.9, 0, crate);
    // Crank attachment point: socket on the east face, crank appears when wound.
    const socket = cyl(0.07, 0.07, 0.14, 10, M.brass, 0.54, 1.17, 0, crate);
    socket.rotation.z = Math.PI / 2;
    const stub = cyl(0.035, 0.035, 0.22, 8, M.metal, 0.66, 1.17, 0, crate);
    stub.rotation.z = Math.PI / 2;
    const crankPivot = grp(0.78, 1.17, 0, 0, crate);
    const crankArm = box(0.05, 0.42, 0.05, M.metal, 0, 0.21, 0, crankPivot);
    crankArm.castShadow = true;
    const crankKnob = cyl(0.03, 0.03, 0.18, 8, M.timberDark, 0.08, 0.42, 0, crankPivot);
    crankKnob.rotation.z = Math.PI / 2;
    crankPivot.visible = false;
    tag(crate, "dynamo");
    // Cables up to ceiling bulbs.
    const whBulb = glowMat("#ffe9b8", "#ffb347", 0.05);
    for (const [x, z] of [[-100, -2], [-94, 3], [-106, -7], [-106, 4]]) {
      cyl(0.015, 0.015, b.h - 4.0, 4, M.dark, x, (b.h + 4.0) / 2, z);
      ball(0.16, whBulb, x, 4.0, z, scene);
    }
    // Shelf two with the spare crank on it.
    box(0.5, 2.3, 4.2, M.timberDark, b.minX + 0.85, 1.15, 0);
    for (const y of [0.55, 1.1, 1.65, 2.2]) box(0.52, 0.05, 4.2, M.floorWood, b.minX + 0.85, y, 0);
    for (const [z, y, s] of [[-1.4, 0.7, 0.4], [-0.3, 1.27, 0.34], [0.9, 0.7, 0.44], [1.5, 1.27, 0.3]]) box(0.36, s, 0.4, M.canvasOlive, b.minX + 0.85, y, z);
    const shelfCrank = grp(b.minX + 0.9, 1.9, -1.0);
    box(0.34, 0.04, 0.04, M.metal, 0, 0, 0, shelfCrank);
    box(0.04, 0.2, 0.04, M.metal, 0.17, -0.1, 0, shelfCrank);
    // Crates.
    for (const [x, z, s, stack] of [[-109, -9.2, 1.3, true], [-106.6, -9.4, 1.0, false], [-109, 5.8, 1.2, true], [-104.5, 6.3, 1.1, false], [-96, 6.4, 1.3, true], [-91.5, -9.3, 1.2, false], [-95, -9.4, 1.0, false], [-92, 6.0, 1.0, false]]) {
      box(s, s, s, M.timber, x, s / 2, z).rotation.y = (x * 0.31) % 0.4;
      if (stack) box(s * 0.75, s * 0.75, s * 0.75, M.timberDark, x + 0.1, s + s * 0.37, z);
    }
    for (const [x, z] of [[-110, -2], [-110.3, -4.2]]) cyl(0.35, 0.35, 0.95, 10, M.metalDark, x, 0.48, z);
    bind((st, fl, dt, now) => {
      const lit = !!fl.dynamoWound;
      whBulb.emissiveIntensity = lit ? 1.1 + Math.sin(now * 30) * 0.03 : 0.05;
      lights.warehouse.intensity = lit ? 26 : 0;
      crankPivot.visible = lit;
      crankPivot.rotation.x = lit ? now * 4 : 0;
      shelfCrank.visible = !(st.inventory || []).includes("dynamoCrank") && !lit;
    });
  }

  // ---------------------------------------------------------------- watchtower: switchboard with the fuse box
  {
    const spot = hotspotById("fuse");
    const board = grp(spot.x, 0, spot.z - 0.6);
    box(2.2, 2.6, 0.16, M.timberDark, 0, 1.3, 0, board);
    for (const sx of [-1.0, 1.0]) box(0.16, 2.7, 0.3, M.timber, sx, 1.35, 0, board);
    box(2.4, 0.16, 0.3, M.timber, 0, 2.65, 0, board);
    box(0.75, 0.95, 0.2, M.metalDark, 0, 1.5, 0.17, board);
    box(0.6, 0.8, 0.04, M.socketDark, 0, 1.5, 0.28, board);
    flat(0.4, 0.14, signMat("SPARE"), 0, 1.8, 0.31, board);
    const fuse = grp(0, 1.38, 0.31, 0, board);
    const tube = cyl(0.028, 0.028, 0.34, 8, M.glass, 0, 0, 0, fuse);
    tube.rotation.z = Math.PI / 2;
    for (const sx of [-0.18, 0.18]) cyl(0.035, 0.035, 0.05, 8, M.brass, sx, 0, 0, fuse).rotation.z = Math.PI / 2;
    box(0.3, 0.008, 0.008, M.brass, 0, 0, 0, fuse);
    for (const sx of [-0.2, 0.2]) box(0.12, 0.12, 0.05, M.metal, sx, 1.05, 0.28, board);
    cyl(0.02, 0.02, 3.2, 4, M.dark, -0.7, 4.0, 0.2, board);
    tag(board, "fuse");
    bind((st, fl) => {
      fuse.visible = !fl.fuseFound;
    });
    const tower = byId.watchtower;
    box(0.5, 3.4, 0.14, M.timberDark, tower.minX + 0.9, 1.7, spot.z + 3);
    for (let i = 0; i < 9; i += 1) box(0.4, 0.05, 0.2, M.timber, tower.minX + 0.9, 0.3 + i * 0.37, spot.z + 3.1);
  }

  // ---------------------------------------------------------------- office: ledger desk, tunnel lamp, rail switch
  {
    const ledgerSpot = hotspotById("ledger");
    const desk = grp(ledgerSpot.x, 0, ledgerSpot.z);
    box(1.8, 0.08, 0.85, M.floorWood, 0, SCALE.table, 0, desk);
    for (const sx of [-0.82, 0.82]) for (const sz of [-0.36, 0.36]) box(0.08, SCALE.table, 0.08, M.timberDark, sx, SCALE.table / 2, sz, desk);
    box(0.5, 0.5, 0.7, M.timberDark, 0.6, 0.3, 0, desk);
    const book = grp(-0.2, SCALE.table + 0.04, 0, 0.15, desk);
    box(0.36, 0.05, 0.26, M.dark, 0, 0.025, 0, book);
    box(0.33, 0.04, 0.23, plain("#e8dfc4", 0.9), 0.0, 0.055, 0, book);
    const rub = grp(0.5, SCALE.table + 0.045, -0.15, -0.3, desk);
    box(0.3, 0.004, 0.22, plain("#e6e0cf", 0.9), 0, 0, 0, rub);
    for (const [dx, dz] of [[-0.08, -0.04], [0, 0.03], [0.08, -0.03]]) box(0.06, 0.006, 0.06, M.dark, dx, 0.003, dz, rub);
    cyl(0.012, 0.012, 0.12, 5, M.dark, 0.55, SCALE.table + 0.07, 0.25, desk).rotation.z = Math.PI / 2;
    tag(desk, "ledger");
    bind((st, fl) => {
      rub.visible = !!fl.ledgerCopied;
    });
    box(0.5, 0.04, 0.5, M.floorWood, ledgerSpot.x + 1.4, SCALE.chair, ledgerSpot.z + 1.4);
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2]) box(0.04, SCALE.chair, 0.04, M.timberDark, ledgerSpot.x + 1.4 + sx, SCALE.chair / 2, ledgerSpot.z + 1.4 + sz);
    const off = byId.office;
    for (let i = 0; i < 4; i += 1) box(0.9, 1.4, 0.5, M.metalDark, off.minX + 2 + i * 1.0, 0.7, off.maxZ - 0.9);
    box(0.5, 2.3, 3.0, M.timberDark, off.minX + 0.85, 1.15, 20);
    for (const y of [0.55, 1.1, 1.65, 2.2]) box(0.52, 0.05, 3.0, M.floorWood, off.minX + 0.85, y, 20);

    // Tunnel lamp on a bracketed post; fuse sits in the base box once the tunnel is lit.
    const lampSpot = hotspotById("tunnelLamp");
    const lamp = grp(lampSpot.x, 0, lampSpot.z);
    cyl(0.05, 0.06, 2.2, 7, M.metalDark, 0, 1.1, 0, lamp);
    box(0.34, 0.5, 0.34, M.metalDark, 0, 2.35, 0, lamp);
    const lampMat = glowMat("#ffe9b8", "#ffb347", 1.0);
    const lampGlass = box(0.26, 0.38, 0.26, M.glass, 0, 2.35, 0, lamp);
    box(0.44, 0.08, 0.44, M.metal, 0, 2.64, 0, lamp);
    box(0.34, 0.3, 0.2, M.metal, 0, 0.95, 0.12, lamp);
    box(0.24, 0.2, 0.02, M.socketDark, 0, 0.95, 0.23, lamp);
    const lampFuse = cyl(0.02, 0.02, 0.18, 6, M.glass, 0, 0.95, 0.25, lamp);
    lampFuse.rotation.z = Math.PI / 2;
    box(0.4, 0.1, 0.4, M.stoneDark, 0, 0.05, 0, lamp);
    tag(lamp, "tunnelLamp");
    bind((st, fl, dt, now) => {
      const lit = !!fl.tunnelLit;
      lampGlass.material = lit ? lampMat : M.glass;
      lampFuse.visible = lit;
      lights.tunnel.intensity = lit ? 20 + Math.sin(now * 8) * 1.2 : 0;
      lights.tunnel.visible = true;
    });

    // Rail switch: lever on a stub of rail track.
    const railSpot = hotspotById("railSwitch");
    const rail = grp(railSpot.x, 0, railSpot.z);
    for (const sz of [-0.45, 0.45]) box(5.0, 0.07, 0.07, M.metal, 0, 0.1, sz, rail);
    for (let i = -4; i <= 4; i += 1) box(0.16, 0.06, 1.2, M.timberDark, i * 0.55, 0.05, 0, rail);
    box(0.5, 0.45, 0.4, M.metalDark, 0, 0.3, 0.9, rail);
    const leverPivot = grp(0, 0.5, 0.9, 0, rail);
    cyl(0.025, 0.025, 0.9, 6, M.metal, 0, 0.4, 0, leverPivot);
    ball(0.07, M.red, 0, 0.88, 0, leverPivot, 8, 6);
    const crateRail = box(0.6, 0.4, 0.5, M.timber, 2.2, 0.2, 0.9, rail);
    crateRail.rotation.y = 0.2;
    tag(rail, "railSwitch");
    bind((st, fl, dt) => {
      lerpers.rail = approach(lerpers.rail ?? 0, fl.railSwitch ? 1 : 0, dt, 5);
      leverPivot.rotation.z = -0.6 + lerpers.rail * 1.2;
    });
  }

  // ---------------------------------------------------------------- temple: gate, mosaic, idol, mirror niche, aqueduct, seal
  {
    const hall = byId.templeHall;
    const gateSpot = hotspotById("templeGate");
    const gate = grp(gateSpot.x, 0, gateSpot.z);
    for (const sx of [-2.6, 2.6]) {
      box(0.9, 4.4, 0.9, M.stone, sx, 2.2, 0, gate);
      box(1.1, 0.3, 1.1, M.stoneDark, sx, 4.55, 0, gate);
    }
    box(6.6, 0.9, 1.0, M.stone, 0, 4.8, 0, gate);
    box(7.0, 0.3, 1.2, M.stoneDark, 0, 5.4, 0, gate);
    const sockets = [];
    ["sun", "river", "star"].forEach((kind, i) => {
      const sx = -1.4 + i * 1.4;
      box(0.8, 0.8, 0.1, M.socketDark, sx, 4.8, -0.46, gate);
      const tile = flat(0.7, 0.7, trackMat(new THREE.MeshBasicMaterial({ map: tex.tile(kind) })), sx, 4.8, -0.53, gate);
      tile.rotation.y = Math.PI;
      sockets.push(tile);
    });
    for (const sx of [-2.6, 2.6]) {
      cyl(0.3, 0.2, 0.3, 8, M.metalDark, sx * 1.35, 1.0, -0.8, gate);
      cyl(0.08, 0.08, 1.0, 6, M.metalDark, sx * 1.35, 0.5, -0.8, gate);
      const flame = mesh(trackGeo(new THREE.ConeGeometry(0.2, 0.5, 6)), M.fireOrange, sx * 1.35, 1.35, -0.8, gate);
      flame.userData.flicker = true;
      sockets.push(flame);
    }
    tag(gate, "templeGate");
    bind((st, fl, dt, now) => {
      sockets.forEach((item) => {
        if (item.userData.flicker) item.scale.y = 1 + Math.sin(now * 12 + item.position.x) * 0.2;
        else item.visible = !!fl.templeGate;
      });
    });
    for (const sx of [-9, 9]) for (const z of [94, 98, 102, 106]) {
      cyl(0.5, 0.55, hall.h, 10, M.stone, sx, hall.h / 2, z);
      box(1.3, 0.3, 1.3, M.stoneDark, sx, 0.15, z);
      box(1.3, 0.3, 1.3, M.stoneDark, sx, hall.h - 0.15, z);
    }

    // Floor mosaic.
    const mosaic = hotspotById("mosaic");
    const floor = grp(mosaic.x, 0.04, mosaic.z);
    box(4.2, 0.05, 1.5, M.stoneDark, 0, 0.0, 0, floor);
    const tiles = [];
    ["sun", "river", "star"].forEach((kind, i) => {
      const sx = -1.3 + i * 1.3;
      box(1.0, 0.04, 1.0, M.socketDark, sx, 0.03, 0, floor);
      const tile = flat(0.94, 0.94, trackMat(new THREE.MeshBasicMaterial({ map: tex.tile(kind) })), sx, 0.058, 0, floor);
      tile.rotation.x = -Math.PI / 2;
      tiles.push(tile);
    });
    tag(floor, "mosaic");
    bind((st, fl) => {
      tiles.forEach((tile) => {
        tile.visible = !!fl.mosaicMatched;
      });
    });

    // Idol on a pedestal with a loose base panel.
    const idolSpot = hotspotById("idol");
    const pedestal = grp(idolSpot.x, 0, idolSpot.z);
    box(1.1, 0.95, 1.1, M.stone, 0, 0.48, 0, pedestal);
    box(1.2, 0.15, 1.2, M.stoneDark, 0, 0.05, 0, pedestal);
    const panelHinge = grp(-0.25, 0.4, 0.57, 0, pedestal);
    box(0.5, 0.45, 0.06, M.stoneDark, 0.25, 0, 0, panelHinge);
    const idol = grp(0, 0.95, 0, Math.PI + 0.3, pedestal);
    box(0.5, 0.7, 0.4, M.stoneDark, 0, 0.35, 0, idol);
    ball(0.2, M.stoneDark, 0, 0.9, 0, idol, 10, 8);
    box(0.7, 0.14, 0.2, M.stoneDark, 0, 0.62, 0, idol);
    box(0.08, 0.08, 0.04, M.socketDark, -0.07, 0.93, 0.18, idol);
    box(0.08, 0.08, 0.04, M.socketDark, 0.07, 0.93, 0.18, idol);
    tag(pedestal, "idol");
    bind((st, fl, dt) => {
      idol.visible = !fl.idolTaken;
      lerpers.panel = approach(lerpers.panel ?? 0, fl.idolTaken ? 1 : 0, dt, 3);
      panelHinge.rotation.y = lerpers.panel * 1.1;
    });

    // Mirror niche set flush in a stone pylon.
    const mirrorSpot = hotspotById("mirrorStand");
    const pylon = grp(mirrorSpot.x, 0, mirrorSpot.z, Math.PI);
    const pw = 1.8;
    const pd = 0.7;
    const ph = 3.0;
    const nicheY = 1.55;
    const nw = 0.9;
    const nh = 1.2;
    const depth = 0.1;
    box(pw, nicheY - nh / 2, pd, M.stone, 0, (nicheY - nh / 2) / 2, 0, pylon);
    box(pw, ph - (nicheY + nh / 2), pd, M.stone, 0, nicheY + nh / 2 + (ph - nicheY - nh / 2) / 2, 0, pylon);
    for (const side of [-1, 1]) box((pw - nw) / 2, nh, pd, M.stone, side * (nw / 2 + (pw - nw) / 4), nicheY, 0, pylon);
    box(nw, nh, pd - depth, M.stoneDark, 0, nicheY, -depth / 2, pylon);
    const mirror = cyl(0.4, 0.4, depth, 20, M.brass, 0, nicheY, pd / 2 - depth / 2, pylon);
    mirror.rotation.x = Math.PI / 2;
    // Noon beam from the niche toward the aqueduct.
    const aqSpot = hotspotById("aqueduct");
    const bdx = aqSpot.x - mirrorSpot.x;
    const bdz = aqSpot.z - mirrorSpot.z;
    const blen = Math.hypot(bdx, bdz);
    const beam = mesh(trackGeo(new THREE.PlaneGeometry(0.45, blen * 0.8)), trackMat(new THREE.MeshBasicMaterial({ color: "#fff2b0", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: both })), mirrorSpot.x + bdx * 0.45, nicheY, mirrorSpot.z + bdz * 0.45, scene);
    beam.rotation.order = "YXZ";
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.y = Math.atan2(-bdx, -bdz);
    tag(pylon, "mirrorStand");
    bind((st, fl) => {
      mirror.visible = !!fl.mirrorSet;
      beam.visible = !!fl.mirrorSet && !fl.waterChannel;
    });

    // Dry aqueduct with a missing wedge segment at the hotspot.
    const aq = hotspotById("aqueduct");
    const channel = grp(0, 0, aq.z);
    const x0 = hall.minX + 0.7;
    const gapL = aq.x - 0.5;
    const gapR = aq.x + 0.5;
    const x1 = aq.x + 5.5;
    for (const [a, c] of [[x0, gapL], [gapR, x1]]) {
      const len = c - a;
      box(len, 0.25, 1.3, M.stoneDark, a + len / 2, 0.25, 0, channel);
      for (const sz of [-0.62, 0.62]) box(len, 0.55, 0.16, M.stone, a + len / 2, 0.55, sz, channel);
    }
    const dust = flat(1.0, 1.1, M.dirt, aq.x, 0.12, 0, channel);
    dust.rotation.x = -Math.PI / 2;
    const wedge = box(0.98, 0.55, 1.28, M.stone, aq.x, 0.33, 0, channel);
    const water = flat(x1 - x0, 1.0, aqueductWater, (x0 + x1) / 2, 0.52, 0, channel);
    water.rotation.x = -Math.PI / 2;
    tag(channel, "aqueduct");
    bind((st, fl) => {
      wedge.visible = !!fl.waterChannel;
      dust.visible = !fl.waterChannel;
      water.visible = !!fl.waterChannel;
    });

    // Wax seal on the chamber leaf, and shards when broken.
    const chamber = PARTITIONS.find((p) => p.id === "chamber");
    const seal = grp(0, 1.35, chamber.z - 0.15);
    const disc = cyl(0.34, 0.34, 0.06, 18, M.wax, 0, 0, 0, seal);
    disc.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      ball(0.025, M.brass, Math.cos(a) * 0.18, Math.sin(a) * 0.18, -0.04, seal, 5, 5);
    }
    tag(seal, "seal");
    const shards = grp(0, 0.04, chamber.z - 0.6);
    for (let i = 0; i < 4; i += 1) {
      const shard = box(0.2, 0.03, 0.16, M.wax, -0.4 + i * 0.28, 0, (i % 2) * 0.12, shards);
      shard.rotation.y = i * 1.1;
    }
    bind((st, fl) => {
      seal.visible = !fl.sealBroken;
      shards.visible = !!fl.sealBroken;
    });
    // Bone keyhole plate on the chamber door.
    const key = grp(0.9, 1.0, chamber.z - 0.14);
    box(0.22, 0.32, 0.03, M.bone, 0, 0, 0, key);
    box(0.04, 0.12, 0.04, M.socketDark, 0, 0.02, -0.02, key);
    tag(key, "chamberDoor");
    bind((st, fl) => {
      key.visible = !fl.chamberOpen;
    });
  }

  // ---------------------------------------------------------------- cliff + observatory props
  {
    const cliffSpot = hotspotById("cliff");
    const cliff = grp(cliffSpot.x, 0, 66.6);
    box(10, 6.4, 2.4, M.rock, 0, 3.2, 0, cliff);
    const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 10; i += 1) {
      const rock = mesh(rockGeo, M.rock, -4.8 + i * 1.07, 0.5 + (i % 3) * 0.3, 1.0 + (i % 2) * 0.5, cliff);
      rock.scale.set(1.0 + (i % 4) * 0.2, 0.9 + (i % 3) * 0.4, 1.0);
      rock.rotation.y = i;
      rock.castShadow = true;
    }
    for (let i = 0; i < 7; i += 1) {
      const top = mesh(rockGeo, M.rock, -4.5 + i * 1.5, 6.6, -0.3 + (i % 2) * 0.4, cliff);
      top.scale.set(1.3, 0.9 + (i % 3) * 0.3, 1.3);
      top.rotation.y = i * 1.7;
      top.castShadow = true;
    }
    for (let i = 0; i < 5; i += 1) cyl(0.03, 0.03, 0.3, 5, M.metal, -0.5, 1.2 + i * 1.0, 1.28, cliff).rotation.x = Math.PI / 2;
    const rope = grp(-0.5, 0, 1.32, 0, cliff);
    cyl(0.03, 0.03, 6.4, 5, M.canvasRed, 0, 3.2, 0, rope);
    for (let i = 0; i < 6; i += 1) ball(0.06, M.canvasRed, 0, 0.8 + i * 1.0, 0.03, rope, 6, 5);
    tag(cliff, "cliff");
    bind((st, fl) => {
      rope.visible = !!fl.ropeClimbed;
    });
  }

  {
    // Telescope on a mount with the brass lens in its front collar.
    const lensSpot = hotspotById("lens");
    const scope = grp(lensSpot.x, 0, lensSpot.z);
    box(0.7, 0.2, 0.7, M.stoneDark, 0, 0.1, 0, scope);
    cyl(0.12, 0.2, 1.1, 8, M.metalDark, 0, 0.75, 0, scope);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.03, 0.03, 1.3, 5, M.metalDark, Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3, scope);
      leg.rotation.z = -Math.cos(a) * 0.3;
      leg.rotation.x = Math.sin(a) * 0.3;
    }
    const tubeG = grp(0, 1.4, 0, 0, scope);
    tubeG.rotation.x = -0.9;
    const tube = cyl(0.17, 0.2, 1.9, 12, M.brass, 0, 0, 0, tubeG);
    tube.rotation.x = Math.PI / 2;
    const collar = mesh(trackGeo(new THREE.TorusGeometry(0.19, 0.035, 6, 14)), M.metalDark, 0, 0, 0.97, tubeG);
    collar.castShadow = true;
    const lensRing = grp(0, 0, 1.0, 0, tubeG);
    const ring = mesh(trackGeo(new THREE.TorusGeometry(0.17, 0.03, 6, 14)), M.brass, 0, 0, 0, lensRing);
    ring.castShadow = true;
    mesh(trackGeo(new THREE.CircleGeometry(0.16, 14)), M.glass, 0, 0, 0, lensRing);
    tag(scope, "lens");
    bind((st, fl) => {
      lensRing.visible = !fl.lensFound;
    });

    // Star chart under glass on a table.
    const chartSpot = hotspotById("chart");
    const chartG = grp(chartSpot.x, 0, chartSpot.z);
    box(1.7, 0.08, 1.0, M.floorWood, 0, SCALE.table, 0, chartG);
    for (const sx of [-0.78, 0.78]) for (const sz of [-0.4, 0.4]) box(0.08, SCALE.table, 0.08, M.timberDark, sx, SCALE.table / 2, sz, chartG);
    const chartPlane = flat(1.4, 0.8, trackMat(new THREE.MeshBasicMaterial({ map: tex.chart() })), 0, SCALE.table + 0.05, 0, chartG);
    chartPlane.rotation.x = -Math.PI / 2;
    box(1.5, 0.05, 0.9, M.glass, 0, SCALE.table + 0.09, 0, chartG);
    const chartGlow = mesh(trackGeo(new THREE.RingGeometry(0.15, 0.2, 18)), trackMat(new THREE.MeshBasicMaterial({ color: "#ffe59a", transparent: true, opacity: 0.8, side: both })), 0.5, SCALE.table + 0.07, 0.15, chartG);
    chartGlow.rotation.x = -Math.PI / 2;
    const lampArm = cyl(0.015, 0.015, 0.5, 5, M.brass, -0.7, SCALE.table + 0.25, -0.4, chartG);
    lampArm.rotation.z = 0.3;
    tag(chartG, "chart");
    bind((st, fl) => {
      chartGlow.visible = !!fl.chartRead;
    });

    // Gear housing around an axle, with the loose gear aligned to it.
    const gbSpot = hotspotById("gearBox");
    const gb = grp(gbSpot.x, 0, gbSpot.z);
    const gy = 1.15;
    box(1.5, 0.12, 0.8, M.metalDark, 0, gy - 0.7, 0, gb);
    box(1.5, 0.12, 0.8, M.metalDark, 0, gy + 0.7, 0, gb);
    box(0.12, 1.4, 0.8, M.metalDark, -0.69, gy, 0, gb);
    box(0.12, 1.4, 0.8, M.metalDark, 0.69, gy, 0, gb);
    box(1.5, 1.4, 0.08, M.metal, 0, gy, 0.36, gb);
    box(0.5, 0.3, 0.5, M.stoneDark, 0, 0.15, 0, gb);
    cyl(0.4, 0.5, gy - 0.7, 8, M.stoneDark, 0, (gy - 0.7) / 2 + 0.1, 0, gb);
    const axleG = cyl(0.045, 0.045, 0.8, 8, M.axle, 0, gy, 0, gb);
    axleG.rotation.x = Math.PI / 2;
    const mate = gear(0.22, M.brass, 6);
    mate.position.set(-0.42, gy - 0.43, -0.08);
    mate.userData.spin = 1.0;
    gb.add(mate);
    spinners.push(mate);
    const meshed = gear(0.38, M.brass, 10);
    meshed.position.set(0, gy, -0.08);
    meshed.userData.spin = -0.6;
    gb.add(meshed);
    spinners.push(meshed);
    tag(gb, "gearBox");
    bind((st, fl) => {
      meshed.visible = !!fl.gearMeshed;
    });

    // Star wheel console with three digit dials.
    const swSpot = hotspotById("starWheel");
    const sw = grp(swSpot.x, 0, swSpot.z);
    box(1.4, 1.0, 0.5, M.stoneDark, 0, 0.5, 0.1, sw);
    box(1.5, 0.12, 0.6, M.metalDark, 0, 1.02, 0.1, sw);
    const dialBack = box(1.3, 0.55, 0.12, M.metalDark, 0, 1.35, 0.25, sw);
    dialBack.castShadow = true;
    const digitFaces = [];
    const faceMats = [];
    for (let i = 0; i < 3; i += 1) {
      const dx = -0.42 + i * 0.42;
      const wheel = cyl(0.2, 0.2, 0.16, 16, M.brass, dx, 1.35, 0.1, sw);
      wheel.rotation.x = Math.PI / 2;
      const faceMat = trackMat(new THREE.MeshStandardMaterial({ map: tex.digit("0"), emissive: "#ffd36a", emissiveIntensity: 0, roughness: 0.5 }));
      const face = mesh(trackGeo(new THREE.CircleGeometry(0.17, 18)), faceMat, dx, 1.35, 0.01, sw);
      face.rotation.y = Math.PI;
      digitFaces.push(face);
      faceMats.push(faceMat);
    }
    tag(sw, "starWheel");
    bind((st, fl) => {
      const digits = fl.starAligned ? ["7", "2", "9"] : ["0", "0", "0"];
      digitFaces.forEach((face, i) => {
        const wanted = tex.digit(digits[i]);
        if (faceMats[i].map !== wanted) {
          faceMats[i].map = wanted;
          faceMats[i].needsUpdate = true;
        }
        faceMats[i].emissiveIntensity = fl.starAligned ? 0.5 : 0;
      });
    });

    // Dome latch winch.
    const latchSpot = hotspotById("domeLatch");
    const latch = grp(latchSpot.x, 0, latchSpot.z);
    box(0.5, 0.18, 0.5, M.stoneDark, 0, 0.09, 0, latch);
    box(0.24, 1.2, 0.24, M.metalDark, 0, 0.78, 0, latch);
    box(0.4, 0.3, 0.3, M.metal, 0, 1.3, 0, latch);
    const lever = grp(0, 1.3, 0.18, 0, latch);
    cyl(0.03, 0.03, 0.9, 6, M.metal, 0, -0.35, 0, lever);
    ball(0.08, M.red, 0, -0.82, 0, lever, 8, 6);
    const bar = box(0.7, 0.07, 0.1, M.metal, 0, 0.55, 0.18, latch);
    tag(latch, "domeLatch");
    bind((st, fl, dt) => {
      lerpers.latch = approach(lerpers.latch ?? 0, fl.domeOpened ? 1 : 0, dt, 3);
      lever.rotation.x = -0.4 + lerpers.latch * 1.4;
      bar.position.x = lerpers.latch * 0.25;
    });

    // Summit beacon housing; lens + beam appear when lit.
    const beaconSpot = hotspotById("beacon");
    const beacon = grp(beaconSpot.x, 0, beaconSpot.z);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const leg = cyl(0.05, 0.05, 1.7, 6, M.metalDark, Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5, beacon);
      leg.rotation.z = -Math.cos(a) * 0.25;
      leg.rotation.x = Math.sin(a) * 0.25;
    }
    cyl(0.7, 0.55, 0.8, 10, M.metalDark, 0, 1.75, 0, beacon);
    const socket = mesh(trackGeo(new THREE.TorusGeometry(0.42, 0.06, 6, 16)), M.brass, 0, 2.2, 0, beacon);
    socket.rotation.x = Math.PI / 2;
    const beaconLens = ball(0.4, M.glass, 0, 2.2, 0, beacon, 14, 8);
    beaconLens.scale.y = 0.4;
    const core = ball(0.3, trackMat(new THREE.MeshBasicMaterial({ color: "#f4fbff" })), 0, 2.25, 0, beacon, 10, 8);
    const beamGeo = trackGeo(new THREE.CylinderGeometry(1.4, 0.18, 22, 10, 1, true));
    beamGeo.translate(0, 11, 0);
    const beam = mesh(beamGeo, trackMat(new THREE.MeshBasicMaterial({ color: "#e4f2ff", transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: both, fog: false })), beaconSpot.x, 2.3, beaconSpot.z, scene);
    const dir = new THREE.Vector3(108 - beaconSpot.x, 18, 82 - beaconSpot.z).normalize();
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    tag(beacon, "beacon");
    bind((st, fl, dt, now) => {
      const lit = !!fl.beaconLit;
      beaconLens.visible = lit;
      core.visible = lit;
      beam.visible = lit;
      lights.beacon.intensity = lit ? 120 + Math.sin(now * 3) * 10 : 0;
    });
  }

  // Signal mast + locker inside the cave station.
  {
    const mastSpot = hotspotById("signalTower");
    const mast = grp(mastSpot.x, 0, mastSpot.z);
    box(1.0, 0.3, 1.0, M.stoneDark, 0, 0.15, 0, mast);
    cyl(0.12, 0.16, 6.2, 8, M.metalDark, 0, 3.1, 0, mast);
    for (const y of [1.6, 3.4, 5.0]) box(1.1, 0.06, 0.06, M.metal, 0, y, 0, mast);
    const dish = mesh(trackGeo(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), M.metal, 0, 5.4, 0.35, mast);
    dish.rotation.x = Math.PI / 2;
    dish.material = M.metal;
    const tubeSocket = cyl(0.1, 0.1, 0.5, 8, M.metalDark, 0.3, 1.2, 0.18, mast);
    tubeSocket.rotation.z = -0.5;
    const flareTube = cyl(0.06, 0.06, 0.6, 8, M.red, 0.34, 1.35, 0.18, mast);
    flareTube.rotation.z = -0.5;
    tag(mast, "signalTower");
    const flare = grp(mastSpot.x, 0, mastSpot.z);
    const flareBall = ball(0.5, M.flareGlow, 0, 10.5, 0, flare, 10, 8);
    const flareTrail = mesh(trackGeo(new THREE.CylinderGeometry(0.3, 0.05, 6, 8, 1, true)), M.flareGlow, 0, 7.4, 0, flare);
    bind((st, fl, dt, now) => {
      flareTube.visible = !fl.signalSent;
      flare.visible = !!fl.signalSent;
      flareBall.scale.setScalar(1 + Math.sin(now * 6) * 0.15);
      flareTrail.scale.y = 1 + Math.sin(now * 5) * 0.08;
    });
    const cave = byId.caveStation;
    const locker = grp(cave.maxX - 1.1, 0, 69.8);
    box(1.0, 2.1, 0.6, M.metalDark, 0, 1.05, 0, locker);
    const lockerDoor = grp(-0.5, 0, 0.32, 0, locker);
    box(0.96, 2.0, 0.04, M.metal, 0.48, 1.05, 0, lockerDoor);
    bind((st, fl, dt) => {
      lerpers.locker = approach(lerpers.locker ?? 0, fl.signalSent ? 1 : 0, dt, 3);
      lockerDoor.rotation.y = -lerpers.locker * 1.5;
    });
    for (const [x, z, s] of [[cave.minX + 2.6, 82.5, 1.1], [cave.minX + 3.9, 83, 0.8]]) box(s, s, s, M.timber, x, s / 2, z);
  }

  // ---------------------------------------------------------------- trees (solids) + scattered jungle
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.2, 0.3, 1, 7));
  trunkGeo.translate(0, 0.5, 0);
  const canopyGeo = trackGeo(new THREE.IcosahedronGeometry(1, 1));
  const bushGeo = trackGeo(new THREE.IcosahedronGeometry(1, 0));
  const rockGeo2 = trackGeo(new THREE.DodecahedronGeometry(1, 0));

  for (const tree of SOLIDS.filter((s) => s.id.startsWith("tree"))) {
    const g = grp(tree.x, 0, tree.z);
    const trunk = mesh(trunkGeo, M.timberDark, 0, 0, 0, g);
    trunk.scale.set(1.1, 5.4, 1.1);
    trunk.castShadow = true;
    for (const [ox, oy, oz, r] of [[0, 5.6, 0, 2.5], [1.3, 4.9, 0.6, 1.8], [-1.2, 5.0, -0.7, 1.9], [0.3, 6.6, -0.3, 1.7]]) {
      const canopy = mesh(canopyGeo, M.leaves, ox, oy, oz, g);
      canopy.scale.set(r, r * 0.8, r);
      canopy.castShadow = true;
    }
  }

  const exclusions = [
    { x: 8, z: -98, rx: 30, rz: 16 },
    { x: -98, z: 0, rx: 20, rz: 35 },
    { x: 0, z: 98, rx: 25, rz: 22 },
    { x: 111, z: 78, rx: 28, rz: 24 },
    { x: 88, z: 66, rx: 9, rz: 5 },
  ];
  function onWater(x, z, margin) {
    for (const c of [RIVER, GORGE]) {
      const along = ((x - c.cx) + (z - c.cz)) * DIAG;
      const perp = Math.abs((x - z) - (c.cx - c.cz)) * DIAG;
      if (Math.abs(along) < c.half + margin && perp < c.width / 2 + margin) return true;
    }
    return false;
  }
  function openGround(x, z, margin) {
    if (distToTrails(x, z) < 1.6 + margin) return false;
    if (onWater(x, z, margin + 1)) return false;
    for (const e of exclusions) {
      const dx = (x - e.x) / (e.rx + margin);
      const dz = (z - e.z) / (e.rz + margin);
      if (dx * dx + dz * dz < 1) return false;
    }
    for (const b of BUILDINGS) {
      if (x > b.minX - margin - 2 && x < b.maxX + margin + 2 && z > b.minZ - margin - 2 && z < b.maxZ + margin + 2) return false;
    }
    for (const p of PARTITIONS) {
      if (x > p.minX - margin - 8 && x < p.maxX + margin + 8 && Math.abs(z - p.z) < margin + 6) return false;
    }
    for (const spot of HOTSPOTS) if (Math.hypot(x - spot.x, z - spot.z) < spot.r + margin + 0.6) return false;
    for (const solid of SOLIDS) if (Math.hypot(x - solid.x, z - solid.z) < solid.r + margin) return false;
    return true;
  }

  {
    const spots = [];
    let tries = 0;
    while (spots.length < 230 && tries < 9000) {
      tries += 1;
      const x = (rng() * 2 - 1) * 137;
      const z = (rng() * 2 - 1) * 137;
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (rng() > (edge > 118 ? 0.95 : 0.22)) continue;
      if (!openGround(x, z, 3.2)) continue;
      spots.push([x, z]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, M.timberDark, spots.length);
    const canopyA = new THREE.InstancedMesh(canopyGeo, M.leaves, spots.length);
    const canopyB = new THREE.InstancedMesh(canopyGeo, M.leaves, spots.length);
    spots.forEach(([x, z], i) => {
      const height = 5 + rng() * 4;
      const r = 1.9 + rng() * 1.3;
      dummy.rotation.set(0, rng() * 6, 0);
      dummy.position.set(x, 0, z);
      dummy.scale.set(0.8 + rng() * 0.6, height, 0.8 + rng() * 0.6);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + (rng() - 0.5), height * 0.95, z + (rng() - 0.5));
      dummy.scale.set(r, r * 0.8, r);
      dummy.updateMatrix();
      canopyA.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + (rng() - 0.5) * 2, height * 0.78, z + (rng() - 0.5) * 2);
      dummy.scale.set(r * 0.75, r * 0.6, r * 0.75);
      dummy.updateMatrix();
      canopyB.setMatrixAt(i, dummy.matrix);
    });
    for (const inst of [trunks, canopyA, canopyB]) {
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }

    const bushSpots = [];
    tries = 0;
    while (bushSpots.length < 170 && tries < 6000) {
      tries += 1;
      const x = (rng() * 2 - 1) * 137;
      const z = (rng() * 2 - 1) * 137;
      if (!openGround(x, z, 1.6)) continue;
      bushSpots.push([x, z]);
    }
    const bushes = new THREE.InstancedMesh(bushGeo, M.leaves, bushSpots.length);
    bushSpots.forEach(([x, z], i) => {
      const s = 0.6 + rng() * 0.9;
      dummy.rotation.set(rng() * 3, rng() * 6, rng() * 3);
      dummy.position.set(x, s * 0.35, z);
      dummy.scale.set(s * 1.2, s * 0.8, s * 1.2);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
    });
    bushes.castShadow = true;
    bushes.instanceMatrix.needsUpdate = true;
    scene.add(bushes);

    // Rocks: gorge rims, river banks and a few scattered boulders.
    const rockSpots = [];
    for (let t = -28; t <= 28; t += 2.8) {
      if (Math.abs(t) < 5.5) continue;
      for (const side of [-1, 1]) {
        const off = side * (GORGE.width / 2 + 0.6 + rng() * 0.6);
        rockSpots.push([GORGE.cx + DIAG * t + DIAG * off, GORGE.cz + DIAG * t - DIAG * off, 0.5 + rng() * 0.6]);
      }
    }
    for (let t = -50; t <= 50; t += 4.2) {
      const off = (rng() < 0.5 ? -1 : 1) * (RIVER.width / 2 + 0.4 + rng() * 0.8);
      const px = RIVER.cx + DIAG * t + DIAG * off;
      const pz = RIVER.cz + DIAG * t - DIAG * off;
      if (Math.hypot(px + 32, pz + 72) < 5) continue;
      rockSpots.push([px, pz, 0.3 + rng() * 0.5]);
    }
    tries = 0;
    while (rockSpots.length < 110 && tries < 3000) {
      tries += 1;
      const x = (rng() * 2 - 1) * 137;
      const z = (rng() * 2 - 1) * 137;
      if (!openGround(x, z, 1.2)) continue;
      rockSpots.push([x, z, 0.4 + rng() * 0.9]);
    }
    const rocks = new THREE.InstancedMesh(rockGeo2, M.rock, rockSpots.length);
    rockSpots.forEach(([x, z, s], i) => {
      dummy.rotation.set(rng() * 3, rng() * 6, rng() * 3);
      dummy.position.set(x, s * 0.3, z);
      dummy.scale.set(s * 1.3, s * 0.8, s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    scene.add(rocks);
  }

  // ---------------------------------------------------------------- click cylinders on hotspots
  const clickMat = trackMat(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  for (const spot of HOTSPOTS) {
    const radius = Math.max(0.8, Math.min(spot.r * 0.55, 1.1));
    const click = mesh(trackGeo(new THREE.CylinderGeometry(radius, radius, 2.2, 8)), clickMat, spot.x, 1.15, spot.z, scene);
    tag(click, spot.id);
  }

  // ---------------------------------------------------------------- characters
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
  let alive = true;
  const start = getState().pose || { x: 0, z: -100, yaw: 0, camYaw: Math.PI, camPitch: 0.42, camDist: 4.8 };
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
    for (const id of Object.keys(NPC_SPOTS)) npcs[id] = makeActor(WALKER_LOOKS[id] || WALKER_LOOKS.porter);
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

  let walkTx = null;
  let walkTz = null;

  function setWalkTarget(x, z) {
    walkTx = x;
    walkTz = z;
  }

  function clearWalkTarget() {
    walkTx = null;
    walkTz = null;
  }

  // ---------------------------------------------------------------- per-frame update
  function update(dt, input) {
    const state = getState();
    const flags = state?.flags || {};
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
        clearWalkTarget();
        mx /= len;
        mz /= len;
      } else if (walkTx != null && walkTz != null) {
        const dx = walkTx - px;
        const dz = walkTz - pz;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4) {
          clearWalkTarget();
        } else {
          mx = dx / dist;
          mz = dz / dist;
        }
      }
      if (Math.hypot(mx, mz) > 0) {
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
          } else {
            clearWalkTarget();
            break;
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

    const now = performance.now() / 1000;

    // Door leaves of locked buildings and partitions follow their open() flags.
    for (const entry of leaves) entry.obj.visible = !entry.building.open?.(state);
    for (const entry of partLeaves) entry.obj.visible = !entry.part.open?.(state);
    for (const fn of binds) fn(state || {}, flags, dt, now);

    // Observatory dome halves slide apart when the dome opens.
    lerpers.dome = approach(lerpers.dome ?? 0, flags.domeOpened ? 1 : 0, dt, 2);
    if (dome.left && dome.right) {
      dome.left.position.z = dome.left.userData.baseZ + lerpers.dome * 1.8;
      dome.right.position.z = dome.right.userData.baseZ - lerpers.dome * 1.8;
    }

    // Water scroll and animated gears.
    tex.maps.water.map.offset.x = (tex.maps.water.map.offset.x + dt * 0.012) % 1;
    tex.maps.water.map.offset.y = (tex.maps.water.map.offset.y + dt * 0.004) % 1;
    if (waterNormal) {
      waterNormal.offset.x = (waterNormal.offset.x + dt * 0.02) % 1;
    }
    for (const item of spinners) item.rotation.z += dt * (item.userData.spin || 0.4);

    // Mist, smoke and exhaust puffs.
    for (const puff of puffs) {
      const d = puff.userData;
      if (d.kind === "mist") {
        puff.position.set(d.ox + Math.sin(now * 0.3 + d.phase) * 1.6, d.base + Math.sin(now * 0.6 + d.phase) * 0.15, d.oz + Math.cos(now * 0.25 + d.phase) * 1.2);
      } else if (d.kind === "smoke") {
        const t = (now * 0.5 + d.phase) % 2.8;
        puff.position.set(d.x + Math.sin(t * 2) * 0.15, 1.3 + t * 0.9, d.z + t * 0.1);
        puff.scale.setScalar(0.6 + t * 0.5);
      } else if (d.kind === "exhaust") {
        puff.visible = !!flags.jeepStarted;
        const t = (now * 0.8 + d.phase) % 2;
        puff.position.set(20.1 - t * 0.5, 0.5 + t * 0.35, -104.4 + Math.sin(t * 3) * 0.1);
        puff.scale.setScalar(0.5 + t * 0.6);
      }
    }

    // Camera with building-shell occlusion.
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
    sky.position.copy(camera.position);
    sun.position.set(px + 22, 40, pz + 12);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
    return { moving };
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function setPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return true;
  }

  function pick(clientX, clientY) {
    if (!setPointer(clientX, clientY)) return null;
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

  function pickGround(clientX, clientY) {
    if (!setPointer(clientX, clientY)) return null;
    const hits = raycaster.intersectObject(ground, false);
    if (!hits.length) return null;
    const point = hits[0].point;
    return { x: point.x, z: point.z };
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
    pickGround,
    setWalkTarget,
    clearWalkTarget,
    resize,
    destroy,
    getPose: () => ({ x: px, z: pz, yaw, camYaw, camPitch, camDist }),
  };
}
