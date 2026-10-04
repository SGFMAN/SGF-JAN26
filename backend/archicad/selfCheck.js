/**
 * Checks PLN rejection, GLB acceptance, and the conversion statuses.
 * Uses the database when DATABASE_URL is set, then deletes the test rows.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { Pool } = require("pg");
const { validateUpload } = require("./importers/validateUpload");
const { readGlbDocument, collectElementNames } = require("./glb");
const service = require("./service");
const { ACTIVE } = require("./statuses");

function glbWithNamedWall() {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Wall", mesh: 0 }],
    meshes: [{ name: "Wall", primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: positions.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
    ],
  };
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binPad = Buffer.concat([positions, Buffer.alloc((4 - (positions.length % 4)) % 4, 0)]);
  const total = 12 + 8 + jsonPad.length + 8 + binPad.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPad.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPad.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonPad, binHeader, binPad]);
}

async function writeTemp(name, body) {
  const file = path.join(os.tmpdir(), `sgf-archicad-check-${Date.now()}-${name}`);
  await fsp.writeFile(file, body);
  return file;
}

async function expectReject(file, name, includes) {
  try {
    await validateUpload(file, name);
  } catch (error) {
    if (!includes || String(error.message).toLowerCase().includes(includes.toLowerCase())) return;
    throw new Error(`Unexpected rejection for ${name}: ${error.message}`);
  }
  throw new Error(`Expected ${name} to be rejected`);
}

async function waitReady(id) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    const model = await service.getModel(id);
    if (!ACTIVE.has(model.status)) return model;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for conversion");
}

async function main() {
  const html = await writeTemp("fake.pln", Buffer.from("<!DOCTYPE html><html></html>"));
  await expectReject(html, "page.pln", "not a building");
  await fsp.unlink(html);

  const text = await writeTemp("notes.txt", Buffer.from("hello"));
  await expectReject(text, "notes.txt", "PLN");
  await fsp.unlink(text);

  const glb = glbWithNamedWall();
  const glbFile = await writeTemp("wall.glb", glb);
  const checked = await validateUpload(glbFile, "wall.glb");
  if (checked.format !== "glb") throw new Error("GLB was not accepted");
  const names = collectElementNames(await readGlbDocument(glbFile));
  if (!names.includes("Wall")) throw new Error("Wall name was not read from the GLB");

  const binary = await writeTemp("house.pln", Buffer.alloc(2048, 7));
  const pln = await validateUpload(binary, "House Plan.pln");
  if (pln.format !== "pln") throw new Error("PLN was not accepted");

  if (!process.env.DATABASE_URL) {
    await fsp.unlink(glbFile);
    await fsp.unlink(binary);
    console.log("Archicad self-check passed (file checks only; DATABASE_URL is not set).");
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 30000,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  const created = [];
  try {
    await service.init(pool);
    const plnModel = await service.createFromUpload({
      tempPath: binary,
      originalName: "House Plan.pln",
      userId: null,
    });
    created.push(plnModel.id);
    const failed = await waitReady(plnModel.id);
    if (failed.status !== "FAILED") throw new Error(`Expected FAILED for PLN, got ${failed.status}`);
    if (!failed.errorDetail) throw new Error("PLN failure did not explain why");
    if (failed.hasModel) throw new Error("Failed PLN reported a viewable model");

    const glbCopy = await writeTemp("wall-attach.glb", glb);
    const attached = await service.attachConverted({ id: plnModel.id, tempPath: glbCopy });
    created.push(attached.id);
    const ready = await waitReady(plnModel.id);
    if (ready.status !== "READY") throw new Error(`Expected READY after GLB attach, got ${ready.status}: ${ready.errorDetail || ""}`);
    if (!ready.elements.includes("Wall")) throw new Error("Attached model did not keep the Wall name");

    const direct = await service.createFromUpload({
      tempPath: glbFile,
      originalName: "direct-wall.glb",
      userId: null,
    });
    created.push(direct.id);
    const directReady = await waitReady(direct.id);
    if (directReady.status !== "READY") {
      throw new Error(`Direct GLB was ${directReady.status}: ${directReady.errorDetail || ""}`);
    }

    await service.removeModel(plnModel.id);
    await service.removeModel(direct.id);
    console.log("Archicad self-check passed.");
  } finally {
    for (const id of created) {
      await service.removeModel(id).catch(() => {});
    }
    await fsp.unlink(glbFile).catch(() => {});
    await fsp.unlink(binary).catch(() => {});
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
