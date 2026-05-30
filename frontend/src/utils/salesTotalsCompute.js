export const SALES_TOTALS_STREAMS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

export const SALES_TOTALS_GREEN_STREAMS = [
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

const MS_PER_DAY = 86400000;

import { SALES_MONTHS } from "./salesMonths";

export function normalizeProjectYearToISO(yearValue) {
  if (!yearValue) return null;
  const v = yearValue.toString().trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  if (v.includes("/")) {
    const parts = v.split("/").map((p) => p.trim());
    if (parts.length === 3) {
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
  }
  return null;
}

export function filterProjectsByYear(projects, selectedYear) {
  return projects.filter((project) => {
    if (!project.year) return false;
    const projectYear = project.year.toString().trim();
    if (projectYear.includes("-")) {
      const parts = projectYear.split("-");
      if (parts.length >= 1) return parts[0].trim() === selectedYear;
    } else if (projectYear.includes("/")) {
      const parts = projectYear.split("/");
      if (parts.length === 3) return parts[2].trim() === selectedYear;
    } else if (/^\d{4}$/.test(projectYear)) {
      return projectYear === selectedYear;
    }
    return false;
  });
}

export function filterProjectsByMonth(yearFilteredProjects, selectedYear, monthIndex0, todayISO) {
  const yearNum = parseInt(String(selectedYear).trim(), 10);
  if (!Number.isFinite(yearNum) || monthIndex0 < 0 || monthIndex0 > 11) return [];

  const mm = String(monthIndex0 + 1).padStart(2, "0");
  const monthStart = `${selectedYear}-${mm}-01`;
  const lastDay = new Date(yearNum, monthIndex0 + 1, 0).getDate();
  const monthEndFull = `${selectedYear}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const now = new Date();
  const isCurrentMonth = yearNum === now.getFullYear() && monthIndex0 === now.getMonth();
  const monthEnd = isCurrentMonth && todayISO ? todayISO : monthEndFull;

  return yearFilteredProjects.filter((project) => {
    const iso = normalizeProjectYearToISO(project.year);
    if (!iso) return false;
    return iso >= monthStart && iso <= monthEnd;
  });
}

/** Months to include in PDF for selectedYear (Jan..current month for current year; all 12 for past years). */
export function getMonthsForPdfExport(selectedYear, referenceDate = new Date()) {
  const yearNum = parseInt(String(selectedYear).trim(), 10);
  if (!Number.isFinite(yearNum)) return [];

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  if (yearNum > refYear) return [];

  const monthCount = yearNum < refYear ? 12 : refMonth + 1;

  return Array.from({ length: monthCount }, (_, i) => ({
    monthIndex: i,
    title:
      yearNum === refYear && i === refMonth
        ? `${SALES_MONTHS[i]} SALES (partial)`
        : `${SALES_MONTHS[i]} SALES`,
    isPartial: yearNum === refYear && i === refMonth,
  }));
}

export function getCalendarYearProgressMeta(yearStr, referenceDate = new Date()) {
  const yearNum = parseInt(String(yearStr).trim(), 10);
  if (!Number.isFinite(yearNum)) return null;

  const now = referenceDate;
  const nowY = now.getFullYear();
  const jan1 = new Date(yearNum, 0, 1);
  jan1.setHours(0, 0, 0, 0);
  const jan1NextYear = new Date(yearNum + 1, 0, 1);
  jan1NextYear.setHours(0, 0, 0, 0);
  const daysInYear = Math.round((jan1NextYear.getTime() - jan1.getTime()) / MS_PER_DAY);

  if (yearNum < nowY) {
    return {
      daysInYear,
      daysElapsed: daysInYear,
      fraction: 1,
      percentThrough: 100,
      mode: "complete",
    };
  }
  if (yearNum > nowY) {
    return {
      daysInYear,
      daysElapsed: 0,
      fraction: 0,
      percentThrough: 0,
      mode: "future",
    };
  }

  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceJan1 = Math.floor((today0.getTime() - jan1.getTime()) / MS_PER_DAY);
  const daysElapsed = Math.min(daysInYear, Math.max(1, daysSinceJan1 + 1));
  const fraction = daysElapsed / daysInYear;
  const percentThrough = Math.min(100, Math.round(fraction * 1000) / 10);
  return {
    daysInYear,
    daysElapsed,
    fraction,
    percentThrough,
    mode: "ytd",
  };
}

export function getMonthProgressMeta(yearStr, monthIndex0, referenceDate = new Date()) {
  const yearNum = parseInt(String(yearStr).trim(), 10);
  if (!Number.isFinite(yearNum) || monthIndex0 < 0 || monthIndex0 > 11) return null;

  const now = referenceDate;
  const daysInMonth = new Date(yearNum, monthIndex0 + 1, 0).getDate();

  if (yearNum > now.getFullYear() || (yearNum === now.getFullYear() && monthIndex0 > now.getMonth())) {
    return {
      daysInMonth,
      daysElapsed: 0,
      fraction: 0,
      percentThrough: 0,
      mode: "future",
    };
  }

  if (yearNum < now.getFullYear() || monthIndex0 < now.getMonth()) {
    return {
      daysInMonth,
      daysElapsed: daysInMonth,
      fraction: 1,
      percentThrough: 100,
      mode: "complete",
    };
  }

  const daysElapsed = Math.max(1, now.getDate());
  const fraction = daysElapsed / daysInMonth;
  const percentThrough = Math.min(100, Math.round(fraction * 1000) / 10);
  return {
    daysInMonth,
    daysElapsed,
    fraction,
    percentThrough,
    mode: "partial",
  };
}

function streamMatches(projectStream, streamNormalized) {
  if (streamNormalized === "Pumped On Property") {
    return (
      projectStream === "Pumped On Property" ||
      projectStream === "Pumped on Property" ||
      projectStream.toLowerCase() === "pumped on property"
    );
  }
  if (streamNormalized === "Create Cash Flow") {
    return (
      projectStream === "Create Cash Flow" ||
      projectStream === "Creat Cash Flow" ||
      projectStream.toLowerCase() === "create cash flow"
    );
  }
  if (projectStream === streamNormalized) return true;
  return projectStream.toLowerCase() === streamNormalized.toLowerCase();
}

function projectedEndOfYear(total, progressMeta) {
  if (!progressMeta || progressMeta.mode === "future") return null;
  const fraction = Math.max(progressMeta.fraction, 1 / (progressMeta.daysInYear || progressMeta.daysInMonth || 1));
  const n = Number(total) || 0;
  return Math.round(n / fraction);
}

export function computeSalesTotalsData(yearFilteredProjects, progressMeta) {
  const streamTotals = {};

  SALES_TOTALS_STREAMS.forEach((stream) => {
    const streamProjects = yearFilteredProjects.filter((project) => {
      if (project.classification === "Home Office / Studio") return false;
      const projectStream = (project.stream || "").trim();
      return streamMatches(projectStream, stream.trim());
    });

    const salesCount = streamProjects.length;
    const totalCost = streamProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
        return sum + cost;
      }
      return sum;
    }, 0);

    streamTotals[stream] = { salesCount, totalCost };
  });

  let greenSales = 0;
  let greenCost = 0;
  SALES_TOTALS_GREEN_STREAMS.forEach((stream) => {
    const t = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
    greenSales += t.salesCount;
    greenCost += t.totalCost;
  });
  const greenStreamsTotal = { salesCount: greenSales, totalCost: greenCost };

  const greenStreamProjects = yearFilteredProjects.filter((project) => {
    if (project.classification === "Home Office / Studio") return false;
    const projectStream = (project.stream || "").trim();
    return SALES_TOTALS_GREEN_STREAMS.some((stream) => streamMatches(projectStream, stream.trim()));
  });

  const greenStreamsStateBreakdown = {
    vic: greenStreamProjects.filter((p) => {
      const state = (p.state || "").trim().toUpperCase();
      return state === "VIC" || state === "VICTORIA";
    }).length,
    qld: greenStreamProjects.filter((p) => {
      const state = (p.state || "").trim().toUpperCase();
      return state === "QLD" || state === "QUEENSLAND";
    }).length,
  };

  const homeOfficeProjects = yearFilteredProjects.filter(
    (p) => (p.classification || "").trim() === "Home Office / Studio"
  );
  const homeOfficeStudioTotal = {
    salesCount: homeOfficeProjects.length,
    totalCost: homeOfficeProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        return sum + parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
      }
      return sum;
    }, 0),
  };

  const vicProjects = yearFilteredProjects.filter((project) => {
    if (project.classification === "Home Office / Studio") return false;
    const state = (project.state || "").trim().toUpperCase();
    return state === "VIC" || state === "VICTORIA";
  });
  const qldProjects = yearFilteredProjects.filter((project) => {
    if (project.classification === "Home Office / Studio") return false;
    const state = (project.state || "").trim().toUpperCase();
    return state === "QLD" || state === "QUEENSLAND";
  });

  const vicSales = vicProjects.length;
  const vicCost = vicProjects.reduce((sum, project) => {
    if (project?.project_cost) {
      return sum + parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
    }
    return sum;
  }, 0);
  const qldSales = qldProjects.length;
  const qldCost = qldProjects.reduce((sum, project) => {
    if (project?.project_cost) {
      return sum + parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
    }
    return sum;
  }, 0);

  const stateTotals = {
    VIC: {
      salesCount: vicSales,
      totalCost: vicCost,
      averagePrice: vicSales > 0 ? Math.round(vicCost / vicSales) : 0,
    },
    QLD: {
      salesCount: qldSales,
      totalCost: qldCost,
      averagePrice: qldSales > 0 ? Math.round(qldCost / qldSales) : 0,
    },
  };

  const grandTotal = {
    totalSales: Object.values(streamTotals).reduce((sum, s) => sum + s.salesCount, 0),
    totalCost: Object.values(streamTotals).reduce((sum, s) => sum + s.totalCost, 0),
  };

  const progressFraction = progressMeta
    ? Math.max(progressMeta.fraction, 1 / (progressMeta.daysInYear || progressMeta.daysInMonth || 1))
    : 0;

  function projectedForCost(totalCost) {
    if (!progressMeta || progressMeta.mode === "future" || !(progressFraction > 0)) return null;
    return Math.round((Number(totalCost) || 0) / progressFraction);
  }

  function projectedForCount(count) {
    if (!progressMeta || progressMeta.mode === "future" || !(progressFraction > 0)) return null;
    return Math.round((Number(count) || 0) / progressFraction);
  }

  return {
    streamTotals,
    greenStreamsTotal,
    greenStreamsStateBreakdown,
    homeOfficeStudioTotal,
    stateTotals,
    grandTotal,
    calendarYearMeta: progressMeta,
    projectedSgfVicValue: projectedForCost((streamTotals["SGF - VIC"] || { totalCost: 0 }).totalCost),
    projectedSgfQldValue: projectedForCost((streamTotals["SGF - QLD"] || { totalCost: 0 }).totalCost),
    projectedGreenStreamsValue: projectedForCost(greenStreamsTotal.totalCost),
    projectedVicStateValue: projectedForCost(stateTotals.VIC.totalCost),
    projectedQldStateValue: projectedForCost(stateTotals.QLD.totalCost),
    projectedYearEndValue: projectedForCost(grandTotal.totalCost),
    projectedYearEndSales: projectedForCount(grandTotal.totalSales),
  };
}

export function formatSalesTotalsCurrency(amount) {
  if (!amount || amount === 0) return "$0";
  return `$${amount.toLocaleString()}`;
}

export function formatStreamName(stream) {
  const streamUpper = stream.toUpperCase();
  switch (stream) {
    case "SGF - VIC":
      return { line1: "SGF - VIC", line2: " " };
    case "SGF - QLD":
      return { line1: "SGF - QLD", line2: " " };
    case "Dual Dwelling":
      return { line1: "DUAL", line2: "DWELLING" };
    case "ATA":
      return { line1: "ATA", line2: " " };
    case "Pumped On Property":
      return { line1: "PUMPED ON", line2: "PROPERTY" };
    case "Henderson":
      return { line1: "HENDERSON", line2: " " };
    case "Create Cash Flow":
      return { line1: "CREATE CASH", line2: "FLOW" };
    case "Fresh Start Advisory":
      return { line1: "FRESH START", line2: "ADVISORY" };
    default: {
      const parts = streamUpper.split(" ");
      if (parts.length >= 2) {
        const mid = Math.ceil(parts.length / 2);
        return { line1: parts.slice(0, mid).join(" "), line2: parts.slice(mid).join(" ") };
      }
      return { line1: streamUpper, line2: " " };
    }
  }
}
