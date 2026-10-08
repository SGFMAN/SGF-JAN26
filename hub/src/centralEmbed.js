/**
 * Bridge for the SGF Central "Dan" panel.
 * Central embeds this app in an iframe and sends the already-logged-in staff
 * session. Standalone SGFHub (opened on its own port) keeps Dan's login screen.
 * Keep this file when dropping in a newer SGFHub zip.
 */

export const EMBEDDED = typeof window !== "undefined" && window.parent !== window;

const STAFF_MESSAGE = "sgf-central-staff";

let pending = null;
const listeners = new Set();

function accept(data) {
  if (!data || data.type !== STAFF_MESSAGE || data.userId == null || data.userId === "") return;
  pending = {
    userId: data.userId,
    userName: data.userName || "",
    passwordType: data.passwordType || "global",
  };
  listeners.forEach((fn) => fn(pending));
}

export function takePendingStaffAuth() {
  const auth = pending;
  pending = null;
  return auth;
}

export function subscribeStaffAuth(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (EMBEDDED) {
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    accept(event.data);
  });
  try {
    window.parent.postMessage({ type: "sgfhub-ready" }, "*");
  } catch {
    // Parent can also send on iframe load.
  }
}
