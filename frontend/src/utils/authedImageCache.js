import { getApiHeaders } from "./auth";

/** src → resolved blob:/data: URL (or null on failure) */
const resolved = new Map();
/** src → in-flight Promise */
const inflight = new Map();

function normalizeSrc(src) {
  if (src == null) return "";
  return String(src).trim();
}

/**
 * Synchronous cache read. Returns blob URL if already fetched, else null.
 * Pass-through for blob:/data: URLs.
 */
export function getCachedAuthedImageBlobUrl(src) {
  const key = normalizeSrc(src);
  if (!key) return null;
  if (key.startsWith("blob:") || key.startsWith("data:")) return key;
  return resolved.has(key) ? resolved.get(key) : null;
}

/**
 * Fetch an auth-protected image once and reuse the blob URL.
 * Failed URLs are not cached so a later call can retry.
 */
export function fetchAuthedImageBlobUrl(src) {
  const key = normalizeSrc(src);
  if (!key) return Promise.resolve(null);
  if (key.startsWith("blob:") || key.startsWith("data:")) return Promise.resolve(key);
  if (resolved.has(key)) return Promise.resolve(resolved.get(key));
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const headers = getApiHeaders();
      delete headers["Content-Type"];
      const res = await fetch(key, { headers, credentials: "include" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      resolved.set(key, objectUrl);
      return objectUrl;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Prefetch many image URLs in parallel (failures are ignored). */
export function prefetchAuthedImageBlobUrls(urls) {
  const list = [...new Set((urls || []).map(normalizeSrc).filter(Boolean))];
  return Promise.all(list.map((url) => fetchAuthedImageBlobUrl(url)));
}
