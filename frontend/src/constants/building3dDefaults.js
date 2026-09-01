/** Default rectangle unit used when there is no traced plan. Metres. */

import { normalizeElementVisibility, parseCladdingType } from "./buildingElements.js";

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
      { key: "joistCentresM", label: "Joist Centres", step: "0.005", min: "0.2", max: "1.2", column: 2 },
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
/** Bearer sits this far toward the upright plate from the pole centre. */
export const MEGA_ANCHOR_BEARER_TO_UPRIGHT_M = 0.01;
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
/** Particleboard structural floor on the joists. */
export const STRUCTURAL_FLOOR_THICKNESS_M = 0.02;
/** Painted baseboard boards wrapping the subfloor. */
export const BASEBOARD_HEIGHT_M = 0.2;
export const BASEBOARD_THICKNESS_M = 0.019;
export const BASEBOARD_GAP_M = 0.025;
/** Wall frame: 90 × 45 mm timber. 90 mm is wall depth (in from the edge). */
export const FRAME_TIMBER_DEPTH_M = 0.09;
export const FRAME_TIMBER_FACE_M = 0.045;
export const FRAME_STUD_CENTRES_M = 0.6;
/** Internal wall frame: same 90×45 timber, studs at 450 mm centres. */
export const INTERNAL_FRAME_STUD_CENTRES_M = 0.45;
/** Window lintel: 45 × 140 mm, centred on the 90 mm stud, spanning the opening. */
export const FRAME_WINDOW_LINTEL_HEIGHT_M = 0.14;
export const FRAME_WINDOW_LINTEL_THICKNESS_M = FRAME_TIMBER_FACE_M;
/** Lintel bears this far past each side of the window opening. */
export const FRAME_WINDOW_LINTEL_BEARING_M = 0.2;
/** Swing and sliding-door jambs sit this far outside the leaf so they do not punch through it. */
export const FRAME_SWING_DOOR_JAMB_OUTSET_M = 0.02;
/** Nogging centres sit half a 45 mm face above / below mid-wall so they meet at wall height / 2. */
export const FRAME_NOGGING_STAGGER_M = FRAME_TIMBER_FACE_M / 2;
/** Outer mega-anchor / bearer rows sit this far inside the building edge (each side). */
export const OUTER_BEARER_INSET_M = 0.05;
/** End mega-anchors on each bearer sit this far inside the short ends (along the long edge). */
export const OUTER_STUMP_END_INSET_M = 0.1;
/** Minimum stump / mega-anchor stack height. */
export const MIN_STUMP_HEIGHT_M = 0.02;

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

/** Stump / mega-anchor height fills whatever is left of Sub Floor Height. */
export function concreteStumpHeightM({
  subfloorHeightM,
  bearerHeightM,
  joistHeightM,
}) {
  const height =
    Number(subfloorHeightM) -
    STRUCTURAL_FLOOR_THICKNESS_M -
    Number(bearerHeightM) -
    Number(joistHeightM);
  if (!Number.isFinite(height)) return MIN_STUMP_HEIGHT_M;
  return Math.max(MIN_STUMP_HEIGHT_M, Math.round(height * 1000) / 1000);
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
  joistCentresM: 0.45,
  slabHeightM: 0.65,
  wallHeightM: 2.6,
  widthM: 11.3,
  depthM: 5.0,
  subfloorType: DEFAULT_SUBFLOOR_TYPE,
  stumpStyle: DEFAULT_STUMP_STYLE,
  showFence: true,
  showSubfloor: true,
  showWall: true,
  claddingType: "weatherboard",
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

/** Draft fields so the visibility menu can switch slab / stumps / mega-anchors. */
export function draftFieldsForSubfloorDrawType(drawType) {
  if (drawType === "slab") return { subfloorType: "slab" };
  if (drawType === "mega_anchors") {
    return { subfloorType: "stumps", stumpStyle: "mega_anchors" };
  }
  if (drawType === "concrete_stumps") {
    return { subfloorType: "stumps", stumpStyle: "concrete_stumps" };
  }
  return {};
}

export function subfloorHeightForDrawType(defaults, drawType) {
  const d = defaults && typeof defaults === "object" ? defaults : {};
  if (drawType === "slab") return d.slabHeightM ?? d.subfloorHeightM;
  return d.concreteStumpsHeightM ?? d.subfloorHeightM;
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
  const joistCentresM = clampMetres(
    src.joistCentresM,
    DEFAULT_BUILDING_3D.joistCentresM,
    0.2,
    1.2
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
    joistCentresM,
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
    claddingType: parseCladdingType(src.claddingType),
    showFence: elementVisibility.fence,
    showSubfloor: elementVisibility.footing,
    showWall: elementVisibility.cladding,
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
    joistCentresM: String(d.joistCentresM),
    slabHeightM: String(d.slabHeightM),
    wallHeightM: String(d.wallHeightM),
    widthM: String(d.widthM),
    depthM: String(d.depthM),
    subfloorType: d.subfloorType,
    stumpStyle: d.stumpStyle,
    elementVisibility: d.elementVisibility,
    claddingType: d.claddingType,
    showFence: d.showFence,
    showSubfloor: d.showSubfloor,
    showWall: d.showWall,
  };
}
