const { clearTimesheetCycle } = require("./timesheets");

/** First pay-cycle Wednesday (3 June 2026). Must match the frontend. */
const PAY_CYCLE_ANCHOR = new Date(2026, 5, 3);
const PAY_CYCLE_LENGTH_DAYS = 14;
const MS_PER_DAY = 86400000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

function addDays(date, days) {
  const d = new Date(startOfDay(date));
  d.setDate(d.getDate() + days);
  return d;
}

function payCycleWednesdayForDate(date = new Date()) {
  const d = startOfDay(date);
  const anchor = startOfDay(PAY_CYCLE_ANCHOR);
  const daysSinceAnchor = daysBetween(anchor, d);
  let cycleIndex = Math.floor(daysSinceAnchor / PAY_CYCLE_LENGTH_DAYS);
  if (daysSinceAnchor < 0) cycleIndex = Math.ceil(daysSinceAnchor / PAY_CYCLE_LENGTH_DAYS) - 1;

  let cycleWednesday = addDays(anchor, cycleIndex * PAY_CYCLE_LENGTH_DAYS);
  const periodStart = cycleWednesday;
  const periodEnd = addDays(periodStart, PAY_CYCLE_LENGTH_DAYS - 1);

  if (d < periodStart) {
    cycleWednesday = addDays(cycleWednesday, -PAY_CYCLE_LENGTH_DAYS);
  } else if (d > periodEnd) {
    cycleWednesday = addDays(cycleWednesday, PAY_CYCLE_LENGTH_DAYS);
  }

  return startOfDay(cycleWednesday);
}

function describeCycle(wednesday) {
  const date = startOfDay(wednesday);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const localDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    year,
    month,
    day,
    localDate,
    cycleKey: date.toISOString().slice(0, 10),
    wednesday: date,
  };
}

function cycleFromLocalDate(localDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(localDate || "").trim());
  if (!match) return null;
  return describeCycle(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

async function ensureTimesheetOpenCycleColumn(pool) {
  if (!pool) return;
  await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS timesheet_open_cycle_date TEXT`);
}

async function saveOpenCycleDate(pool, localDate) {
  const updated = await pool.query(
    `UPDATE settings SET timesheet_open_cycle_date = $1, updated_at = NOW() WHERE id = 1`,
    [localDate]
  );
  if (updated.rowCount > 0) return;
  await pool.query(
    `INSERT INTO settings (id, timesheet_open_cycle_date, updated_at) VALUES (1, $1, NOW())`,
    [localDate]
  );
}

function publicCycle(cycle) {
  return {
    year: cycle.year,
    month: cycle.month,
    day: cycle.day,
    localDate: cycle.localDate,
    cycleKey: cycle.cycleKey,
  };
}

/** The fortnight staff are still filling in. Stays on the fortnight just finished until export. */
async function getOpenTimesheetCycle(pool) {
  await ensureTimesheetOpenCycleColumn(pool);
  const result = await pool.query(`SELECT timesheet_open_cycle_date FROM settings WHERE id = 1`);
  const stored = cycleFromLocalDate(result.rows[0]?.timesheet_open_cycle_date);
  if (stored) return stored;
  const opened = describeCycle(payCycleWednesdayForDate(new Date()));
  await saveOpenCycleDate(pool, opened.localDate);
  return opened;
}

async function advanceOpenTimesheetCycle(pool, exportedCycleKey) {
  const open = await getOpenTimesheetCycle(pool);
  const key = String(exportedCycleKey || "").trim();
  if (!key || key !== open.cycleKey) {
    const error = new Error("That pay cycle is already closed.");
    error.status = 409;
    error.openCycle = publicCycle(open);
    throw error;
  }

  await clearTimesheetCycle(pool, open.cycleKey);
  const next = describeCycle(addDays(open.wednesday, PAY_CYCLE_LENGTH_DAYS));
  await clearTimesheetCycle(pool, next.cycleKey);
  await saveOpenCycleDate(pool, next.localDate);
  return next;
}

module.exports = {
  ensureTimesheetOpenCycleColumn,
  getOpenTimesheetCycle,
  advanceOpenTimesheetCycle,
  publicCycle,
};
