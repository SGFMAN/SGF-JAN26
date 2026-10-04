import { isConstructionPhaseStatus } from "./projectStatus";
import {
  ANNUAL_LEAVE_PROJECT_VALUE,
  isLeaveTimesheetProject,
  OFFICE_PROJECT_VALUE,
  PUBLIC_HOLIDAY_PROJECT_VALUE,
  SICK_LEAVE_PROJECT_VALUE,
} from "./timeSheetTime";

const API_URL = "";

export const OFFICE_PROJECT_LABEL = "Office";

/** Project choices that stay in the timesheet list ahead of live jobs. */
export const FIXED_TIMESHEET_PROJECTS = [
  { value: OFFICE_PROJECT_VALUE, label: OFFICE_PROJECT_LABEL },
  { value: ANNUAL_LEAVE_PROJECT_VALUE, label: "Annual Leave" },
  { value: PUBLIC_HOLIDAY_PROJECT_VALUE, label: "Public Holiday" },
  { value: SICK_LEAVE_PROJECT_VALUE, label: "Sick Leave" },
];

export function fixedProjectsForTimesheetDay(isSaturday) {
  if (!isSaturday) return FIXED_TIMESHEET_PROJECTS;
  return FIXED_TIMESHEET_PROJECTS.filter((project) => !isLeaveTimesheetProject(project.value));
}

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
