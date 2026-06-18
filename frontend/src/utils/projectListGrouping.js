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
