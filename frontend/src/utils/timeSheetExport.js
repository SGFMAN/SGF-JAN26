import { getApiHeaders, getLoggedInUserId, getLoggedInUserName } from "./auth";
import {
  createDefaultDayEntries,
  loadPayCycleSheet,
  OFFICE_PROJECT_VALUE,
} from "./timeSheetTime";
import {
  formatConstructionProjectLabel,
  getCachedConstructionProjects,
  OFFICE_PROJECT_LABEL,
} from "./timeSheetProjects";
import { formatPeriodRange, getPayPeriodBounds } from "./timeSheetPayCycle";

const API_URL = "";

function buildProjectInfo(projects) {
  const info = {
    "": { name: "", address: "" },
    [OFFICE_PROJECT_VALUE]: { name: OFFICE_PROJECT_LABEL, address: "" },
    office: { name: OFFICE_PROJECT_LABEL, address: "" },
  };

  for (const project of projects) {
    const suburb = (project.suburb || "").trim();
    const street = (project.street || "").trim();
    info[String(project.id)] = {
      name: formatConstructionProjectLabel(project),
      address: street && suburb ? `${street}, ${suburb}` : street || suburb || "",
    };
  }

  return info;
}

export async function exportTimesheetToServer({
  cycleKey,
  periodDays,
  cycleWednesday,
  dayEntries: dayEntriesOverride,
}) {
  const userId = getLoggedInUserId();
  if (!userId) {
    throw new Error("You must be logged in to export a time sheet.");
  }

  const userName = getLoggedInUserName() || "User";
  const dayEntries =
    dayEntriesOverride ?? loadPayCycleSheet(userId, cycleKey) ?? createDefaultDayEntries();
  const projects = getCachedConstructionProjects() ?? [];
  const { periodStart, periodEnd } = getPayPeriodBounds(cycleWednesday);
  const periodLabel = formatPeriodRange(periodStart, periodEnd);

  const response = await fetch(`${API_URL}/api/timesheets/export`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({
      userId: Number(userId),
      userName,
      cycleKey,
      periodLabel,
      periodDays: periodDays.map((day) => ({
        weekday: day.weekday,
        dateLabel: day.dateLabel,
        iso: day.iso,
      })),
      dayEntries,
      projectInfo: buildProjectInfo(projects),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Export failed (${response.status})`);
  }

  return data;
}
