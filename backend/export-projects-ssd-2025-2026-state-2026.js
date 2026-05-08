/**
 * Export projects matching:
 *   - state (DB column) = '2026'  (trimmed, exact match — see note in output)
 *   - calendar year from `year` field in { 2025, 2026 }
 *   - classification = 'Small Second Dwelling'
 *
 * Usage: from repo root, with DATABASE_URL in backend/.env:
 *   node backend/export-projects-ssd-2025-2026-state-2026.js
 *
 * Output: projects-ssd-2025-2026-state-2026.txt (repo root)
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const CLASSIFICATION = "Small Second Dwelling";
const STATE_FILTER = "2026";
const YEARS = new Set([2025, 2026]);

function calendarYearFromProjectYear(y) {
  if (y == null) return null;
  const s = String(y).trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return parseInt(s.slice(0, 4), 10);
  if (s.includes("-")) {
    const p = s.split("-")[0].trim();
    if (/^\d{4}$/.test(p)) return parseInt(p, 10);
  }
  if (s.includes("/")) {
    const parts = s.split("/").map((x) => x.trim());
    if (parts.length === 3 && /^\d{4}$/.test(parts[2])) return parseInt(parts[2], 10);
  }
  return null;
}

async function main() {
  const outPath = path.join(__dirname, "..", "projects-ssd-2025-2026-state-2026.txt");

  if (!process.env.DATABASE_URL) {
    const msg =
      "DATABASE_URL is not set. Add it to backend/.env and run:\n" +
      "  node backend/export-projects-ssd-2025-2026-state-2026.js\n";
    fs.writeFileSync(outPath, msg, "utf8");
    console.error(msg);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const r = await pool.query(
    `SELECT id, name, status, suburb, street, state, stream, year, classification, updated_at
     FROM projects
     ORDER BY id`
  );

  const strictRows = r.rows.filter((p) => {
    const cls = (p.classification || "").trim();
    if (cls !== CLASSIFICATION) return false;
    const st = (p.state || "").trim();
    if (st !== STATE_FILTER) return false;
    const cy = calendarYearFromProjectYear(p.year);
    return cy != null && YEARS.has(cy);
  });

  const ssdYearRows = r.rows.filter((p) => {
    const cls = (p.classification || "").trim();
    if (cls !== CLASSIFICATION) return false;
    const cy = calendarYearFromProjectYear(p.year);
    return cy != null && YEARS.has(cy);
  });

  const rowLine = (p) => {
    const cy = calendarYearFromProjectYear(p.year);
    return [
      p.id,
      (p.name || "").replace(/\t/g, " "),
      (p.status || "").replace(/\t/g, " "),
      (p.suburb || "").replace(/\t/g, " "),
      (p.street || "").replace(/\t/g, " "),
      (p.state || "").replace(/\t/g, " "),
      (p.stream || "").replace(/\t/g, " "),
      (p.year != null ? String(p.year) : "").replace(/\t/g, " "),
      cy != null ? String(cy) : "",
      (p.classification || "").replace(/\t/g, " "),
      p.updated_at != null ? String(p.updated_at) : "",
    ].join("\t");
  };

  const header = [
    "id",
    "name",
    "status",
    "suburb",
    "street",
    "state",
    "stream",
    "year_raw",
    "calendar_year",
    "classification",
    "updated_at",
  ].join("\t");

  const lines = [];
  lines.push("=== SECTION A: Exact filters you asked for ===");
  lines.push("state (DB) = '2026' AND calendar year in {2025, 2026} AND classification = 'Small Second Dwelling'");
  lines.push("");
  lines.push(
    "NOTE: In this app `state` is almost always VIC or QLD. If you meant `year` = 2026 (or another field),"
  );
  lines.push("edit STATE_FILTER in backend/export-projects-ssd-2025-2026-state-2026.js and re-run.");
  lines.push("");
  lines.push(`Total matching Section A: ${strictRows.length}`);
  lines.push("");
  lines.push(header);
  for (const p of strictRows) lines.push(rowLine(p));

  lines.push("");
  lines.push("");
  lines.push("=== SECTION B: Same classification + years, any state (reference) ===");
  lines.push("classification = 'Small Second Dwelling' AND calendar year in {2025, 2026} — state not filtered");
  lines.push("");
  lines.push(`Total matching Section B: ${ssdYearRows.length}`);
  lines.push("");
  lines.push(header);
  for (const p of ssdYearRows) lines.push(rowLine(p));

  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote Section A: ${strictRows.length}, Section B: ${ssdYearRows.length} → ${outPath}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
