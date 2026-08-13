/**
 * Quotes = projects with status "Quote" (same pattern as Hotlist).
 * Quote-only contacted flags live on the project row so fields survive upgrades.
 */

const QUOTE_STATUS = "Quote";

const QUOTE_SELECT = `id, access_token, name, status, suburb, street, state, client_name, email, phone,
  quote_contacted, quote_contacted_email, quote_contacted_phone, quote_contacted_visit,
  quote_added_at, updated_at`;

function normalizeAddressHyphensForFilesystem(s) {
  if (s == null) return "";
  return String(s).replace(/[\u2013\u2014\u2212]/g, "-");
}

async function ensureQuoteProjectColumns(pool) {
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_contacted BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_contacted_email BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_contacted_phone BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_contacted_visit BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS quote_added_at TIMESTAMPTZ`);
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

function asBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeAddressPart(raw) {
  return normalizeAddressHyphensForFilesystem(String(raw ?? "").trim()).replace(/[/\\]/g, "_");
}

function rowToQuoteApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    access_token: row.access_token,
    status: row.status,
    name: row.client_name || "",
    client_name: row.client_name || "",
    suburb: row.suburb || "",
    street: row.street || "",
    state: row.state || "",
    email: row.email || "",
    phone: row.phone || "",
    contacted: Boolean(row.quote_contacted),
    contacted_email: Boolean(row.quote_contacted_email),
    contacted_phone: Boolean(row.quote_contacted_phone),
    contacted_visit: Boolean(row.quote_contacted_visit),
    created_at: row.quote_added_at || row.updated_at || null,
    updated_at: row.updated_at,
  };
}

function normalizeQuoteInput(body = {}) {
  const contacted = asBool(body.contacted);
  const street = normalizeAddressPart(body.street);
  const suburb = normalizeAddressPart(body.suburb);
  const clientName = String(body.name ?? body.client_name ?? "").trim();
  const projectName =
    normalizeAddressHyphensForFilesystem([street, suburb].filter(Boolean).join(", ").trim()) ||
    "New Quote";
  return {
    projectName,
    street: street || null,
    suburb: suburb || null,
    state: String(body.state ?? "").trim().toUpperCase() || null,
    client_name: clientName || null,
    email: String(body.email ?? "").trim() || null,
    phone: String(body.phone ?? "").trim() || null,
    contacted,
    contacted_email: contacted ? asBool(body.contacted_email) : false,
    contacted_phone: contacted ? asBool(body.contacted_phone) : false,
    contacted_visit: contacted ? asBool(body.contacted_visit) : false,
  };
}

async function listQuotes(pool) {
  await ensureQuoteProjectColumns(pool);
  const r = await pool.query(
    `SELECT ${QUOTE_SELECT}
     FROM projects
     WHERE status = $1
     ORDER BY COALESCE(quote_added_at, updated_at) DESC, id DESC`,
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
       quote_contacted, quote_contacted_email, quote_contacted_phone, quote_contacted_visit,
       quote_added_at, project_log,
       contract_status, supporting_documents_status, water_authority, water_declaration_status,
       planning_status, energy_report_status, footing_certification_status, building_permit_status, septic_permit,
       planning_jf_planning_property_report, planning_jf_title, planning_jf_covenant,
       planning_jf_section_173_agreement, planning_jf_plan_of_subdivision,
       planning_jf_ebyda_stormwater, planning_jf_byda_sewer_main, planning_jf_internal_sewer_plan,
       planning_jf_sewer_main_size_depth_offset, planning_jf_legal_point_discharge, planning_jf_property_info_report
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $6, $7, $8, 'true', null, null,
       $10, $11, $12, $13,
       NOW(), $14,
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
      q.contacted,
      q.contacted_email,
      q.contacted_phone,
      q.contacted_visit,
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
       quote_contacted = $9,
       quote_contacted_email = $10,
       quote_contacted_phone = $11,
       quote_contacted_visit = $12,
       updated_at = NOW()
     WHERE id = $1 AND status = $13
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
      q.contacted,
      q.contacted_email,
      q.contacted_phone,
      q.contacted_visit,
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

module.exports = {
  QUOTE_STATUS,
  ensureQuotesTable,
  ensureQuoteProjectColumns,
  listQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
};
