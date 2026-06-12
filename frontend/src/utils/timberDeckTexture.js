import * as THREE from "three";

/** Timber board spacing for deck texture (m). */
export const TIMBER_DECK_BOARD_PITCH_M = 0.14;

const TEXTURE_SIZE = 128;

export function createTimberDeckTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  ctx.fillStyle = "#b8956a";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const boardH = Math.max(6, Math.floor(TEXTURE_SIZE / 9));
  for (let y = 0; y < TEXTURE_SIZE; y += boardH) {
    const shade = 0.88 + ((y / boardH) % 3) * 0.04;
    ctx.fillStyle = `rgb(${Math.floor(184 * shade)}, ${Math.floor(149 * shade)}, ${Math.floor(106 * shade)})`;
    ctx.fillRect(0, y, TEXTURE_SIZE, boardH - 1);
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(0, y + boardH - 1, TEXTURE_SIZE, 1);
  }

  for (let i = 0; i < 40; i += 1) {
    const x = Math.random() * TEXTURE_SIZE;
    const y = Math.random() * TEXTURE_SIZE;
    ctx.fillStyle = `rgba(70, 45, 20, ${0.04 + Math.random() * 0.08})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 4 + Math.random() * 10);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createTimberDeckMaterial(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
}

export function assignTimberDeckUVs(positions, uvs, pitchM = TIMBER_DECK_BOARD_PITCH_M) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    uvs[(i / 3) * 2] = x / pitchM;
    uvs[(i / 3) * 2 + 1] = z / pitchM;
  }
}
