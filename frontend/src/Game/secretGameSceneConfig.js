import { polygonCentroid } from "./secretGameWalkPolygon";

/** @typedef {'top' | 'bottom' | 'left' | 'right'} EntrySide */
/** @typedef {{ x: number, z: number }} WalkPoint */
/** @typedef {{ top: WalkPoint | null, bottom: WalkPoint | null, left: WalkPoint | null, right: WalkPoint | null }} EntryPoints */
/** @typedef {{ top: string | null, bottom: string | null, left: string | null, right: string | null }} SceneLinks */
/** @typedef {{ walkPolygon: WalkPoint[], entryPoints: EntryPoints, sceneLinks: SceneLinks }} SecretSceneConfig */

export const ENTRY_SIDES = /** @type {const} */ (["top", "bottom", "left", "right"]);

const STORAGE_KEY = "secretGameSceneConfigs";

export const DEFAULT_ENTRY_POINTS = {
  top: null,
  bottom: null,
  left: null,
  right: null,
};

export const DEFAULT_SCENE_LINKS = {
  top: null,
  bottom: null,
  left: null,
  right: null,
};

export const DEFAULT_SCENE_CONFIG = {
  walkPolygon: [],
  entryPoints: { ...DEFAULT_ENTRY_POINTS },
  sceneLinks: { ...DEFAULT_SCENE_LINKS },
};

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function normalizePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return { x: point.x, z: point.z };
}

function normalizeEntryPoints(entryPoints) {
  const next = { ...DEFAULT_ENTRY_POINTS };
  if (!entryPoints || typeof entryPoints !== "object") return next;
  for (const side of ENTRY_SIDES) {
    next[side] = normalizePoint(entryPoints[side]);
  }
  return next;
}

function normalizeSceneLinks(sceneLinks) {
  const next = { ...DEFAULT_SCENE_LINKS };
  if (!sceneLinks || typeof sceneLinks !== "object") return next;
  for (const side of ENTRY_SIDES) {
    const value = sceneLinks[side];
    next[side] = value != null && String(value).trim() !== "" ? String(value) : null;
  }
  return next;
}

/** @returns {SecretSceneConfig} */
export function loadSceneConfig(sceneId) {
  const all = readAll();
  const saved = all[sceneId];
  if (!saved || typeof saved !== "object") {
    return {
      walkPolygon: [],
      entryPoints: { ...DEFAULT_ENTRY_POINTS },
      sceneLinks: { ...DEFAULT_SCENE_LINKS },
    };
  }
  const walkPolygon = Array.isArray(saved.walkPolygon)
    ? saved.walkPolygon
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))
        .map((p) => ({ x: p.x, z: p.z }))
    : [];
  return {
    walkPolygon,
    entryPoints: normalizeEntryPoints(saved.entryPoints),
    sceneLinks: normalizeSceneLinks(saved.sceneLinks),
  };
}

/** @param {SecretSceneConfig} config */
export function saveSceneConfig(sceneId, config) {
  const all = readAll();
  all[sceneId] = {
    walkPolygon: Array.isArray(config.walkPolygon)
      ? config.walkPolygon.map((p) => ({ x: p.x, z: p.z }))
      : [],
    entryPoints: normalizeEntryPoints(config.entryPoints),
    sceneLinks: normalizeSceneLinks(config.sceneLinks),
  };
  writeAll(all);
}

/** @param {Partial<SecretSceneConfig>} patch */
export function updateSceneConfig(sceneId, patch) {
  const current = loadSceneConfig(sceneId);
  saveSceneConfig(sceneId, {
    walkPolygon: patch.walkPolygon ?? current.walkPolygon,
    entryPoints: patch.entryPoints
      ? { ...current.entryPoints, ...normalizeEntryPoints(patch.entryPoints) }
      : current.entryPoints,
    sceneLinks: patch.sceneLinks
      ? { ...current.sceneLinks, ...normalizeSceneLinks(patch.sceneLinks) }
      : current.sceneLinks,
  });
}

/** When exiting a scene in `exitDirection`, spawn at the opposite entry on the next scene. */
export const OPPOSITE_ENTRY_SIDE = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** @param {SecretSceneConfig} config @param {EntrySide | null | undefined} exitDirection */
export function getSpawnPosition(config, exitDirection) {
  if (exitDirection && OPPOSITE_ENTRY_SIDE[exitDirection]) {
    const entrySide = OPPOSITE_ENTRY_SIDE[exitDirection];
    const point = config.entryPoints?.[entrySide];
    if (point) return { x: point.x, z: point.z };
  }
  return polygonCentroid(config.walkPolygon);
}

/** Linked scene id when exiting in `exitDirection`, or null. */
export function getLinkedSceneId(config, exitDirection) {
  if (!exitDirection) return null;
  return config.sceneLinks?.[exitDirection] ?? null;
}
