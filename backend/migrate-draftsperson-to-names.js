/**
 * One-time migration for `projects.draftsperson`:
 * 1. Writes a JSON backup of all id + draftsperson values before changes.
 * 2. Ensures column is text.
 * 3. Replaces all-numeric values with `users.name` where `users.id` matches.
 * 4. Any remaining all-numeric value (no users row) becomes a descriptive string
 *    that embeds the former id (no silent data loss).
 * 5. NULL / empty string → DRAFTSPERSON_UNASSIGNED.
 * 6. Sets DEFAULT and NOT NULL on `draftsperson`.
 *
 * Requires DATABASE_URL (see backend .env). Optional PGSSL=true.
 *
 * Usage: node backend/migrate-draftsperson-to-names.js
 */
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { DRAFTSPERSON_UNASSIGNED } = require("./draftspersonConstants");

const ORPHAN_PREFIX = "[Former draftsperson user id ";
const ORPHAN_SUFFIX = " — no matching users row]";

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

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(__dirname, `migrate-draftsperson-backup-${stamp}.json`);

  const client = await pool.connect();
  try {
    const snap = await client.query(
      "SELECT id, draftsperson FROM projects ORDER BY id"
    );
    fs.writeFileSync(backupPath, JSON.stringify(snap.rows, null, 2), "utf8");
    console.log(`Backup written: ${backupPath} (${snap.rows.length} rows)`);

    await client.query("BEGIN");

    const col = await client.query(
      `SELECT data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'draftsperson'`
    );
    if (col.rows.length === 0) {
      throw new Error('Column "draftsperson" not found on projects');
    }
    const dtype = col.rows[0].data_type;
    console.log(`Column type: ${dtype}`);

    if (dtype !== "text" && dtype !== "character varying") {
      console.log("Altering draftsperson column to text…");
      await client.query(`
        ALTER TABLE projects
        ALTER COLUMN draftsperson TYPE text
        USING (CASE WHEN draftsperson IS NULL THEN NULL ELSE draftsperson::text END)
      `);
    }

    const r1 = await client.query(
      `UPDATE projects AS p
       SET draftsperson = u.name
       FROM users AS u
       WHERE trim(both from p.draftsperson::text) ~ '^[0-9]+$'
         AND u.id = trim(both from p.draftsperson::text)::integer`
    );
    console.log(`Numeric → user name updates: ${r1.rowCount}`);

    const r2 = await client.query(
      `UPDATE projects
       SET draftsperson = $1 || trim(both from draftsperson::text) || $2
       WHERE trim(both from draftsperson::text) ~ '^[0-9]+$'`,
      [ORPHAN_PREFIX, ORPHAN_SUFFIX]
    );
    console.log(`Orphan numeric → descriptive text: ${r2.rowCount}`);

    const r3 = await client.query(
      `UPDATE projects
       SET draftsperson = $1
       WHERE draftsperson IS NULL OR trim(both from draftsperson::text) = ''`,
      [DRAFTSPERSON_UNASSIGNED]
    );
    console.log(`NULL/empty → sentinel: ${r3.rowCount}`);

    const escapedDefault = DRAFTSPERSON_UNASSIGNED.replace(/'/g, "''");
    await client.query(
      `ALTER TABLE projects ALTER COLUMN draftsperson SET DEFAULT '${escapedDefault}'`
    );
    console.log("DEFAULT set.");

    await client.query(
      `ALTER TABLE projects ALTER COLUMN draftsperson SET NOT NULL`
    );
    console.log("NOT NULL set.");

    await client.query("COMMIT");
    console.log("Migration committed successfully.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
