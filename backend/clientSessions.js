/**
 * Client Portal sessions (v2.1) — separate from staff sessions.
 * Tokens are stored hashed in PostgreSQL (persistent across restarts).
 */

const crypto = require("crypto");

const CLIENT_SESSION_COOKIE_NAME = "sgf_client_session";
const CLIENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function getClientSessionTokenFromRequest(req) {
  return parseCookies(req)[CLIENT_SESSION_COOKIE_NAME] || null;
}

function clientSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CLIENT_SESSION_TTL_MS,
    path: "/",
  };
}

async function createClientSession(pool, clientAccountId) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + CLIENT_SESSION_TTL_MS);
  await pool.query(
    `INSERT INTO client_sessions (token_hash, client_account_id, expires_at, last_seen_at)
     VALUES ($1, $2, $3, NOW())`,
    [tokenHash, clientAccountId, expiresAt.toISOString()]
  );
  return { rawToken, expiresAt };
}

async function getClientSession(pool, rawToken) {
  if (!pool || !rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const r = await pool.query(
    `SELECT s.id, s.client_account_id, s.expires_at, a.email, a.name
     FROM client_sessions s
     JOIN client_accounts a ON a.id = s.client_account_id
     WHERE s.token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  const row = r.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query(`DELETE FROM client_sessions WHERE id = $1`, [row.id]);
    return null;
  }
  const newExpiry = new Date(Date.now() + CLIENT_SESSION_TTL_MS);
  await pool.query(
    `UPDATE client_sessions
     SET last_seen_at = NOW(), expires_at = $2
     WHERE id = $1`,
    [row.id, newExpiry.toISOString()]
  );
  return {
    sessionId: row.id,
    clientAccountId: row.client_account_id,
    email: row.email,
    name: row.name,
    expiresAt: newExpiry,
  };
}

async function destroyClientSession(pool, rawToken) {
  if (!pool || !rawToken) return;
  const tokenHash = hashToken(rawToken);
  await pool.query(`DELETE FROM client_sessions WHERE token_hash = $1`, [tokenHash]);
}

module.exports = {
  CLIENT_SESSION_COOKIE_NAME,
  CLIENT_SESSION_TTL_MS,
  hashToken,
  generateRawToken,
  getClientSessionTokenFromRequest,
  clientSessionCookieOptions,
  createClientSession,
  getClientSession,
  destroyClientSession,
};
