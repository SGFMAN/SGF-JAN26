/**
 * One-time: copy `newProject.teamEmailTo` from Dual Dwelling - VIC / Dual Dwelling - QLD
 * into every other stream row (same state: VIC list → all * - VIC, QLD list → all * - QLD).
 *
 * Run from repo root with DATABASE_URL in .env:
 *   node backend/copy-dual-dwelling-newproject-team-email-to-all-streams.js --dry-run
 *   node backend/copy-dual-dwelling-newproject-team-email-to-all-streams.js
 *
 * Dual Dwelling rows are left unchanged (they are the source). All other streams get a
 * deep copy of the arrays so you can edit/delete per stream in Stream Settings afterward.
 */

require("dotenv").config();
const { Pool } = require("pg");

const SOURCE_VIC = "Dual Dwelling - VIC";
const SOURCE_QLD = "Dual Dwelling - QLD";

/** Keep aligned with frontend `STREAM_OPTIONS` in StreamSettings.jsx */
const ALL_STREAM_KEYS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling - VIC",
  "Dual Dwelling - QLD",
  "ATA - VIC",
  "ATA - QLD",
  "Pumped On Property - VIC",
  "Pumped On Property - QLD",
  "Henderson - VIC",
  "Henderson - QLD",
  "Create Cash Flow - VIC",
  "Create Cash Flow - QLD",
  "Fresh Start Advisory - VIC",
  "Fresh Start Advisory - QLD",
];

function parseStreamSettingsJson(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Deep copy team list: arrays as stored in UI (trim strings, keep empty slots). */
function cloneTeamEmailTo(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim());
  const s = String(raw).trim();
  if (!s) return [];
  return s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const r = await pool.query("SELECT stream_settings_json FROM settings WHERE id = 1");
    if (!r.rows.length) {
      console.error("No settings row id=1");
      process.exit(1);
    }

    const map = parseStreamSettingsJson(r.rows[0].stream_settings_json);
    const vicSource = cloneTeamEmailTo(map[SOURCE_VIC]?.newProject?.teamEmailTo);
    const qldSource = cloneTeamEmailTo(map[SOURCE_QLD]?.newProject?.teamEmailTo);

    console.log(`Source ${SOURCE_VIC} teamEmailTo (${vicSource.length}):`, JSON.stringify(vicSource));
    console.log(`Source ${SOURCE_QLD} teamEmailTo (${qldSource.length}):`, JSON.stringify(qldSource));

    const next = { ...map };

    for (const key of ALL_STREAM_KEYS) {
      if (key === SOURCE_VIC || key === SOURCE_QLD) continue;

      if (!next[key] || typeof next[key] !== "object") {
        next[key] = {};
      }
      const row = { ...next[key] };
      const np = row.newProject && typeof row.newProject === "object" && !Array.isArray(row.newProject) ? { ...row.newProject } : {};

      if (/ - VIC$/i.test(key)) {
        const before = JSON.stringify(cloneTeamEmailTo(np.teamEmailTo));
        np.teamEmailTo = cloneTeamEmailTo(vicSource);
        row.newProject = np;
        next[key] = row;
        console.log(
          `${dryRun ? "[dry-run] " : ""}${key}: teamEmailTo ${before === JSON.stringify(np.teamEmailTo) ? "(unchanged)" : "← copied from " + SOURCE_VIC} (${np.teamEmailTo.length} entries)`
        );
      } else if (/ - QLD$/i.test(key)) {
        const before = JSON.stringify(cloneTeamEmailTo(np.teamEmailTo));
        np.teamEmailTo = cloneTeamEmailTo(qldSource);
        row.newProject = np;
        next[key] = row;
        console.log(
          `${dryRun ? "[dry-run] " : ""}${key}: teamEmailTo ${before === JSON.stringify(np.teamEmailTo) ? "(unchanged)" : "← copied from " + SOURCE_QLD} (${np.teamEmailTo.length} entries)`
        );
      }
    }

    if (dryRun) {
      console.log("\nDry run only — no database write. Remove --dry-run to apply.");
      process.exit(0);
    }

    await pool.query("UPDATE settings SET stream_settings_json = $1::text, updated_at = NOW() WHERE id = 1", [
      JSON.stringify(next),
    ]);
    console.log("\nUpdated settings id=1. Reload Stream Settings in the app to see changes.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
