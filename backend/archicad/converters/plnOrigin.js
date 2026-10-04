function versionRank(value) {
  return String(value)
    .split(".")
    .map((part) => Number(part) || 0);
}

function readPlnArchicadVersion(buffer) {
  const versions = [];
  let from = 0;
  while (from < buffer.length) {
    const at = buffer.indexOf("rchi", from);
    if (at < 0) break;
    const start = Math.max(0, at - 8);
    const end = Math.min(buffer.length, at + 40);
    const text = Buffer.from(buffer.subarray(start, end).filter((byte) => byte !== 0xaa)).toString("latin1");
    const match = /Archicad (\d+\.\d+(?:\.\d+)?)/i.exec(text);
    if (match) {
      const major = Number(match[1].split(".")[0]);
      if (major >= 17 && major <= 40) versions.push(match[1]);
    }
    from = at + 4;
  }
  versions.sort((a, b) => {
    const left = versionRank(a);
    const right = versionRank(b);
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const delta = (right[index] || 0) - (left[index] || 0);
      if (delta) return delta;
    }
    return 0;
  });
  return versions[0] || null;
}

function plnStandaloneMessage(version) {
  const origin = version ? `Archicad ${version}` : "a newer Archicad";
  return `This PLN comes from ${origin}. A native PLN has no standalone reader, so this server does not open Archicad. Export an IFC from the Archicad that saved this file and upload that IFC. The IFC is converted here on its own.`;
}

module.exports = { readPlnArchicadVersion, plnStandaloneMessage };
