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

/** @returns {{ id: string, lat: number, lng: number }[]} */
export function floorPlanCornerPoints(bounds) {
  if (!bounds) return [];
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return [
    { id: "sw", lat: sw.lat, lng: sw.lng },
    { id: "se", lat: sw.lat, lng: ne.lng },
    { id: "ne", lat: ne.lat, lng: ne.lng },
    { id: "nw", lat: ne.lat, lng: sw.lng },
  ];
}

export async function fetchAhdElevations(points, state = "VIC") {
  const res = await fetch("/api/maps/elevation-ahd", {
    method: "POST",
    headers: getApiHeaders(),
    body: JSON.stringify({ state, points }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to load AHD elevations");
  }
  return data;
}

export function formatAhdLabel(ahdM, { approximate = false } = {}) {
  if (ahdM == null || !Number.isFinite(Number(ahdM))) return "RL —";
  const suffix = approximate ? "~" : "";
  return `RL ${Number(ahdM).toFixed(1)}${suffix}`;
}
