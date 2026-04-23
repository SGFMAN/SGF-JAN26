/**
 * Fill empty client1_name / client1_email / client1_phone from an Excel file.
 * Never overwrites non-empty values already in the database.
 *
 * Match projects by Project Name (trimmed, exact) among QLD + Design Phase rows.
 *
 * Expected columns (case-insensitive; spacing flexible):
 *   Project Name, Contact1 name (or Contact 1 name), Contact1 email, Contact 1 phone
 *
 * Usage:
 *   node backend/import-qld-contact1-from-xlsx.js
 *   node backend/import-qld-contact1-from-xlsx.js "C:\\path\\to\\QLD_Project_Addresses.xlsx"
 *
 * Requires DATABASE_URL in backend/.env. Optional PGSSL=true.
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const DEFAULT_INPUT = path.join(__dirname, "..", "QLD_Project_Addresses.xlsx");

const QLD_DESIGN = `UPPER(TRIM(COALESCE(state, ''))) IN ('QLD', 'QUEENSLAND')
        AND TRIM(COALESCE(status, '')) = 'Design Phase'`;

function normHeader(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellStr(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function buildHeaderMap(headerRow) {
  const map = {};
  for (let c = 0; c < headerRow.length; c++) {
    const key = normHeader(headerRow[c]);
    if (key) map[key] = c;
  }
  return map;
}

function colIdx(map, ...aliases) {
  for (const a of aliases) {
    const i = map[normHeader(a)];
    if (i !== undefined) return i;
  }
  return undefined;
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

  const wb = XLSX.readFile(inputPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!data.length) {
    console.error("Spreadsheet is empty.");
    process.exit(1);
  }

  const headerRow = data[0];
  const h = buildHeaderMap(headerRow);
  const projectNameCol = colIdx(
    h,
    "Project Name",
    "Project name (DB)",
    "project name",
    "name"
  );
  const c1NameCol = colIdx(
    h,
    "Contact1 name",
    "Contact 1 name",
    "Client1 Name",
    "Client 1 name",
    "contact1 name"
  );
  const c1EmailCol = colIdx(h, "Contact1 email", "Contact 1 email", "contact1 email");
  const c1PhoneCol = colIdx(h, "Contact 1 phone", "Contact1 phone", "contact1 phone");

  if (
    projectNameCol === undefined ||
    c1NameCol === undefined ||
    c1EmailCol === undefined ||
    c1PhoneCol === undefined
  ) {
    console.error(
      "Missing columns. Need a project name column and Contact1 / Client1 name, email, phone columns."
    );
    console.error("Found:", headerRow.filter(Boolean).join(" | "));
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.PGSSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  let updated = 0;
  let skippedNothingToApply = 0;
  let skippedEmptyName = 0;
  let noMatch = 0;
  let duplicateNameWarnings = 0;

  try {
    const qldRows = await pool.query(
      `SELECT id, TRIM(name) AS project_name, client1_name, client1_email, client1_phone
       FROM projects WHERE ${QLD_DESIGN}`
    );
    /** @type {Map<string, { id: number }[]>} */
    const idsByProjectName = new Map();
    for (const row of qldRows.rows) {
      const key = row.project_name || "";
      if (!key) continue;
      const list = idsByProjectName.get(key) || [];
      list.push({ id: row.id });
      idsByProjectName.set(key, list);
    }

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      if (!row || !row.length) continue;

      const projectName = cellStr(row[projectNameCol]);
      if (!projectName) {
        skippedEmptyName++;
        continue;
      }

      const xName = cellStr(row[c1NameCol]);
      const xEmail = cellStr(row[c1EmailCol]);
      const xPhone = cellStr(row[c1PhoneCol]);
      if (xName === "" && xEmail === "" && xPhone === "") {
        skippedNothingToApply++;
        continue;
      }

      const found = idsByProjectName.get(projectName) || [];
      if (!found.length) {
        noMatch++;
        continue;
      }
      if (found.length > 1) duplicateNameWarnings++;

      for (const { id } of found) {
        const res = await pool.query(
          `UPDATE projects SET
            client1_name = CASE
              WHEN $1::text <> '' AND (client1_name IS NULL OR TRIM(COALESCE(client1_name, '')) = '')
              THEN $1::text ELSE client1_name END,
            client1_email = CASE
              WHEN $2::text <> '' AND (client1_email IS NULL OR TRIM(COALESCE(client1_email, '')) = '')
              THEN $2::text ELSE client1_email END,
            client1_phone = CASE
              WHEN $3::text <> '' AND (client1_phone IS NULL OR TRIM(COALESCE(client1_phone, '')) = '')
              THEN $3::text ELSE client1_phone END,
            updated_at = NOW()
          WHERE id = $4 AND ${QLD_DESIGN}
            AND (
              ($1::text <> '' AND (client1_name IS NULL OR TRIM(COALESCE(client1_name, '')) = ''))
              OR ($2::text <> '' AND (client1_email IS NULL OR TRIM(COALESCE(client1_email, '')) = ''))
              OR ($3::text <> '' AND (client1_phone IS NULL OR TRIM(COALESCE(client1_phone, '')) = ''))
            )`,
          [xName, xEmail, xPhone, id]
        );
        if (res.rowCount) updated++;
      }
    }

    console.log(`Rows updated (DB rows, can exceed sheet rows if duplicate names): ${updated}`);
    console.log(`Skipped (blank Project Name): ${skippedEmptyName}`);
    console.log(`Skipped (all three contact cells empty): ${skippedNothingToApply}`);
    console.log(`Skipped (no QLD Design Phase project with that name): ${noMatch}`);
    if (duplicateNameWarnings)
      console.log(
        `Note: ${duplicateNameWarnings} sheet row(s) matched multiple projects with the same name — each match was updated.`
      );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
