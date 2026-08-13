/**
 * Shared in-flight + short-TTL cache for GET /api/projects list views.
 * Stage pages and the sidebar share one card-view response instead of 2–3 fat downloads.
 */

const API_URL = "";

const DEFAULT_TTL_MS = 30_000;

/** @type {Map<string, { at: number, data: any[] }>} */
const cacheByKey = new Map();
/** @type {Map<string, Promise<any[]>>} */
const inflightByKey = new Map();

function cacheKey(view) {
  return view === "full" ? "full" : view === "lite" ? "lite" : "card";
}

function projectsUrl(view) {
  if (view === "full") return `${API_URL}/api/projects?full=1`;
  if (view === "lite") return `${API_URL}/api/projects?view=lite`;
  return `${API_URL}/api/projects?view=card`;
}

/**
 * @param {object} [options]
 * @param {"card"|"lite"|"full"} [options.view="card"]
 * @param {boolean} [options.force=false] bypass TTL
 * @param {number} [options.ttlMs]
 * @param {number} [options.retry503Max] HomePage-style migration wait
 * @returns {Promise<any[]>}
 */
export async function fetchProjectsList(options = {}) {
  const view = options.view || "card";
  const force = Boolean(options.force);
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : DEFAULT_TTL_MS;
  const retry503Max = Number.isFinite(options.retry503Max) ? options.retry503Max : 0;
  const key = cacheKey(view);

  if (!force) {
    const hit = cacheByKey.get(key);
    if (hit && Date.now() - hit.at < ttlMs) {
      return hit.data;
    }
    const inflight = inflightByKey.get(key);
    if (inflight) return inflight;
  }

  const url = projectsUrl(view);
  const promise = (async () => {
    let response = await fetch(url);
    let attempts = 0;
    while (response.status === 503 && attempts < retry503Max) {
      await new Promise((r) => setTimeout(r, 1000));
      attempts += 1;
      response = await fetch(url);
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Failed to fetch projects: ${response.status} ${response.statusText} ${errorText}`
      );
    }
    const data = await response.json();
    const list = Array.isArray(data) ? data : [];
    cacheByKey.set(key, { at: Date.now(), data: list });
    return list;
  })().finally(() => {
    inflightByKey.delete(key);
  });

  inflightByKey.set(key, promise);
  return promise;
}

/** Drop cached lists after a mutation so the next navigation refetches. */
export function invalidateProjectsListCache() {
  cacheByKey.clear();
  inflightByKey.clear();
}

/** Sync read of cached list data (null when cold / expired not checked — raw hit only). */
export function getCachedProjectsList(view = "card") {
  const hit = cacheByKey.get(cacheKey(view));
  return hit ? hit.data : null;
}
