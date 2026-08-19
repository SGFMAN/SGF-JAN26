/**
 * Quote list reminders: send configured templates after quote_added_at + delay.
 * Reminders 1–3: To = projects.email only. No CC, no client-contact fallback, no extra addresses.
 * Reminder 4 (Call Back List): one batched email to the configured SMTP To address.
 */

const nodemailer = require("nodemailer");
const { ensureQuoteProjectColumns } = require("./quotes");
const {
  parseReminderSettingsColumn,
  CALLBACK_LIST_INDEX,
  CALLBACK_LIST_TEMPLATE_NAME,
} = require("./reminderSettings");

const SENT_COLUMNS = [
  "quote_reminder_1_sent_at",
  "quote_reminder_2_sent_at",
  "quote_reminder_3_sent_at",
  "quote_reminder_4_sent_at",
];
const TICK_MS = 20 * 1000;
const MAX_SENDS_PER_REMINDER_PER_TICK = 10;
const MAX_CALLBACK_QUOTES_PER_TICK = 500;
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

function formatQuoteAddedAt(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatCallbackQuoteLine(row) {
  const address = [row.street, row.suburb].filter(Boolean).join(", ") || "—";
  const bits = [
    address,
    row.client_name,
    row.email,
    row.phone,
    row.state,
    formatQuoteAddedAt(row.quote_added_at) ? `added ${formatQuoteAddedAt(row.quote_added_at)}` : "",
  ].filter((v) => v != null && String(v).trim() !== "");
  return bits.join(" — ");
}

function appendCallbackList(bodyHtml, rows) {
  const items = rows.map((row) => `<li>${escapeHtml(formatCallbackQuoteLine(row))}</li>`).join("");
  const list = `<p><strong>Call Back List</strong></p><ul>${items}</ul>`;
  const body = String(bodyHtml || "").trim();
  if (!body) return list;
  return `${body}${list}`;
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
  if (index === CALLBACK_LIST_INDEX) return;
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
       AND quote_reminder_4_sent_at IS NULL
       AND NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL
       AND quote_added_at <= NOW() - ${delayIntervalSql(delayUnit)}
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
         AND quote_reminder_4_sent_at IS NULL
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

async function processCallbackList(pool, helpers, reminder, delayUnit) {
  if (!reminder?.enabled) return;
  const delay = Number(reminder.delay);
  if (!Number.isFinite(delay) || delay < 1) return;
  const to = quoteListEmailOnly(reminder.toEmail);
  if (!to) {
    console.warn("[quote-reminders] Call Back List is enabled but no valid To address is set; skipping");
    return;
  }

  const template = await loadTemplateByName(pool, CALLBACK_LIST_TEMPLATE_NAME);
  if (!template) {
    console.warn(
      `[quote-reminders] template "${CALLBACK_LIST_TEMPLATE_NAME}" not found; skipping Call Back List`
    );
    return;
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
  const due = await pool.query(dueSql, [delay, MAX_CALLBACK_QUOTES_PER_TICK]);
  if (!due.rows.length) return;

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
  if (!claimed.rows.length) return;

  const byId = new Map(claimed.rows.map((row) => [row.id, row]));
  const claimedRows = ids.map((id) => byId.get(id)).filter(Boolean);

  try {
    const from = String(template.from_address || "").trim() || to;
    await sendQuoteReminderEmail(helpers, {
      to,
      from,
      subject: String(template.subject || "").trim() || CALLBACK_LIST_TEMPLATE_NAME,
      htmlBody: appendCallbackList(template.body || "", claimedRows),
    });
    console.log(
      `[quote-reminders] Call Back List sent to ${to} (${claimedRows.length} quote${claimedRows.length === 1 ? "" : "s"})`
    );
  } catch (e) {
    await pool.query(
      `UPDATE projects SET quote_reminder_4_sent_at = NULL, updated_at = NOW() WHERE id = ANY($1::int[])`,
      [claimedRows.map((row) => row.id)]
    );
    console.error("[quote-reminders] Call Back List failed:", e.message || e);
  }
}

async function runQuoteReminderTick(pool, helpers) {
  if (!pool) return;
  await ensureQuoteProjectColumns(pool);
  const settings = await loadReminderSettings(pool);
  const reminders = settings?.quotes?.reminders || [];
  const delayUnit =
    settings?.delayUnit === "days" || settings?.delayUnit === "minutes"
      ? settings.delayUnit
      : "hours";
  for (let i = 0; i < CALLBACK_LIST_INDEX; i += 1) {
    await processOneReminder(pool, helpers, reminders[i], i, delayUnit);
  }
  await processCallbackList(pool, helpers, reminders[CALLBACK_LIST_INDEX], delayUnit);
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
