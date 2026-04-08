const fs = require("fs");
const path = require("path");

// Root directory (matches your Settings).
const ROOT = "Z:\\1.SGF PROJECT MANAGEMENT";
const YEAR = "2025";
const TARGET_NAME = "5. PHOTOS";
const ONLY_STATE = "VIC";

// First run MUST be DRY RUN. Flip to false only after confirmation.
const DRY_RUN = false;

const LOG_PATH = path.join(__dirname, `rename-photo-folders-${YEAR}-${ONLY_STATE || "ALL"}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`);

function isPhotoFolderName(name) {
  const lower = String(name || "").toLowerCase();
  return lower.startsWith("5.") && lower.includes("photo");
}

function writeLog(lines) {
  try {
    fs.writeFileSync(LOG_PATH, lines.join("\n") + "\n", "utf8");
  } catch (e) {
    // Still proceed; console output is the primary channel.
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

function processProject(projectPath) {
  const out = [];
  const entries = safeReaddir(projectPath);
  if (entries.error) {
    out.push(`❌ SKIP (unreadable project): ${projectPath} (${entries.error.message})`);
    return out;
  }

  let hasTarget = false;
  const candidates = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name === TARGET_NAME) hasTarget = true;
    if (isPhotoFolderName(ent.name) && ent.name !== TARGET_NAME) {
      candidates.push(ent.name);
    }
  }

  if (hasTarget) {
    out.push(`⚠ SKIP (already correct): ${projectPath}`);
    return out;
  }

  if (candidates.length === 0) return out;

  // If multiple messy "5.*photo*" folders exist, do NOT guess—skip safely.
  if (candidates.length > 1) {
    out.push(
      `❌ SKIP (multiple candidates): ${projectPath} (${candidates.join(" | ")})`
    );
    return out;
  }

  const fromName = candidates[0];
  const fromPath = path.join(projectPath, fromName);
  const toPath = path.join(projectPath, TARGET_NAME);

  if (fs.existsSync(toPath)) {
    out.push(`❌ SKIP (conflict): ${projectPath} (${TARGET_NAME} exists)`);
    return out;
  }

  if (DRY_RUN) {
    out.push(`WOULD RENAME: "${fromName}" -> "${TARGET_NAME}" in ${projectPath}`);
    return out;
  }

  try {
    fs.renameSync(fromPath, toPath);
    out.push(`✔ RENAMED: "${fromName}" -> "${TARGET_NAME}" in ${projectPath}`);
  } catch (e) {
    out.push(`❌ SKIP (rename failed): ${projectPath} (${e.message})`);
  }
  return out;
}

function main() {
  const lines = [];
  const yearPath = path.join(ROOT, YEAR);
  const states = safeReaddir(yearPath);
  if (states.error) {
    const msg = `Failed to read year folder: ${yearPath} (${states.error.message})`;
    console.error(msg);
    lines.push(msg);
    writeLog(lines);
    process.exitCode = 1;
    return;
  }

  const stateDirs = states
    .filter((d) => d.isDirectory())
    .filter((d) => !ONLY_STATE || d.name === ONLY_STATE);
  lines.push(
    `Scanning: ${yearPath}\nStates: ${stateDirs.map((s) => s.name).join(", ") || "(none)"}\nDRY_RUN=${DRY_RUN}\n`
  );
  for (const l of lines) console.log(l);

  for (const state of stateDirs) {
    const statePath = path.join(yearPath, state.name);
    const projects = safeReaddir(statePath);
    if (projects.error) {
      const msg = `❌ SKIP (unreadable state): ${statePath} (${projects.error.message})`;
      console.log(msg);
      lines.push(msg);
      continue;
    }
    const projectDirs = projects.filter((d) => d.isDirectory());
    for (const proj of projectDirs) {
      const projectPath = path.join(statePath, proj.name);
      const outLines = processProject(projectPath);
      for (const l of outLines) {
        console.log(l);
        lines.push(l);
      }
    }
  }

  console.log("\n✅ Done");
  lines.push("", "✅ Done", "", `Log: ${LOG_PATH}`);
  writeLog(lines);
}

main();

