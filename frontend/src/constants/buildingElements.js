/** Colour Settings → Building Elements: model part types that can take a material. */

export const BUILDING_ELEMENT_GROUPS = [
  {
    id: "subfloor",
    label: "Subfloor",
    items: [
      { key: "slab", label: "Slab" },
      { key: "concrete-stumps", label: "Concrete Stumps" },
      { key: "mega-anchors", label: "Mega-Anchors" },
      { key: "bearers", label: "Bearers" },
      { key: "joists", label: "Joists" },
      { key: "structural-floor", label: "Structural Floor" },
      { key: "baseboards", label: "Baseboards" },
    ],
  },
  {
    id: "wall",
    label: "Wall",
    items: [
      { key: "frame", label: "Frame" },
      { key: "weatherboards", label: "Weatherboards" },
      { key: "internal-wall-lining", label: "Internal Wall Lining" },
      { key: "windows", label: "Windows" },
      { key: "sliding-doors", label: "Sliding glass door" },
      { key: "doors", label: "External Door" },
    ],
  },
];

export const BUILDING_ELEMENT_KEYS = BUILDING_ELEMENT_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key)
);

/** Extra 3D parts that can be shown/hidden but are not material rows. */
export const BUILDING_ELEMENT_VISIBILITY_WALL_EXTRA = [
  { key: "internal-doors", label: "Internal Doors" },
];

export const BUILDING_ELEMENT_VISIBILITY_OTHER = [
  { key: "roof", label: "Affordable Roof" },
  { key: "deck", label: "Deck" },
  { key: "kitchen", label: "Kitchen" },
  { key: "robes", label: "Robes" },
  { key: "flooring", label: "Flooring" },
  { key: "fence", label: "Fence" },
];

export const BUILDING_ELEMENT_VISIBILITY_EXTRA = [
  ...BUILDING_ELEMENT_VISIBILITY_WALL_EXTRA,
  ...BUILDING_ELEMENT_VISIBILITY_OTHER,
];

export const BUILDING_ELEMENT_VISIBILITY_GROUPS = [
  ...BUILDING_ELEMENT_GROUPS.map((group) => {
    if (group.id === "subfloor") {
      const items = Object.fromEntries(group.items.map((item) => [item.key, item]));
      return {
        id: "footing",
        label: "Footing",
        items: [
          { key: "footing", label: "Footing" },
          items.bearers,
          items.joists,
          items["structural-floor"],
          items.baseboards,
        ].filter(Boolean),
      };
    }
    if (group.id !== "wall") return group;
    const wallItems = Object.fromEntries(group.items.map((item) => [item.key, item]));
    return {
      ...group,
      items: [
        wallItems.frame,
        wallItems["internal-wall-lining"],
        wallItems.windows,
        wallItems.doors,
        wallItems["sliding-doors"],
        { key: "internal-doors", label: "Internal Doors" },
      ].filter(Boolean),
    };
  }),
  {
    id: "cladding",
    label: "Cladding",
    items: [{ key: "cladding", label: "Cladding" }],
  },
  {
    id: "other",
    label: "Other",
    items: BUILDING_ELEMENT_VISIBILITY_OTHER,
  },
];

export const CLADDING_TYPE_WEATHERBOARD = "weatherboard";
export const CLADDING_TYPE_DURAGROOVE = "duragroove";

export const CLADDING_TYPE_OPTIONS = [
  { key: CLADDING_TYPE_WEATHERBOARD, label: "Weatherboard" },
  { key: CLADDING_TYPE_DURAGROOVE, label: "Duragroove" },
];

export function parseCladdingType(raw) {
  return raw === CLADDING_TYPE_DURAGROOVE
    ? CLADDING_TYPE_DURAGROOVE
    : CLADDING_TYPE_WEATHERBOARD;
}

