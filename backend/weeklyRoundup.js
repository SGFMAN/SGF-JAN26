/**
 * Tuesday 7am Melbourne weekly roundup email to Ben.
 * Counts Monday 5pm → Monday 5pm (the week that ended yesterday).
 */

const nodemailer = require("nodemailer");
const path = require("path");
const sharp = require("sharp");

const TZ = "Australia/Melbourne";
const TO_ADDRESS = "ben@superiorgrannyflats.com.au";
const SUBJECT = "Weekly Sales Round Up";
const MONDAY_INDEX = 1;
const SEND_HOUR = 7;
const PERIOD_HOUR = 17;
const TICK_MS = 20 * 1000;
const FAIL_BACKOFF_MS = 2 * 60 * 1000;
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
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
const VIC_BLUE = "#4D93D9";
const QLD_MAROON = "#D54358";
const STREAM_GREEN = "#92D050";
const SOLD_IMAGE_PATH = path.join(__dirname, "..", "frontend", "src", "images", "sold.webp");
const SOLD_LABEL_WIDTH_PX = 120;
let roundupSchemaReady = false;

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

function mostRecentCompletedMondayYmd(now = new Date()) {
  const clock = melbourneParts(now);
  const daysSinceMonday = (clock.weekdayIndex - MONDAY_INDEX + 7) % 7;
  const thisMonday = addDaysYmd(clock.date, -daysSinceMonday);
  const thisMonday5pm = melbourneLocalToUtc(thisMonday, PERIOD_HOUR, 0);
  if (now.getTime() >= thisMonday5pm.getTime()) return thisMonday;
  return addDaysYmd(thisMonday, -7);
}

