/**
 * Snapshots of Call Back List emails, shown on Quotes → Call Back Lists.
 */

let tableReady = null;

async function ensureQuoteCallbackListsTable(pool) {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quote_callback_lists (
        id SERIAL PRIMARY KEY,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        to_email TEXT NOT NULL DEFAULT '',
        items JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS quote_callback_lists_sent_at_idx
      ON quote_callback_lists (sent_at ASC, id ASC)
    `);
  })().catch((e) => {
    tableReady = null;
    throw e;
  });
  return tableReady;
}

function parseItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function snapshotCallbackItems(rows) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const projectId = Number(row?.id);
    return {
      key: Number.isFinite(projectId) ? String(projectId) : `row-${index}`,
      projectId: Number.isFinite(projectId) ? projectId : null,
      suburb: String(row?.suburb || "").trim(),
      street: String(row?.street || "").trim(),
      client_name: String(row?.client_name || "").trim(),
      email: String(row?.email || "").trim(),
      phone: String(row?.phone || "").trim(),
      state: String(row?.state || "").trim(),
      called: false,
    };
  });
}

function normalizeStoredItem(raw, index) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const projectId = Number(src.projectId);
  const key = String(src.key || (Number.isFinite(projectId) ? projectId : `row-${index}`)).slice(0, 80);
  return {
    key,
    projectId: Number.isFinite(projectId) ? projectId : null,
    suburb: String(src.suburb || "").trim(),
    street: String(src.street || "").trim(),
    client_name: String(src.client_name || "").trim(),
    email: String(src.email || "").trim(),
    phone: String(src.phone || "").trim(),
    state: String(src.state || "").trim(),
    called: Boolean(src.called),
  };
}

function rowToApi(row) {
  return {
    id: row.id,
    sent_at: row.sent_at,
    to_email: String(row.to_email || ""),
    items: parseItems(row.items).map((item, index) => normalizeStoredItem(item, index)),
  };
}

async function saveQuoteCallbackList(pool, { toEmail, rows, sentAt } = {}) {
  await ensureQuoteCallbackListsTable(pool);
  const items = snapshotCallbackItems(rows);
  if (!items.length) return null;
  const sent = sentAt ? new Date(sentAt) : new Date();
  const sentValue = Number.isNaN(sent.getTime()) ? new Date() : sent;
  const r = await pool.query(
    `INSERT INTO quote_callback_lists (sent_at, to_email, items)
     VALUES ($3::timestamptz, $1, $2::jsonb)
     RETURNING id, sent_at, to_email, items`,
    [String(toEmail || "").trim().slice(0, 200), JSON.stringify(items), sentValue.toISOString()]
  );
  const ids = items.map((item) => item.projectId).filter((id) => Number.isFinite(id));
  if (ids.length) {
    await pool.query(
      `UPDATE projects
       SET quote_reminder_4_sent_at = COALESCE(quote_reminder_4_sent_at, $2::timestamptz),
           updated_at = NOW()
       WHERE id = ANY($1::int[])
         AND status = 'Quote'`,
      [ids, sentValue.toISOString()]
    );
  }
  return rowToApi(r.rows[0]);
}

async function listQuoteCallbackLists(pool) {
  await ensureQuoteCallbackListsTable(pool);
  const r = await pool.query(
    `SELECT id, sent_at, to_email, items
     FROM quote_callback_lists
     ORDER BY sent_at ASC, id ASC`
  );
  return r.rows.map(rowToApi);
}

async function setQuoteCallbackItemCalled(pool, listId, itemKey, called) {
  await ensureQuoteCallbackListsTable(pool);
  const id = Number(listId);
  if (!Number.isFinite(id)) return { notFound: true };
  const key = String(itemKey || "");
  if (!key) return { notFound: true };

  const r = await pool.query(
    `SELECT id, sent_at, to_email, items FROM quote_callback_lists WHERE id = $1`,
    [id]
  );
  if (!r.rows.length) return { notFound: true };

  const items = parseItems(r.rows[0].items).map((item, index) => normalizeStoredItem(item, index));
  let found = false;
  const next = items.map((item) => {
    if (item.key !== key) return item;
    found = true;
    return { ...item, called: Boolean(called) };
  });
  if (!found) return { notFound: true };

  const updated = await pool.query(
    `UPDATE quote_callback_lists
     SET items = $2::jsonb
     WHERE id = $1
     RETURNING id, sent_at, to_email, items`,
    [id, JSON.stringify(next)]
  );
  return { list: rowToApi(updated.rows[0]) };
}

async function deleteQuoteCallbackList(pool, listId) {
  await ensureQuoteCallbackListsTable(pool);
  const id = Number(listId);
  if (!Number.isFinite(id)) return { notFound: true };
  const r = await pool.query(
    `DELETE FROM quote_callback_lists WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!r.rows.length) return { notFound: true };
  return { deleted: r.rows[0].id };
}

module.exports = {
  ensureQuoteCallbackListsTable,
  saveQuoteCallbackList,
  listQuoteCallbackLists,
  setQuoteCallbackItemCalled,
  deleteQuoteCallbackList,
};
