/**
 * Quote list reminders.
 * Reminder 1: 24 hours after quote_added_at, checked once per Melbourne hour.
 * Reminders 2–3 and Call Back List: Daily Check 1 only (relative to quote_added_at).
 */

const nodemailer = require("nodemailer");
const { ensureQuoteProjectColumns, getQuoteById } = require("./quotes");
const {
  parseReminderSettingsColumn,
  CALLBACK_LIST_INDEX,
  CALLBACK_LIST_TEMPLATE_NAME,
  sanitizeAuditHour,
} = require("./reminderSettings");
const { saveQuoteCallbackList } = require("./quoteCallbackLists");

const SENT_COLUMNS = [
  "quote_reminder_1_sent_at",
  "quote_reminder_2_sent_at",
  "quote_reminder_3_sent_at",
  "quote_reminder_4_sent_at",
];
const TICK_MS = 20 * 1000;
const MAX_SENDS_PER_REMINDER_PER_AUDIT = 500;
const MAX_CALLBACK_QUOTES_PER_AUDIT = 500;
const CALLBACK_TZ = "Australia/Melbourne";
const SINGLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function quoteListEmailOnly(raw) {
  const email = String(raw || "").trim();
  if (!email || email.includes(",") || email.includes(";") || /\s/.test(email)) return "";
  if (!SINGLE_EMAIL_RE.test(email)) return "";
  return email;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function delayIntervalSql(delayUnit) {
  if (delayUnit === "days") return "make_interval(days => $1::int)";
  if (delayUnit === "minutes") return "make_interval(mins => $1::int)";
  return "make_interval(hours => $1::int)";
}

function stateKey(row) {
  return String(row?.state || "").trim().toUpperCase();
}

function formatCallbackQuoteLine(row) {
  const bits = [
    String(row?.suburb || "").trim(),
    String(row?.street || "").trim(),
    String(row?.client_name || "").trim(),
    String(row?.email || "").trim(),
    String(row?.phone || "").trim(),
  ].filter(Boolean);
  return escapeHtml(bits.join(" ") || "—");
}

function callbackSectionHtml(title, rows) {
  const items = rows.length
    ? rows
        .map(
          (row) =>
            `<div style="margin:0 0 4px 0;">${formatCallbackQuoteLine(row)}</div>`
        )
        .join("")
    : `<div style="margin:0 0 4px 0;">None</div>`;
  return `<h3 style="margin:16px 0 8px 0;">${escapeHtml(title)}</h3>${items}`;
}

function appendCallbackList(bodyHtml, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const vic = list.filter((row) => stateKey(row) === "VIC");
  const qld = list.filter((row) => stateKey(row) === "QLD");
  const other = list.filter((row) => {
    const state = stateKey(row);
    return state !== "VIC" && state !== "QLD";
  });
  const sections = `${callbackSectionHtml("VIC", vic)}${callbackSectionHtml("QLD", qld)}${
    other.length ? callbackSectionHtml("Other", other) : ""
  }`;
  const listHtml = `<p><strong>Call Back List</strong></p>${sections}`;
  const body = String(bodyHtml || "").trim();
  if (!body) return listHtml;
  return `${body}${listHtml}`;
}

function firstNameOnly(raw) {
  const full = String(raw || "").trim();
  if (!full) return "";
  return full.split(/\s+/)[0] || full;
}

function replaceQuoteReminderTokens(text, quote) {
  if (!text) return "";
  const address = [quote?.street, quote?.suburb].filter(Boolean).join(", ");
  const map = {
    "{ProjectName}": address,
    "{Address}": address,
    "{Street}": quote?.street || "",
    "{Suburb}": quote?.suburb || "",
    "{State}": quote?.state || "",
    "{ClientName}": firstNameOnly(quote?.client_name || quote?.name || ""),
    "{Contact1}": quote?.email || "",
    "{Email}": quote?.email || "",
    "{Phone}": quote?.phone || "",
  };
  let out = String(text);
  for (const [k, v] of Object.entries(map)) {
    out = out.split(k).join(v || "");
  }
  return out;
}

function melbourneClock(now = new Date()) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: CALLBACK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

async function ensureDailyAuditColumn(pool) {
  await pool.query(`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS quote_callback_compiled_on DATE,
      ADD COLUMN IF NOT EXISTS quote_reminders_audited_on DATE,
      ADD COLUMN IF NOT EXISTS quote_reminder_1_hourly_on TEXT
  `);
}

function melbourneHourKey(clock) {
  const hour = Math.floor(clock.minutesOfDay / 60);
  return `${clock.date} ${String(hour).padStart(2, "0")}:00`;
}

async function getReminder1HourlyKey(pool) {
  const r = await pool.query(`SELECT quote_reminder_1_hourly_on FROM settings WHERE id = 1`);
  return String(r.rows[0]?.quote_reminder_1_hourly_on || "");
}

async function markReminder1HourlyDone(pool, hourKey) {
  await pool.query(
    `UPDATE settings SET quote_reminder_1_hourly_on = $1, updated_at = NOW() WHERE id = 1`,
    [hourKey]
  );
}

function dateText(raw) {
  return raw ? String(raw).slice(0, 10) : "";
}

async function getDailyAuditDate(pool) {
  const r = await pool.query(
    `SELECT quote_reminders_audited_on::text AS audited_on,
            quote_callback_compiled_on::text AS compiled_on
     FROM settings WHERE id = 1`
  );
  const row = r.rows[0] || {};
  return dateText(row.audited_on) || dateText(row.compiled_on);
}

async function markDailyAuditDone(pool, date) {
  await pool.query(
    `UPDATE settings
     SET quote_reminders_audited_on = $1::date,
         quote_callback_compiled_on = $1::date,
         updated_at = NOW()
     WHERE id = 1`,
    [date]
  );
}

async function loadReminderSettings(pool) {
  const r = await pool.query("SELECT reminders_json FROM settings WHERE id = 1");
  return parseReminderSettingsColumn(r.rows[0]?.reminders_json);
}

async function loadTemplateByName(pool, name) {
  const r = await pool.query(
    `SELECT name, from_address, subject, body
     FROM email_templates
     WHERE name = $1
     LIMIT 1`,
    [name]
  );
  return r.rows[0] || null;
}

function reminderFromAddress(settings, template) {
  const fromSettings = String(settings?.fromEmail || "").trim();
  if (fromSettings) return fromSettings;
  return String(template?.from_address || "").trim();
}

async function sendQuoteReminderEmail(helpers, { to, from, subject, htmlBody }) {
  const creds = await helpers.getSmtpCredentialsForFromAddress(from);
  const smtpUser = creds?.smtpUser;
  const smtpPass = creds?.smtpPass;
  if (!smtpUser || !smtpPass) {
    throw new Error("SMTP not configured for quote reminder From address");
  }
  const fromAddress = String(from || "").trim() || smtpUser;
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  });
  const rawBody = helpers.convertEmailBodyNewlinesToBr(htmlBody);
  let htmlEmailBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${rawBody}</body></html>`;
  const logoResult = await helpers.addLogoToEmail(htmlEmailBody, []);
  htmlEmailBody = logoResult.htmlBody;
  await transporter.sendMail({
    from: fromAddress,
    to,
    subject: subject || "",
    html: htmlEmailBody,
    attachments: logoResult.attachments || [],
  });
}

function delaySeconds(delay, delayUnit) {
  const n = Number(delay);
  if (!Number.isFinite(n) || n < 1) return null;
  if (delayUnit === "days") return n * 86400;
  if (delayUnit === "minutes") return n * 60;
  return n * 3600;
}

function highestDueClientReminder(row, reminders, delayUnit) {
  const ageSeconds = Number(row.age_seconds);
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return -1;
  const sent = [
    row.quote_reminder_1_sent_at,
    row.quote_reminder_2_sent_at,
    row.quote_reminder_3_sent_at,
  ];
  const alreadyStarted = sent.some(Boolean);
  let highestDue = -1;
  let nextSequentialDue = -1;
  // Reminders 2 and 3 only. Reminder 1 is sent by the hourly check.
  for (let i = 1; i < CALLBACK_LIST_INDEX; i += 1) {
    const reminder = reminders[i];
    if (!reminder?.enabled) continue;
    const seconds = delaySeconds(reminder.delay, delayUnit);
    if (seconds == null) continue;
    if (ageSeconds < seconds) continue;
    highestDue = i;
    if (nextSequentialDue < 0 && !sent[i]) nextSequentialDue = i;
  }
  // Untouched quotes jump to the latest due stage. Once any reminder has been
  // sent (including a manual reminder 1), continue in order instead of skipping.
  const chosen = alreadyStarted ? nextSequentialDue : highestDue;
  if (chosen < 0 || sent[chosen]) return -1;
  return chosen;
}

async function markClientRemindersThrough(pool, id, highest) {
  const sets = [];
  for (let i = 0; i <= highest; i += 1) {
    sets.push(`${SENT_COLUMNS[i]} = COALESCE(${SENT_COLUMNS[i]}, NOW())`);
  }
  const claimed = await pool.query(
    `UPDATE projects
     SET ${sets.join(", ")}, updated_at = NOW()
     WHERE id = $1
       AND status = 'Quote'
       AND quote_active IS TRUE
       AND quote_reminder_4_sent_at IS NULL
     RETURNING id`,
    [id]
  );
  return claimed.rows.length > 0;
}

async function restoreClientReminders(pool, id, highest, previous) {
  const sets = [];
  const params = [id];
  for (let i = 0; i <= highest; i += 1) {
    params.push(previous[SENT_COLUMNS[i]] || null);
    sets.push(`${SENT_COLUMNS[i]} = $${params.length}`);
  }
  await pool.query(
    `UPDATE projects SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
    params
  );
}