function formatAuDate(ymd) {
  const [y, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

function reportingWeekDates(now = new Date()) {
  const endMonday = mostRecentCompletedMondayYmd(now);
  const startMonday = addDaysYmd(endMonday, -7);
  return { startMonday, endMonday };
}

function reportingWeekPeriod(now = new Date()) {
  const { startMonday, endMonday } = reportingWeekDates(now);
  return {
    startMonday,
    endMonday,
    start: melbourneLocalToUtc(startMonday, PERIOD_HOUR, 0),
    endExclusive: melbourneLocalToUtc(endMonday, PERIOD_HOUR, 0),
  };
}

function roundupSendAt(period) {
  return melbourneLocalToUtc(addDaysYmd(period.endMonday, 1), SEND_HOUR, 0);
}

/** Calendar month of the reported week, through the same Monday 5pm cutoff.
 *  If the week started in the previous month, those sales are included too.
 */
function soldMonthWindow(week) {
  const month = parseInt(String(week.endMonday).slice(5, 7), 10);
  const monthStartYmd = `${String(week.endMonday).slice(0, 4)}-${String(month).padStart(2, "0")}-01`;
  const monthStart = melbourneLocalToUtc(monthStartYmd, 0, 0);
  return {
    start: new Date(Math.min(monthStart.getTime(), week.start.getTime())),
    endExclusive: week.endExclusive,
    label: MONTHS_LONG[month - 1] || monthStartYmd,
  };
}

/** Previous completed Mon 5pm–Mon 5pm week. */
function lastCompletedReportingWeekPeriod(now = new Date()) {
  const current = reportingWeekPeriod(now);
  return reportingWeekPeriod(new Date(current.start.getTime() - 1000));
}

async function ensureRoundupColumns(pool) {
  if (roundupSchemaReady) return;

  const existing = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE (table_schema = 'public' AND table_name = 'projects' AND column_name IN (
        'quote_contact_at', 'quote_reminder_4_sent_at', 'hotlist_added_at', 'sold_at'
      ))
      OR (table_schema = 'public' AND table_name = 'settings' AND column_name IN (
        'weekly_roundup_sent_on', 'weekly_roundup_period_end'
      ))
  `);
  const have = new Set(existing.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const needed = [
    "projects.quote_contact_at",
    "projects.quote_reminder_4_sent_at",
    "projects.hotlist_added_at",
    "projects.sold_at",
    "settings.weekly_roundup_sent_on",
    "settings.weekly_roundup_period_end",
  ];
  if (needed.every((key) => have.has(key))) {
    roundupSchemaReady = true;
    return;
  }

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
  roundupSchemaReady = true;
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

function formatSoldAddress(suburb, street) {
  const sub = String(suburb || "").trim();
  const st = String(street || "").trim();
  if (sub && st) return `${sub.toUpperCase()} ${st}`;
  return sub.toUpperCase() || st || "(no address)";
}

/** Sold jobs in the same VIC / QLD / streams buckets as the roundup counts. */
async function collectSoldAddresses(pool, periodStart, periodEnd) {
  const r = await pool.query(
    `SELECT suburb, street, stream
     FROM projects
     WHERE NULLIF(sold_at::text, '')::timestamptz >= $1
       AND NULLIF(sold_at::text, '')::timestamptz < $2
     ORDER BY UPPER(TRIM(COALESCE(suburb, ''))), UPPER(TRIM(COALESCE(street, '')))`,
    [periodStart, periodEnd]
  );
  const groups = { vic: [], qld: [], streams: [] };
  for (const row of r.rows) {
    const stream = String(row.stream || "").trim();
    const address = formatSoldAddress(row.suburb, row.street);
    if (stream === "SGF - VIC") groups.vic.push(address);
    else if (stream === "SGF - QLD") groups.qld.push(address);
    else groups.streams.push(address);
  }
  return groups;
}

function shortDayMonth(ymd) {
  const [, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  if (!m || !d) return String(ymd);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** This reporting week plus the three weeks before it, oldest first. */
function quoteHistoryWeeks(period) {
  const weeks = [];
  for (let i = 3; i >= 0; i -= 1) {
    const endMonday = addDaysYmd(period.endMonday, -7 * i);
    const startMonday = addDaysYmd(endMonday, -7);
    weeks.push({
      startMonday,
      endMonday,
      label: shortDayMonth(endMonday),
      start: melbourneLocalToUtc(startMonday, PERIOD_HOUR, 0),
      endExclusive: melbourneLocalToUtc(endMonday, PERIOD_HOUR, 0),
    });
  }
  return weeks;
}

async function collectQuoteWeekCounts(pool, weeks) {
  const oldest = weeks[0].start;
  const newest = weeks[weeks.length - 1].endExclusive;
  const r = await pool.query(
    `SELECT ${REGION_SQL} AS region,
            NULLIF(quote_added_at::text, '')::timestamptz AS added
     FROM projects
     WHERE NULLIF(quote_added_at::text, '')::timestamptz >= $1
       AND NULLIF(quote_added_at::text, '')::timestamptz < $2`,
    [oldest, newest]
  );
  return weeks.map((week) => {
    let vic = 0;
    let qld = 0;
    const startMs = week.start.getTime();
    const endMs = week.endExclusive.getTime();
    for (const row of r.rows) {
      const added = row.added instanceof Date ? row.added : new Date(row.added);
      const ms = added.getTime();
      if (!Number.isFinite(ms) || ms < startMs || ms >= endMs) continue;
      if (row.region === "VIC") vic += 1;
      else if (row.region === "QLD") qld += 1;
    }
    return { ...week, vic, qld };
  });
}

function quotesChartSvg(weeks) {
  const width = 680;
  const height = 340;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.vic, w.qld)));
  const plotLeft = 36;
  const plotRight = width - 16;
  const plotTop = 78;
  const plotBottom = 248;
  const plotH = plotBottom - plotTop;
  const groupW = (plotRight - plotLeft) / weeks.length;
  const barW = 34;
  const barGap = 8;
  const bars = [];
  const labels = [];
  weeks.forEach((week, i) => {
    const cx = plotLeft + groupW * i + groupW / 2;
    const pair = [
      { n: week.vic, color: VIC_BLUE, dx: -(barW + barGap / 2) },
      { n: week.qld, color: QLD_MAROON, dx: barGap / 2 },
    ];
    for (const bar of pair) {
      const h = Math.round((bar.n / max) * plotH);
      const x = Math.round(cx + bar.dx);
      const y = plotBottom - h;
      bars.push(
        `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, bar.n > 0 ? 2 : 0)}" fill="${bar.color}"/>`
      );
      bars.push(
        `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#333333">${bar.n}</text>`
      );
    }
    labels.push(
      `<text x="${cx}" y="${plotBottom + 24}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#333333">${escapeHtml(week.label)}</text>`
    );
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="16" y="28" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#333333">New quotes</text>
  <text x="16" y="48" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#666666">This week and the previous 3 weeks, week ending Monday</text>
  <rect x="${width - 168}" y="14" width="14" height="14" fill="${VIC_BLUE}"/>
  <text x="${width - 148}" y="26" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#333333">VIC</text>
  <rect x="${width - 96}" y="14" width="14" height="14" fill="${QLD_MAROON}"/>
  <text x="${width - 76}" y="26" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#333333">QLD</text>
  <line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" stroke="#cccccc" stroke-width="1"/>
  ${bars.join("\n  ")}
  ${labels.join("\n  ")}
