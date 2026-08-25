/**
 * Settings → Reminders (quotes). Shared parse for API + scheduler.
 */

const QUOTE_REMINDER_COUNT = 4;
const CALLBACK_LIST_INDEX = 3;
const CALLBACK_LIST_TEMPLATE_NAME = "Call Back List";
const REMINDER_DELAY_MIN = 1;
const REMINDER_DELAY_MAX = 10;
const DEFAULT_AUDIT_HOUR = 9;
const DEFAULT_AUDIT_HOUR_2 = 18;

function emptyQuoteReminder(index) {
  const isCallback = index === CALLBACK_LIST_INDEX;
  return {
    enabled: false,
    delay: Math.min(REMINDER_DELAY_MAX, Math.max(REMINDER_DELAY_MIN, index + 1)),
    templateName: isCallback ? CALLBACK_LIST_TEMPLATE_NAME : "",
    toEmail: "",
  };
}

function sanitizeQuoteReminder(raw, index) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const delayN = Number(src.delay);
  const delay = Number.isFinite(delayN)
    ? Math.min(REMINDER_DELAY_MAX, Math.max(REMINDER_DELAY_MIN, Math.round(delayN)))
    : emptyQuoteReminder(index).delay;
  const isCallback = index === CALLBACK_LIST_INDEX;
  return {
    enabled: Boolean(src.enabled),
    delay: index === 0 ? 1 : delay,
    templateName: src.templateName != null ? String(src.templateName).trim().slice(0, 200) : "",
    toEmail: isCallback ? String(src.toEmail != null ? src.toEmail : "").trim().slice(0, 200) : "",
  };
}

function sanitizeAuditHour(raw, fallback = DEFAULT_AUDIT_HOUR) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(23, Math.max(0, Math.round(n)));
}

function sanitizeFromEmail(raw) {
  return String(raw != null ? raw : "").trim().slice(0, 200);
}

function emptyReminderSettings() {
  return {
    delayUnit: "days",
    auditHour: DEFAULT_AUDIT_HOUR,
    auditHour2: DEFAULT_AUDIT_HOUR_2,
    fromEmail: "",
    quotes: {
      reminders: Array.from({ length: QUOTE_REMINDER_COUNT }, (_, i) => emptyQuoteReminder(i)),
    },
  };
}

function parseReminderSettingsColumn(raw) {
  let obj = raw;
  if (obj == null || obj === "") return emptyReminderSettings();
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return emptyReminderSettings();
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return emptyReminderSettings();
  const quotes = obj.quotes && typeof obj.quotes === "object" && !Array.isArray(obj.quotes) ? obj.quotes : {};
  const rawList = Array.isArray(quotes.reminders) ? quotes.reminders : [];
  const reminders = [];
  for (let i = 0; i < QUOTE_REMINDER_COUNT; i += 1) {
    reminders.push(sanitizeQuoteReminder(rawList[i], i));
  }
  const empty = emptyReminderSettings();
  return {
    delayUnit: empty.delayUnit,
    auditHour: sanitizeAuditHour(obj.auditHour ?? quotes.auditHour),
    auditHour2: sanitizeAuditHour(obj.auditHour2 ?? quotes.auditHour2, DEFAULT_AUDIT_HOUR_2),
    fromEmail: sanitizeFromEmail(obj.fromEmail ?? quotes.fromEmail),
    quotes: { reminders },
  };
}

module.exports = {
  QUOTE_REMINDER_COUNT,
  CALLBACK_LIST_INDEX,
  CALLBACK_LIST_TEMPLATE_NAME,
  DEFAULT_AUDIT_HOUR,
  DEFAULT_AUDIT_HOUR_2,
  sanitizeAuditHour,
  parseReminderSettingsColumn,
};
