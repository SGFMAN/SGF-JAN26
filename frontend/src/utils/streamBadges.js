import { getProjectStreamBadgeColor, getStreamBadgeColor } from "./streamColors.js";

export const PROJECT_STREAM_BADGE_MAP = {
  "SGF - VIC": { acronym: "VIC" },
  "SGF - QLD": { acronym: "QLD" },
  "Dual Dwelling": { acronym: "DDI" },
  ATA: { acronym: "ATA" },
  "Pumped on Property": { acronym: "POP" },
  "Pumped On Property": { acronym: "POP" },
  Henderson: { acronym: "HEN" },
  "Creat Cash Flow": { acronym: "CCF" },
  "Create Cash Flow": { acronym: "CCF" },
  "Fresh Start Advisory": { acronym: "FSA" },
};

export function getProjectStreamBadge(project) {
  if (!project) return null;

  const stream = (project.stream || "").trim();
  if (stream && PROJECT_STREAM_BADGE_MAP[stream]) {
    return {
      ...PROJECT_STREAM_BADGE_MAP[stream],
      color: getStreamBadgeColor(stream),
    };
  }

  if (!stream) {
    const state = (project.state || "").trim().toUpperCase();
    if (state === "VIC") {
      return { ...PROJECT_STREAM_BADGE_MAP["SGF - VIC"], color: getStreamBadgeColor("SGF - VIC") };
    }
    if (state === "QLD") {
      return { ...PROJECT_STREAM_BADGE_MAP["SGF - QLD"], color: getStreamBadgeColor("SGF - QLD") };
    }
  }

  return null;
}
