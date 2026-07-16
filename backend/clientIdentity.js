/**
 * Client Portal identity (v2.1) — separate from staff identity.
 * Resolves only from the client session cookie. Never uses X-User-Id.
 */

const {
  getClientSessionTokenFromRequest,
  getClientSession,
} = require("./clientSessions");

async function resolveClientIdentity(pool, req) {
  const rawToken = getClientSessionTokenFromRequest(req);
  if (!rawToken) {
    return { clientAccountId: null, email: null, name: null, session: null };
  }
  const session = await getClientSession(pool, rawToken);
  if (!session) {
    return { clientAccountId: null, email: null, name: null, session: null };
  }
  return {
    clientAccountId: session.clientAccountId,
    email: session.email,
    name: session.name,
    session,
  };
}

async function requireClientAccountId(pool, req, res) {
  const identity = await resolveClientIdentity(pool, req);
  if (!identity.clientAccountId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return identity.clientAccountId;
}

module.exports = {
  resolveClientIdentity,
  requireClientAccountId,
};
