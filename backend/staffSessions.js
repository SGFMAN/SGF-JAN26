/**
 * Stage 1 (compatibility mode) staff server-side sessions.
 *
 * TEMPORARY: sessions are held in process memory only. They do NOT survive a
 * server restart and are NOT shared across multiple backend instances. This is
 * intentional for Stage 1 and must later be replaced with a persistent session
 * store (e.g. a database or Redis-backed table). See migration notes.
 *
 * This module exists IN ADDITION to the legacy X-User-Id / sessionStorage auth.
 * It does not replace or gate any existing route.
 */

const crypto = require("crypto");

const SESSION_COOKIE_NAME = "sgf_staff_session";

// Reasonable expiry for daily staff use. Sliding: extended on each validation.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** token -> { userId, name, primary_position_id, positions, createdAt, expiresAt } */
const sessions = new Map();

function now() {
  return Date.now();
}

function isExpired(session) {
  return !session || session.expiresAt <= now();
}

function createStaffSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = now();
  sessions.set(token, {
    userId: user.id,
    name: user.name,
    primary_position_id: user.primary_position_id ?? null,
    positions: Array.isArray(user.positions) ? user.positions : [],
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
  });
  return token;
}

/** Returns the session (with sliding-expiry refresh) or null if missing/expired. */
function getStaffSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (isExpired(session)) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = now() + SESSION_TTL_MS;
  return session;
}

function destroyStaffSession(token) {
  if (!token) return;
  sessions.delete(token);
}

/** Minimal cookie header parser (no dependency added for Stage 1). */
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

function getSessionTokenFromRequest(req) {
  return parseCookies(req)[SESSION_COOKIE_NAME] || null;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createStaffSession,
  getStaffSession,
  destroyStaffSession,
  getSessionTokenFromRequest,
  sessionCookieOptions,
};
