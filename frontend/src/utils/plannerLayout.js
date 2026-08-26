import { getApiHeaders } from "./auth.js";
import { OVERVIEW_STATUS_HEADINGS } from "./designPhaseStatusTiles.js";

export const PLANNER_STORAGE_KEY = "sgf-planner-layout-v1";
export const PLANNER_SNAP_SIZE = 16;
/** One bold graph-paper square. Faint lines are ignored for board and tile size. */
export const PLANNER_MAJOR_SQUARE_CELLS = 5;
export const PLANNER_MAJOR_SQUARE_PX = PLANNER_MAJOR_SQUARE_CELLS * PLANNER_SNAP_SIZE;
export const PLANNER_RECT_WIDTH = PLANNER_MAJOR_SQUARE_PX * 2;
export const PLANNER_RECT_HEIGHT = PLANNER_MAJOR_SQUARE_PX;
export const PLANNER_START_BUILDING_WIDTH = PLANNER_SNAP_SIZE * 16;
export const PLANNER_START_BUILDING_HEIGHT = PLANNER_SNAP_SIZE * 10;
export const PLANNER_GRID_COLS = 4;
export const PLANNER_GRID_GAP_X = 0;
export const PLANNER_GRID_GAP_Y = 0;
export const PLANNER_GRID_ORIGIN = 0;
export const PLANNER_BOARD_SQUARES_X = 21;
export const PLANNER_BOARD_SQUARES_Y = 9;
export const PLANNER_BOARD_WIDTH = PLANNER_BOARD_SQUARES_X * PLANNER_MAJOR_SQUARE_PX;
export const PLANNER_BOARD_HEIGHT = PLANNER_BOARD_SQUARES_Y * PLANNER_MAJOR_SQUARE_PX;
export const PLANNER_START_PROJECT_KEY = "start-project";
export const PLANNER_START_BUILDING_KEY = "start-building";

export const PLANNER_FLOW_ITEMS = [
  { key: PLANNER_START_PROJECT_KEY, label: "Start Project", kind: "heading" },
  ...OVERVIEW_STATUS_HEADINGS.map((item) => ({ ...item, kind: "stage" })),
  { key: PLANNER_START_BUILDING_KEY, label: "Start Building", kind: "heading" },
];

const API_URL = "";

const VALID_KEYS = new Set(PLANNER_FLOW_ITEMS.map((item) => item.key));
const LABEL_BY_KEY = Object.fromEntries(
  PLANNER_FLOW_ITEMS.map((item) => [item.key, item.label])
);

