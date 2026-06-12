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
    imageWidth,
    imageHeight,
  };
}

/** Map Define 3D image pixel to local east/north metres (image NW at top-left). */
export function floorPlanPixelToLocalEN(px, py, imageWidth, imageHeight, widthM, heightM) {
  return {
    eastM: (px / imageWidth - 0.5) * widthM,
    northM: (0.5 - py / imageHeight) * heightM,
  };
}

/** Map Define 3D image pixel to lat/lng on the placed unit. */
export function floorPlanPixelToLatLng(
  px,
  py,
  centerLat,
  centerLng,
  imageWidth,
  imageHeight,
  widthM,
  heightM,
  bearingDeg = 0
) {
  const { eastM, northM } = floorPlanPixelToLocalEN(px, py, imageWidth, imageHeight, widthM, heightM);
  const rotated = rotateEN(eastM, northM, bearingDeg);
  return offsetENFromCenter(centerLat, centerLng, rotated.east, rotated.north);
}

export async function fetchFloorPlanMeta(planId) {
  const res = await fetch(`/api/maps/floor-plans/${planId}`, {
    headers: getApiHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to load floor plan");
  }
  return data.floorPlan;
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

export function offsetENFromCenter(centerLat, centerLng, eastM, northM) {
  return {
    lat: centerLat + northM / METERS_PER_DEG_LAT,
    lng: centerLng + eastM / metersPerDegreeLng(centerLat),
  };
}

/** Rotate local east/north offsets clockwise (degrees from north). */
export function rotateEN(eastM, northM, bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    east: eastM * cos + northM * sin,
    north: -eastM * sin + northM * cos,
  };
}

/** Floor plan footprint corners from center, size and bearing (0 = axis-aligned). */
export function rotatedFloorPlanCorners(centerLat, centerLng, widthM, heightM, bearingDeg = 0) {
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  const locals = [
    { id: "sw", e: -halfW, n: -halfH },
    { id: "se", e: halfW, n: -halfH },
    { id: "ne", e: halfW, n: halfH },
    { id: "nw", e: -halfW, n: halfH },
  ];
  return locals.map(({ id, e, n }) => {
    const rotated = rotateEN(e, n, bearingDeg);
    const latlng = offsetENFromCenter(centerLat, centerLng, rotated.east, rotated.north);
    return { id, lat: latlng.lat, lng: latlng.lng };
  });
}

export function rotatedOverlayCornerLatLngs(centerLat, centerLng, widthM, heightM, bearingDeg = 0) {
  const points = rotatedFloorPlanCorners(centerLat, centerLng, widthM, heightM, bearingDeg);
  const byId = Object.fromEntries(points.map((corner) => [corner.id, corner]));
  return {
    nw: byId.nw,
    ne: byId.ne,
    sw: byId.sw,
    se: byId.se,
    points,
  };
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

export const SITE_BOUNDARY_MAX_POINTS = 64;

/** All title-boundary vertices for elevation debug (samples evenly if above max). */
export function allSiteBoundaryPoints(geometry, maxPoints = SITE_BOUNDARY_MAX_POINTS) {
  return sampleSiteElevationPoints(geometry, maxPoints);
}

/** Outer ring as Leaflet lat/lng pairs for map overlays. */
export function siteBoundaryRingLatLng(geometry) {
  if (!geometry) return [];

  const ringFromCoords = (coords) => {
    if (!Array.isArray(coords)) return [];
    return coords
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => [Number(coord[1]), Number(coord[0])])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  };

  if (geometry.type === "Polygon") {
    return ringFromCoords(geometry.coordinates?.[0]);
  }
  if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates || []) {
      const ring = ringFromCoords(poly?.[0]);
      if (ring.length >= 3) return ring;
    }
  }
  return [];
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

/** Format actual fall in metres from the highest point (no step snapping). */
export function formatRelativeFallLabel(fallM) {
  if (!Number.isFinite(fallM)) return "—";
  const clamped = Math.max(0, fallM);
  if (clamped < 0.005) return "0";
  const rounded = Math.round(clamped * 100) / 100;
  if (rounded === 0) return "0";
  return String(rounded);
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

/** Monument box around site — four monuments outside NW/NE/SE/SW boundary extremes. */
export async function fetchMonumentBox(geometry, state = "VIC", externalSignal = null) {
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
    const res = await fetch("/api/maps/elevation-monument-box", {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ state, geometry }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Failed to load monument box (${res.status})`);
    }
    return data;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

function toLocalEN(lat, lng, originLat, originLng) {
  const metersPerDegLat = METERS_PER_DEG_LAT;
  const metersPerDegLng = metersPerDegreeLng(originLat);
  return {
    e: (lng - originLng) * metersPerDegLng,
    n: (lat - originLat) * metersPerDegLat,
  };
}

const SITE_GRID_CLAMP_TOLERANCE = 0.02;

/** Axis-aligned bilinear AHD from calculated site corner heights (NW/NE/SE/SW). */
export function interpolateSiteCornerGrid(lat, lng, siteCornerLevels) {
  const sw = siteCornerLevels?.sw;
  const se = siteCornerLevels?.se;
  const nw = siteCornerLevels?.nw;
  const ne = siteCornerLevels?.ne;
  if (!sw || !se || !nw || !ne) return null;
  if (![sw, se, nw, ne].every((corner) => Number.isFinite(corner.ahdM))) return null;

  const origin = sw;
  const swEN = { e: 0, n: 0 };
  const seEN = toLocalEN(se.lat, se.lng, origin.lat, origin.lng);
  const nwEN = toLocalEN(nw.lat, nw.lng, origin.lat, origin.lng);
  const neEN = toLocalEN(ne.lat, ne.lng, origin.lat, origin.lng);
  const p = toLocalEN(lat, lng, origin.lat, origin.lng);

  const westE = Math.min(swEN.e, nwEN.e);
  const eastE = Math.max(seEN.e, neEN.e);
  const southN = Math.min(swEN.n, seEN.n);
  const northN = Math.max(nwEN.n, neEN.n);

  const denomE = eastE - westE;
  const denomN = northN - southN;
  if (Math.abs(denomE) < 0.5 || Math.abs(denomN) < 0.5) return null;

  let tx = (p.e - westE) / denomE;
  let ty = (p.n - southN) / denomN;

  if (
    tx < -SITE_GRID_CLAMP_TOLERANCE ||
    tx > 1 + SITE_GRID_CLAMP_TOLERANCE ||
    ty < -SITE_GRID_CLAMP_TOLERANCE ||
    ty > 1 + SITE_GRID_CLAMP_TOLERANCE
  ) {
    tx = Math.max(0, Math.min(1, tx));
    ty = Math.max(0, Math.min(1, ty));
  }

  const southHeight = sw.ahdM * (1 - tx) + se.ahdM * tx;
  const northHeight = nw.ahdM * (1 - tx) + ne.ahdM * tx;
  return Math.round((southHeight * (1 - ty) + northHeight * ty) * 100) / 100;
}

export function geometryCoordinatesKey(geometry) {
  if (!geometry?.coordinates) return "";
  try {
    return JSON.stringify(geometry.coordinates);
  } catch {
    return "";
  }
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
