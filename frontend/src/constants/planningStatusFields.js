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
export const SEWER_CONNECTION_TYPE_OPTIONS = ["Not Selected", "Council Sewer", "Septic"];
export const SEPTIC_PERMIT_TYPE_OPTIONS = [
  "Not Selected",
  "New Septic",
  "Alteration",
];
/** @deprecated Use SEWER_CONNECTION_TYPE_OPTIONS */
export const SEWER_CONNECTION_SELECT_OPTIONS = SEWER_CONNECTION_TYPE_OPTIONS;

/** Energy / Footing (mandatory Incomplete / Complete). Building Permit uses its own options. */
export const MANDATORY_PLANNING_SELECT_OPTIONS = ["Incomplete", "Complete"];

export const BUILDING_PERMIT_STATUS_NOT_SUBMITTED = "Not Submitted";
export const BUILDING_PERMIT_STATUS_BAMS_PAID = "BAMS Paid";
export const BUILDING_PERMIT_STATUS_WAITING_VINCE = "Waiting Vince Assessment";
export const BUILDING_PERMIT_STATUS_PERMIT_ISSUED = "Permit Issued";

export const BUILDING_PERMIT_STATUS_OPTIONS = [
  BUILDING_PERMIT_STATUS_NOT_SUBMITTED,
  BUILDING_PERMIT_STATUS_BAMS_PAID,
  BUILDING_PERMIT_STATUS_WAITING_VINCE,
  BUILDING_PERMIT_STATUS_PERMIT_ISSUED,
];

/** @deprecated Use BUILDING_PERMIT_STATUS_OPTIONS */
export const BUILDING_PERMIT_OPTIONS = BUILDING_PERMIT_STATUS_OPTIONS;
export const SPECS_ADDED_OPTIONS = ["Not Completed", "Completed"];

export function normalizePlanningStatus(value) {
  const t = value != null ? String(value).trim() : "";
  if (PLANNING_REQUIREMENT_SELECT_OPTIONS.includes(t)) return t;
  if (t === "N/A") return "Not Required";
  if (t === "Required") return "Incomplete";
  if (t === "Completed" || t === "Complete" || t === "Permit Complete") return "Complete";
  // Legacy sewer PIC / Septic values (type is stored on planning_sewer_connection now)
  if (t === "PIC" || t === "Septic") return "Incomplete";
  if (t === "Completed:PIC" || t === "Completed:Septic") return "Complete";
  return "Not Selected";
}

function isYesFlag(value) {
  const t = value == null ? "" : String(value).trim().toLowerCase();
  return t === "yes" || t === "true" || t === "1";
}

export function normalizeSewerConnectionType(value) {
  const t = value != null ? String(value).trim() : "";
  if (t === "Council Sewer" || t === "PIC" || t === "Completed:PIC") return "Council Sewer";
  if (t === "Septic" || t === "Completed:Septic" || t === "Septic Approval") return "Septic";
  return "Not Selected";
}

export function normalizeSepticPermitType(value) {
  const t = value != null ? String(value).trim() : "";
  if (t === "New Septic" || t === "New Septic Permit") return "New Septic";
  if (t === "Alteration" || t === "Alteration Permit Received") return "Alteration";
  return "Not Selected";
}

export function isSewerPicChecked(project) {
  if (isYesFlag(project?.pic)) return true;
  return String(project?.planning_sewer_connection || "").trim() === "Completed:PIC";
}

export function isSepticPermitChecked(project) {
  return isYesFlag(project?.planning_sewer_septic_permit);
}

export const SEWER_STATUS_FILTER_OPTIONS = ["Complete", "Needs PIC", "Needs Septic Permit"];

/** Council Sewer → Needs PIC / Complete; Septic → Needs Septic Permit / Complete. */
export function getSewerConnectionStatusLabel(project) {
  const type = normalizeSewerConnectionType(
    project?.planning_sewer_connection ?? project?.planningSewerConnection
  );
  if (type === "Council Sewer") {
    return isSewerPicChecked(project) ? "Complete" : "Needs PIC";
  }
  if (type === "Septic") {
    return isSepticPermitChecked(project) ? "Complete" : "Needs Septic Permit";
  }
  return "Not Selected";
}

/** Overview RAG: Not Selected → red; PIC or Septic Permit checked → green; else orange. */
export function getSewerConnectionOverviewKind(project) {
  const type = normalizeSewerConnectionType(project?.planning_sewer_connection);
  if (type === "Not Selected") return "red";
  if (isSewerPicChecked(project) || isSepticPermitChecked(project)) return "green";
  return "orange";
}

/** Overview RAG: Not Selected → red; Not Required or Complete → green; else orange. */
export function getPlanningRequirementOverviewKind(value) {
  const status = normalizePlanningStatus(value);
  if (status === "Not Selected") return "red";
  if (status === "Not Required" || status === "Complete") return "green";
  return "orange";
}

