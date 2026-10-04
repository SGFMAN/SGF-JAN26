import { parentPort, workerData } from "node:worker_threads";
import { readFile, writeFile } from "node:fs/promises";
import { GeometryProcessor } from "@ifc-lite/geometry";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function pad4(buffer, fill) {
  const extra = (4 - (buffer.length % 4)) % 4;
  if (!extra) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(extra, fill)]);
}

function stampIfcNames(glb) {
  if (glb.length < 20 || glb.readUInt32LE(0) !== GLB_MAGIC) return glb;
  const jsonLength = glb.readUInt32LE(12);
  const jsonStart = 20;
  if (jsonStart + jsonLength > glb.length) return glb;
  const document = JSON.parse(glb.subarray(jsonStart, jsonStart + jsonLength).toString("utf8"));
  const meshes = document.meshes || [];
  for (const node of document.nodes || []) {
    const extras = node.extras;
    if (!extras || !extras.ifcType) continue;
    const label = extras.expressId != null ? `${extras.ifcType} #${extras.expressId}` : String(extras.ifcType);
    node.name = label;
    if (node.mesh != null && meshes[node.mesh]) meshes[node.mesh].name = label;
  }
  const json = pad4(Buffer.from(JSON.stringify(document)), 0x20);
  const rest = glb.subarray(jsonStart + jsonLength);
  const total = 12 + 8 + json.length + rest.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
  return Buffer.concat([header, jsonHeader, json, rest]);
}

try {
  const bytes = new Uint8Array(await readFile(workerData.source));
  const processor = new GeometryProcessor({ preferNative: false });
  await processor.init();
  const glb = processor.exportGlb(bytes, true, new Uint32Array(), undefined, "IfcSpace,IfcOpeningElement,IfcSite", true);
  if (!glb || !glb.byteLength) throw new Error("IFC conversion produced no 3D geometry.");
  const named = stampIfcNames(Buffer.from(glb.buffer, glb.byteOffset, glb.byteLength));
  await writeFile(workerData.output, named);
  parentPort.postMessage({ ok: true });
} catch (error) {
  const message = String(error && error.message ? error.message : error);
  parentPort.postMessage({
    ok: false,
    message: message.startsWith("NO_RENDER_GEOMETRY")
      ? "This IFC has no 3D geometry to show."
      : message,
  });
}
