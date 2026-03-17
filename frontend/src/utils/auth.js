const API_URL = "";

/**
 * Get the logged-in user ID from localStorage
 */
export function getLoggedInUserId() {
  return localStorage.getItem("loggedInUserId");
}

/**
 * Get the password type used during login (global or admin)
 */
export function getPasswordType() {
  return localStorage.getItem("passwordType") || "global";
}

/**
 * Get headers with admin authentication info for API requests
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
 * Check if running in development mode (localhost:5173 or LAN IP:5173)
 * When using the dev server via WiFi/LAN (e.g. 192.168.x.x:5173), treat as dev so admin buttons work.
 */
export function isDevelopmentMode() {
  const hostname = window.location.hostname;
  const port = window.location.port;
  if (hostname === 'localhost' && port === '5173') return true;
  // Private IPv4 (e.g. 192.168.x.x, 10.x.x.x) on Vite dev port = same dev server
  const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname);
  return isPrivateIP && port === '5173';
}

/**
 * Check if the logged-in user has Admin position AND logged in with admin password
 * Returns a promise that resolves to true only if:
 * 1. User has "Admin" position, AND
 * 2. User logged in with admin password (not global password)
 * 
 * In development mode (localhost:5173), always returns true for full admin access
 */
export async function isUserAdmin() {
  // In development mode, always grant admin access
  if (isDevelopmentMode()) {
    return true;
  }

  const userId = getLoggedInUserId();
  if (!userId) {
    return false;
  }

  // Check if user logged in with admin password
  const passwordType = getPasswordType();
  if (passwordType !== "admin") {
    return false; // Even if user has Admin position, they need admin password for full access
  }

  try {
    const response = await fetch(`${API_URL}/api/users`);
    if (!response.ok) {
      return false;
    }
    const users = await response.json();
    const user = users.find((u) => u.id === parseInt(userId));
    
    if (!user || !user.positions || !Array.isArray(user.positions)) {
      return false;
    }

    // Check if user has "Admin" position AND logged in with admin password
    const hasAdminPosition = user.positions.some((position) => position.name === "Admin");
    return hasAdminPosition && passwordType === "admin";
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}
