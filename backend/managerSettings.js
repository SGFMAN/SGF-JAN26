/**
 * Settings → Managers. Shared parse for API + Next Outs.
 */

const PROJECT_STATUS_OPTIONS = [
  "Pre-Engagement Phase",
  "Design Phase",
  "Permit Phase",
  "Construction Phase",
  "Cancelled",
  "Complete",
];
const OVERVIEW_STATUS_KEYS = [
  "deposit",
  "concept-drawings",
  "working-drawings",
  "site-visit",
  "colours",
  "windows",
  "contract",
  "survey-soils",
  "town-planning",
  "bal",
  "energy",
  "footing",
  "building-permit",
  "sewer-connection",
];
const DEFAULT_NEXT_OUTS_INCLUDED_PHASES = ["Permit Phase"];
const DEFAULT_NEXT_OUTS_OVERVIEW_KEYS = [
  "contract",
  "colours",
  "energy",
  "windows",
  "footing",
  "sewer-connection",
  "building-permit",
];
const DEFAULT_NEXT_OUTS_SORT = [{ key: "", direction: "asc" }];
const OVERVIEW_KEY_SET = new Set(OVERVIEW_STATUS_KEYS);

function parseJsonObject(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return {};
  const t = raw.trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    return {};
  }
  return {};
}

function normalizeNextOutsIncludedPhases(raw) {
  const allowed = new Set(PROJECT_STATUS_OPTIONS);
  if (!Array.isArray(raw)) return [...DEFAULT_NEXT_OUTS_INCLUDED_PHASES];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const value = String(item ?? "").trim();
    if (!allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeNextOutsOverviewKeys(raw) {
  const allowed = new Set(OVERVIEW_STATUS_KEYS);
  if (!Array.isArray(raw)) return [...DEFAULT_NEXT_OUTS_OVERVIEW_KEYS];
  const seen = new Set();
  for (const item of raw) {
    const value = String(item ?? "").trim();
    if (!allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
  }
  return OVERVIEW_STATUS_KEYS.filter((key) => seen.has(key));
}

function normalizeNextOutsSort(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_NEXT_OUTS_SORT.map((row) => ({ ...row }));
  const seen = new Set();
  const out = [];
  let fallbackDirection = "asc";
  for (const item of raw) {
    const src = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const key = String(src.key ?? "").trim();
    const direction = src.direction === "desc" ? "desc" : "asc";
    if (!key) {
      if (out.length === 0) fallbackDirection = direction;
      continue;
    }
    if (!OVERVIEW_KEY_SET.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, direction });
  }
  return out.length > 0 ? out : [{ key: "", direction: fallbackDirection }];
}

function constrainNextOutsSortToOverviewKeys(sort, overviewKeys) {
  const selected = new Set(overviewKeys || []);
  return normalizeNextOutsSort((sort || []).filter((row) => !row.key || selected.has(row.key)));
}

function parseManagerSettingsColumn(raw) {
  const src = parseJsonObject(raw);
  const nextOutsOverviewKeys = normalizeNextOutsOverviewKeys(src.nextOutsOverviewKeys);
  return {
    nextOutsIncludedPhases: normalizeNextOutsIncludedPhases(src.nextOutsIncludedPhases),
    nextOutsOverviewKeys,
    nextOutsSort: constrainNextOutsSortToOverviewKeys(
      normalizeNextOutsSort(src.nextOutsSort),
      nextOutsOverviewKeys
    ),
  };
}

module.exports = {
  PROJECT_STATUS_OPTIONS,
  OVERVIEW_STATUS_KEYS,
  DEFAULT_NEXT_OUTS_INCLUDED_PHASES,
  DEFAULT_NEXT_OUTS_OVERVIEW_KEYS,
  DEFAULT_NEXT_OUTS_SORT,
  parseManagerSettingsColumn,
};
