/**
 * Quotes = projects with status "Quote" (same pattern as Hotlist).
 * Quote-only contacted flags live on the project row so fields survive upgrades.
 */

const QUOTE_STATUS = "Quote";

const QUOTE_SELECT = `id, name, status, suburb, street, state, client_name, email, phone,
  quote_active, quote_contact, quote_added_at, quote_reminder_1_sent_at, quote_reminder_2_sent_at, quote_reminder_3_sent_at, quote_reminder_4_sent_at, updated_at`;

function normalizeAddressHyphensForFilesystem(s) {
  if (s == null) return "";
  return String(s).replace(/[\u2013\u2014\u2212]/g, "-");
}

let quoteColumnsReady = null;

async function ensureQuoteProjectColumns(pool) {
  if (quoteColumnsReady) return quoteColumnsReady;
  quoteColumnsReady = (async () => {
    await pool.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS quote_contacted BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS quote_contacted_email BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS quote_contacted_phone BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS quote_contacted_visit BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS quote_added_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS quote_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS quote_reminder_1_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS quote_reminder_2_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS quote_reminder_3_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS quote_reminder_4_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS quote_contact BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS projects_quotes_list_idx
      ON projects (quote_added_at DESC NULLS LAST, id DESC)
      WHERE status = 'Quote'
    `);
  })().catch((e) => {
    quoteColumnsReady = null;
    throw e;
  });
  return quoteColumnsReady;
}

/**
 * One-time: move rows from legacy `quotes` table into projects (status Quote).
 * Safe to call repeatedly — skips if legacy table missing or empty.
 */
async function migrateLegacyQuotesTable(pool) {
  await ensureQuoteProjectColumns(pool);
  const exists = await pool.query(`
    SELECT to_regclass('public.quotes') AS reg
  `);
  if (!exists.rows[0]?.reg) return;

  const legacy = await pool.query(`
    SELECT id, state, suburb, street, name, email, phone,
           contacted, contacted_email, contacted_phone, contacted_visit,
           created_at
    FROM quotes
    ORDER BY id ASC
  `);
  if (!legacy.rows.length) return;

  for (const row of legacy.rows) {
    const street = normalizeAddressHyphensForFilesystem(String(row.street || "").trim());
    const suburb = normalizeAddressHyphensForFilesystem(String(row.suburb || "").trim());
    const projectName =
      normalizeAddressHyphensForFilesystem([street, suburb].filter(Boolean).join(", ").trim()) ||
      "New Quote";
    const clientName = String(row.name || "").trim() || null;
    await pool.query(
      `INSERT INTO projects (
         name, status, suburb, street, state, client_name, email, phone,
         client1_name, client1_email, client1_phone, client1_active,
         quote_contacted, quote_contacted_email, quote_contacted_phone, quote_contacted_visit,
         quote_added_at, project_log,
         contract_status, supporting_documents_status, water_authority, water_declaration_status,
         planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit,
         planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant,
         planning_jf_section_173_agreement, planning_jf_plan_of_subdivision,
         planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan,
         planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $6, $7, $8, 'true',
         $9, $10, $11, $12,
         COALESCE($13, NOW()), $14,
         'Not Sent', 'Not Sent', 'Not Required', 'Not Sent',
         'Not Selected', 'Not Submitted', 'Not Submitted', 'Not Submitted', 'Not Required',
         'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done',
         'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done'
       )`,
      [
        projectName,
        QUOTE_STATUS,
        suburb || null,
        street || null,
        String(row.state || "").trim().toUpperCase() || null,
        clientName,
        String(row.email || "").trim() || null,
        String(row.phone || "").trim() || null,
        Boolean(row.contacted),
        Boolean(row.contacted_email),
        Boolean(row.contacted_phone),
        Boolean(row.contacted_visit),
        row.created_at || null,
        `${new Date().toISOString().replace("T", " ").substring(0, 19)} - Quote migrated from legacy quotes table`,
      ]
    );
  }

  await pool.query(`DROP TABLE IF EXISTS quotes`);
  console.log(`Migrated ${legacy.rows.length} legacy quote(s) into projects (status Quote)`);
}

async function ensureQuotesTable(pool) {
  await ensureQuoteProjectColumns(pool);
  try {
    await migrateLegacyQuotesTable(pool);
  } catch (e) {
    console.error("[quotes] legacy migrate:", e.message || e);
  }
}

function asBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return value === true || value === "true" || value === 1 || value === "1" || value === "yes" || value === "Y";
}

function parseQuoteAddedAt(raw) {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const utc = Date.UTC(1899, 11, 30) + raw * 86400000;
    return new Date(utc);
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let year = parseInt(m[3], 10);
  if (m[3].length <= 2) year += year < 50 ? 2000 : 1900;
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[1], 10);
  let hour = m[4] != null ? parseInt(m[4], 10) : 0;
  const minute = m[5] != null ? parseInt(m[5], 10) : 0;
  const second = m[6] != null ? parseInt(m[6], 10) : 0;
  const ampm = m[7] ? String(m[7]).toUpperCase() : "";
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const d = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeAddressPart(raw) {
  return normalizeAddressHyphensForFilesystem(String(raw ?? "").trim()).replace(/[/\\]/g, "_");
}

function rowToQuoteApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    name: row.client_name || "",
    client_name: row.client_name || "",
    suburb: row.suburb || "",
    street: row.street || "",
    state: row.state || "",
    email: row.email || "",
    phone: row.phone || "",
    active: row.quote_active !== false,
    contact: row.quote_contact === true,
    created_at: row.quote_added_at || row.updated_at || null,
    reminder_1_sent_at: row.quote_reminder_1_sent_at || null,
    reminder_2_sent_at: row.quote_reminder_2_sent_at || null,
    reminder_3_sent_at: row.quote_reminder_3_sent_at || null,
    reminder_4_sent_at: row.quote_reminder_4_sent_at || null,
    updated_at: row.updated_at,
  };
}

function normalizeQuoteInput(body = {}) {
  const street = normalizeAddressPart(body.street);
  const suburb = normalizeAddressPart(body.suburb);
  const clientName = String(body.name ?? body.client_name ?? "").trim();
  const projectName =
    normalizeAddressHyphensForFilesystem([street, suburb].filter(Boolean).join(", ").trim()) ||
    "New Quote";
  const addedAt = parseQuoteAddedAt(body.created_at ?? body.quote_added_at ?? body.date_added);
  return {
    projectName,
    street: street || null,
    suburb: suburb || null,
    state: String(body.state ?? "").trim().toUpperCase() || null,
    client_name: clientName || null,
    email: String(body.email ?? "").trim() || null,
    phone: String(body.phone ?? "").trim() || null,
    active: asBool(body.active, true),
    quote_added_at: addedAt,
  };
}

async function listQuotes(pool) {
  await ensureQuoteProjectColumns(pool);
  const r = await pool.query(
    `SELECT ${QUOTE_SELECT}
     FROM projects
     WHERE status = $1
     ORDER BY quote_added_at DESC NULLS LAST, id DESC`,
    [QUOTE_STATUS]
  );
  return r.rows.map(rowToQuoteApi);
}

async function createQuote(pool, body) {
  await ensureQuoteProjectColumns(pool);
  const q = normalizeQuoteInput(body);
  const now = new Date();
  const dateTimeStr = now.toISOString().replace("T", " ").substring(0, 19);
  const initialLogEntry = `${dateTimeStr} - Quote Created`;
  const projectDate = now.toISOString().split("T")[0];

  const r = await pool.query(
    `INSERT INTO projects (
       name, status, suburb, street, state, client_name, email, phone, year,
       client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active,
       quote_active, quote_added_at, project_log,
       contract_status, supporting_documents_status, water_authority, water_declaration_status,
       planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit,
       planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant,
       planning_jf_section_173_agreement, planning_jf_plan_of_subdivision,
       planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan,
       planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $6, $7, $8, 'true', null, null,
       TRUE, COALESCE($10, NOW()), $11,
       'Not Sent', 'Not Sent', 'Not Required', 'Not Sent',
       'Not Selected', 'Not Submitted', 'Not Submitted', 'Not Submitted', 'Not Required',
       'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done',
       'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done', 'Not Done'
     )
     RETURNING ${QUOTE_SELECT}`,
    [
      q.projectName,
      QUOTE_STATUS,
      q.suburb,
      q.street,
      q.state,
      q.client_name,
      q.email,
      q.phone,
      projectDate,
      q.quote_added_at,
      initialLogEntry,
    ]
  );
  return rowToQuoteApi(r.rows[0]);
}

async function updateQuote(pool, id, body) {
  await ensureQuoteProjectColumns(pool);
  const q = normalizeQuoteInput(body);
  const r = await pool.query(
    `UPDATE projects SET
       name = $2,
       suburb = $3,
       street = $4,
       state = $5,
       client_name = $6,
       email = $7,
       phone = $8,
       client1_name = $6,
       client1_email = $7,
       client1_phone = $8,
       quote_active = $9,
       updated_at = NOW()
     WHERE id = $1 AND status = $10
     RETURNING ${QUOTE_SELECT}`,
    [
      id,
      q.projectName,
      q.suburb,
      q.street,
      q.state,
      q.client_name,
      q.email,
      q.phone,
      q.active,
      QUOTE_STATUS,
    ]
  );
  if (!r.rows.length) return { notFound: true };
  return { quote: rowToQuoteApi(r.rows[0]) };
}

async function deleteQuote(pool, id) {
  const r = await pool.query(
    `DELETE FROM projects WHERE id = $1 AND status = $2 RETURNING id`,
    [id, QUOTE_STATUS]
  );
  if (!r.rows.length) return { notFound: true };
  return { deleted: r.rows[0].id };
}

/** Upgrade Quote → Hotlist (same project row; fields already shared). */
async function promoteQuoteToHotlist(pool, id) {
  const existing = await pool.query(
    `SELECT id, state, project_log FROM projects WHERE id = $1 AND status = $2`,
    [id, QUOTE_STATUS]
  );
  if (!existing.rows.length) return { notFound: true };

  const now = new Date();
  const dateTimeStr = now.toISOString().replace("T", " ").substring(0, 19);
  const project = existing.rows[0];
  const state = String(project.state || "").trim().toUpperCase();
  const stream =
    state === "VIC" ? "SGF - VIC" : state === "QLD" ? "SGF - QLD" : null;
  const logEntry = project.project_log
    ? `${project.project_log}\n${dateTimeStr} - Status changed from Quote to Hotlist`
    : `${dateTimeStr} - Status changed from Quote to Hotlist`;

  const r = await pool.query(
    `UPDATE projects
     SET status = $2, stream = $3, project_log = $4, updated_at = NOW()
     WHERE id = $1 AND status = $5
     RETURNING id, access_token, name, status, suburb, street, state, stream, client_name, email, phone, updated_at`,
    [id, "Hotlist", stream, logEntry, QUOTE_STATUS]
  );
  if (!r.rows.length) return { notFound: true };
  return { project: r.rows[0] };
}

async function updateQuoteActive(pool, id, active) {
  await ensureQuoteProjectColumns(pool);
  const r = await pool.query(
    `UPDATE projects
     SET quote_active = $2, updated_at = NOW()
     WHERE id = $1 AND status = $3
     RETURNING ${QUOTE_SELECT}`,
    [id, Boolean(active), QUOTE_STATUS]
  );
  if (!r.rows.length) return { notFound: true };
  return { quote: rowToQuoteApi(r.rows[0]) };
}

async function updateQuoteContact(pool, id, contact) {
  await ensureQuoteProjectColumns(pool);
  const r = await pool.query(
    `UPDATE projects
     SET quote_contact = $2, updated_at = NOW()
     WHERE id = $1 AND status = $3
     RETURNING ${QUOTE_SELECT}`,
    [id, Boolean(contact), QUOTE_STATUS]
  );
  if (!r.rows.length) return { notFound: true };
  return { quote: rowToQuoteApi(r.rows[0]) };
}

async function getQuoteById(pool, id) {
  await ensureQuoteProjectColumns(pool);
  const r = await pool.query(
    `SELECT ${QUOTE_SELECT} FROM projects WHERE id = $1 AND status = $2`,
    [id, QUOTE_STATUS]
  );
  if (!r.rows.length) return null;
  return rowToQuoteApi(r.rows[0]);
}

async function findExistingQuoteId(pool, street, suburb, state) {
  const r = await pool.query(
    `SELECT id FROM projects
     WHERE status = $1
       AND LOWER(BTRIM(COALESCE(street, ''))) = LOWER(BTRIM($2))
       AND LOWER(BTRIM(COALESCE(suburb, ''))) = LOWER(BTRIM($3))
       AND UPPER(BTRIM(COALESCE(state, ''))) = UPPER(BTRIM($4))
     LIMIT 1`,
    [QUOTE_STATUS, street || "", suburb || "", state || ""]
  );
  return r.rows[0]?.id || null;
}

module.exports = {
  QUOTE_STATUS,
  ensureQuotesTable,
  ensureQuoteProjectColumns,
  listQuotes,
  createQuote,
  updateQuote,
  updateQuoteActive,
  updateQuoteContact,
  deleteQuote,
  promoteQuoteToHotlist,
  getQuoteById,
  findExistingQuoteId,
  parseQuoteAddedAt,
};
