const path = require("path");

const FORMATS = [
  {
    id: "pln",
    extensions: [".pln"],
    label: "Archicad project",
    enabled: true,
  },
  {
    id: "ifc",
    extensions: [".ifc"],
    label: "IFC",
    enabled: true,
  },
  {
    id: "glb",
    extensions: [".glb", ".gltf"],
    label: "glTF",
    enabled: true,
  },
  { id: "dwg", extensions: [".dwg"], label: "DWG", enabled: false },
  { id: "dxf", extensions: [".dxf"], label: "DXF", enabled: false },
  { id: "skp", extensions: [".skp"], label: "SketchUp", enabled: false },
  { id: "obj", extensions: [".obj"], label: "OBJ", enabled: false },
];

function extensionOf(filename) {
  return path.extname(String(filename || "")).toLowerCase();
}

function formatForFilename(filename) {
  const ext = extensionOf(filename);
  return FORMATS.find((format) => format.extensions.includes(ext)) || null;
}

function publicFormats() {
  return FORMATS.map((format) => ({
    id: format.id,
    extensions: format.extensions,
    label: format.label,
    enabled: format.enabled,
  }));
}

module.exports = {
  FORMATS,
  extensionOf,
  formatForFilename,
  publicFormats,
};