/** Overview RAG: Incomplete → red; Complete → green. */
export function getMandatoryPlanningOverviewKind(value, receivedAtFallback) {
  return normalizeMandatoryPlanningStatus(value, receivedAtFallback) === "Complete"
    ? "green"
    : "red";
}

export function planningRequirementSelectValue(status) {
  return normalizePlanningStatus(status);
}

/** @deprecated Use planningRequirementSelectValue */
export function townPlanningSelectValue(status) {
  return planningRequirementSelectValue(status);
}

export function normalizeSewerConnection(value) {
  return normalizeSewerConnectionType(value);
}

export function sewerConnectionSelectValue(value) {
  return normalizeSewerConnectionType(value);
}

export function isSewerConnectionCompleted(projectOrValue) {
  if (projectOrValue && typeof projectOrValue === "object") {
    return getSewerConnectionOverviewKind(projectOrValue) === "green";
  }
  return false;
}

export function normalizeMandatoryPlanningStatus(value, receivedAtFallback) {
  const t = value != null ? String(value).trim() : "";
  if (t === "Complete" || t === "Completed") return "Complete";
  if (t === "Incomplete" || t === "Not Completed" || t === "Required") return "Incomplete";
  // Stamp fallback for older records
  if (receivedAtFallback != null && String(receivedAtFallback).trim() !== "") return "Complete";
  return "Incomplete";
}

export function normalizeBuildingPermitStatus(value, receivedAtFallback) {
  const t = value != null ? String(value).trim() : "";
  if (BUILDING_PERMIT_STATUS_OPTIONS.includes(t)) return t;
  if (t === "Complete" || t === "Completed") return BUILDING_PERMIT_STATUS_PERMIT_ISSUED;
  if (t === "Incomplete" || t === "Sent" || t === "Submitted") return BUILDING_PERMIT_STATUS_NOT_SUBMITTED;
  if (receivedAtFallback != null && String(receivedAtFallback).trim() !== "") {
    return BUILDING_PERMIT_STATUS_PERMIT_ISSUED;
  }
  return BUILDING_PERMIT_STATUS_NOT_SUBMITTED;
}

/** @deprecated Use normalizeBuildingPermitStatus */
export function normalizeBuildingPermit(value, receivedAtFallback) {
  return normalizeBuildingPermitStatus(value, receivedAtFallback);
}

export function isBuildingPermitIssued(projectOrStatus) {
  if (projectOrStatus && typeof projectOrStatus === "object") {
    return (
      normalizeBuildingPermitStatus(
        projectOrStatus.building_permit_status ?? projectOrStatus.buildingPermitStatus,
        projectOrStatus.planning_building_permit_received_at ??
          projectOrStatus.planningBuildingPermitReceivedAt
      ) === BUILDING_PERMIT_STATUS_PERMIT_ISSUED
    );
  }
  return normalizeBuildingPermitStatus(projectOrStatus) === BUILDING_PERMIT_STATUS_PERMIT_ISSUED;
}

/** Overview RAG: Not Submitted → red; Permit Issued → green; else orange. */
export function getBuildingPermitOverviewKind(project) {
  const status = normalizeBuildingPermitStatus(
    project?.building_permit_status ?? project?.buildingPermitStatus,
    project?.planning_building_permit_received_at ?? project?.planningBuildingPermitReceivedAt
  );
  if (status === BUILDING_PERMIT_STATUS_PERMIT_ISSUED) return "green";
  if (status === BUILDING_PERMIT_STATUS_NOT_SUBMITTED) return "red";
  return "orange";
}

export function buildingPermitFieldsForStatus(nextRaw, project) {
  const next = normalizeBuildingPermitStatus(nextRaw);
  const now = new Date().toISOString();
  if (next === BUILDING_PERMIT_STATUS_PERMIT_ISSUED) {
    return {
      building_permit_status: next,
      planning_building_permit_requested_at:
        project?.planning_building_permit_requested_at || now,
      planning_building_permit_received_at:
        project?.planning_building_permit_received_at || now,
    };
  }
  if (next === BUILDING_PERMIT_STATUS_NOT_SUBMITTED) {
    return {
      building_permit_status: next,
      planning_building_permit_requested_at: null,
      planning_building_permit_received_at: null,
    };
  }
  return {
    building_permit_status: next,
    planning_building_permit_requested_at: project?.planning_building_permit_requested_at || now,
    planning_building_permit_received_at: null,
  };
}

export function normalizeSpecsAdded(value) {
  const t = value != null ? String(value).trim() : "";
  return t === "Completed" ? "Completed" : "Not Completed";
}

export function showPlanningStampControls(status) {
  const n = normalizePlanningStatus(status);
  return n === "Incomplete" || n === "Complete";
}
