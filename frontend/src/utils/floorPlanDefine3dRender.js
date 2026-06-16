import {
  buildFloorPlanPolygonFootprintPositions,
  sanitizeDefine3DPolygonPixels,
} from "./siteBoundaryMesh";
import { floorPlanPixelToLocalEN } from "./floorPlanMap";

/** Image pixel size from saved define3d data or plan metadata (no PNG load). */
export function resolvePlanImagePixelSize(plan) {
  const define3d = plan?.define3d;
  let imageWidth = Number(define3d?.imageWidth ?? plan?.imageWidth);
  let imageHeight = Number(define3d?.imageHeight ?? plan?.imageHeight);

  const polygons = define3d?.externalWallPolygons ?? [];
  if ((!imageWidth || !imageHeight) && polygons.length) {
    let maxX = 0;
    let maxY = 0;
    for (const polygon of polygons) {
      for (const pt of polygon) {
        if (Number.isFinite(pt?.x)) maxX = Math.max(maxX, pt.x);
        if (Number.isFinite(pt?.y)) maxY = Math.max(maxY, pt.y);
      }
    }
    if (!imageWidth && maxX > 0) imageWidth = maxX;
    if (!imageHeight && maxY > 0) imageHeight = maxY;
  }

  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth < 1 || imageHeight < 1) {
    return null;
  }
  return { imageWidth, imageHeight };
}

/**
 * Same output shape as buildFloorPlanOutlineLinePositions, but corners come from
 * the first saved external-wall polygon instead of the full image rectangle.
 */
export function buildFloorPlanOutlineFromDefine3D(
  ring,
  siteCornerLevels,
  centerLat,
  centerLng,
  plan,
  bearingDeg = 0
) {
  const polygon = plan?.define3d?.externalWallPolygons?.[0];
  if (!polygon?.length || polygon.length < 3) return null;

  const pixelSize = resolvePlanImagePixelSize(plan);
  const metersPerPixel = plan?.scale?.metersPerPixel;
  if (!pixelSize || !metersPerPixel) return null;

  const { imageWidth, imageHeight } = pixelSize;
  const widthM = imageWidth * metersPerPixel;
  const heightM = imageHeight * metersPerPixel;

  const sanitized = sanitizeDefine3DPolygonPixels(polygon, imageWidth, imageHeight);
  if (!sanitized) return null;

  const footprint = buildFloorPlanPolygonFootprintPositions(
    ring,
    siteCornerLevels,
    centerLat,
    centerLng,
    sanitized,
    imageWidth,
    imageHeight,
    widthM,
    heightM,
    bearingDeg
  );
  if (!footprint) return null;

  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const pt of sanitized) {
    const { eastM, northM } = floorPlanPixelToLocalEN(
      pt.x,
      pt.y,
      imageWidth,
      imageHeight,
      widthM,
      heightM
    );
    minE = Math.min(minE, eastM);
    maxE = Math.max(maxE, eastM);
    minN = Math.min(minN, northM);
    maxN = Math.max(maxN, northM);
  }

  const roofWidthM = Math.max(maxE - minE, 0.5);
  const roofHeightM = Math.max(maxN - minN, 0.5);

  return {
    positions: footprint.positions,
    outlineYM: footprint.outlineYM,
    grassTopYM: footprint.grassTopYM,
    roofWidthM,
    roofHeightM,
  };
}
