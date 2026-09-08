import * as THREE from "three";

/** Vertical palings around the grass. Metres. */
export const FENCE_PALING_WIDTH_M = 0.14;
export const FENCE_PALING_THICKNESS_M = 0.01;
export const FENCE_PALING_HEIGHT_M = 1.8;
/** Adjacent palings overlap by this amount. */
export const FENCE_PALING_OVERLAP_M = 0.02;
/** Rails: 90 mm high × 45 mm deep, full run length. Centres at 200 / 900 / 1550 mm. */
export const FENCE_RAIL_HEIGHT_M = 0.09;
export const FENCE_RAIL_DEPTH_M = 0.045;
export const FENCE_RAIL_CENTERS_M = [0.2, 0.9, 1.55];
/** 90×90 mm posts on 2.4 m centres, same height as the palings. */
export const FENCE_POST_SIZE_M = 0.09;
export const FENCE_POST_HEIGHT_M = FENCE_PALING_HEIGHT_M;
export const FENCE_POST_CENTRES_M = 2.4;

function parseRgb(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return [Number(color[0]), Number(color[1]), Number(color[2])];
  }
  const hex = String(color || "").replace("#", "");
  if (hex.length !== 6) return [160, 120, 72];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function mixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgbCss(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function fillWoodGrain(ctx, size, { vertical, light, mid, dark, palingEdges = false }) {
  const midRgb = parseRgb(mid);
  const darkRgb = parseRgb(dark);
  const grainRgb = mixRgb(darkRgb, midRgb, 0.5);
  const edgeRgb = mixRgb(darkRgb, midRgb, 0.28);
  ctx.fillStyle = mid;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 1) {
    const wave = Math.sin(i * 0.35) * 0.08 + Math.sin(i * 0.11) * 0.05;
    const shade = 0.9 + wave + ((i * 13) % 7) * 0.012;
    const r = Math.min(255, Math.floor(light[0] * shade));
    const g = Math.min(255, Math.floor(light[1] * shade));
    const b = Math.min(255, Math.floor(light[2] * shade));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    if (vertical) ctx.fillRect(i, 0, 1, size);
    else ctx.fillRect(0, i, size, 1);
  }
  ctx.strokeStyle = rgbCss(grainRgb);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.2;
  for (let n = 0; n < 18; n += 1) {
    const a = 4 + Math.random() * (size - 8);
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(a, 0);
      ctx.quadraticCurveTo(a + (Math.random() - 0.5) * 8, size * 0.5, a + (Math.random() - 0.5) * 6, size);
    } else {
      ctx.moveTo(0, a);
      ctx.quadraticCurveTo(size * 0.5, a + (Math.random() - 0.5) * 8, size, a + (Math.random() - 0.5) * 6);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (palingEdges) {
    const edgeW = 4;
    ctx.fillStyle = rgbCss(edgeRgb);
    ctx.fillRect(0, 0, edgeW, size);
    ctx.fillRect(size - edgeW, 0, edgeW, size);
  }
}

function makeWoodTexture({ vertical, light, mid, dark, palingEdges = false }) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  fillWoodGrain(ctx, size, { vertical, light, mid, dark, palingEdges });
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createPalingTexture() {
  return makeWoodTexture({
    vertical: true,
    light: [196, 154, 96],
    mid: "#c49a62",
    dark: "#6a4424",
    palingEdges: true,
  });
}

function createRailTexture() {
  return makeWoodTexture({
    vertical: false,
    light: [168, 122, 72],
    mid: "#a07848",
    dark: "#5a3818",
  });
}

function createPostTexture() {
  return makeWoodTexture({
    vertical: true,
    light: [168, 122, 72],
    mid: "#a07848",
    dark: "#5a3818",
    palingEdges: true,
  });
}

function palingCountForRun(runLengthM) {
  const usable = Math.max(FENCE_PALING_WIDTH_M, runLengthM - FENCE_PALING_THICKNESS_M * 2);
  const pitch = FENCE_PALING_WIDTH_M - FENCE_PALING_OVERLAP_M;
  return Math.max(1, Math.round((usable - FENCE_PALING_OVERLAP_M) / pitch));
}

function addPalingRun(mesh, dummy, tone, indexRef, { count, alongHalf, ax, az, px, pz, faceHalf, rotY }) {
  const pitch = FENCE_PALING_WIDTH_M - FENCE_PALING_OVERLAP_M;
  const palingInset = FENCE_PALING_THICKNESS_M / 2;
  for (let i = 0; i < count; i += 1) {
    const along =
      -alongHalf + FENCE_PALING_THICKNESS_M + FENCE_PALING_WIDTH_M / 2 + i * pitch;
    const lap = (i % 2) * FENCE_PALING_THICKNESS_M;
    dummy.position.set(
      ax * along + px * (faceHalf - palingInset - lap),
      FENCE_PALING_HEIGHT_M / 2,
      az * along + pz * (faceHalf - palingInset - lap)
    );
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    const index = indexRef.current;
    mesh.setMatrixAt(index, dummy.matrix);
    const hash = ((index * 1103515245 + 12345) >>> 0) / 4294967296;
    const shade = 0.97 + hash * 0.05;
    tone.setRGB(shade, shade, shade);
    mesh.setColorAt(index, tone);
    indexRef.current += 1;
  }
}

function addRailRuns(mesh, dummy, { radiusX, radiusZ, alongX }) {
  const railIndexStart = mesh.userData.nextIndex || 0;
  let railIndex = railIndexStart;
  const runs = alongX
    ? [
        { x: 0, z: radiusZ, rotY: 0 },
        { x: 0, z: -radiusZ, rotY: 0 },
      ]
    : [
        { x: radiusX, z: 0, rotY: Math.PI / 2 },
        { x: -radiusX, z: 0, rotY: Math.PI / 2 },
      ];
  for (const y of FENCE_RAIL_CENTERS_M) {
    for (const run of runs) {
      dummy.position.set(run.x, y, run.z);
      dummy.rotation.set(0, run.rotY, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(railIndex, dummy.matrix);
      railIndex += 1;
    }
  }
  mesh.userData.nextIndex = railIndex;
}

function postStationsAlong(lengthM) {
  const span = Math.max(FENCE_POST_CENTRES_M * 0.5, Number(lengthM) || 0);
  const bayCount = Math.max(1, Math.round(span / FENCE_POST_CENTRES_M));
  const step = span / bayCount;
  const stations = [];
  for (let i = 0; i <= bayCount; i += 1) {
    stations.push(-span / 2 + i * step);
  }
  return stations;
}

function fencePostPositions(width, depth) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const inset = FENCE_PALING_THICKNESS_M + FENCE_POST_SIZE_M / 2;
  const nx = Math.max(0, halfW - inset);
  const nz = Math.max(0, halfD - inset);
  const seen = new Set();
  const positions = [];
  const add = (x, z) => {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    positions.push({ x, z });
  };
  for (const x of postStationsAlong(width)) {
    add(x, nz);
    add(x, -nz);
  }
  for (const z of postStationsAlong(depth)) {
    add(nx, z);
    add(-nx, z);
  }
  return positions;
}

/**
 * Timber paling fence on the perimeter of a rectangular grass yard.
 * `groundSize` (number) is a centred square; or pass `{ widthM, depthM, centerX, centerZ }`.
 */
export function addTimberBoundaryFence(scene, groundSize) {
  const opts = typeof groundSize === "number" || groundSize == null ? { widthM: groundSize, depthM: groundSize } : groundSize;
  const width = Math.max(FENCE_PALING_WIDTH_M * 4, Number(opts.widthM) || 40);
  const depth = Math.max(FENCE_PALING_WIDTH_M * 4, Number(opts.depthM) || width);
  const centerX = Number(opts.centerX) || 0;
  const centerZ = Number(opts.centerZ) || 0;
  const halfW = width / 2;
  const halfD = depth / 2;
  const nsCount = palingCountForRun(width);
  const ewCount = palingCountForRun(depth);
  const railInset = FENCE_PALING_THICKNESS_M * 2 + FENCE_RAIL_DEPTH_M / 2;
  const nsRailLength = width - FENCE_PALING_THICKNESS_M * 2;
  const ewRailLength = depth - FENCE_PALING_THICKNESS_M * 2;

  const palingTexture = createPalingTexture();
  const nsRailTexture = createRailTexture();
  nsRailTexture.repeat.set(Math.max(1, nsRailLength / 0.18), 1);
  const ewRailTexture = createRailTexture();
  ewRailTexture.repeat.set(Math.max(1, ewRailLength / 0.18), 1);

  const palingMaterial = new THREE.MeshStandardMaterial({
    map: palingTexture,
    roughness: 0.9,
    metalness: 0.02,
  });
  const nsRailMaterial = new THREE.MeshStandardMaterial({
    map: nsRailTexture,
    roughness: 0.88,
    metalness: 0.02,
  });
  const ewRailMaterial = new THREE.MeshStandardMaterial({
    map: ewRailTexture,
    roughness: 0.88,
    metalness: 0.02,
  });

  const fence = new THREE.Group();
  fence.name = "timber-fence";

  const palingGeo = new THREE.BoxGeometry(
    FENCE_PALING_WIDTH_M,
    FENCE_PALING_HEIGHT_M,
    FENCE_PALING_THICKNESS_M
  );
  const palingMesh = new THREE.InstancedMesh(
    palingGeo,
    palingMaterial,
    nsCount * 2 + ewCount * 2
  );
  palingMesh.name = "timber-fence-palings";
  palingMesh.castShadow = true;
  palingMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tone = new THREE.Color();
  const indexRef = { current: 0 };
  addPalingRun(palingMesh, dummy, tone, indexRef, {
    count: nsCount,
    alongHalf: halfW,
    ax: 1,
    az: 0,
    px: 0,
    pz: 1,
    faceHalf: halfD,
    rotY: 0,
  });
  addPalingRun(palingMesh, dummy, tone, indexRef, {
    count: nsCount,
    alongHalf: halfW,
    ax: 1,
    az: 0,
    px: 0,
    pz: -1,
    faceHalf: halfD,
    rotY: 0,
  });
  addPalingRun(palingMesh, dummy, tone, indexRef, {
    count: ewCount,
    alongHalf: halfD,
    ax: 0,
    az: 1,
    px: 1,
    pz: 0,
    faceHalf: halfW,
    rotY: Math.PI / 2,
  });
  addPalingRun(palingMesh, dummy, tone, indexRef, {
    count: ewCount,
    alongHalf: halfD,
    ax: 0,
    az: 1,
    px: -1,
    pz: 0,
    faceHalf: halfW,
    rotY: Math.PI / 2,
  });
  palingMesh.instanceMatrix.needsUpdate = true;
  if (palingMesh.instanceColor) palingMesh.instanceColor.needsUpdate = true;
  fence.add(palingMesh);

  const nsRailGeo = new THREE.BoxGeometry(nsRailLength, FENCE_RAIL_HEIGHT_M, FENCE_RAIL_DEPTH_M);
  const nsRailMesh = new THREE.InstancedMesh(
    nsRailGeo,
    nsRailMaterial,
    2 * FENCE_RAIL_CENTERS_M.length
  );
  nsRailMesh.name = "timber-fence-rails-ns";
  nsRailMesh.castShadow = true;
  nsRailMesh.receiveShadow = true;
  addRailRuns(nsRailMesh, dummy, {
    radiusX: halfW - railInset,
    radiusZ: halfD - railInset,
    alongX: true,
  });
  nsRailMesh.instanceMatrix.needsUpdate = true;
  fence.add(nsRailMesh);

  const ewRailGeo = new THREE.BoxGeometry(ewRailLength, FENCE_RAIL_HEIGHT_M, FENCE_RAIL_DEPTH_M);
  const ewRailMesh = new THREE.InstancedMesh(
    ewRailGeo,
    ewRailMaterial,
    2 * FENCE_RAIL_CENTERS_M.length
  );
  ewRailMesh.name = "timber-fence-rails-ew";
  ewRailMesh.castShadow = true;
  ewRailMesh.receiveShadow = true;
  addRailRuns(ewRailMesh, dummy, {
    radiusX: halfW - railInset,
    radiusZ: halfD - railInset,
    alongX: false,
  });
  ewRailMesh.instanceMatrix.needsUpdate = true;
  fence.add(ewRailMesh);

  const postPositions = fencePostPositions(width, depth);
  if (postPositions.length) {
    const postTexture = createPostTexture();
    const postMaterial = new THREE.MeshStandardMaterial({
      map: postTexture,
      roughness: 0.88,
      metalness: 0.02,
    });
    const postGeo = new THREE.BoxGeometry(
      FENCE_POST_SIZE_M,
      FENCE_POST_HEIGHT_M,
      FENCE_POST_SIZE_M
    );
    const postMesh = new THREE.InstancedMesh(postGeo, postMaterial, postPositions.length);
    postMesh.name = "timber-fence-posts";
    postMesh.castShadow = true;
    postMesh.receiveShadow = true;
    postPositions.forEach((pos, i) => {
      dummy.position.set(pos.x, FENCE_POST_HEIGHT_M / 2, pos.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      postMesh.setMatrixAt(i, dummy.matrix);
    });
    postMesh.instanceMatrix.needsUpdate = true;
    fence.add(postMesh);
  }

  fence.position.set(centerX, 0, centerZ);
  scene.add(fence);
  return fence;
}
