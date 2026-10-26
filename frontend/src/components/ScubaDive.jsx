import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Quaternius Universal Animation Library (CC0) — rigged human with swim clips.
// Dressed here with mask, tank and fins. Seabed photos: Poly Haven coast_sand_rocks_02 (CC0).
const MODEL_URL = "/models/scuba-diver.glb";
const SWIM_LIMIT = 68;
const SURFACE_Y = -1.15;

const CAUSTIC_GLSL = `
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
float causticPattern(vec2 uv, float t) {
  vec2 p = uv;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    p += vec2(sin(p.y * 1.7 + t * 0.65 + fi), cos(p.x * 1.35 - t * 0.55)) * 0.62;
    c += abs(sin(p.x * 1.5 + t * 0.9) * cos(p.y * 1.2 - t * 0.7));
    p *= 1.42;
  }
  return pow(clamp(c * 0.38, 0.0, 2.5), 2.4);
}
`;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < 5; i += 1) {
    value += amplitude * noise2(x * frequency, z * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

function seabedY(x, z) {
  const dune = fbm(x * 0.034, z * 0.031);
  const detail = fbm(x * 0.12 + 5.2, z * 0.1);
  const ridge = Math.pow(Math.abs(fbm(x * 0.021 + 12.0, z * 0.018) * 2.0 - 1.0), 1.2);
  const mound = Math.pow(fbm(x * 0.07 + 3.4, z * 0.08 + 1.1), 2.4);
  const bowl = Math.min(8, (x * x + z * z) * 0.00045);
  return -16.2 + (dune - 0.42) * 9.5 + (detail - 0.5) * 1.35 + ridge * 4.8 + mound * 5.2 - bowl;
}

function paintBubble() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const paint = canvas.getContext("2d");
  const glow = paint.createRadialGradient(32, 32, 4, 32, 32, 30);
  glow.addColorStop(0, "rgba(255,255,255,0.85)");
  glow.addColorStop(0.45, "rgba(210,240,255,0.35)");
  glow.addColorStop(0.72, "rgba(180,220,240,0.12)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  paint.fillStyle = glow;
  paint.beginPath();
  paint.arc(32, 32, 30, 0, Math.PI * 2);
  paint.fill();
  paint.strokeStyle = "rgba(255,255,255,0.8)";
  paint.lineWidth = 2;
  paint.beginPath();
  paint.arc(32, 32, 18, 0.4, 1.5);
  paint.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paintShaft() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const paint = canvas.getContext("2d");
  const vertical = paint.createLinearGradient(0, 0, 0, 256);
  vertical.addColorStop(0, "rgba(255,255,255,0.95)");
  vertical.addColorStop(0.4, "rgba(255,255,255,0.45)");
  vertical.addColorStop(1, "rgba(255,255,255,0)");
  paint.fillStyle = vertical;
  paint.fillRect(0, 0, 64, 256);
  paint.globalCompositeOperation = "destination-in";
  const horizontal = paint.createLinearGradient(0, 0, 64, 0);
  horizontal.addColorStop(0, "rgba(0,0,0,0)");
  horizontal.addColorStop(0.5, "rgba(0,0,0,1)");
  horizontal.addColorStop(1, "rgba(0,0,0,0)");
  paint.fillStyle = horizontal;
  paint.fillRect(0, 0, 64, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paintBlade() {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 128;
  const paint = canvas.getContext("2d");
  const gradient = paint.createLinearGradient(0, 128, 0, 0);
  gradient.addColorStop(0, "#0b3a30");
  gradient.addColorStop(0.45, "#1e8f62");
  gradient.addColorStop(1, "#b6e7b0");
  paint.fillStyle = gradient;
  paint.beginPath();
  paint.moveTo(24, 4);
  paint.quadraticCurveTo(46, 70, 28, 124);
  paint.quadraticCurveTo(24, 128, 20, 124);
  paint.quadraticCurveTo(2, 64, 24, 4);
  paint.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function paintFan() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const paint = canvas.getContext("2d");
  paint.clearRect(0, 0, 128, 128);
  paint.translate(64, 118);
  for (let i = -7; i <= 7; i += 1) {
    const angle = (i / 7) * 1.15;
    paint.strokeStyle = i % 2 ? "rgba(214, 92, 122, 0.9)" : "rgba(168, 62, 96, 0.85)";
    paint.lineWidth = 2;
    paint.beginPath();
    paint.moveTo(0, 0);
    paint.quadraticCurveTo(Math.sin(angle) * 30, -50, Math.sin(angle) * 58, -100);
    paint.stroke();
  }
  paint.strokeStyle = "rgba(120, 40, 64, 0.7)";
  paint.beginPath();
  paint.arc(0, -8, 54, Math.PI * 1.15, Math.PI * 1.85);
  paint.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function tuneMaterial(material, shaders, kind) {
  material.customProgramCacheKey = () => `underwater-${kind}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shaders.push(shader);
    shader.vertexShader = `uniform float uTime;\nvarying vec3 vWorld;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `
      ${kind === "grass" ? `
        #ifdef USE_INSTANCING
          float gPhase = instanceMatrix[3][0] * 0.4 + instanceMatrix[3][2] * 0.25;
        #else
          float gPhase = 0.0;
        #endif
        transformed.x += sin(uTime * 1.05 + gPhase) * 0.16 * position.y;
        transformed.z += cos(uTime * 0.85 + gPhase) * 0.08 * position.y;
      ` : ""}
      ${kind === "fish" ? `
        #ifdef USE_INSTANCING
          float fPhase = instanceMatrix[3][0] + instanceMatrix[3][2];
        #else
          float fPhase = 0.0;
        #endif
        float tail = smoothstep(0.05, 0.38, position.z);
        transformed.x += sin(uTime * 8.0 + fPhase) * 0.06 * tail;
      ` : ""}
      vec4 worldPos4 = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        worldPos4 = instanceMatrix * worldPos4;
      #endif
      #ifdef USE_BATCHING
        worldPos4 = batchingMatrix * worldPos4;
      #endif
      worldPos4 = modelMatrix * worldPos4;
      vWorld = worldPos4.xyz;
      #include <project_vertex>
      `
    );
    shader.fragmentShader = `uniform float uTime;\nvarying vec3 vWorld;\n${CAUSTIC_GLSL}\n${shader.fragmentShader}`;
    if (kind === "ground") {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #include <map_fragment>
        float macro = fbm2(vWorld.xz * 0.045);
        diffuseColor.rgb *= mix(vec3(0.78, 0.9, 0.84), vec3(1.12, 1.08, 1.0), macro);
        diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(-24.0, -11.0, vWorld.y));
        `
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      float cau = causticPattern(vWorld.xz * 0.28, uTime);
      float depthFade = exp(-max(0.0, -vWorld.y) * 0.06);
      outgoingLight += cau * depthFade * vec3(0.62, 0.78, 0.72);
      #include <opaque_fragment>
      `
    );
  };
}

function makeFishGeometry() {
  const body = new THREE.SphereGeometry(1, 14, 10);
  body.scale(0.12, 0.09, 0.32);
  const tail = new THREE.ConeGeometry(0.09, 0.18, 7);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, 0.36);
  const geo = mergeGeometries([body, tail]);
  geo.translate(0, 0, -0.05);
  return geo;
}

function makeRockGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const position = geo.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = fbm(x * 1.7 + seed, z * 1.7 + y * 0.4);
    const scale = 0.78 + n * 0.55;
    position.setXYZ(i, x * scale, y * (0.48 + n * 0.4), z * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

function dressDiver(rig) {
  rig.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((material) => {
      material.color.set(obj.name === "Mannequin_2" ? "#05070a" : "#0a0e14");
      material.roughness = obj.name === "Mannequin_2" ? 0.72 : 0.5;
      material.metalness = 0.08;
    });
  });

  const head = rig.getObjectByName("Head");
  const spine = rig.getObjectByName("spine_02");
  const footL = rig.getObjectByName("foot_l");
  const footR = rig.getObjectByName("foot_r");
  const pelvis = rig.getObjectByName("pelvis");
  if (!head || !spine || !footL || !footR) return null;

  const rubber = new THREE.MeshStandardMaterial({ color: "#1a1c1e", roughness: 0.55, metalness: 0.25 });
  const tankMat = new THREE.MeshStandardMaterial({ color: "#e2b23a", roughness: 0.32, metalness: 0.72 });
  const finMat = new THREE.MeshStandardMaterial({ color: "#0d4f8a", roughness: 0.38, metalness: 0.18 });
  const finTip = new THREE.MeshStandardMaterial({ color: "#f0d15c", roughness: 0.42, metalness: 0.12 });

  const mask = new THREE.Group();
  const skirt = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 10, 18), rubber);
  skirt.position.set(0, 0.02, 0.1);
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.072, 20, 14),
    new THREE.MeshPhysicalMaterial({
      color: "#d7f6ff",
      roughness: 0.04,
      metalness: 0,
      transmission: 0.86,
      thickness: 0.12,
      ior: 1.45,
      transparent: true,
      depthWrite: false,
    })
  );
  glass.scale.set(1.05, 0.82, 0.42);
  glass.position.set(0, 0.02, 0.11);
  mask.add(skirt, glass);
  head.add(mask);

  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.03, 0.13);
  const regulator = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.038, 0.045), rubber);
  mouth.add(regulator);
  head.add(mouth);

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.58, 18), tankMat);
  tank.position.set(0, 0.02, -0.22);
  const valve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.09, 10),
    new THREE.MeshStandardMaterial({ color: "#2a2d31", roughness: 0.35, metalness: 0.7 })
  );
  valve.position.set(0, 0.34, -0.22);
  spine.add(tank, valve);
  const strapMat = new THREE.MeshStandardMaterial({ color: "#111316", roughness: 0.8, metalness: 0.05 });
  [-0.12, 0.12].forEach((y) => {
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 16), strapMat);
    strap.rotation.y = Math.PI / 2;
    strap.position.set(0, y, -0.06);
    spine.add(strap);
  });
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, 0.32, -0.2),
    new THREE.Vector3(0.16, 0.24, -0.08),
    new THREE.Vector3(0.1, 0.36, 0.02),
  ]);
  spine.add(new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 16, 0.011, 6, false), strapMat));

  const makeFin = () => {
    const fin = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 0.016), finMat);
    blade.position.set(0, 0.22, 0.01);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.014), finTip);
    tip.position.set(0, 0.33, 0.01);
    fin.add(blade, tip);
    return fin;
  };
  footL.add(makeFin());
  footR.add(makeFin());

  if (pelvis) {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 16), strapMat);
    belt.rotation.x = Math.PI / 2;
    pelvis.add(belt);
  }

  return mouth;
}

