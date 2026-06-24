const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const WORK_HOUR_LABELS = new Map([
  [-1, "Select"],
  [0, "None"],
  [60, "1 hour"],
  [120, "2 hour"],
  [180, "3 hour"],
  [240, "4 hour"],
  [300, "5 hour"],
  [360, "6 hour"],
  [420, "7 hour"],
  [480, "8 hour"],
]);

const BREAK_LABELS = new Map([
  [-1, "Select"],
  [0, "None"],
  [30, "30 min"],
  [60, "1 hour"],
]);

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "User";
}

function labelForMinutes(minutes, labelMap) {
  const total = Number(minutes);
  if (labelMap.has(total)) return labelMap.get(total);
  if (!Number.isFinite(total) || total <= 0) return "None";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return hours === 1 ? "1 hour" : `${hours} hour`;
  return `${hours} hr ${mins} min`;
}

function resolveProjectLabel(projectId, projectLabels = {}) {
  if (!projectId || projectId === "") return "Select...";
  if (projectId === "office") return "Office";
  return projectLabels[String(projectId)] || `Project ${projectId}`;
}

function buildTimesheetRows({ userName, periodLabel, periodDays, dayEntries, projectLabels }) {
  const rows = [
    [`Time Sheet - ${userName || "User"}`],
    [periodLabel || ""],
    [],
    ["Week", "Day", "Date", "Hours", "Break", "Overtime", "Project"],
  ];

  const days = Array.isArray(periodDays) ? periodDays : [];
  const entries = Array.isArray(dayEntries) ? dayEntries : [];

  days.forEach((day, index) => {
    const entry = entries[index] || {};
    rows.push([
      index < 7 ? "Week 1" : "Week 2",
      day.weekday || "",
      day.dateLabel || day.iso || "",
      labelForMinutes(entry.workMinutes, WORK_HOUR_LABELS),
      labelForMinutes(entry.breakMinutes, BREAK_LABELS),
      labelForMinutes(entry.overtimeMinutes, WORK_HOUR_LABELS),
      resolveProjectLabel(entry.projectId, projectLabels),
    ]);
  });

  return rows;
}

function exportTimesheetWorkbook({ exportDir, filename, rows }) {
  const dir = String(exportDir || "").trim();
  if (!dir) {
    throw new Error("Time Sheet Export path is not configured. Set it in Settings → File Settings.");
  }

  fs.mkdirSync(dir, { recursive: true });

  const safeName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const filePath = path.join(dir, safeName);

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Time Sheet");
  XLSX.writeFile(workbook, filePath);

  return filePath;
}

function buildTimesheetFilename(userName, cycleKey) {
  const namePart = sanitizeFilenamePart(userName);
  const cyclePart = sanitizeFilenamePart(cycleKey || "cycle");
  return `TimeSheet_${namePart}_${cyclePart}.xlsx`;
}

module.exports = {
  buildTimesheetRows,
  exportTimesheetWorkbook,
  buildTimesheetFilename,
};
