import { INDICATOR } from "./uiThemeTokens.js";

/** Complete → Stream Green; Sent / in progress → Indicator Orange; otherwise → QLD Red. */
export function managerSentCompleteColor(status, { complete = ["Complete"], sent = ["Sent"] } = {}) {
  if (complete.includes(status)) return INDICATOR.green;
  if (sent.includes(status)) return INDICATOR.orange;
  return INDICATOR.red;
}

export function managerDrawingsStatusColor(status) {
  const value = status || "Not Assigned";
  if (value === "Drawings Complete") return INDICATOR.green;
  if (value === "Concept Stage" || value === "Working Drawing Stage") return INDICATOR.orange;
  return INDICATOR.red;
}

export function managerProjectDaysColor(projectDays) {
  if (!projectDays) return null;
  return parseInt(projectDays, 10) < 30 ? INDICATOR.red : INDICATOR.green;
}

export { INDICATOR };
