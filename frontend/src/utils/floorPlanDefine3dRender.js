import {
  computeDefine3DPlacementHeights,
  DEFINE3D_MAX_INTERNAL_SEGMENTS,
  FLOOR_PLAN_EXTERNAL_WALL_THICKNESS_M,
  FLOOR_PLAN_INTERNAL_WALL_THICKNESS_M,
  FLOOR_PLAN_UPPER_HEIGHT_M,
  getSiteMeshFrame,
  latLngToSiteLocalXZ,
  sanitizeDefine3DPolygonPixels,
} from "./siteBoundaryMesh";
import { floorPlanPixelToLatLng } from "./floorPlanMap";

/** Resolve saved Define 3D wall data + image pixel size from the plan record only (no image fetch). */
export function resolveDefine3DWallContext(plan) {
  const define3d = plan?.define3d;
  const externalWallPolygons = define3d?.externalWallPolygons ?? [];
  const internalWallSegments = define3d?.internalWallSegments ?? [];
  if (!externalWallPolygons.length && !internalWallSegments.length) {
    return null;
  }

  const metersPerPixel = plan?.scale?.metersPerPixel;
  const imageWidth = Number(define3d?.imageWidth ?? plan?.imageWidth);
  const imageHeight = Number(define3d?.imageHeight ?? plan?.imageHeight);
  if (!metersPerPixel || !Number.isFinite(imageWidth) || !Number.isFinite(imageHeight)) {
    return null;
  }
  if (imageWidth < 1 || imageHeight < 1) return null;

  return {
    externalWallPolygons,
    internalWallSegments,
    imageWidth,
    imageHeight,
    widthM: imageWidth * metersPerPixel,
    heightM: imageHeight * metersPerPixel,
  };
}

function segmentPixelsToSiteXZ(
  ring,
  centerLat,
  centerLng,
  segmentPixels,
  imageWidth,
  imageHeight,
  widthM,
  heightM,
  bearingDeg
) {
  const frame = getSiteMeshFrame(ring);
  if (!frame || segmentPixels?.length !== 2) return null;

  const start = floorPlanPixelToLatLng(
    segmentPixels[0].x,
    segmentPixels[0].y,
    centerLat,
    centerLng,
    imageWidth,
    imageHeight,
    widthM,
    heightM,
    bearingDeg
  );
  const end = floorPlanPixelToLatLng(
    segmentPixels[1].x,
    segmentPixels[1].y,
    centerLat,
    centerLng,
    imageWidth,
    imageHeight,
    widthM,
    heightM,
    bearingDeg
  );

  const startXZ = latLngToSiteLocalXZ(start.lat, start.lng, frame);
  const endXZ = latLngToSiteLocalXZ(end.lat, end.lng, frame);
  if (
    ![startXZ.x, startXZ.z, endXZ.x, endXZ.z].every(Number.isFinite) ||
    Math.hypot(endXZ.x - startXZ.x, endXZ.z - startXZ.z) > 80
  ) {
    return null;
  }

  return { start: startXZ, end: endXZ };
}

/**
 * Draw Define 3D walls using saved image-pixel points only.
 * @returns {boolean} true if walls were drawn
 */
export function addDefine3DWallBoxes(boundaryGroup, ring, siteCornerLevels, placedUnit, addWallBox) {
  const { plan, center, bearing = 0 } = placedUnit || {};
  const ctx = resolveDefine3DWallContext(plan);
  if (!ctx || !center?.lat || !center?.lng) return false;

  const heights = computeDefine3DPlacementHeights(
    ring,
    siteCornerLevels,
    center.lat,
    center.lng,
    ctx.externalWallPolygons,
    ctx.internalWallSegments,
    ctx.imageWidth,
    ctx.imageHeight,
    ctx.widthM,
    ctx.heightM,
    bearing
  );
  if (!heights) return false;

  const { outlineYM } = heights;
  const upperTopY = outlineYM + FLOOR_PLAN_UPPER_HEIGHT_M;

  for (const polygon of ctx.externalWallPolygons) {
    const sanitized = sanitizeDefine3DPolygonPixels(polygon, ctx.imageWidth, ctx.imageHeight);
    if (!sanitized) continue;

    for (let i = 0; i < sanitized.length; i += 1) {
      const j = (i + 1) % sanitized.length;
      const segmentXZ = segmentPixelsToSiteXZ(
        ring,
        center.lat,
        center.lng,
        [sanitized[i], sanitized[j]],
        ctx.imageWidth,
        ctx.imageHeight,
        ctx.widthM,
        ctx.heightM,
        bearing
      );
      if (!segmentXZ) continue;
      addWallBox(
        boundaryGroup,
        segmentXZ.start,
        segmentXZ.end,
        outlineYM,
        upperTopY,
        FLOOR_PLAN_EXTERNAL_WALL_THICKNESS_M
      );
    }
  }

  for (const segment of ctx.internalWallSegments.slice(0, DEFINE3D_MAX_INTERNAL_SEGMENTS)) {
    const segmentXZ = segmentPixelsToSiteXZ(
      ring,
      center.lat,
      center.lng,
      segment,
      ctx.imageWidth,
      ctx.imageHeight,
      ctx.widthM,
      ctx.heightM,
      bearing
    );
    if (!segmentXZ) continue;
    addWallBox(
      boundaryGroup,
      segmentXZ.start,
      segmentXZ.end,
      outlineYM,
      upperTopY,
      FLOOR_PLAN_INTERNAL_WALL_THICKNESS_M
    );
  }

  return true;
}
