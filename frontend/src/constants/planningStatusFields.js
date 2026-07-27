/** Shared Planning status fields — temporary Planning page + underconstruction Planning. */

export const PLANNING_STATUS_OPTIONS = ["Not Selected", "Not Required", "Required", "Completed"];
export const BUILDING_PERMIT_OPTIONS = ["Not Submitted", "Submitted", "Completed"];

export function normalizePlanningStatus(value) {
  const t = value != null ? String(value).trim() : "";
  if (PLANNING_STATUS_OPTIONS.includes(t)) return t;
  if (t === "N/A") return "Not Required";
  if (t === "Complete" || t === "Permit Complete") return "Completed";
  return "Not Selected";
}

export function normalizeBuildingPermit(value) {
  const t = value != null ? String(value).trim() : "";
  if (BUILDING_PERMIT_OPTIONS.includes(t)) return t;
  if (t === "Sent") return "Submitted";
  if (t === "Complete") return "Completed";
  return "Not Submitted";
}

export function showPlanningStampControls(status) {
  return status === "Required" || status === "Completed";
}
