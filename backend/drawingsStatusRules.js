/** Drawings status + per-revision approval flags (mirrors frontend/src/utils/drawingsStatusRules.js). */

const DRAWINGS_STATUS = {
  NOT_ASSIGNED: "Not Assigned",
  CONCEPT_STAGE: "Concept Stage",
  WORKING_STAGE: "Working Drawing Stage",
  COMPLETE: "Drawings Complete",
};

const DRAWINGS_HOLDER_DESIGN_TEAM = "design team";

function getDrawingsHolderResetOnApproval() {
  return {
    drawings_holder: DRAWINGS_HOLDER_DESIGN_TEAM,
    drawings_holder_date: new Date().toISOString().split("T")[0],
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
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: true,
      workingDrawingsApproved: false,
    }),
    drawingsStatus: DRAWINGS_STATUS.WORKING_STAGE,
    ...getDrawingsHolderResetOnApproval(),
  };
}

function applyWorkingDrawingsApprovalRules(drawingsHistory) {
  return {
    history: updateLatestRevisionFlags(drawingsHistory, {
      conceptApproved: true,
      workingDrawingsApproved: true,
    }),
    drawingsStatus: DRAWINGS_STATUS.COMPLETE,
    ...getDrawingsHolderResetOnApproval(),
  };
}

module.exports = {
  DRAWINGS_STATUS,
  parseDrawingsHistory,
  applyConceptApprovalRules,
  applyWorkingDrawingsApprovalRules,
  getDrawingsHolderResetOnApproval,
};