export function normalizePlannerLayout(parsed, defaultPositions = {}) {
  const saved = parsed?.positions && typeof parsed.positions === "object" ? parsed.positions : {};
  const positions = { ...defaultPositions };
  for (const item of PLANNER_FLOW_ITEMS) {
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
  return { positions: clampPlannerPositions(positions), links };
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
  for (const item of PLANNER_FLOW_ITEMS) {
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
    let res = await fetch(`${API_URL}/api/planner-layout`, { headers: getApiHeaders() });
    if (res.status === 401 || res.status === 403) {
      res = await fetch(`${API_URL}/api/client/planner-layout`, { credentials: "same-origin" });
    }
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
  for (const item of PLANNER_FLOW_ITEMS) {
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

export function isPlannerHeadingKey(key) {
  return key === PLANNER_START_PROJECT_KEY || key === PLANNER_START_BUILDING_KEY;
}

export function isStartBuildingUnlocked(links, isSourceComplete) {
  const incoming = (links || []).filter((link) => link.to === PLANNER_START_BUILDING_KEY);
  if (incoming.length === 0) return false;
  return incoming.every((link) => {
    if (link.from === PLANNER_START_PROJECT_KEY) return true;
    if (link.from === PLANNER_START_BUILDING_KEY) return false;
    return Boolean(isSourceComplete(link.from));
  });
}

export function snapPlannerCoord(value, size = PLANNER_SNAP_SIZE) {
  const step = Number(size) > 0 ? Number(size) : PLANNER_SNAP_SIZE;
  return Math.max(0, Math.round(Number(value) / step) * step);
}

export function snapPlannerPoint(point, size = PLANNER_SNAP_SIZE) {
  return {
    x: snapPlannerCoord(point?.x, size),
    y: snapPlannerCoord(point?.y, size),
  };
}

export function clampPlannerPoint(point, key) {
  const size = plannerNodeSize(key);
  const maxX = Math.max(0, PLANNER_BOARD_WIDTH - size.width);
  const maxY = Math.max(0, PLANNER_BOARD_HEIGHT - size.height);
  return snapPlannerPoint({
    x: Math.min(maxX, Math.max(0, Number(point?.x) || 0)),
    y: Math.min(maxY, Math.max(0, Number(point?.y) || 0)),
  });
}

export function clampPlannerPositions(positions) {
  const next = { ...(positions || {}) };
  for (const item of PLANNER_FLOW_ITEMS) {
    next[item.key] = clampPlannerPoint(next[item.key], item.key);
  }
  return next;
}

export function defaultPlannerPositions() {
  const positions = {};
  const stageAreaWidth = PLANNER_GRID_COLS * (PLANNER_RECT_WIDTH + PLANNER_GRID_GAP_X);
  positions[PLANNER_START_PROJECT_KEY] = {
    x: PLANNER_GRID_ORIGIN + stageAreaWidth,
    y: PLANNER_GRID_ORIGIN,
  };
  OVERVIEW_STATUS_HEADINGS.forEach((item, index) => {
    const col = index % PLANNER_GRID_COLS;
    const row = Math.floor(index / PLANNER_GRID_COLS);
    positions[item.key] = {
      x: PLANNER_GRID_ORIGIN + col * (PLANNER_RECT_WIDTH + PLANNER_GRID_GAP_X),
      y: PLANNER_GRID_ORIGIN + row * (PLANNER_RECT_HEIGHT + PLANNER_GRID_GAP_Y),
    };
  });
  const stageRows = Math.ceil(OVERVIEW_STATUS_HEADINGS.length / PLANNER_GRID_COLS);
  positions[PLANNER_START_BUILDING_KEY] = {
    x: PLANNER_GRID_ORIGIN + stageAreaWidth,
    y: PLANNER_GRID_ORIGIN + (stageRows - 1) * (PLANNER_RECT_HEIGHT + PLANNER_GRID_GAP_Y),
  };
  return clampPlannerPositions(positions);
}

export function plannerNodeSize(key) {
  if (key === PLANNER_START_BUILDING_KEY) {
    return { width: PLANNER_START_BUILDING_WIDTH, height: PLANNER_START_BUILDING_HEIGHT };
  }
  return { width: PLANNER_RECT_WIDTH, height: PLANNER_RECT_HEIGHT };
}

function plannerRectCenter(point, size) {
  return {
    x: (point?.x || 0) + size.width / 2,
    y: (point?.y || 0) + size.height / 2,
  };
}

function plannerBoxEdgeToward(center, other, size) {
  const dx = other.x - center.x;
  const dy = other.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const t = Math.min(
    dx === 0 ? Infinity : size.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : size.height / 2 / Math.abs(dy)
  );
  return {
    x: center.x + dx * t,
    y: center.y + dy * t,
  };
}

export function plannerBoardExtent(positions) {
  const content = PLANNER_FLOW_ITEMS.reduce(
    (extent, item) => {
      const point = positions[item.key] || { x: 0, y: 0 };
      const size = plannerNodeSize(item.key);
      return {
        width: Math.max(extent.width, point.x + size.width + PLANNER_GRID_ORIGIN + 80),
        height: Math.max(extent.height, point.y + size.height + PLANNER_GRID_ORIGIN + 80),
      };
    },
    { width: 0, height: 0 }
  );
  return {
    width: Math.max(PLANNER_BOARD_WIDTH, content.width),
    height: Math.max(PLANNER_BOARD_HEIGHT, content.height),
  };
}

export function buildDrawnPlannerLinks(positions, links) {
  const grouped = new Map();
  for (const link of links || []) {
    const pair = `${link.from}=>${link.to}`;
    if (!grouped.has(pair)) grouped.set(pair, []);
    grouped.get(pair).push(link);
  }
  const drawn = [];
  for (const group of grouped.values()) {
    group.forEach((link, index) => {
      const fromSize = plannerNodeSize(link.from);
      const toSize = plannerNodeSize(link.to);
      const from = plannerRectCenter(positions[link.from], fromSize);
      const to = plannerRectCenter(positions[link.to], toSize);
      const total = group.length;
      if (link.from === link.to) {
        const loop = 36 + index * 14;
        drawn.push({
          id: link.id,
          self: true,
          d: `M ${from.x + fromSize.width / 2} ${from.y - 10} C ${from.x + fromSize.width / 2 + loop} ${from.y - 28 - index * 8}, ${from.x + fromSize.width / 2 + loop} ${from.y + 28 + index * 8}, ${from.x + fromSize.width / 2} ${from.y + 10}`,
        });
        return;
      }
      const start = plannerBoxEdgeToward(from, to, fromSize);
      const end = plannerBoxEdgeToward(to, from, toSize);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const offset = (index - (total - 1) / 2) * 10;
      drawn.push({
        id: link.id,
        self: false,
        x1: start.x + nx * offset,
        y1: start.y + ny * offset,
        x2: end.x + nx * offset,
        y2: end.y + ny * offset,
      });
    });
  }
  return drawn;
}

