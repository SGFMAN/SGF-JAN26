const { spawn } = require("child_process");
const path = require("path");

const SCRIPT = path.join(__dirname, "pickPln.ps1");

function decodePowerShell(buffer) {
  if (!buffer || buffer.length === 0) return "";
  const utf16 =
    (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) || buffer.includes(0);
  const text = utf16 ? buffer.toString("utf16le") : buffer.toString("utf8");
  return text.replace(/^\uFEFF/, "");
}
let current = null;

function pickPlnFile(initialDirectory) {
  if (current) {
    const error = new Error("A file window is already open.");
    error.statusCode = 409;
    throw error;
  }
  const folder = path.resolve(String(initialDirectory || "").trim());
  if (!folder) {
    const error = new Error("Project folder was not found.");
    error.statusCode = 404;
    throw error;
  }

  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-STA",
      "-WindowStyle",
      "Hidden",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCRIPT,
      "-InitialDirectory",
      folder,
    ],
    { windowsHide: false }
  );
  current = child;

  return new Promise((resolve, reject) => {
    const out = [];
    const err = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error("The file window stayed open too long and was closed.");
      error.statusCode = 408;
      finish(error);
    }, 15 * 60 * 1000);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (current === child) current = null;
      if (error) reject(error);
      else resolve(value);
    }

    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const selected = decodePowerShell(Buffer.concat(out)).trim();
      if (code === 0 && !selected) {
        finish(null, "");
        return;
      }
      if (code === 0 && selected) {
        finish(null, selected.split(/\r?\n/).filter(Boolean).pop());
        return;
      }
      const message = decodePowerShell(Buffer.concat(err)).trim() || "The file window could not open.";
      const error = new Error(message);
      error.statusCode = 500;
      finish(error);
    });
  });
}

module.exports = { pickPlnFile };
