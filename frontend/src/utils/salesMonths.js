export const SALES_MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function melbourneCalendarDateFromDate(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function slashDateToISO(yearValue) {
  const parts = yearValue.split("/").map((p) => p.trim());
  if (parts.length !== 3) return null;
  const part1 = parts[0];
  const part2 = parts[1];
  const part3 = parts[2];
  if (!/^\d{4}$/.test(part3)) return null;
  const day = parseInt(part1, 10) > 12 ? part1 : part2;
  const month = parseInt(part1, 10) > 12 ? part2 : part1;
  const dd = String(parseInt(day, 10)).padStart(2, "0");
  const mm = String(parseInt(month, 10)).padStart(2, "0");
  return `${part3}-${mm}-${dd}`;
}

/** Calendar start date for month lists. Year-only values have no month and return null. */
export function parseProjectStartDateISO(yearValue) {
  if (!yearValue) return null;
  const v = yearValue.toString().trim();
  if (!v || /^\d{4}$/.test(v)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const isoPrefix = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix && (v.includes("T") || /\d{4}-\d{2}-\d{2}\s+\d/.test(v))) {
    const iso = v.includes("T") ? v : v.replace(" ", "T");
    const parsed = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
    if (!Number.isNaN(parsed.getTime())) return melbourneCalendarDateFromDate(parsed);
    return isoPrefix[1];
  }
  if (isoPrefix) return isoPrefix[1];
  if (v.includes("/")) return slashDateToISO(v);
  return null;
}

/** Filter projects for a Sales month list (same rules as Sales page, optional partial month cap). */
export function filterProjectsForSalesMonth(projects, selectedYear, monthIndex0, todayISO = null) {
  const monthNumber = String(monthIndex0 + 1).padStart(2, "0");

  const now = new Date();
  const yearNum = parseInt(String(selectedYear).trim(), 10);
  const isCurrentPartialMonth =
    todayISO &&
    Number.isFinite(yearNum) &&
    yearNum === now.getFullYear() &&
    monthIndex0 === now.getMonth();

  const monthStart = `${selectedYear}-${monthNumber}-01`;
  const lastDay = new Date(yearNum, monthIndex0 + 1, 0).getDate();
  const monthEndFull = `${selectedYear}-${monthNumber}-${String(lastDay).padStart(2, "0")}`;
  const monthEndCap = isCurrentPartialMonth ? todayISO : monthEndFull;

  return projects.filter((project) => {
    const iso = parseProjectStartDateISO(project.year);
    if (!iso) return false;
    if (iso.slice(0, 4) !== String(selectedYear) || iso.slice(5, 7) !== monthNumber) return false;
    if (!isCurrentPartialMonth) return true;
    return iso >= monthStart && iso <= monthEndCap;
  });
}
