const { spawn } = require("child_process");
const { tokenizeCommand } = require("./detectTools");

function runCommand(command, args, { timeoutMs = 10 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
    });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Conversion timed out."));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-4000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(stderr.trim() || stdout.trim() || `Converter exited with code ${code}.`);
        error.exitCode = code;
        reject(error);
      }
    });
  });
}

function commandFromTemplate(template, values) {
  const tokens = tokenizeCommand(template).map((token) =>
    token
      .split("{input}").join(values.input)
      .split("{output}").join(values.output)
      .split("{meta}").join(values.meta)
  );
  if (!tokens.length) throw new Error("ARCHICAD_CONVERT_CMD is empty.");
  const hasPlaceholder = tokenizeCommand(template).some((token) =>
    /\{(input|output|meta)\}/.test(token)
  );
  if (!hasPlaceholder) {
    tokens.push("--input", values.input, "--output", values.output, "--meta", values.meta);
  }
  return { command: tokens[0], args: tokens.slice(1) };
}

module.exports = { runCommand, commandFromTemplate };
