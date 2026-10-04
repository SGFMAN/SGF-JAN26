const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "data", "archicad-models");
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newModelId() {
  return crypto.randomUUID();
}

function newRunId() {
  return crypto.randomUUID();
}

function assertId(id) {
  if (!ID_RE.test(String(id || ""))) {
    const error = new Error("Unknown model");
    error.statusCode = 404;
    throw error;
  }
  return String(id);
}

function modelDir(id) {
  const safe = assertId(id);
  const dir = path.resolve(ROOT, safe);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (dir !== ROOT && !dir.startsWith(rootWithSep)) {
    const error = new Error("Unknown model");
    error.statusCode = 404;
    throw error;
  }
  return dir;
}

async function ensureRoot() {
  await fsp.mkdir(ROOT, { recursive: true });
}

async function ensureModelDir(id) {
  await ensureRoot();
  const dir = modelDir(id);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function sanitizeDisplayName(name) {
  const base = path.basename(String(name || "model")).replace(/[\u0000-\u001f]/g, "").trim();
  const cleaned = base.replace(/[\\/"]/g, "").slice(0, 180);
  return cleaned || "model";
}

function sourcePath(id, ext) {
  const safeExt = String(ext || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!safeExt || safeExt.length > 8) {
    const error = new Error("Unsupported file type");
    error.statusCode = 400;
    throw error;
  }
  return path.join(modelDir(id), `source.${safeExt}`);
}

function webModelPath(id) {
  return path.join(modelDir(id), "model.glb");
}

async function moveIntoPlace(tempPath, destPath) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  try {
    await fsp.rename(tempPath, destPath);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await fsp.copyFile(tempPath, destPath);
    await fsp.unlink(tempPath).catch(() => {});
  }
}

async function removeModelFiles(id) {
  const dir = modelDir(id);
  await fsp.rm(dir, { recursive: true, force: true });
}

function redactPaths(text, dir) {
  let out = String(text || "");
  if (dir) out = out.split(dir).join("[storage]");
  out = out.split(ROOT).join("[storage]");
  return out.replace(/\s+/g, " ").trim().slice(0, 600);
}

async function readHead(filePath, bytes = 512) {
  const fh = await fsp.open(filePath, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

module.exports = {
  ROOT,
  MAX_UPLOAD_BYTES,
  newModelId,
  newRunId,
  assertId,
  modelDir,
  ensureRoot,
  ensureModelDir,
  sanitizeDisplayName,
  sourcePath,
  webModelPath,
  moveIntoPlace,
  removeModelFiles,
  redactPaths,
  readHead,
  fileExists,
};
