import { PAY_PERIOD_WEEKDAY_ORDER } from "./timeSheetPayCycle";

export const TIME_STEP_MINUTES = 30;
export const DEFAULT_WORK_HOURS_MINUTES = 8 * 60;
export const DEFAULT_BREAK_MINUTES = 0;
export const DEFAULT_OVERTIME_MINUTES = 0;
export const SELECT_PROJECT_VALUE = "";
export const SELECT_PROJECT_LABEL = "Select...";
export const OFFICE_PROJECT_VALUE = "office";
export const ANNUAL_LEAVE_PROJECT_VALUE = "annual-leave";
export const PUBLIC_HOLIDAY_PROJECT_VALUE = "public-holiday";
export const SICK_LEAVE_PROJECT_VALUE = "sick-leave";
export const DEFAULT_PROJECT_VALUE = OFFICE_PROJECT_VALUE;

const LEAVE_PROJECT_VALUES = new Set([
  ANNUAL_LEAVE_PROJECT_VALUE,
  PUBLIC_HOLIDAY_PROJECT_VALUE,
  SICK_LEAVE_PROJECT_VALUE,
]);

export function isLeaveTimesheetProject(projectId) {
  return LEAVE_PROJECT_VALUES.has(String(projectId ?? "").trim());
}

/**
 * Saturday cannot be leave. A weekday leave day is locked at 8 hours.
 * Returns the same array when nothing changes.
 */
export function applyTimesheetDayRules(entries) {
  if (!Array.isArray(entries)) return entries;
  let changed = false;
  const next = entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") return entry;
    const leave = isLeaveTimesheetProject(entry.projectId);
    if (isSaturdayIndex(index)) {
      if (!leave) return entry;
      changed = true;
      return { ...entry, projectId: DEFAULT_PROJECT_VALUE };
    }
    if (!leave) return entry;
    const work = Number(entry.workMinutes);
    const overtime = Number(entry.overtimeMinutes);
    if (work === DEFAULT_WORK_HOURS_MINUTES && (!Number.isFinite(overtime) || overtime === 0)) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      workMinutes: DEFAULT_WORK_HOURS_MINUTES,
      overtimeMinutes: 0,
    };
  });
  return changed ? next : entries;
}
export const MAX_WORK_HOURS_MINUTES = 8 * 60;
export const MAX_BREAK_MINUTES = 60;
export const MAX_OVERTIME_MINUTES = 8 * 60;
export const PAY_PERIOD_DAY_COUNT = 14;

/** Placeholder — not a committed duration value. */
export const SELECT_DURATION_MINUTES = -1;

