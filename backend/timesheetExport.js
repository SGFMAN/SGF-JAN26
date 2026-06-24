const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const EXPORT_HEADERS = [
  "Employee",
  "Project Name",
  "Project Address",
  "Ref No.",
  "Start",
  "Finish",
  "Payable",
  "Break",
  "Job Details",
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

function resolveProjectInfo(projectId, projectInfo = {}) {
  if (!projectId || projectId === "") {
    return { name: "", address: "" };
  }
  if (projectId === "office") {
    return projectInfo.office || { name: "Office", address: "" };
  }
  return (
    projectInfo[String(projectId)] || {
      name: `Project ${projectId}`,
      address: "",
    }
  );
}

function buildTimesheetRows({ userName, periodDays, dayEntries, projectInfo }) {
  const rows = [EXPORT_HEADERS];
  const days = Array.isArray(periodDays) ? periodDays : [];
  const entries = Array.isArray(dayEntries) ? dayEntries : [];

  days.forEach((day, index) => {
    if (isSunday(day)) return;

    const entry = entries[index] || {};
    const project = resolveProjectInfo(entry.projectId, projectInfo);

    rows.push([
      userName || "User",
      project.name,
      project.address,
      "",
      "",
      "",
      minutesToExportHours(entry.workMinutes),
      minutesToExportHours(entry.breakMinutes),
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
    { wch: 32 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
  ];
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
