import { OVERVIEW_STATUS_HEADINGS } from "./designPhaseStatusTiles.js";

export const PLANNER_STORAGE_KEY = "sgf-planner-layout-v1";

const VALID_KEYS = new Set(OVERVIEW_STATUS_HEADINGS.map((item) => item.key));
const LABEL_BY_KEY = Object.fromEntries(
  OVERVIEW_STATUS_HEADINGS.map((item) => [item.key, item.label])
);

export function loadPlannerLayout(defaultPositions = {}) {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!raw) return { positions: { ...defaultPositions }, links: [] };
    const parsed = JSON.parse(raw);
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
