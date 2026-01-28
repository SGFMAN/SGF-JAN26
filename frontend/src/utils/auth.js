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
 * Check if the logged-in user has Admin position AND logged in with admin password
 * Returns a promise that resolves to true only if:
 * 1. User has "Admin" position, AND
 * 2. User logged in with admin password (not global password)
 */
export async function isUserAdmin() {
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