const swimKeys = new Set();
const swimDown = {
  KeyW: "KeyS",
  KeyS: "KeyW",
  KeyA: "KeyD",
  KeyD: "KeyA",
  KeyE: "KeyC",
  KeyC: "KeyE",
};

function holdSwimKey(code, down) {
  if (!swimDown[code]) return;
  if (down) {
    swimKeys.delete(swimDown[code]);
    swimKeys.add(code);
  } else {
    swimKeys.delete(code);
  }
}

function bindSwimKeys() {
  const onKeyDown = (event) => {
    if (!swimDown[event.code]) return;
    event.preventDefault();
    holdSwimKey(event.code, true);
  };
  const onKeyUp = (event) => {
    holdSwimKey(event.code, false);
  };
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    swimKeys.clear();
  };
}

function SwimPad({ code, label }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        holdSwimKey(code, true);
      }}
      onPointerUp={() => holdSwimKey(code, false)}
      onPointerCancel={() => holdSwimKey(code, false)}
      onPointerLeave={() => holdSwimKey(code, false)}
      style={{
        width: 52,
        height: 44,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.45)",
        background: "rgba(6, 17, 39, 0.72)",
        color: "#fff",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function ScubaDive() {
  const mountRef = useRef(null);
  const depthRef = useRef(null);
  const hintRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let alive = true;
    const unbindKeys = bindSwimKeys();

    const shaders = [];
    const disposables = new Set();
    const remember = (item) => {
      if (item) disposables.add(item);
      return item;
    };

    const scene = new THREE.Scene();
    const fogColor = new THREE.Color("#0b6f8a");
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(fogColor, 0.017);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 260);
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(fogColor, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.cursor = "default";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const rt = new THREE.WebGLRenderTarget(2, 2);
    rt.texture.colorSpace = THREE.NoColorSpace;
    const postScene = new THREE.Scene();
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: rt.texture },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv;
          vec2 d = uv - 0.5;
          uv += vec2(
            sin(uv.y * 22.0 + uTime * 1.3) + sin(uv.y * 8.0 - uTime * 0.7),
            cos(uv.x * 18.0 + uTime * 1.1) + cos(uv.x * 6.0 + uTime * 0.5)
          ) * 0.0021;
          float shift = 0.0015;
          float r = texture2D(tDiffuse, uv + d * shift).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv - d * shift).b;
          vec3 col = vec3(r, g, b);
          float vig = smoothstep(0.95, 0.4, length(d));
          col *= mix(0.78, 1.0, vig);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial);
    postScene.add(postQuad);

    scene.add(new THREE.HemisphereLight(0xc5ecff, 0x3a4a34, 0.62));
    scene.add(new THREE.AmbientLight(0x12384a, 0.42));
    const sun = new THREE.DirectionalLight(0xe7f7ff, 2.7);
    sun.position.set(-28, 70, 16);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fd4cb, 0.7);
    fill.position.set(18, 6, -14);
    scene.add(fill);

    let modelReady = false;
    const manager = new THREE.LoadingManager();
    manager.onLoad = () => {
      if (!alive) return;
      if (!modelReady) {
        setStatus("error");
        return;
      }
      const maxAniso = renderer.capabilities.getMaxAnisotropy?.() || 8;
      const copyImage = (clone, source) => {
        clone.image = source.image;
        clone.anisotropy = maxAniso;
        clone.needsUpdate = true;
      };
      [diff, nor, rough, ao].forEach((texture) => {
        texture.anisotropy = maxAniso;
        texture.needsUpdate = true;
      });
      copyImage(rockDiff, diff);
      copyImage(rockNor, nor);
      copyImage(brainNor, nor);
      setStatus("ready");
    };
    const texLoader = new THREE.TextureLoader(manager);
    const prep = (texture, color) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 8;
      return texture;
    };
    const diff = prep(texLoader.load("/textures/seabed/diff.jpg"), true);
    const nor = prep(texLoader.load("/textures/seabed/nor.jpg"), false);
    const rough = prep(texLoader.load("/textures/seabed/rough.jpg"), false);
    const ao = prep(texLoader.load("/textures/seabed/ao.jpg"), false);
    [diff, nor, rough, ao].forEach((texture) => texture.repeat.set(26, 26));

    const floorGeo = new THREE.PlaneGeometry(150, 150, 48, 48);
    const floorPos = floorGeo.attributes.position;
    for (let i = 0; i < floorPos.count; i += 1) {
      const x = floorPos.getX(i);
      const y = floorPos.getY(i);
      floorPos.setZ(i, seabedY(x, -y));
    }
    floorGeo.computeVertexNormals();
    floorGeo.setAttribute("uv2", floorGeo.attributes.uv.clone());
    const floorMat = new THREE.MeshStandardMaterial({
      map: diff,
      normalMap: nor,
      normalScale: new THREE.Vector2(1.55, 1.55),
      roughnessMap: rough,
      aoMap: ao,
      aoMapIntensity: 0.85,
      roughness: 0.92,
      metalness: 0.02,
      color: "#f2efe6",
    });
    tuneMaterial(floorMat, shaders, "ground");
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const waterUniforms = {
      uTime: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(-0.28, 0.92, 0.22).normalize() },
    };
    const waterMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: waterUniforms,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        struct Wave { vec3 disp; vec3 nrm; };
        Wave gerstner(vec2 xz, float t) {
          Wave w;
          w.disp = vec3(0.0);
          w.nrm = vec3(0.0, 1.0, 0.0);
          vec4 amp = vec4(0.16, 0.09, 0.05, 0.028);
          vec4 len = vec4(22.0, 11.0, 6.2, 3.4);
          vec4 spd = vec4(0.75, 1.05, 1.35, 1.7);
          vec2 dirs[4];
          dirs[0] = normalize(vec2(1.0, 0.32));
          dirs[1] = normalize(vec2(-0.45, 1.0));
          dirs[2] = normalize(vec2(0.25, -1.0));
          dirs[3] = normalize(vec2(-1.0, -0.2));
          for (int i = 0; i < 4; i++) {
            float k = 6.2831853 / len[i];
            float a = amp[i];
            float phase = dot(dirs[i], xz) * k + t * spd[i];
            float s = sin(phase);
            float c = cos(phase);
            w.disp.x += dirs[i].x * a * c;
            w.disp.z += dirs[i].y * a * c;
            w.disp.y += a * s;
            w.nrm.x -= dirs[i].x * k * a * c;
            w.nrm.z -= dirs[i].y * k * a * c;
            w.nrm.y -= k * a * s;
          }
          w.nrm = normalize(w.nrm);
          return w;
        }
        void main() {
          Wave wave = gerstner(position.xy, uTime);
          vec3 disp = wave.disp;
          vec3 nrm = wave.nrm;
          vec3 pos = position;
          pos.x += disp.x;
          pos.y += disp.z;
          pos.z += disp.y;
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorld = worldPos.xyz;
          vec3 localN = normalize(vec3(nrm.x, -nrm.z, nrm.y));
          vNormalW = normalize(mat3(modelMatrix) * localN);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDir;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        ${CAUSTIC_GLSL}
        void main() {
          vec3 view = normalize(vWorld - uCameraPos);
          vec3 n = normalize(vNormalW);
          float cosN = clamp(dot(view, n), 0.0, 1.0);
          float window = smoothstep(0.60, 0.72, cosN);
          vec3 horizon = vec3(0.73, 0.84, 0.9);
          vec3 zenith = vec3(0.33, 0.58, 0.86);
          vec3 sky = mix(horizon, zenith, smoothstep(0.66, 1.0, cosN));
          vec2 skyUv = view.xz / max(0.2, view.y);
          float cloud = fbm2(skyUv * 0.85 + vec2(uTime * 0.015, 0.4));
          sky = mix(sky, vec3(0.95, 0.97, 0.98), smoothstep(0.52, 0.78, cloud) * 0.55);
          float sunDisk = pow(max(dot(normalize(view), uSunDir), 0.0), 1400.0);
          float sunGlow = pow(max(dot(normalize(view), uSunDir), 0.0), 28.0);
          sky += vec3(1.0, 0.93, 0.75) * (sunDisk * 8.0 + sunGlow * 0.55);
          vec3 below = vec3(0.012, 0.045, 0.07);
          float shimmer = pow(max(dot(reflect(-view, n), uSunDir), 0.0), 48.0);
          below += vec3(0.22, 0.36, 0.38) * shimmer;
          float rim = smoothstep(0.52, 0.64, cosN) * (1.0 - smoothstep(0.7, 0.82, cosN));
          vec3 color = mix(below, sky, window);
          color += vec3(0.45, 0.7, 0.75) * rim * 0.45;
          float edge = pow(1.0 - cosN, 2.2);
          color += vec3(0.22, 0.5, 0.58) * edge * 0.5;
          float dist = distance(uCameraPos, vWorld);
          color = mix(color, vec3(0.02, 0.16, 0.2), 1.0 - exp(-dist * 0.035));
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 32, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);

    const rand = mulberry32(11);
    const dummy = new THREE.Object3D();
    const rockDiff = diff.clone();
    rockDiff.repeat.set(2.2, 2.2);
    const rockNor = nor.clone();
    rockNor.repeat.set(2.2, 2.2);
    const rockMat = new THREE.MeshStandardMaterial({
      map: rockDiff,
      color: "#c9c2b4",
      normalMap: rockNor,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.88,
      metalness: 0.04,
    });
    tuneMaterial(rockMat, shaders, "prop");
    for (let variant = 0; variant < 8; variant += 1) {
      const geo = makeRockGeometry(variant + 3);
      const mesh = new THREE.InstancedMesh(geo, rockMat, 6);
      for (let i = 0; i < 6; i += 1) {
        const hero = variant < 2 && i < 3;
        const x = hero ? -8 + rand() * 18 : (rand() - 0.5) * 120;
        const z = hero ? 5 + rand() * 26 : (rand() - 0.5) * 120;
        const scale = (hero ? 1.6 : 0.7) + rand() * (hero ? 2.4 : 2.1);
        dummy.position.set(x, seabedY(x, z) - scale * 0.28, z);
        dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
        dummy.scale.set(scale * (0.8 + rand() * 0.5), scale * (0.45 + rand() * 0.7), scale * (0.8 + rand() * 0.5));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      scene.add(mesh);
    }

    const coralColors = ["#d06a45", "#c9866a", "#7d4d86", "#d2a15a"];
    const coralBuckets = coralColors.map(() => []);
    for (let cluster = 0; cluster < 22; cluster += 1) {
      const hero = cluster < 8;
      const x = hero ? -7 + rand() * 16 : (rand() - 0.5) * 110;
      const z = hero ? 6 + rand() * 24 : (rand() - 0.5) * 110;
      const y = seabedY(x, z);
      const bucket = coralBuckets[cluster % coralBuckets.length];
      const branches = 5 + Math.floor(rand() * 4);
      for (let b = 0; b < branches; b += 1) {
        const height = 0.35 + rand() * 1.05;
        const geo = new THREE.CylinderGeometry(0.025 + rand() * 0.02, 0.06, height, 6);
        geo.translate(0, height * 0.5, 0);
        dummy.position.set(x + (rand() - 0.5) * 0.35, y, z + (rand() - 0.5) * 0.35);
        dummy.rotation.set((rand() - 0.5) * 0.7, rand() * 6, (rand() - 0.5) * 0.7);
        dummy.scale.setScalar(0.85 + rand() * 0.6);
        dummy.updateMatrix();
        geo.applyMatrix4(dummy.matrix);
        bucket.push(geo);
      }
    }
    coralBuckets.forEach((parts, index) => {
      if (!parts.length) return;
      const geo = mergeGeometries(parts);
      const mat = new THREE.MeshStandardMaterial({
        color: coralColors[index],
        roughness: 0.74,
        metalness: 0.02,
      });
      tuneMaterial(mat, shaders, "prop");
      scene.add(new THREE.Mesh(geo, mat));
    });

    const brains = [];
    for (let i = 0; i < 10; i += 1) {
      const hero = i < 4;
      const x = hero ? -4 + rand() * 12 : (rand() - 0.5) * 100;
      const z = hero ? 8 + rand() * 18 : (rand() - 0.5) * 100;
      const radius = 0.35 + rand() * 0.45;
      const geo = new THREE.SphereGeometry(radius, 18, 12);
      geo.scale(1.15, 0.62, 1);
      dummy.position.set(x, seabedY(x, z) + radius * 0.35, z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      geo.applyMatrix4(dummy.matrix);
      brains.push(geo);
    }
    const brainNor = nor.clone();
    brainNor.repeat.set(3, 3);
    const brainMat = new THREE.MeshStandardMaterial({
      color: "#c45b48",
      normalMap: brainNor,
      normalScale: new THREE.Vector2(1.8, 1.8),
      roughness: 0.58,
      metalness: 0.05,
    });
    tuneMaterial(brainMat, shaders, "prop");
    scene.add(new THREE.Mesh(mergeGeometries(brains), brainMat));

    const bladeA = new THREE.PlaneGeometry(0.42, 1.55);
    bladeA.translate(0, 0.78, 0);
    const bladeB = bladeA.clone();
    bladeB.rotateY(Math.PI / 2);
    const grassGeo = mergeGeometries([bladeA, bladeB]);
    const grassMat = new THREE.MeshStandardMaterial({
      map: remember(paintBlade()),
      roughness: 0.8,
      metalness: 0,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      color: "#d5ffd8",
    });
    tuneMaterial(grassMat, shaders, "grass");
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, 80);
    for (let i = 0; i < 80; i += 1) {
      const hero = i < 18;
      const x = hero ? -6 + rand() * 14 : (rand() - 0.5) * 110;
      const z = hero ? 4 + rand() * 20 : (rand() - 0.5) * 110;
      const h = 0.7 + rand() * 1.1;
      dummy.position.set(x, seabedY(x, z), z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(0.7 + rand() * 0.6, h, 0.7 + rand() * 0.6);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    scene.add(grass);

    const fanTex = remember(paintFan());
    const fanMat = new THREE.MeshStandardMaterial({
      map: fanTex,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0,
      depthWrite: false,
    });
    tuneMaterial(fanMat, shaders, "prop");
    const fans = [];
    for (let i = 0; i < 12; i += 1) {
      const hero = i < 4;
      const x = hero ? -5 + rand() * 14 : (rand() - 0.5) * 100;
      const z = hero ? 7 + rand() * 18 : (rand() - 0.5) * 100;
      const fan = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.5), fanMat);
      fan.position.set(x, seabedY(x, z) + 0.75, z);
      fan.rotation.y = rand() * Math.PI;
      scene.add(fan);
      fans.push(fan);
    }

    const fishGeo = makeFishGeometry();
    const fishMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.38,
      metalness: 0.22,
    });
    tuneMaterial(fishMat, shaders, "fish");
    const fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, 46);
    const fishPalette = [0xd5dee6, 0xf2c24b, 0x3f9ed6, 0xf4f7f8, 0xd4844a, 0x8fd0c8];
    const fishColor = new THREE.Color();
    const fish = [];
    for (let i = 0; i < 46; i += 1) {
      const school = i < 16;
      const entry = {
        angle: rand() * Math.PI * 2,
        speed: 0.28 + rand() * 0.55,
        radius: school ? 1.1 + rand() * 2.2 : 2.2 + rand() * 7,
        cx: school ? 2 + (i % 4) * 0.8 : (rand() - 0.5) * 90,
        cz: school ? 11 + Math.floor(i / 4) * 1.4 : (rand() - 0.5) * 90,
        bob: rand() * Math.PI * 2,
        y: 0,
        scale: 0.45 + rand() * 0.7,
      };
      entry.y = Math.min(-2.4, seabedY(entry.cx, entry.cz) + 1.6 + rand() * (school ? 2.2 : 6));
      fish.push(entry);
      fishMesh.setColorAt(i, fishColor.setHex(fishPalette[i % fishPalette.length]));
    }
    scene.add(fishMesh);

    const shaftTex = remember(paintShaft());
    const shafts = [];
    for (let i = 0; i < 14; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        map: shaftTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.1,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      });
      const width = 2.4 + rand() * 3.2;
      const group = new THREE.Group();
      const a = new THREE.Mesh(new THREE.PlaneGeometry(width, 20), mat);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.72, 20), mat);
      b.rotation.y = Math.PI / 2;
      group.add(a, b);
      const hero = i < 5;
      const x = hero ? -4 + i * 3.2 : (rand() - 0.5) * 100;
      const z = hero ? 4 + (i % 3) * 6 : (rand() - 0.5) * 100;
      group.position.set(x, -10, z);
      group.rotation.z = 0.16;
      group.rotation.x = -0.08;
      scene.add(group);
      shafts.push(mat);
    }

    const snowCount = 380;
    const snowGeo = new THREE.BufferGeometry();
    const snowPos = new Float32Array(snowCount * 3);
    const snow = [];
    for (let i = 0; i < snowCount; i += 1) {
      const x = (rand() - 0.5) * 80;
      const y = -1.5 - rand() * 18;
      const z = (rand() - 0.5) * 80;
      snowPos[i * 3] = x;
      snowPos[i * 3 + 1] = y;
      snowPos[i * 3 + 2] = z;
      snow.push({ x, y, z, s: 0.15 + rand() * 0.45, p: rand() * 6 });
    }
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
    scene.add(new THREE.Points(snowGeo, new THREE.PointsMaterial({
      color: 0xe7f7ff,
      size: 0.03,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      sizeAttenuation: true,
    })));

    const bubbleTex = remember(paintBubble());
    const bubbleCount = 30;
    const bubbleGeo = new THREE.BufferGeometry();
    const bubblePos = new Float32Array(bubbleCount * 3);
    bubbleGeo.setAttribute("position", new THREE.BufferAttribute(bubblePos, 3));
    const bubbles = [];
    for (let i = 0; i < bubbleCount; i += 1) {
      bubblePos[i * 3 + 1] = -80;
      bubbles.push({
        life: 0,
        rise: 0.45 + rand() * 0.7,
        wobble: rand() * 8,
        drift: 0.12 + rand() * 0.2,
      });
    }
    scene.add(new THREE.Points(bubbleGeo, new THREE.PointsMaterial({
      map: bubbleTex,
      color: 0xf4fbff,
      size: 0.07,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    })));

    const swimmer = new THREE.Group();
    swimmer.position.set(0, -6.6, 0);
    scene.add(swimmer);
    let mouth = null;
    let mixer = null;
    let swimAction = null;
    const loader = new GLTFLoader(manager);
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (!alive) return;
        const rig = gltf.scene;
        mixer = new THREE.AnimationMixer(rig);
        swimAction = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Swim_Fwd_Loop"));
        swimAction.setLoop(THREE.LoopRepeat, Infinity);
        swimAction.play();
        swimAction.time = 0.35;
        mixer.update(0.05);
        rig.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(rig);
        const center = box.getCenter(new THREE.Vector3());
        rig.position.sub(center);
        rig.position.y += 0.08;
        mouth = dressDiver(rig);
        const seen = new Set();
        rig.traverse((obj) => {
          if (!obj.isMesh) return;
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((material) => {
            if (seen.has(material) || !material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) return;
            seen.add(material);
            tuneMaterial(material, shaders, "prop");
          });
        });
        modelReady = true;
        swimmer.add(rig);
      },
      undefined,
      () => {
        if (alive) setStatus("error");
      }
    );

    let yaw = 0.35;
    let roll = 0;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w < 1 || h < 1) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      const pr = renderer.getPixelRatio();
      rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    const velocity = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const desiredCam = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const camOffset = new THREE.Vector3();
    const mouthWorld = new THREE.Vector3();
    let bubbleAcc = 0;
    let frame = 0;
    let booted = false;

    const tick = () => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;

      const turnLeft = swimKeys.has("KeyA");
      const turnRight = swimKeys.has("KeyD");
      if (turnLeft) yaw += 2.4 * delta;
      if (turnRight) yaw -= 2.4 * delta;
      const rollTarget = (turnRight ? 0.45 : 0) - (turnLeft ? 0.45 : 0);
      roll = THREE.MathUtils.damp(roll, rollTarget, 4, delta);
      swimmer.rotation.order = "YXZ";
      swimmer.rotation.set(0, yaw, roll);
      swimmer.updateMatrix();
      forward.set(0, 0, 1).applyQuaternion(swimmer.quaternion);
      let hx = 0;
      let hz = 0;
      if (swimKeys.has("KeyW")) {
        hx += forward.x;
        hz += forward.z;
      }
      if (swimKeys.has("KeyS")) {
        hx -= forward.x;
        hz -= forward.z;
      }
      const planar = Math.hypot(hx, hz) || 1;
      const swim = swimKeys.has("KeyW") || swimKeys.has("KeyS") ? 6.4 : 0;
      hx = (hx / planar) * swim;
      hz = (hz / planar) * swim;
      const rise = (swimKeys.has("KeyE") ? 4.5 : 0) - (swimKeys.has("KeyC") ? 4.5 : 0);
      velocity.set(hx, rise, hz);
      swimmer.position.addScaledVector(velocity, delta);
      const horizontal = Math.hypot(swimmer.position.x, swimmer.position.z);
      if (horizontal > SWIM_LIMIT) {
        const scale = SWIM_LIMIT / horizontal;
        swimmer.position.x *= scale;
        swimmer.position.z *= scale;
      }
      const floorLimit = seabedY(swimmer.position.x, swimmer.position.z) + 1.35;
      swimmer.position.y = THREE.MathUtils.clamp(swimmer.position.y, floorLimit, SURFACE_Y);

      const speed = velocity.length();
      if (mixer && swimAction) {
        const moving = speed > 0.25;
        swimAction.setEffectiveTimeScale(moving ? 0.9 + Math.min(speed, 3.2) * 0.32 : 0.42);
        mixer.update(delta);
      }

      if (mouth) {
        mouth.getWorldPosition(mouthWorld);
        bubbleAcc += delta * (0.35 + speed * 2.1);
        while (bubbleAcc > 1) {
          bubbleAcc -= 1;
          const slot = bubbles.find((bubble) => bubble.life <= 0);
          if (!slot) break;
          slot.life = 1.5 + Math.random() * 1.3;
          slot.x = mouthWorld.x;
          slot.y = mouthWorld.y;
          slot.z = mouthWorld.z;
        }
      }
      bubbles.forEach((bubble, index) => {
        if (bubble.life > 0) {
          bubble.life -= delta;
          bubble.y += bubble.rise * delta;
          bubble.x += Math.sin(time * 2.2 + bubble.wobble) * bubble.drift * delta;
          bubble.z += Math.cos(time * 1.7 + bubble.wobble) * bubble.drift * delta;
          if (bubble.y > -0.4) bubble.life = 0;
        }
        const base = index * 3;
        if (bubble.life > 0) {
          bubblePos[base] = bubble.x;
          bubblePos[base + 1] = bubble.y;
          bubblePos[base + 2] = bubble.z;
        } else {
          bubblePos[base + 1] = -80;
        }
      });
      bubbleGeo.attributes.position.needsUpdate = true;

      snow.forEach((speck, index) => {
        speck.y += speck.s * delta;
        speck.x += Math.sin(time * 0.4 + speck.p) * 0.05 * delta;
        if (speck.y > -1.2) speck.y = -18 - Math.random() * 4;
        snowPos[index * 3] = speck.x;
        snowPos[index * 3 + 1] = speck.y;
        snowPos[index * 3 + 2] = speck.z;
      });
      snowGeo.attributes.position.needsUpdate = true;

      fish.forEach((entry, index) => {
        entry.angle += entry.speed * delta;
        const x = entry.cx + Math.cos(entry.angle) * entry.radius;
        const z = entry.cz + Math.sin(entry.angle) * entry.radius;
        const y = Math.max(
          seabedY(x, z) + 0.7,
          Math.min(-1.8, entry.y + Math.sin(time * 0.8 + entry.bob) * 0.35)
        );
        dummy.position.set(x, y, z);
        dummy.lookAt(x - Math.sin(entry.angle), y, z + Math.cos(entry.angle));
        dummy.scale.setScalar(entry.scale);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(index, dummy.matrix);
      });
      fishMesh.instanceMatrix.needsUpdate = true;

      fans.forEach((fan, index) => {
        fan.rotation.z = Math.sin(time * 0.7 + index) * 0.08;
      });
      shafts.forEach((mat, index) => {
        mat.opacity = 0.07 + Math.sin(time * 0.6 + index * 0.7) * 0.035;
      });

      shaders.forEach((shader) => {
        if (shader.uniforms.uTime) shader.uniforms.uTime.value = time;
      });
      waterUniforms.uTime.value = time;
      waterUniforms.uCameraPos.value.copy(camera.position);
      postMaterial.uniforms.uTime.value = time;

      camOffset.set(0.4, 0.85, -4.8).applyQuaternion(swimmer.quaternion);
      desiredCam.copy(swimmer.position).add(camOffset);
      if (!booted) {
        camera.position.copy(desiredCam);
        booted = true;
      } else {
        const followXZ = 1 - Math.exp(-2.4 * delta);
        const followY = 1 - Math.exp(-1.5 * delta);
        camera.position.x += (desiredCam.x - camera.position.x) * followXZ;
        camera.position.z += (desiredCam.z - camera.position.z) * followXZ;
        camera.position.y += (desiredCam.y - camera.position.y) * followY;
      }
      lookTarget.copy(swimmer.position);
      lookTarget.y += 0.15;
      camera.lookAt(lookTarget);
      if (depthRef.current) {
        depthRef.current.textContent = `Depth ${(-swimmer.position.y).toFixed(1)} m`;
      }
      if (hintRef.current) {
        const active = [];
        if (swimKeys.has("KeyW")) active.push("FORWARD");
        if (swimKeys.has("KeyS")) active.push("BACK");
        if (swimKeys.has("KeyA")) active.push("LEFT");
        if (swimKeys.has("KeyD")) active.push("RIGHT");
        if (swimKeys.has("KeyE")) active.push("UP");
        if (swimKeys.has("KeyC")) active.push("DOWN");
        hintRef.current.textContent = active.length
          ? active.join("  ")
          : "W forward · S back · A turn left · D turn right · E up · C down";
      }

      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    };
    tick();

    return () => {
      alive = false;
      unbindKeys();
      cancelAnimationFrame(frame);
      observer.disconnect();
      mixer?.stopAllAction();
      const canvasEl = renderer.domElement;
      if (canvasEl.parentNode) canvasEl.remove();
      renderer.forceContextLoss();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position: "absolute", inset: 0 }}>
      {status !== "ready" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.92)",
            fontSize: "0.95rem",
            pointerEvents: "none",
            textShadow: "0 1px 4px rgba(0,0,0,0.45)",
          }}
        >
          {status === "error" ? "Could not load the diver." : "Loading the reef…"}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          zIndex: 4,
          display: "grid",
          gridTemplateColumns: "52px 52px 52px",
          gap: 6,
          justifyItems: "center",
        }}
      >
        <span />
        <SwimPad code="KeyE" label="E" />
        <span />
        <SwimPad code="KeyA" label="A" />
        <SwimPad code="KeyW" label="W" />
        <SwimPad code="KeyD" label="D" />
        <span />
        <SwimPad code="KeyS" label="S" />
        <SwimPad code="KeyC" label="C" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 18,
          zIndex: 2,
          textAlign: "center",
          color: "rgba(255,255,255,0.9)",
          fontSize: "0.82rem",
          letterSpacing: "0.03em",
          pointerEvents: "none",
          textShadow: "0 1px 4px rgba(0,0,0,0.55)",
        }}
      >
        <div ref={depthRef}>Depth 6.6 m</div>
        <div ref={hintRef} style={{ opacity: 0.95, marginTop: 6, fontSize: "1.15rem", fontWeight: 700 }}>
          W forward · S back · A turn left · D turn right · E up · C down
        </div>
      </div>
    </div>
  );
}
