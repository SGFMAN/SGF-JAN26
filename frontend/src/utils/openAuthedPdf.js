import { getApiHeaders } from "./auth";

/**
 * Fetch a staff-auth PDF and return a blob: URL.
 * New-tab navigations cannot send X-User-Id, so they 401 ("Not authenticated")
 * when the HttpOnly session cookie is missing (e.g. after a backend restart).
 */
export async function fetchAuthedPdfBlobUrl(url) {
  const headers = getApiHeaders();
  delete headers["Content-Type"];
  const res = await fetch(url, {
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.error || `Failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Open an auth-protected PDF in a new tab.
 * Opens a blank tab first so the browser does not treat it as a blocked popup.
 */
export async function openAuthedPdfInNewTab(url) {
  const tab = window.open("about:blank", "_blank");
  try {
    const blobUrl = await fetchAuthedPdfBlobUrl(url);
    if (tab && !tab.closed) {
      tab.location = blobUrl;
    } else {
      window.open(blobUrl, "_blank");
    }
    return { ok: true };
  } catch (error) {
    if (tab && !tab.closed) tab.close();
    return { ok: false, status: error.status || null, error: error.message };
  }
}
