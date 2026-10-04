const { spawn } = require("child_process");

function findOnPath(command) {
  return new Promise((resolve) => {
    const locator = process.platform === "win32" ? "where" : "which";
    const child = spawn(locator, [command], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    const finish = (found) => resolve(found);
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0) return finish(null);
      const line = out
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find(Boolean);
      finish(line || null);
    });
  });
}

function tokenizeCommand(command) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match = pattern.exec(command);
  while (match) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
    match = pattern.exec(command);
  }
  return tokens.filter(Boolean);
}

async function detectConversionTools() {
  const ifcConvert = (await findOnPath("IfcConvert")) || (await findOnPath("ifcconvert"));
  const configured = String(process.env.ARCHICAD_CONVERT_CMD || "").trim();
  return {
    ifcConvertInstalled: Boolean(ifcConvert),
    ifcConvertPath: ifcConvert,
    configuredCommand: Boolean(configured),
    configured,
  };
}

module.exports = {
  findOnPath,
  tokenizeCommand,
  detectConversionTools,
};
