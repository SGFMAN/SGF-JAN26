/**
 * Batch: ensure subfolder "4. CONTRACT & DOCS" under each project folder for
 * state VIC only, years 2025 and 2026.
 *
 * - Skips if that folder already exists.
 * - Renames legacy "4. CONTRACT" -> "4. CONTRACT & DOCS" when present.
 * - Otherwise creates the folder if the "4" slot is free.
 * - Other names in the 4 slot (e.g. "4. OTHER") are still reported as conflicts.
 *
 * Usage: node backend/add-folder-4-contract-docs-vic-2025-2026.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = "Z:\\1.SGF PROJECT MANAGEMENT";
const YEARS = ["2025", "2026"];
const STATE = "VIC";
const NEW_FOLDER = "4. CONTRACT & DOCS";
/** Exact legacy name to rename into NEW_FOLDER (was the dry-run conflict example). */
const CLOSE_RENAME_FROM = "4. CONTRACT";

// Set true for a no-op preview; set false to create/rename on disk.
const DRY_RUN = true;

const LOG_PATH = path.join(
  __dirname,
  `add-folder-4-contract-docs-${STATE}-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
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

/** True if this name is reserved for "folder 4" (not e.g. "40. x" or "3. x"). */
function isFolder4Slot(name) {
  if (name === "4") return true;
  if (name.startsWith("4.")) return true;
  if (name.startsWith("4 ")) return true;
  return false;
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

  const entries = safeReaddir(projectPath);
  if (entries.error) {
    return { action: "error", detail: entries.error.message };
  }

  const fromClosePath = path.join(projectPath, CLOSE_RENAME_FROM);

  if (isDir(fromClosePath)) {
    if (DRY_RUN) {
      return {
        action: "would_rename",
        detail: `would rename "${CLOSE_RENAME_FROM}" -> "${NEW_FOLDER}"`,
      };
    }
    try {
      fs.renameSync(fromClosePath, targetPath);
      return {
        action: "renamed",
        detail: `renamed "${CLOSE_RENAME_FROM}" -> "${NEW_FOLDER}"`,
      };
    } catch (e) {
      return { action: "error", detail: `rename failed: ${e.message}` };
    }
  }

  if (fs.existsSync(fromClosePath)) {
    return {
      action: "conflict",
      detail: `"${CLOSE_RENAME_FROM}" exists but is not a folder`,
    };
  }

  for (const ent of entries) {
    const name = ent.name;
    if (!isFolder4Slot(name)) continue;
    if (name === NEW_FOLDER) continue;
    const kind = ent.isDirectory() ? "folder" : "file";
    return {
      action: "conflict",
      detail: `⚠ FOLDER 4 SLOT TAKEN: "${name}" (${kind}) — resolve manually`,
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
    renamed: 0,
    would_rename: 0,
    conflict: 0,
    error: 0,
    baseReadFailures: 0,
  };

  lines.push(`ROOT=${ROOT}`);
  lines.push(`YEARS=${YEARS.join(", ")}`);
  lines.push(`STATE=${STATE}`);
  lines.push(`NEW_FOLDER=${NEW_FOLDER}`);
  lines.push(`CLOSE_RENAME_FROM=${CLOSE_RENAME_FROM}`);
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
      else if (result.action === "renamed") summary.renamed++;
      else if (result.action === "would_rename") summary.would_rename++;
      else if (result.action === "conflict") summary.conflict++;
      else if (result.action === "error") summary.error++;

      const prefix =
        result.action === "conflict"
          ? "❌"
          : result.action === "error"
            ? "❌"
            : result.action === "ok_exists"
              ? "✓"
              : result.action === "created" || result.action === "renamed"
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
    lines.push(`  would rename "${CLOSE_RENAME_FROM}": ${summary.would_rename}`);
    lines.push(`  would create: ${summary.would_create}`);
  } else {
    lines.push(`  renamed "${CLOSE_RENAME_FROM}" -> "${NEW_FOLDER}": ${summary.renamed}`);
    lines.push(`  created "${NEW_FOLDER}": ${summary.created}`);
  }
  lines.push(`  conflicts (other folder 4 slot): ${summary.conflict}`);
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
