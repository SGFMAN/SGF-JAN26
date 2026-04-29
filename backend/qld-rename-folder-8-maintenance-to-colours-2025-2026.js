/**
 * QLD batch: every project under 2025/QLD and 2026/QLD gets folder "8. COLOURS & WINDOWS".
 *
 * - If "8. MAINTENANCE _DEFECTS" exists (case-insensitive match) and "8. COLOURS & WINDOWS"
 *   does not → rename to "8. COLOURS & WINDOWS".
 * - If neither exists → create empty "8. COLOURS & WINDOWS".
 * - If "8. COLOURS & WINDOWS" already exists → skip (if FROM also exists as a different
 *   folder → conflict; merge manually).
 *
 * Root: QLD_ROOT env, or DATABASE_URL + settings.root_directory_qld (fallback root_directory).
 *
 *   node backend/qld-rename-folder-8-maintenance-to-colours-2025-2026.js
 *   node backend/qld-rename-folder-8-maintenance-to-colours-2025-2026.js --verbose
 *   node backend/qld-rename-folder-8-maintenance-to-colours-2025-2026.js --live
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const YEARS = ["2025", "2026"];
const STATE = "QLD";
const FROM_CANON = "8. MAINTENANCE _DEFECTS";
const TO = "8. COLOURS & WINDOWS";

const LIVE = process.argv.includes("--live");
const DRY_RUN = !LIVE;
const VERBOSE = process.argv.includes("--verbose");

const LOG_PATH = path.join(
  __dirname,
  `qld-rename-folder-8-maintenance-colours-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
);

function writeLog(lines) {
  try {
    fs.writeFileSync(LOG_PATH, lines.join("\n") + "\n", "utf8");
  } catch (e) {
    console.error(`Failed to write log: ${LOG_PATH} (${e.message})`);
  }
}

function note(lines, msg) {
  lines.push(msg);
  console.log(msg);
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeReaddir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return { error: e };
  }
}

function pgSslConfig(connectionString) {
  if (process.env.DATABASE_SSL === "0") {
    return {};
  }
  if (process.env.DATABASE_SSL === "1") {
    return { ssl: { rejectUnauthorized: false } };
  }
  try {
    const u = new URL(connectionString.replace(/^postgres(ql)?:/i, "http:"));
    const host = u.hostname || "";
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return { ssl: { rejectUnauthorized: false } };
    }
  } catch {
    /* ignore */
  }
  return {};
}

async function resolveQldRoot() {
  const envRoot = (process.env.QLD_ROOT || "").trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Set QLD_ROOT or DATABASE_URL.");
  }
  const client = new Client({
    connectionString: url,
    ...pgSslConfig(url),
  });
  await client.connect();
  try {
    const r = await client.query(
      "SELECT root_directory_qld, root_directory FROM settings WHERE id = 1"
    );
    const row = r.rows[0] || {};
    const root = String(row.root_directory_qld || row.root_directory || "").trim();
    if (!root) {
      throw new Error("settings root_directory_qld (or root_directory) is empty.");
    }
    return path.resolve(root);
  } finally {
    await client.end();
  }
}

/** Actual on-disk folder name for FROM (case variant), or null. */
function findFromFolderName(projectPath) {
  const entries = safeReaddir(projectPath);
  if (entries.error) return { error: entries.error };
  const want = FROM_CANON.toLowerCase();
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.toLowerCase() === want) return { name: ent.name };
  }
  return { name: null };
}