async function processClientReminders(pool, helpers, reminders, delayUnit, settings) {
  const enabled = (reminders || []).slice(1, CALLBACK_LIST_INDEX).some((row) => row?.enabled);
  if (!enabled) return { done: true };

  const templates = [];
  for (let i = 1; i < CALLBACK_LIST_INDEX; i += 1) {
    const reminder = reminders[i];
    if (!reminder?.enabled) {
      templates[i] = null;
      continue;
    }
    const templateName = String(reminder.templateName || "").trim();
    if (!templateName) {
      templates[i] = null;
      continue;
    }
    templates[i] = await loadTemplateByName(pool, templateName);
    if (!templates[i]) {
      console.warn(`[quote-reminders] template "${templateName}" not found; skipping reminder ${i + 1}`);
    }
  }

  const due = await pool.query(
    `SELECT id, email, client_name, suburb, street, state, phone, quote_added_at,
            quote_reminder_1_sent_at, quote_reminder_2_sent_at, quote_reminder_3_sent_at,
            EXTRACT(EPOCH FROM (NOW() - quote_added_at)) AS age_seconds
     FROM projects
     WHERE status = 'Quote'
       AND quote_active IS TRUE
       AND quote_added_at IS NOT NULL
       AND quote_reminder_4_sent_at IS NULL
       AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
     ORDER BY quote_added_at ASC, id ASC
     LIMIT $1`,
    [MAX_SENDS_PER_REMINDER_PER_AUDIT]
  );

  let processedDue = 0;
  for (const row of due.rows) {
    const highest = highestDueClientReminder(row, reminders, delayUnit);
    if (highest < 0) continue;
    processedDue += 1;
    const template = templates[highest];
    if (!template) continue;
    const to = quoteListEmailOnly(row.email);
    if (!to) continue;

    const claimed = await markClientRemindersThrough(pool, row.id, highest);
    if (!claimed) continue;

    const quote = { ...row, email: to, name: row.client_name || "" };
    try {
      const from = reminderFromAddress(settings, template);
      if (!from) {
        await restoreClientReminders(pool, row.id, highest, row);
        console.warn(`[quote-reminders] no From address for reminder ${highest + 1}; skipping project ${row.id}`);
        continue;
      }
      await sendQuoteReminderEmail(helpers, {
        to,
        from,
        subject: replaceQuoteReminderTokens(template.subject || "", quote),
        htmlBody: replaceQuoteReminderTokens(template.body || "", quote),
      });
      console.log(`[quote-reminders] reminder ${highest + 1} sent to ${to} (project ${row.id})`);
    } catch (e) {
      await restoreClientReminders(pool, row.id, highest, row);
      console.error(
        `[quote-reminders] reminder ${highest + 1} failed for project ${row.id}:`,
        e.message || e
      );
    }
  }

  return { done: due.rows.length < MAX_SENDS_PER_REMINDER_PER_AUDIT || processedDue === 0 };
}

