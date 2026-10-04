const fsp = require("fs/promises");

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function pad4(buffer, fill) {
  const extra = (4 - (buffer.length % 4)) % 4;
  if (!extra) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(extra, fill)]);
}

async function readGlbDocument(filePath) {
  const fh = await fsp.open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const headRead = await fh.read(header, 0, 12, 0);
    if (headRead.bytesRead < 12 || header.readUInt32LE(0) !== GLB_MAGIC) {
      throw new Error("That file is not a binary glTF (GLB) model.");
    }
    if (header.readUInt32LE(4) !== 2) {
      throw new Error("Only glTF 2 models can be shown in the viewer.");
    }
    const total = header.readUInt32LE(8);
    const chunkHeader = Buffer.alloc(8);
    const chunkRead = await fh.read(chunkHeader, 0, 8, 12);
    if (chunkRead.bytesRead < 8) throw new Error("The GLB file is incomplete.");
    const chunkLength = chunkHeader.readUInt32LE(0);
    const chunkType = chunkHeader.readUInt32LE(4);
    if (chunkType !== JSON_CHUNK) throw new Error("The GLB file is missing its model description.");
    if (chunkLength < 2 || chunkLength > 64 * 1024 * 1024) {
      throw new Error("The GLB model description is an unexpected size.");
    }
    if (total && 20 + chunkLength > total + 8) {
      throw new Error("The GLB file is incomplete.");
    }
    const jsonBuf = Buffer.alloc(chunkLength);
    const jsonRead = await fh.read(jsonBuf, 0, chunkLength, 20);
    if (jsonRead.bytesRead < chunkLength) throw new Error("The GLB file is incomplete.");
    let document;
    try {
      document = JSON.parse(jsonBuf.toString("utf8"));
    } catch {
      throw new Error("The GLB model description could not be read.");
    }
    if (!document || typeof document !== "object" || !document.asset) {
      throw new Error("The GLB model description could not be read.");
    }
    return document;
  } finally {
    await fh.close();
  }
}

function collectElementNames(document) {
  const names = [];
  const seen = new Set();
  const push = (name) => {
    const cleaned = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleaned || seen.has(cleaned) || names.length >= 400) return;
    seen.add(cleaned);
    names.push(cleaned);
  };
  for (const node of document.nodes || []) push(node.name);
  for (const mesh of document.meshes || []) push(mesh.name);
  return names;
}

function externalUri(uri) {
  if (!uri || typeof uri !== "string") return false;
  return !uri.startsWith("data:");
}

async function readGltfDocument(filePath) {
  const text = await fsp.readFile(filePath, "utf8");
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error("That .gltf file could not be read.");
  }
  if (!document || document.asset?.version?.[0] !== "2") {
    throw new Error("Only glTF 2 models can be shown in the viewer.");
  }
  for (const buffer of document.buffers || []) {
    if (externalUri(buffer.uri)) {
      throw new Error("This .gltf points at other files. Export a single .glb instead.");
    }
  }
  for (const image of document.images || []) {
    if (externalUri(image.uri)) {
      throw new Error("This .gltf points at other image files. Export a single .glb instead.");
    }
  }
  return document;
}

function dataUriBytes(uri) {
  const match = /^data:[^,]*,([\s\S]*)$/.exec(uri || "");
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

async function packEmbeddedGltfToGlb(filePath, destPath) {
  const raw = JSON.parse(await fsp.readFile(filePath, "utf8"));
  const buffers = raw.buffers || [];
  if (buffers.length > 1) {
    throw new Error("This .gltf uses more than one buffer. Export a single .glb instead.");
  }
  let bin = Buffer.alloc(0);
  if (buffers.length === 1) {
    if (!buffers[0].uri) {
      throw new Error("This .gltf is missing its embedded buffer. Export a single .glb instead.");
    }
    bin = dataUriBytes(buffers[0].uri);
    if (!bin) throw new Error("This .gltf buffer could not be read. Export a single .glb instead.");
    buffers[0] = { byteLength: bin.length };
  }
  const json = pad4(Buffer.from(JSON.stringify(raw)), 0x20);
  const binPadded = pad4(bin, 0x00);
  const total = 12 + 8 + json.length + (binPadded.length ? 8 + binPadded.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  const parts = [header, jsonHeader, json];
  if (binPadded.length) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binPadded.length, 0);
    binHeader.writeUInt32LE(BIN_CHUNK, 4);
    parts.push(binHeader, binPadded);
  }
  await fsp.writeFile(destPath, Buffer.concat(parts));
}

module.exports = {
  readGlbDocument,
  readGltfDocument,
  collectElementNames,
  packEmbeddedGltfToGlb,
};
