/** Drawings status + per-revision approval flags (mirrors frontend/src/utils/drawingsStatusRules.js). */

const DRAWINGS_STATUS = {
  NOT_ASSIGNED: "Not Assigned",
  CONCEPT_STAGE: "Concept Stage",
  WORKING_STAGE: "Working Drawing Stage",
  COMPLETE: "Drawings Complete",
};

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
  };
}

module.exports = {
  DRAWINGS_STATUS,
  parseDrawingsHistory,
  applyConceptApprovalRules,
};
