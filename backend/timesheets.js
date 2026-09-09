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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, cycle_key)
    )
  `);
}

async function upsertTimesheet(pool, { userId, cycleKey, userName, periodDays, dayEntries }) {
  await pool.query(
    `INSERT INTO timesheets (user_id, cycle_key, user_name, period_days, day_entries, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, cycle_key) DO UPDATE SET
       user_name = EXCLUDED.user_name,
       period_days = EXCLUDED.period_days,
       day_entries = EXCLUDED.day_entries,
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

function mapTimesheetRow(row) {
  return {
    userId: Number(row.user_id),
    cycleKey: String(row.cycle_key || ""),
    userName: String(row.user_name || "").trim(),
    periodDays: parseJsonColumn(row.period_days, []),
    dayEntries: parseJsonColumn(row.day_entries, []),
    updatedAt: row.updated_at,
  };
}

async function listTimesheets(pool, { cycleKey } = {}) {
  const key = String(cycleKey || "").trim();
  const result = key
    ? await pool.query(
        `SELECT user_id, cycle_key, user_name, period_days, day_entries, updated_at
         FROM timesheets
         WHERE cycle_key = $1
         ORDER BY user_name ASC, user_id ASC`,
        [key]
      )
    : await pool.query(
        `SELECT user_id, cycle_key, user_name, period_days, day_entries, updated_at
         FROM timesheets
         ORDER BY cycle_key ASC, user_name ASC, user_id ASC`
      );
  return result.rows.map(mapTimesheetRow);
}

module.exports = {
  ensureTimesheetsTable,
  upsertTimesheet,
  listTimesheets,
};
