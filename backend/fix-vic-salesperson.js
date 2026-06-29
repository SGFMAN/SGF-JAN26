// Set salesperson to Ben Donnan for all SGF - VIC projects.
require("dotenv").config();
const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

const STREAM = "SGF - VIC";
const SALESPERSON = "Ben Donnan";

async function main() {
  if (!pool) {
    console.error("DATABASE_URL not set. Cannot connect to database.");
    process.exit(1);
  }

  const preview = await pool.query(
    `SELECT id, suburb, street, salesperson
     FROM projects
     WHERE TRIM(stream) = $1
     ORDER BY id`,
    [STREAM]
  );

  console.log(`Found ${preview.rows.length} project(s) with stream "${STREAM}".\n`);

  const toUpdate = preview.rows.filter((row) => row.salesperson !== SALESPERSON);
  if (toUpdate.length === 0) {
    console.log(`All projects already have salesperson "${SALESPERSON}".`);
    await pool.end();
    return;
  }

  console.log(`Updating ${toUpdate.length} project(s):\n`);
  for (const row of toUpdate) {
    const label = [row.suburb, row.street].filter(Boolean).join(" - ") || `ID ${row.id}`;
    console.log(`  ${label}: "${row.salesperson || ""}" -> "${SALESPERSON}"`);
  }

  const result = await pool.query(
    `UPDATE projects
     SET salesperson = $1
     WHERE TRIM(stream) = $2
       AND (salesperson IS DISTINCT FROM $1)`,
    [SALESPERSON, STREAM]
  );

  console.log(`\nUpdated ${result.rowCount} project(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
