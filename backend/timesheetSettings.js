/**
 * Settings → Timesheet. From/To and weekday pay-rate bands for the collated export.
 */

function sanitizeEmail(raw) {
  return String(raw != null ? raw : "").trim().slice(0, 200);
}

function sanitizeSelectedUserIds(raw) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const ids = [];
  for (const value of raw) {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    const key = Math.round(id);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(key);
  }
  return ids;
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const DEFAULT_BASE_HOURLY_HOURS = 8;
const DEFAULT_OVERTIME_15_HOURS = 2;
const BASE_HOURLY_MIN = 4;
const BASE_HOURLY_MAX = 12;
const OVERTIME_15_MIN = 0;
const OVERTIME_15_MAX = 5;

function emptyTimesheetSettings() {
  return {
    selectedUserIds: null,
    fromEmail: "",
    toEmail: "",
    baseHourlyHours: DEFAULT_BASE_HOURLY_HOURS,
    overtime15Hours: DEFAULT_OVERTIME_15_HOURS,
  };
}

function parseTimesheetSettingsColumn(raw) {
  let obj = raw;
  if (obj == null || obj === "") return emptyTimesheetSettings();
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return emptyTimesheetSettings();
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return emptyTimesheetSettings();
  return {
    selectedUserIds: sanitizeSelectedUserIds(obj.selectedUserIds),
    fromEmail: sanitizeEmail(obj.fromEmail),
    toEmail: sanitizeEmail(obj.toEmail),
    baseHourlyHours: clampInt(
      obj.baseHourlyHours,
      BASE_HOURLY_MIN,
      BASE_HOURLY_MAX,
      DEFAULT_BASE_HOURLY_HOURS
    ),
    overtime15Hours: clampInt(
      obj.overtime15Hours,
      OVERTIME_15_MIN,
      OVERTIME_15_MAX,
      DEFAULT_OVERTIME_15_HOURS
    ),
  };
}

module.exports = {
  emptyTimesheetSettings,
  parseTimesheetSettingsColumn,
  DEFAULT_BASE_HOURLY_HOURS,
  DEFAULT_OVERTIME_15_HOURS,
};
