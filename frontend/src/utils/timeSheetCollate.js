import { isTimesheetSelectableDay } from "./timeSheetPayCycle";
import { SELECT_DURATION_MINUTES } from "./timeSheetTime";

export const PAY_RATE = {
  BASE: "Base Hourly",
  OT15: "Overtime (1.5x)",
  OT2: "Overtime (2x)",
};

export const BASE_HOURLY_MIN = 4;
export const BASE_HOURLY_MAX = 12;
export const OVERTIME_15_MIN = 0;
export const OVERTIME_15_MAX = 5;
export const DEFAULT_BASE_HOURLY_HOURS = 8;
export const DEFAULT_OVERTIME_15_HOURS = 2;

export const BASE_HOURLY_OPTIONS = Array.from(
  { length: BASE_HOURLY_MAX - BASE_HOURLY_MIN + 1 },
  (_, i) => BASE_HOURLY_MIN + i
);
export const OVERTIME_15_OPTIONS = Array.from(
  { length: OVERTIME_15_MAX - OVERTIME_15_MIN + 1 },
  (_, i) => OVERTIME_15_MIN + i
);

const EXPORT_HEADERS = ["Employee Co./Last Name", "{}", "Payroll Category", "Date", "Units"];

function positiveMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function clampPayHours(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function formatHourOptionLabel(hours) {
  const n = Number(hours);
  if (n === 1) return "1 hour";
  return `${n} hours`;
}

export function formatTimesheetHours(hours, category = PAY_RATE.BASE) {
  const n = Number(hours);
  const isBase = category === PAY_RATE.BASE;
  if (!Number.isFinite(n) || n <= 0) return isBase ? "0.00000000" : "0";
  if (isBase) return n.toFixed(8);
  return String(Math.round(n));
}

export function entryTotalHours(entry) {
  const work = positiveMinutes(entry?.workMinutes);
  const overtime = positiveMinutes(entry?.overtimeMinutes);
  return (work + overtime) / 60;
}

export function splitEmployeeName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { lastName: "User", firstName: "" };
  if (parts.length === 1) return { lastName: parts[0], firstName: "" };
  return {
    lastName: parts[parts.length - 1],
    firstName: parts.slice(0, -1).join(" "),
  };
}

export function timesheetExportNameParts(user) {
  const split = splitEmployeeName(user?.name);
  const aliasSurname = String(user?.timesheet_alias_surname || "").trim();
  const aliasFirst = String(user?.timesheet_alias_firstname || "").trim();
  return {
    lastName: aliasSurname || split.lastName,
    firstName: aliasFirst || split.firstName,
  };
}

export function isTimesheetExportUser(user) {
  return user?.timesheet_export === true || user?.timesheet_export === "true";
}

export function isSubmittedTimesheet(sheet) {
  return sheet?.submitted === true || sheet?.submitted === "t" || sheet?.submitted === "true";
}

/** Users who clicked Send for the current pay cycle, in name order. */
export function submittedTimesheetUsers(users, sheets) {
  const usersById = new Map();
  for (const user of Array.isArray(users) ? users : []) {
    const id = Number(user?.id);
    if (!Number.isFinite(id)) continue;
    usersById.set(id, user);
  }

  const seen = new Set();
  const submitted = [];
  for (const sheet of Array.isArray(sheets) ? sheets : []) {
    if (!isSubmittedTimesheet(sheet)) continue;
    const userId = Number(sheet.userId);
    if (!Number.isFinite(userId) || seen.has(userId)) continue;
    seen.add(userId);
    submitted.push(
      usersById.get(userId) || {
        id: userId,
        name: String(sheet.userName || "").trim() || "User",
      }
    );
  }

  return submitted.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
  );
}

function localIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

export function formatTimesheetDate(day) {
  if (!day || typeof day !== "object") return "";
  if (day.date) {
    const iso = localIsoDate(day.date);
    if (iso) return iso;
  }
  const iso = String(day.iso || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return String(day.dateLabel || "").trim();
}

function weekdayName(day) {
  return String(day?.weekday || day?.expectedWeekday || "");
}

function isSaturday(day) {
  return weekdayName(day) === "Saturday";
}

function isUnsetDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === SELECT_DURATION_MINUTES) return true;
  return n <= 0;
}

/** Skip a day when Hours is None or still on Select. */
export function hasExportableTimesheetHours(entry) {
  return !isUnsetDuration(entry?.workMinutes);
}

/**
 * Split a day's total hours into Base / 1.5x / 2x bands.
 * Weekdays: base first, then 1.5x, then remaining 2x.
 * Saturday: no base; first 1.5x hours, then remaining 2x.
 */
export function splitHoursByPayRate(totalHours, day, rates) {
  const total = Number(totalHours);
  if (!Number.isFinite(total) || total <= 0) return [];

  const baseCap = clampPayHours(
    rates?.baseHourlyHours,
    BASE_HOURLY_MIN,
    BASE_HOURLY_MAX,
    DEFAULT_BASE_HOURLY_HOURS
  );
  const ot15Cap = clampPayHours(
    rates?.overtime15Hours,
    OVERTIME_15_MIN,
    OVERTIME_15_MAX,
    DEFAULT_OVERTIME_15_HOURS
  );

  const bands = [];
  let remaining = total;

  if (!isSaturday(day)) {
    const base = Math.min(remaining, baseCap);
    if (base > 0) bands.push({ category: PAY_RATE.BASE, hours: base });
    remaining -= base;
  }

  const ot15 = Math.min(remaining, ot15Cap);
  if (ot15 > 0) bands.push({ category: PAY_RATE.OT15, hours: ot15 });
  remaining -= ot15;

  if (remaining > 0) bands.push({ category: PAY_RATE.OT2, hours: remaining });
  return bands;
}

/**
 * MYOB-style tab-separated timesheet export: one line per pay-rate band per day per user.
 */
export function buildCollatedTimesheetTxt({ users, sheets, periodDays, rates }) {
  const days = Array.isArray(periodDays) ? periodDays : [];
  const sheetByUser = new Map();
  for (const sheet of Array.isArray(sheets) ? sheets : []) {
    if (!isSubmittedTimesheet(sheet)) continue;
    const userId = Number(sheet?.userId);
    if (!Number.isFinite(userId)) continue;
    sheetByUser.set(userId, sheet);
  }

  const included = submittedTimesheetUsers(users, sheets);

  const lines = [EXPORT_HEADERS.join("\t")];
  for (const user of included) {
    const { lastName, firstName } = timesheetExportNameParts(user);
    const sheet = sheetByUser.get(Number(user.id));
    const entries = Array.isArray(sheet?.dayEntries) ? sheet.dayEntries : [];
    const sheetDays = Array.isArray(sheet?.periodDays) && sheet.periodDays.length === days.length ? sheet.periodDays : days;
    for (let i = 0; i < days.length; i += 1) {
      const day = sheetDays[i] || days[i];
      if (!isTimesheetSelectableDay(day)) continue;
      const entry = entries[i];
      if (!hasExportableTimesheetHours(entry)) continue;
      const bands = splitHoursByPayRate(entryTotalHours(entry), day, rates);
      for (const band of bands) {
        lines.push(
          [lastName, firstName, band.category, formatTimesheetDate(day), formatTimesheetHours(band.hours, band.category)].join("\t")
        );
      }
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