async function processReminder1Hourly(pool, helpers, reminder, settings) {
  if (!reminder?.enabled) return { done: true, sent: 0 };
  const templateName = String(reminder.templateName || "").trim();
  if (!templateName) return { done: true, sent: 0 };
  const template = await loadTemplateByName(pool, templateName);
  if (!template) {
    console.warn(`[quote-reminders] template "${templateName}" not found; skipping reminder 1`);
    return { done: true, sent: 0 };
  }

  const due = await pool.query(
    `SELECT id, email, client_name, suburb, street, state, phone, quote_added_at,
            quote_reminder_1_sent_at
     FROM projects
     WHERE status = 'Quote'
       AND quote_active IS TRUE
       AND quote_added_at IS NOT NULL
       AND quote_reminder_1_sent_at IS NULL
       AND quote_reminder_4_sent_at IS NULL
       AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
       AND quote_added_at <= NOW() - interval '24 hours'
     ORDER BY quote_added_at ASC, id ASC
     LIMIT $1`,
    [MAX_SENDS_PER_REMINDER_PER_AUDIT]
  );

  let sent = 0;
  let processedDue = 0;
  for (const row of due.rows) {
    processedDue += 1;
    const to = quoteListEmailOnly(row.email);
    if (!to) continue;

    const claimed = await pool.query(
      `UPDATE projects
       SET quote_reminder_1_sent_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND status = 'Quote'
         AND quote_active IS TRUE
         AND quote_reminder_1_sent_at IS NULL
         AND quote_reminder_4_sent_at IS NULL
       RETURNING id`,
      [row.id]
    );
    if (!claimed.rows.length) continue;

    const quote = { ...row, email: to, name: row.client_name || "" };
    try {
      const from = reminderFromAddress(settings, template);
      if (!from) {
        await pool.query(
          `UPDATE projects SET quote_reminder_1_sent_at = NULL, updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        console.warn(`[quote-reminders] no From address for reminder 1; skipping project ${row.id}`);
        continue;
      }
      await sendQuoteReminderEmail(helpers, {
        to,
        from,
        subject: replaceQuoteReminderTokens(template.subject || "", quote),
        htmlBody: replaceQuoteReminderTokens(template.body || "", quote),
      });
      sent += 1;
      console.log(`[quote-reminders] reminder 1 sent to ${to} (project ${row.id})`);
    } catch (e) {
      await pool.query(
        `UPDATE projects SET quote_reminder_1_sent_at = NULL, updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      console.error(`[quote-reminders] reminder 1 failed for project ${row.id}:`, e.message || e);
    }
  }

  return { done: due.rows.length < MAX_SENDS_PER_REMINDER_PER_AUDIT || processedDue === 0, sent };
}

async function runReminder1HourlyIfNeeded(pool, helpers, reminder, settings, clock) {
  if (!reminder?.enabled) return;
  const hourKey = melbourneHourKey(clock);
  const already = await getReminder1HourlyKey(pool);
  if (already === hourKey) return;
  const result = await processReminder1Hourly(pool, helpers, reminder, settings);
  if (!result?.done) return;
  await markReminder1HourlyDone(pool, hourKey);
  console.log(
    `[quote-reminders] reminder 1 hourly ${hourKey}: ${
      result.sent ? `sent ${result.sent}` : "none due"
    }`
  );
}

async function processCallbackList(pool, helpers, reminder, delayUnit, settings) {
  if (!reminder?.enabled) return { ok: true };
  const delay = Number(reminder.delay);
  if (!Number.isFinite(delay) || delay < 1) return { ok: true };

  const to = quoteListEmailOnly(reminder.toEmail);
  if (!to) {
    console.warn("[quote-reminders] Call Back List is enabled but no valid To address is set; skipping");
    return { ok: false };
  }

  const templateName = String(reminder.templateName || "").trim() || CALLBACK_LIST_TEMPLATE_NAME;
  const template = await loadTemplateByName(pool, templateName);
  if (!template) {
    console.warn(
      `[quote-reminders] template "${templateName}" not found; skipping Call Back List`
    );
    return { ok: false };
  }

  const dueSql = `SELECT id, email, client_name, suburb, street, state, phone, quote_added_at
     FROM projects
     WHERE status = 'Quote'
       AND quote_active IS TRUE
       AND quote_added_at IS NOT NULL
       AND quote_reminder_4_sent_at IS NULL
       AND COALESCE(quote_contact, FALSE) IS NOT TRUE
       AND quote_added_at <= NOW() - ${delayIntervalSql(delayUnit)}
     ORDER BY quote_added_at ASC, id ASC
     LIMIT $2`;
  const due = await pool.query(dueSql, [delay, MAX_CALLBACK_QUOTES_PER_AUDIT]);
  if (!due.rows.length) {
    console.log("[quote-reminders] Call Back List compiled (no quotes due)");
    return { ok: true };
  }

  const ids = due.rows.map((row) => row.id);
  const claimed = await pool.query(
    `UPDATE projects
     SET quote_reminder_4_sent_at = NOW(), updated_at = NOW()
     WHERE id = ANY($1::int[])
       AND status = 'Quote'
       AND quote_active IS TRUE
       AND quote_reminder_4_sent_at IS NULL
       AND COALESCE(quote_contact, FALSE) IS NOT TRUE
     RETURNING id, email, client_name, suburb, street, state, phone, quote_added_at`,
    [ids]
  );
  if (!claimed.rows.length) return { ok: true };

  const byId = new Map(claimed.rows.map((row) => [row.id, row]));
  const claimedRows = ids.map((id) => byId.get(id)).filter(Boolean);

  try {
    const from = reminderFromAddress(settings, template) || to;
    await sendQuoteReminderEmail(helpers, {
      to,
      from,
      subject: String(template.subject || "").trim() || templateName,
      htmlBody: appendCallbackList(template.body || "", claimedRows),
    });
    console.log(
      `[quote-reminders] Call Back List sent to ${to} (${claimedRows.length} quote${claimedRows.length === 1 ? "" : "s"})`
    );
    try {
      await saveQuoteCallbackList(pool, { toEmail: to, rows: claimedRows });
    } catch (saveErr) {
      console.error(
        "[quote-reminders] failed to store Call Back List snapshot:",
        saveErr.message || saveErr
      );
    }
    return { ok: true };
  } catch (e) {
    await pool.query(
      `UPDATE projects SET quote_reminder_4_sent_at = NULL, updated_at = NOW() WHERE id = ANY($1::int[])`,
      [claimedRows.map((row) => row.id)]
    );
    console.error("[quote-reminders] Call Back List failed:", e.message || e);
    return { ok: false };
  }
}

async function runQuoteReminderTick(pool, helpers) {
  if (!pool) return;
  await ensureQuoteProjectColumns(pool);
  await ensureDailyAuditColumn(pool);

  const settings = await loadReminderSettings(pool);
  const reminders = settings?.quotes?.reminders || [];
  const delayUnit =
    settings?.delayUnit === "days" || settings?.delayUnit === "minutes"
      ? settings.delayUnit
      : "hours";
  const clock = melbourneClock();

  await runReminder1HourlyIfNeeded(pool, helpers, reminders[0], settings, clock);

  const auditHour = sanitizeAuditHour(settings?.auditHour);
  if (clock.minutesOfDay < auditHour * 60) return;
  const alreadyAudited = await getDailyAuditDate(pool);
  if (alreadyAudited === clock.date) return;

  const client = await processClientReminders(pool, helpers, reminders, delayUnit, settings);
  if (!client?.done) return;
  const callback = await processCallbackList(
    pool,
    helpers,
    reminders[CALLBACK_LIST_INDEX],
    delayUnit,
    settings
  );
  if (!callback?.ok) return;

  await markDailyAuditDone(pool, clock.date);
  console.log(`[quote-reminders] daily check 1 complete for ${clock.date} at ${auditHour}:00`);
}

function startQuoteReminderScheduler(helpers) {
  if (!helpers?.getPool) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    const pool = helpers.getPool();
    if (!pool) return;
    running = true;
    try {
      await runQuoteReminderTick(pool, helpers);
    } catch (e) {
      console.error("[quote-reminders] tick error:", e.message || e);
    } finally {
      running = false;
    }
  };
  setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();
}

async function previewQuoteReminder1(pool, id) {
  await ensureQuoteProjectColumns(pool);
  const r = await pool.query(
    `SELECT id, email, client_name, suburb, street, state, phone,
            quote_reminder_1_sent_at, quote_reminder_4_sent_at
     FROM projects
     WHERE id = $1 AND status = 'Quote'`,
    [id]
  );
  if (!r.rows.length) return { notFound: true };
  const row = r.rows[0];
  if (row.quote_reminder_1_sent_at) return { alreadySent: true };
  if (row.quote_reminder_4_sent_at) return { finished: true };

  const settings = await loadReminderSettings(pool);
  const reminder = settings?.quotes?.reminders?.[0];
  const templateName = String(reminder?.templateName || "").trim();
  if (!templateName) return { error: "Reminder 1 has no email template set." };
  const template = await loadTemplateByName(pool, templateName);
  if (!template) return { error: `Template "${templateName}" not found.` };

  const to = quoteListEmailOnly(row.email);
  if (!to) return { error: "This quote has no valid email address." };
  const from = reminderFromAddress(settings, template);
  if (!from) return { error: "Choose a From address on the Quotes reminders page." };

  const quote = { ...row, email: to, name: row.client_name || "" };
  return {
    to,
    from,
    subject: replaceQuoteReminderTokens(template.subject || "", quote),
    body: replaceQuoteReminderTokens(template.body || "", quote),
  };
}

async function sendQuoteReminder1Manual(pool, helpers, id, payload = {}) {
  const preview = await previewQuoteReminder1(pool, id);
  if (preview.notFound || preview.alreadySent || preview.finished || preview.error) return preview;

  const to = quoteListEmailOnly(payload.to) || preview.to;
  const from = String(payload.from != null ? payload.from : preview.from).trim();
  const subject = payload.subject != null ? String(payload.subject) : preview.subject;
  const htmlBody = payload.body != null ? String(payload.body) : preview.body;
  if (!to) return { error: "No valid To address." };
  if (!from) return { error: "No From address." };

  const claimed = await pool.query(
    `UPDATE projects
     SET quote_reminder_1_sent_at = NOW(), updated_at = NOW()
     WHERE id = $1
       AND status = 'Quote'
       AND quote_reminder_1_sent_at IS NULL
       AND quote_reminder_4_sent_at IS NULL
     RETURNING id`,
    [id]
  );
  if (!claimed.rows.length) return { alreadySent: true };

  try {
    await sendQuoteReminderEmail(helpers, { to, from, subject, htmlBody });
  } catch (e) {
    await pool.query(
      `UPDATE projects SET quote_reminder_1_sent_at = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    throw e;
  }

  const quote = await getQuoteById(pool, id);
  return { quote };
}

module.exports = {
  startQuoteReminderScheduler,
  runQuoteReminderTick,
  previewQuoteReminder1,
  sendQuoteReminder1Manual,
};
