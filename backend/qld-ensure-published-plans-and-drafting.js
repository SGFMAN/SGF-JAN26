/**
 * QLD batch: under each <QLD root>/2025|2026/QLD/<project>/ ensure folders exist:
 *   - "2. PUBLISHED PLANS"
 *   - "1. DRAFTING"
 * If a folder already exists → skip. If a same-named file exists → skip with warning.
 *
 * Root: QLD_ROOT or DATABASE_URL + settings (same as other QLD batch scripts).
 *
 *   node qld-ensure-published-plans-and-drafting.js
 *   node qld-ensure-published-plans-and-drafting.js --dry-run
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const YEARS = ["2025", "2026"];
const STATE = "QLD";
const FOLDERS = ["2. PUBLISHED PLANS", "1. DRAFTING"];

const DRY_RUN = process.argv.includes("--dry-run");

const LOG_PATH = path.join(
  __dirname,
  `qld-ensure-plans-drafting-${YEARS.join("-")}-${DRY_RUN ? "DRYRUN" : "REAL"}.log`
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
      throw new Error("settings root is empty.");
    }
    return path.resolve(root);
  } finally {
    await client.end();
  }
}

function ensureFolder(projectPath, folderName, lines) {
  const target = path.join(projectPath, folderName);

  if (isDir(target)) {
    note(lines, `⚠ SKIP (already exists): "${folderName}" — ${projectPath}`);
    return;
  }

  if (fs.existsSync(target)) {
    note(lines, `❌ SKIP (not a folder): "${folderName}" — ${projectPath}`);
    return;
  }

  if (DRY_RUN) {
    note(lines, `WOULD CREATE "${folderName}": ${projectPath}`);
    return;
  }

  try {
    fs.mkdirSync(target, { recursive: false });
    note(lines, `✔ CREATED "${folderName}": ${projectPath}`);
  } catch (e) {
    note(lines, `❌ MKDIR failed "${folderName}" (${e.message}): ${projectPath}`);
  }
}

function processProject(projectPath, lines) {
  for (const name of FOLDERS) {
    ensureFolder(projectPath, name, lines);
  }
}

async function run() {
  const lines = [];
  note(lines, `Ensure folders: ${FOLDERS.map((f) => `"${f}"`).join(", ")} (QLD ${YEARS.join(", ")})`);
  note(lines, `${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"} — add --dry-run to preview`);
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
      processProject(projectPath, lines);
    }
  }

  note(lines, "");
  note(lines, "✅ Done");
  note(lines, `Log: ${LOG_PATH}`);
  writeLog(lines);
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
