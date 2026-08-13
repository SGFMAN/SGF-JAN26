/**
 * Sales quotes list for the “New” page.
 * Separate from projects and hotlist — not shown elsewhere.
 */

async function ensureQuotesTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      suburb TEXT NOT NULL DEFAULT '',
      street TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      contacted BOOLEAN NOT NULL DEFAULT FALSE,
      contacted_email BOOLEAN NOT NULL DEFAULT FALSE,
      contacted_phone BOOLEAN NOT NULL DEFAULT FALSE,
      contacted_visit BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function asBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeQuoteInput(body = {}) {
  const contacted = asBool(body.contacted);
  return {
    suburb: String(body.suburb ?? "").trim(),
    street: String(body.street ?? "").trim(),
    name: String(body.name ?? "").trim(),
    email: String(body.email ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    contacted,
    contacted_email: contacted ? asBool(body.contacted_email) : false,
    contacted_phone: contacted ? asBool(body.contacted_phone) : false,
    contacted_visit: contacted ? asBool(body.contacted_visit) : false,
  };
}

const QUOTE_SELECT =
  "id, suburb, street, name, email, phone, contacted, contacted_email, contacted_phone, contacted_visit, created_at, updated_at";

async function listQuotes(pool) {
  const r = await pool.query(
    `SELECT ${QUOTE_SELECT}
     FROM quotes
     ORDER BY updated_at DESC, id DESC`
  );
  return r.rows;
}

async function createQuote(pool, body) {
  const q = normalizeQuoteInput(body);
  const r = await pool.query(
    `INSERT INTO quotes (
       suburb, street, name, email, phone,
       contacted, contacted_email, contacted_phone, contacted_visit
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${QUOTE_SELECT}`,
    [
      q.suburb,
      q.street,
      q.name,
      q.email,
      q.phone,
      q.contacted,
      q.contacted_email,
      q.contacted_phone,
      q.contacted_visit,
    ]
  );
  return r.rows[0];
}

async function updateQuote(pool, id, body) {
  const q = normalizeQuoteInput(body);
  const r = await pool.query(
    `UPDATE quotes SET
       suburb = $2,
       street = $3,
       name = $4,
       email = $5,
       phone = $6,
       contacted = $7,
       contacted_email = $8,
       contacted_phone = $9,
       contacted_visit = $10,
       updated_at = NOW()
     WHERE id = $1
     RETURNING ${QUOTE_SELECT}`,
    [
      id,
      q.suburb,
      q.street,
      q.name,
      q.email,
      q.phone,
      q.contacted,
      q.contacted_email,
      q.contacted_phone,
      q.contacted_visit,
    ]
  );
  if (!r.rows.length) return { notFound: true };
  return { quote: r.rows[0] };
}

async function deleteQuote(pool, id) {
  const r = await pool.query(`DELETE FROM quotes WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows.length) return { notFound: true };
  return { deleted: r.rows[0].id };
}

module.exports = {
  ensureQuotesTable,
  listQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
};
