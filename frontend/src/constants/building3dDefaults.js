/** Default rectangle unit used when there is no traced plan. Metres. */

export const DEFAULT_BUILDING_3D = {
  subfloorHeightM: 0.65,
  wallHeightM: 2.6,
  widthM: 11.3,
  depthM: 5.0,
};

function clampMetres(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n * 1000) / 1000;
  return Math.min(max, Math.max(min, rounded));
}

export function normalizeBuilding3dDefaults(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    subfloorHeightM: clampMetres(
      src.subfloorHeightM ?? src.subfloorDepthM,
      DEFAULT_BUILDING_3D.subfloorHeightM,
      0.15,
      3
    ),
    wallHeightM: clampMetres(src.wallHeightM, DEFAULT_BUILDING_3D.wallHeightM, 1.5, 6),
    widthM: clampMetres(src.widthM ?? src.lengthM, DEFAULT_BUILDING_3D.widthM, 2, 40),
    depthM: clampMetres(src.depthM ?? src.buildingWidthM, DEFAULT_BUILDING_3D.depthM, 2, 20),
  };
}

export function building3dDraftFromDefaults(defaults) {
  const d = normalizeBuilding3dDefaults(defaults);
  return {
    subfloorHeightM: String(d.subfloorHeightM),
    wallHeightM: String(d.wallHeightM),
    widthM: String(d.widthM),
    depthM: String(d.depthM),
  };
}
