/**
 * Batch for QLD 2025:
 * If folder exists:
 *   21. CONSTRUCTION\Published Plans
 * then copy ALL files/folders inside it into:
 *   2. PUBLISHED PLANS
 * and then delete source folder:
 *   21. CONSTRUCTION\Published Plans
 *
 * Root: QLD_ROOT or DATABASE_URL + settings (same as other QLD scripts).
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const yearArg = process.argv.find((a) => a.startsWith("--year="));
const YEAR = (yearArg ? yearArg.split("=")[1] : "2025").trim();
const STATE = "QLD";
const SRC_REL = path.join("21. CONSTRUCTION", "Published Plans");
const DEST_REL = "2. PUBLISHED PLANS";
const LOG_PATH = path.join(__dirname, `qld-move-published-plans-${YEAR}-REAL.log`);

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
  if (process.env.DATABASE_SSL === "0") return {};
  if (process.env.DATABASE_SSL === "1") return { ssl: { rejectUnauthorized: false } };
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
  if (envRoot) return path.resolve(envRoot);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set QLD_ROOT or DATABASE_URL.");

  const client = new Client({ connectionString: url, ...pgSslConfig(url) });
  await client.connect();
  try {
    const r = await client.query("SELECT root_directory_qld, root_directory FROM settings WHERE id = 1");
    const row = r.rows[0] || {};
    const root = String(row.root_directory_qld || row.root_directory || "").trim();
    if (!root) throw new Error("settings root is empty.");
    return path.resolve(root);
  } finally {
    await client.end();
  }
}

function copyContents(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const src = path.join(srcDir, ent.name);
    const dest = path.join(destDir, ent.name);
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
}

async function run() {
  const lines = [];
  note(lines, `QLD ${YEAR} move: 21.CONSTRUCTION/Published Plans -> 2.PUBLISHED PLANS`);
  note(lines, "");

  const root = await resolveQldRoot();
  const base = path.join(root, YEAR, STATE);

  note(lines, `QLD root: ${root}`);
  note(lines, `Scanning: ${base}`);

  const projects = safeReaddir(base);
  if (projects.error) {
    note(lines, `❌ Cannot read ${base}: ${projects.error.message}`);
    writeLog(lines);
    process.exitCode = 1;
    return;
  }

  for (const ent of projects) {
    if (!ent.isDirectory()) continue;
    const projectPath = path.join(base, ent.name);
    const srcPath = path.join(projectPath, SRC_REL);
    const destPath = path.join(projectPath, DEST_REL);

    if (!isDir(srcPath)) {
      note(lines, `⚠ SKIP (source missing): ${projectPath}`);
      continue;
    }
    if (fs.existsSync(destPath) && !isDir(destPath)) {
      note(lines, `❌ SKIP (dest exists as file): ${projectPath}`);
      continue;
    }
    if (!isDir(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    try {
      copyContents(srcPath, destPath);
      fs.rmSync(srcPath, { recursive: true, force: true });
      note(lines, `✔ MOVED Published Plans: ${projectPath}`);
    } catch (e) {
      note(lines, `❌ FAILED (${e.message}): ${projectPath}`);
    }
  }

  note(lines, "");
  note(lines, "✅ Batch complete");
  note(lines, `Log: ${LOG_PATH}`);
  writeLog(lines);
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
