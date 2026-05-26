const crypto = require("crypto");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateAccessToken() {
  return crypto.randomUUID();
}

function isLegacyNumericProjectId(param) {
  return /^\d+$/.test(String(param || "").trim());
}

function isProjectAccessToken(param) {
  return UUID_RE.test(String(param || "").trim());
}

async function ensureProjectAccessTokens(pool) {
  if (!pool) return;

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'access_token'
      ) THEN
        ALTER TABLE projects ADD COLUMN access_token TEXT;
      END IF;
    END $$;
  `);

  await pool.query(`
    UPDATE projects
    SET access_token = gen_random_uuid()::text
    WHERE access_token IS NULL OR TRIM(access_token) = ''
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'projects_access_token_key'
      ) THEN
        CREATE UNIQUE INDEX projects_access_token_key ON projects (access_token);
      END IF;
    END $$;
  `);

  try {
    await pool.query(`
      ALTER TABLE projects
      ALTER COLUMN access_token SET DEFAULT gen_random_uuid()::text
    `);
  } catch (e) {
    console.log("projects.access_token default:", e.message);
  }

  try {
    await pool.query(`
      ALTER TABLE projects
      ALTER COLUMN access_token SET NOT NULL
    `);
  } catch (e) {
    console.log("projects.access_token NOT NULL:", e.message);
  }
}

async function resolveProjectIdFromAccessToken(pool, token) {
  if (!pool || !isProjectAccessToken(token)) return null;
  const r = await pool.query(
    "SELECT id FROM projects WHERE access_token = $1 LIMIT 1",
    [String(token).trim()]
  );
  return r.rows[0]?.id ?? null;
}

async function getProjectAccessTokenById(pool, projectId) {
  if (!pool) return null;
  const id = Number(projectId);
  if (!Number.isFinite(id)) return null;
  const r = await pool.query(
    "SELECT access_token FROM projects WHERE id = $1 LIMIT 1",
    [id]
  );
  return r.rows[0]?.access_token ?? null;
}

module.exports = {
  generateAccessToken,
  isLegacyNumericProjectId,
  isProjectAccessToken,
  ensureProjectAccessTokens,
  resolveProjectIdFromAccessToken,
  getProjectAccessTokenById,
};
