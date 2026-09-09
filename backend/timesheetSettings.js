/**
 * Settings → Timesheet. Selected users and From/To for the collated export email.
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

function emptyTimesheetSettings() {
  return {
    selectedUserIds: null,
    fromEmail: "",
    toEmail: "",
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
  };
}

module.exports = {
  emptyTimesheetSettings,
  parseTimesheetSettingsColumn,
};
