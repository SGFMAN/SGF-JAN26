/**
 * Export Queensland Design Phase projects to Excel: Project Name + Contact 1 fields only.
 *
 * Requires DATABASE_URL in backend/.env. Optional PGSSL=true.
 *
 * Usage: node backend/export-qld-project-addresses.js
 * Output: QLD_Project_Addresses.xlsx (repo root)
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const path = require("path");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const OUTPUT = path.join(__dirname, "..", "QLD_Project_Addresses.xlsx");

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

  try {
    const r = await pool.query(`
      SELECT
        name,
        client1_name,
        client1_email,
        client1_phone
      FROM projects
      WHERE UPPER(TRIM(COALESCE(state, ''))) IN ('QLD', 'QUEENSLAND')
        AND TRIM(COALESCE(status, '')) = 'Design Phase'
      ORDER BY UPPER(TRIM(COALESCE(name, ''))), id
    `);

    const rows = r.rows.map((p) => ({
      "Project Name": p.name == null ? "" : String(p.name).trim(),
      "Contact1 name": p.client1_name == null ? "" : String(p.client1_name).trim(),
      "Contact1 email": p.client1_email == null ? "" : String(p.client1_email).trim(),
      "Contact 1 phone": p.client1_phone == null ? "" : String(p.client1_phone).trim(),
    }));

    const sheet = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "QLD Design Phase");
    sheet["!cols"] = [
      { wch: 40 },
      { wch: 28 },
      { wch: 32 },
      { wch: 18 },
    ];

    XLSX.writeFile(wb, OUTPUT);
    console.log(`Wrote ${OUTPUT} (${rows.length} rows).`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
