import * as THREE from "three";

function hash(ix, iy) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y) {
  return noise(x, y) * 0.6 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.2, y * 4.2) * 0.1;
}

function canvas(width, height) {
  const board = document.createElement("canvas");
  board.width = width;
  board.height = height;
  return { board, ctx: board.getContext("2d") };
}

function makeTexture(board, repeat = true) {
  const texture = new THREE.CanvasTexture(board);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function heightToNormal(source, width, height) {
  const { board, ctx } = canvas(width, height);
  const image = ctx.createImageData(width, height);
  const at = (x, y) => source[(y + height) % height][x % width];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = at(x + 1, y) - at(x - 1 + width, y);
      const dy = at(x, y + 1) - at(x, y - 1 + height);
      const nx = -dx * 2.2;
      const ny = -dy * 2.2;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * width + x) * 4;
      image.data[i] = (nx / len) * 127 + 128;
      image.data[i + 1] = (ny / len) * 127 + 128;
      image.data[i + 2] = (nz / len) * 127 + 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(board);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function brick() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  const heights = Array.from({ length: height }, () => Array(width).fill(0.35));
  const mortar = [92, 84, 76];
  ctx.fillStyle = `rgb(${mortar.join(",")})`;
  ctx.fillRect(0, 0, width, height);
  const rows = 8;
  const rowH = height / rows;
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : 16;
    for (let col = -1; col < 5; col += 1) {
      const x = col * 32 + offset + 2;
      const y = row * rowH + 2;
      const shade = 0.78 + fbm(col * 1.7, row * 1.3) * 0.35;
      const r = Math.floor(148 * shade);
      const g = Math.floor(78 * shade);
      const b = Math.floor(62 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 28, rowH - 4);
      for (let py = Math.max(0, y); py < Math.min(height, y + rowH - 4); py += 1) {
        for (let px = Math.max(0, x); px < Math.min(width, x + 28); px += 1) {
          heights[py][px] = 0.75 + noise(px * 0.2, py * 0.2) * 0.25;
        }
      }
    }
  }
  return { map: makeTexture(board), normal: heightToNormal(heights, width, height) };
}

function stone() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  const heights = Array.from({ length: height }, () => Array(width).fill(0.4));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const blockX = Math.floor(x / 32);
      const blockY = Math.floor(y / 24);
      const edge = x % 32 < 2 || y % 24 < 2;
      const n = fbm(x * 0.08 + blockX, y * 0.08 + blockY);
      const shade = edge ? 0.55 : 0.82 + n * 0.28;
      const v = Math.floor(168 * shade);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      ctx.fillRect(x, y, 1, 1);
      heights[y][x] = edge ? 0.2 : 0.55 + n * 0.4;
    }
  }
  return { map: makeTexture(board), normal: heightToNormal(heights, width, height) };
}

function plaster() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = fbm(x * 0.12, y * 0.12);
      const v = Math.floor(214 + n * 28);
      ctx.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { map: makeTexture(board), normal: null };
}

function tiles() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  const heights = Array.from({ length: height }, () => Array(width).fill(0.3));
  ctx.fillStyle = "#5c4034";
  ctx.fillRect(0, 0, width, height);
  for (let row = 0; row < 8; row += 1) {
    const offset = row % 2 ? 16 : 0;
    for (let col = -1; col < 5; col += 1) {
      const shade = 0.7 + noise(col, row) * 0.45;
      const r = Math.floor(132 * shade);
      const g = Math.floor(58 * shade);
      const b = Math.floor(48 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const x = col * 32 + offset + 1;
      const y = row * 16 + 1;
      ctx.fillRect(x, y, 30, 14);
      for (let py = Math.max(0, y); py < Math.min(height, y + 14); py += 1) {
        for (let px = Math.max(0, x); px < Math.min(width, x + 30); px += 1) heights[py][px] = 0.8;
      }
    }
  }
  return { map: makeTexture(board), normal: heightToNormal(heights, width, height) };
}

function planks() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  const heights = Array.from({ length: height }, () => Array(width).fill(0.45));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const plank = Math.floor(y / 18);
      const seam = y % 18 < 2;
      const grain = noise(x * 0.15, plank * 3.2);
      const shade = seam ? 0.45 : 0.75 + grain * 0.35;
      const r = Math.floor(146 * shade);
      const g = Math.floor(104 * shade);
      const b = Math.floor(64 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
      heights[y][x] = seam ? 0.15 : 0.5 + grain * 0.3;
    }
  }
  return { map: makeTexture(board), normal: heightToNormal(heights, width, height) };
}

