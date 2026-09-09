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