export const FOOTING_TYPE_SLAB = "slab";
export const FOOTING_TYPE_MEGA_ANCHORS = "mega_anchors";
export const FOOTING_TYPE_CONCRETE_STUMPS = "concrete_stumps";

export const FOOTING_TYPE_OPTIONS = [
  { key: FOOTING_TYPE_SLAB, label: "Slab" },
  { key: FOOTING_TYPE_MEGA_ANCHORS, label: "Mega-Anchors" },
  { key: FOOTING_TYPE_CONCRETE_STUMPS, label: "Concrete Stumps" },
];

export function parseFootingType(raw) {
  if (raw === FOOTING_TYPE_MEGA_ANCHORS || raw === "mega-anchors") {
    return FOOTING_TYPE_MEGA_ANCHORS;
  }
  if (raw === FOOTING_TYPE_CONCRETE_STUMPS || raw === "concrete-stumps" || raw === "stumps") {
    return FOOTING_TYPE_CONCRETE_STUMPS;
  }
  return FOOTING_TYPE_SLAB;
}

/** 3D parts that belong to the Footing toggle. */
export const FOOTING_VISIBILITY_KEYS = [
  "slab",
  "concrete-stumps",
  "mega-anchors",
  "bearers",
  "joists",
  "structural-floor",
  "baseboards",
];

/** Kept in saved visibility JSON; Frame now covers internal wall frames. */
export const BUILDING_ELEMENT_VISIBILITY_LEGACY_KEYS = ["wall", "internal-walls"];

export const BUILDING_ELEMENT_VISIBILITY_KEYS = [
  ...BUILDING_ELEMENT_KEYS,
  ...BUILDING_ELEMENT_VISIBILITY_EXTRA.map((item) => item.key),
  ...BUILDING_ELEMENT_VISIBILITY_LEGACY_KEYS,
  "cladding",
  "footing",
];

/** Visibility keys that do not apply to a slab subfloor. */
export const SLAB_HIDDEN_VISIBILITY_KEYS = [
  "bearers",
  "joists",
  "structural-floor",
  "baseboards",
];

const VIS_KEY_TO_SUBFLOOR_DRAW = {
  slab: "slab",
  "concrete-stumps": "concrete_stumps",
  "mega-anchors": "mega_anchors",
};

export function subfloorDrawTypeForVisibilityKey(key) {
  return VIS_KEY_TO_SUBFLOOR_DRAW[key] || null;
}

export function isSlabHiddenVisibilityKey(key) {
  return SLAB_HIDDEN_VISIBILITY_KEYS.includes(key);
}

/** Show the chosen foundation and, for slab, hide timber-floor layers. */
export function visibilityAfterSubfloorDrawType(visibility, drawType) {
  const vis = normalizeElementVisibility(visibility);
  const next = { ...vis, footing: vis.footing !== false };
  if (drawType === "slab") {
    next.slab = true;
    next["concrete-stumps"] = false;
    next["mega-anchors"] = false;
    for (const key of SLAB_HIDDEN_VISIBILITY_KEYS) next[key] = false;
  } else if (drawType === "concrete_stumps" || drawType === "mega_anchors") {
    next.slab = false;
    next["mega-anchors"] = drawType === "mega_anchors";
    next["concrete-stumps"] = drawType === "concrete_stumps";
    for (const key of SLAB_HIDDEN_VISIBILITY_KEYS) next[key] = true;
  }
  return next;
}

export function emptyBuildingElementMaterials() {
  const out = {};
  for (const key of BUILDING_ELEMENT_KEYS) out[key] = "";
  return out;
}

export function normalizeBuildingElementMaterials(raw) {
  const base = emptyBuildingElementMaterials();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  for (const key of BUILDING_ELEMENT_KEYS) {
    if (raw[key] == null || raw[key] === "") continue;
    const id = Number(raw[key]);
    if (Number.isFinite(id) && id > 0) base[key] = String(id);
  }
  return base;
}

