/**
 * Lists draftsperson for every project that matches HomePage
 * "Design Phase" + state filter QLD (same rules as Project Claim for state/status).
 *
 * Usage: node backend/list-qld-design-phase-draftsperson.js
 * Output: backend/qld-design-phase-draftsperson-report.txt
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { DRAFTSPERSON_UNASSIGNED } = require("./draftspersonConstants");

const UNASSIGNED_ALIASES = new Set([
  "",
  DRAFTSPERSON_UNASSIGNED.toLowerCase(),
  "select draftsperson",
  "select draftsperson...",
  "unassigned",
  "unasigned",
  "none",
]);

function isDraftspersonAssigned(raw) {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return false;
  return !UNASSIGNED_ALIASES.has(s);
}

function draftspersonStatusLabel(raw) {
  if (!isDraftspersonAssigned(raw)) return "UNASSIGNED (would show on Project Claim)";
  return `ASSIGNED: ${String(raw ?? "").trim()}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.PGSSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const r = await pool.query(`
    SELECT id, suburb, street, state, status, classification, draftsperson
    FROM projects
    WHERE TRIM(status) = 'Design Phase'
      AND UPPER(TRIM(COALESCE(state, ''))) IN ('QLD', 'QUEENSLAND')
    ORDER BY UPPER(TRIM(COALESCE(suburb, ''))), UPPER(TRIM(COALESCE(street, ''))), id
  `);

  const rows = r.rows;
  const lines = [];
  lines.push(`QLD + Design Phase projects: ${rows.length}`);
  lines.push(`Project Claim count (draftsperson unassigned): ${rows.filter((p) => !isDraftspersonAssigned(p.draftsperson)).length}`);
  lines.push(`Difference (assigned draftsperson): ${rows.filter((p) => isDraftspersonAssigned(p.draftsperson)).length}`);
  lines.push("");
  lines.push("id\tsuburb\tstreet\tstate\tclassification\tdraftsperson_raw\tstatus_for_claim");

  for (const p of rows) {
    const raw = p.draftsperson == null ? "" : String(p.draftsperson);
    const claim = !isDraftspersonAssigned(p.draftsperson) ? "CLAIM_ELIGIBLE" : "NOT_ON_CLAIM_LIST";
    lines.push(
      [
        p.id,
        (p.suburb || "").replace(/\t/g, " "),
        (p.street || "").replace(/\t/g, " "),
        (p.state || "").replace(/\t/g, " "),
        (p.classification || "").replace(/\t/g, " "),
        raw.replace(/\t/g, " ").replace(/\r?\n/g, " "),
        claim,
      ].join("\t")
    );
  }

  lines.push("");
  lines.push("--- Assigned only (these are on Design Phase QLD but NOT Project Claim) ---");
  for (const p of rows.filter((x) => isDraftspersonAssigned(x.draftsperson))) {
    lines.push(`#${p.id}  ${p.suburb || ""} / ${p.street || ""}  →  ${String(p.draftsperson).trim()}`);
  }

  const outPath = path.join(__dirname, "qld-design-phase-draftsperson-report.txt");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(lines.slice(0, 6).join("\n"));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
