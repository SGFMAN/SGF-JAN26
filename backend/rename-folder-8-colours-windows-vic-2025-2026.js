/**
 * Batch: ensure each project folder under VIC / 2025 and 2026 has
 *   "8. COLOURS & WINDOWS"
 *
 * Behaviour:
 * - Already have exact target (or only case-variant on a case-sensitive FS): skip, or
 *   dry-run / rename to exact canonical name when needed.
 * - No slot-8 folder: create "8. COLOURS & WINDOWS" (dry-run: would_create).
 * - Exactly one other slot-8 folder: rename it -> TO (dry-run: would_rename).
 * - Target exists but other slot-8 folders also exist: weird_extra (manual merge).
 * - Two or more slot-8 folders, none matching TO: conflict_multiple (manual).
 *
 * Optional: with DATABASE_URL (and backend/.env), appends a DB cross-check for
 * VIC projects whose year folder is 2025/2026 — missing project root on disk,
 * or same slot-8 analysis on the expected path when it exists.
 *
 * Usage:
 *   node backend/rename-folder-8-colours-windows-vic-2025-2026.js [ROOT]
 *
 * ROOT defaults to VIC_PROJECT_ROOT env, then Z:\1.SGF PROJECT MANAGEMENT
 *
 * Set DRY_RUN = false only after reviewing the log.
 */

const fs = require("fs");
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch {
  /* optional */
}

const YEARS = ["2025", "2026"];
const STATE = "VIC";
const TO = "8. COLOURS & WINDOWS";

const ROOT =
  process.argv[2] ||
  process.env.VIC_PROJECT_ROOT ||
  "Z:\\1.SGF PROJECT MANAGEMENT";

/** Set to false to create/rename for real. */
const DRY_RUN = true;

