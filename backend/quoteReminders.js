/**
 * Quote list reminders: send configured templates after quote_added_at + delay.
 * To = projects.email only. No CC, no client-contact fallback, no extra addresses.
 */

const nodemailer = require("nodemailer");
const { parseReminderSettingsColumn, QUOTE_REMINDER_COUNT } = require("./reminderSettings");

const SENT_COLUMNS = [
  "quote_reminder_1_sent_at",
  "quote_reminder_2_sent_at",
  "quote_reminder_3_sent_at",
];
const TICK_MS = 20 * 1000;
const MAX_SENDS_PER_REMINDER_PER_TICK = 10;
const SINGLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function quoteListEmailOnly(raw) {
  const email = String(raw || "").trim();
  if (!email || email.includes(",") || email.includes(";") || /\s/.test(email)) return "";
  if (!SINGLE_EMAIL_RE.test(email)) return "";
  return email;
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
    "{ClientName}": quote?.client_name || quote?.name || "",
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

async function processOneReminder(pool, helpers, reminder, index, delayUnit) {
  if (!reminder?.enabled) return;
  const templateName = String(reminder.templateName || "").trim();
  if (!templateName) return;
  const delay = Number(reminder.delay);
  if (!Number.isFinite(delay) || delay < 1) return;

  const template = await loadTemplateByName(pool, templateName);
  if (!template) {
    console.warn(`[quote-reminders] template "${templateName}" not found; skipping reminder ${index + 1}`);
    return;
  }

  const sentCol = SENT_COLUMNS[index];
  const dueSql = `SELECT id, email, client_name, suburb, street, state, phone, quote_added_at
     FROM projects
     WHERE status = 'Quote'
       AND quote_active IS TRUE
       AND quote_added_at IS NOT NULL
       AND ${sentCol} IS NULL
       AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
       AND quote_added_at <= NOW() - ${
         delayUnit === "days"
           ? "make_interval(days => $1::int)"
           : delayUnit === "minutes"
             ? "make_interval(mins => $1::int)"
             : "make_interval(hours => $1::int)"
       }
     ORDER BY quote_added_at ASC, id ASC
     LIMIT $2`;
  const due = await pool.query(dueSql, [delay, MAX_SENDS_PER_REMINDER_PER_TICK]);

  for (const row of due.rows) {
    const to = quoteListEmailOnly(row.email);
    if (!to) continue;

    const claimed = await pool.query(
      `UPDATE projects
       SET ${sentCol} = NOW(), updated_at = NOW()
       WHERE id = $1
         AND status = 'Quote'
         AND quote_active IS TRUE
         AND ${sentCol} IS NULL
       RETURNING id`,
      [row.id]
    );
    if (!claimed.rows.length) continue;

    const quote = { ...row, email: to, name: row.client_name || "" };
    try {
      const from = String(template.from_address || "").trim();
      await sendQuoteReminderEmail(helpers, {
        to,
        from,
        subject: replaceQuoteReminderTokens(template.subject || "", quote),
        htmlBody: replaceQuoteReminderTokens(template.body || "", quote),
      });
      console.log(`[quote-reminders] reminder ${index + 1} sent to ${to} (project ${row.id})`);
    } catch (e) {
      await pool.query(
        `UPDATE projects SET ${sentCol} = NULL, updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      console.error(
        `[quote-reminders] reminder ${index + 1} failed for project ${row.id}:`,
        e.message || e
      );
    }
  }
}

async function runQuoteReminderTick(pool, helpers) {
  if (!pool) return;
  const settings = await loadReminderSettings(pool);
  const reminders = settings?.quotes?.reminders || [];
  const delayUnit =
    settings?.delayUnit === "days" || settings?.delayUnit === "minutes"
      ? settings.delayUnit
      : "hours";
  for (let i = 0; i < QUOTE_REMINDER_COUNT; i += 1) {
    await processOneReminder(pool, helpers, reminders[i], i, delayUnit);
  }
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

module.exports = {
  startQuoteReminderScheduler,
  runQuoteReminderTick,
};
