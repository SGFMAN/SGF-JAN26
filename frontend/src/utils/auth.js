import { clearUserAccessCache, hasUserAccess } from "./userAccess";

const API_URL = "";
const AUTH_USER_ID_KEY = "loggedInUserId";
const AUTH_PASSWORD_TYPE_KEY = "passwordType";
const AUTH_USER_NAME_KEY = "loggedInUserName";

function getAuthStorage() {
  return sessionStorage;
}

/**
 * Get the logged-in user ID from session storage.
 */
export function getLoggedInUserId() {
  return getAuthStorage().getItem(AUTH_USER_ID_KEY);
}

/**
 * Get the password type used during login (global or admin).
 */
export function getPasswordType() {
  return getAuthStorage().getItem(AUTH_PASSWORD_TYPE_KEY) || "global";
}

/**
 * Get the logged-in user's display name from session storage.
 */
export function getLoggedInUserName() {
  return getAuthStorage().getItem(AUTH_USER_NAME_KEY) || "";
}

/**
 * Whether the current browser tab has an active login session.
 */
export function isAuthenticated() {
  return Boolean(getLoggedInUserId());
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

// v0.3: informational-only server session adoption.
// Holds the staff user reported by GET /api/auth/session, if a valid server
// session cookie exists. Nothing in the app depends on this yet.
let verifiedServerSessionUser = null;

/**
 * Get the staff user from the last successful server-session check (or null).
 * Informational only; does not gate any behaviour.
 */
export function getVerifiedServerSessionUser() {
  return verifiedServerSessionUser;
}

/**
 * Quietly check whether a valid server-side staff session exists.
 *
 * On success, records the user in memory and logs a dev-only message. On any
 * failure (no session, network error) it does nothing: no logout, no redirect,
 * no warning. The existing X-User-Id / sessionStorage auth is untouched.
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
