import { clearUserAccessCache, hasUserAccess } from "./userAccess";

const API_URL = "";
const AUTH_USER_ID_KEY = "loggedInUserId";
const AUTH_PASSWORD_TYPE_KEY = "passwordType";
const AUTH_USER_NAME_KEY = "loggedInUserName";

function getAuthStorage() {
  return sessionStorage;
}

// v0.3/v0.5: in-memory copy of the staff user from GET /api/auth/session.
// Preferred identity when present; sessionStorage remains the fallback.
let verifiedServerSessionUser = null;

/**
 * Get the logged-in user ID.
 * v0.5: prefer verified server-session identity when available; otherwise
 * fall back to legacy sessionStorage (X-User-Id source).
 */
export function getLoggedInUserId() {
  if (verifiedServerSessionUser && verifiedServerSessionUser.id != null) {
    return String(verifiedServerSessionUser.id);
  }
  return getAuthStorage().getItem(AUTH_USER_ID_KEY);
}

/**
 * Get the password type used during login (global or admin).
 */
export function getPasswordType() {
  return getAuthStorage().getItem(AUTH_PASSWORD_TYPE_KEY) || "global";
}

/**
 * Get the logged-in user's display name.
 * v0.5: prefer verified server-session name when available.
 */
export function getLoggedInUserName() {
  if (verifiedServerSessionUser && verifiedServerSessionUser.name) {
    return String(verifiedServerSessionUser.name);
  }
  return getAuthStorage().getItem(AUTH_USER_NAME_KEY) || "";
}

/**
 * Whether the current browser tab has an active login session.
 * Still based on legacy sessionStorage so missing server sessions do not
 * log the user out of the UI.
 */
export function isAuthenticated() {
  return Boolean(getAuthStorage().getItem(AUTH_USER_ID_KEY));
}

/**
 * Preferred staff identity helper (v0.5).
 * Returns { userId, name, source } where source is 'session' or 'storage'.
 */
export function resolveCurrentStaffIdentity() {
  if (verifiedServerSessionUser && verifiedServerSessionUser.id != null) {
    return {
      userId: String(verifiedServerSessionUser.id),
      name: verifiedServerSessionUser.name || "",
      source: "session",
      user: verifiedServerSessionUser,
    };
  }
  const storedId = getAuthStorage().getItem(AUTH_USER_ID_KEY);
  if (storedId) {
    return {
      userId: storedId,
      name: getAuthStorage().getItem(AUTH_USER_NAME_KEY) || "",
      source: "storage",
      user: null,
    };
  }
  return { userId: null, name: "", source: null, user: null };
}

/**
 * Store login session for the current browser tab.
 */
export function setAuthSession(userId, passwordType, userName) {
  clearUserAccessCache();
  const storage = getAuthStorage();
  storage.setItem(AUTH_USER_ID_KEY, String(userId));
  storage.setItem(AUTH_PASSWORD_TYPE_KEY, passwordType || "global");
  if (userName) {
    storage.setItem(AUTH_USER_NAME_KEY, String(userName));
  }
  // Clear legacy persistent login from older versions.
  try {
    localStorage.removeItem(AUTH_USER_ID_KEY);
    localStorage.removeItem(AUTH_PASSWORD_TYPE_KEY);
    localStorage.removeItem(AUTH_USER_NAME_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("sgf-auth-session-change", { detail: { userId: String(userId) } })
    );
  }
  // Quietly adopt the new HttpOnly session cookie into memory (non-blocking).
  verifyServerSession();
}

/**
 * Clear the current login session.
 */
export function clearAuthSession() {
  const userId = getLoggedInUserId();
  if (userId) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: getApiHeaders(),
      keepalive: true,
    }).catch(() => {});
  }

  verifiedServerSessionUser = null;
  clearUserAccessCache();
  const storage = getAuthStorage();
  storage.removeItem(AUTH_USER_ID_KEY);
  storage.removeItem(AUTH_PASSWORD_TYPE_KEY);
  storage.removeItem(AUTH_USER_NAME_KEY);
  try {
    localStorage.removeItem(AUTH_USER_ID_KEY);
    localStorage.removeItem(AUTH_PASSWORD_TYPE_KEY);
    localStorage.removeItem(AUTH_USER_NAME_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sgf-auth-session-change", { detail: { userId: null } }));
  }
}

/**
 * Get headers with admin authentication info for API requests.
 * Still sends X-User-Id for legacy compatibility; server prefers the session cookie.
 */
export function getApiHeaders(additionalHeaders = {}) {
  const userId = getLoggedInUserId();
  const passwordType = getPasswordType();

  return {
    "Content-Type": "application/json",
    "X-User-Id": userId || "",
    "X-Password-Type": passwordType || "global",
    ...additionalHeaders,
  };
}

/**
 * Whether the logged-in user has Admin checked in Settings → Permissions.
 */
export async function isUserAdmin() {
  if (!getLoggedInUserId()) {
    return false;
  }
  return hasUserAccess("admin");
}

/**
 * Get the staff user from the last successful server-session check (or null).
 */
export function getVerifiedServerSessionUser() {
  return verifiedServerSessionUser;
}

/**
 * Quietly check whether a valid server-side staff session exists.
 *
 * On success, records the user in memory. On any failure it does nothing:
 * no logout, no redirect, no warning. Legacy sessionStorage auth remains.
 */
export async function verifyServerSession() {
  try {
    const response = await fetch(`${API_URL}/api/auth/session`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (data && data.authenticated && data.user) {
      verifiedServerSessionUser = data.user;
      if (import.meta.env && import.meta.env.DEV) {
        console.log(`Server session verified for ${data.user.name}`);
      }
      return data.user;
    }
    return null;
  } catch {
    return null;
  }
}
