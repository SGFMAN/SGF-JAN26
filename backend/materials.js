/**
 * Simple materials catalogue for Colour Settings → Materials tab.
 * Used by Colours → External → Cladding - Material.
 */

async function ensureMaterialsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS materials_name_lower_uidx
    ON materials (LOWER(TRIM(name)))
  `);
}

function normalizeMaterialName(raw) {
  const name = String(raw || "").trim();
  if (!name) return null;
  if (name.length > 120) return null;
  return name;
}

async function listMaterials(pool) {
  const r = await pool.query(
    `SELECT id, name, sort_order, created_at, updated_at
     FROM materials
     ORDER BY sort_order ASC, LOWER(name) ASC, id ASC`
  );
  return r.rows;
}

async function createMaterial(pool, rawName) {
  const name = normalizeMaterialName(rawName);
  if (!name) return { error: "Name is required", status: 400 };
  try {
    const maxSort = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM materials`);
    const sortOrder = Number(maxSort.rows[0]?.m || 0) + 1;
    const r = await pool.query(
      `INSERT INTO materials (name, sort_order)
       VALUES ($1, $2)
       RETURNING id, name, sort_order, created_at, updated_at`,
      [name, sortOrder]
    );
    return { material: r.rows[0] };
  } catch (e) {
    if (e && e.code === "23505") {
      return { error: "A material with that name already exists", status: 409 };
    }
    throw e;
  }
}

async function updateMaterial(pool, id, rawName) {
  const name = normalizeMaterialName(rawName);
  if (!name) return { error: "Name is required", status: 400 };
  try {
    const r = await pool.query(
      `UPDATE materials
       SET name = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, sort_order, created_at, updated_at`,
      [id, name]
    );
    if (!r.rows.length) return { notFound: true };
    return { material: r.rows[0] };
  } catch (e) {
    if (e && e.code === "23505") {
      return { error: "A material with that name already exists", status: 409 };
    }
    throw e;
  }
}

async function deleteMaterial(pool, id) {
  const r = await pool.query(`DELETE FROM materials WHERE id = $1 RETURNING id`, [id]);
  if (!r.rows.length) return { notFound: true };
  return { deleted: r.rows[0].id };
}

module.exports = {
  ensureMaterialsTable,
  listMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
};
