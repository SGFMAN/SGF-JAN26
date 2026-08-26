/** Default rectangle unit used when there is no traced plan. Metres. */

export const SUBFLOOR_TYPE_OPTIONS = [
  {
    key: "mega_anchors",
    label: "Mega Anchors",
    heightKey: "megaAnchorsHeightM",
    heightLabel: "Sub floor Height",
  },
  {
    key: "concrete_stumps",
    label: "Concrete Stumps",
    heightKey: "concreteStumpsHeightM",
    heightLabel: "Sub Floor Height",
  },
  {
    key: "slab",
    label: "Slab",
    heightKey: "slabHeightM",
    heightLabel: "Slab Height",
  },
];

export const DEFAULT_SUBFLOOR_TYPE = "slab";

export const DEFAULT_BUILDING_3D = {
  subfloorHeightM: 0.65,
  megaAnchorsHeightM: 0.65,
  concreteStumpsHeightM: 0.65,
  slabHeightM: 0.65,
  wallHeightM: 2.6,
  widthM: 11.3,
  depthM: 5.0,
  subfloorType: DEFAULT_SUBFLOOR_TYPE,
  showFence: true,
  showSubfloor: true,
  showWall: true,
};

function clampMetres(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n * 1000) / 1000;
  return Math.min(max, Math.max(min, rounded));
}

function normalizeSubfloorType(value) {
  const key = String(value || "").trim();
  if (SUBFLOOR_TYPE_OPTIONS.some((option) => option.key === key)) return key;
  return DEFAULT_SUBFLOOR_TYPE;
}

function normalizeVisibleFlag(value) {
  if (value === false || value === 0 || value === "0" || value === "false" || value === "hide") {
    return false;
  }
  return true;
}

function heightForSubfloorType(type, heights) {
  if (type === "mega_anchors") return heights.megaAnchorsHeightM;
  if (type === "concrete_stumps") return heights.concreteStumpsHeightM;
  return heights.slabHeightM;
}

export function normalizeBuilding3dDefaults(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const legacyHeight = clampMetres(
    src.subfloorHeightM ?? src.subfloorDepthM,
    DEFAULT_BUILDING_3D.subfloorHeightM,
    0.15,
    3
  );
  const megaAnchorsHeightM = clampMetres(src.megaAnchorsHeightM, legacyHeight, 0.15, 3);
  const concreteStumpsHeightM = clampMetres(src.concreteStumpsHeightM, legacyHeight, 0.15, 3);
  const slabHeightM = clampMetres(src.slabHeightM, legacyHeight, 0.15, 3);
  const subfloorType = normalizeSubfloorType(src.subfloorType);
  return {
    megaAnchorsHeightM,
    concreteStumpsHeightM,
    slabHeightM,
    subfloorHeightM: heightForSubfloorType(subfloorType, {
      megaAnchorsHeightM,
      concreteStumpsHeightM,
      slabHeightM,
    }),
    wallHeightM: clampMetres(src.wallHeightM, DEFAULT_BUILDING_3D.wallHeightM, 1.5, 6),
    widthM: clampMetres(src.widthM ?? src.lengthM, DEFAULT_BUILDING_3D.widthM, 2, 40),
    depthM: clampMetres(src.depthM ?? src.buildingWidthM, DEFAULT_BUILDING_3D.depthM, 2, 20),
    subfloorType,
    showFence: normalizeVisibleFlag(src.showFence),
    showSubfloor: normalizeVisibleFlag(src.showSubfloor),
    showWall: normalizeVisibleFlag(src.showWall),
  };
}

export function building3dDraftFromDefaults(defaults) {
  const d = normalizeBuilding3dDefaults(defaults);
  return {
    subfloorHeightM: String(d.subfloorHeightM),
    megaAnchorsHeightM: String(d.megaAnchorsHeightM),
    concreteStumpsHeightM: String(d.concreteStumpsHeightM),
    slabHeightM: String(d.slabHeightM),
    wallHeightM: String(d.wallHeightM),
    widthM: String(d.widthM),
    depthM: String(d.depthM),
    subfloorType: d.subfloorType,
    showFence: d.showFence,
    showSubfloor: d.showSubfloor,
    showWall: d.showWall,
  };
}