const LOG_PATH = path.join(
  __dirname,
  `rename-folder-8-colours-windows-${STATE}-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
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

/** Slot 8 (same idea as slot 6/7 scripts; not "80. …"). */
function isSlot8FolderName(name) {
  return name === "8" || name.startsWith("8.") || name.startsWith("8 ");
}

function normSlot8(s) {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function listSlot8Dirs(projectPath) {
  const entries = safeReaddir(projectPath);
  if (entries.error) return { error: entries.error };
  const dirs = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (isSlot8FolderName(ent.name)) dirs.push(ent.name);
  }
  return { dirs };
}

function processProject(projectPath) {
  const toPath = path.join(projectPath, TO);
  const slot = listSlot8Dirs(projectPath);
  if (slot.error) {
    return { action: "error", detail: slot.error.message, dirs: [] };
  }

  const dirs = slot.dirs;
  const normTo = normSlot8(TO);

  if (fs.existsSync(toPath) && !isDir(toPath)) {
    return {
      action: "conflict_file",
      detail: `"${TO}" exists but is not a folder`,
      dirs,
    };
  }

  const sameNorm = dirs.filter((d) => normSlot8(d) === normTo);
  const otherSlot8 = dirs.filter((d) => normSlot8(d) !== normTo);
  const exactToDirExists = isDir(toPath);

  const hasCanonical = exactToDirExists || sameNorm.length > 0;

  if (hasCanonical && otherSlot8.length > 0) {
    return {
      action: "weird_extra",
      detail: `has "${TO}" (or equivalent) but also other slot-8: ${otherSlot8.map((x) => `"${x}"`).join(", ")}`,
      dirs,
    };
  }

  if (hasCanonical && otherSlot8.length === 0) {
    if (exactToDirExists) {
      const listedExact = dirs.includes(TO);
      if (
        !listedExact &&
        dirs.length === 1 &&
        sameNorm.length === 1 &&
        dirs[0] !== TO
      ) {
        if (DRY_RUN) {
          return {
            action: "would_rename_canonical",
            detail: `would rename "${dirs[0]}" -> "${TO}" (canonical spelling)`,
            dirs,
          };
        }
        try {
          fs.renameSync(path.join(projectPath, dirs[0]), toPath);
          return {
            action: "renamed_canonical",
            detail: `renamed "${dirs[0]}" -> "${TO}"`,
            dirs,
          };
        } catch (e) {
          return { action: "error", detail: e.message, dirs };
        }
      }
      return { action: "ok_skip", detail: `already has "${TO}"`, dirs };
    }
    if (sameNorm.length === 1 && sameNorm[0] !== TO) {
      if (DRY_RUN) {
        return {
          action: "would_rename_canonical",
          detail: `would rename "${sameNorm[0]}" -> "${TO}"`,
          dirs,
        };
      }
      try {
        fs.renameSync(path.join(projectPath, sameNorm[0]), toPath);
        return {
          action: "renamed_canonical",
          detail: `renamed "${sameNorm[0]}" -> "${TO}"`,
          dirs,
        };
      } catch (e) {
        return { action: "error", detail: e.message, dirs };
      }
    }
    return { action: "ok_skip", detail: `already has "${TO}"`, dirs };
  }

  if (dirs.length === 0) {
    if (DRY_RUN) {
      return { action: "would_create", detail: `would mkdir "${TO}"`, dirs };
    }
    try {
      fs.mkdirSync(toPath, { recursive: false });
      return { action: "created", detail: `created "${TO}"`, dirs };
    } catch (e) {
      return { action: "error", detail: e.message, dirs };
    }
  }

  if (dirs.length === 1) {
    const fromName = dirs[0];
    const fromPath = path.join(projectPath, fromName);
    if (DRY_RUN) {
      return {
        action: "would_rename",
        detail: `would rename "${fromName}" -> "${TO}"`,
        dirs,
      };
    }
    try {
      fs.renameSync(fromPath, toPath);
      return {
        action: "renamed",
        detail: `renamed "${fromName}" -> "${TO}"`,
        dirs,
      };
    } catch (e) {
      return { action: "error", detail: e.message, dirs };
    }
  }

  return {
    action: "conflict_multiple",
    detail: `multiple slot-8 folders (${dirs.length}) — manual review: ${dirs.map((d) => `"${d}"`).join(", ")}`,
    dirs,
  };
}

function folderYearFromDbYear(y) {
  const yearStr = String(y ?? "").trim();
  if (!yearStr) return "";
  if (yearStr.includes("-")) return yearStr.split("-")[0];
  return yearStr;
}

function projectFolderNameFromRow(row) {
  const suburb = (row.suburb || "").toUpperCase();
  const street = row.street || "";
  return `${suburb} - ${street}`.replace(/[<>:"/\\|?*]/g, "_");
}

async function runDbCrosscheck(lines) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    lines.push("");
    lines.push("--- DB cross-check skipped (DATABASE_URL not set) ---");
    return;
  }

  let pool;
  try {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: url });
  } catch (e) {
    lines.push("");
    lines.push(`--- DB cross-check failed (pg): ${e.message} ---`);
    return;
  }

  try {
    const r = await pool.query(`
      SELECT id, suburb, street, year
      FROM projects
      WHERE UPPER(TRIM(COALESCE(state, ''))) = 'VIC'
    `);

    lines.push("");
    lines.push("--- DB cross-check (VIC projects; year segment 2025 or 2026) ---");

    const wantYears = new Set(YEARS);
    let included = 0;
    let missingRoot = 0;

    for (const row of r.rows) {
      const py = folderYearFromDbYear(row.year);
      if (!wantYears.has(py)) continue;
      included++;
      const folderName = projectFolderNameFromRow(row);
      const projectPath = path.join(ROOT, py, STATE, folderName);

      if (!isDir(projectPath)) {
        missingRoot++;
        lines.push(
          `⚠ [DB id=${row.id}] expected folder missing on disk: ${path.relative(ROOT, projectPath) || projectPath}`
        );
        continue;
      }

      const result = processProject(projectPath);
      const prefix =
        result.action === "ok_skip"
          ? "✓"
          : result.action === "weird_extra" || result.action === "conflict_multiple"
            ? "⚠"
            : result.action === "error" || result.action === "conflict_file"
              ? "❌"
              : "○";
      lines.push(
        `${prefix} [DB id=${row.id}] ${path.relative(ROOT, projectPath)} — ${result.detail}`
      );
    }

    lines.push(`DB rows in scope: ${included}; missing project folder on disk: ${missingRoot}`);
  } catch (e) {
    lines.push(`DB query error: ${e.message}`);
  } finally {
    await pool.end();
  }
}

async function main() {
  const lines = [];
  const summary = {
    ok_skip: 0,
    would_create: 0,
    created: 0,
    would_rename: 0,
    renamed: 0,
    would_rename_canonical: 0,
    renamed_canonical: 0,
    weird_extra: 0,
    conflict_multiple: 0,
    conflict_file: 0,
    error: 0,
    baseReadFailures: 0,
  };

  lines.push(`ROOT=${ROOT}`);
  lines.push(`TO=${TO}`);
  lines.push(`YEARS=${YEARS.join(", ")}`);
  lines.push(`STATE=${STATE}`);
  lines.push(`DRY_RUN=${DRY_RUN}`);
  lines.push("");

  console.log(lines.slice(0, -1).join("\n"));

  for (const year of YEARS) {
    const base = path.join(ROOT, year, STATE);
    lines.push(`--- On-disk scan: ${year}/${STATE} ---`);
    console.log(`\n--- On-disk scan: ${year}/${STATE} ---`);

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
      if (Object.prototype.hasOwnProperty.call(summary, key)) summary[key]++;

      const prefix =
        result.action === "conflict_multiple" || result.action === "weird_extra"
          ? "⚠"
          : result.action === "error" || result.action === "conflict_file"
            ? "❌"
            : result.action === "ok_skip"
              ? "✓"
              : result.action === "renamed" || result.action === "renamed_canonical"
                ? "✔"
                : "○";

      let line = `${prefix} [${year}] ${rel} — ${result.detail}`;
      if (result.dirs && result.dirs.length > 0 && result.action === "conflict_multiple") {
        line += ` | dirs: ${result.dirs.map((d) => `"${d}"`).join(", ")}`;
      }
      console.log(line);
      lines.push(line);
    }
  }

  lines.push("");
  lines.push("--- On-disk summary ---");
  lines.push(`  ok_skip (already has "${TO}"): ${summary.ok_skip}`);
  lines.push(`  would_create: ${summary.would_create}`);
  lines.push(`  created: ${summary.created}`);
  lines.push(`  would_rename (single other slot-8 folder): ${summary.would_rename}`);
  lines.push(`  renamed: ${summary.renamed}`);
  lines.push(`  would_rename_canonical (spelling/case -> exact TO): ${summary.would_rename_canonical}`);
  lines.push(`  renamed_canonical: ${summary.renamed_canonical}`);
  lines.push(`  weird_extra (TO + other slot-8): ${summary.weird_extra}`);
  lines.push(`  conflict_multiple (2+ slot-8, none canonical): ${summary.conflict_multiple}`);
  lines.push(`  conflict_file: ${summary.conflict_file}`);
  lines.push(`  errors: ${summary.error}`);
  lines.push(`  base folder read failures: ${summary.baseReadFailures}`);

  await runDbCrosscheck(lines);

  lines.push("");
  lines.push(`Log: ${LOG_PATH}`);

  const summaryIdx = lines.findIndex((l) => l === "--- On-disk summary ---");
  if (summaryIdx >= 0) {
    console.log("");
    for (let j = summaryIdx; j < lines.length && !lines[j].startsWith("--- DB"); j++) {
      console.log(lines[j]);
    }
  }

  writeLog(lines);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
