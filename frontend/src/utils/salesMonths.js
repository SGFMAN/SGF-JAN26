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
    if (!project.year) return false;
    const projectYear = project.year.toString().trim();
    let matchesMonth = false;

    if (projectYear.includes("-")) {
      const parts = projectYear.split("-");
      if (parts.length >= 2) {
        const year = parts[0].trim();
        const month = parts[1].trim().padStart(2, "0");
        matchesMonth = year === selectedYear && month === monthNumber;
      }
    } else if (projectYear.includes("/")) {
      const parts = projectYear.split("/");
      if (parts.length === 3) {
        const month = parts[0].trim().padStart(2, "0");
        const year = parts[2].trim();
        matchesMonth = year === selectedYear && month === monthNumber;
      }
    }

    if (!matchesMonth) return false;

    if (!isCurrentPartialMonth) return true;

    const iso = normalizeProjectDateToISO(projectYear);
    if (!iso) return true;
    return iso >= monthStart && iso <= monthEndCap;
  });
}

function normalizeProjectDateToISO(yearValue) {
  const v = yearValue.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  if (v.includes("/")) {
    const parts = v.split("/").map((p) => p.trim());
    if (parts.length === 3 && /^\d{4}$/.test(parts[2])) {
      const day = parseInt(parts[0], 10) > 12 ? parts[0] : parts[1];
      const month = parseInt(parts[0], 10) > 12 ? parts[1] : parts[0];
      const dd = String(parseInt(day, 10)).padStart(2, "0");
      const mm = String(parseInt(month, 10)).padStart(2, "0");
      return `${parts[2]}-${mm}-${dd}`;
    }
  }
  return null;
}
