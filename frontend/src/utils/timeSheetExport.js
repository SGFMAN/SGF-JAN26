import { getApiHeaders, getLoggedInUserId, getLoggedInUserName } from "./auth";
import { createDefaultDayEntries, loadPayCycleSheet } from "./timeSheetTime";
import { formatPeriodRange, getPayPeriodBounds } from "./timeSheetPayCycle";
import { prefetchConstructionProjectsForTimeSheet } from "./timeSheetProjects";

const API_URL = "";

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
  const { periodStart, periodEnd } = getPayPeriodBounds(cycleWednesday);
  const periodLabel = formatPeriodRange(periodStart, periodEnd);

  await prefetchConstructionProjectsForTimeSheet();

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
        date: day.date instanceof Date ? day.date.toISOString() : day.date,
      })),
      dayEntries,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Export failed (${response.status})`);
  }

  return data;
}
