/**
 * Copy everything from:
 *   <project>/2. CONTRACT ADMIN/<variation-folder>/
 * into:
 *   <project>/3. VARIATIONS/
 *
 * Scans: <QLD root>/<2025|2026>/QLD/<each project folder>/
 *
 * - If "2. CONTRACT ADMIN" is missing → skip (no error).
 * - If it exists but no variation-like subfolder → skip with note.
 *
 * Optional: node ... --test  → only BARELLAN POINT test project (2025).
 *
 * Root: QLD_ROOT or DATABASE_URL + settings (same as other QLD batch scripts).
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const YEARS = ["2025", "2026"];
const STATE = "QLD";
const CONTRACT_ADMIN = "2. CONTRACT ADMIN";
const DEST_FOLDER = "3. VARIATIONS";

const SOURCE_SUBFOLDER_CANDIDATES = [
  "variaiton",
  "variation",
  "variations",
  "Variation",
  "Variations",
];

const TEST_YEAR = "2025";
const TEST_PROJECT = "BARELLAN POINT - 1-5 Mitchell Street";

const TEST_ONLY = process.argv.includes("--test");

const LOG_PATH = path.join(
  __dirname,
  TEST_ONLY ? "qld-copy-to-3-variations-test.log" : "qld-copy-to-3-variations-2025-2026.log"
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

/**
 * @returns {{ ok: true, path: string, usedName: string } | { ok: false, skip: boolean, reason: string }}
 */
function resolveSourceVariationDir(projectPath) {
  const ca = path.join(projectPath, CONTRACT_ADMIN);
  if (!isDir(ca)) {
    return { ok: false, skip: true, reason: `no "${CONTRACT_ADMIN}"` };
  }
  for (const name of SOURCE_SUBFOLDER_CANDIDATES) {
    const p = path.join(ca, name);
    if (isDir(p)) {
      return { ok: true, path: p, usedName: name };
    }
  }
  let subdirs = [];
  try {
    subdirs = fs
      .readdirSync(ca, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (e) {
    return { ok: false, skip: false, reason: `cannot read "${CONTRACT_ADMIN}": ${e.message}` };
  }
  const fuzzy = subdirs.find((d) => /variat/i.test(d));
  if (fuzzy) {
    const p = path.join(ca, fuzzy);
    if (isDir(p)) {
      return { ok: true, path: p, usedName: fuzzy };
    }
  }
  return {
    ok: false,
    skip: true,
    reason: `no variation folder under "${CONTRACT_ADMIN}" (${subdirs.length ? subdirs.join(", ") : "no subfolders"})`,
  };
}

function processProject(projectPath, lines) {
  const srcResolved = resolveSourceVariationDir(projectPath);
  if (!srcResolved.ok) {
    if (srcResolved.skip) {
      note(lines, `⚠ SKIP (${srcResolved.reason}): ${projectPath}`);
    } else {
      note(lines, `❌ ${srcResolved.reason}: ${projectPath}`);
    }
    return;
  }

  const dest = path.join(projectPath, DEST_FOLDER);
  if (fs.existsSync(dest) && !isDir(dest)) {
    note(lines, `❌ SKIP ("${DEST_FOLDER}" exists as file): ${projectPath}`);
    return;
  }

  if (!isDir(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  try {
    fs.cpSync(srcResolved.path, dest, { recursive: true });
    note(
      lines,
      `✔ ${path.join(CONTRACT_ADMIN, srcResolved.usedName)} → ${DEST_FOLDER}: ${projectPath}`
    );
  } catch (e) {
    note(lines, `❌ COPY failed (${e.message}): ${projectPath}`);
  }
}

async function run() {
  const lines = [];
  note(lines, `${CONTRACT_ADMIN} → ${DEST_FOLDER} (QLD ${YEARS.join(", ")})`);
  note(lines, TEST_ONLY ? `MODE: --test (${TEST_YEAR}/${STATE}/${TEST_PROJECT})` : "MODE: all projects");
  note(lines, "");

  const root = await resolveQldRoot();
  note(lines, `QLD root: ${root}`);

  if (TEST_ONLY) {
    const projectPath = path.join(root, TEST_YEAR, STATE, TEST_PROJECT);
    if (!isDir(projectPath)) {
      const msg = `❌ Project folder not found: ${projectPath}`;
      console.error(msg);
      lines.push(msg);
      writeLog(lines);
      process.exitCode = 1;
      return;
    }
    processProject(projectPath, lines);
    note(lines, "");
    note(lines, "✅ Done");
    note(lines, `Log: ${LOG_PATH}`);
    writeLog(lines);
    return;
  }

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