function cobble() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  const heights = Array.from({ length: height }, () => Array(width).fill(0.25));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const row = Math.floor(y / 16);
      const shift = row % 2 ? 8 : 0;
      const col = Math.floor((x + shift) / 16);
      const lx = (x + shift) % 16;
      const ly = y % 16;
      const edge = lx < 2 || ly < 2 || lx > 14 || ly > 14;
      const n = noise(col * 2.2, row * 2.2);
      const shade = edge ? 0.22 : 0.72 + n * 0.42;
      const v = Math.floor(168 * shade);
      const warm = n > 0.45 ? 14 : 0;
      ctx.fillStyle = `rgb(${v + warm},${v - 4},${v - 16})`;
      ctx.fillRect(x, y, 1, 1);
      heights[y][x] = edge ? 0.1 : 0.55 + n * 0.4;
    }
  }
  return { map: makeTexture(board), normal: heightToNormal(heights, width, height) };
}

function metal() {
  const width = 64;
  const height = 64;
  const { board, ctx } = canvas(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = noise(x * 0.35, y * 0.08);
      const v = Math.floor(70 + n * 50);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { map: makeTexture(board), normal: null };
}

function brass() {
  const width = 64;
  const height = 64;
  const { board, ctx } = canvas(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = noise(x * 0.3, y * 0.3);
      const r = Math.floor(176 + n * 40);
      const g = Math.floor(132 + n * 30);
      const b = Math.floor(48 + n * 20);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { map: makeTexture(board), normal: null };
}

function grass() {
  const width = 128;
  const height = 128;
  const { board, ctx } = canvas(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = fbm(x * 0.1, y * 0.1);
      const r = Math.floor(70 + n * 40);
      const g = Math.floor(110 + n * 50);
      const b = Math.floor(48 + n * 20);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { map: makeTexture(board), normal: null };
}

function paintSign(title) {
  const { board, ctx } = canvas(512, 160);
  ctx.fillStyle = "#1b2430";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#d4b36a";
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.fillStyle = "#f4ead4";
  ctx.font = "700 46px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 256, 82);
  return makeTexture(board, false);
}

export function createTownTextures() {
  const maps = {
    brick: brick(),
    stone: stone(),
    plaster: plaster(),
    tiles: tiles(),
    planks: planks(),
    cobble: cobble(),
    metal: metal(),
    brass: brass(),
    grass: grass(),
  };
  const signs = {};
  const sign = (title) => {
    if (!signs[title]) signs[title] = paintSign(title);
    return signs[title];
  };
  return {
    maps,
    sign,
    dispose() {
      Object.values(maps).forEach((entry) => {
        entry.map.dispose();
        entry.normal?.dispose();
      });
      Object.values(signs).forEach((texture) => texture.dispose());
    },
  };
}

const SPAN = 120;

function tileOf(image, size) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  tile.getContext("2d").drawImage(image, 0, 0, size, size);
  return tile;
}

function fillWorldRect(ctx, size, x0, z0, x1, z1) {
  const px = (x0 / SPAN + 0.5) * size;
  const py = (0.5 - z1 / SPAN) * size;
  const pw = ((x1 - x0) / SPAN) * size;
  const ph = ((z1 - z0) / SPAN) * size;
  ctx.fillRect(px, py, pw, ph);
}

export function bakeTownGround() {
  const size = 1024;
  const { board, ctx } = canvas(size, size);
  const cob = cobble();
  const lawn = grass();
  ctx.fillStyle = ctx.createPattern(tileOf(lawn.map.image, 48), "repeat");
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = ctx.createPattern(tileOf(cob.map.image, 40), "repeat");
  fillWorldRect(ctx, size, -8, -22, 8, 32);
  fillWorldRect(ctx, size, -40, -7, 42, 7);
  fillWorldRect(ctx, size, -20, -44, 20, -20);
  fillWorldRect(ctx, size, -15, -14, 15, 14);
  fillWorldRect(ctx, size, 32, -10, 54, 12);
  cob.map.dispose();
  cob.normal?.dispose();
  lawn.map.dispose();
  lawn.normal?.dispose();
  const texture = makeTexture(board, false);
  texture.flipY = true;
  return texture;
}

export const TOWN_SPAN = SPAN;
