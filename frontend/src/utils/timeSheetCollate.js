function positiveMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function formatTimesheetHours(entry) {
  const work = positiveMinutes(entry?.workMinutes);
  const overtime = positiveMinutes(entry?.overtimeMinutes);
  const hours = (work + overtime) / 60;
  if (!Number.isFinite(hours) || hours <= 0) return "0";
  if (Number.isInteger(hours)) return String(hours);
  return String(Math.round(hours * 100) / 100);
}

export function formatTimesheetDate(day) {
  if (!day || typeof day !== "object") return "";
  const label = String(day.dateLabel || "").trim();
  if (label) return label;
  const iso = String(day.iso || "").trim();
  if (iso) return iso;
  return "";
}

/**
 * Tab-separated timesheet export: one line per day per selected user.
 * Checked users are included even if they have no submitted sheet (hours are 0).
 */
export function buildCollatedTimesheetTxt({ users, selectedUserIds, sheets, periodDays }) {
  const selected = new Set((Array.isArray(selectedUserIds) ? selectedUserIds : []).map((id) => Number(id)));
  const days = Array.isArray(periodDays) ? periodDays : [];
  const sheetByUser = new Map();
  for (const sheet of Array.isArray(sheets) ? sheets : []) {
    const userId = Number(sheet?.userId);
    if (!Number.isFinite(userId)) continue;
    sheetByUser.set(userId, sheet);
  }

  const included = (Array.isArray(users) ? users : [])
    .filter((user) => selected.has(Number(user.id)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));

  const lines = ["User name\tDate\tHours"];
  for (const user of included) {
    const name = String(user.name || "").trim() || "User";
    const sheet = sheetByUser.get(Number(user.id));
    const entries = Array.isArray(sheet?.dayEntries) ? sheet.dayEntries : [];
    const sheetDays = Array.isArray(sheet?.periodDays) && sheet.periodDays.length === days.length ? sheet.periodDays : days;
    for (let i = 0; i < days.length; i += 1) {
      const day = sheetDays[i] || days[i];
      lines.push(`${name}\t${formatTimesheetDate(day)}\t${formatTimesheetHours(entries[i])}`);
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
