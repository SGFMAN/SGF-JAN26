const STORAGE_KEY = "sgf_maps_recent_searches";
const MAX_RECENT = 80;

function normalizeQuery(q) {
  return String(q ?? "").trim().replace(/\s+/g, " ");
}

function normalizeSavedBoundary(raw) {
  if (!raw?.geometry) return null;
  return {
    geometry: raw.geometry,
    properties: raw.properties && typeof raw.properties === "object" ? raw.properties : {},
    adjustedAt: Number(raw.adjustedAt) || 0,
  };
}

function mapRecentItem(item) {
  const savedBoundary = normalizeSavedBoundary(item.savedBoundary);
  return {
    id: String(item.id || item.searchedAt || Date.now()),
    query: normalizeQuery(item.query),
    label: String(item.label || item.query || "").trim(),
    searchedAt: Number(item.searchedAt) || Date.now(),
    savedBoundary,
  };
}

/** @returns {Array<{ id: string, query: string, label: string, searchedAt: number, savedBoundary: object|null }>} */
export function loadRecentMapSearches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && normalizeQuery(item.query))
      .map(mapRecentItem);
  } catch {
    return [];
  }
}

function persistRecent(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch {
    // ignore quota errors
  }
}

function findRecentByQuery(items, query) {
  const key = normalizeQuery(query).toLowerCase();
  return items.find((item) => item.query.toLowerCase() === key) || null;
}

/** Add or bump a successful search (newest first). Preserves saved boundary for same query. */
export function addRecentMapSearch({ query, label }) {
  const q = normalizeQuery(query);
  if (!q) return loadRecentMapSearches();

  const now = Date.now();
  const existing = loadRecentMapSearches();
  const key = q.toLowerCase();
  const prev = findRecentByQuery(existing, q);
  const without = existing.filter((item) => item.query.toLowerCase() !== key);
  const next = [
    {
      id: String(now),
      query: q,
      label: String(label || q).trim(),
      searchedAt: now,
      savedBoundary: prev?.savedBoundary || null,
    },
    ...without,
  ].slice(0, MAX_RECENT);

  persistRecent(next);
  return next;
}

/** @returns {{ type: 'Feature', geometry: object, properties: object }|null} */
export function getSavedBoundaryForRecentQuery(query) {
  const item = findRecentByQuery(loadRecentMapSearches(), query);
  if (!item?.savedBoundary?.geometry) return null;
  return {
    type: "Feature",
    geometry: item.savedBoundary.geometry,
    properties: { ...item.savedBoundary.properties },
  };
}

/** Persist manually adjusted boundary geometry for a recent search query. */
export function saveBoundaryForRecentQuery(query, feature) {
  const q = normalizeQuery(query);
  if (!q || !feature?.geometry) return loadRecentMapSearches();

  const items = loadRecentMapSearches();
  const key = q.toLowerCase();
  let matched = false;
  const updated = items.map((item) => {
    if (item.query.toLowerCase() !== key) return item;
    matched = true;
    return {
      ...item,
      savedBoundary: {
        geometry: feature.geometry,
        properties: feature.properties || {},
        adjustedAt: Date.now(),
      },
    };
  });

  if (!matched) return items;
  persistRecent(updated);
  return updated;
}

/** @param {'chrono'|'alpha'} sort */
export function sortRecentMapSearches(items, sort) {
  const list = [...items];
  if (sort === "alpha") {
    list.sort((a, b) => a.query.localeCompare(b.query, undefined, { sensitivity: "base" }));
    return list;
  }
  list.sort((a, b) => b.searchedAt - a.searchedAt);
  return list;
}

export function formatRecentSearchWhen(searchedAt) {
  try {
    return new Date(searchedAt).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
