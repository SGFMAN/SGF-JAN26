import { isConstructionPhaseStatus } from "./projectStatus";

const API_URL = "";

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

let constructionProjectsCache = null;
let constructionProjectsFetchPromise = null;

export function getCachedConstructionProjects() {
  return constructionProjectsCache;
}

export function prefetchConstructionProjectsForTimeSheet() {
  if (constructionProjectsCache) return Promise.resolve(constructionProjectsCache);
  if (constructionProjectsFetchPromise) return constructionProjectsFetchPromise;

  constructionProjectsFetchPromise = fetch(`${API_URL}/api/projects`)
    .then((response) => {
      if (!response.ok) throw new Error("Failed to fetch projects");
      return response.json();
    })
    .then((data) => {
      constructionProjectsCache = filterConstructionProjects(data);
      return constructionProjectsCache;
    })
    .catch((error) => {
      console.error("TimeSheet projects prefetch:", error);
      constructionProjectsCache = [];
      return constructionProjectsCache;
    })
    .finally(() => {
      constructionProjectsFetchPromise = null;
    });

  return constructionProjectsFetchPromise;
}
