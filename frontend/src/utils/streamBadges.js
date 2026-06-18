export const PROJECT_STREAM_BADGE_MAP = {
  "SGF - VIC": { acronym: "VIC", color: "#4D93D9" },
  "SGF - QLD": { acronym: "QLD", color: "#D54358" },
  "Dual Dwelling": { acronym: "DDI", color: "#92D050" },
  ATA: { acronym: "ATA", color: "#92D050" },
  "Pumped on Property": { acronym: "POP", color: "#92D050" },
  "Pumped On Property": { acronym: "POP", color: "#92D050" },
  Henderson: { acronym: "HEN", color: "#92D050" },
  "Creat Cash Flow": { acronym: "CCF", color: "#92D050" },
  "Create Cash Flow": { acronym: "CCF", color: "#92D050" },
  "Fresh Start Advisory": { acronym: "FSA", color: "#92D050" },
};

export function getProjectStreamBadge(project) {
  if (!project) return null;

  const stream = (project.stream || "").trim();
  if (stream && PROJECT_STREAM_BADGE_MAP[stream]) {
    return PROJECT_STREAM_BADGE_MAP[stream];
  }

  if (!stream) {
    const state = (project.state || "").trim().toUpperCase();
    if (state === "VIC") return PROJECT_STREAM_BADGE_MAP["SGF - VIC"];
    if (state === "QLD") return PROJECT_STREAM_BADGE_MAP["SGF - QLD"];
  }

  return null;
}
