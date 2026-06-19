export const TAB_COORDINATOR_CHANNEL = "sgf-central-coordinator";
export const TAB_DELEGATED_KEY = "sgf-tab-delegated";
export const TAB_ID_KEY = "sgf-tab-id";

export function getTabId() {
  let tabId = sessionStorage.getItem(TAB_ID_KEY);
  if (!tabId) {
    tabId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(TAB_ID_KEY, tabId);
  }
  return tabId;
}

export function isDelegatedTabLaunch() {
  return sessionStorage.getItem(TAB_DELEGATED_KEY) === "1";
}

export function clearDelegatedTabLaunch() {
  sessionStorage.removeItem(TAB_DELEGATED_KEY);
}

export function shouldTryDelegateLinkToOpenTab() {
  const path = window.location.pathname;
  return path !== "/" && path !== "";
}
