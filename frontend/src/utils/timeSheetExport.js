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

function buildProjectNames(projects) {
  const names = {
    "": "",
    [OFFICE_PROJECT_VALUE]: OFFICE_PROJECT_LABEL,
    office: OFFICE_PROJECT_LABEL,
  };

  for (const project of projects) {
    names[String(project.id)] = formatConstructionProjectLabel(project);
  }

  return names;
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
      projectNames: buildProjectNames(projects),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Export failed (${response.status})`);
  }

  return data;
}
