import * as THREE from "three";

const EARTH_TEXTURE_SIZE = 256;

/** Procedural earth/dirt texture (repeatable). */
export function createEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = EARTH_TEXTURE_SIZE;
  canvas.height = EARTH_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  ctx.fillStyle = "#3d2914";
  ctx.fillRect(0, 0, EARTH_TEXTURE_SIZE, EARTH_TEXTURE_SIZE);

  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * EARTH_TEXTURE_SIZE;
    const y = Math.random() * EARTH_TEXTURE_SIZE;
    const r = 0.5 + Math.random() * 2.2;
    const shade = Math.random();
    ctx.fillStyle =
      shade < 0.45
        ? "rgba(22, 14, 8, 0.5)"
        : shade < 0.8
          ? "rgba(55, 38, 22, 0.38)"
          : "rgba(82, 58, 34, 0.25)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 12; i += 1) {
    const x = Math.random() * EARTH_TEXTURE_SIZE;
    const y = Math.random() * EARTH_TEXTURE_SIZE;
    const w = 20 + Math.random() * 60;
    const h = 8 + Math.random() * 24;
    ctx.fillStyle = `rgba(${35 + Math.random() * 25}, ${22 + Math.random() * 18}, ${12 + Math.random() * 12}, 0.22)`;
    ctx.fillRect(x, y, w, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createEarthMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });
}

/** World-space UVs — continuous across the full outer dirt shell. */
export function assignEarthUVs(positions, uvs, uvScale = 0.25) {
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    uvs[(i / 3) * 2] = x * uvScale;
    uvs[(i / 3) * 2 + 1] = y * uvScale + z * uvScale * 0.15;
  }
}

/** Procedural grass texture for the graded top surface. */
export function createGrassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = EARTH_TEXTURE_SIZE;
  canvas.height = EARTH_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Texture();
  }

  ctx.fillStyle = "#2a6b30";
  ctx.fillRect(0, 0, EARTH_TEXTURE_SIZE, EARTH_TEXTURE_SIZE);

  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * EARTH_TEXTURE_SIZE;
    const y = Math.random() * EARTH_TEXTURE_SIZE;
    const r = 6 + Math.random() * 18;
    ctx.fillStyle = `rgba(${18 + Math.random() * 20}, ${55 + Math.random() * 30}, ${20 + Math.random() * 15}, 0.35)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const drawBlade = (x, y, height, lean, width, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - height * 0.55, x + lean, y - height);
    ctx.stroke();
  };

  for (let i = 0; i < 3200; i += 1) {
    const clusterX = Math.random() * EARTH_TEXTURE_SIZE;
    const clusterY = Math.random() * EARTH_TEXTURE_SIZE;
    const bladeCount = 3 + Math.floor(Math.random() * 5);
    for (let b = 0; b < bladeCount; b += 1) {
      const x = clusterX + (Math.random() - 0.5) * 4;
      const y = clusterY + (Math.random() - 0.5) * 3;
      const height = 5 + Math.random() * 14;
      const lean = (Math.random() - 0.5) * 5;
      const width = 0.6 + Math.random() * 0.9;
      const shade = Math.random();
      const color =
        shade < 0.35
          ? `rgba(18, 72, 24, ${0.55 + Math.random() * 0.3})`
          : shade < 0.7
            ? `rgba(38, 110, 42, ${0.5 + Math.random() * 0.35})`
            : `rgba(95, 165, 58, ${0.4 + Math.random() * 0.35})`;
      drawBlade(x, y, height, lean, width, color);
    }
  }

  for (let i = 0; i < 600; i += 1) {
    const x = Math.random() * EARTH_TEXTURE_SIZE;
    const y = Math.random() * EARTH_TEXTURE_SIZE;
    drawBlade(
      x,
      y,
      3 + Math.random() * 6,
      (Math.random() - 0.5) * 3,
      0.5 + Math.random() * 0.5,
      `rgba(130, 195, 72, ${0.25 + Math.random() * 0.3})`
    );
  }

  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * EARTH_TEXTURE_SIZE;
    const y = Math.random() * EARTH_TEXTURE_SIZE;
    ctx.fillStyle = `rgba(${45 + Math.random() * 25}, ${32 + Math.random() * 18}, ${18 + Math.random() * 12}, 0.18)`;
    ctx.fillRect(x, y, 2 + Math.random() * 5, 1 + Math.random() * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGrassMaterial(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}

/** Planar UVs on the top surface (x/z metres). */
export function assignGrassUVs(positions, uvs, uvScale = 0.25) {
  for (let i = 0; i < positions.length; i += 3) {
    uvs[(i / 3) * 2] = positions[i] * uvScale;
    uvs[(i / 3) * 2 + 1] = positions[i + 2] * uvScale;
  }
}
