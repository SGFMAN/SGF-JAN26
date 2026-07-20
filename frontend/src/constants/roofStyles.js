/** Roof style dropdown options on the Colours page. */
export const COLOURS_ROOF_STYLE_OPTIONS = Object.freeze([
  "Select",
  "Affordable",
  "Superior - Gable",
  "Superior - Skillion",
  "Superior - Hipped",
]);

export const ROOF_STYLE_AFFORDABLE = "Affordable";
export const ROOF_STYLE_SUPERIOR_GABLE = "Superior - Gable";
export const ROOF_STYLE_SUPERIOR_SKILLION = "Superior - Skillion";
export const ROOF_STYLE_SUPERIOR_HIPPED = "Superior - Hipped";

/**
 * Pitch (degrees) per roof style.
 * Affordable / Gable filled in when those roofs are built.
 */
export const ROOF_PITCH_DEG = Object.freeze({
  [ROOF_STYLE_SUPERIOR_SKILLION]: 5,
  [ROOF_STYLE_SUPERIOR_HIPPED]: 15,
});

/** Map legacy saved values to current option labels. */
export function normalizeRoofStyle(value) {
  const raw = value && String(value).trim() ? String(value).trim() : "Select";
  if (raw === "Superior") return ROOF_STYLE_SUPERIOR_HIPPED;
  if (raw === "Skillion") return ROOF_STYLE_SUPERIOR_SKILLION;
  return raw;
}

/** @returns {number | null} */
export function roofPitchDegForStyle(roofStyle) {
  const key = normalizeRoofStyle(roofStyle);
  const deg = ROOF_PITCH_DEG[key];
  return Number.isFinite(deg) ? deg : null;
}

/** Full hipped roof planes (not slab-only). */
export function isSuperiorHippedRoofStyle(roofStyle) {
  return normalizeRoofStyle(roofStyle) === ROOF_STYLE_SUPERIOR_HIPPED;
}

/** Pitched 400 mm skillion roof slab. */
export function isSuperiorSkillionRoofStyle(roofStyle) {
  return normalizeRoofStyle(roofStyle) === ROOF_STYLE_SUPERIOR_SKILLION;
}
