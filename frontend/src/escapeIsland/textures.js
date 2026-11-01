import * as THREE from "three";

function hash2(ix, iy) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function wrap(n, period) {
  const m = n % period;
  return m < 0 ? m + period : m;
}

function noiseFree(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbmFree(x, y) {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < 5; i += 1) {
    value += amp * noiseFree(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return value;
}

export function bakeIslandGround(terrainHeight, anisotropy) {
  const size = 1536;
  const span = 108;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wx = (x / (size - 1) - 0.5) * span;
      const wz = (0.5 - y / (size - 1)) * span;
      const h = terrainHeight(wx, wz);
      const n = fbmFree(wx * 0.22, wz * 0.22);
      const grain = noiseFree(wx * 7.5, wz * 7.5);
      const speck = noiseFree(wx * 19, wz * 17);
      const beach = Math.min(1, Math.max(0, (h - 0.98) / 0.36));
      const ridge = Math.min(1, Math.max(0, (h - 2.35) / 0.9));
      const wet = 1 - Math.min(1, Math.max(0, (h - 0.18) / 0.28));
      let sand = lerpColor([214, 190, 136], [164, 132, 86], n);
      if (grain > 0.66) sand = lerpColor(sand, [128, 104, 72], 0.4);
      if (speck > 0.84) sand = lerpColor(sand, [118, 112, 102], 0.65);
      let grass = lerpColor([34, 104, 42], [78, 150, 62], n);
      grass = lerpColor(grass, grain > 0.6 ? [96, 168, 70] : [22, 72, 30], 0.5);
      if (speck > 0.8) grass = lerpColor(grass, [96, 78, 46], 0.35);
      let stone = lerpColor([132, 128, 120], [82, 80, 76], n);
      if (Math.abs(grain - 0.5) < 0.04) stone = [58, 56, 54];
      let col = lerpColor(sand, grass, beach + (grain - 0.5) * 0.08);
      col = lerpColor(col, stone, Math.max(0, ridge + (n - 0.5) * 0.12));
      if (wet > 0) col = lerpColor(col, [92, 78, 58], wet * 0.55);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, col[0]));
      data[i + 1] = Math.max(0, Math.min(255, col[1]));
      data[i + 2] = Math.max(0, Math.min(255, col[2]));
      data[i + 3] = 255;
      height[y * size + x] = grain;
    }
  }
  ctx.putImageData(image, 0, 0);
  const map = asTexture(canvas, anisotropy, true);
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nctx = normalCanvas.getContext("2d");
  const nimage = nctx.createImageData(size, size);
  const nd = nimage.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hL = height[y * size + Math.max(0, x - 1)];
      const hR = height[y * size + Math.min(size - 1, x + 1)];
      const hD = height[Math.max(0, y - 1) * size + x];
      const hU = height[Math.min(size - 1, y + 1) * size + x];
      let nx = (hL - hR) * 1.6;
      let ny = (hD - hU) * 1.6;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      nd[i] = (nx * 0.5 + 0.5) * 255;
      nd[i + 1] = (ny * 0.5 + 0.5) * 255;
      nd[i + 2] = (1 / len) * 127.5 + 127.5;
      nd[i + 3] = 255;
    }
  }
  nctx.putImageData(nimage, 0, 0);
  const normal = asTexture(normalCanvas, anisotropy, false);
  normal.wrapS = THREE.ClampToEdgeWrapping;
  normal.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normal };
}

