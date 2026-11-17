import * as THREE from "three";

/** World span of the jungle ground bake: covers |x|,|z| < 140. */
export const JUNGLE_SPAN = 280;
const HALF = JUNGLE_SPAN / 2;

/** Trail corridors (world x,z waypoints). Shared with world.js so scenery can stay off the paths. */
export const JUNGLE_TRAILS = [
  { id: "camp-ferry", width: 3.2, points: [[0, -100], [-10, -92], [-22, -81], [-32, -72]] },
  { id: "ferry-bridge", width: 2.8, points: [[-32, -72], [-38, -66], [-48, -58], [-58, -52]] },
  { id: "bridge-outpost", width: 3.0, points: [[-58, -52], [-68, -38], [-76, -22], [-84, -8], [-86, -2]] },
  { id: "outpost-temple", width: 3.0, points: [[-84, -8], [-79, 4], [-79, 16], [-78, 30], [-66, 46], [-52, 56], [-40, 62], [-20, 78], [0, 88]] },
  { id: "temple-observatory", width: 3.0, points: [[0, 88], [14, 92], [30, 92], [52, 88], [70, 80], [88, 70], [100, 66], [108, 69]] },
  { id: "central", width: 2.2, points: [[0, -100], [0, -78], [0, -50], [0, -34], [0, 0], [0, 40], [0, 70], [0, 88]] },
];

function hash(ix, iy) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (v, p) => ((v % p) + p) % p;

/** Tileable value noise: x,y in noise space, px,py are integer periods. */
function pnoise(x, y, px, py) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const ax = wrap(x0, px);
  const bx = wrap(x0 + 1, px);
  const ay = wrap(y0, py);
  const by = wrap(y0 + 1, py);
  const a = hash(ax, ay);
  const b = hash(bx, ay);
  const c = hash(ax, by);
  const d = hash(bx, by);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(u, v, f) {
  return pnoise(u * f, v * f, f, f) * 0.55 + pnoise(u * f * 2, v * f * 2, f * 2, f * 2) * 0.3 + pnoise(u * f * 4, v * f * 4, f * 4, f * 4) * 0.15;
}

/** Tileable voronoi: distances in cell units. */
function voronoi(u, v, n) {
  const x = u * n;
  const y = v * n;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let d1 = 9;
  let d2 = 9;
  let id = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = ix + dx;
      const cy = iy + dy;
      const wx = wrap(cx, n);
      const wy = wrap(cy, n);
      const px = cx + 0.1 + hash(wx, wy) * 0.8;
      const py = cy + 0.1 + hash(wx + 101, wy + 57) * 0.8;
      const d = Math.hypot(px - x, py - y);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash(wx + 7, wy + 13);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return { d1, d2, id };
}

const clamp255 = (n) => (n < 0 ? 0 : n > 255 ? 255 : n);
const mix = (a, b, t) => a + (b - a) * t;
const frac = (n) => n - Math.floor(n);

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

