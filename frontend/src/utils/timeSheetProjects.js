import { isConstructionPhaseStatus } from "./projectStatus";

export const OFFICE_PROJECT_LABEL = "Office";

export function formatConstructionProjectLabel(project) {
  const suburb = (project.suburb || "").trim();
  const street = (project.street || "").trim();
  if (suburb && street) return `${suburb} - ${street}`;
  return suburb || street || project.name || `Project ${project.id}`;
}

export function filterConstructionProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects
    .filter((p) => isConstructionPhaseStatus(p.status))
    .sort((a, b) => {
      const labelA = formatConstructionProjectLabel(a).toLowerCase();
      const labelB = formatConstructionProjectLabel(b).toLowerCase();
      return labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
    });
}
