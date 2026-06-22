/**
 * Make the sky/cloud background of WIN95.png transparent.
 * Run: node scripts/make-win95-logo-transparent.mjs
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagePath = path.join(__dirname, "..", "src", "images", "WIN95.png");

/** Solid logo colours to keep (black, panes, text, white highlights). */
function isCoreLogoPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max < 55) {
    if (max < 28) return true;
    if (b <= r + 8 && b <= g + 8) return true;
    return false;
  }
  if (min > 215) return true;
  if (r > 165 && g < 140 && b < 100) return true;
  if (r > 190 && g > 150 && b < 140) return true;
  if (g > 120 && g > r + 20 && g > b + 10 && r < 160) return true;

  return false;
}

function isSkyOrHaloPixel(r, g, b) {
  if (isCoreLogoPixel(r, g, b)) return false;
  if (b >= 155 && b > r + 12 && b > g + 5 && g >= 90) return true;
  if (r >= 140 && g >= 155 && b >= 180) return true;
  if (b >= 125 && g >= 70 && r < 55 && b > r + 65) return true;
  return false;
}

const { data, info } = await sharp(imagePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

const { width, height } = info;
const channels = 4;
const out = Buffer.from(data);

function idx(x, y) {
  return y * width + x;
}

function alphaAt(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return out[idx(x, y) * channels + 3];
}

function rgbAt(x, y) {
  const o = idx(x, y) * channels;
  return [out[o], out[o + 1], out[o + 2]];
}

// Pass 1: flood sky from image edges.
const visited = new Uint8Array(width * height);
const queue = [];

function pushSky(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = idx(x, y);
  if (visited[i]) return;
  const [r, g, b] = rgbAt(x, y);
  if (!isSkyOrHaloPixel(r, g, b)) return;
  visited[i] = 1;
  queue.push(i);
}

for (let x = 0; x < width; x += 1) {
  pushSky(x, 0);
  pushSky(x, height - 1);
}
for (let y = 0; y < height; y += 1) {
  pushSky(0, y);
  pushSky(width - 1, y);
}

while (queue.length > 0) {
  const i = queue.pop();
  const x = i % width;
  const y = (i - x) / width;
  out[i * channels + 3] = 0;
  pushSky(x + 1, y);
  pushSky(x - 1, y);
  pushSky(x, y + 1);
  pushSky(x, y - 1);
}

// Pass 2: remove disconnected sky-coloured islands.
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const o = idx(x, y) * channels;
    if (out[o + 3] < 128) continue;
    if (isSkyOrHaloPixel(out[o], out[o + 1], out[o + 2])) out[o + 3] = 0;
  }
}

// Pass 3: peel non-core fringe pixels connected to transparency (grey/blue anti-alias).
const fringe = new Uint8Array(width * height);
const fringeQueue = [];

function pushFringe(x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = idx(x, y);
  if (fringe[i]) return;
  if (alphaAt(x, y) < 128) return;
  const [r, g, b] = rgbAt(x, y);
  if (isCoreLogoPixel(r, g, b)) return;
  fringe[i] = 1;
  fringeQueue.push(i);
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (alphaAt(x, y) < 128) continue;
    const onBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const touchesTransparent =
      alphaAt(x - 1, y) < 128 ||
      alphaAt(x + 1, y) < 128 ||
      alphaAt(x, y - 1) < 128 ||
      alphaAt(x, y + 1) < 128;
    if (onBorder || touchesTransparent) pushFringe(x, y);
  }
}

while (fringeQueue.length > 0) {
  const i = fringeQueue.pop();
  const x = i % width;
  const y = (i - x) / width;
  out[i * channels + 3] = 0;
  pushFringe(x + 1, y);
  pushFringe(x - 1, y);
  pushFringe(x, y + 1);
  pushFringe(x, y - 1);
}

await sharp(out, { raw: { width, height, channels } }).png().toFile(imagePath);

const transparent = [...out].filter((_, i) => i % 4 === 3 && out[i] < 128).length;
const fringeRemoved = fringe.reduce((n, v) => n + v, 0);
console.log(`Wrote ${imagePath}`);
console.log(`Transparent: ${transparent} / ${width * height} (fringe removed: ${fringeRemoved})`);
