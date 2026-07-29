/** Drawings status + per-revision approval flags (mirrors frontend/src/utils/drawingsStatusRules.js). */

const DRAWINGS_STATUS = {
  NOT_ASSIGNED: "Not Assigned",
  CONCEPT_STAGE: "Concept Stage",
  WORKING_STAGE: "Working Drawing Stage",
  COMPLETE: "Drawings Complete",
};

const DRAWINGS_HOLDER_DESIGN_TEAM = "design team";

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function getDrawingsHolderResetOnApproval() {
  return {
    drawings_holder: DRAWINGS_HOLDER_DESIGN_TEAM,
    drawings_holder_date: todayIsoDate(),
  };
}

function parseDrawingsHistory(historyValue) {
  if (!historyValue) return [];
  try {
    const history =
      typeof historyValue === "string" ? JSON.parse(historyValue) : historyValue;
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function getLatestDrawingEntry(drawingsHistory) {
  if (!Array.isArray(drawingsHistory) || drawingsHistory.length === 0) return null;
  return drawingsHistory[drawingsHistory.length - 1];
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

function applyConceptApprovalRules(drawingsHistory) {
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

function applyWorkingDrawingsApprovalRules(drawingsHistory, existingConceptDate) {
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

module.exports = {
  DRAWINGS_STATUS,
  parseDrawingsHistory,
  applyConceptApprovalRules,
  applyWorkingDrawingsApprovalRules,
  getDrawingsHolderResetOnApproval,
  todayIsoDate,
};
