import {
  isCancelledStatus,
  isCompleteStatus,
  isConstructionPhaseStatus,
  isDesignPhaseStatus,
  isHotlistStatus,
  isOnHoldFlag,
  isPermitPhaseStatus,
  isPreEngagementPhaseStatus,
} from "./projectStatus";

/** Pipeline stages shown on Sales → Projects Overview. */
export const PROJECTS_OVERVIEW_STAGES = [
  { key: "preEngagement", label: "Pre-engagement Stage", match: isPreEngagementPhaseStatus },
  { key: "design", label: "Design Stage", match: isDesignPhaseStatus },
  { key: "permit", label: "Permit Stage", match: isPermitPhaseStatus },
  { key: "construction", label: "Construction Stage", match: isConstructionPhaseStatus },
];

function emptyStageCounts() {
  return {
    preEngagement: { total: 0, onHold: 0, value: 0 },
    design: { total: 0, onHold: 0, value: 0 },
    permit: { total: 0, onHold: 0, value: 0 },
    construction: { total: 0, onHold: 0, value: 0 },
  };
}

function isOverviewProject(project) {
  if (!project) return false;
  if (isHotlistStatus(project.status) || isCancelledStatus(project.status)) return false;
  if (isCompleteStatus(project.status)) return false;
  return (
    isPreEngagementPhaseStatus(project.status) ||
    isDesignPhaseStatus(project.status) ||
    isPermitPhaseStatus(project.status) ||
    isConstructionPhaseStatus(project.status)
  );
}

function projectStateCode(project) {
  return String(project?.state || "")
    .trim()
    .toUpperCase();
}

/** Parse project_cost to an integer dollar amount (same approach as Sales Totals). */
export function parseProjectCost(project) {
  if (!project?.project_cost) return 0;
  return parseInt(String(project.project_cost).replace(/[^0-9]/g, "") || "0", 10) || 0;
}

/**
 * Count active pipeline projects by stage for VIC and QLD.
 * On-hold is a flag within each stage (not a separate stage).
 * Value is the sum of project_cost for projects in that stage.
 */
export function computeProjectsOverview(projects) {
  const byState = {
    VIC: emptyStageCounts(),
    QLD: emptyStageCounts(),
  };

  for (const project of projects || []) {
    if (!isOverviewProject(project)) continue;
    const state = projectStateCode(project);
    if (state !== "VIC" && state !== "QLD") continue;

    const stage = PROJECTS_OVERVIEW_STAGES.find((s) => s.match(project.status));
    if (!stage) continue;

    byState[state][stage.key].total += 1;
    byState[state][stage.key].value += parseProjectCost(project);
    if (isOnHoldFlag(project)) {
      byState[state][stage.key].onHold += 1;
    }
  }

  const summarize = (counts) => {
    const stages = PROJECTS_OVERVIEW_STAGES.map(({ key, label }) => ({
      key,
      label,
      total: counts[key].total,
      onHold: counts[key].onHold,
      value: counts[key].value,
    }));
    const total = stages.reduce((sum, s) => sum + s.total, 0);
    const onHoldTotal = stages.reduce((sum, s) => sum + s.onHold, 0);
    const valueTotal = stages.reduce((sum, s) => sum + s.value, 0);
    return { stages, total, onHoldTotal, valueTotal };
  };

  return {
    VIC: summarize(byState.VIC),
    QLD: summarize(byState.QLD),
  };
}

/** Format: `29` or `29 (7 on hold)`. */
export function formatStageCount(total, onHold) {
  const n = Number(total) || 0;
  const hold = Number(onHold) || 0;
  if (hold > 0) return `${n} (${hold} on hold)`;
  return String(n);
}

export function formatOverviewCurrency(amount) {
  const n = Number(amount) || 0;
  if (!n) return "$0";
  return `$${n.toLocaleString()}`;
}