</svg>`;
}

async function loadQuotesChartAttachment(weeks) {
  const content = await sharp(Buffer.from(quotesChartSvg(weeks))).png().toBuffer();
  return {
    filename: "quotes-weeks.png",
    content,
    cid: "sgf-quotes-chart",
    contentType: "image/png",
    contentDisposition: "inline",
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

function vicQldCountTable(vic, qld, other, labelWidth = SOLD_LABEL_WIDTH_PX) {
  const rows = metricRows(vic, qld, other);
  const w = labelWidth;
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

function metricColumn(headingHtml, vic, qld, other) {
  return `<td valign="top" width="33%" style="width:33%;vertical-align:top;padding:0 16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#333333;line-height:1.4;">
  ${headingHtml}<br>
  ${vicQldCountTable(vic, qld, other, 72)}
</td>`;
}

function contactCallbackHotlistRow(figures) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:4px 0 8px 0;">
  <tr>
    ${metricColumn(`${boldNum(figures.quotesContact)} quotes make contact`, figures.quotesContactVic, figures.quotesContactQld, figures.quotesContactOther)}
    ${metricColumn(`${boldNum(figures.callbacks)} call backs`, figures.callbacksVic, figures.callbacksQld, figures.callbacksOther)}
    ${metricColumn(`${boldNum(figures.newHotlist)} new Hotlist entries`, figures.newHotlistVic, figures.newHotlistQld, figures.newHotlistOther)}
  </tr>
</table>`;
}

function soldAddressHtml(addresses) {
  if (!addresses?.length) return "";
  return addresses
    .map(
      (address) =>
        `<div style="margin-top:2px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#333333;line-height:1.35;">${escapeHtml(address)}</div>`
    )
    .join("");
}

