/**
 * Friday 3pm Melbourne weekly roundup email to Ben.
 * Counts the labelled Saturday–Friday week (Saturday 00:00 through send time).
 */

const nodemailer = require("nodemailer");
const path = require("path");
const sharp = require("sharp");

const TZ = "Australia/Melbourne";
const TO_ADDRESS = "ben@superiorgrannyflats.com.au";
const SUBJECT = "Weekly Sales Round Up";
const FRIDAY_INDEX = 5;
const SATURDAY_INDEX = 6;
const SEND_HOUR = 15;
const TICK_MS = 20 * 1000;
const FAIL_BACKOFF_MS = 2 * 60 * 1000;
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const VIC_BLUE = "#4D93D9";
const QLD_MAROON = "#D54358";
const STREAM_GREEN = "#92D050";
const SOLD_IMAGE_PATH = path.join(__dirname, "..", "frontend", "src", "images", "sold.webp");
const SOLD_LABEL_WIDTH_PX = 120;

function melbourneParts(now = new Date()) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const weekday = String(parts.weekday || "").slice(0, 3);
  return {
    weekday,
    weekdayIndex: WEEKDAY_INDEX[weekday] ?? -1,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function melbourneLocalToUtc(ymd, hour, minute) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const naive = `${ymd}T${hh}:${mm}:00`;
  const wantedMinutes = hour * 60 + minute;
  for (const offset of ["+11:00", "+10:00"]) {
    const d = new Date(`${naive}${offset}`);
    if (Number.isNaN(d.getTime())) continue;
    const clock = melbourneParts(d);
    if (clock.date === ymd && clock.minutesOfDay === wantedMinutes) return d;
  }
  return new Date(`${naive}+10:00`);
}

function previousFriday3pm(now = new Date()) {
  const clock = melbourneParts(now);
  let daysBack = (clock.weekdayIndex - FRIDAY_INDEX + 7) % 7;
  if (daysBack === 0) daysBack = 7;
  const friday = addDaysYmd(clock.date, -daysBack);
  return melbourneLocalToUtc(friday, SEND_HOUR, 0);
}

