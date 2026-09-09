/**
 * Repair incomplete project start dates (year) from Sold log / sold_at only.
 * Does not invent 1 January or use Created dates.
 *
 * Usage: node backend/scripts/repair-year-only-start-dates.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");

function melbourneCalendarDate(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function utcLogStampToDate(stamp) {
  const iso = String(stamp).trim().replace(" ", "T");
  const d = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isCompleteStartDate(yearValue) {
  const v = String(yearValue || "").trim();
  if (!v) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const y = parseInt(v.slice(0, 4), 10);
    const m = parseInt(v.slice(5, 7), 10);
    const d = parseInt(v.slice(8, 10), 10);
    return Number.isFinite(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }
  if (v.includes("/")) {
    const parts = v.split("/").map((p) => p.trim());
    if (parts.length !== 3) return false;
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && String(c).length === 4;
  }
  return false;
}

function soldFromRow(row) {
  if (row.sold_at) {
    const d = new Date(row.sold_at);
    if (!Number.isNaN(d.getTime())) {
      return { iso: melbourneCalendarDate(d), source: "sold_at", at: d };
    }
  }

  const log = String(row.project_log || "");
  const soldLines = [...log.matchAll(/^(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?) - .*Sold.*$/gim)];
  if (soldLines.length) {
    const d = utcLogStampToDate(soldLines[soldLines.length - 1][1]);
    if (d) return { iso: melbourneCalendarDate(d), source: "sold_log", at: d };
  }

  return null;
}

function addressOf(row) {
  const street = String(row.street || "").trim();
  const suburb = String(row.suburb || "").trim();
  if (street || suburb) return [street, suburb].filter(Boolean).join(", ");
  return String(row.name || "").trim() || `(id ${row.id})`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const r = await pool.query(`
    SELECT id, name, street, suburb, state, year, status, sold_at, project_log
    FROM projects
    ORDER BY id
  `);

  // Previous pass filled 54 Warrandyte Rd from "Project Created" — that is not a Sold date.
  const warrandyte = r.rows.find((row) => row.id === 683);
  if (warrandyte && !soldFromRow(warrandyte) && String(warrandyte.year || "").trim() === "2026-04-24") {
    await pool.query(`UPDATE projects SET year = '2026', updated_at = NOW() WHERE id = 683`);
    warrandyte.year = "2026";
    console.log("Reverted id 683 to year-only (no Sold date in log).");
  }

  const incomplete = r.rows.filter((row) => !isCompleteStartDate(row.year));
  const updates = [];
  const remaining = [];

  for (const row of incomplete) {
    const sold = soldFromRow(row);
    if (sold) updates.push({ row, ...sold });
    else remaining.push(row);
  }

  console.log(`All projects: ${r.rows.length}`);
  console.log(`Incomplete start date: ${incomplete.length}`);
  console.log(`Corrected from Sold: ${updates.length}`);
  console.log(`Still incomplete (no Sold date): ${remaining.length}`);

  for (const u of updates) {
    console.log(
      `FIX id ${u.row.id} ${addressOf(u.row)} | ${JSON.stringify(u.row.year)} → ${u.iso} (${u.source})`
    );
    await pool.query(
      `UPDATE projects
       SET year = $1,
           sold_at = COALESCE(sold_at, $2),
           updated_at = NOW()
       WHERE id = $3`,
      [u.iso, u.at, u.row.id]
    );
  }

  console.log("\n=== REMAINING (no Sold date in log or sold_at) ===");
  for (const row of remaining) {
    const logHint = String(row.project_log || "").trim()
      ? String(row.project_log).split("\n")[0].slice(0, 80)
      : "(no log)";
    console.log(
      [
        row.id,
        addressOf(row),
        row.state || "",
        row.status || "",
        JSON.stringify(row.year ?? ""),
        logHint,
      ].join(" | ")
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