function processProject(projectPath, relFromRoot, lines, stats) {
  const toPath = path.join(projectPath, TO);
  const found = findFromFolderName(projectPath);
  if (found.error) {
    stats.readErrors++;
    note(lines, `❌ Cannot read project dir: ${relFromRoot} (${found.error.message})`);
    return;
  }

  const fromName = found.name;
  const fromPath = fromName ? path.join(projectPath, fromName) : null;
  const hasToDir = isDir(toPath);

  if (hasToDir) {
    if (fromName && path.resolve(fromPath) !== path.resolve(toPath)) {
      stats.conflictBoth++;
      note(
        lines,
        `❌ CONFLICT ("${TO}" already exists; also have "${fromName}"): ${relFromRoot}`
      );
    } else {
      stats.skipAlreadyTarget++;
      if (VERBOSE) note(lines, `✓ SKIP (already "${TO}"): ${relFromRoot}`);
    }
    return;
  }

  if (fs.existsSync(toPath) && !isDir(toPath)) {
    stats.conflictFile++;
    note(lines, `❌ CONFLICT ("${TO}" exists but is not a folder): ${relFromRoot}`);
    return;
  }

  if (fromName) {
    if (DRY_RUN) {
      stats.wouldRename++;
      note(lines, `○ WOULD RENAME "${fromName}" → "${TO}": ${relFromRoot}`);
      return;
    }
    try {
      fs.renameSync(fromPath, toPath);
      stats.renamed++;
      note(lines, `✔ RENAMED "${fromName}" → "${TO}": ${relFromRoot}`);
    } catch (e) {
      stats.renameErrors++;
      note(lines, `❌ RENAME failed (${e.message}): ${relFromRoot}`);
    }
    return;
  }

  if (DRY_RUN) {
    stats.wouldCreate++;
    note(lines, `○ WOULD CREATE "${TO}" (no "${FROM_CANON}"): ${relFromRoot}`);
    return;
  }
  try {
    fs.mkdirSync(toPath, { recursive: false });
    stats.created++;
    note(lines, `✔ CREATED "${TO}": ${relFromRoot}`);
  } catch (e) {
    stats.createErrors++;
    note(lines, `❌ CREATE failed (${e.message}): ${relFromRoot}`);
  }
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

async function runDbCrosscheck(root, lines, stats) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    note(lines, "");
    note(lines, "--- DB cross-check skipped (DATABASE_URL not set) ---");
    return;
  }

  const client = new Client({
    connectionString: url,
    ...pgSslConfig(url),
  });
  await client.connect();
  try {
    const r = await client.query(`
      SELECT id, suburb, street, year, state
      FROM projects
      WHERE UPPER(TRIM(COALESCE(state, ''))) = 'QLD'
    `);
    const wantYears = new Set(YEARS);
    note(lines, "");
    note(lines, "--- DB cross-check (QLD; year folder 2025 or 2026) ---");

    for (const row of r.rows) {
      const py = folderYearFromDbYear(row.year);
      if (!wantYears.has(py)) continue;
      stats.dbRowsInScope++;
      const folderName = projectFolderNameFromRow(row);
      const projectPath = path.join(root, py, STATE, folderName);
      const rel = path.relative(root, projectPath) || projectPath;

      if (!isDir(projectPath)) {
        stats.dbMissingOnDisk++;
        note(lines, `⚠ [DB id=${row.id}] folder missing on disk: ${rel}`);
        continue;
      }

      const found = findFromFolderName(projectPath);
      if (found.error) {
        note(lines, `❌ [DB id=${row.id}] read error: ${rel}`);
        continue;
      }
      const toPath = path.join(projectPath, TO);
      if (isDir(toPath) && found.name && path.resolve(path.join(projectPath, found.name)) !== path.resolve(toPath)) {
        note(lines, `❌ [DB id=${row.id}] CONFLICT both FROM and TO: ${rel}`);
        stats.dbConflict++;
      } else if (found.name && !isDir(toPath)) {
        note(lines, `○ [DB id=${row.id}] would rename "${found.name}" → "${TO}": ${rel}`);
        stats.dbWouldRename++;
      } else if (!found.name && isDir(toPath)) {
        stats.dbAlreadyOk++;
      } else if (!found.name && !isDir(toPath)) {
        stats.dbWouldCreate++;
        note(lines, `○ [DB id=${row.id}] would create "${TO}" (no "${FROM_CANON}"): ${rel}`);
      }
    }

    note(lines, `DB rows in scope: ${stats.dbRowsInScope}`);
  } catch (e) {
    note(lines, `DB error: ${e.message}`);
  } finally {
    await client.end();
  }
}

async function run() {
  const lines = [];
  const stats = {
    wouldRename: 0,
    renamed: 0,
    wouldCreate: 0,
    created: 0,
    skipAlreadyTarget: 0,
    conflictBoth: 0,
    conflictFile: 0,
    readErrors: 0,
    renameErrors: 0,
    createErrors: 0,
    dbRowsInScope: 0,
    dbMissingOnDisk: 0,
    dbWouldRename: 0,
    dbWouldCreate: 0,
    dbConflict: 0,
    dbAlreadyOk: 0,
  };

  note(lines, `QLD: ensure "${TO}" (${YEARS.join(", ")}); rename "${FROM_CANON}" when present`);
  note(lines, `${DRY_RUN ? "DRY RUN — no disk changes. Use --live to apply." : "LIVE — renaming/creating on disk."}`);
  note(lines, "");

  const root = await resolveQldRoot();
  note(lines, `QLD root: ${root}`);

  for (const year of YEARS) {
    const base = path.join(root, year, STATE);
    note(lines, "");
    note(lines, `--- Scanning: ${base} ---`);

    const projects = safeReaddir(base);
    if (projects.error) {
      note(lines, `⚠ Cannot read: ${base} (${projects.error.message})`);
      continue;
    }

    for (const ent of projects) {
      if (!ent.isDirectory()) continue;
      const projectPath = path.join(base, ent.name);
      const rel = path.relative(root, projectPath) || projectPath;
      processProject(projectPath, rel, lines, stats);
    }
  }

  note(lines, "");
  note(lines, "--- On-disk summary ---");
  note(lines, `  would rename / renamed: ${DRY_RUN ? stats.wouldRename : stats.renamed}`);
  note(lines, `  would create / created "${TO}": ${DRY_RUN ? stats.wouldCreate : stats.created}`);
  note(lines, `  skip (already have "${TO}" only): ${stats.skipAlreadyTarget}`);
  note(lines, `  conflict (both FROM and TO folders): ${stats.conflictBoth}`);
  note(lines, `  conflict (TO exists as non-folder): ${stats.conflictFile}`);
  note(lines, `  read errors: ${stats.readErrors}`);
  if (!DRY_RUN) {
    note(lines, `  rename errors: ${stats.renameErrors}`);
    note(lines, `  create errors: ${stats.createErrors}`);
  }

  await runDbCrosscheck(root, lines, stats);

  note(lines, "");
  note(lines, `Log: ${LOG_PATH}`);
  writeLog(lines);
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
