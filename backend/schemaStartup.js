/**
 * Speeds up server restarts by skipping repeated migrations when schema is current,
 * and running one-time maintenance tasks only once.
 */

/** Bump when ensureSchema() gains new migrations so they run once on deploy. */
const SCHEMA_VERSION = "2026-06-10-v1";

const PLANNING_JF_SCRUB_KEY = "planning_jf_scrub_v1";

async function ensureAppMeta(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

async function getMeta(pool, key) {
  const r = await pool.query(`SELECT value FROM app_meta WHERE key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}

async function setMeta(pool, key, value) {
  await pool.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

async function isSchemaUpToDate(pool) {
  if (process.env.FORCE_SCHEMA_RUN === "1") return false;
  return (await getMeta(pool, "schema_version")) === SCHEMA_VERSION;
}

async function markSchemaUpToDate(pool) {
  await setMeta(pool, "schema_version", SCHEMA_VERSION);
}

async function getExistingColumns(pool, tableName) {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(r.rows.map((row) => row.column_name));
}

/** Add only missing columns (one information_schema read per table). */
async function addMissingColumns(pool, tableName, columnNames, colType = "TEXT") {
  const existing = await getExistingColumns(pool, tableName);
  for (const col of columnNames) {
    if (existing.has(col)) continue;
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${col} ${colType}`);
    existing.add(col);
    console.log(`Added column ${tableName}.${col}`);
  }
}

async function shouldRunPlanningJfScrub(pool) {
  if (process.env.FORCE_PLANNING_JF_SCRUB === "1") return true;
  return (await getMeta(pool, PLANNING_JF_SCRUB_KEY)) !== "done";
}

async function markPlanningJfScrubDone(pool) {
  await setMeta(pool, PLANNING_JF_SCRUB_KEY, "done");
}

async function ensureBuildingPermitStatusWording(pool) {
  if (!pool) return;
  const result = await pool.query(`
    UPDATE projects
    SET building_permit_status = CASE
      WHEN TRIM(COALESCE(building_permit_status, '')) IN ('BAMS Paid', 'Waiting Vince Assessment')
        THEN building_permit_status
      WHEN planning_building_permit_received_at IS NOT NULL
        AND BTRIM(planning_building_permit_received_at::text) <> ''
        THEN 'Permit Issued'
      WHEN TRIM(COALESCE(building_permit_status, '')) IN ('Complete', 'Completed', 'Permit Issued')
        THEN 'Permit Issued'
      ELSE 'Not Submitted'
    END
    WHERE TRIM(COALESCE(building_permit_status, '')) NOT IN (
      'Not Submitted',
      'BAMS Paid',
      'Waiting Vince Assessment',
      'Permit Issued'
    )
    OR (
      TRIM(COALESCE(building_permit_status, '')) = 'Not Submitted'
      AND planning_building_permit_received_at IS NOT NULL
      AND BTRIM(planning_building_permit_received_at::text) <> ''
    )
  `);
  if (result.rowCount > 0) {
    console.log(`Updated building_permit_status wording on ${result.rowCount} project(s)`);
  }
}

module.exports = {
  SCHEMA_VERSION,
  ensureAppMeta,
  isSchemaUpToDate,
  markSchemaUpToDate,
  getMeta,
  setMeta,
  getExistingColumns,
  addMissingColumns,
  shouldRunPlanningJfScrub,
  markPlanningJfScrubDone,
  ensureBuildingPermitStatusWording,
};
