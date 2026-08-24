import { getApiHeaders } from "./auth.js";
import { OVERVIEW_STATUS_HEADINGS } from "./designPhaseStatusTiles.js";

export const PLANNER_STORAGE_KEY = "sgf-planner-layout-v1";
const API_URL = "";

const VALID_KEYS = new Set(OVERVIEW_STATUS_HEADINGS.map((item) => item.key));
const LABEL_BY_KEY = Object.fromEntries(
  OVERVIEW_STATUS_HEADINGS.map((item) => [item.key, item.label])
);

export function normalizePlannerLayout(parsed, defaultPositions = {}) {
  const saved = parsed?.positions && typeof parsed.positions === "object" ? parsed.positions : {};
  const positions = { ...defaultPositions };
  for (const item of OVERVIEW_STATUS_HEADINGS) {
    const point = saved[item.key];
    if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
      positions[item.key] = { x: Number(point.x), y: Number(point.y) };
    }
  }
  const links = Array.isArray(parsed?.links)
    ? parsed.links
        .filter(
          (link) =>
            link &&
            VALID_KEYS.has(link.from) &&
            VALID_KEYS.has(link.to)
        )
        .map((link, index) => ({
          id: String(link.id || `link-${index}`),
          from: link.from,
          to: link.to,
        }))
    : [];
  return { positions, links };
}

export function loadPlannerLayout(defaultPositions = {}) {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!raw) return { positions: { ...defaultPositions }, links: [] };
    return normalizePlannerLayout(JSON.parse(raw), defaultPositions);
  } catch {
    return { positions: { ...defaultPositions }, links: [] };
  }
}

export function savePlannerLayout(positions, links) {
  try {
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ positions, links }));
  } catch {
    // ignore quota / private mode
  }
}

function positionsMovedFromDefault(positions, defaultPositions) {
  for (const item of OVERVIEW_STATUS_HEADINGS) {
    const current = positions?.[item.key];
    const fallback = defaultPositions?.[item.key];
    if (!current || !fallback) continue;
    if (Math.abs(Number(current.x) - Number(fallback.x)) > 0.5) return true;
    if (Math.abs(Number(current.y) - Number(fallback.y)) > 0.5) return true;
  }
  return false;
}

export function plannerLayoutShouldSeedServer(layout, defaultPositions = {}) {
  if (!layout) return false;
  if (Array.isArray(layout.links) && layout.links.length > 0) return true;
  return positionsMovedFromDefault(layout.positions, defaultPositions);
}

export async function fetchPlannerLayoutFromApi(defaultPositions = {}) {
  try {
    const res = await fetch(`${API_URL}/api/planner-layout`, { headers: getApiHeaders() });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data?.layout) return null;
    return normalizePlannerLayout(data.layout, defaultPositions);
  } catch {
    return null;
  }
}

export async function persistPlannerLayoutToApi(positions, links) {
  savePlannerLayout(positions, links);
  const res = await fetch(`${API_URL}/api/planner-layout`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify({ layout: { positions, links } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save planner layout (${res.status})`);
  }
}

/** B depends on A when the planner arrow is A → B. */
export function getPlannerRequirementKeysByItem(links) {
  const map = new Map();
  for (const item of OVERVIEW_STATUS_HEADINGS) {
    map.set(item.key, []);
  }
  for (const link of links || []) {
    const list = map.get(link.to);
    if (!list || list.includes(link.from)) continue;
    list.push(link.from);
  }
  return map;
}

export function plannerLabelForKey(key) {
  return LABEL_BY_KEY[key] || key;
}
