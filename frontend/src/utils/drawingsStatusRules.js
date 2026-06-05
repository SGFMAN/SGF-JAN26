/** Drawings status + per-revision approval flags (see product rules). */

export const DRAWINGS_STATUS = {
  NOT_ASSIGNED: "Not Assigned",
  CONCEPT_STAGE: "Concept Stage",
  WORKING_STAGE: "Working Drawing Stage",
  COMPLETE: "Drawings Complete",
};

export const DRAWINGS_HOLDER_DESIGN_TEAM = "design team";

export function getDrawingsHolderResetOnApproval() {
  return {
    drawings_holder: DRAWINGS_HOLDER_DESIGN_TEAM,
    drawings_holder_date: new Date().toISOString().split("T")[0],
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
    }),
    drawingsStatus: DRAWINGS_STATUS.CONCEPT_STAGE,
  };
}

/** Upload modal: working drawings selected. */
export function applyWorkingUploadRules(drawingsHistory) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: false,
      workingDrawingsApproved: false,
    }),
    drawingsStatus: DRAWINGS_STATUS.WORKING_STAGE,
  };
}

export function applyDrawingUploadKindRules(drawingsHistory, uploadKind) {
  if (uploadKind === "working") {
    return applyWorkingUploadRules(drawingsHistory);
  }
  return applyConceptUploadRules(drawingsHistory);
}

/** Approve Concept button / client portal. */
export function applyConceptApprovalRules(drawingsHistory) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: true,
      workingDrawingsApproved: false,
    }),
    drawingsStatus: DRAWINGS_STATUS.WORKING_STAGE,
    ...getDrawingsHolderResetOnApproval(),
  };
}

/** Approve Working Drawings button. */
export function applyWorkingDrawingsApprovalRules(drawingsHistory) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: true,
      workingDrawingsApproved: true,
    }),
    drawingsStatus: DRAWINGS_STATUS.COMPLETE,
    ...getDrawingsHolderResetOnApproval(),
  };
}

export function newDrawingHistoryEntryFields() {
  return {
    conceptApproved: false,
    workingDrawingsApproved: false,
  };
}
