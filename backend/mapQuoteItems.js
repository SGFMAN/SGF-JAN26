function normalizeItem(raw, index) {
  const id = String(raw?.id || "").trim();
  const label = String(raw?.label ?? "").trim();
  if (!id) return null;
  return {
    id,
    label,
    checked: raw?.checked === true,
    sortOrder: Number.isFinite(Number(raw?.sortOrder)) ? Number(raw.sortOrder) : index,
  };
}

function rowToItem(row) {
  return {
    id: row.id,
    label: row.label || "",
    checked: row.checked === true,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function validateItemsInput(items) {
  if (!Array.isArray(items)) {
    return { error: "items must be an array" };
  }
  const normalized = [];
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const item = normalizeItem(items[i], i);
    if (!item) return { error: `items[${i}] requires a non-empty id` };
    if (seen.has(item.id)) return { error: `duplicate id: ${item.id}` };
    seen.add(item.id);
    normalized.push(item);
  }
  return { items: normalized };
}

async function listQuoteItems(pool) {
  const r = await pool.query(
    `SELECT id, label, checked, sort_order
     FROM map_quote_items
     ORDER BY sort_order ASC, label ASC, id ASC`
  );
  return r.rows.map(rowToItem);
}

async function saveQuoteItems(pool, items) {
  const parsed = validateItemsInput(items);
  if (parsed.error) return { error: parsed.error, status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM map_quote_items");
    for (let i = 0; i < parsed.items.length; i += 1) {
      const item = parsed.items[i];
      await client.query(
        `INSERT INTO map_quote_items (id, label, checked, sort_order, updated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [item.id, item.label, item.checked, i]
      );
    }
    await client.query("COMMIT");
    return { items: await listQuoteItems(pool) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  listQuoteItems,
  saveQuoteItems,
};
