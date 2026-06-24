const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const EXPORT_HEADERS = [
  "Employee",
  "Project Name",
  "Total Hours",
  "1 x",
  "1.5 x",
  "2 x",
  "3 x",
];

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "User";
}

function isSunday(day) {
  return (day.weekday || day.expectedWeekday) === "Sunday";
}

function minutesToExportHours(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "";
  return Math.round((total / 60) * 100) / 100;
}

function resolveProjectName(projectId, projectNames = {}) {
  if (!projectId || projectId === "") return "";
  if (projectId === "office") return projectNames.office || "Office";
  return projectNames[String(projectId)] || `Project ${projectId}`;
}

function buildTimesheetRows({ userName, periodDays, dayEntries, projectNames }) {
  const rows = [EXPORT_HEADERS];
  const days = Array.isArray(periodDays) ? periodDays : [];
  const entries = Array.isArray(dayEntries) ? dayEntries : [];

  days.forEach((day, index) => {
    if (isSunday(day)) return;

    const entry = entries[index] || {};

    rows.push([
      userName || "User",
      resolveProjectName(entry.projectId, projectNames),
      minutesToExportHours(entry.workMinutes),
      "",
      "",
      "",
      "",
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
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, "Time Sheet");
  XLSX.writeFile(workbook, filePath);

  return filePath;
}

function buildTimesheetFilename(cycleKey) {
  const datePart = sanitizeFilenamePart(cycleKey || "date");
  return `Timesheet_${datePart}.xlsx`;
}

module.exports = {
  buildTimesheetRows,
  exportTimesheetWorkbook,
  buildTimesheetFilename,
};