function normalFrom(heights, size, strength) {
  const { board, ctx } = canvas(size, size);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const l = heights[y * size + ((x + size - 1) % size)];
      const r = heights[y * size + ((x + 1) % size)];
      const u = heights[((y + size - 1) % size) * size + x];
      const d = heights[((y + 1) % size) * size + x];
      const nx = (l - r) * strength;
      const ny = (d - u) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      image.data[i] = (nx / len) * 127 + 128;
      image.data[i + 1] = (ny / len) * 127 + 128;
      image.data[i + 2] = (1 / len) * 127 + 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(board);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** shade(u, v, x, y) -> [r, g, b, height]. Tileable when shade is tileable. */
function surface(size, shade, withNormal = true, strength = 5) {
  const { board, ctx } = canvas(size, size);
  const image = ctx.createImageData(size, size);
  const heights = withNormal ? new Float32Array(size * size) : null;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = shade(x / size, y / size, x, y);
      const i = (y * size + x) * 4;
      image.data[i] = clamp255(px[0]);
      image.data[i + 1] = clamp255(px[1]);
      image.data[i + 2] = clamp255(px[2]);
      image.data[i + 3] = 255;
      if (heights) heights[y * size + x] = px[3] ?? 0.5;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { map: makeTexture(board), normal: heights ? normalFrom(heights, size, strength) : null, board };
}

function grass() {
  return surface(256, (u, v) => {
    const n = fbm(u, v, 4);
    const m = fbm(u + 0.37, v + 0.61, 12);
    const blade = pnoise(u * 96, v * 32, 96, 32);
    const t = n * 0.6 + m * 0.4;
    return [44 + t * 42 + blade * 22, 88 + t * 62 + blade * 46, 30 + t * 20 + blade * 10, 0.4 + blade * 0.5];
  });
}

function dirt() {
  return surface(256, (u, v) => {
    const vr = voronoi(u, v, 18);
    const n = fbm(u, v, 5);
    const m = fbm(u, v, 16);
    const pebble = vr.d1 < 0.24;
    let base = 108 + n * 50 + m * 22;
    if (pebble) base += (0.24 - vr.d1) * 120 * (0.6 + vr.id * 0.8);
    return [base, base * 0.76, base * 0.52, pebble ? 0.6 + (0.24 - vr.d1) * 1.6 : 0.3 + n * 0.3];
  });
}

function stone() {
  const size = 256;
  return surface(size, (u, v) => {
    const rows = 6;
    const cols = 3;
    const row = Math.floor(v * rows);
    const bu = u * cols + (row % 2) * 0.5;
    const col = Math.floor(bu);
    const fx = bu - col;
    const fy = v * rows - row;
    const ex = Math.min(fx, 1 - fx) * (size / cols);
    const ey = Math.min(fy, 1 - fy) * (size / rows);
    const edge = ex < 2.5 || ey < 2.5;
    const bh = hash(wrap(col, cols) + row * 7, row + 3);
    const n = fbm(u, v, 6);
    const grit = fbm(u, v, 24);
    const shade = 0.78 + bh * 0.3 + n * 0.28 + grit * 0.1;
    let r = 150 * shade;
    let g = 146 * shade;
    let b = 132 * shade;
    const moss = fbm(u + 0.2, v + 0.5, 7) + (1 - fy) * 0.12;
    if (moss > 0.62) {
      const t = Math.min(1, (moss - 0.62) * 5);
      r = mix(r, 68, t * 0.8);
      g = mix(g, 98, t * 0.8);
      b = mix(b, 50, t * 0.8);
    }
    if (edge) return [58, 54, 46, 0.1];
    return [r, g, b, 0.55 + n * 0.3 + grit * 0.15];
  });
}

function timber() {
  return surface(256, (u, v) => {
    const planks = 8;
    const p = Math.floor(u * planks);
    const fx = u * planks - p;
    const ph = hash(p + 11, 3);
    const grain = pnoise(u * planks * 10, v * 4 + ph * 9, planks * 10, 4);
    const wear = fbm(u, v, 5);
    const shade = 0.7 + ph * 0.34 + grain * 0.36;
    let r = 120 * shade;
    let g = 92 * shade;
    let b = 64 * shade;
    if (wear > 0.6) {
      const t = Math.min(1, (wear - 0.6) * 4);
      r = mix(r, 74, t * 0.5);
      g = mix(g, 92, t * 0.5);
      b = mix(b, 62, t * 0.5);
    }
    const seam = fx < 0.04 || fx > 0.96;
    const batten = Math.abs(v - 0.5) < 0.016 || Math.abs(v - 0.02) < 0.012 || Math.abs(v - 0.98) < 0.012;
    const nail = batten && Math.abs(fx - 0.5) < 0.04;
    if (seam) return [38, 28, 20, 0.1];
    if (nail) return [150, 150, 150, 0.9];
    if (batten) return [r * 0.72, g * 0.72, b * 0.72, 0.8];
    return [r, g, b, 0.45 + grain * 0.3];
  });
}

function canvasCloth() {
  return surface(256, (u, v, x, y) => {
    const weave = ((x + y) % 4 < 2 ? 5 : 0) + ((x - y + 256) % 4 < 2 ? 4 : 0);
    const fold = fbm(u, v, 3) * 36 + fbm(u, v, 10) * 12;
    let r = 214 + weave - fold * 0.45;
    let g = 200 + weave - fold * 0.45;
    let b = 164 + weave - fold * 0.5;
    const seamPos = Math.abs(frac(u * 4 + 0.125) - 0.5);
    if (seamPos < 0.005 && y % 8 < 5) {
      r = 118;
      g = 104;
      b = 78;
    }
    if (seamPos < 0.012) {
      r *= 0.92;
      g *= 0.92;
      b *= 0.9;
    }
    return [r, g, b, 0.5 + weave * 0.04 + fold * 0.006];
  }, true, 3);
}

function rock() {
  return surface(256, (u, v) => {
    const vr = voronoi(u, v, 5);
    const n = fbm(u, v, 8);
    const n2 = fbm(u, v, 24);
    const edge = vr.d2 - vr.d1;
    let shade = 0.62 + vr.id * 0.4 + n * 0.34 + n2 * 0.14;
    if (edge < 0.08) shade *= 0.55;
    let r = 132 * shade;
    let g = 124 * shade;
    let b = 110 * shade;
    const moss = fbm(u + 0.4, v + 0.1, 6);
    if (moss > 0.6) {
      const t = Math.min(1, (moss - 0.6) * 5);
      r = mix(r, 60, t * 0.7);
      g = mix(g, 92, t * 0.7);
      b = mix(b, 46, t * 0.7);
    }
    return [r, g, b, 0.9 - vr.d1 * 0.9 + n2 * 0.25 - (edge < 0.08 ? 0.3 : 0)];
  });
}

function metal() {
  const size = 256;
  return surface(size, (u, v) => {
    const pl = 2;
    const fx = frac(u * pl);
    const fy = frac(v * pl);
    const ex = Math.min(fx, 1 - fx) * (size / pl);
    const ey = Math.min(fy, 1 - fy) * (size / pl);
    const streak = pnoise(u * 8, v * 40, 8, 40);
    const base = 86 + fbm(u, v, 6) * 34 + streak * 14;
    let r = base;
    let g = base + 4;
    let b = base + 8;
    const rust = fbm(u + 0.3, v + 0.8, 6) + streak * 0.12;
    if (rust > 0.56) {
      const t = Math.min(1, (rust - 0.56) * 4.5);
      r = mix(r, 150, t * 0.85);
      g = mix(g, 86, t * 0.85);
      b = mix(b, 46, t * 0.85);
    }
    const rivetX = Math.min(Math.abs(fx - 0.1), Math.abs(fx - 0.9)) * (size / pl);
    const rivetY = Math.min(Math.abs(fy - 0.1), Math.abs(fy - 0.9)) * (size / pl);
    if (ex < 2 || ey < 2) return [r * 0.45, g * 0.45, b * 0.45, 0.1];
    if (Math.hypot(rivetX, rivetY) < 3.4) return [r * 1.25, g * 1.25, b * 1.25, 0.95];
    return [r, g, b, 0.5 + streak * 0.1];
  }, true, 3);
}

function brass() {
  return surface(128, (u, v) => {
    const streak = pnoise(u * 4, v * 64, 4, 64);
    const n = fbm(u, v, 4);
    let r = 176 + streak * 36 + n * 22;
    let g = 132 + streak * 28 + n * 16;
    let b = 52 + streak * 14;
    const patina = fbm(u + 0.6, v + 0.2, 5);
    if (patina > 0.62) {
      const t = Math.min(1, (patina - 0.62) * 5);
      r = mix(r, 72, t * 0.7);
      g = mix(g, 136, t * 0.7);
      b = mix(b, 112, t * 0.7);
    }
    return [r, g, b, 0.5 + streak * 0.15];
  }, true, 2);
}

function water() {
  return surface(256, (u, v) => {
    const f = fbm(u, v, 5);
    const f2 = fbm(u + 0.5, v + 0.25, 10);
    const wave = Math.sin((u * 4 + f * 2.2) * Math.PI * 2) * 0.5 + 0.5;
    const wave2 = Math.sin((v * 6 + f2 * 1.6 + u * 2) * Math.PI * 2) * 0.5 + 0.5;
    const glint = Math.max(0, wave * wave2 - 0.55) * 1.9;
    const deep = 0.55 + f * 0.5;
    return [34 + deep * 28 + glint * 90, 92 + deep * 42 + glint * 100, 98 + deep * 36 + glint * 80, wave * 0.5 + wave2 * 0.35 + f2 * 0.3];
  }, true, 4);
}

function cobble() {
  return surface(256, (u, v) => {
    const vr = voronoi(u, v, 9);
    const n = fbm(u, v, 8);
    const edge = vr.d2 - vr.d1;
    if (edge < 0.13) return [70, 58, 44, 0.12];
    const shade = 0.66 + vr.id * 0.46 + n * 0.22;
    const warm = vr.id > 0.55 ? 12 : 0;
    return [150 * shade + warm, 142 * shade + warm * 0.4, 126 * shade, 0.55 + (0.5 - vr.d1) * 0.5];
  });
}

function leaves() {
  const size = 256;
  const { board, ctx } = canvas(size, size);
  ctx.fillStyle = "#1d4727";
  ctx.fillRect(0, 0, size, size);
  const rnd = rand(77);
  for (let i = 0; i < 520; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const ang = rnd() * Math.PI * 2;
    const len = 18 + rnd() * 18;
    const wid = 7 + rnd() * 6;
    const hue = 90 + rnd() * 46;
    const sat = 38 + rnd() * 24;
    const lit = 17 + rnd() * 20;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -len || x + ox > size + len || y + oy < -len || y + oy > size + len) continue;
        ctx.fillStyle = `hsl(${hue} ${sat}% ${lit}%)`;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, len / 2, wid / 2, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `hsla(${hue} ${sat}% ${lit + 12}% / 0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + ox - Math.cos(ang) * len * 0.45, y + oy - Math.sin(ang) * len * 0.45);
        ctx.lineTo(x + ox + Math.cos(ang) * len * 0.45, y + oy + Math.sin(ang) * len * 0.45);
        ctx.stroke();
      }
    }
  }
  return { map: makeTexture(board), normal: null, board };
}

/** Linear-space grey detail tile (mean ~0.52) multiplied over the baked ground. */
function detailTile() {
  const size = 128;
  const { board, ctx } = canvas(size, size);
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u, v, 8) * 0.6 + pnoise(u * 32, v * 32, 32, 32) * 0.4;
      const val = clamp255(100 + (n - 0.5) * 120);
      const i = (y * size + x) * 4;
      image.data[i] = val;
      image.data[i + 1] = val;
      image.data[i + 2] = val;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(board);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function paintSign(title) {
  const { board, ctx } = canvas(512, 160);
  ctx.fillStyle = "#33261a";
  ctx.fillRect(0, 0, 512, 160);
  for (let i = 0; i < 9; i += 1) {
    ctx.fillStyle = i % 2 ? "rgba(90,62,36,0.35)" : "rgba(20,12,6,0.25)";
    ctx.fillRect(0, i * 18, 512, 8);
  }
  ctx.strokeStyle = "#d9c38a";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.fillStyle = "#f2e6c2";
  let px = 50;
  ctx.font = `700 ${px}px Georgia`;
  while (ctx.measureText(title).width > 440 && px > 18) {
    px -= 2;
    ctx.font = `700 ${px}px Georgia`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, 256, 82);
  return makeTexture(board, false);
}

function paintTile(kind) {
  const { board, ctx } = canvas(256, 256);
  ctx.fillStyle = "#cdb98e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#6a5434";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);
  if (kind === "sun") {
    ctx.fillStyle = "#e8a423";
    ctx.beginPath();
    ctx.arc(128, 140, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c4571e";
    ctx.lineWidth = 9;
    for (let i = 0; i < 11; i += 1) {
      const a = Math.PI + (i / 10) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 66, 140 + Math.sin(a) * 66);
      ctx.lineTo(128 + Math.cos(a) * 96, 140 + Math.sin(a) * 96);
      ctx.stroke();
    }
  } else if (kind === "river") {
    ctx.strokeStyle = "#1f6fa8";
    ctx.lineWidth = 16;
    for (let row = 0; row < 3; row += 1) {
      ctx.beginPath();
      ctx.moveTo(30, 70 + row * 55);
      for (let i = 1; i <= 4; i += 1) ctx.lineTo(30 + i * 49, 70 + row * 55 + (i % 2 ? -22 : 22));
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = "#1c2650";
    ctx.fillRect(18, 18, 220, 220);
    ctx.fillStyle = "#fff6d0";
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 22 : 66;
      ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  return makeTexture(board, false);
}

function paintChart() {
  const { board, ctx } = canvas(512, 384);
  ctx.fillStyle = "#16203a";
  ctx.fillRect(0, 0, 512, 384);
  ctx.strokeStyle = "#c9b27a";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 368);
  const rnd = rand(404);
  ctx.fillStyle = "#f4efd8";
  const stars = [];
  for (let i = 0; i < 70; i += 1) {
    const sx = 24 + rnd() * 464;
    const sy = 24 + rnd() * 336;
    stars.push([sx, sy]);
    ctx.beginPath();
    ctx.arc(sx, sy, 1 + rnd() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(220,205,150,0.55)";
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k += 1) {
    ctx.beginPath();
    for (let j = 0; j < 5; j += 1) {
      const s = stars[(k * 7 + j * 3) % stars.length];
      if (j === 0) ctx.moveTo(s[0], s[1]);
      else ctx.lineTo(s[0], s[1]);
    }
    ctx.stroke();
  }
  ctx.fillStyle = "#c9b27a";
  ctx.font = "italic 20px Georgia";
  ctx.fillText("margin notes ->", 340, 360);
  return makeTexture(board, false);
}

function paintDigit(ch) {
  const { board, ctx } = canvas(128, 128);
  ctx.fillStyle = "#2a2118";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#c9a14a";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f5e3a8";
  ctx.font = "700 78px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(ch), 64, 70);
  return makeTexture(board, false);
}

export function createJungleTextures() {
  const maps = {
    dirt: dirt(),
    grass: grass(),
    stone: stone(),
    timber: timber(),
    canvas: canvasCloth(),
    rock: rock(),
    metal: metal(),
    brass: brass(),
    water: water(),
    leaves: leaves(),
    cobble: cobble(),
  };
  const detail = detailTile();
  const signs = {};
  const tiles = {};
  const digits = {};
  let chartMap = null;
  return {
    maps,
    detail,
    sign(title) {
      if (!signs[title]) signs[title] = paintSign(title);
      return signs[title];
    },
    tile(kind) {
      if (!tiles[kind]) tiles[kind] = paintTile(kind);
      return tiles[kind];
    },
    chart() {
      if (!chartMap) chartMap = paintChart();
      return chartMap;
    },
    digit(ch) {
      if (!digits[ch]) digits[ch] = paintDigit(ch);
      return digits[ch];
    },
    dispose() {
      Object.values(maps).forEach((entry) => {
        entry.map.dispose();
        entry.normal?.dispose();
      });
      detail.dispose();
      [signs, tiles, digits].forEach((group) => Object.values(group).forEach((texture) => texture.dispose()));
      chartMap?.dispose();
    },
  };
}

function tileOf(source, size) {
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  tile.getContext("2d").drawImage(source, 0, 0, size, size);
  return tile;
}

function distToPolyline(points, x, z) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Shortest distance from (x, z) to any trail corridor centerline. */
export function distToTrails(x, z) {
  let best = Infinity;
  for (const trail of JUNGLE_TRAILS) best = Math.min(best, distToPolyline(trail.points, x, z));
  return best;
}

function vnoise(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, 7) * (1 - u) + hash(i + 1, 7) * u;
}

/** Subdivide a waypoint list into a gently wandering polyline that still hits every waypoint. */
function wander(points, seed) {
  const out = [];
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.round(len / 3));
    const nx = -(bz - az) / (len || 1);
    const nz = (bx - ax) / (len || 1);
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      const off = Math.sin(Math.PI * t) * (vnoise((travelled + t * len) * 0.11 + seed * 13) - 0.5) * 2.6;
      out.push([ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off]);
    }
    travelled += len;
  }
  out.push(points[points.length - 1]);
  return out;
}

export function bakeJungleGround() {
  const size = 2048;
  const s = size / JUNGLE_SPAN;
  const px = (x) => (x + HALF) * s;
  const pz = (z) => (z + HALF) * s;
  const { board, ctx } = canvas(size, size);
  const rnd = rand(2026);
  const lawn = grass();
  const soil = dirt();
  const cob = cobble();
  const grassPattern = ctx.createPattern(tileOf(lawn.board, 128), "repeat");
  const dirtPattern = ctx.createPattern(tileOf(soil.board, 128), "repeat");
  const cobblePattern = ctx.createPattern(tileOf(cob.board, 96), "repeat");

  ctx.fillStyle = grassPattern;
  ctx.fillRect(0, 0, size, size);

  // Large-scale tint so the jungle floor is not one flat green.
  const tint = canvas(128, 128);
  const tintImage = tint.ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const n = fbm(x / 128, y / 128, 4);
      const i = (y * 128 + x) * 4;
      if (n < 0.45) {
        tintImage.data[i] = 12;
        tintImage.data[i + 1] = 40;
        tintImage.data[i + 2] = 16;
        tintImage.data[i + 3] = Math.min(190, (0.45 - n) * 560);
      } else if (n > 0.56) {
        tintImage.data[i] = 168;
        tintImage.data[i + 1] = 188;
        tintImage.data[i + 2] = 72;
        tintImage.data[i + 3] = Math.min(120, (n - 0.56) * 420);
      }
    }
  }
  tint.ctx.putImageData(tintImage, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tint.board, 0, 0, size, size);

  const areas = [
    { x: 8, z: -98, rx: 29, rz: 15, pattern: dirtPattern },
    { x: -98, z: 0, rx: 19, rz: 34, pattern: dirtPattern },
    { x: 0, z: 96, rx: 24, rz: 21, pattern: cobblePattern },
    { x: 110, z: 82, rx: 26, rz: 20, pattern: cobblePattern },
    { x: 124, z: 76, rx: 10, rz: 12, pattern: dirtPattern },
    { x: 0, z: -34, rx: 4.5, rz: 6, pattern: cobblePattern },
    { x: -32, z: -72, rx: 5.5, rz: 5, pattern: dirtPattern },
    { x: -38, z: -66, rx: 4.5, rz: 4.5, pattern: dirtPattern },
    { x: -48, z: -58, rx: 5, rz: 5, pattern: dirtPattern },
  ];
  for (const area of areas) {
    ctx.fillStyle = "rgba(58,44,24,0.3)";
    ctx.beginPath();
    ctx.ellipse(px(area.x), pz(area.z), (area.rx + 1.6) * s, (area.rz + 1.6) * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = area.pattern;
    ctx.beginPath();
    ctx.ellipse(px(area.x), pz(area.z), area.rx * s, area.rz * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  JUNGLE_TRAILS.forEach((trail, index) => {
    const path = wander(trail.points, index + 1);
    const trace = () => {
      ctx.beginPath();
      path.forEach(([x, z], i) => {
        if (i === 0) ctx.moveTo(px(x), pz(z));
        else ctx.lineTo(px(x), pz(z));
      });
    };
    ctx.strokeStyle = "rgba(58,44,24,0.3)";
    ctx.lineWidth = (trail.width + 2.2) * s;
    trace();
    ctx.stroke();
    ctx.strokeStyle = dirtPattern;
    ctx.lineWidth = trail.width * s;
    trace();
    ctx.stroke();
    ctx.strokeStyle = "rgba(210,180,130,0.16)";
    ctx.lineWidth = trail.width * 0.45 * s;
    trace();
    ctx.stroke();
    const count = Math.round(path.length * 9);
    for (let i = 0; i < count; i += 1) {
      const k = Math.floor(rnd() * (path.length - 1));
      const [ax, az] = path[k];
      const [bx, bz] = path[k + 1];
      const t = rnd();
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const side = (rnd() < 0.5 ? -1 : 1) * (trail.width * 0.5 + rnd() * 1.4);
      const cx = x + (-(bz - az) / len) * side;
      const cz = z + ((bx - ax) / len) * side;
      ctx.fillStyle = rnd() < 0.7 ? `rgba(${96 + rnd() * 40},${72 + rnd() * 24},${44 + rnd() * 16},0.55)` : `rgba(${70 + rnd() * 30},${110 + rnd() * 40},${40},0.5)`;
      ctx.beginPath();
      ctx.arc(px(cx), pz(cz), 1 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  lawn.map.dispose();
  lawn.normal?.dispose();
  soil.map.dispose();
  soil.normal?.dispose();
  cob.map.dispose();
  cob.normal?.dispose();

  // Canvas top row = world -z (matches the plane rotated flat with texture flipY).
  const texture = makeTexture(board, false);
  texture.flipY = true;
  texture.anisotropy = 8;
  return texture;
}
