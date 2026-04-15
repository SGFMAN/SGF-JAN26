/**
 * Batch: under QLD root, for years 2025 and 2026 only:
 *   - In each project folder, delete "3. EMAILS" if present (recursive: all files + subfolders).
 *   - Always ensure "3. VARIATIONS" exists (create if missing), even when "3. EMAILS" was absent.
 *
 * Matches layout: <root_directory_qld>/<YYYY>/QLD/<SUBURB - STREET>/
 *
 * Root resolution:
 *   1) QLD_ROOT env (absolute path) — no DB required
 *   2) Else DATABASE_URL + settings.root_directory_qld || root_directory
 *
 * Safety: dry-run by default (logs only). Run with --apply to perform deletes/creates.
 *
 * Usage:
 *   node qld-delete-3-emails-add-3-variations.js
 *   node qld-delete-3-emails-add-3-variations.js --apply
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const YEARS = ["2025", "2026"];
const STATE = "QLD";
const DELETE_FOLDER = "3. EMAILS";
const CREATE_FOLDER = "3. VARIATIONS";

const APPLY = process.argv.includes("--apply") || process.env.APPLY === "1";
const DRY_RUN = !APPLY;

const LOG_PATH = path.join(
  __dirname,
  `qld-emails-to-variations-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
);

function writeLog(lines) {
  try {
    fs.writeFileSync(LOG_PATH, lines.join("\n") + "\n", "utf8");
  } catch (e) {
    console.error(`Failed to write log file: ${LOG_PATH} (${e.message})`);
  }
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

/** Remote Postgres often requires TLS (e.g. Neon, RDS). Localhost usually does not. */
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
    throw new Error(
      "Set QLD_ROOT to your QLD job-files root, or set DATABASE_URL to read settings.root_directory_qld."
    );
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
      throw new Error("settings.root_directory_qld / root_directory is empty.");
    }
    return path.resolve(root);
  } finally {
    await client.end();
  }
}

function processProject(projectPath, lines) {
  const emailsPath = path.join(projectPath, DELETE_FOLDER);
  const variationsPath = path.join(projectPath, CREATE_FOLDER);

  if (fs.existsSync(variationsPath) && !isDir(variationsPath)) {
    lines.push(`❌ SKIP ("${CREATE_FOLDER}" exists as file): ${projectPath}`);
    return;
  }

  if (fs.existsSync(emailsPath) && isDir(emailsPath)) {
    if (DRY_RUN) {
      lines.push(`WOULD DELETE (recursive): ${emailsPath}`);
    } else {
      try {
        fs.rmSync(emailsPath, { recursive: true, force: true });
        lines.push(`✔ DELETED "${DELETE_FOLDER}": ${projectPath}`);
      } catch (e) {
        lines.push(`❌ DELETE "${DELETE_FOLDER}" failed: ${projectPath} (${e.message})`);
      }
    }
  } else if (fs.existsSync(emailsPath)) {
    lines.push(`❌ SKIP ("${DELETE_FOLDER}" is not a folder): ${emailsPath}`);
  }

  if (isDir(variationsPath)) {
    lines.push(
      DRY_RUN
        ? `ℹ "${CREATE_FOLDER}" already exists (no mkdir): ${projectPath}`
        : `✓ "${CREATE_FOLDER}" already exists: ${projectPath}`
    );
    return;
  }

  if (DRY_RUN) {
    lines.push(`WOULD CREATE: ${variationsPath}`);
    return;
  }

  try {
    fs.mkdirSync(variationsPath, { recursive: false });
    lines.push(`✔ CREATED "${CREATE_FOLDER}": ${projectPath}`);
  } catch (e) {
    lines.push(`❌ CREATE "${CREATE_FOLDER}" failed: ${projectPath} (${e.message})`);
  }
}

async function main() {
  const lines = [];
  lines.push(`QLD batch: remove "${DELETE_FOLDER}", add "${CREATE_FOLDER}"`);
  lines.push(`Years: ${YEARS.join(", ")}  State: ${STATE}`);
  lines.push(`DRY_RUN=${DRY_RUN} (pass --apply or APPLY=1 to execute)`);
  lines.push("");

  let root;
  try {
    root = await resolveQldRoot();
  } catch (e) {
    const msg = `Failed to resolve QLD root: ${e.message}`;
    console.error(msg);
    lines.push(msg);
    writeLog(lines);
    process.exitCode = 1;
    return;
  }

  lines.push(`QLD root: ${root}`);
  console.log(lines.join("\n"));

  for (const year of YEARS) {
    const base = path.join(root, year, STATE);
    lines.push("");
    lines.push(`--- Scanning: ${base} ---`);
    console.log(`\n--- Scanning: ${base} ---`);

    const projects = safeReaddir(base);
    if (projects.error) {
      const msg = `⚠ Cannot read (missing or no access): ${base} (${projects.error.message})`;
      console.warn(msg);
      lines.push(msg);
      continue;
    }

    for (const ent of projects) {
      if (!ent.isDirectory()) continue;
      const projectPath = path.join(base, ent.name);
      processProject(projectPath, lines);
    }
  }

  const footer = ["", DRY_RUN ? "✅ Dry run done (no changes)." : "✅ Done.", "", `Log: ${LOG_PATH}`];
  footer.forEach((l) => lines.push(l));
  console.log(footer.join("\n"));

  writeLog(lines);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
