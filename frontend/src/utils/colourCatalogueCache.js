import { getApiHeaders } from "./auth";

const API_URL = "";

/** rangeKey → Promise<catalogue|null> (failed fetches are removed so they can retry) */
const catalogueCache = new Map();

/**
 * Fetch a colour-group catalogue once and reuse across Colours / Kitchen.
 * Callers that need Colorbond should handle COLORBOND_RANGE_KEY themselves.
 */
export function fetchColourGroupCatalogue(rangeKey) {
  const key = String(rangeKey || "").trim();
  if (!key) return Promise.resolve(null);
  if (catalogueCache.has(key)) return catalogueCache.get(key);

  const promise = (async () => {
    const res = await fetch(`${API_URL}/api/colour-groups/${encodeURIComponent(key)}/catalogue`, {
      headers: getApiHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
    return data;
  })().catch((err) => {
    catalogueCache.delete(key);
    throw err;
  });

  catalogueCache.set(key, promise);
  return promise;
}
