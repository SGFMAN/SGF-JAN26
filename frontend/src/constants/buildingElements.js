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
    ],
  },
];

export const BUILDING_ELEMENT_KEYS = BUILDING_ELEMENT_GROUPS.flatMap((group) =>
  group.items.map((item) => item.key)
);

/** Extra 3D parts that can be shown/hidden but are not material rows. */
export const BUILDING_ELEMENT_VISIBILITY_EXTRA = [
  { key: "wall", label: "Wall" },
  { key: "fence", label: "Fence" },
];

export const BUILDING_ELEMENT_VISIBILITY_GROUPS = [
  ...BUILDING_ELEMENT_GROUPS,
  {
    id: "other",
    label: "Other",
    items: BUILDING_ELEMENT_VISIBILITY_EXTRA,
  },
];

export const BUILDING_ELEMENT_VISIBILITY_KEYS = [
  ...BUILDING_ELEMENT_KEYS,
  ...BUILDING_ELEMENT_VISIBILITY_EXTRA.map((item) => item.key),
];

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
    const explicit = flagOn(src[key]);
    if (explicit != null) {
      base[key] = explicit;
      continue;
    }
    if (key === "fence" && fallback.showFence === false) base[key] = false;
    else if (key === "wall" && fallback.showWall === false) base[key] = false;
    else if (
      (key === "slab" ||
        key === "concrete-stumps" ||
        key === "mega-anchors" ||
        key === "bearers" ||
        key === "joists") &&
      fallback.showSubfloor === false
    ) {
      base[key] = false;
    }
  }
  return base;
}
