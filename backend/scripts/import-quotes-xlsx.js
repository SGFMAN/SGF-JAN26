/**
 * Import quotes from Excel into projects (status Quote).
 * Skips rows that already exist (same street + suburb + state).
 *
 * Usage:
 *   node backend/scripts/import-quotes-xlsx.js
 *   node backend/scripts/import-quotes-xlsx.js "C:\\BD\\QUOTE to uplaod.xlsx"
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const XLSX = require("xlsx");
const { createQuote, findExistingQuoteId, parseQuoteAddedAt } = require("../quotes");

const DEFAULT_INPUT = "C:\\BD\\QUOTE to uplaod.xlsx";

function cell(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== "") return row[key];
  }
  const lower = {};
  for (const [k, v] of Object.entries(row)) lower[String(k).trim().toLowerCase()] = v;
  for (const key of keys) {
    const v = lower[String(key).trim().toLowerCase()];
    if (v != null && String(v).trim() !== "") return v;
  }
  return "";
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_INPUT);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const wb = XLSX.readFile(inputPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  console.log(`Read ${rows.length} row(s) from ${inputPath}`);

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const state = String(cell(row, "State")).trim().toUpperCase();
    const suburb = String(cell(row, "Suburb")).trim();
    const street = String(cell(row, "Street")).trim();
    const name = String(cell(row, "Name")).trim();
    const email = String(cell(row, "Email")).trim();
    const phone = String(cell(row, "Phone")).replace(/\D/g, "");
    const dateAdded = cell(row, "Date Added", "Date added", "created_at");
    if (!street || !suburb || (state !== "VIC" && state !== "QLD")) {
      skipped += 1;
      console.warn(`Skip incomplete: ${street || "?"} / ${suburb || "?"} / ${state || "?"}`);
      continue;
    }
    const existingId = await findExistingQuoteId(pool, street, suburb, state);
    if (existingId) {
      skipped += 1;
      console.log(`Skip duplicate: ${street}, ${suburb} (${state})`);
      continue;
    }
    const quote = await createQuote(pool, {
      state,
      suburb,
      street,
      name,
      email,
      phone,
      active: true,
      created_at: parseQuoteAddedAt(dateAdded) || dateAdded,
    });
    created += 1;
    console.log(`Added #${quote.id}: ${street}, ${suburb}  ${quote.created_at || ""}`);
  }

  await pool.end();
  console.log(`Done. created=${created} skipped=${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
