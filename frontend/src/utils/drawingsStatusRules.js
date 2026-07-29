/** Drawings status + per-revision approval flags (see product rules). */

export const DRAWINGS_STATUS = {
  NOT_ASSIGNED: "Not Assigned",
  CONCEPT_STAGE: "Concept Stage",
  WORKING_STAGE: "Working Drawing Stage",
  COMPLETE: "Drawings Complete",
};

export const DRAWINGS_HOLDER_DESIGN_TEAM = "design team";

const SHEET_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

/** Display dd-Mmm from ISO YYYY-MM-DD (approval banners / planning sheet). */
export function formatDrawingApprovalDateLabel(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const day = parseInt(s.slice(8, 10), 10);
    const month = parseInt(s.slice(5, 7), 10) - 1;
    if (!Number.isFinite(day) || month < 0 || month > 11) return "";
    return `${String(day).padStart(2, "0")}-${SHEET_MONTHS[month]}`;
  }
  return s;
}

export function getDrawingsHolderResetOnApproval() {
  return {
    drawings_holder: DRAWINGS_HOLDER_DESIGN_TEAM,
    drawings_holder_date: todayIsoDate(),
  };
}

export function parseDrawingsHistory(historyValue) {
  if (!historyValue) return [];
  try {
    const history =
      typeof historyValue === "string" ? JSON.parse(historyValue) : historyValue;
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

export function getLatestDrawingEntry(drawingsHistory) {
  if (!Array.isArray(drawingsHistory) || drawingsHistory.length === 0) return null;
  return drawingsHistory[drawingsHistory.length - 1];
}

/** Latest revision only — stale flags on older revisions are ignored. */
export function isLatestRevisionWorkingDrawingsApproved(projectOrHistory) {
  const history = Array.isArray(projectOrHistory)
    ? projectOrHistory
    : parseDrawingsHistory(projectOrHistory?.drawings_history);
  const latest = getLatestDrawingEntry(history);
  return latest?.workingDrawingsApproved === true;
}

export function isLatestRevisionConceptApproved(projectOrHistory) {
  const history = Array.isArray(projectOrHistory)
    ? projectOrHistory
    : parseDrawingsHistory(projectOrHistory?.drawings_history);
  const latest = getLatestDrawingEntry(history);
  return latest?.conceptApproved === true;
}

function updateLatestRevisionFlags(drawingsHistory, flags) {
  if (!Array.isArray(drawingsHistory) || drawingsHistory.length === 0) {
    return drawingsHistory;
  }
  const updated = [...drawingsHistory];
  const lastIndex = updated.length - 1;
  updated[lastIndex] = { ...updated[lastIndex], ...flags };
  return updated;
}

/** Upload modal: concept drawings selected. */
export function applyConceptUploadRules(drawingsHistory) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: false,
      workingDrawingsApproved: false,
      conceptApprovedDate: null,
      workingDrawingsApprovedDate: null,
      uploadKind: "concept",
    }),
    drawingsStatus: DRAWINGS_STATUS.CONCEPT_STAGE,
    drawings_concept_approved_date: null,
    drawings_working_approved_date: null,
  };
}

/** Upload modal: working drawings selected. */
export function applyWorkingUploadRules(drawingsHistory) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: false,
      workingDrawingsApproved: false,
      conceptApprovedDate: null,
      workingDrawingsApprovedDate: null,
      uploadKind: "working",
    }),
    drawingsStatus: DRAWINGS_STATUS.WORKING_STAGE,
    drawings_concept_approved_date: null,
    drawings_working_approved_date: null,
  };
}

/**
 * Upload modal: For Certifier selected.
 * Does not change drawings status — only records the upload kind on the revision.
 */
export function applyCertifierUploadRules(drawingsHistory, currentStatus) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      uploadKind: "certifier",
    }),
    drawingsStatus: currentStatus || null,
  };
}

export function applyDrawingUploadKindRules(drawingsHistory, uploadKind, currentStatus) {
  if (uploadKind === "working") {
    return applyWorkingUploadRules(drawingsHistory);
  }
  if (uploadKind === "certifier") {
    return applyCertifierUploadRules(drawingsHistory, currentStatus);
  }
  return applyConceptUploadRules(drawingsHistory);
}

/** Approve Concept button / client portal. */
export function applyConceptApprovalRules(drawingsHistory) {
  const today = todayIsoDate();
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: true,
      workingDrawingsApproved: false,
      conceptApprovedDate: today,
      workingDrawingsApprovedDate: null,
    }),
    drawingsStatus: DRAWINGS_STATUS.WORKING_STAGE,
    drawings_concept_approved_date: today,
    drawings_working_approved_date: null,
    ...getDrawingsHolderResetOnApproval(),
  };
}

/**
 * Approve Working Drawings button.
 * Updates working-approved date to today; keeps existing concept date when present.
 */
export function applyWorkingDrawingsApprovalRules(drawingsHistory, existingConceptDate) {
  const today = todayIsoDate();
  const latest = getLatestDrawingEntry(drawingsHistory);
  const priorConcept =
    (latest?.conceptApprovedDate && String(latest.conceptApprovedDate).trim()) ||
    (existingConceptDate != null && String(existingConceptDate).trim()) ||
    "";
  const conceptDate = priorConcept || today;
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: true,
      workingDrawingsApproved: true,
      conceptApprovedDate: conceptDate,
      workingDrawingsApprovedDate: today,
    }),
    drawingsStatus: DRAWINGS_STATUS.COMPLETE,
    drawings_concept_approved_date: conceptDate,
    drawings_working_approved_date: today,
    ...getDrawingsHolderResetOnApproval(),
  };
}

export function newDrawingHistoryEntryFields() {
  return {
    conceptApproved: false,
    workingDrawingsApproved: false,
    conceptApprovedDate: null,
    workingDrawingsApprovedDate: null,
  };
}
