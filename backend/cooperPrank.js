/** Cooper Smith screen-flip prank — server decides who is affected. */

function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isCooperSmithName(name) {
  const normalized = normalizeName(name);
  if (!normalized) return false;
  if (normalized === "cooper smith") return true;
  return normalized.includes("cooper") && normalized.includes("smith");
}

async function isCooperSmithUserId(pool, userId) {
  const id = Number(userId);
  if (!pool || !Number.isFinite(id) || id <= 0) return false;

  const envId = Number(process.env.COOPER_PRANK_USER_ID);
  if (Number.isFinite(envId) && envId > 0 && id === envId) {
    return true;
  }

  const result = await pool.query(`SELECT name FROM users WHERE id = $1`, [id]);
  if (result.rows.length === 0) return false;
  return isCooperSmithName(result.rows[0].name);
}

module.exports = {
  isCooperSmithName,
  isCooperSmithUserId,
};
