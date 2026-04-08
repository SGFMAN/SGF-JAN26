const fs = require("fs");
const path = require("path");

const ROOT = "Z:\\1.SGF PROJECT MANAGEMENT";
const YEAR = "2026";
const STATE = "VIC";

const FROM = "3. CONTRACT ADMIN - Quotations, Contract, E-Contracts,Variations";
const TO = "3. VARIATIONS";

const DRY_RUN = false;

const LOG_PATH = path.join(
  __dirname,
  `rename-folder-${YEAR}-${STATE}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
);

function writeLog(lines) {
  try {
    fs.writeFileSync(LOG_PATH, lines.join("\n") + "\n", "utf8");
  } catch (e) {
    console.error(`Failed to write log file: ${LOG_PATH} (${e.message})`);
  }
}

function safeReaddir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return { error: e };
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function processProject(projectPath) {
  const out = [];

  const fromPath = path.join(projectPath, FROM);
  const toPath = path.join(projectPath, TO);

  if (isDir(toPath)) {
    out.push(`⚠ SKIP (already correct): ${projectPath}`);
    return out;
  }

  if (!isDir(fromPath)) {
    out.push(`⚠ SKIP (missing source): ${projectPath}`);
    return out;
  }

  if (fs.existsSync(toPath)) {
    out.push(`❌ SKIP (conflict): ${projectPath} (${TO} exists as non-folder)`);
    return out;
  }

  if (DRY_RUN) {
    out.push(`WOULD RENAME: "${FROM}" -> "${TO}" in ${projectPath}`);
    return out;
  }

  try {
    fs.renameSync(fromPath, toPath);
    out.push(`✔ RENAMED: "${FROM}" -> "${TO}" in ${projectPath}`);
  } catch (e) {
    out.push(`❌ SKIP (rename failed): ${projectPath} (${e.message})`);
  }

  return out;
}

function main() {
  const lines = [];
  const base = path.join(ROOT, YEAR, STATE);

  lines.push(`Scanning: ${base}`);
  lines.push(`DRY_RUN=${DRY_RUN}`);
  lines.push("");
  console.log(lines.join("\n"));

  const projects = safeReaddir(base);
  if (projects.error) {
    const msg = `Failed to read state folder: ${base} (${projects.error.message})`;
    console.error(msg);
    lines.push(msg);
    writeLog(lines);
    process.exitCode = 1;
    return;
  }

  for (const ent of projects) {
    if (!ent.isDirectory()) continue;
    const projectPath = path.join(base, ent.name);
    const outLines = processProject(projectPath);
    for (const l of outLines) {
      console.log(l);
      lines.push(l);
    }
  }

  console.log("\n✅ Done");
  lines.push("", "✅ Done", "", `Log: ${LOG_PATH}`);
  writeLog(lines);
}

main();

