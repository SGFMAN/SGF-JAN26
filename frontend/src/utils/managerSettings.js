import {
  PROJECT_STATUS_OPTIONS,
  PRE_ENGAGEMENT_PHASE,
  DESIGN_PHASE,
  PERMIT_PHASE,
  CONSTRUCTION_PHASE,
  isPreEngagementPhaseStatus,
  isDesignPhaseStatus,
  isPermitPhaseStatus,
  isConstructionPhaseStatus,
  isCancelledStatus,
  isCompleteStatus,
} from "./projectStatus";
import { OVERVIEW_STATUS_HEADINGS } from "./designPhaseStatusTiles.js";

export const NEXT_OUTS_PHASE_OPTIONS = PROJECT_STATUS_OPTIONS;
export const DEFAULT_NEXT_OUTS_INCLUDED_PHASES = [PERMIT_PHASE];
export const NEXT_OUTS_OVERVIEW_OPTIONS = OVERVIEW_STATUS_HEADINGS;
export const DEFAULT_NEXT_OUTS_OVERVIEW_KEYS = [
  "contract",
  "colours",
  "energy",
  "windows",
  "footing",
  "sewer-connection",
  "building-permit",
];
export const NEXT_OUTS_SORT_DIRECTIONS = [
  { value: "asc", label: "A-Z" },
  { value: "desc", label: "Z-A" },
];
export const DEFAULT_NEXT_OUTS_SORT = [{ key: "", direction: "asc" }];

const OVERVIEW_KEY_SET = new Set(OVERVIEW_STATUS_HEADINGS.map((item) => item.key));

export function normalizeNextOutsIncludedPhases(raw) {
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

export function normalizeNextOutsOverviewKeys(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_NEXT_OUTS_OVERVIEW_KEYS];
  const seen = new Set();
  for (const item of raw) {
    const value = String(item ?? "").trim();
    if (!OVERVIEW_KEY_SET.has(value) || seen.has(value)) continue;
    seen.add(value);
  }
  return OVERVIEW_STATUS_HEADINGS.map((item) => item.key).filter((key) => seen.has(key));
}

export function headingsFromOverviewKeys(keys) {
  const selected = new Set(keys || []);
  return OVERVIEW_STATUS_HEADINGS.filter((item) => selected.has(item.key));
}

export function normalizeNextOutsSort(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_NEXT_OUTS_SORT];
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

export function unusedOverviewSortOptions(sortLevels, currentKey, overviewKeys) {
  const selected = new Set(overviewKeys || []);
  const used = new Set((sortLevels || []).map((row) => row.key).filter(Boolean));
  if (currentKey) used.delete(currentKey);
  return NEXT_OUTS_OVERVIEW_OPTIONS.filter(
    (item) => selected.has(item.key) && !used.has(item.key)
  );
}

export function constrainNextOutsSortToOverviewKeys(sort, overviewKeys) {
  const selected = new Set(overviewKeys || []);
  return normalizeNextOutsSort((sort || []).filter((row) => !row.key || selected.has(row.key)));
}

export function normalizeManagerSettings(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
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

export function projectMatchesNextOutsIncludedPhase(status, includedPhases) {
  const set = new Set(includedPhases || []);
  if (set.has(PRE_ENGAGEMENT_PHASE) && isPreEngagementPhaseStatus(status)) return true;
  if (set.has(DESIGN_PHASE) && isDesignPhaseStatus(status)) return true;
  if (set.has(PERMIT_PHASE) && isPermitPhaseStatus(status)) return true;
  if (set.has(CONSTRUCTION_PHASE) && isConstructionPhaseStatus(status)) return true;
  if (set.has("Cancelled") && isCancelledStatus(status)) return true;
  if (set.has("Complete") && isCompleteStatus(status)) return true;
  return false;
}
