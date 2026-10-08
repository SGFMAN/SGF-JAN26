const USER_ID_KEY = "sgfhub_userId";
const USER_NAME_KEY = "sgfhub_userName";
const PASSWORD_TYPE_KEY = "sgfhub_passwordType";
const ACCOUNT_KIND_KEY = "sgfhub_accountKind"; // "central" | "trade"
const ACCOUNT_ROLE_KEY = "sgfhub_accountRole";

export function getLoggedInUserId() {
  return localStorage.getItem(USER_ID_KEY);
}

export function getLoggedInUserName() {
  return localStorage.getItem(USER_NAME_KEY) || "";
}

export function getAccountKind() {
  return localStorage.getItem(ACCOUNT_KIND_KEY) || "central";
}

export function isTradeAccount() {
  return getAccountKind() === "trade";
}

export function getAccountRole() {
  return localStorage.getItem(ACCOUNT_ROLE_KEY) || "";
}

/** Central staff login (same accounts as SGF Central itself). */
export function setCentralAuthSession(userId, passwordType, userName) {
  localStorage.setItem(USER_ID_KEY, String(userId));
  localStorage.setItem(PASSWORD_TYPE_KEY, passwordType || "global");
  localStorage.setItem(ACCOUNT_KIND_KEY, "central");
  localStorage.removeItem(ACCOUNT_ROLE_KEY);
  if (userName) localStorage.setItem(USER_NAME_KEY, String(userName));
}

/** Trade/contractor login — a separate account system, no access to Central. */
export function setTradeAuthSession(accountId, name, role) {
  localStorage.setItem(USER_ID_KEY, String(accountId));
  localStorage.setItem(ACCOUNT_KIND_KEY, "trade");
  localStorage.setItem(ACCOUNT_ROLE_KEY, role || "");
  localStorage.removeItem(PASSWORD_TYPE_KEY);
  if (name) localStorage.setItem(USER_NAME_KEY, String(name));
}

export function clearAuthSession() {
  const userId = getLoggedInUserId();
  if (userId && getAccountKind() === "central") {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: getApiHeaders(),
      keepalive: true,
    }).catch(() => {});
  }
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
  localStorage.removeItem(PASSWORD_TYPE_KEY);
  localStorage.removeItem(ACCOUNT_KIND_KEY);
  localStorage.removeItem(ACCOUNT_ROLE_KEY);
}

export function getApiHeaders(additionalHeaders = {}) {
  return {
    "Content-Type": "application/json",
    "X-User-Id": getLoggedInUserId() || "",
    "X-Password-Type": localStorage.getItem(PASSWORD_TYPE_KEY) || "global",
    "X-Account-Kind": getAccountKind(),
    ...additionalHeaders,
  };
}
