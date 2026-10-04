const fsp = require("fs/promises");
const { formatForFilename, extensionOf } = require("./registry");
const { readHead, MAX_UPLOAD_BYTES } = require("../storage");

function reject(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function headText(buffer) {
  return buffer.toString("utf8").replace(/^\u0000+/, "").trim().slice(0, 80).toLowerCase();
}

async function validateUpload(filePath, originalName) {
  const format = formatForFilename(originalName);
  const ext = extensionOf(originalName);
  if (!format || !format.enabled) {
    throw reject(
      format
        ? `${format.label} import is not available yet. Upload an IFC or a GLB file.`
        : "Upload an Archicad PLN, an IFC file, or a GLB model."
    );
  }
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) throw reject("The uploaded file is empty.");
  if (stat.size > MAX_UPLOAD_BYTES) throw reject("That file is larger than 512 MB.");
  const head = await readHead(filePath, 256);
  const text = headText(head);
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) {
    throw reject("That file is a program, not a building model.");
  }
  if (text.startsWith("<!doctype") || text.startsWith("<html") || text.startsWith("<?php")) {
    throw reject("That file is not a building model.");
  }
  if (format.id === "pln") {
    if (stat.size < 1024) throw reject("This PLN looks empty or incomplete.");
    if (text.startsWith("{") || text.startsWith("[")) {
      throw reject("This file is not an Archicad PLN project.");
    }
  }
  if (format.id === "ifc") {
    const sample = head.toString("utf8");
    if (!/ISO-10303-21/i.test(sample)) {
      throw reject("This file does not look like an IFC model.");
    }
  }
  if (format.id === "glb" && ext === ".glb") {
    if (head.length < 12 || head.readUInt32LE(0) !== 0x46546c67) {
      throw reject("That file is not a binary glTF (GLB) model.");
    }
  }
  return { format: format.id, extension: ext.replace(".", ""), bytes: stat.size };
}

module.exports = { validateUpload };
