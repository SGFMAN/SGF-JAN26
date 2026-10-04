const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const RUNTIME_ROOT = path.resolve(__dirname, "..", "..", "data", "archicad-runtime", "Archicad 27");
const PROGRAM_FILES = "C:\\Program Files\\GRAPHISOFT\\Archicad 27";

function archicad27Install() {
  const homes = [RUNTIME_ROOT, PROGRAM_FILES];
  for (const home of homes) {
    const exe = path.join(home, "Archicad.exe");
    const tapir = path.join(home, "Add-Ons", "Tapir", "Tapir.apx");
    if (fs.existsSync(exe) && fs.existsSync(tapir)) return { exe, cwd: home };
  }
  if (fs.existsSync(path.join(PROGRAM_FILES, "Archicad.exe"))) {
    throw new Error("Archicad 27 is installed, but its export add-on is not in place yet.");
  }
  throw new Error("Archicad 27 is not available, so this PLN cannot be opened.");
}

function archicadCommand(port, command, parameters, timeoutMs) {
  const body = JSON.stringify({ command, parameters: parameters || {} });
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error("Archicad returned a response that could not be read."));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Archicad did not answer in time."));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function commandOnOpenPort(port, command, parameters, timeoutMs) {
  try {
    return await archicadCommand(port, command, parameters, timeoutMs);
  } catch {
    return null;
  }
}

function productIs27(response) {
  const version = response && response.succeeded ? response.result && response.result.version : null;
  return String(version || "").startsWith("27");
}

async function findArchicad27Port(exclude) {
  for (let port = 19723; port <= 19740; port += 1) {
    if (exclude && exclude.has(port)) continue;
    const info = await commandOnOpenPort(port, "API.GetProductInfo", {}, 800);
    if (productIs27(info)) return port;
  }
  return null;
}

async function tapir(port, command, parameters, timeoutMs) {
  const response = await archicadCommand(
    port,
    "API.ExecuteAddOnCommand",
    {
      addOnCommandId: { commandNamespace: "TapirCommand", commandName: command },
      addOnCommandParameters: parameters || {},
    },
    timeoutMs
  );
  if (!response || response.succeeded === false) {
    const message = response && response.error ? JSON.stringify(response.error) : "Archicad rejected the command.";
    throw new Error(message);
  }
  const result = response.result && response.result.addOnCommandResponse;
  if (result && result.error) {
    throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
  }
  return result || {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readIfcExportScope(ifcPath) {
  const handle = await fsp.open(ifcPath, "r").catch(() => null);
  if (!handle) return "missing";
  try {
    const buffer = Buffer.alloc(4000);
    await handle.read(buffer, 0, 4000, 0);
    const text = buffer.toString("latin1");
    if (/entire project/i.test(text)) return "entire";
    if (/visible elements/i.test(text)) return "visible";
    return "unknown";
  } finally {
    await handle.close();
  }
}

async function exportPlnWithArchicad27(source, ifcPath) {
  const install = archicad27Install();
  const busy = await findArchicad27Port();
  if (busy) {
    throw new Error("Archicad 27 is already open. Close it, then upload the PLN again.");
  }
  await fsp.rm(ifcPath, { force: true });
  console.log("[archicad27] opening PLN");
  const child = spawn(install.exe, [source], {
    cwd: install.cwd,
    windowsHide: false,
    shell: false,
  });
  let settled = false;
  const stop = () => {
    if (settled) return;
    settled = true;
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  };
  child.on("error", () => {});
  try {
    let port = null;
    const openedAt = Date.now();
    while (!port && Date.now() - openedAt < 8 * 60 * 1000) {
      if (child.exitCode != null) {
        throw new Error("Archicad 27 closed before the PLN finished opening.");
      }
      port = await findArchicad27Port();
      if (!port) await sleep(2000);
    }
    if (!port) {
      throw new Error("Archicad 27 did not become ready. If a dialog is open on screen, close it and upload the PLN again.");
    }
    console.log("[archicad27] connected");
    let windowType = "";
    while (!windowType && Date.now() - openedAt < 12 * 60 * 1000) {
      if (child.exitCode != null) {
        throw new Error("Archicad 27 closed before the PLN finished opening.");
      }
      try {
        const window = await tapir(port, "GetCurrentWindowType", {}, 10000);
        windowType = window.currentWindowType || "";
      } catch {
        windowType = "";
      }
      if (!windowType) await sleep(2000);
    }
    if (!windowType) {
      throw new Error("Archicad 27 opened, but the PLN is not ready. Finish any dialog on screen, then upload the PLN again.");
    }
    console.log("[archicad27] window", windowType);
    async function showModelWindow(kind) {
      const parameters = kind === "FloorPlan" ? { windowType: "FloorPlan", storyIndex: 0 } : { windowType: "3DModel" };
      try {
        await tapir(port, "ChangeWindow", parameters, 120000);
      } catch (error) {
        if (kind !== "FloorPlan") throw error;
        console.log("[archicad27] story switch skipped", error.message);
        await tapir(port, "ChangeWindow", { windowType: "FloorPlan" }, 120000);
      }
      const switched = await tapir(port, "GetCurrentWindowType", {}, 10000);
      console.log("[archicad27] window", switched.currentWindowType || kind);
    }
    await showModelWindow("FloorPlan");
    const attempts = [];
    try {
      const listed = await tapir(port, "GetIFCExportTranslators", {}, 60000);
      const names = (listed.translators || []).map((item) => item && item.name).filter(Boolean);
      console.log("[archicad27] translators", names.join(" | ") || "(none)");
      for (const translatorName of names) {
        attempts.push({
          method: "save",
          ifcFilePath: ifcPath,
          fileType: "ifc",
          translatorName,
          elementsToExport: "EntireProject",
        });
      }
    } catch (error) {
      console.log("[archicad27] translator list skipped", error.message);
    }
    attempts.push({ method: "save", ifcFilePath: ifcPath, fileType: "ifc" });
    async function saveIfc() {
      let lastError = null;
      for (const parameters of attempts) {
        try {
          await fsp.rm(ifcPath, { force: true });
          await tapir(port, "IFCFileOperation", parameters, 15 * 60 * 1000);
          const scope = await readIfcExportScope(ifcPath);
          if (parameters.elementsToExport === "EntireProject" && scope === "visible") {
            throw new Error("Archicad wrote only the visible elements.");
          }
          console.log("[archicad27] IFC saved", parameters.elementsToExport || "default", scope);
          return true;
        } catch (error) {
          lastError = error;
          console.log("[archicad27] IFC save attempt failed", error.message);
        }
      }
      return lastError;
    }
    let saved = await saveIfc();
    if (saved !== true) {
      await showModelWindow("3DModel");
      saved = await saveIfc();
    }
    if (saved !== true) throw saved || new Error("Archicad 27 did not write an IFC model for this PLN.");
    const stat = await fsp.stat(ifcPath).catch(() => null);
    if (!stat || stat.size < 1000) {
      throw new Error("Archicad 27 did not write an IFC model for this PLN.");
    }
    await tapir(port, "QuitArchicad", {}, 20000).catch(() => {});
    const quitStarted = Date.now();
    while (child.exitCode == null && Date.now() - quitStarted < 30000) {
      await sleep(1000);
    }
  } finally {
    stop();
  }
}

module.exports = { exportPlnWithArchicad27, archicad27Install };
