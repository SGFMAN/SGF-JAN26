import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { HOTSPOTS, SOLIDS, canMove, terrainHeight } from "./logic.js";
import { bakeIslandGround, createIslandTextures } from "./textures.js";

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
  hero: { shirt: "#3c7dff", pants: "#243044", shoes: "#f4f4f4", hair: "#161616", skin: "#f0c2a4" },
  pete: { shirt: "#f0c43a", pants: "#5c3a22", shoes: "#2c2420", hair: "#e6c36a", skin: "#c47a45" },
  lin: { shirt: "#7d9a4a", pants: "#3e4650", shoes: "#6d4a2e", hair: "#d5d7dc", skin: "#a86b45" },
  mara: { shirt: "#9d2d3a", pants: "#1a1c22", shoes: "#111111", hair: "#5a331c", skin: "#f6d0b8" },
};

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvasFromTexture(texture) {
  const image = texture?.image;
  if (!image?.width || !image?.height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return { canvas, ctx };
}

function textureFromCanvas(canvas, texture) {
  const next = new THREE.CanvasTexture(canvas);
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

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function mesh(geometry, material, x, y, z, parent) {
  const obj = new THREE.Mesh(geometry, material);
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}

export function mountIsland(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor("#8ec6ea");
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#c5dff6", 42, 118);
  scene.background = new THREE.Color("#8ec8ee");

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 180);
  camera.layers.enable(1);
  scene.add(new THREE.HemisphereLight("#e7f3ff", "#6d8f52", 0.95));
  const sun = new THREE.DirectionalLight("#fff1d2", 1.35);
  sun.position.set(28, 42, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const geometries = [];
  const materials = [];
  const trackGeo = (geometry) => {
    geometries.push(geometry);
    return geometry;
  };
  const trackMat = (material) => {
    materials.push(material);
    return material;
  };

  const tex = createIslandTextures(renderer.capabilities.getMaxAnisotropy());
  const groundTex = bakeIslandGround(terrainHeight, renderer.capabilities.getMaxAnisotropy());
  const sky = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(180, 64, 40)),
    trackMat(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.48, 0.78, 0.28).normalize() } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 sunDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p = p * 2.03 + 1.7;
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 horizon = vec3(0.80, 0.89, 0.97);
          vec3 mid = vec3(0.45, 0.70, 0.94);
          vec3 zenith = vec3(0.18, 0.42, 0.82);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, zenith, smoothstep(0.15, 0.8, h));
          vec2 cuv = dir.xz / max(dir.y, 0.12);
          float puff = smoothstep(0.54, 0.76, fbm(cuv * 0.38));
          col = mix(col, vec3(0.98, 0.99, 1.0), puff * smoothstep(0.02, 0.22, dir.y) * 0.92);
          float sun = pow(max(dot(dir, sunDir), 0.0), 480.0);
          float glow = pow(max(dot(dir, sunDir), 0.0), 7.0);
          col += vec3(1.0, 0.95, 0.82) * sun;
          col += vec3(1.0, 0.78, 0.48) * glow * 0.16;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }))
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const seg = 100;
  const span = 108;
  const groundGeo = trackGeo(new THREE.PlaneGeometry(span, span, seg, seg));
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, Math.max(terrainHeight(x, z), -1.35));
  }
  groundGeo.computeVertexNormals();
  const uvs = groundGeo.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    uvs.setXY(i, pos.getX(i) / span + 0.5, pos.getZ(i) / span + 0.5);
  }
  const ground = new THREE.Mesh(groundGeo, trackMat(new THREE.MeshStandardMaterial({
    map: groundTex.map,
    normalMap: groundTex.normal,
    roughness: 1,
    metalness: 0,
  })));
  ground.receiveShadow = true;
  scene.add(ground);

  tex.water.map.repeat.set(18, 18);
  tex.water.normal.repeat.set(18, 18);
  const ocean = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(78, 48)),
    trackMat(new THREE.MeshStandardMaterial({
      map: tex.water.map,
      normalMap: tex.water.normal,
      roughness: 0.22,
      metalness: 0.04,
      color: "#d7f3f8",
    }))
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.42;
  scene.add(ocean);

  function surface(maps, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      map: maps.map,
      normalMap: maps.normal,
      roughness: opts.roughness ?? 0.92,
      metalness: opts.metalness ?? 0,
      color: opts.color || "#ffffff",
    });
    if (opts.scale) mat.normalScale.set(opts.scale, opts.scale);
    return trackMat(mat);
  }

  tex.bark.map.repeat.set(1, 2);
  tex.bark.normal.repeat.set(1, 2);
  tex.stone.map.repeat.set(2, 4);
  tex.stone.normal.repeat.set(2, 4);
  const barkMat = surface(tex.bark, { roughness: 0.96, scale: 1.15 });
  const leafMat = surface(tex.leaf, { roughness: 1, scale: 0.6 });
  const leafDeep = surface(tex.leaf, { roughness: 1, scale: 0.6, color: "#c5d2b4" });
  const rockMat = surface(tex.rock, { roughness: 0.97, scale: 1.35 });
  const woodMat = surface(tex.wood, { roughness: 0.86, scale: 0.8 });
  const wreckWood = surface(tex.wood, { roughness: 0.9, scale: 0.8, color: "#d2b48a" });
  const thatchMat = surface(tex.thatch, { roughness: 1, scale: 0.9 });
  const stoneMat = surface(tex.stone, { roughness: 0.94, scale: 1.1 });
  const metalMat = surface(tex.metal, { roughness: 0.42, metalness: 0.55, scale: 0.7 });
  const redMat = trackMat(lambert("#b4333a"));
  const goldMat = trackMat(lambert("#e1b03a"));
  const pickables = [];

  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.3, 0.48, 3.5, 7));
  const crownGeo = trackGeo(new THREE.IcosahedronGeometry(2.3, 2));
  {
    const attr = crownGeo.attributes.position;
    for (let i = 0; i < attr.count; i += 1) {
      const x = attr.getX(i);
      const y = attr.getY(i);
      const z = attr.getZ(i);
      const n = 0.8 + 0.24 * Math.abs(Math.sin(x * 3.3 + z * 2.4) * Math.cos(y * 3.8));
      attr.setXYZ(i, x * n, y * n * 0.7 + 0.12, z * n);
    }
    crownGeo.computeVertexNormals();
  }
  const rockGeo = trackGeo(new THREE.IcosahedronGeometry(0.86, 1));
  {
    const attr = rockGeo.attributes.position;
    for (let i = 0; i < attr.count; i += 1) {
      const x = attr.getX(i);
      const y = attr.getY(i);
      const z = attr.getZ(i);
      const n = 0.74 + 0.32 * Math.abs(Math.sin(x * 4.8 + 0.7) * Math.cos(z * 4.2 + y));
      attr.setXYZ(i, x * n, y * n * 0.62, z * n);
    }
    rockGeo.computeVertexNormals();
  }
  const hutGeo = trackGeo(new THREE.BoxGeometry(4.4, 3, 4.4));
  const hutRoof = trackGeo(new THREE.ConeGeometry(3, 1.7, 4));

  function put(solid) {
    const y = terrainHeight(solid.x, solid.z);
    if (solid.kind === "tree") {
      const trunk = mesh(trunkGeo, barkMat, solid.x, y + 1.75, solid.z, scene);
      const lean = 0.85 + (solid.shade || 0.4) * 0.4;
      trunk.scale.set(lean, 0.85 + (solid.shade || 0.3) * 0.4, lean);
      trunk.castShadow = true;
      const crown = mesh(crownGeo, (solid.shade || 0) > 0.5 ? leafMat : leafDeep, solid.x, y + 4.3, solid.z, scene);
      crown.rotation.y = (solid.shade || 0) * 6.2;
      crown.scale.setScalar(0.82 + (solid.shade || 0.4) * 0.45);
      crown.castShadow = true;
      return;
    }
    if (solid.kind === "rock") {
      const stone = mesh(rockGeo, rockMat, solid.x, y + 0.28, solid.z, scene);
      const shade = solid.shade || 0.5;
      stone.rotation.set(shade, shade * 4.1, shade * 0.4);
      stone.scale.set(0.75 + shade * 0.7, 0.5 + shade * 0.35, 0.7 + (1 - shade) * 0.55);
      stone.castShadow = true;
      stone.receiveShadow = true;
      return;
    }
    if (solid.kind === "hut") {
      const walls = mesh(hutGeo, woodMat, solid.x, y + 1.5, solid.z, scene);
      walls.castShadow = true;
      walls.receiveShadow = true;
      const roof = mesh(hutRoof, thatchMat, solid.x, y + 3.85, solid.z, scene);
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      return;
    }
    if (solid.kind === "shed") {
      const walls = mesh(trackGeo(new THREE.BoxGeometry(4.8, 3.4, 4.4)), woodMat, solid.x, y + 1.7, solid.z, scene);
      const roof = mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.24, 4.8)), metalMat, solid.x, y + 3.52, solid.z, scene);
      walls.castShadow = true;
      walls.receiveShadow = true;
      roof.castShadow = true;
      walls.userData.hotspot = "generator";
      roof.userData.hotspot = "generator";
      pickables.push(walls, roof);
      return;
    }
    if (solid.kind === "wreck") {
      const hull = mesh(trackGeo(new THREE.BoxGeometry(4.4, 1.3, 1.6)), wreckWood, solid.x, y + 0.55, solid.z, scene);
      hull.rotation.z = 0.25;
      hull.rotation.y = 0.4;
      hull.castShadow = true;
      mesh(trackGeo(new THREE.BoxGeometry(0.12, 1.8, 0.12)), wreckWood, solid.x + 0.4, y + 1.6, solid.z, scene);
      return;
    }
    if (solid.kind === "tower") {
      const shaft = mesh(trackGeo(new THREE.CylinderGeometry(2.3, 2.9, 10.4, 8)), stoneMat, solid.x, y + 5.2, solid.z, scene);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      mesh(trackGeo(new THREE.CylinderGeometry(3, 3, 0.56, 8)), redMat, solid.x, y + 10.6, solid.z, scene);
      const lamp = mesh(trackGeo(new THREE.SphereGeometry(0.55, 8, 8)), trackMat(new THREE.MeshLambertMaterial({ color: "#ffe7a3", emissive: "#ffd56a", emissiveIntensity: 0.8 })), solid.x, y + 11.35, solid.z, scene);
      lamp.name = "lamp";
    }
  }
  for (const solid of SOLIDS) put(solid);

  function prop(id, geometry, material, x, z, lift) {
    const y = terrainHeight(x, z) + lift;
    const obj = mesh(geometry, material, x, y, z, scene);
    obj.userData.baseLift = lift;
    obj.name = id;
    return obj;
  }

  function tag(obj, id) {
    obj.userData.hotspot = id;
    pickables.push(obj);
  }

  const coconut = prop("coconut", trackGeo(new THREE.SphereGeometry(0.22, 8, 8)), trackMat(lambert("#6b4423")), -9, -28, 1.15);
  tag(coconut, "palm");
  tag(prop("satchel", trackGeo(new THREE.BoxGeometry(0.46, 0.28, 0.34)), trackMat(lambert("#6e4b32")), 2, -31, 0.16), "satchel");
  tag(prop("bottle", trackGeo(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 6)), trackMat(lambert("#b7d8c8")), 7, -27, 0.16), "bottle");
  const signPost = prop("sign", trackGeo(new THREE.BoxGeometry(0.9, 0.7, 0.08)), trackMat(lambert("#f3efe2")), -15, -26, 1.15);
  tag(signPost, "sign");
  tag(mesh(trackGeo(new THREE.BoxGeometry(0.08, 1.2, 0.08)), woodMat, -15, terrainHeight(-15, -26) + 0.6, -26, scene), "sign");
  const parrot = trackMat(lambert("#2a9d4a"));
  for (let i = 0; i < 3; i += 1) {
    mesh(trackGeo(new THREE.SphereGeometry(0.08, 6, 6)), parrot, -15.25 + i * 0.25, terrainHeight(-15, -26) + 1.2, -26.06, scene);
  }
  tag(prop("basher", trackGeo(new THREE.CylinderGeometry(0.55, 0.6, 0.22, 7)), rockMat, -18, -18, 0.12), "basher");
  tag(prop("ring", trackGeo(new THREE.TorusGeometry(0.32, 0.07, 6, 12)), redMat, -24, -20, 0.2), "lifering");
  tag(prop("locker", trackGeo(new THREE.BoxGeometry(0.7, 0.9, 0.4)), metalMat, -28, -14, 0.48), "locker");
  tag(prop("hammockA", trackGeo(new THREE.BoxGeometry(1.4, 0.08, 0.45)), trackMat(lambert("#d4554a")), -20, -6, 0.7), "hammock");
  const wellY = terrainHeight(0, 1);
  tag(mesh(trackGeo(new THREE.CylinderGeometry(0.72, 0.78, 0.7, 10)), rockMat, 0, wellY + 0.35, 1, scene), "well");
  tag(mesh(trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 10)), trackMat(lambert("#1d4c66")), 0, wellY + 0.4, 1, scene), "well");
  const disc = mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10)), goldMat, 0, wellY + 0.2, 1, scene);
  tag(disc, "well");
  tag(prop("post", trackGeo(new THREE.BoxGeometry(0.46, 0.7, 0.46)), redMat, 9, -1, 0.4), "postbox");
  const hotelX = -2;
  const hotelWallZ = 12 - 2.2;
  const plaque = mesh(
    trackGeo(new THREE.BoxGeometry(0.7, 0.4, 0.06)),
    trackMat(lambert("#d9d2c3")),
    hotelX,
    terrainHeight(hotelX, hotelWallZ) + 1.6,
    hotelWallZ - 0.04,
    scene
  );
  tag(plaque, "plaque");
  const dial = prop("dial", trackGeo(new THREE.CylinderGeometry(0.42, 0.48, 0.9, 8)), rockMat, 19, 0, 0.45);
  tag(dial, "dial");
  const door = mesh(trackGeo(new THREE.BoxGeometry(0.45, 2.4, 2.3)), stoneMat, 23.1, terrainHeight(20.6, 0) + 1.2, 0, scene);
  const caveMat = rockMat.clone();
  caveMat.map = rockMat.map.clone();
  caveMat.normalMap = rockMat.normalMap.clone();
  caveMat.map.repeat.set(2.4, 1.4);
  caveMat.normalMap.repeat.set(2.4, 1.4);
  trackMat(caveMat);
  const caveFloor = terrainHeight(23, 0);
  const caveH = 5.2;
  const caveY = caveFloor + caveH / 2 - 0.35;
  const caveBlock = (w, h, d, x, y, z) => {
    const block = mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), caveMat, x, y, z, scene);
    block.castShadow = true;
    block.receiveShadow = true;
    return block;
  };
  caveBlock(3.1, caveH, 4.3, 23.15, caveY, -3.35);
  caveBlock(3.1, caveH, 4.3, 23.15, caveY, 3.35);
  caveBlock(3.1, caveH - 2.4, 2.5, 23.15, caveFloor + 2.4 + (caveH - 2.4) / 2, 0);
  caveBlock(18, caveH, 2.55, 30.6, caveY, 5.425);
  caveBlock(18, caveH, 2.55, 30.6, caveY, -5.425);
  caveBlock(2.9, caveH, 13.4, 38.75, caveY, 0);
  caveBlock(19.2, 0.7, 13.6, 30.7, caveFloor + caveH + 0.15, 0);
  const caveDark = caveMat.clone();
  caveDark.side = THREE.DoubleSide;
  trackMat(caveDark);
  const shell = (w, h, x, y, z) => {
    const panel = mesh(trackGeo(new THREE.PlaneGeometry(w, h)), caveDark, x, y, z, scene);
    panel.layers.set(1);
    return panel;
  };
  const caveX0 = 24.85;
  const caveX1 = 37.16;
  const caveZ0 = -4.02;
  const caveZ1 = 4.02;
  const caveY0 = caveFloor + 0.06;
  const caveY1 = caveFloor + 4.94;
  const caveMidX = (caveX0 + caveX1) / 2;
  const caveMidY = (caveY0 + caveY1) / 2;
  const caveSpanX = caveX1 - caveX0;
  const caveSpanZ = caveZ1 - caveZ0;
  const caveSpanY = caveY1 - caveY0;
  const caveFloorPanel = shell(caveSpanX, caveSpanZ, caveMidX, caveY0, 0);
  caveFloorPanel.rotation.x = -Math.PI / 2;
  const caveCeil = shell(caveSpanX, caveSpanZ, caveMidX, caveY1, 0);
  caveCeil.rotation.x = Math.PI / 2;
  const caveNorth = shell(caveSpanX + 0.3, caveSpanY, caveMidX, caveMidY, caveZ1);
  caveNorth.rotation.y = Math.PI;
  const caveSouth = shell(caveSpanX + 0.3, caveSpanY, caveMidX, caveMidY, caveZ0);
  const caveEast = shell(caveSpanZ + 0.3, caveSpanY, caveX1, caveMidY, 0);
  caveEast.rotation.y = -Math.PI / 2;
  const cavePierSouth = shell(2.9, caveSpanY, caveX0, caveMidY, -2.66);
  cavePierSouth.rotation.y = Math.PI / 2;
  const cavePierNorth = shell(2.9, caveSpanY, caveX0, caveMidY, 2.66);
  cavePierNorth.rotation.y = Math.PI / 2;
  const lintelY0 = caveFloor + 2.42;
  const caveLintel = shell(2.6, caveY1 - lintelY0, caveX0, (caveY1 + lintelY0) / 2, 0);
  caveLintel.rotation.y = Math.PI / 2;
  const caveAmbient = new THREE.AmbientLight("#14110e", 0.04);
  caveAmbient.layers.set(1);
  scene.add(caveAmbient);
  const doorSpill = new THREE.PointLight("#c9d7e6", 0.85, 6.2, 2);
  doorSpill.position.set(25.15, caveFloor + 1.55, 0);
  doorSpill.layers.set(1);
  scene.add(doorSpill);
  const torchLight = new THREE.PointLight("#ffb15a", 0, 12, 2);
  torchLight.layers.set(1);
  scene.add(torchLight);
  const muralLight = new THREE.SpotLight("#ffc98a", 0, 16, Math.PI / 5, 0.5, 1);
  muralLight.layers.set(1);
  scene.add(muralLight);
  scene.add(muralLight.target);
  const torchX = 30;
  const torchY = caveFloor + 1.65;
  const torchMount = mesh(trackGeo(new THREE.BoxGeometry(0.22, 0.36, 0.08)), metalMat, torchX, torchY, 3.9, scene);
  torchMount.layers.set(1);
  tag(torchMount, "torch");
  const torchStick = mesh(trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.48, 6)), woodMat, torchX, torchY, 3.62, scene);
  torchStick.rotation.x = Math.PI / 2;
  torchStick.layers.set(1);
  tag(torchStick, "torch");
  const flameMat = trackMat(new THREE.MeshLambertMaterial({ color: "#ffb347", emissive: "#ff7a18", emissiveIntensity: 0.55 }));
  const flame = mesh(trackGeo(new THREE.SphereGeometry(0.14, 8, 8)), flameMat, torchX, torchY + 0.04, 3.32, scene);
  flame.layers.set(1);
  tag(flame, "torch");
  torchLight.position.set(torchX, torchY + 0.05, 3.32);
  muralLight.position.copy(torchLight.position);
  muralLight.target.position.set(37.05, caveFloor + 1.7, 0);
  const muralCanvas = document.createElement("canvas");
  muralCanvas.width = 512;
  muralCanvas.height = 340;
  const muralPaint = muralCanvas.getContext("2d");
  muralPaint.fillStyle = "#cbb48f";
  muralPaint.fillRect(0, 0, 512, 340);
  muralPaint.strokeStyle = "#6d5436";
  muralPaint.lineWidth = 14;
  muralPaint.strokeRect(18, 18, 476, 304);
  muralPaint.fillStyle = "#e1b03a";
  muralPaint.beginPath();
  muralPaint.arc(150, 130, 52, 0, Math.PI * 2);
  muralPaint.fill();
  muralPaint.fillStyle = "#8a6232";
  muralPaint.beginPath();
  muralPaint.moveTo(340, 78);
  muralPaint.lineTo(400, 200);
  muralPaint.quadraticCurveTo(360, 228, 300, 200);
  muralPaint.closePath();
  muralPaint.fill();
  muralPaint.fillStyle = "#3a2a18";
  muralPaint.font = "700 72px Georgia";
  muralPaint.textAlign = "center";
  muralPaint.fillText("1987", 256, 292);
  const muralMap = new THREE.CanvasTexture(muralCanvas);
  muralMap.colorSpace = THREE.SRGBColorSpace;
  const muralMat = trackMat(new THREE.MeshLambertMaterial({ color: "#1a1612" }));
  const mural = mesh(
    trackGeo(new THREE.PlaneGeometry(2.4, 1.6)),
    muralMat,
    37.05,
    caveFloor + 1.7,
    0,
    scene
  );
  mural.rotation.y = -Math.PI / 2;
  mural.layers.set(1);
  tag(mural, "mural");
  const bellX = 1.2;
  const bellZ = 30.2;
  const bellY = terrainHeight(bellX, bellZ);
  tag(mesh(trackGeo(new THREE.BoxGeometry(0.12, 3.4, 0.12)), woodMat, bellX - 0.55, bellY + 1.7, bellZ, scene), "bell");
  tag(mesh(trackGeo(new THREE.BoxGeometry(0.12, 3.4, 0.12)), woodMat, bellX + 0.55, bellY + 1.7, bellZ, scene), "bell");
  tag(mesh(trackGeo(new THREE.BoxGeometry(1.35, 0.12, 0.12)), woodMat, bellX, bellY + 3.35, bellZ, scene), "bell");
  const bell = mesh(trackGeo(new THREE.ConeGeometry(0.42, 0.62, 8)), goldMat, bellX, bellY + 2.75, bellZ, scene);
  bell.rotation.x = Math.PI;
  tag(bell, "bell");
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-3.15, -0.92);
  hullShape.lineTo(1.45, -1.08);
  hullShape.quadraticCurveTo(3.45, 0, 1.45, 1.08);
  hullShape.lineTo(-3.15, 0.92);
  hullShape.closePath();
  const hullGeo = trackGeo(new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.92,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.07,
    bevelSegments: 1,
  }));
  hullGeo.rotateX(-Math.PI / 2);
  const hullMat = trackMat(new THREE.MeshStandardMaterial({ color: "#efe8d8", roughness: 0.68, metalness: 0.04 }));
  const bootMat = trackMat(new THREE.MeshStandardMaterial({ color: "#243038", roughness: 0.8, metalness: 0.08 }));
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  const bootShape = new THREE.Shape();
  bootShape.moveTo(-3.15, -0.92);
  bootShape.lineTo(1.45, -1.08);
  bootShape.quadraticCurveTo(3.45, 0, 1.45, 1.08);
  bootShape.lineTo(-3.15, 0.92);
  bootShape.closePath();
  const bootGeo = trackGeo(new THREE.ExtrudeGeometry(bootShape, { depth: 0.28, bevelEnabled: false }));
  bootGeo.rotateX(-Math.PI / 2);
  const boot = new THREE.Mesh(bootGeo, bootMat);
  boot.castShadow = true;
  const seatGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.08, 1.35));
  const seatA = new THREE.Mesh(seatGeo, woodMat);
  seatA.position.set(-0.4, 0.62, 0);
  const seatB = new THREE.Mesh(seatGeo, woodMat);
  seatB.position.set(1.15, 0.62, 0);
  const consoleBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.62, 0.42)), woodMat);
  consoleBox.position.set(-2.15, 1.05, 0.28);
  const motor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.7, 0.32)), metalMat);
  motor.position.set(-3.25, 0.7, 0);
  const tiller = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.06, 0.08)), metalMat);
  tiller.position.set(-2.9, 1.05, 0);
  for (const part of [hull, boot, seatA, seatB, consoleBox, motor, tiller]) {
    part.castShadow = true;
    boat.add(part);
  }
  boat.position.set(11, terrainHeight(11, 22), 22);
  boat.rotation.y = 0.35;
  scene.add(boat);
  tag(boat, "boat");

  const clickGeo = trackGeo(new THREE.CylinderGeometry(0.85, 0.85, 2.4, 8));
  const clickMat = trackMat(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  for (const spot of HOTSPOTS) {
    const volume = mesh(clickGeo, clickMat, spot.x, terrainHeight(spot.x, spot.z) + 1.2, spot.z, scene);
    tag(volume, spot.id);
  }

  const npcSpots = { pete: [-24, -9, 0.6], lin: [-14, 22, 0.4], mara: [6, 28, Math.PI] };
  let actors = null;
  let heroInCave = false;
  let alive = true;

  const start = getState().pose || { x: 0, z: -33, yaw: 0, camYaw: Math.PI, camPitch: 0.42, camDist: 4.8 };
  let px = start.x;
  let pz = start.z;
  let yaw = start.yaw || 0;
  let hop = 0;
  let vy = 0;
  let camYaw = start.camYaw ?? Math.PI;
  let camPitch = start.camPitch ?? 0.42;
  let camDist = start.camDist ?? 4.8;

  const loader = new GLTFLoader();
  loader.load(WALKER_URL, (gltf) => {
    if (!alive) return;
    const source = gltf.scene;
    dressWalker(source);
    const box = new THREE.Box3().setFromObject(source);
    const center = box.getCenter(new THREE.Vector3());
    const rig = {
      footDrop: box.min.y,
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
      group.rotation.order = "YXZ";
      scene.add(group);
      const mixer = new THREE.AnimationMixer(group);
      const walk = rig.walkClip ? mixer.clipAction(rig.walkClip) : null;
      const idle = rig.idleClip ? mixer.clipAction(rig.idleClip) : null;
      walk?.setLoop(THREE.LoopRepeat, Infinity);
      idle?.setLoop(THREE.LoopRepeat, Infinity);
      idle?.play();
      return { group, mixer, walk, idle, mode: idle ? "idle" : "", yaw: 0 };
    };
    const hero = makeActor(WALKER_LOOKS.hero);
    const npcs = {
      pete: makeActor(WALKER_LOOKS.pete),
      lin: makeActor(WALKER_LOOKS.lin),
      mara: makeActor(WALKER_LOOKS.mara),
    };
    actors = { ...rig, hero, npcs };
    for (const [id, body] of Object.entries(npcs)) {
      const [x, z, face] = npcSpots[id];
      body.yaw = face;
      body.group.position.set(x - rig.centerX, terrainHeight(x, z) - rig.footDrop, z - rig.centerZ);
      body.group.rotation.y = face;
      body.group.traverse((obj) => {
        obj.userData.hotspot = id;
      });
      pickables.push(body.group);
    }
  });

  const palmY = terrainHeight(-9, -28);
  const palmTrunk = mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.48, 4.8, 7)), barkMat, -9, palmY + 2.4, -28, scene);
  tag(palmTrunk, "palm");
  const frondGeo = trackGeo(new THREE.PlaneGeometry(1.4, 3.7));
  frondGeo.translate(0, 1.7, 0);
  const frondMat = trackMat(new THREE.MeshStandardMaterial({
    map: tex.palm,
    alphaTest: 0.35,
    roughness: 0.85,
    side: THREE.DoubleSide,
    color: "#ffffff",
  }));
  for (let i = 0; i < 7; i += 1) {
    const frond = mesh(frondGeo, frondMat, -9, palmY + 4.5, -28, scene);
    frond.rotation.order = "YXZ";
    frond.rotation.y = (i / 7) * Math.PI * 2 + 0.2;
    frond.rotation.x = 0.85;
    frond.castShadow = true;
    tag(frond, "palm");
  }

  function placeHero() {
    if (!actors) return;
    const ground = terrainHeight(px, pz) + hop;
    actors.hero.group.position.set(px - actors.centerX, ground - actors.footDrop, pz - actors.centerZ);
    actors.hero.group.rotation.y = yaw;
    actors.hero.yaw = yaw;
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
        const speed = metersPerSecond * dt;
        let left = speed;
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

    door.visible = !state.flags.caveOpen;
    coconut.visible = !state.flags.coconutTaken;
    disc.visible = !state.flags.gotDisc;
    const torchLit = !!state.flags.torchLit;
    flameMat.emissiveIntensity = torchLit ? 1.4 : 0.45;
    flame.scale.setScalar(torchLit ? 1.35 : 0.45);
    torchLight.intensity = torchLit ? 16 : 0.35;
    muralLight.intensity = torchLit ? 12 : 0;
    if ((muralMat.map != null) !== torchLit) {
      muralMat.map = torchLit ? muralMap : null;
      muralMat.color.set(torchLit ? "#ffffff" : "#1a1612");
      muralMat.needsUpdate = true;
    }
    const inCave = px > 24.85 && px < 37.4 && Math.abs(pz) < 4.05;
    if (actors && inCave !== heroInCave) {
      heroInCave = inCave;
      actors.hero.group.traverse((obj) => obj.layers.set(inCave ? 1 : 0));
    }
    bell.position.y = bellY + 2.75 + (state.flags.bellRung ? Math.sin(performance.now() / 180) * 0.04 : 0);

    const cp = Math.cos(camPitch);
    let desired = camDist;
    for (let t = camDist; t >= 2.4; t -= 0.4) {
      const cx = px + Math.sin(camYaw) * cp * t;
      const cz = pz + Math.cos(camYaw) * cp * t;
      const cy = terrainHeight(px, pz) + hop + 1.55 + Math.sin(camPitch) * t;
      if (cy > terrainHeight(cx, cz) + 0.45) {
        desired = t;
        break;
      }
    }
    camera.position.set(
      px + Math.sin(camYaw) * cp * desired,
      terrainHeight(px, pz) + hop + 1.55 + Math.sin(camPitch) * desired,
      pz + Math.cos(camYaw) * cp * desired
    );
    camera.lookAt(px, terrainHeight(px, pz) + hop + 1.25, pz);
    sun.position.set(px + 28, 42, pz + 14);
    sun.target.position.set(px, 0, pz);
    sun.target.updateMatrixWorld();
    tex.water.map.offset.x += dt * 0.012;
    tex.water.normal.offset.y += dt * 0.01;
    renderer.render(scene, camera);
    return { moving };
  }

  const raycaster = new THREE.Raycaster();
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
      if ((id === "torch" || id === "mural") && !state.flags.caveOpen) continue;
      const spot = HOTSPOTS.find((item) => item.id === id);
      if (!spot) continue;
      if (Math.hypot(px - spot.x, pz - spot.z) > Math.max(2.6, spot.r)) continue;
      return id;
    }
    return null;
  }

  function nearest() {
    const state = getState();
    let best = null;
    let bestD = Infinity;
    for (const spot of HOTSPOTS) {
      if ((spot.id === "torch" || spot.id === "mural") && !state.flags.caveOpen) continue;
      const d = Math.hypot(px - spot.x, pz - spot.z);
      const reach = Math.max(2.05, spot.r);
      if (d < reach && d < bestD) {
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
    tex.dispose();
    groundTex.map.dispose();
    groundTex.normal.dispose();
    muralMap.dispose();
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
    signPost,
    torchStick,
    dial,
  };
}