function noise(x, y, px, py) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const h = (ix, iy) => hash2(wrap(ix, px), wrap(iy, py));
  const a = h(x0, y0);
  const b = h(x0 + 1, y0);
  const c = h(x0, y0 + 1);
  const d = h(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, px, py) {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  let qx = px;
  let qy = py;
  for (let i = 0; i < 4; i += 1) {
    value += amp * noise(x * freq, y * freq, qx, qy);
    freq *= 2;
    qx *= 2;
    qy *= 2;
    amp *= 0.5;
  }
  return value;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function paint(size, fn) {
  const color = document.createElement("canvas");
  color.width = size;
  color.height = size;
  const ctx = color.getContext("2d", { willReadFrequently: true });
  const image = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const data = image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sample = fn(x / size, y / size);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, sample[0]));
      data[i + 1] = Math.max(0, Math.min(255, sample[1]));
      data[i + 2] = Math.max(0, Math.min(255, sample[2]));
      data[i + 3] = 255;
      height[y * size + x] = sample[3];
    }
  }
  ctx.putImageData(image, 0, 0);

  const normal = document.createElement("canvas");
  normal.width = size;
  normal.height = size;
  const nctx = normal.getContext("2d");
  const nimage = nctx.createImageData(size, size);
  const nd = nimage.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hL = height[y * size + ((x + size - 1) % size)];
      const hR = height[y * size + ((x + 1) % size)];
      const hD = height[((y + size - 1) % size) * size + x];
      const hU = height[((y + 1) % size) * size + x];
      let nx = (hL - hR) * 2.4;
      let ny = (hD - hU) * 2.4;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      nd[i] = (nx * 0.5 + 0.5) * 255;
      nd[i + 1] = (ny * 0.5 + 0.5) * 255;
      nd[i + 2] = (nz / len) * 127.5 + 127.5;
      nd[i + 3] = 255;
    }
  }
  nctx.putImageData(nimage, 0, 0);
  return { color, normal };
}

function asTexture(canvas, anisotropy, srgb) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function maps(size, anisotropy, fn) {
  const painted = paint(size, fn);
  return {
    map: asTexture(painted.color, anisotropy, true),
    normal: asTexture(painted.normal, anisotropy, false),
  };
}

function palmLeafCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 160, 512);
  const leaf = ctx.createLinearGradient(0, 0, 0, 512);
  leaf.addColorStop(0, "#3ea84a");
  leaf.addColorStop(0.45, "#1f7a32");
  leaf.addColorStop(1, "#145624");
  ctx.fillStyle = leaf;
  ctx.beginPath();
  ctx.moveTo(80, 6);
  ctx.quadraticCurveTo(154, 180, 92, 500);
  ctx.quadraticCurveTo(80, 470, 68, 500);
  ctx.quadraticCurveTo(6, 180, 80, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(18, 70, 28, 0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, 20);
  ctx.lineTo(80, 490);
  ctx.stroke();
  for (let i = 0; i < 18; i += 1) {
    const y = 40 + i * 24;
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(48 - i, y + 28);
    ctx.moveTo(80, y);
    ctx.lineTo(112 + i, y + 28);
    ctx.stroke();
  }
  return canvas;
}

