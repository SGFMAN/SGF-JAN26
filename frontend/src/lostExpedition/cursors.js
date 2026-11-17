/** Sierra / LucasArts-style action cursor icons for The Lost Expedition. */

export const ACTIONS = ["walk", "look", "take", "use", "talk"];

const LABELS = {
  walk: "Walk",
  look: "Look",
  take: "Pick up",
  use: "Use",
  talk: "Talk",
};

function drawCursor(draw, hotX = 4, hotY = 4) {
  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 40, 40);
  draw(ctx, false);
  const normal = `url(${canvas.toDataURL("image/png")}) ${hotX} ${hotY}, auto`;
  ctx.clearRect(0, 0, 40, 40);
  draw(ctx, true);
  const hot = `url(${canvas.toDataURL("image/png")}) ${hotX} ${hotY}, pointer`;
  return { normal, hot };
}

function outline(ctx, path) {
  ctx.save();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = "rgba(10,16,12,0.92)";
  ctx.stroke(path);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#f6edd8";
  ctx.stroke(path);
  ctx.restore();
}

function fillIcon(ctx, path, fill, hot) {
  ctx.fillStyle = hot ? "#ffe08a" : fill;
  ctx.fill(path);
  outline(ctx, path);
}

function makeWalk(hot) {
  return drawCursor((ctx, isHot) => {
    const path = new Path2D();
    path.moveTo(10, 30);
    path.quadraticCurveTo(8, 22, 12, 16);
    path.quadraticCurveTo(14, 12, 16, 14);
    path.lineTo(18, 22);
    path.quadraticCurveTo(20, 18, 24, 16);
    path.quadraticCurveTo(28, 14, 30, 18);
    path.quadraticCurveTo(32, 24, 28, 30);
    path.closePath();
    const path2 = new Path2D();
    path2.moveTo(18, 30);
    path2.quadraticCurveTo(16, 24, 20, 20);
    path2.quadraticCurveTo(24, 16, 26, 20);
    path2.quadraticCurveTo(28, 26, 24, 30);
    path2.closePath();
    fillIcon(ctx, path, "#d7c29a", isHot || hot);
    fillIcon(ctx, path2, "#c4a878", isHot || hot);
  }, 12, 28);
}

function makeLook(hot) {
  return drawCursor((ctx, isHot) => {
    const path = new Path2D();
    path.moveTo(6, 20);
    path.quadraticCurveTo(20, 8, 34, 20);
    path.quadraticCurveTo(20, 32, 6, 20);
    path.closePath();
    fillIcon(ctx, path, "#f6edd8", isHot || hot);
    ctx.beginPath();
    ctx.arc(20, 20, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = isHot || hot ? "#2a6aa8" : "#1e4a78";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(22, 18, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#dff0ff";
    ctx.fill();
  }, 20, 20);
}

function makeTake(hot) {
  return drawCursor((ctx, isHot) => {
    const path = new Path2D();
    path.moveTo(12, 28);
    path.lineTo(10, 18);
    path.quadraticCurveTo(10, 12, 16, 12);
    path.lineTo(18, 8);
    path.quadraticCurveTo(20, 6, 22, 8);
    path.lineTo(22, 14);
    path.lineTo(26, 14);
    path.quadraticCurveTo(30, 14, 30, 18);
    path.lineTo(28, 28);
    path.closePath();
    fillIcon(ctx, path, "#e8c090", isHot || hot);
  }, 18, 12);
}

function makeUse(hot) {
  return drawCursor((ctx, isHot) => {
    const wrench = new Path2D();
    wrench.moveTo(10, 28);
    wrench.lineTo(22, 16);
    wrench.arc(26, 12, 5, Math.PI * 0.75, Math.PI * 1.85, false);
    wrench.lineTo(24, 14);
    wrench.lineTo(12, 26);
    wrench.closePath();
    fillIcon(ctx, wrench, "#9aa4ac", isHot || hot);
    ctx.beginPath();
    ctx.arc(26, 12, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#1a2024";
    ctx.fill();
  }, 12, 26);
}

function makeTalk(hot) {
  return drawCursor((ctx, isHot) => {
    const path = new Path2D();
    path.moveTo(8, 12);
    path.quadraticCurveTo(8, 8, 14, 8);
    path.lineTo(28, 8);
    path.quadraticCurveTo(34, 8, 34, 14);
    path.lineTo(34, 22);
    path.quadraticCurveTo(34, 28, 28, 28);
    path.lineTo(18, 28);
    path.lineTo(12, 34);
    path.lineTo(14, 28);
    path.quadraticCurveTo(8, 28, 8, 22);
    path.closePath();
    fillIcon(ctx, path, "#f6edd8", isHot || hot);
    ctx.fillStyle = isHot || hot ? "#2a5080" : "#243848";
    for (const y of [14, 18, 22]) {
      ctx.fillRect(14, y, 14, 2);
    }
  }, 12, 28);
}

let baked = null;

function bake() {
  if (baked || typeof document === "undefined") return baked;
  baked = {
    walk: makeWalk(false),
    look: makeLook(false),
    take: makeTake(false),
    use: makeUse(false),
    talk: makeTalk(false),
  };
  return baked;
}

export function actionLabel(action) {
  return LABELS[action] || action;
}

export function nextAction(action) {
  const index = ACTIONS.indexOf(action);
  return ACTIONS[(index + 1) % ACTIONS.length];
}

export function cursorFor(action, hot = false) {
  const set = bake();
  if (!set) return "auto";
  const icon = set[action] || set.walk;
  return hot ? icon.hot : icon.normal;
}
