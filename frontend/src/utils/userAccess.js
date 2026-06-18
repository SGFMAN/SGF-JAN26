import { getApiHeaders, getLoggedInUserId } from "./auth";

const API_URL = "";

let cachedGrants = null;
let cachedUserId = null;

export function clearUserAccessCache() {
  cachedGrants = null;
  cachedUserId = null;
}

export async function getUserAccessGrants() {
  const userId = getLoggedInUserId();
  if (!userId) {
    return {};
  }

  if (cachedGrants && cachedUserId === userId) {
    return cachedGrants;
  }

  try {
    const response = await fetch(`${API_URL}/api/access-permissions/me`, {
      headers: getApiHeaders(),
    });
    if (!response.ok) {
      return {};
    }
    const data = await response.json();
    const grants = data.grants && typeof data.grants === "object" ? data.grants : {};
    cachedGrants = grants;
    cachedUserId = userId;
    return grants;
  } catch (error) {
    console.error("Error fetching user access grants:", error);
    return {};
  }
}

export async function hasUserAccess(accessArea) {
  const grants = await getUserAccessGrants();
  return grants[accessArea] === true;
}