export function createIslandTextures(anisotropy) {
  const limit = Math.max(1, Math.min(anisotropy || 4, 8));
  const sand = maps(512, limit, (u, v) => {
    const n = fbm(u * 8, v * 8, 8, 8);
    const grain = noise(u * 70, v * 70, 70, 70);
    const pebble = noise(u * 18, v * 22, 18, 22);
    let col = lerpColor([214, 190, 136], [168, 138, 90], n);
    if (grain > 0.68) col = lerpColor(col, [132, 108, 74], 0.45);
    if (pebble > 0.84) col = lerpColor(col, [124, 116, 104], 0.7);
    return [...col, n * 0.65 + grain * 0.35];
  });
  const grass = maps(512, limit, (u, v) => {
    const n = fbm(u * 6, v * 6, 6, 6);
    const blade = noise(u * 90, v * 8, 90, 8);
    const dirt = noise(u * 14, v * 14, 14, 14);
    let col = lerpColor([28, 92, 38], [62, 138, 58], n);
    col = lerpColor(col, blade > 0.58 ? [86, 156, 64] : [18, 68, 28], 0.55);
    if (dirt > 0.78) col = lerpColor(col, [92, 74, 42], 0.45);
    return [...col, blade];
  });
  const rock = maps(512, limit, (u, v) => {
    const n = fbm(u * 5, v * 5, 5, 5);
    const pit = noise(u * 16, v * 16, 16, 16);
    const crack = Math.abs(noise(u * 11, v * 13, 11, 13) - 0.5);
    let col = lerpColor([126, 122, 114], [78, 76, 72], n);
    if (crack < 0.035) col = [48, 46, 44];
    if (pit > 0.86) col = lerpColor(col, [92, 122, 78], 0.55);
    return [...col, crack < 0.035 ? 0 : 0.35 + n * 0.65];
  });
  const bark = maps(256, limit, (u, v) => {
    const groove = noise(u * 14, v * 5, 14, 5);
    const knot = noise(u * 3, v * 4, 3, 4);
    let col = lerpColor([92, 62, 38], [58, 36, 22], groove);
    if (groove > 0.72) col = lerpColor(col, [36, 22, 14], 0.65);
    if (knot > 0.84) col = lerpColor(col, [42, 28, 18], 0.8);
    return [...col, groove > 0.72 ? 0.15 : 0.7];
  });
  const leaf = maps(256, limit, (u, v) => {
    const n = fbm(u * 7, v * 7, 7, 7);
    const spot = noise(u * 20, v * 20, 20, 20);
    let col = lerpColor([20, 78, 32], [54, 132, 48], n);
    if (spot > 0.7) col = lerpColor(col, [16, 58, 24], 0.55);
    return [...col, spot];
  });
  const wood = maps(256, limit, (u, v) => {
    const boards = v * 5;
    const along = boards - Math.floor(boards);
    const grain = noise(u * 22, v * 6 + Math.floor(boards), 22, 6);
    let col = lerpColor([168, 124, 78], [122, 84, 52], grain);
    if (along < 0.07) col = [78, 54, 36];
    return [...col, along < 0.07 ? 0.1 : 0.55 + grain * 0.3];
  });
  const thatch = maps(256, limit, (u, v) => {
    const strand = noise(u * 10, v * 46, 10, 46);
    const band = noise(u * 4, v * 8, 4, 8);
    let col = lerpColor([186, 146, 72], [112, 74, 36], band);
    if (strand > 0.62) col = lerpColor(col, [214, 184, 110], 0.45);
    return [...col, strand];
  });
  const stone = maps(256, limit, (u, v) => {
    const row = Math.floor(v * 4);
    const uu = u + (row % 2) * 0.12;
    const bx = uu * 4;
    const by = v * 4;
    const mortar = (bx - Math.floor(bx)) < 0.08 || (by - Math.floor(by)) < 0.08;
    const n = noise(u * 10, v * 10, 10, 10);
    let col = lerpColor([168, 160, 146], [124, 118, 108], n);
    if (mortar) col = [92, 86, 78];
    return [...col, mortar ? 0.05 : 0.6 + n * 0.3];
  });
  const metal = maps(256, limit, (u, v) => {
    const rib = Math.abs(Math.sin(v * Math.PI * 22));
    const scratch = noise(u * 30, v * 8, 30, 8);
    let col = lerpColor([176, 184, 188], [120, 128, 134], 1 - rib);
    if (scratch > 0.8) col = lerpColor(col, [90, 94, 98], 0.4);
    return [...col, rib < 0.25 ? 0.2 : 0.75];
  });
  const water = maps(256, limit, (u, v) => {
    const rip = fbm(u * 10, v * 10, 10, 10);
    const glint = noise(u * 28, v * 28, 28, 28);
    let col = lerpColor([18, 96, 132], [46, 150, 176], rip);
    if (glint > 0.82) col = lerpColor(col, [210, 236, 240], 0.55);
    return [...col, rip];
  });
  const palm = asTexture(palmLeafCanvas(), limit, true);
  const all = [sand, grass, rock, bark, leaf, wood, thatch, stone, metal, water].flatMap((set) => [set.map, set.normal]);
  all.push(palm);
  return {
    sand,
    grass,
    rock,
    bark,
    leaf,
    wood,
    thatch,
    stone,
    metal,
    water,
    palm,
    dispose() {
      all.forEach((tex) => tex.dispose());
    },
  };
}
