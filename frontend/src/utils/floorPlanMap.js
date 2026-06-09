import { getApiHeaders } from "./auth";

export const METERS_PER_DEG_LAT = 111320;

export function metersPerDegreeLng(lat) {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** @returns {[[number, number], [number, number]]} Leaflet bounds [[south, west], [north, east]] */
export function boundsFromCenter(centerLat, centerLng, widthM, heightM) {
  const halfLat = heightM / 2 / METERS_PER_DEG_LAT;
  const halfLng = widthM / 2 / metersPerDegreeLng(centerLat);
  return [
    [centerLat - halfLat, centerLng - halfLng],
    [centerLat + halfLat, centerLng + halfLng],
  ];
}

export async function fetchFloorPlanImageBlob(planId) {
  const res = await fetch(`/api/maps/floor-plans/${planId}/image`, {
    headers: getApiHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load floor plan image");
  return res.blob();
}

export function floorPlanDimensionsMeters(plan, imageWidth, imageHeight) {
  const mpp = plan.scale?.metersPerPixel;
  if (!mpp || !imageWidth || !imageHeight) return null;
  return {
    widthM: imageWidth * mpp,
    heightM: imageHeight * mpp,
  };
}

export function loadImageSizeFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read floor plan image"));
    };
    img.src = url;
  });
}
