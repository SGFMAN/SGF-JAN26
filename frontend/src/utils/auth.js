const API_URL = "";

const AUTH_USER_ID_KEY = "loggedInUserId";
const AUTH_PASSWORD_TYPE_KEY = "passwordType";

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
 * Whether the current browser tab has an active login session.
 */
export function isAuthenticated() {
  return Boolean(getLoggedInUserId());
}

/**
 * Store login session for the current browser tab.
 */
export function setAuthSession(userId, passwordType) {
  const storage = getAuthStorage();
  storage.setItem(AUTH_USER_ID_KEY, String(userId));
  storage.setItem(AUTH_PASSWORD_TYPE_KEY, passwordType || "global");
  // Clear legacy persistent login from older versions.
  try {
    localStorage.removeItem(AUTH_USER_ID_KEY);
    localStorage.removeItem(AUTH_PASSWORD_TYPE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Clear the current login session.
 */
export function clearAuthSession() {
  const storage = getAuthStorage();
  storage.removeItem(AUTH_USER_ID_KEY);
  storage.removeItem(AUTH_PASSWORD_TYPE_KEY);
  try {
    localStorage.removeItem(AUTH_USER_ID_KEY);
    localStorage.removeItem(AUTH_PASSWORD_TYPE_KEY);
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
 * Check if the logged-in user has Admin position AND logged in with admin access.
 */
export async function isUserAdmin() {
  const userId = getLoggedInUserId();
  if (!userId) {
    return false;
  }

  const passwordType = getPasswordType();
  if (passwordType !== "admin") {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/api/users`);
    if (!response.ok) {
      return false;
    }
    const users = await response.json();
    const user = users.find((u) => u.id === parseInt(userId, 10));

    if (!user || !user.positions || !Array.isArray(user.positions)) {
      return false;
    }

    return user.positions.some((position) => position.name === "Admin");
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}
