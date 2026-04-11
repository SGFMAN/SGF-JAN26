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
  return normalizeStatus(status) === "Hotlist";
}

export function isCancelledStatus(status) {
  return normalizeStatus(status) === "Cancelled";
}

export function isCompleteStatus(status) {
  return normalizeStatus(status) === "Complete";
}

export function isConstructionPhaseStatus(status) {
  return normalizeStatus(status) === "Construction Phase";
}

/** True only when `project.status` is exactly Design Phase. */
export function isDesignPhaseStatus(status) {
  return normalizeStatus(status) === "Design Phase";
}

/** on_hold checkbox / API flag (blue sash). */
export function isOnHoldFlag(project) {
  if (!project) return false;
  return project.on_hold === true || project.on_hold === "true";
}