function formatAuDate(ymd) {
  const [y, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function reportingWeekDates(now = new Date()) {
  const clock = melbourneParts(now);
  const daysSinceSaturday = (clock.weekdayIndex - SATURDAY_INDEX + 7) % 7;
  const saturday = addDaysYmd(clock.date, -daysSinceSaturday);
  const friday = addDaysYmd(saturday, 6);
  return { saturday, friday };
}

function reportingWeekPeriod(now = new Date()) {
  const { saturday, friday } = reportingWeekDates(now);
  return {
    saturday,
    friday,
    start: melbourneLocalToUtc(saturday, 0, 0),
    endExclusive: melbourneLocalToUtc(addDaysYmd(friday, 1), 0, 0),
  };
}

/** Previous completed Sat–Fri week (the last roundup week when called mid-week). */
function lastCompletedReportingWeekPeriod(now = new Date()) {
  const current = reportingWeekDates(now);
  const saturday = addDaysYmd(current.saturday, -7);
  const friday = addDaysYmd(current.friday, -7);
  return {
    saturday,
    friday,
    start: melbourneLocalToUtc(saturday, 0, 0),
    endExclusive: melbourneLocalToUtc(addDaysYmd(friday, 1), 0, 0),
  };
}

async function ensureRoundupColumns(pool) {
  await pool.query(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS quote_contact_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quote_reminder_4_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS hotlist_added_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS weekly_roundup_sent_on DATE,
      ADD COLUMN IF NOT EXISTS weekly_roundup_period_end TIMESTAMPTZ
  `);

  for (const col of ["quote_contact_at", "hotlist_added_at", "sold_at"]) {
    try {
      await pool.query(
        `ALTER TABLE projects
         ALTER COLUMN ${col} TYPE TIMESTAMPTZ
         USING NULLIF(${col}::text, '')::timestamptz`
      );
    } catch (e) {
      console.log(`[weekly-roundup] ${col} type:`, e.message);
    }
  }

  await pool.query(`
    UPDATE projects
    SET hotlist_added_at = COALESCE(
      hotlist_added_at,
      (regexp_match(
        COALESCE(project_log, ''),
        '(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) - Status changed from Quote to Hotlist'
      ))[1]::timestamp AT TIME ZONE 'UTC',
      (regexp_match(
        COALESCE(project_log, ''),
        '(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) - Hotlist Item Created'
      ))[1]::timestamp AT TIME ZONE 'UTC'
    )
    WHERE hotlist_added_at IS NULL
      AND (
        project_log ILIKE '%Status changed from Quote to Hotlist%'
        OR project_log ILIKE '%Hotlist Item Created%'
      )
  `);

  await pool.query(`
    UPDATE projects
    SET sold_at = COALESCE(
      sold_at,
      (regexp_match(
        COALESCE(project_log, ''),
        '(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) - Status changed from Hotlist to Pre-Engagement Phase \\(Sold\\)'
      ))[1]::timestamp AT TIME ZONE 'UTC'
    )
    WHERE sold_at IS NULL
      AND project_log ILIKE '%Pre-Engagement Phase (Sold)%'
  `);
}

/** VIC / QLD from stream when set, otherwise project state. */
const REGION_SQL = `CASE
  WHEN TRIM(COALESCE(stream, '')) = 'SGF - VIC' THEN 'VIC'
  WHEN TRIM(COALESCE(stream, '')) = 'SGF - QLD' THEN 'QLD'
  WHEN UPPER(TRIM(COALESCE(state, ''))) IN ('VIC', 'VICTORIA') THEN 'VIC'
  WHEN UPPER(TRIM(COALESCE(state, ''))) IN ('QLD', 'QUEENSLAND') THEN 'QLD'
  ELSE 'OTHER'
END`;

function countSql(where) {
  return `(SELECT COUNT(*)::int FROM projects WHERE ${where})`;
}

function regionCounts(where) {
  return {
    total: countSql(where),
    vic: countSql(`(${where}) AND ${REGION_SQL} = 'VIC'`),
    qld: countSql(`(${where}) AND ${REGION_SQL} = 'QLD'`),
    other: countSql(`(${where}) AND ${REGION_SQL} = 'OTHER'`),
  };
}

async function collectWeeklyFigures(pool, periodStart, periodEnd) {
  const ts = (col) => `NULLIF(${col}::text, '')::timestamptz`;
  const quotesAdded = `${ts("quote_added_at")} >= $1 AND ${ts("quote_added_at")} < $2`;
  const quotesContact = `(
    (${ts("quote_contact_at")} >= $1 AND ${ts("quote_contact_at")} < $2)
    OR (
      (COALESCE(quote_contact::text, '') IN ('true', 't', '1'))
      AND quote_contact_at IS NULL
      AND ${ts("quote_added_at")} >= $1 AND ${ts("quote_added_at")} < $2
    )
  )`;
  const hotlist = `${ts("hotlist_added_at")} >= $1 AND ${ts("hotlist_added_at")} < $2`;
  const callbacks = `${ts("quote_reminder_4_sent_at")} >= $1 AND ${ts("quote_reminder_4_sent_at")} < $2`;
  const q = regionCounts(quotesAdded);
  const c = regionCounts(quotesContact);
  const cb = regionCounts(callbacks);
  const h = regionCounts(hotlist);
  const r = await pool.query(
    `SELECT
       ${q.total} AS new_quotes,
       ${q.vic} AS new_quotes_vic,
       ${q.qld} AS new_quotes_qld,
       ${q.other} AS new_quotes_other,
       ${c.total} AS quotes_contact,
       ${c.vic} AS quotes_contact_vic,
       ${c.qld} AS quotes_contact_qld,
       ${c.other} AS quotes_contact_other,
       ${cb.total} AS callbacks,
       ${cb.vic} AS callbacks_vic,
       ${cb.qld} AS callbacks_qld,
       ${cb.other} AS callbacks_other,
       ${h.total} AS new_hotlist,
       ${h.vic} AS new_hotlist_vic,
       ${h.qld} AS new_hotlist_qld,
       ${h.other} AS new_hotlist_other,
       (SELECT COUNT(*)::int FROM projects
         WHERE ${ts("sold_at")} >= $1 AND ${ts("sold_at")} < $2
           AND TRIM(COALESCE(stream, '')) = 'SGF - VIC') AS sold_vic,
       (SELECT COUNT(*)::int FROM projects
         WHERE ${ts("sold_at")} >= $1 AND ${ts("sold_at")} < $2
           AND TRIM(COALESCE(stream, '')) = 'SGF - QLD') AS sold_qld,
       (SELECT COUNT(*)::int FROM projects
         WHERE ${ts("sold_at")} >= $1 AND ${ts("sold_at")} < $2
           AND TRIM(COALESCE(stream, '')) NOT IN ('SGF - VIC', 'SGF - QLD')) AS sold_streams`,
    [periodStart, periodEnd]
  );
  const row = r.rows[0] || {};
  const n = (key) => Number(row[key]) || 0;
  return {
    newQuotes: n("new_quotes"),
    newQuotesVic: n("new_quotes_vic"),
    newQuotesQld: n("new_quotes_qld"),
    newQuotesOther: n("new_quotes_other"),
    quotesContact: n("quotes_contact"),
    quotesContactVic: n("quotes_contact_vic"),
    quotesContactQld: n("quotes_contact_qld"),
    quotesContactOther: n("quotes_contact_other"),
    callbacks: n("callbacks"),
    callbacksVic: n("callbacks_vic"),
    callbacksQld: n("callbacks_qld"),
    callbacksOther: n("callbacks_other"),
    newHotlist: n("new_hotlist"),
    newHotlistVic: n("new_hotlist_vic"),
    newHotlistQld: n("new_hotlist_qld"),
    newHotlistOther: n("new_hotlist_other"),
    soldVic: n("sold_vic"),
    soldQld: n("sold_qld"),
    soldStreams: n("sold_streams"),
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function boldNum(n) {
  return `<b>${escapeHtml(String(n))}</b>`;
}

function metricRows(vic, qld, other) {
  const rows = [
    ["VIC", VIC_BLUE, vic],
    ["QLD", QLD_MAROON, qld],
  ];
  if (Number(other) > 0) rows.push(["OTHER", "#888888", other]);
  return rows;
}

function vicQldCountTable(vic, qld, other) {
  const rows = metricRows(vic, qld, other);
  const w = SOLD_LABEL_WIDTH_PX;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px 0;">
${rows
  .map(
    ([label, hex, n], i) => `  <tr>
    <td width="${w}" bgcolor="${hex}" align="center" style="width:${w}px;background-color:${hex};color:#000000;text-align:center;padding:4px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.3;"><font color="#000000">${escapeHtml(label)}</font></td>
    <td style="padding-left:16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#333333;line-height:1.3;">${boldNum(n)}</td>
  </tr>${i < rows.length - 1 ? `\n  <tr><td colspan="2" height="6" style="height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>` : ""}`
  )
  .join("\n")}
</table>`;
}

function soldCountTable(figures) {
  const rows = [
    ["VIC", VIC_BLUE, figures.soldVic],
    ["QLD", QLD_MAROON, figures.soldQld],
    ["STREAMS", STREAM_GREEN, figures.soldStreams],
  ];
  const w = SOLD_LABEL_WIDTH_PX;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
${rows
  .map(
    ([label, hex, n], i) => `  <tr>
    <td width="${w}" bgcolor="${hex}" align="center" style="width:${w}px;background-color:${hex};color:#000000;text-align:center;padding:4px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.3;"><font color="#000000">${escapeHtml(label)}</font></td>
    <td style="padding-left:16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#333333;line-height:1.3;">${boldNum(n)} new projects</td>
  </tr>${i < rows.length - 1 ? `\n  <tr><td colspan="2" height="8" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>` : ""}`
  )
  .join("\n")}
</table>`;
}

function htmlEmailShell(inner) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;">
      ${inner}
    </td>
  </tr>
</table>
</body>
</html>`;
}

function textRegionLines(vic, qld, other) {
  const lines = [`  VIC     ${vic}`, `  QLD     ${qld}`];
  if (Number(other) > 0) lines.push(`  OTHER   ${other}`);
  return lines;
}

function buildRoundupContent(figures, weekDates) {
  const sat = formatAuDate(weekDates.saturday);
  const fri = formatAuDate(weekDates.friday);
  const pad = (label) => label.padEnd(8, " ");
  const text = [
    "Hi Team,",
    "",
    "Please see below the weekly sales round up for the week",
    `Sat ${sat} to Friday ${fri}`,
    "",
    "This week we had;",
    "",
    `${figures.newQuotes} new quotes added`,
    ...textRegionLines(figures.newQuotesVic, figures.newQuotesQld, figures.newQuotesOther),
    `${figures.quotesContact} quotes make contact`,
    ...textRegionLines(figures.quotesContactVic, figures.quotesContactQld, figures.quotesContactOther),
    `${figures.callbacks} call backs`,
    ...textRegionLines(figures.callbacksVic, figures.callbacksQld, figures.callbacksOther),
    `${figures.newHotlist} new Hotlist entries`,
    ...textRegionLines(figures.newHotlistVic, figures.newHotlistQld, figures.newHotlistOther),
    `${pad("VIC")}${figures.soldVic} new projects`,
    `${pad("QLD")}${figures.soldQld} new projects`,
    `${pad("STREAMS")}${figures.soldStreams} new projects`,
    "",
    "Strength and Honour !",
    "",
    "Powered by SGF Central",
  ].join("\n");
  const intro = [
    "Hi Team,",
    "",
    "Please see below the weekly sales round up for the week",
    `Sat ${escapeHtml(sat)} to Friday ${escapeHtml(fri)}`,
    "",
    "This week we had;",
  ]
    .map((line) => (line === "" ? "&nbsp;" : line))
    .join("<br>\r\n");
  const metrics = [
    `${boldNum(figures.newQuotes)} new quotes added`,
    vicQldCountTable(figures.newQuotesVic, figures.newQuotesQld, figures.newQuotesOther),
    `${boldNum(figures.quotesContact)} quotes make contact`,
    vicQldCountTable(figures.quotesContactVic, figures.quotesContactQld, figures.quotesContactOther),
    `${boldNum(figures.callbacks)} call backs`,
    vicQldCountTable(figures.callbacksVic, figures.callbacksQld, figures.callbacksOther),
    `${boldNum(figures.newHotlist)} new Hotlist entries`,
    vicQldCountTable(figures.newHotlistVic, figures.newHotlistQld, figures.newHotlistOther),
  ].join("<br>\r\n");
  const inner = `${intro}<br>\r\n&nbsp;<br>\r\n${metrics}<br>\r\n<img src="cid:sgf-sold" width="200" alt="SOLD" style="display:block;width:200px;height:auto;border:0;outline:none;text-decoration:none;" /><br>\r\n${soldCountTable(figures)}<br>\r\n&nbsp;<br>\r\nStrength and Honour !<br>\r\n&nbsp;<br>\r\nPowered by SGF Central`;
  return { text, html: htmlEmailShell(inner) };
}

async function loadSoldImageAttachment() {
  const content = await sharp(SOLD_IMAGE_PATH).resize({ width: 200 }).png().toBuffer();
  return {
    filename: "sold.png",
    content,
    cid: "sgf-sold",
    contentType: "image/png",
    contentDisposition: "inline",
  };
}

async function sendRoundupEmail(helpers, { from, text, html, attachments }) {
  const creds = await helpers.getSmtpCredentialsForFromAddress(from);
  const smtpUser = creds?.smtpUser;
  const smtpPass = creds?.smtpPass;
  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP not configured for weekly roundup From address");
  }
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: String(from || "").trim() || smtpUser,
    to: TO_ADDRESS,
    subject: SUBJECT,
    text: String(text || "").replace(/\n/g, "\r\n"),
    html,
    attachments: Array.isArray(attachments) ? attachments : [],
  });
}

