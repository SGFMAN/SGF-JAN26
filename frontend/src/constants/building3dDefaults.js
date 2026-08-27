/** Default rectangle unit used when there is no traced plan. Metres. */

import { normalizeElementVisibility } from "./buildingElements.js";

export const STUMP_STYLE_OPTIONS = [
  { key: "mega_anchors", label: "Mega-Anchors" },
  { key: "concrete_stumps", label: "Concrete Stumps" },
];

export const DEFAULT_STUMP_STYLE = "concrete_stumps";

export const SUBFLOOR_TYPE_OPTIONS = [
  {
    key: "stumps",
    label: "Stumps",
    heightKey: "concreteStumpsHeightM",
    heightLabel: "Sub Floor Height",
    extraFields: [
      { key: "bearerHeightM", label: "Bearer Height", step: "0.005", min: "0.02", max: "0.6" },
      { key: "joistHeightM", label: "Joist Height", step: "0.005", min: "0.02", max: "0.6" },
      { key: "bearerWidthM", label: "Bearer Width", step: "0.005", min: "0.02", max: "0.3" },
      { key: "joistWidthM", label: "Joist Width", step: "0.005", min: "0.02", max: "0.3" },
      { key: "bearerSpanMaxM", label: "Bearer Span Max", step: "0.05", min: "0.3", max: "8" },
      { key: "joistSpanMaxM", label: "Joist Span Max", step: "0.05", min: "0.3", max: "8" },
    ],
    includeStumpStyle: true,
  },
  {
    key: "slab",
    label: "Slab",
    heightKey: "slabHeightM",
    heightLabel: "Slab Height",
  },
];

export const DEFAULT_SUBFLOOR_TYPE = "slab";

/** Concrete stump plan size. */
export const CONCRETE_STUMP_SIZE_M = 0.1;
/** Mega-anchor cylinder diameter. */
export const MEGA_ANCHOR_DIAMETER_M = 0.05;
/** Steel cap plate on top of the riser. */
export const MEGA_ANCHOR_PLATE_SIZE_M = 0.075;
export const MEGA_ANCHOR_PLATE_THICKNESS_M = 0.005;
/** Splayed ground piles. */
export const MEGA_ANCHOR_PILE_DIAMETER_M = 0.03;
/** Visible pile height above ground. */
export const MEGA_ANCHOR_PILE_VISIBLE_M = 0.07;
/** Typical driven pile depth below ground. */
export const MEGA_ANCHOR_PILE_BELOW_M = 0.9;
/** Tilt from vertical so the three piles splay outward. */
export const MEGA_ANCHOR_PILE_TILT_RAD = (30 * Math.PI) / 180;
/** Extra tilt in the other vertical plane: when a pile lines up with the riser it rakes backward. */
export const MEGA_ANCHOR_PILE_RAKE_RAD = (30 * Math.PI) / 180;
/** Packer / gap below the bearer. */
export const CONCRETE_STUMP_PACKING_M = 0.02;

/**
 * Bearers run along the long side of the building. Joists run 90° to that.
 * `widthM` is building length (X); `depthM` is building width (Z).
 * If width is longer than length, bearers run along Z; otherwise along X.
 */
export function bearerRunAxis(widthM, depthM) {
  const length = Number(widthM) || 0;
  const width = Number(depthM) || 0;
  return width > length ? "z" : "x";
}

export function concreteStumpHeightM({
  subfloorHeightM,
  bearerHeightM,
  joistHeightM,
}) {
  const height =
    Number(subfloorHeightM) -
    Number(bearerHeightM) -
    Number(joistHeightM) -
    CONCRETE_STUMP_PACKING_M;
  if (!Number.isFinite(height)) return CONCRETE_STUMP_PACKING_M;
  return Math.max(CONCRETE_STUMP_PACKING_M, Math.round(height * 1000) / 1000);
}

export const DEFAULT_BUILDING_3D = {
  subfloorHeightM: 0.65,
  megaAnchorsHeightM: 0.65,
  concreteStumpsHeightM: 0.65,
  bearerHeightM: 0.14,
  joistHeightM: 0.09,
  bearerWidthM: 0.045,
  joistWidthM: 0.045,
  bearerSpanMaxM: 1.8,
  joistSpanMaxM: 2.4,
  slabHeightM: 0.65,
  wallHeightM: 2.6,
  widthM: 11.3,
  depthM: 5.0,
  subfloorType: DEFAULT_SUBFLOOR_TYPE,
  stumpStyle: DEFAULT_STUMP_STYLE,
  showFence: true,
  showSubfloor: true,
  showWall: true,
  elementVisibility: normalizeElementVisibility({}),
};

function clampMetres(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n * 1000) / 1000;
  return Math.min(max, Math.max(min, rounded));
}

function normalizeSubfloorType(value) {
  const key = String(value || "").trim();
  if (key === "stumps" || key === "slab") return key;
  if (key === "mega_anchors" || key === "concrete_stumps") return "stumps";
  return DEFAULT_SUBFLOOR_TYPE;
}

function normalizeStumpStyle(value, rawSubfloorType) {
  const key = String(value || "").trim();
  if (STUMP_STYLE_OPTIONS.some((option) => option.key === key)) return key;
  if (rawSubfloorType === "mega_anchors") return "mega_anchors";
  if (rawSubfloorType === "concrete_stumps") return "concrete_stumps";
  return DEFAULT_STUMP_STYLE;
}

