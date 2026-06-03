/** First pay-cycle Wednesday (3 June 2026). Cycles repeat every 14 days. */
export const PAY_CYCLE_ANCHOR = new Date(2026, 5, 3);

export const PAY_CYCLE_LENGTH_DAYS = 14;

const MS_PER_DAY = 86400000;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Fortnight day order: Wednesday (cycle start) through the following Tuesday. */
export const PAY_PERIOD_WEEKDAY_ORDER = [
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

function addDays(date, days) {
  const d = new Date(startOfDay(date));
  d.setDate(d.getDate() + days);
  return d;
}

/** Wednesday that starts the 14-day pay cycle containing `date`. */
export function getPayCycleWednesdayForDate(date = new Date()) {
  const d = startOfDay(date);
  const anchor = startOfDay(PAY_CYCLE_ANCHOR);
  const daysSinceAnchor = daysBetween(anchor, d);
  let cycleIndex = Math.floor(daysSinceAnchor / PAY_CYCLE_LENGTH_DAYS);
  if (daysSinceAnchor < 0) cycleIndex = Math.ceil(daysSinceAnchor / PAY_CYCLE_LENGTH_DAYS) - 1;

  let cycleWednesday = addDays(anchor, cycleIndex * PAY_CYCLE_LENGTH_DAYS);
  let periodStart = cycleWednesday;
  let periodEnd = addDays(periodStart, PAY_CYCLE_LENGTH_DAYS - 1);

  if (d < periodStart) {
    cycleWednesday = addDays(cycleWednesday, -PAY_CYCLE_LENGTH_DAYS);
    periodStart = cycleWednesday;
    periodEnd = addDays(periodStart, PAY_CYCLE_LENGTH_DAYS - 1);
  } else if (d > periodEnd) {
    cycleWednesday = addDays(cycleWednesday, PAY_CYCLE_LENGTH_DAYS);
    periodStart = cycleWednesday;
    periodEnd = addDays(periodStart, PAY_CYCLE_LENGTH_DAYS - 1);
  }

  return cycleWednesday;
}

export function formatShortDate(date) {
  const d = startOfDay(date);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatPeriodRange(periodStart, periodEnd) {
  const start = startOfDay(periodStart);
  const end = startOfDay(periodEnd);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const startStr = `${start.getDate()} ${months[start.getMonth()]}`;
  const endStr = `${end.getDate()} ${months[end.getMonth()]} ${end.getFullYear()}`;
  return `${startStr} – ${endStr}`;
}

/** 14 days: cycle Wednesday through the following Tuesday. */
export function getPayPeriodDays(cycleWednesday = getPayCycleWednesdayForDate()) {
  const periodStart = startOfDay(cycleWednesday);
  return PAY_PERIOD_WEEKDAY_ORDER.map((expectedWeekday, index) => {
    const date = addDays(periodStart, index);
    const weekday = WEEKDAY_NAMES[date.getDay()];
    return {
      date,
      weekday,
      expectedWeekday,
      dateLabel: formatShortDate(date),
      iso: date.toISOString().slice(0, 10),
    };
  });
}

export function getPayPeriodBounds(cycleWednesday = getPayCycleWednesdayForDate()) {
  const periodStart = startOfDay(cycleWednesday);
  const periodEnd = addDays(periodStart, PAY_CYCLE_LENGTH_DAYS - 1);
  return { periodStart, periodEnd, cycleWednesday };
}

export function possessiveFirstName(fullName) {
  const first = (fullName || "").trim().split(/\s+/)[0] || "User";
  if (/s$/i.test(first)) return `${first}'`;
  return `${first}'s`;
}

export function timeSheetTitle(fullName) {
  return `${possessiveFirstName(fullName)} Time Sheet`;
}