export function emptyElementVisibility() {
  const out = {};
  for (const key of BUILDING_ELEMENT_VISIBILITY_KEYS) out[key] = true;
  return out;
}

function flagOn(value) {
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  return null;
}

export function normalizeElementVisibility(raw, fallback = {}) {
  const base = emptyElementVisibility();
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  for (const key of BUILDING_ELEMENT_VISIBILITY_KEYS) {
    let explicit = flagOn(src[key]);
    if (explicit == null && key === "cladding") {
      explicit = flagOn(src.weatherboards) ?? flagOn(src.wall);
    }
    if (explicit == null && key === "weatherboards") {
      explicit = flagOn(src.cladding) ?? flagOn(src.wall);
    }
    if (explicit == null && key === "wall") {
      explicit = flagOn(src.cladding) ?? flagOn(src.weatherboards);
    }
    if (explicit == null && key === "footing") {
      const slabOn = flagOn(src.slab);
      const stumpsOn = flagOn(src["concrete-stumps"]);
      const anchorsOn = flagOn(src["mega-anchors"]);
      if (slabOn === true || stumpsOn === true || anchorsOn === true) explicit = true;
      else if (slabOn === false && stumpsOn === false && anchorsOn === false) {
        explicit = false;
      }
    }
    if (explicit != null) {
      base[key] = explicit;
      continue;
    }
    if (key === "fence" && fallback.showFence === false) base[key] = false;
    else if (
      (key === "wall" || key === "weatherboards" || key === "cladding") &&
      fallback.showWall === false
    ) {
      base[key] = false;
    }
    else if (
      (key === "footing" ||
        key === "slab" ||
        key === "concrete-stumps" ||
        key === "mega-anchors" ||
        key === "bearers" ||
        key === "joists") &&
      fallback.showSubfloor === false
    ) {
      base[key] = false;
    }
  }
  // One Frame toggle covers external and internal wall frames.
  base["internal-walls"] = base.frame;
  // Cladding toggle covers weatherboards / Duragroove and the legacy wall key.
  const claddingOn = base.cladding !== false && base.weatherboards !== false;
  base.cladding = claddingOn;
  base.weatherboards = claddingOn;
  base.wall = claddingOn;
  return base;
}

const VISUALISER_VIEW_STORAGE_PREFIX = "sgf.3dVisualiser.view.";
const SUBFLOOR_DRAW_TYPES = new Set(["slab", "concrete_stumps", "mega_anchors"]);

function visualiserViewStorageKey(projectId) {
  return VISUALISER_VIEW_STORAGE_PREFIX + String(projectId);
}

/** Last 3D visibility checkboxes + subfloor type for this project (localStorage). */
export function loadVisualiserViewPrefs(projectId) {
  if (!projectId) return null;
  try {
    const raw = localStorage.getItem(visualiserViewStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const subfloorType = SUBFLOOR_DRAW_TYPES.has(parsed.subfloorType)
      ? parsed.subfloorType
      : null;
    const visibility =
      parsed.visibility &&
      typeof parsed.visibility === "object" &&
      !Array.isArray(parsed.visibility)
        ? parsed.visibility
        : null;
    const claddingType = parseCladdingType(parsed.claddingType);
    if (!visibility && !subfloorType && !parsed.claddingType) return null;
    return { visibility, subfloorType, claddingType };
  } catch {
    return null;
  }
}

export function saveVisualiserViewPrefs(projectId, { visibility, subfloorType, claddingType } = {}) {
  if (!projectId) return;
  try {
    localStorage.setItem(
      visualiserViewStorageKey(projectId),
      JSON.stringify({
        visibility: normalizeElementVisibility(visibility),
        subfloorType: SUBFLOOR_DRAW_TYPES.has(subfloorType) ? subfloorType : null,
        claddingType: parseCladdingType(claddingType),
      })
    );
  } catch {
    // Private mode / quota — visibility still works for this session.
  }
}
