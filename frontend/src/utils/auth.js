import { clearUserAccessCache, hasUserAccess } from "./userAccess";

const API_URL = "";
const AUTH_USER_ID_KEY = "loggedInUserId";
const AUTH_PASSWORD_TYPE_KEY = "passwordType";
const AUTH_USER_NAME_KEY = "loggedInUserName";

function getAuthStorage() {
  return localStorage;
}

function migrateLegacySessionStorageAuth() {
  const storage = getAuthStorage();
  if (storage.getItem(AUTH_USER_ID_KEY)) {
    return;
  }

  const legacyUserId = sessionStorage.getItem(AUTH_USER_ID_KEY);
  if (!legacyUserId) {
    return;
  }

  storage.setItem(AUTH_USER_ID_KEY, legacyUserId);
  const legacyPasswordType = sessionStorage.getItem(AUTH_PASSWORD_TYPE_KEY);
  if (legacyPasswordType) {
    storage.setItem(AUTH_PASSWORD_TYPE_KEY, legacyPasswordType);
  }
  const legacyUserName = sessionStorage.getItem(AUTH_USER_NAME_KEY);
  if (legacyUserName) {
    storage.setItem(AUTH_USER_NAME_KEY, legacyUserName);
  }
}

migrateLegacySessionStorageAuth();

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
    sessionStorage.removeItem(AUTH_USER_ID_KEY);
    sessionStorage.removeItem(AUTH_PASSWORD_TYPE_KEY);
    sessionStorage.removeItem(AUTH_USER_NAME_KEY);
  } catch {
    // ignore
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
