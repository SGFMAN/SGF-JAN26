export function getProjectListGroupKey(project, sortMode = "suburb") {
  if (!project) return "";

  const suburbName = (project.suburb || "").trim();
  const classificationName = (project.classification || "").trim();
  const streamName = (project.stream || "").trim();

  if (sortMode === "suburb") {
    return suburbName ? suburbName[0].toUpperCase() : "";
  }
  if (sortMode === "class") {
    return classificationName;
  }
  if (sortMode === "stream") {
    return streamName;
  }
  return "";
}

export const ON_HOLD_REASON_GROUP_ORDER = [
  "No reason selected",
  "Finance",
  "Waiting Deposit",
  "Covenant",
];

export function getOnHoldReasonGroupLabel(project) {
  const reason = project?.on_hold_reason != null ? String(project.on_hold_reason).trim() : "";
  if (reason === "Finance") return "Finance";
  if (reason === "Waiting Deposit") return "Waiting Deposit";
  if (reason === "Covenant") return "Covenant";
  return "No reason selected";
}

export function compareOnHoldReasonGroups(a, b) {
  const ia = ON_HOLD_REASON_GROUP_ORDER.indexOf(getOnHoldReasonGroupLabel(a));
  const ib = ON_HOLD_REASON_GROUP_ORDER.indexOf(getOnHoldReasonGroupLabel(b));
  return ia - ib;
}
