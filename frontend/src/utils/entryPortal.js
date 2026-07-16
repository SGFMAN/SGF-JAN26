/**
 * Hostname-aware entry: staff app vs Client Portal.
 *
 * Production uses hostname only.
 * Local development may preview the client entry with ?portal=client
 * (localhost / 127.0.0.1 / LAN IPs only — ignored on production hosts).
 */

const STAFF_HOSTNAMES = new Set(["portal.superiorgrannyflats.com.au"]);

const CLIENT_HOSTNAMES = new Set(["client.superiorgrannyflats.com.au"]);

function normalizeHostname() {
  if (typeof window === "undefined") return "";
  return String(window.location?.hostname || "").toLowerCase();
}

function isLocalDevHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  // Common private LAN ranges used for local/preview access
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

function hasLocalClientPreviewQuery() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("portal") === "client";
  } catch {
    return false;
  }
}

/**
 * True when this browser should show the Client Portal entry experience.
 * Unknown hosts default to the staff application.
 */
export function isClientPortalEntry() {
  const host = normalizeHostname();

  if (CLIENT_HOSTNAMES.has(host)) return true;
  if (STAFF_HOSTNAMES.has(host)) return false;

  if (isLocalDevHost(host) && hasLocalClientPreviewQuery()) {
    return true;
  }

  return false;
}
