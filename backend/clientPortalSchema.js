/**
 * Client Portal schema (v2.1).
 * Always-on ensure helper — runs even when schema_version is already current.
 */

async function ensureClientPortalTables(pool) {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_accounts (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS client_accounts_email_lower_key
      ON client_accounts (LOWER(TRIM(email)));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_project_memberships (
      id SERIAL PRIMARY KEY,
      client_account_id INTEGER NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (client_account_id, project_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_client_memberships_client
      ON client_project_memberships (client_account_id)
      WHERE active = TRUE;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_client_memberships_project
      ON client_project_memberships (project_id)
      WHERE active = TRUE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_sessions (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      client_account_id INTEGER NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_client_sessions_account
      ON client_sessions (client_account_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_invitations (
      id SERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      client_account_id INTEGER NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'invite',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_client_invitations_account
      ON client_invitations (client_account_id, created_at DESC);
  `);
}

module.exports = {
  ensureClientPortalTables,
};
