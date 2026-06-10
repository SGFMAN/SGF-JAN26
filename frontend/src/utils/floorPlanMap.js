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
  return cornersFromLatLngBox(sw.lat, sw.lng, ne.lat, ne.lng);
}

/** @returns {{ id: string, lat: number, lng: number }[]} */
export function cornersFromLatLngBox(south, west, north, east) {
  return [
    { id: "sw", lat: south, lng: west },
    { id: "se", lat: south, lng: east },
    { id: "ne", lat: north, lng: east },
    { id: "nw", lat: north, lng: west },
  ];
}

export function elevationPointsKey(points) {
  if (!points?.length) return "";
  return points
    .map((point) => `${point.id}:${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`)
    .join("|");
}

export function isVictoriaLatLng(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat <= -33.5 &&
    lat >= -39.5 &&
    lng >= 140.5 &&
    lng <= 150.5
  );
}

export const SITE_BOUNDARY_MAX_POINTS = 32;

/** All title-boundary vertices for elevation debug (samples evenly if above max). */
export function allSiteBoundaryPoints(geometry, maxPoints = SITE_BOUNDARY_MAX_POINTS) {
  return sampleSiteElevationPoints(geometry, maxPoints);
}

export function formatAhdLabel(ahdM) {
  if (!Number.isFinite(ahdM)) return "—";
  return ahdM.toFixed(2);
}

export async function fetchAhdElevations(
  points,
  state = "VIC",
  externalSignal = null,
  mode = "interpolate"
) {
  if (externalSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 90000);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const res = await fetch("/api/maps/elevation-ahd", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ state, points, mode }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Failed to load elevations (${res.status})`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
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

export async function fetchAhdElevationsBatched(
  points,
  state = "VIC",
  batchSize = 24,
  externalSignal = null,
  mode = "interpolate"
) {
  if (!points.length) return [];
  const rows = [];
  for (let i = 0; i < points.length; i += batchSize) {
    if (externalSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const batch = points.slice(i, i + batchSize);
    const data = await fetchAhdElevations(batch, state, externalSignal, mode);
    rows.push(...(data.elevations || []));
  }
  return rows;
}

export function siteHighPointAhd(elevationRows) {
  let max = null;
  for (const row of elevationRows) {
    const raw = row?.ahdM;
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (max == null || value > max) max = value;
  }
  return max;
}