function soldBucketTable(counts, addresses, unitLabel) {
  const rows = [
    ["VIC", VIC_BLUE, counts.vic, addresses?.vic],
    ["QLD", QLD_MAROON, counts.qld, addresses?.qld],
    ["STREAMS", STREAM_GREEN, counts.streams, addresses?.streams],
  ];
  const w = 100;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
${rows
  .map(
    ([label, hex, n, list], i) => `  <tr>
    <td width="${w}" bgcolor="${hex}" align="center" valign="top" style="width:${w}px;background-color:${hex};color:#000000;text-align:center;padding:4px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.3;"><font color="#000000">${escapeHtml(label)}</font></td>
    <td valign="top" style="padding-left:12px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#333333;line-height:1.3;">${boldNum(n)} ${escapeHtml(unitLabel)}${soldAddressHtml(list)}</td>
  </tr>${i < rows.length - 1 ? `\n  <tr><td colspan="2" height="8" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>` : ""}`
  )
  .join("\n")}
</table>`;
}

function soldColumn(heading, counts, addresses, unitLabel) {
  return `<td valign="top" width="50%" style="width:50%;vertical-align:top;padding:0 18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#333333;line-height:1.4;">
  <b>${escapeHtml(heading)}</b><br>
  ${soldBucketTable(counts, addresses, unitLabel)}
</td>`;
}

function soldCountTable(figures) {
  const weekCounts = {
    vic: figures.soldVic,
    qld: figures.soldQld,
    streams: figures.soldStreams,
  };
  const monthAddresses = figures.soldMonthAddresses || {};
  const monthCounts = {
    vic: monthAddresses.vic?.length || 0,
    qld: monthAddresses.qld?.length || 0,
    streams: monthAddresses.streams?.length || 0,
  };
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
  <tr>
    ${soldColumn("This week", weekCounts, figures.soldAddresses, "new projects")}
    ${soldColumn(figures.soldMonthLabel || "This month", monthCounts, null, "projects")}
  </tr>
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

function formatWeekSpan(weekDates) {
  const start = formatAuDate(weekDates.startMonday);
  const end = formatAuDate(weekDates.endMonday);
  return `Mon ${start} 5pm to Mon ${end} 5pm`;
}

function soldTextLines(label, count, addresses, unitLabel) {
  const lines = [`${label.padEnd(8, " ")}${count} ${unitLabel}`];
  for (const address of addresses || []) lines.push(`        ${address}`);
  return lines;
}

function soldTextBlock(heading, counts, addresses, unitLabel) {
  return [
    heading,
    ...soldTextLines("VIC", counts.vic, addresses?.vic, unitLabel),
    ...soldTextLines("QLD", counts.qld, addresses?.qld, unitLabel),
    ...soldTextLines("STREAMS", counts.streams, addresses?.streams, unitLabel),
  ];
}

function quoteWeekTextLines(weeks) {
  if (!weeks?.length) return [];
  const lines = ["New quotes by week (VIC / QLD), week ending Monday"];
  weeks.forEach((week, i) => {
    const mark = i === weeks.length - 1 ? " (this week)" : "";
    lines.push(`  ${week.label.padEnd(8, " ")} ${week.vic} / ${week.qld}${mark}`);
  });
  return lines;
}

function buildRoundupContent(figures, weekDates) {
  const span = formatWeekSpan(weekDates);
  const pad = (label) => label.padEnd(8, " ");
  const text = [
    "Hi Team,",
    "",
    "Please see below the weekly sales round up for the week",
    span,
    "",
    "This week we had;",
    "",
    `${figures.newQuotes} new quotes added`,
    ...textRegionLines(figures.newQuotesVic, figures.newQuotesQld, figures.newQuotesOther),
    ...quoteWeekTextLines(figures.quoteWeeks),
    `${figures.quotesContact} quotes make contact`,
    ...textRegionLines(figures.quotesContactVic, figures.quotesContactQld, figures.quotesContactOther),
    `${figures.callbacks} call backs`,
    ...textRegionLines(figures.callbacksVic, figures.callbacksQld, figures.callbacksOther),
    `${figures.newHotlist} new Hotlist entries`,
    ...textRegionLines(figures.newHotlistVic, figures.newHotlistQld, figures.newHotlistOther),
    ...soldTextBlock(
      "This week",
      { vic: figures.soldVic, qld: figures.soldQld, streams: figures.soldStreams },
      figures.soldAddresses,
      "new projects"
    ),
    ...soldTextBlock(
      figures.soldMonthLabel || "This month",
      {
        vic: figures.soldMonthAddresses?.vic?.length || 0,
        qld: figures.soldMonthAddresses?.qld?.length || 0,
        streams: figures.soldMonthAddresses?.streams?.length || 0,
      },
      null,
      "projects"
    ),
    "",
    "Strength and Honour !",
    "",
    "Powered by SGF Central",
  ].join("\n");
  const intro = [
    "Hi Team,",
    "",
    "Please see below the weekly sales round up for the week",
    escapeHtml(span),
    "",
    "This week we had;",
  ]
    .map((line) => (line === "" ? "&nbsp;" : line))
    .join("<br>\r\n");
  const metrics = [
    `${boldNum(figures.newQuotes)} new quotes added`,
    vicQldCountTable(figures.newQuotesVic, figures.newQuotesQld, figures.newQuotesOther),
    figures.includeQuoteChart
      ? `<img src="cid:sgf-quotes-chart" width="640" alt="New quotes, this week and the previous 3 weeks" style="display:block;width:640px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;margin:8px 0 12px 0;" />`
      : null,
    contactCallbackHotlistRow(figures),
  ]
    .filter(Boolean)
    .join("<br>\r\n");
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

async function sendRoundupEmail(helpers, { from, text, html, attachments, subject }) {
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
    requireTLS: !secure,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: String(from || "").trim() || smtpUser,
    to: TO_ADDRESS,
    subject: subject || SUBJECT,
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
  return reportingWeekPeriod(now).endExclusive;
}

async function markRoundupSent(pool, { melbourneDate, periodEnd, markSent }) {
  if (markSent) {
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

async function sendWeeklyRoundup(pool, helpers, { markSent = false, markFriday = false, skipMark = false, subject = SUBJECT } = {}) {
  const now = new Date();
  const week = reportingWeekPeriod(now);
  const sendDay = addDaysYmd(week.endMonday, 1);
  const figures = await collectWeeklyFigures(pool, week.start, week.endExclusive);
  figures.soldAddresses = await collectSoldAddresses(pool, week.start, week.endExclusive);
  const soldMonth = soldMonthWindow(week);
  figures.soldMonthLabel = soldMonth.label;
  figures.soldMonthAddresses = await collectSoldAddresses(pool, soldMonth.start, soldMonth.endExclusive);
  const quoteWeeks = quoteHistoryWeeks(week);
  figures.quoteWeeks = await collectQuoteWeekCounts(pool, quoteWeeks);
  const from = await helpers.getDefaultSystemSmtpFrom(pool);
  if (!from) throw new Error("No SMTP From address for weekly roundup");
  const attachments = [];
  try {
    attachments.push(await loadSoldImageAttachment());
  } catch (e) {
    console.error("[weekly-roundup] sold image:", e.message || e);
  }
  try {
    attachments.push(await loadQuotesChartAttachment(figures.quoteWeeks));
    figures.includeQuoteChart = true;
  } catch (e) {
    console.error("[weekly-roundup] quotes chart:", e.message || e);
  }
  const { text, html } = buildRoundupContent(figures, week);
  await sendRoundupEmail(helpers, { from, text, html, attachments, subject });
  if (!skipMark) {
    await markRoundupSent(pool, {
      melbourneDate: sendDay,
      periodEnd: week.endExclusive,
      markSent: markSent || markFriday,
    });
  }
  console.log(
    `[weekly-roundup] sent to ${TO_ADDRESS}: quotes=${figures.newQuotes} (VIC ${figures.newQuotesVic}/QLD ${figures.newQuotesQld}) contact=${figures.quotesContact} (VIC ${figures.quotesContactVic}/QLD ${figures.quotesContactQld}) callbacks=${figures.callbacks} (VIC ${figures.callbacksVic}/QLD ${figures.callbacksQld}) hotlist=${figures.newHotlist} (VIC ${figures.newHotlistVic}/QLD ${figures.newHotlistQld}) sold vic=${figures.soldVic} qld=${figures.soldQld} streams=${figures.soldStreams} month=${figures.soldMonthLabel} vic=${figures.soldMonthAddresses?.vic?.length || 0} qld=${figures.soldMonthAddresses?.qld?.length || 0} streams=${figures.soldMonthAddresses?.streams?.length || 0}`
  );
  return figures;
}

async function runWeeklyRoundupTick(pool, helpers) {
  try {
    await ensureRoundupColumns(pool);
  } catch (e) {
    console.error("[weekly-roundup] schema:", e.message || e);
  }
  const now = new Date();
  const week = reportingWeekPeriod(now);
  const sendDay = addDaysYmd(week.endMonday, 1);
  const sendAt = roundupSendAt(week);
  const sentOnRes = await pool.query(`SELECT weekly_roundup_sent_on FROM settings WHERE id = 1`);
  const sentOn = sentOnRes.rows[0]?.weekly_roundup_sent_on
    ? String(sentOnRes.rows[0].weekly_roundup_sent_on).slice(0, 10)
    : "";

  if (now.getTime() < sendAt.getTime()) return { sent: null };
  if (sentOn === sendDay) return { sent: null };

  await sendWeeklyRoundup(pool, helpers, { markSent: true });
  return { sent: "weekly" };
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
