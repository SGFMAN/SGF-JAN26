/** Shared Planning status fields — temporary Planning page + underconstruction Planning. */

/** Town Planning / BAL / Sewer Connection */
export const PLANNING_REQUIREMENT_SELECT_OPTIONS = [
  "Not Selected",
  "Not Required",
  "Incomplete",
  "Complete",
];
/** @deprecated Use PLANNING_REQUIREMENT_SELECT_OPTIONS */
export const PLANNING_STATUS_OPTIONS = PLANNING_REQUIREMENT_SELECT_OPTIONS;
/** @deprecated Use PLANNING_REQUIREMENT_SELECT_OPTIONS */
export const TOWN_PLANNING_SELECT_OPTIONS = PLANNING_REQUIREMENT_SELECT_OPTIONS;
/** @deprecated Use PLANNING_REQUIREMENT_SELECT_OPTIONS */
export const SEWER_CONNECTION_SELECT_OPTIONS = PLANNING_REQUIREMENT_SELECT_OPTIONS;

/** Energy / Footing / Building Permit (mandatory) */
export const MANDATORY_PLANNING_SELECT_OPTIONS = ["Incomplete", "Complete"];

export const BUILDING_PERMIT_OPTIONS = ["Not Submitted", "Submitted", "Completed"];
export const SPECS_ADDED_OPTIONS = ["Not Completed", "Completed"];

export function normalizePlanningStatus(value) {
  const t = value != null ? String(value).trim() : "";
  if (PLANNING_REQUIREMENT_SELECT_OPTIONS.includes(t)) return t;
  if (t === "N/A") return "Not Required";
  if (t === "Required") return "Incomplete";
  if (t === "Completed" || t === "Complete" || t === "Permit Complete") return "Complete";
  // Legacy sewer PIC / Septic values
  if (t === "PIC" || t === "Septic") return "Incomplete";
  if (t === "Completed:PIC" || t === "Completed:Septic") return "Complete";
  return "Not Selected";
}

export function planningRequirementSelectValue(status) {
  return normalizePlanningStatus(status);
}

/** @deprecated Use planningRequirementSelectValue */
export function townPlanningSelectValue(status) {
  return planningRequirementSelectValue(status);
}

export function normalizeSewerConnection(value) {
  return normalizePlanningStatus(value);
}

export function sewerConnectionSelectValue(value) {
  return normalizePlanningStatus(value);
}

export function isSewerConnectionCompleted(value) {
  return normalizePlanningStatus(value) === "Complete";
}

export function normalizeMandatoryPlanningStatus(value, receivedAtFallback) {
  const t = value != null ? String(value).trim() : "";
  if (t === "Complete" || t === "Completed") return "Complete";
  if (t === "Incomplete" || t === "Not Completed" || t === "Required") return "Incomplete";
  // Stamp fallback for older records
  if (receivedAtFallback != null && String(receivedAtFallback).trim() !== "") return "Complete";
  return "Incomplete";
}

export function normalizeBuildingPermit(value) {
  const t = value != null ? String(value).trim() : "";
  if (BUILDING_PERMIT_OPTIONS.includes(t)) return t;
  if (t === "Sent") return "Submitted";
  if (t === "Complete") return "Completed";
  return "Not Submitted";
}

export function normalizeSpecsAdded(value) {
  const t = value != null ? String(value).trim() : "";
  return t === "Completed" ? "Completed" : "Not Completed";
}

export function showPlanningStampControls(status) {
  const n = normalizePlanningStatus(status);
  return n === "Incomplete" || n === "Complete";
}
