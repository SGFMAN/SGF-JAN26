/**
 * Batch: rename folder
 *   "7. PROPERTY INFORMATION - Titles, Survey, POS, Sewer,BMO"
 * -> "7. PROPERTY INFORMATION"
 * under each project in VIC / 2025 and 2026.
 *
 * Reports:
 * - conflicts (both old+new exist, TO is a file, rename error)
 * - weird: any other folder in the "7" slot (name is "7", starts with "7." or "7 ")
 *   that is neither FROM nor TO — needs manual review.
 * - If neither FROM nor TO exists and no other slot-7 folder: creates "7. PROPERTY INFORMATION".
 *
 * Usage: node backend/rename-folder-7-property-information-vic-2025-2026.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = "Z:\\1.SGF PROJECT MANAGEMENT";
const YEARS = ["2025", "2026"];
const STATE = "VIC";

const FROM =
  "7. PROPERTY INFORMATION - Titles, Survey, POS, Sewer,BMO";
const TO = "7. PROPERTY INFORMATION";

const DRY_RUN = true;

const LOG_PATH = path.join(
  __dirname,
  `rename-folder-7-property-information-${STATE}-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
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

/** Slot 7 (not "70. …"). */
function isSlot7FolderName(name) {
  return name === "7" || name.startsWith("7.") || name.startsWith("7 ");
}

function listSlot7Dirs(projectPath) {
  const entries = safeReaddir(projectPath);
  if (entries.error) return { error: entries.error };
  const dirs = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (isSlot7FolderName(ent.name)) dirs.push(ent.name);
  }
  return { dirs };
}

function processProject(projectPath) {
  const fromPath = path.join(projectPath, FROM);
  const toPath = path.join(projectPath, TO);

  const slot = listSlot7Dirs(projectPath);
  if (slot.error) {
    return { action: "error", detail: slot.error.message, weird: [] };
  }

  const hasFrom = isDir(fromPath);
  const hasTo = isDir(toPath);

  const weird = slot.dirs.filter((n) => n !== FROM && n !== TO);

  if (hasTo && hasFrom) {
    return {
      action: "conflict_both",
      detail: `both "${FROM}" and "${TO}" exist as folders`,
      weird,
    };
  }

  if (hasTo && !hasFrom) {
    return {
      action: "ok_skip",
      detail: `already has "${TO}" (no "${FROM}")`,
      weird,
    };
  }

  if (!hasFrom && fs.existsSync(toPath) && !isDir(toPath)) {
    return {
      action: "conflict_file",
      detail: `"${TO}" exists but is not a folder`,
      weird,
    };
  }

  if (hasFrom) {
    if (fs.existsSync(toPath) && !isDir(toPath)) {
      return {
        action: "conflict_file",
        detail: `"${TO}" exists but is not a folder`,
        weird,
      };
    }
    if (DRY_RUN) {
      return {
        action: "would_rename",
        detail: `would rename FROM -> TO`,
        weird,
      };
    }
    try {
      fs.renameSync(fromPath, toPath);
      return { action: "renamed", detail: `renamed FROM -> TO`, weird };
    } catch (e) {
      return { action: "error", detail: `rename failed: ${e.message}`, weird };
    }
  }

  if (weird.length > 0) {
    return {
      action: "weird_only",
      detail: `no "${FROM}"; other slot-7 folders present — see weird`,
      weird,
    };
  }

  if (DRY_RUN) {
    return {
      action: "would_create",
      detail: `would mkdir "${TO}"`,
      weird: [],
    };
  }
  try {
    fs.mkdirSync(toPath, { recursive: false });
    return { action: "created", detail: `created "${TO}"`, weird: [] };
  } catch (e) {
    return { action: "error", detail: `mkdir failed: ${e.message}`, weird: [] };
  }
}

function main() {
  const lines = [];
  const summary = {
    renamed: 0,
    would_rename: 0,
    ok_skip: 0,
    created: 0,
    would_create: 0,
    conflict_both: 0,
    conflict_file: 0,
    weird_only: 0,
    error: 0,
    baseReadFailures: 0,
  };

  lines.push(`ROOT=${ROOT}`);
  lines.push(`FROM=${FROM}`);
  lines.push(`TO=${TO}`);
  lines.push(`YEARS=${YEARS.join(", ")}`);
  lines.push(`STATE=${STATE}`);
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

      const key = result.action;
      if (summary[key] !== undefined) summary[key]++;

      const prefix =
        result.action === "conflict_both" || result.action === "conflict_file"
          ? "❌"
          : result.action === "error"
            ? "❌"
            : result.action === "weird_only"
              ? "⚠"
              : result.action === "ok_skip"
                ? "✓"
                : result.action === "renamed"
                  ? "✔"
                  : result.action === "created"
                    ? "✔"
                    : "○";

      let line = `${prefix} [${year}] ${rel} — ${result.detail}`;
      if (result.weird && result.weird.length > 0) {
        line += ` | WEIRD slot-7: ${result.weird.map((w) => `"${w}"`).join(", ")}`;
      }
      console.log(line);
      lines.push(line);
    }
  }

  lines.push("");
  lines.push("Summary:");
  lines.push(`  renamed: ${summary.renamed}`);
  lines.push(`  would_rename (dry run): ${summary.would_rename}`);
  lines.push(`  created "${TO}": ${summary.created}`);
  lines.push(`  would_create (dry run): ${summary.would_create}`);
  lines.push(`  already had "${TO}" / no old name: ${summary.ok_skip}`);
  lines.push(`  conflict (both FROM and TO folders): ${summary.conflict_both}`);
  lines.push(`  conflict (${TO} exists as file): ${summary.conflict_file}`);
  lines.push(`  no FROM but other slot-7 folders (review): ${summary.weird_only}`);
  lines.push(`  errors: ${summary.error}`);
  lines.push(`  base folder read failures: ${summary.baseReadFailures}`);
  lines.push("");
  lines.push(`Log: ${LOG_PATH}`);

  console.log("\n--- Summary ---");
  const i = lines.findIndex((l) => l === "Summary:");
  if (i >= 0) for (let j = i; j < lines.length; j++) console.log(lines[j]);

  writeLog(lines);
}

main();