export const WORK_HOUR_OPTIONS = [
  { minutes: SELECT_DURATION_MINUTES, label: "Select" },
  { minutes: 0, label: "None" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hour" },
  { minutes: 180, label: "3 hour" },
  { minutes: 240, label: "4 hour" },
  { minutes: 300, label: "5 hour" },
  { minutes: 360, label: "6 hour" },
  { minutes: 420, label: "7 hour" },
  { minutes: 480, label: "8 hour" },
];

export const BREAK_DURATION_OPTIONS = [
  { minutes: SELECT_DURATION_MINUTES, label: "Select" },
  { minutes: 0, label: "None" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
];

/** @deprecated Use WORK_HOUR_OPTIONS */
export const HOUR_DURATION_OPTIONS = WORK_HOUR_OPTIONS;

export function snapToDurationOptions(minutes, options, fallback = 0) {
  const allowed = options.map((option) => option.minutes);
  const total = Number(minutes);
  if (Number.isFinite(total) && allowed.includes(total)) return total;

  let best = fallback;
  let bestDistance = Infinity;
  for (const allowedMinutes of allowed) {
    const distance = Math.abs(allowedMinutes - (Number.isFinite(total) ? total : fallback));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = allowedMinutes;
    }
  }
  return best;
}

export function snapToHourDuration(minutes, fallback = 0) {
  return snapToDurationOptions(minutes, WORK_HOUR_OPTIONS, fallback);
}

export function createDefaultDayEntry() {
  return {
    workMinutes: DEFAULT_WORK_HOURS_MINUTES,
    breakMinutes: DEFAULT_BREAK_MINUTES,
    overtimeMinutes: DEFAULT_OVERTIME_MINUTES,
    projectId: DEFAULT_PROJECT_VALUE,
  };
}

function isSaturdayIndex(index) {
  return PAY_PERIOD_WEEKDAY_ORDER[index] === "Saturday";
}

export function createDefaultDayEntries(count = PAY_PERIOD_DAY_COUNT) {
  return Array.from({ length: count }, (_, index) => {
    const entry = createDefaultDayEntry();
    if (isSaturdayIndex(index)) entry.workMinutes = 0;
    return entry;
  });
}

export function stepWorkMinutes(minutes, direction) {
  const next = minutes + direction * TIME_STEP_MINUTES;
  return Math.min(MAX_WORK_HOURS_MINUTES, Math.max(0, next));
}

export function stepBreakMinutes(minutes, direction) {
  const next = minutes + direction * TIME_STEP_MINUTES;
  return Math.min(MAX_BREAK_MINUTES, Math.max(0, next));
}

export function stepOvertimeMinutes(minutes, direction) {
  const next = minutes + direction * TIME_STEP_MINUTES;
  return Math.min(MAX_OVERTIME_MINUTES, Math.max(0, next));
}

/** e.g. 0 min, 30 mins, 1 hr, 1 hr 30 mins */
export function formatDurationMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "0 min";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} mins`;
  const hrLabel = hours === 1 ? "1 hr" : `${hours} hr`;
  if (mins === 0) return hrLabel;
  return `${hrLabel} ${mins} mins`;
}

export const formatWorkHoursMinutes = formatDurationMinutes;
export const formatBreakMinutes = formatDurationMinutes;
export const formatOvertimeMinutes = formatDurationMinutes;

function migrateWorkMinutes(entry) {
  if (entry.workMinutes != null && entry.workMinutes !== "") {
    const n = Number(entry.workMinutes);
    if (!Number.isFinite(n)) return DEFAULT_WORK_HOURS_MINUTES;
    if (n === SELECT_DURATION_MINUTES) return SELECT_DURATION_MINUTES;
    return Math.min(MAX_WORK_HOURS_MINUTES, Math.max(0, n));
  }
  if (entry.startMinutes != null && entry.finishMinutes != null) {
    let duration = entry.finishMinutes - entry.startMinutes;
    if (duration < 0) duration += 24 * 60;
    if (duration > 0) {
      return Math.min(MAX_WORK_HOURS_MINUTES, duration);
    }
  }
  return DEFAULT_WORK_HOURS_MINUTES;
}

const TEMPLATE_STORAGE_KEY = "sgf_time_sheet_user_templates_v1";

function templateStorageKey(userId) {
  return String(userId);
}

function normalizeTemplateEntry(entry) {
  return {
    workMinutes: snapToDurationOptions(migrateWorkMinutes(entry), WORK_HOUR_OPTIONS, DEFAULT_WORK_HOURS_MINUTES),
    breakMinutes: snapToDurationOptions(
      entry.breakMinutes ?? DEFAULT_BREAK_MINUTES,
      BREAK_DURATION_OPTIONS,
      DEFAULT_BREAK_MINUTES
    ),
    overtimeMinutes: snapToDurationOptions(
      entry.overtimeMinutes ?? DEFAULT_OVERTIME_MINUTES,
      WORK_HOUR_OPTIONS,
      DEFAULT_OVERTIME_MINUTES
    ),
    projectId: entry.projectId || DEFAULT_PROJECT_VALUE,
  };
}

export function normalizeDayEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== PAY_PERIOD_DAY_COUNT) return null;
  return entries.map(normalizeTemplateEntry);
}

export function loadUserTemplate(userId) {
  migrateStoredSaturdayDefaults();
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const key = templateStorageKey(userId);
    const entries = parsed?.[key] ?? parsed?.[Number(userId)];
    return normalizeDayEntries(entries);
  } catch {
    return null;
  }
}

export function saveUserTemplate(userId, entries) {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[templateStorageKey(userId)] = entries.map(normalizeTemplateEntry);
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(parsed));
  } catch (e) {
    console.error("saveUserTemplate:", e);
  }
}

const PAY_CYCLE_STORAGE_KEY = "sgf_time_sheet_pay_cycles_v1";

function payCycleStorageKey(userId, cycleKey) {
  return `${templateStorageKey(userId)}:${cycleKey}`;
}

const SATURDAY_NONE_MIGRATION_KEY = "sgf_time_sheet_saturday_none_v1";

/** Sheets saved before Saturday defaulted to None still have 8 hours there. Update those once. */
function migrateStoredSaturdayDefaults() {
  try {
    if (localStorage.getItem(SATURDAY_NONE_MIGRATION_KEY) === "1") return;
    for (const storageKey of [TEMPLATE_STORAGE_KEY, PAY_CYCLE_STORAGE_KEY]) {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      let changed = false;
      for (const key of Object.keys(parsed)) {
        const entries = parsed[key];
        if (!Array.isArray(entries)) continue;
        parsed[key] = entries.map((entry, index) => {
          if (!isSaturdayIndex(index) || !entry || typeof entry !== "object") return entry;
          if (Number(entry.workMinutes) !== DEFAULT_WORK_HOURS_MINUTES) return entry;
          changed = true;
          return { ...entry, workMinutes: 0 };
        });
      }
      if (changed) localStorage.setItem(storageKey, JSON.stringify(parsed));
    }
    localStorage.setItem(SATURDAY_NONE_MIGRATION_KEY, "1");
  } catch (e) {
    console.error("migrateStoredSaturdayDefaults:", e);
  }
}

export function loadPayCycleSheet(userId, cycleKey) {
  if (!userId || !cycleKey) return null;
  migrateStoredSaturdayDefaults();
  try {
    const raw = localStorage.getItem(PAY_CYCLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entries = parsed?.[payCycleStorageKey(userId, cycleKey)];
    return normalizeDayEntries(entries);
  } catch {
    return null;
  }
}

export function savePayCycleSheet(userId, cycleKey, entries) {
  if (!userId || !cycleKey) return;
  try {
    const raw = localStorage.getItem(PAY_CYCLE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[payCycleStorageKey(userId, cycleKey)] = entries.map(normalizeTemplateEntry);
    localStorage.setItem(PAY_CYCLE_STORAGE_KEY, JSON.stringify(parsed));
  } catch (e) {
    console.error("savePayCycleSheet:", e);
  }
}

/** Copy saved user template entries for applying to the current pay cycle. */
export function getUserTemplateEntries(userId) {
  return loadUserTemplate(userId);
}
