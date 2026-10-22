import { CLASSIFICATION_OPTIONS } from "./classifications";
import { isExcludedFromProjectLists } from "./projectStatus";
import { parseProjectCost } from "./projectsOverviewCompute";
import { filterProjectsByYear } from "./salesTotalsCompute";

export const BREAKDOWN_STATES = ["VIC", "QLD"];

export function emptySpecCounts() {
  return {
    total: 0,
    affordable: 0,
    superior: 0,
    unspecified: 0,
    totalValue: 0,
    affordableValue: 0,
    superiorValue: 0,
    unspecifiedValue: 0,
  };
}

export function combineSpecCounts(...cells) {
  const combined = emptySpecCounts();
  for (const cell of cells) {
    combined.total += cell?.total || 0;
    combined.affordable += cell?.affordable || 0;
    combined.superior += cell?.superior || 0;
    combined.unspecified += cell?.unspecified || 0;
    combined.totalValue += cell?.totalValue || 0;
    combined.affordableValue += cell?.affordableValue || 0;
    combined.superiorValue += cell?.superiorValue || 0;
    combined.unspecifiedValue += cell?.unspecifiedValue || 0;
  }
  return combined;
}

function stateCode(project) {
  const state = String(project?.state || "")
    .trim()
    .toUpperCase();
  if (state === "VIC" || state === "VICTORIA") return "VIC";
  if (state === "QLD" || state === "QUEENSLAND") return "QLD";
  return null;
}

function specBucket(project) {
  const specs = String(project?.specs || "")
    .trim()
    .toLowerCase();
  if (specs === "affordable" || specs === "panel") return "affordable";
  if (specs === "superior" || specs === "truss") return "superior";
  return "unspecified";
}

function addCount(cell, bucket, value) {
  cell.total += 1;
  cell[bucket] += 1;
  cell.totalValue += value;
  cell[`${bucket}Value`] += value;
}

/**
 * Units sold for a calendar year, split by state, classification, and specs.
 * Hotlist and Quote are excluded. Every classification is kept, including zeros.
 */
export function computeSalesBreakdowns(projects, year) {
  const byClassification = new Map(
    CLASSIFICATION_OPTIONS.map((label) => [label, { VIC: emptySpecCounts(), QLD: emptySpecCounts() }])
  );
  const extras = new Map();

  const yearProjects = filterProjectsByYear(projects || [], String(year)).filter(
    (project) => !isExcludedFromProjectLists(project?.status)
  );

  for (const project of yearProjects) {
    const state = stateCode(project);
    if (!state) continue;
    const bucket = specBucket(project);
    const value = parseProjectCost(project);
    const label = String(project.classification || "").trim();
    if (byClassification.has(label)) {
      addCount(byClassification.get(label)[state], bucket, value);
      continue;
    }
    const extraLabel = label || "Unclassified";
    if (!extras.has(extraLabel)) {
      extras.set(extraLabel, { VIC: emptySpecCounts(), QLD: emptySpecCounts() });
    }
    addCount(extras.get(extraLabel)[state], bucket, value);
  }

  const rows = CLASSIFICATION_OPTIONS.map((label) => ({
    label,
    ...byClassification.get(label),
  }));

  const extraRows = [...extras.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
    .map(([label, counts]) => ({ label, ...counts }));

  return { rows, extraRows };
}

export function sumBreakdownRows(rows) {
  const totals = { VIC: emptySpecCounts(), QLD: emptySpecCounts() };
  for (const row of rows) {
    for (const state of BREAKDOWN_STATES) {
      const cell = row[state];
      totals[state].total += cell.total;
      totals[state].affordable += cell.affordable;
      totals[state].superior += cell.superior;
      totals[state].unspecified += cell.unspecified;
      totals[state].totalValue += cell.totalValue;
      totals[state].affordableValue += cell.affordableValue;
      totals[state].superiorValue += cell.superiorValue;
      totals[state].unspecifiedValue += cell.unspecifiedValue;
    }
  }
  return totals;
}
