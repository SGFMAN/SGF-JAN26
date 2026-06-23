export const TIME_STEP_MINUTES = 30;
export const DEFAULT_WORK_HOURS_MINUTES = 8 * 60;
export const DEFAULT_BREAK_MINUTES = 0;
export const DEFAULT_OVERTIME_MINUTES = 0;
export const SELECT_PROJECT_VALUE = "";
export const SELECT_PROJECT_LABEL = "Select...";
export const OFFICE_PROJECT_VALUE = "office";
export const DEFAULT_PROJECT_VALUE = SELECT_PROJECT_VALUE;
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

export function createDefaultDayEntries(count = PAY_PERIOD_DAY_COUNT) {
  return Array.from({ length: count }, () => createDefaultDayEntry());
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
  if (entry.workMinutes != null) {
    return Math.min(
      MAX_WORK_HOURS_MINUTES,
      Math.max(0, Number(entry.workMinutes) || DEFAULT_WORK_HOURS_MINUTES)
    );
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
    projectId: entry.projectId ?? DEFAULT_PROJECT_VALUE,
  };
}

export function loadUserTemplate(userId) {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const key = templateStorageKey(userId);
    const entries = parsed?.[key] ?? parsed?.[Number(userId)];
    if (!Array.isArray(entries) || entries.length !== PAY_PERIOD_DAY_COUNT) return null;
    return entries.map(normalizeTemplateEntry);
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

export function loadPayCycleSheet(userId, cycleKey) {
  if (!userId || !cycleKey) return null;
  try {
    const raw = localStorage.getItem(PAY_CYCLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entries = parsed?.[payCycleStorageKey(userId, cycleKey)];
    if (!Array.isArray(entries) || entries.length !== PAY_PERIOD_DAY_COUNT) return null;
    return entries.map(normalizeTemplateEntry);
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
