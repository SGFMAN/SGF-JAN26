/**
 * Project Info → Status: exactly these four values.
 * The `on_hold` column is separate (blue sash + On Hold list); it is NOT a status.
 */

export const PROJECT_STATUS_OPTIONS = [
  "Design Phase",
  "Construction Phase",
  "Cancelled",
  "Complete",
];

export function normalizeStatus(status) {
  return status == null ? "" : String(status).trim();
}

export function isHotlistStatus(status) {
  return normalizeStatus(status).toLowerCase() === "hotlist";
}

export function isCancelledStatus(status) {
  return normalizeStatus(status).toLowerCase() === "cancelled";
}

export function isCompleteStatus(status) {
  const s = normalizeStatus(status).toLowerCase();
  return s === "complete" || s === "completed";
}

export function isConstructionPhaseStatus(status) {
  const s = normalizeStatus(status).toLowerCase();
  return s === "construction phase" || s === "in construction";
}

/** True only when `project.status` is Design Phase. */
export function isDesignPhaseStatus(status) {
  return normalizeStatus(status).toLowerCase() === "design phase";
}

/** on_hold checkbox / API flag (blue sash). */
export function isOnHoldFlag(project) {
  if (!project) return false;
  return project.on_hold === true || project.on_hold === "true";
}
