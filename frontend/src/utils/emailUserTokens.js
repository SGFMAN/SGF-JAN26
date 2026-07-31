import { getApiHeaders, getLoggedInUserId, getLoggedInUserName } from "./auth";
import { getUserPrimaryPositionName } from "./userPosition";

const API_URL = "";

let cachedTokens = null;
let cachedUserId = null;

export function clearLoggedInUserEmailTokenCache() {
  cachedTokens = null;
  cachedUserId = null;
}

/**
 * Resolve {UserName}, {UserPosition}, {UserEmail} for the logged-in staff user.
 */
export async function resolveLoggedInUserEmailTokens() {
  const userId = getLoggedInUserId();
  if (!userId) {
    return {
      UserName: getLoggedInUserName() || "",
      UserPosition: "",
      UserEmail: "",
    };
  }
  if (cachedTokens && cachedUserId === String(userId)) {
    return cachedTokens;
  }

  try {
    const response = await fetch(`${API_URL}/api/users`, {
      headers: getApiHeaders(),
    });
    if (!response.ok) {
      return {
        UserName: getLoggedInUserName() || "",
        UserPosition: "",
        UserEmail: "",
      };
    }
    const users = await response.json();
    const user = (Array.isArray(users) ? users : []).find(
      (u) => String(u.id) === String(userId)
    );
    const tokens = {
      UserName: String(user?.name || getLoggedInUserName() || "").trim(),
      UserPosition: getUserPrimaryPositionName(user || {}) || "",
      UserEmail: String(user?.email || "").trim(),
    };
    cachedTokens = tokens;
    cachedUserId = String(userId);
    return tokens;
  } catch {
    return {
      UserName: getLoggedInUserName() || "",
      UserPosition: "",
      UserEmail: "",
    };
  }
}

/** Sync replace using already-resolved tokens. */
export function applyLoggedInUserEmailTokens(text, tokens) {
  if (text == null) return text;
  let replaced = String(text);
  replaced = replaced.replace(/\{UserName\}/g, tokens?.UserName ?? "");
  replaced = replaced.replace(/\{UserPosition\}/g, tokens?.UserPosition ?? "");
  replaced = replaced.replace(/\{UserEmail\}/g, tokens?.UserEmail ?? "");
  return replaced;
}

/** Fetch logged-in user details and replace User* tokens (no-op if none present). */
export async function replaceLoggedInUserEmailTokens(text) {
  if (text == null || text === "") return text;
  if (!/\{UserName\}|\{UserPosition\}|\{UserEmail\}/.test(String(text))) {
    return text;
  }
  const tokens = await resolveLoggedInUserEmailTokens();
  return applyLoggedInUserEmailTokens(text, tokens);
}
