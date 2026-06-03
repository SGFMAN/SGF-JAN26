export const TIME_STEP_MINUTES = 30;
export const DEFAULT_WORK_HOURS_MINUTES = 8 * 60;
export const DEFAULT_BREAK_MINUTES = 0;
export const DEFAULT_OVERTIME_MINUTES = 0;
export const SELECT_PROJECT_VALUE = "";
export const SELECT_PROJECT_LABEL = "Select...";
export const OFFICE_PROJECT_VALUE = "office";
export const DEFAULT_PROJECT_VALUE = SELECT_PROJECT_VALUE;
export const MAX_WORK_HOURS_MINUTES = 8 * 60;
export const MAX_BREAK_MINUTES = 2 * 60;
export const MAX_OVERTIME_MINUTES = 8 * 60;
export const PAY_PERIOD_DAY_COUNT = 14;

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
    workMinutes: migrateWorkMinutes(entry),
    breakMinutes: Math.min(
      MAX_BREAK_MINUTES,
      Math.max(0, entry.breakMinutes ?? DEFAULT_BREAK_MINUTES)
    ),
    overtimeMinutes: Math.min(
      MAX_OVERTIME_MINUTES,
      Math.max(0, entry.overtimeMinutes ?? DEFAULT_OVERTIME_MINUTES)
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
