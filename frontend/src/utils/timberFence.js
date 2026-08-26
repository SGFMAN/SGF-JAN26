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

function fillWoodGrain(ctx, size, { vertical, light, mid, dark }) {
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
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.22;
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
}

function makeWoodTexture({ vertical, light, mid, dark }) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();
  fillWoodGrain(ctx, size, { vertical, light, mid, dark });
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

function palingCountForRun(runLengthM) {
  const usable = Math.max(FENCE_PALING_WIDTH_M, runLengthM - FENCE_PALING_THICKNESS_M * 2);
  const pitch = FENCE_PALING_WIDTH_M - FENCE_PALING_OVERLAP_M;
  return Math.max(1, Math.round((usable - FENCE_PALING_OVERLAP_M) / pitch));
}

/**
 * Timber paling fence on the perimeter of the square grass plane (centred on origin).
 */
export function addTimberBoundaryFence(scene, groundSize) {
  const size = Math.max(FENCE_PALING_WIDTH_M * 4, Number(groundSize) || 40);
  const half = size / 2;
  const palingCount = palingCountForRun(size);
  const pitch = FENCE_PALING_WIDTH_M - FENCE_PALING_OVERLAP_M;
  const palingInset = FENCE_PALING_THICKNESS_M / 2;
  const railRadius = half - FENCE_PALING_THICKNESS_M * 2 - FENCE_RAIL_DEPTH_M / 2;
  const railLength = size - FENCE_PALING_THICKNESS_M * 2;

  const palingTexture = createPalingTexture();
  const railTexture = createRailTexture();
  railTexture.repeat.set(Math.max(1, railLength / 0.18), 1);

  const palingMaterial = new THREE.MeshStandardMaterial({
    map: palingTexture,
    roughness: 0.9,
    metalness: 0.02,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    map: railTexture,
    roughness: 0.88,
    metalness: 0.02,
  });

  const fence = new THREE.Group();
  fence.name = "timber-fence";

  const sides = [
    { ax: 1, az: 0, px: 0, pz: 1, rotY: 0 },
    { ax: 1, az: 0, px: 0, pz: -1, rotY: 0 },
    { ax: 0, az: 1, px: 1, pz: 0, rotY: Math.PI / 2 },
    { ax: 0, az: 1, px: -1, pz: 0, rotY: Math.PI / 2 },
  ];

  const palingGeo = new THREE.BoxGeometry(
    FENCE_PALING_WIDTH_M,
    FENCE_PALING_HEIGHT_M,
    FENCE_PALING_THICKNESS_M
  );
  const palingMesh = new THREE.InstancedMesh(
    palingGeo,
    palingMaterial,
    palingCount * sides.length
  );
  palingMesh.name = "timber-fence-palings";
  palingMesh.castShadow = true;
  palingMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tone = new THREE.Color();
  let index = 0;
  for (const side of sides) {
    for (let i = 0; i < palingCount; i += 1) {
      const along =
        -half + FENCE_PALING_THICKNESS_M + FENCE_PALING_WIDTH_M / 2 + i * pitch;
      const lap = (i % 2) * FENCE_PALING_THICKNESS_M;
      dummy.position.set(
        side.ax * along + side.px * (half - palingInset - lap),
        FENCE_PALING_HEIGHT_M / 2,
        side.az * along + side.pz * (half - palingInset - lap)
      );
      dummy.rotation.set(0, side.rotY, 0);
      dummy.updateMatrix();
      palingMesh.setMatrixAt(index, dummy.matrix);
      const shade = 0.9 + ((index * 17) % 9) * 0.018;
      tone.setRGB(shade, shade * 0.96, shade * 0.88);
      palingMesh.setColorAt(index, tone);
      index += 1;
    }
  }
  palingMesh.instanceMatrix.needsUpdate = true;
  if (palingMesh.instanceColor) palingMesh.instanceColor.needsUpdate = true;
  fence.add(palingMesh);

  const railRuns = [
    { x: 0, z: railRadius, rotY: 0 },
    { x: 0, z: -railRadius, rotY: 0 },
    { x: railRadius, z: 0, rotY: Math.PI / 2 },
    { x: -railRadius, z: 0, rotY: Math.PI / 2 },
  ];
  const railGeo = new THREE.BoxGeometry(railLength, FENCE_RAIL_HEIGHT_M, FENCE_RAIL_DEPTH_M);
  const railMesh = new THREE.InstancedMesh(
    railGeo,
    railMaterial,
    railRuns.length * FENCE_RAIL_CENTERS_M.length
  );
  railMesh.name = "timber-fence-rails";
  railMesh.castShadow = true;
  railMesh.receiveShadow = true;

  let railIndex = 0;
  for (const y of FENCE_RAIL_CENTERS_M) {
    for (const run of railRuns) {
      dummy.position.set(run.x, y, run.z);
      dummy.rotation.set(0, run.rotY, 0);
      dummy.updateMatrix();
      railMesh.setMatrixAt(railIndex, dummy.matrix);
      railIndex += 1;
    }
  }
  railMesh.instanceMatrix.needsUpdate = true;
  fence.add(railMesh);

  scene.add(fence);
  return fence;
}