async function getPeriodStart(pool, now) {
  const r = await pool.query(
    `SELECT weekly_roundup_sent_on, weekly_roundup_period_end FROM settings WHERE id = 1`
  );
  const sentOn = r.rows[0]?.weekly_roundup_sent_on
    ? String(r.rows[0].weekly_roundup_sent_on).slice(0, 10)
    : "";
  const prev = r.rows[0]?.weekly_roundup_period_end;
  if (sentOn && prev) {
    const d = prev instanceof Date ? prev : new Date(prev);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return previousFriday3pm(now);
}

async function markRoundupSent(pool, { melbourneDate, periodEnd, markFriday }) {
  if (markFriday) {
    await pool.query(
      `UPDATE settings
       SET weekly_roundup_sent_on = $1, weekly_roundup_period_end = $2, updated_at = NOW()
       WHERE id = 1`,
      [melbourneDate, periodEnd]
    );
  } else {
    await pool.query(
      `UPDATE settings
       SET weekly_roundup_period_end = $1, updated_at = NOW()
       WHERE id = 1`,
      [periodEnd]
    );
  }
}

async function sendWeeklyRoundup(pool, helpers, { markFriday = false, skipMark = false } = {}) {
  const now = new Date();
  const clock = melbourneParts(now);
  const week = reportingWeekPeriod(now);
  const periodStart = week.start;
  const periodEnd = now.getTime() < week.endExclusive.getTime() ? now : week.endExclusive;
  const figures = await collectWeeklyFigures(pool, periodStart, periodEnd);
  const from = await helpers.getDefaultSystemSmtpFrom(pool);
  if (!from) throw new Error("No SMTP From address for weekly roundup");
  const { text, html } = buildRoundupContent(figures, reportingWeekDates(now));
  const attachments = [];
  try {
    attachments.push(await loadSoldImageAttachment());
  } catch (e) {
    console.error("[weekly-roundup] sold image:", e.message || e);
  }
  await sendRoundupEmail(helpers, { from, text, html, attachments });
  if (!skipMark) {
    await markRoundupSent(pool, {
      melbourneDate: clock.date,
      periodEnd: now,
      markFriday,
    });
  }
  console.log(
    `[weekly-roundup] sent to ${TO_ADDRESS}: quotes=${figures.newQuotes} (VIC ${figures.newQuotesVic}/QLD ${figures.newQuotesQld}) contact=${figures.quotesContact} (VIC ${figures.quotesContactVic}/QLD ${figures.quotesContactQld}) callbacks=${figures.callbacks} (VIC ${figures.callbacksVic}/QLD ${figures.callbacksQld}) hotlist=${figures.newHotlist} (VIC ${figures.newHotlistVic}/QLD ${figures.newHotlistQld}) sold vic=${figures.soldVic} qld=${figures.soldQld} streams=${figures.soldStreams}`
  );
  return figures;
}

async function runWeeklyRoundupTick(pool, helpers) {
  await ensureRoundupColumns(pool);
  const clock = melbourneParts();
  const sentOnRes = await pool.query(`SELECT weekly_roundup_sent_on FROM settings WHERE id = 1`);
  const sentOn = sentOnRes.rows[0]?.weekly_roundup_sent_on
    ? String(sentOnRes.rows[0].weekly_roundup_sent_on).slice(0, 10)
    : "";
  const fridayWindow =
    clock.weekdayIndex === FRIDAY_INDEX && clock.minutesOfDay >= SEND_HOUR * 60;
  const alreadyThisFriday = sentOn === clock.date;

  if (fridayWindow && !alreadyThisFriday) {
    await sendWeeklyRoundup(pool, helpers, { markFriday: true });
    return { sent: "weekly" };
  }

  return { sent: null };
}

function startWeeklyRoundupScheduler(helpers) {
  if (!helpers?.getPool) return;
  let running = false;
  let lastFailAt = 0;
  const tick = async () => {
    if (running) return;
    const pool = helpers.getPool();
    if (!pool) return;
    if (lastFailAt && Date.now() - lastFailAt < FAIL_BACKOFF_MS) return;
    running = true;
    try {
      await runWeeklyRoundupTick(pool, helpers);
      lastFailAt = 0;
    } catch (e) {
      lastFailAt = Date.now();
      console.error("[weekly-roundup] tick error:", e.message || e);
    } finally {
      running = false;
    }
  };
  setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
}

module.exports = {
  startWeeklyRoundupScheduler,
  runWeeklyRoundupTick,
  sendWeeklyRoundup,
  collectWeeklyFigures,
  getPeriodStart,
  reportingWeekDates,
  reportingWeekPeriod,
  lastCompletedReportingWeekPeriod,
};