function normalizeVisibleFlag(value) {
  if (value === false || value === 0 || value === "0" || value === "false" || value === "hide") {
    return false;
  }
  return true;
}

function heightForSubfloorType(type, heights) {
  if (type === "stumps") return heights.concreteStumpsHeightM;
  return heights.slabHeightM;
}

/** Draw type for the 3D viewer: slab | mega_anchors | concrete_stumps. */
export function resolvedSubfloorDrawType(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  if (normalizeSubfloorType(d.subfloorType) === "slab") return "slab";
  return normalizeStumpStyle(d.stumpStyle, d.subfloorType);
}

export function normalizeBuilding3dDefaults(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rawSubfloorType = String(src.subfloorType || "").trim();
  const legacyHeight = clampMetres(
    src.subfloorHeightM ?? src.subfloorDepthM,
    DEFAULT_BUILDING_3D.subfloorHeightM,
    0.15,
    3
  );
  const megaAnchorsHeightM = clampMetres(src.megaAnchorsHeightM, legacyHeight, 0.15, 3);
  let concreteStumpsHeightM = clampMetres(src.concreteStumpsHeightM, legacyHeight, 0.15, 3);
  if (rawSubfloorType === "mega_anchors" && src.stumpStyle == null) {
    concreteStumpsHeightM = megaAnchorsHeightM;
  }
  const slabHeightM = clampMetres(src.slabHeightM, legacyHeight, 0.15, 3);
  const bearerHeightM = clampMetres(
    src.bearerHeightM,
    DEFAULT_BUILDING_3D.bearerHeightM,
    0.02,
    0.6
  );
  const joistHeightM = clampMetres(
    src.joistHeightM,
    DEFAULT_BUILDING_3D.joistHeightM,
    0.02,
    0.6
  );
  const bearerWidthM = clampMetres(
    src.bearerWidthM,
    DEFAULT_BUILDING_3D.bearerWidthM,
    0.02,
    0.3
  );
  const joistWidthM = clampMetres(
    src.joistWidthM,
    DEFAULT_BUILDING_3D.joistWidthM,
    0.02,
    0.3
  );
  const bearerSpanMaxM = clampMetres(
    src.bearerSpanMaxM,
    DEFAULT_BUILDING_3D.bearerSpanMaxM,
    0.3,
    8
  );
  const joistSpanMaxM = clampMetres(
    src.joistSpanMaxM,
    DEFAULT_BUILDING_3D.joistSpanMaxM,
    0.3,
    8
  );
  const subfloorType = normalizeSubfloorType(rawSubfloorType);
  const stumpStyle = normalizeStumpStyle(src.stumpStyle, rawSubfloorType);
  const stumpsHeightM = concreteStumpsHeightM;
  const showFenceFlag = normalizeVisibleFlag(src.showFence);
  const showSubfloorFlag = normalizeVisibleFlag(src.showSubfloor);
  const showWallFlag = normalizeVisibleFlag(src.showWall);
  const elementVisibility = normalizeElementVisibility(src.elementVisibility, {
    showFence: showFenceFlag,
    showSubfloor: showSubfloorFlag,
    showWall: showWallFlag,
  });
  return {
    megaAnchorsHeightM: stumpsHeightM,
    concreteStumpsHeightM: stumpsHeightM,
    bearerHeightM,
    joistHeightM,
    bearerWidthM,
    joistWidthM,
    bearerSpanMaxM,
    joistSpanMaxM,
    slabHeightM,
    subfloorHeightM: heightForSubfloorType(subfloorType, {
      concreteStumpsHeightM: stumpsHeightM,
      slabHeightM,
    }),
    wallHeightM: clampMetres(src.wallHeightM, DEFAULT_BUILDING_3D.wallHeightM, 1.5, 6),
    widthM: clampMetres(src.widthM ?? src.lengthM, DEFAULT_BUILDING_3D.widthM, 2, 40),
    depthM: clampMetres(src.depthM ?? src.buildingWidthM, DEFAULT_BUILDING_3D.depthM, 2, 20),
    subfloorType,
    stumpStyle,
    elementVisibility,
    showFence: elementVisibility.fence,
    showSubfloor: elementVisibility.slab,
    showWall: elementVisibility.wall,
  };
}

export function building3dDraftFromDefaults(defaults) {
  const d = normalizeBuilding3dDefaults(defaults);
  return {
    subfloorHeightM: String(d.subfloorHeightM),
    megaAnchorsHeightM: String(d.megaAnchorsHeightM),
    concreteStumpsHeightM: String(d.concreteStumpsHeightM),
    bearerHeightM: String(d.bearerHeightM),
    joistHeightM: String(d.joistHeightM),
    bearerWidthM: String(d.bearerWidthM),
    joistWidthM: String(d.joistWidthM),
    bearerSpanMaxM: String(d.bearerSpanMaxM),
    joistSpanMaxM: String(d.joistSpanMaxM),
    slabHeightM: String(d.slabHeightM),
    wallHeightM: String(d.wallHeightM),
    widthM: String(d.widthM),
    depthM: String(d.depthM),
    subfloorType: d.subfloorType,
    stumpStyle: d.stumpStyle,
    elementVisibility: d.elementVisibility,
    showFence: d.showFence,
    showSubfloor: d.showSubfloor,
    showWall: d.showWall,
  };
}
