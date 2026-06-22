import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 12×21 Windows 3.1 pointer — X = black outline, 0 = white fill (interior only). */
const CURSOR_GRID = [
  "X00000000000",
  "XX0000000000",
  "X0X000000000",
  "X00X00000000",
  "X000X0000000",
  "X0000X000000",
  "X00000X00000",
  "X000000X0000",
  "X0000000X000",
  "X00000000X00",
  "X000000000X0",
  "X000000XXXXX",
  "X000X00X0000",
  "X00XX00X0000",
  "X0X00X00X000",
  "XX000X00X000",
  "X00000X00X00",
  "000000X00X00",
  "0000000X00X0",
  "0000000X00X0",
  "00000000XX00",
];

const WIDTH = 12;
const HEIGHT = 21;
const PIXEL = 2;
const TIP_X = 2;
const TIP_Y = 2;
const CANVAS = TIP_X + WIDTH * PIXEL + TIP_X;
const CANVAS_H = TIP_Y + HEIGHT * PIXEL + TIP_Y;

function buildPixelGrid() {
  const cells = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (CURSOR_GRID[y][x] === "X") {
        cells[y][x] = "black";
      }
    }
  }

  // Flood-fill interior 0s as white from a known inside pixel (row 2, col 1).
  const stack = [[1, 2]];
  const seen = new Set();

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue;
    if (CURSOR_GRID[y][x] !== "0") continue;
    cells[y][x] = "white";
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return cells;
}

const pixelGrid = buildPixelGrid();
const pixels = Buffer.alloc(CANVAS * CANVAS_H * 4, 0);

function setPx(canvasX, canvasY, r, g, b, a = 255) {
  if (canvasX < 0 || canvasY < 0 || canvasX >= CANVAS || canvasY >= CANVAS_H) return;
  const i = (canvasY * CANVAS + canvasX) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

function setBlock(gridX, gridY, r, g, b) {
  const baseX = TIP_X + gridX * PIXEL;
  const baseY = TIP_Y + gridY * PIXEL;
  for (let dy = 0; dy < PIXEL; dy += 1) {
    for (let dx = 0; dx < PIXEL; dx += 1) {
      setPx(baseX + dx, baseY + dy, r, g, b);
    }
  }
}

for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const cell = pixelGrid[y][x];
    if (cell === "black") setBlock(x, y, 0, 0, 0);
    else if (cell === "white") setBlock(x, y, 255, 255, 255);
  }
}

const outDir = path.join(__dirname, "..", "public", "cursors");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "retro-win31-arrow.png");

await sharp(pixels, { raw: { width: CANVAS, height: CANVAS_H, channels: 4 } })
  .png()
  .toFile(outPath);

console.log(
  `Wrote ${outPath} (${WIDTH}×${HEIGHT} @ ${PIXEL}px each → ${WIDTH * PIXEL}×${HEIGHT * PIXEL}, hotspot ${TIP_X},${TIP_Y})`
);
