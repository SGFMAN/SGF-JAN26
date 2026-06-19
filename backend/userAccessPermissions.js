const ACCESS_AREAS = [
  { key: "fade", label: "Fade" },
  { key: "admin", label: "Admin" },
  { key: "managers", label: "Managers" },
  { key: "sales", label: "Sales" },
];

const ACCESS_AREA_KEYS = new Set(ACCESS_AREAS.map((area) => area.key));

async function ensureUserAccessPermissionsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_access_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_area TEXT NOT NULL,
      granted BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, access_area)
    );
  `);
}

function buildAccessPermissionsMatrix(userRows, grantRows) {
  const matrix = {};
  for (const user of userRows) {
    matrix[user.id] = {};
    for (const area of ACCESS_AREAS) {
      matrix[user.id][area.key] = false;
    }
  }
  for (const row of grantRows) {
    const userId = row.user_id;
    const area = row.access_area;
    if (matrix[userId] && ACCESS_AREA_KEYS.has(area)) {
      matrix[userId][area] = row.granted === true;
    }
  }
  return matrix;
}

async function userHasAccessGrant(pool, userId, accessArea) {
  if (!pool) return false;
  const id = Number(userId);
  if (!Number.isFinite(id) || !ACCESS_AREA_KEYS.has(accessArea)) {
    return false;
  }
  const result = await pool.query(
    `SELECT granted FROM user_access_permissions WHERE user_id = $1 AND access_area = $2`,
    [id, accessArea]
  );
  return result.rows.length > 0 && result.rows[0].granted === true;
}

module.exports = {
  ACCESS_AREAS,
  ACCESS_AREA_KEYS,
  ensureUserAccessPermissionsTable,
  buildAccessPermissionsMatrix,
  userHasAccessGrant,
};
