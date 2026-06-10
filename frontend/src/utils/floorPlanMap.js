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
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 55000);
  try {
    const res = await fetch("/api/maps/elevation-ahd", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ state, points }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Failed to load elevations (${res.status})`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

export const FALL_STEP_M = 0.25;

/** Sample vertices from a title boundary for site elevation lookup. */
export function sampleSiteElevationPoints(geometry, maxPoints = 8) {
  if (!geometry) return [];
  const raw = [];

  const visitRing = (ring) => {
    if (!Array.isArray(ring)) return;
    for (const coord of ring) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) raw.push({ lat, lng });
    }
  };

  if (geometry.type === "Polygon") {
    visitRing(geometry.coordinates?.[0]);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates || []) {
      visitRing(poly?.[0]);
    }
  }

  if (raw.length === 0) return [];
  if (raw.length <= maxPoints) {
    return raw.map((point, index) => ({ ...point, id: `site-${index}` }));
  }

  const sampled = [];
  const step = raw.length / maxPoints;
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.min(raw.length - 1, Math.floor(i * step));
    sampled.push({ ...raw[idx], id: `site-${i}` });
  }
  return sampled;
}

export function snapFallToStep(fallM, step = FALL_STEP_M) {
  if (!Number.isFinite(fallM)) return null;
  return Math.round(Math.max(0, fallM) / step) * step;
}

/** Format fall from site high point — 0 for high point, then 0.25 m steps. */
export function formatFallLabel(fallM, step = FALL_STEP_M) {
  const snapped = snapFallToStep(fallM, step);
  if (snapped == null) return "—";
  if (snapped === 0) return "0";
  return snapped.toFixed(2);
}

export async function fetchAhdElevationsBatched(points, state = "VIC", batchSize = 24) {
  if (!points.length) return [];
  const rows = [];
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const data = await fetchAhdElevations(batch, state);
    rows.push(...(data.elevations || []));
  }
  return rows;
}

export function siteHighPointAhd(elevationRows) {
  let max = null;
  for (const row of elevationRows) {
    const value = Number(row?.ahdM);
    if (!Number.isFinite(value)) continue;
    if (max == null || value > max) max = value;
  }
  return max;
}
