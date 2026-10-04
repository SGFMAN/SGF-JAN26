const crypto = require("crypto");
const fsp = require("fs/promises");
const path = require("path");
const { Worker } = require("worker_threads");
const { detectConversionTools } = require("./detectTools");
const { runCommand, commandFromTemplate } = require("./runCommand");
const { readGlbDocument, readGltfDocument, packEmbeddedGltfToGlb } = require("../glb");
const { sourcePath, webModelPath, fileExists, redactPaths, modelDir } = require("../storage");

function failure(message, converter) {
  return { ok: false, message, converter: converter || null };
}

async function convertConfigured(source, output, meta, tools) {
  const { command, args } = commandFromTemplate(tools.configured, {
    input: source,
    output,
    meta,
  });
  await runCommand(command, args, { timeoutMs: 20 * 60 * 1000 });
  if (!fileExists(output)) {
    throw new Error("The converter finished without writing a GLB model.");
  }
}

function convertIfcInWorker(source, output) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "ifcWorker.mjs"), {
      workerData: { source, output },
    });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      worker.terminate();
      finish(new Error("IFC conversion took too long and was stopped."));
    }, 15 * 60 * 1000);
    worker.once("message", (message) => {
      if (message && message.ok) finish();
      else finish(new Error((message && message.message) || "IFC conversion failed."));
    });
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled && code !== 0) finish(new Error("IFC conversion stopped."));
    });
  });
}

async function convertIfc(source, output, tools) {
  let converter = "ifc-lite";
  try {
    await convertIfcInWorker(source, output);
  } catch (error) {
    if (!tools.ifcConvertPath) throw error;
    await runCommand(tools.ifcConvertPath, [source, output], { timeoutMs: 15 * 60 * 1000 });
    converter = "ifcconvert";
  }
  if (!fileExists(output)) {
    throw new Error("IFC conversion finished without writing a GLB model.");
  }
  return { ok: true, converter };
}

const CACHE_ROOT = path.resolve(__dirname, "..", "..", "data", "archicad-cache");
const MODEL_ROOT = path.resolve(__dirname, "..", "..", "data", "archicad-models");

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const handle = await fsp.open(file, "r");
  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) hash.update(chunk);
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function rememberPreparedModels() {
  await fsp.mkdir(CACHE_ROOT, { recursive: true });
  const dirs = await fsp.readdir(MODEL_ROOT, { withFileTypes: true }).catch(() => []);
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const pln = path.join(MODEL_ROOT, dir.name, "source.pln");
    const glb = path.join(MODEL_ROOT, dir.name, "model.glb");
    if (!fileExists(pln) || !fileExists(glb)) continue;
    const dest = path.join(CACHE_ROOT, `${await sha256File(pln)}.glb`);
    if (!fileExists(dest)) await fsp.copyFile(glb, dest);
  }
}

async function convertPln(source, output, meta, tools, options = {}) {
  if (tools.configuredCommand) {
    await convertConfigured(source, output, meta, tools);
    return { ok: true, converter: "configured-command" };
  }
  const buffer = await fsp.readFile(source);
  if (buffer.length < 8 || buffer.subarray(0, 8).toString("latin1") !== "ROF FDB ") {
    return failure("This file is not an Archicad PLN project.", "pln");
  }
  await rememberPreparedModels();
  const hash = await sha256File(source);
  const prepared = path.join(CACHE_ROOT, `${hash}.glb`);
  const cachedIfc = path.join(CACHE_ROOT, `${hash}.ifc`);
  const ifcPath = path.join(path.dirname(source), "from-archicad.ifc");
  if (fileExists(prepared)) {
    await fsp.copyFile(prepared, output);
    if (fileExists(cachedIfc)) await fsp.copyFile(cachedIfc, ifcPath);
    return { ok: true, converter: "prepared" };
  }
  if (!fileExists(ifcPath) && options.allowArchicad) {
    const { exportPlnWithArchicad27 } = require("./archicad27");
    await exportPlnWithArchicad27(source, ifcPath);
  }
  if (fileExists(ifcPath)) {
    const converted = await convertIfc(ifcPath, output, tools);
    await fsp.mkdir(CACHE_ROOT, { recursive: true });
    await fsp.copyFile(output, prepared);
    await fsp.copyFile(ifcPath, cachedIfc);
    return { ok: true, converter: options.allowArchicad ? "archicad27" : converted.converter || "ifc-lite" };
  }
  return failure("This PLN is not ready to show in the viewer.", "pln");
}

async function convertGltfSource(source, output, extension) {
  if (extension === "gltf") {
    await readGltfDocument(source);
    await packEmbeddedGltfToGlb(source, output);
    return { ok: true, converter: "gltf-pack" };
  }
  await readGlbDocument(source);
  await fsp.copyFile(source, output);
  return { ok: true, converter: "glb" };
}

/**
 * Writes model.glb next to the stored source. Never replaces the source file.
 * Returns { ok, message, converter }.
 */
async function convertStoredSource({ id, format, extension, output, allowArchicad = false }) {
  const dir = modelDir(id);
  const source = sourcePath(id, extension);
  const glbOutput = output || webModelPath(id);
  const meta = path.join(dir, "conversion-meta.json");
  if (!fileExists(source)) {
    return failure("The uploaded file is missing. Upload it again.");
  }
  const tools = await detectConversionTools();
  try {
    if (format === "glb") return await convertGltfSource(source, glbOutput, extension);
    if (format === "ifc") return await convertIfc(source, glbOutput, tools);
    if (format === "pln") return await convertPln(source, glbOutput, meta, tools, { allowArchicad });
    return failure("This format cannot be converted yet.");
  } catch (error) {
    return failure(redactPaths(error.message, dir) || "Conversion failed.", null);
  }
}

async function adoptConvertedGlb(id, incomingPath) {
  const output = webModelPath(id);
  const dir = modelDir(id);
  const temp = path.join(dir, "model.incoming.glb");
  await fsp.copyFile(incomingPath, temp);
  try {
    await readGlbDocument(temp);
  } catch (error) {
    await fsp.unlink(temp).catch(() => {});
    throw error;
  }
  await fsp.rename(temp, output);
  return output;
}

module.exports = { convertStoredSource, adoptConvertedGlb };
