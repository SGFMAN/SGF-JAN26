const fs = require("fs");
const path = require("path");

const EXPORT_HEADERS = [
  "Employee Co./Last Name",
  "{}",
  "Payroll Category",
  "Date",
  "Units",
];

const PAYROLL_CATEGORY = "Base Hourly";

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "date";
}

function isSunday(day) {
  return (day.weekday || day.expectedWeekday) === "Sunday";
}

function splitEmployeeName(fullName) {
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

function formatExportDate(day) {
  if (day.iso && /^\d{4}-\d{2}-\d{2}$/.test(day.iso)) {
    return day.iso;
  }

  if (day.date) {
    const date = day.date instanceof Date ? day.date : new Date(day.date);
    if (!Number.isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const dayNum = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${dayNum}`;
    }
  }

  return day.dateLabel || "";
}

function minutesToUnits(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "";
  const hours = Math.round((total / 60) * 100) / 100;
  return hours.toFixed(8);
}

function buildTimesheetLines({ userName, periodDays, dayEntries }) {
  const lines = [EXPORT_HEADERS.join("\t")];
  const days = Array.isArray(periodDays) ? periodDays : [];
  const entries = Array.isArray(dayEntries) ? dayEntries : [];
  const { lastName, firstName } = splitEmployeeName(userName);

  days.forEach((day, index) => {
    if (isSunday(day)) return;

    const entry = entries[index] || {};
    lines.push(
      [
        lastName,
        firstName,
        PAYROLL_CATEGORY,
        formatExportDate(day),
        minutesToUnits(entry.workMinutes),
      ].join("\t")
    );
  });

  return lines;
}

function exportTimesheetFile({ exportDir, filename, lines }) {
  const dir = String(exportDir || "").trim();
  if (!dir) {
    throw new Error("Time Sheet Export path is not configured. Set it in Settings → File Settings.");
  }

  fs.mkdirSync(dir, { recursive: true });

  const safeName = filename.endsWith(".txt") ? filename : `${filename.replace(/\.xlsx$/i, "")}.txt`;
  const filePath = path.join(dir, safeName);
  const content = `${lines.join("\r\n")}\r\n`;

  fs.writeFileSync(filePath, content, "utf8");

  return filePath;
}

function buildTimesheetFilename(cycleKey) {
  const datePart = sanitizeFilenamePart(cycleKey || "date");
  return `Timesheet_${datePart}.txt`;
}

module.exports = {
  buildTimesheetLines,
  exportTimesheetFile,
  buildTimesheetFilename,
};
