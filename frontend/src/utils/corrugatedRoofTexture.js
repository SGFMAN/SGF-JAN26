import * as THREE from "three";

/** Typical corrugated sheet rib spacing (m). */
export const CORRUGATED_ROOF_PITCH_M = 0.076;

const TEXTURE_SIZE = 128;

/** Procedural silver Colorbond-style corrugated roof texture (repeats along U). */
export function createCorrugatedRoofTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  const imageData = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const data = imageData.data;

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const phase = (x / TEXTURE_SIZE) * Math.PI * 2;
      const wave = Math.cos(phase);
      const crest = wave > 0 ? 0.1 : 0;
      const valley = wave < -0.6 ? -0.06 : 0;
      const lum = 0.68 + wave * 0.14 + crest + valley;
      const i = (y * TEXTURE_SIZE + x) * 4;
      data[i] = Math.min(255, Math.floor(lum * 218 + 8));
      data[i + 1] = Math.min(255, Math.floor(lum * 222 + 6));
      data[i + 2] = Math.min(255, Math.floor(lum * 232 + 10));
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCorrugatedRoofMaterial(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xc8ced8,
    metalness: 0.82,
    roughness: 0.26,
    side: THREE.FrontSide,
  });
}
