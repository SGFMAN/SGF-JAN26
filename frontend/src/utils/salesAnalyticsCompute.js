import {
  filterProjectsByPeriod,
  getPeriodMonthSlots,
  getPreviousPeriodKey,
  projectMatchesMonthSlot,
} from "./salesTotalsCompute";
import {
  FALLBACK_STREAMS,
  SGF_QLD_STREAM,
  SGF_VIC_STREAM,
  greenSalesStreams,
  isGreenCatalogStream,
  projectMatchesStream,
} from "./streamsCatalog";

function catalog(streams) {
  return Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
}

function sumProjectCosts(projectList) {
  return projectList.reduce((sum, project) => {
    if (project?.project_cost) {
      const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
      return sum + cost;
    }
    return sum;
  }, 0);
}

/** Exclude Home Office / Studio from analytics totals. */
export function filterAnalyticsProjects(projects) {
  return projects.filter((project) => project.classification !== "Home Office / Studio");
}

export function filterAnalyticsProjectsByPeriod(projects, selectedYear, yearView) {
  return filterAnalyticsProjects(filterProjectsByPeriod(projects, selectedYear, yearView));
}

function aggregateMonthProjects(monthProjects, streams) {
  const cat = catalog(streams);
  const greenStreamProjects = monthProjects.filter((project) =>
    isGreenCatalogStream(project.stream || "", cat)
  );

  const vicProjects = monthProjects.filter((project) => {
    if (isGreenCatalogStream(project.stream || "", cat)) return false;
    const state = (project.state || "").trim().toUpperCase();
    return state === "VIC" || state === "VICTORIA";
  });

  const qldProjects = monthProjects.filter((project) => {
    if (isGreenCatalogStream(project.stream || "", cat)) return false;
    const state = (project.state || "").trim().toUpperCase();
    return state === "QLD" || state === "QUEENSLAND";
  });

  const vicSalesCount = vicProjects.length;
  const vicTotalValue = sumProjectCosts(vicProjects);
  const qldSalesCount = qldProjects.length;
  const qldTotalValue = sumProjectCosts(qldProjects);
  const greenStreamSalesCount = greenStreamProjects.length;
  const greenStreamTotalValue = sumProjectCosts(greenStreamProjects);

  return {
    vicSalesCount,
    vicTotalValue,
    qldSalesCount,
    qldTotalValue,
    greenStreamSalesCount,
    greenStreamTotalValue,
    totalSalesCount: vicSalesCount + qldSalesCount + greenStreamSalesCount,
    totalValue: vicTotalValue + qldTotalValue + greenStreamTotalValue,
  };
}

/** Twelve monthly rows for bar/rates charts (calendar Jan–Dec or financial Jul–Jun). */
export function computeMonthlySalesBreakdown(projects, selectedYear, yearView, streams) {
  const slots = getPeriodMonthSlots(selectedYear, yearView);
  return slots.map((slot) => ({
    name: slot.name,
    ...aggregateMonthProjects(
      projects.filter((p) => projectMatchesMonthSlot(p, slot)),
      streams
    ),
  }));
}

export function computePreviousPeriodMonthlyBreakdown(projects, selectedYear, yearView, streams) {
  const previousKey = getPreviousPeriodKey(selectedYear, yearView);
  const prevProjects = filterAnalyticsProjectsByPeriod(projects, previousKey, yearView);
  return computeMonthlySalesBreakdown(prevProjects, previousKey, yearView, streams);
}

/** Pie chart value totals for a filtered project list. */
export function computePieValueBreakdown(projects, streams) {
  const cat = catalog(streams);
  const vicProjects = projects.filter((p) =>
    projectMatchesStream(p.stream || "", SGF_VIC_STREAM, cat)
  );
  const qldProjects = projects.filter((p) =>
    projectMatchesStream(p.stream || "", SGF_QLD_STREAM, cat)
  );

  const vicTotal = sumProjectCosts(vicProjects);
  const qldTotal = sumProjectCosts(qldProjects);

  let greenTotal = 0;
  greenSalesStreams(cat).forEach((stream) => {
    const streamProjects = projects.filter((project) =>
      projectMatchesStream(project.stream || "", stream, cat)
    );
    greenTotal += sumProjectCosts(streamProjects);
  });

  const total = vicTotal + qldTotal + greenTotal;
  return { vic: vicTotal, qld: qldTotal, green: greenTotal, total };
}

/**
 * Share of a chart month that counts toward the average.
 * Past periods count every month in full. In the current period, finished months
 * count as 1, the month in progress counts as days elapsed ÷ days in that month
 * (15 March is 15/31), and months that have not started count as 0.
 */
export function periodMonthElapsedFraction(slot, periodIsCurrent, referenceDate = new Date()) {
  if (!periodIsCurrent) return 1;
  const slotYear = parseInt(String(slot?.calendarYear), 10);
  const slotMonth = slot?.monthIndex;
  if (!Number.isFinite(slotYear) || !Number.isFinite(slotMonth)) return 0;
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  if (slotYear < year || (slotYear === year && slotMonth < month)) return 1;
  if (slotYear === year && slotMonth === month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    if (daysInMonth <= 0) return 0;
    return referenceDate.getDate() / daysInMonth;
  }
  return 0;
}

/**
 * Average jobs per month across months that have started.
 * Finished months count in full: 12, 13 and 5 → (12 + 13 + 5) / 3 = 10.
 * A month in progress counts only the elapsed share of its sales.
 * Halfway through March, 5 sales count as 2.5: (12 + 13 + 2.5) / 3.
 */
export function averageJobsPerElapsedMonth(counts, slots, periodIsCurrent, referenceDate = new Date()) {
  let sales = 0;
  let months = 0;
  const n = Math.min(Array.isArray(counts) ? counts.length : 0, Array.isArray(slots) ? slots.length : 0);
  for (let i = 0; i < n; i++) {
    const weight = periodMonthElapsedFraction(slots[i], periodIsCurrent, referenceDate);
    if (weight <= 0) continue;
    sales += (Number(counts[i]) || 0) * weight;
    months += 1;
  }
  if (months <= 0) return null;
  return { average: sales / months, sales, months };
}
