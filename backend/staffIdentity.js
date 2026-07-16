/**
 * v0.5 staff identity resolution (compatibility mode).
 *
 * Prefers a valid server-side session cookie when present.
 * Falls back to the legacy X-User-Id header so existing clients keep working
 * when no session exists (e.g. after a process restart, or older callers).
 *
 * This helper does not gate routes by itself — it only resolves identity so
 * shared auth utilities can prefer the session without breaking the header
 * fallback.
 */

const {
  getStaffSession,
  getSessionTokenFromRequest,
} = require("./staffSessions");

/**
 * Resolve the current staff identity for a request.
 *
 * @returns {{
 *   userId: number|null,
 *   source: 'session'|'header'|null,
 *   session: object|null,
 *   name: string|null,
 *   primary_position_id: number|null,
 *   positions: array|null,
 * }}
 */
function resolveStaffIdentity(req) {
  const token = getSessionTokenFromRequest(req);
  const session = getStaffSession(token);
  if (session) {
    const userId = Number(session.userId);
    if (Number.isFinite(userId)) {
      return {
        userId,
        source: "session",
        session,
        name: session.name ?? null,
        primary_position_id: session.primary_position_id ?? null,
        positions: Array.isArray(session.positions) ? session.positions : [],
      };
    }
  }

  const headerRaw = req.headers?.["x-user-id"] || req.headers?.["X-User-Id"];
  const headerId = Number(headerRaw);
  if (Number.isFinite(headerId)) {
    return {
      userId: headerId,
      source: "header",
      session: null,
      name: null,
      primary_position_id: null,
      positions: null,
    };
  }

  return {
    userId: null,
    source: null,
    session: null,
    name: null,
    primary_position_id: null,
    positions: null,
  };
}

/** Convenience: numeric staff user id, or null. */
function getStaffUserIdFromRequest(req) {
  return resolveStaffIdentity(req).userId;
}

module.exports = {
  resolveStaffIdentity,
  getStaffUserIdFromRequest,
};
