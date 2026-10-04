import { getApiHeaders, getLoggedInUserId, getLoggedInUserName } from "./auth";
import { createDefaultDayEntries, loadPayCycleSheet, normalizeDayEntries } from "./timeSheetTime";
import { formatPeriodRange, getPayPeriodBounds, payCycleFromParts } from "./timeSheetPayCycle";
import { prefetchConstructionProjectsForTimeSheet } from "./timeSheetProjects";

const API_URL = "";

function serializePeriodDays(periodDays) {
  return (Array.isArray(periodDays) ? periodDays : []).map((day) => ({
    weekday: day.weekday,
    dateLabel: day.dateLabel,
    iso: day.iso,
    date: day.date instanceof Date ? day.date.toISOString() : day.date,
  }));
}

export async function fetchOpenPayCycle() {
  const response = await fetch(`${API_URL}/api/timesheets/open-cycle`, {
    headers: getApiHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to load the time sheet cycle (${response.status})`);
  }
  return payCycleFromParts(data.openCycle || {});
}

export async function fetchMyTimesheet(cycleKey) {
  const userId = getLoggedInUserId();
  if (!userId || !cycleKey) return null;

  const response = await fetch(
    `${API_URL}/api/timesheets/mine?cycleKey=${encodeURIComponent(cycleKey)}`,
    { headers: getApiHeaders() }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to load time sheet (${response.status})`);
  }
  if (!data?.sheet) return null;
  return { ...data.sheet, dayEntries: normalizeDayEntries(data.sheet.dayEntries) };
}

export async function saveTimesheetDraft({ cycleKey, periodDays, dayEntries }) {
  const userId = getLoggedInUserId();
  if (!userId) {
    throw new Error("You must be logged in to save a time sheet.");
  }
  const key = String(cycleKey || "").trim();
  if (!key) return null;

  const response = await fetch(`${API_URL}/api/timesheets/draft`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({
      userId: Number(userId),
      userName: getLoggedInUserName() || "User",
      cycleKey: key,
      periodDays: serializePeriodDays(periodDays),
      dayEntries,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409) {
    const error = new Error(data.error || "That pay cycle is closed.");
    error.cycleClosed = true;
    throw error;
  }
  if (!response.ok) {
    throw new Error(data.error || `Save failed (${response.status})`);
  }
  return data;
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
      periodDays: serializePeriodDays(periodDays),
      dayEntries,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Export failed (${response.status})`);
  }

  return data;
}

export async function saveTimesheetToServer({
  cycleKey,
  periodDays,
  dayEntries: dayEntriesOverride,
}) {
  const userId = getLoggedInUserId();
  if (!userId) {
    throw new Error("You must be logged in to send a time sheet.");
  }

  const userName = getLoggedInUserName() || "User";
  const dayEntries = dayEntriesOverride ?? createDefaultDayEntries();

  const response = await fetch(`${API_URL}/api/timesheets`, {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({
      userId: Number(userId),
      userName,
      cycleKey,
      periodDays: serializePeriodDays(periodDays),
      dayEntries,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 409) {
    const error = new Error(data.error || "That pay cycle is closed.");
    error.cycleClosed = true;
    throw error;
  }
  if (!response.ok) {
    throw new Error(data.error || `Save failed (${response.status})`);
  }

  return data;
}
