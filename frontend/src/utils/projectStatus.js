/**
 * Project Info → Status options (Hotlist is special and is not in this list).
 * The `on_hold` column is separate (blue sash + On Hold list); it is NOT a status.
 */

export const PRE_ENGAGEMENT_PHASE = "Pre-Engagement Phase";
export const DESIGN_PHASE = "Design Phase";
export const PERMIT_PHASE = "Permit Phase";
export const CONSTRUCTION_PHASE = "Construction Phase";

export const PROJECT_STATUS_OPTIONS = [
  PRE_ENGAGEMENT_PHASE,
  DESIGN_PHASE,
  PERMIT_PHASE,
  CONSTRUCTION_PHASE,
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

export function isPreEngagementPhaseStatus(status) {
  return normalizeStatus(status).toLowerCase() === "pre-engagement phase";
}

export function isPermitPhaseStatus(status) {
  return normalizeStatus(status).toLowerCase() === "permit phase";
}

/**
 * Pre-Engagement + Design + Permit — used by managers / pipeline lists.
 * Does NOT change the Design Phase page filter (keep using isDesignPhaseStatus there).
 */
export function isDesignPipelineStatus(status) {
  return (
    isPreEngagementPhaseStatus(status) ||
    isDesignPhaseStatus(status) ||
    isPermitPhaseStatus(status)
  );
}

/** Default status for newly created (non-hotlist) projects. */
export const DEFAULT_NEW_PROJECT_STATUS = PRE_ENGAGEMENT_PHASE;

/** on_hold checkbox / API flag (blue sash). */
export function isOnHoldFlag(project) {
  if (!project) return false;
  return project.on_hold === true || project.on_hold === "true";
}
