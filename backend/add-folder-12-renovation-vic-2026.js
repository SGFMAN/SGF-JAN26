/**
 * Batch: under each project folder in VIC / 2026, ensure subfolder "12. RENOVATION" exists.
 *
 * - Skips if that folder already exists (as a directory).
 * - Does not rename or remove any other "12. ..." folders.
 *
 * Usage: node backend/add-folder-12-renovation-vic-2026.js
 *
 * Edit ROOT if your drive/path differs. Set DRY_RUN to false after reviewing the log.
 */

const fs = require("fs");
const path = require("path");

const ROOT = "Z:\\1.SGF PROJECT MANAGEMENT";
const YEARS = ["2026"];
const STATE = "VIC";
const NEW_FOLDER = "12. RENOVATION";

// Set true for a no-op preview; set false to create folders on disk.
const DRY_RUN = true;

const LOG_PATH = path.join(
  __dirname,
  `add-folder-12-renovation-${STATE}-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
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
  const targetPath = path.join(projectPath, NEW_FOLDER);

  if (isDir(targetPath)) {
    return { action: "ok_exists", detail: `already has "${NEW_FOLDER}"` };
  }

  if (fs.existsSync(targetPath)) {
    return {
      action: "conflict",
      detail: `"${NEW_FOLDER}" exists but is not a folder`,
    };
  }

  if (DRY_RUN) {
    return { action: "would_create", detail: `would mkdir "${NEW_FOLDER}"` };
  }

  try {
    fs.mkdirSync(targetPath, { recursive: false });
    return { action: "created", detail: `created "${NEW_FOLDER}"` };
  } catch (e) {
    return { action: "error", detail: e.message };
  }
}

function main() {
  const lines = [];
  const summary = {
    ok_exists: 0,
    created: 0,
    would_create: 0,
    conflict: 0,
    error: 0,
    baseReadFailures: 0,
  };

  lines.push(`ROOT=${ROOT}`);
  lines.push(`YEARS=${YEARS.join(", ")}`);
  lines.push(`STATE=${STATE}`);
  lines.push(`NEW_FOLDER=${NEW_FOLDER}`);
  lines.push(`DRY_RUN=${DRY_RUN}`);
  lines.push("");

  console.log(lines.slice(0, -1).join("\n"));

  for (const year of YEARS) {
    const base = path.join(ROOT, year, STATE);
    lines.push(`--- ${year}/${STATE} ---`);
    console.log(`\n--- ${year}/${STATE} ---`);

    const projects = safeReaddir(base);
    if (projects.error) {
      const msg = `Failed to read: ${base} (${projects.error.message})`;
      console.error(msg);
      lines.push(msg);
      summary.baseReadFailures++;
      continue;
    }

    for (const ent of projects) {
      if (!ent.isDirectory()) continue;
      const projectPath = path.join(base, ent.name);
      const rel = path.relative(ROOT, projectPath);
      const result = processProject(projectPath);

      if (result.action === "ok_exists") summary.ok_exists++;
      else if (result.action === "created") summary.created++;
      else if (result.action === "would_create") summary.would_create++;
      else if (result.action === "conflict") summary.conflict++;
      else if (result.action === "error") summary.error++;

      const prefix =
        result.action === "conflict" || result.action === "error"
          ? "❌"
          : result.action === "ok_exists"
            ? "✓"
            : result.action === "created"
              ? "✔"
              : "○";

      const line = `${prefix} [${year}] ${rel} — ${result.detail}`;
      console.log(line);
      lines.push(line);
    }
  }

  lines.push("");
  lines.push("Summary:");
  lines.push(`  already had "${NEW_FOLDER}": ${summary.ok_exists}`);
  if (DRY_RUN) {
    lines.push(`  would create: ${summary.would_create}`);
  } else {
    lines.push(`  created "${NEW_FOLDER}": ${summary.created}`);
  }
  lines.push(`  conflicts (path exists, not a folder): ${summary.conflict}`);
  lines.push(`  per-project errors: ${summary.error}`);
  lines.push(`  year/state folder read failures: ${summary.baseReadFailures}`);
  lines.push("");
  lines.push(`Log: ${LOG_PATH}`);

  console.log("\n--- Summary ---");
  const summaryStart = lines.findIndex((l) => l === "Summary:");
  if (summaryStart >= 0) {
    for (let i = summaryStart; i < lines.length; i++) console.log(lines[i]);
  }
  writeLog(lines);
}

main();
