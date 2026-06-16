import {
  filterProjectsByPeriod,
  getPeriodMonthSlots,
  getPreviousPeriodKey,
  projectMatchesMonthSlot,
} from "./salesTotalsCompute";

const GREEN_STREAMS = [
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

function isGreenStream(project) {
  const projectStream = (project.stream || "").trim();
  return GREEN_STREAMS.some((stream) => {
    const streamNormalized = stream.trim();
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
  });
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

function aggregateMonthProjects(monthProjects) {
  const greenStreamProjects = monthProjects.filter(isGreenStream);

  const vicProjects = monthProjects.filter((project) => {
    if (isGreenStream(project)) return false;
    const state = (project.state || "").trim().toUpperCase();
    return state === "VIC" || state === "VICTORIA";
  });

  const qldProjects = monthProjects.filter((project) => {
    if (isGreenStream(project)) return false;
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
export function computeMonthlySalesBreakdown(projects, selectedYear, yearView) {
  const slots = getPeriodMonthSlots(selectedYear, yearView);
  return slots.map((slot) => ({
    name: slot.name,
    ...aggregateMonthProjects(projects.filter((p) => projectMatchesMonthSlot(p, slot))),
  }));
}

export function computePreviousPeriodMonthlyBreakdown(projects, selectedYear, yearView) {
  const previousKey = getPreviousPeriodKey(selectedYear, yearView);
  const prevProjects = filterAnalyticsProjectsByPeriod(projects, previousKey, yearView);
  return computeMonthlySalesBreakdown(prevProjects, previousKey, yearView);
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

/** Pie chart value totals for a filtered project list. */
export function computePieValueBreakdown(projects) {
  const vicProjects = projects.filter((p) => (p.stream || "").trim() === "SGF - VIC");
  const qldProjects = projects.filter((p) => (p.stream || "").trim() === "SGF - QLD");

  const vicTotal = sumProjectCosts(vicProjects);
  const qldTotal = sumProjectCosts(qldProjects);

  let greenTotal = 0;
  GREEN_STREAMS.forEach((stream) => {
    const streamProjects = projects.filter((project) => {
      const projectStream = (project.stream || "").trim();
      return streamMatches(projectStream, stream.trim());
    });
    greenTotal += sumProjectCosts(streamProjects);
  });

  const total = vicTotal + qldTotal + greenTotal;
  return { vic: vicTotal, qld: qldTotal, green: greenTotal, total };
}
