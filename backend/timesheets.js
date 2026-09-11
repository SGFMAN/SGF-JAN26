function parseJsonColumn(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function ensureTimesheetsTable(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timesheets (
      user_id INTEGER NOT NULL,
      cycle_key TEXT NOT NULL,
      user_name TEXT,
      period_days TEXT,
      day_entries TEXT,
      submitted BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, cycle_key)
    )
  `);
  const columnCheck = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'submitted'`
  );
  const hadSubmittedColumn = columnCheck.rowCount > 0;
  try {
    await pool.query(
      `ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS submitted BOOLEAN NOT NULL DEFAULT FALSE`
    );
  } catch (e) {
    const message = String(e.message || "");
    if (!message.includes("already exists") && !message.includes("duplicate column")) {
      throw e;
    }
  }
  if (!hadSubmittedColumn) {
    await pool.query(`UPDATE timesheets SET submitted = TRUE`);
  }
}

async function ensureUserTimesheetColumns(pool) {
  if (!pool) return;
  const statements = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS timesheet_export BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS timesheet_alias_surname TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS timesheet_alias_firstname TEXT`,
  ];
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (e) {
      const message = String(e.message || "");
      if (!message.includes("already exists") && !message.includes("duplicate column")) {
        throw e;
      }
    }
  }
}

async function upsertTimesheet(pool, { userId, cycleKey, userName, periodDays, dayEntries }) {
  await pool.query(
    `INSERT INTO timesheets (user_id, cycle_key, user_name, period_days, day_entries, submitted, updated_at)
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     ON CONFLICT (user_id, cycle_key) DO UPDATE SET
       user_name = EXCLUDED.user_name,
       period_days = EXCLUDED.period_days,
       day_entries = EXCLUDED.day_entries,
       submitted = TRUE,
       updated_at = NOW()`,
    [
      userId,
      cycleKey,
      userName,
      JSON.stringify(Array.isArray(periodDays) ? periodDays : []),
      JSON.stringify(Array.isArray(dayEntries) ? dayEntries : []),
    ]
  );
}

function isSubmittedFlag(value) {
  return value === true || value === "t" || value === "true";
}

function mapTimesheetRow(row) {
  return {
    userId: Number(row.user_id),
    cycleKey: String(row.cycle_key || ""),
    userName: String(row.user_name || "").trim(),
    periodDays: parseJsonColumn(row.period_days, []),
    dayEntries: parseJsonColumn(row.day_entries, []),
    submitted: isSubmittedFlag(row.submitted),
    updatedAt: row.updated_at,
  };
}

async function listTimesheets(pool, { cycleKey } = {}) {
  const key = String(cycleKey || "").trim();
  const result = key
    ? await pool.query(
        `SELECT user_id, cycle_key, user_name, period_days, day_entries, submitted, updated_at
         FROM timesheets
         WHERE cycle_key = $1
         ORDER BY user_name ASC, user_id ASC`,
        [key]
      )
    : await pool.query(
        `SELECT user_id, cycle_key, user_name, period_days, day_entries, submitted, updated_at
         FROM timesheets
         ORDER BY cycle_key ASC, user_name ASC, user_id ASC`
      );
  return result.rows.map(mapTimesheetRow);
}

async function clearTimesheetSubmissions(pool, cycleKey) {
  const key = String(cycleKey || "").trim();
  if (!key) return 0;
  const result = await pool.query(
    `UPDATE timesheets SET submitted = FALSE WHERE cycle_key = $1`,
    [key]
  );
  return result.rowCount;
}

module.exports = {
  ensureTimesheetsTable,
  ensureUserTimesheetColumns,
  upsertTimesheet,
  listTimesheets,
  clearTimesheetSubmissions,
};
