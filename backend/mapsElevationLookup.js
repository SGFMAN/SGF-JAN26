/**
 * Victorian AHD elevation via Vicmap Elevation FeatureServer (DEECA).
 * Prefers metro/statewide ground surface survey points; falls back to nearest contour.
 */

const VICMAP_ELEVATION_METRO =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer";

const VICMAP_ELEVATION_STATEWIDE =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_STATEWIDE_10_to_20_metre/FeatureServer";

const METRO_GROUND_LAYER = 0;
const METRO_CONTOUR_LAYER = 1;
const STATEWIDE_GROUND_LAYER = 4;

const FETCH_TIMEOUT_MS = 8000;
const MAX_POINTS = 32;
const METRO_GROUND_RADIUS_M = 450;
const STATEWIDE_GROUND_RADIUS_M = 900;
const CONTOUR_RADIUS_M = 200;

function normalizeElevationState(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return s;
}

function parsePointsInput(rawPoints) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
    return { error: "points must be a non-empty array of { lat, lng } objects" };
  }
  if (rawPoints.length > MAX_POINTS) {
    return { error: `At most ${MAX_POINTS} points per request` };
  }

  const points = [];
  for (let i = 0; i < rawPoints.length; i += 1) {
    const lat = Number.parseFloat(rawPoints[i]?.lat);
    const lng = Number.parseFloat(rawPoints[i]?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: `points[${i}] must include valid lat and lng` };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { error: `points[${i}] lat/lng out of valid range` };
    }
    points.push({ lat, lng, id: rawPoints[i]?.id ?? String(i) });
  }
  return { points };
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function distancePointToSegmentM(px, py, ax, ay, bx, by) {
  const latMid = (ay + by) / 2;
  const mPerDegLat = 111320;
  const mPerDegLng = mPerDegLat * Math.cos((latMid * Math.PI) / 180);

  const x = px * mPerDegLng;
  const y = py * mPerDegLat;
  const x1 = ax * mPerDegLng;
  const y1 = ay * mPerDegLat;
  const x2 = bx * mPerDegLng;
  const y2 = by * mPerDegLat;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

function distancePointToPolylineM(lat, lng, paths) {
  if (!Array.isArray(paths)) return Infinity;
  let best = Infinity;
  for (const path of paths) {
    if (!Array.isArray(path) || path.length < 2) continue;
    for (let i = 0; i < path.length - 1; i += 1) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      best = Math.min(best, distancePointToSegmentM(lng, lat, ax, ay, bx, by));
    }
  }
  return best;
}

async function fetchArcGisJson(url, timeoutMs) {
  const controller = new AbortController();
  const limit = Math.max(3000, Math.min(FETCH_TIMEOUT_MS, timeoutMs || FETCH_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), limit);
  const started = Date.now();
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const durationMs = Date.now() - started;
    if (!resp.ok) {
      return { data: null, durationMs, error: resp.statusText };
    }
    const data = await resp.json().catch(() => null);
    if (data?.error) {
      return {
        data: null,
        durationMs,
        error: data.error.message || String(data.error),
      };
    }
    return { data, durationMs, error: null };
  } catch (e) {
    return {
      data: null,
      durationMs: Date.now() - started,
      error: e.name === "AbortError" ? "Vicmap elevation request timed out" : e.message || String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildQueryUrl(baseUrl, layerId, lat, lng, radiusM, returnGeometry) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusM),
    units: "esriSRUnit_Meter",
    outFields: "altitude",
    returnGeometry: returnGeometry ? "true" : "false",
    resultRecordCount: "30",
    f: "json",
  });
  return `${baseUrl}/${layerId}/query?${params.toString()}`;
}

function pickNearestGroundPoint(lat, lng, features, sourceLabel) {
  let best = null;
  let bestDist = Infinity;
  for (const feature of features) {
    const alt = Number(feature.attributes?.altitude);
    const gx = feature.geometry?.x;
    const gy = feature.geometry?.y;
    if (!Number.isFinite(alt) || !Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    const dist = haversineM(lat, lng, gy, gx);
    if (dist < bestDist) {
      bestDist = dist;
      best = {
        ahdM: alt,
        source: sourceLabel,
        approximate: dist > 12,
      };
    }
  }
  return best;
}

function pickNearestContour(lat, lng, features, sourceLabel) {
  let best = null;
  let bestDist = Infinity;
  for (const feature of features) {
    const alt = Number(feature.attributes?.altitude);
    if (!Number.isFinite(alt)) continue;
    const paths = feature.geometry?.paths;
    const dist = distancePointToPolylineM(lat, lng, paths);
    if (dist < bestDist) {
      bestDist = dist;
      best = {
        ahdM: alt,
        source: sourceLabel,
        approximate: true,
      };
    }
  }
  return best;
}

async function lookupPointAhd(lat, lng) {
  const metroGround = await fetchArcGisJson(
    buildQueryUrl(VICMAP_ELEVATION_METRO, METRO_GROUND_LAYER, lat, lng, METRO_GROUND_RADIUS_M, true),
    FETCH_TIMEOUT_MS
  );
  if (!metroGround.error && metroGround.data?.features?.length) {
    const hit = pickNearestGroundPoint(
      lat,
      lng,
      metroGround.data.features,
      "vicmap_metro_ground_point"
    );
    if (hit) return hit;
  }

  const [metroContour, statewideGround] = await Promise.all([
    fetchArcGisJson(
      buildQueryUrl(VICMAP_ELEVATION_METRO, METRO_CONTOUR_LAYER, lat, lng, CONTOUR_RADIUS_M, true),
      FETCH_TIMEOUT_MS
    ),
    fetchArcGisJson(
      buildQueryUrl(
        VICMAP_ELEVATION_STATEWIDE,
        STATEWIDE_GROUND_LAYER,
        lat,
        lng,
        STATEWIDE_GROUND_RADIUS_M,
        true
      ),
      FETCH_TIMEOUT_MS
    ),
  ]);

  if (!metroContour.error && metroContour.data?.features?.length) {
    const hit = pickNearestContour(lat, lng, metroContour.data.features, "vicmap_metro_contour");
    if (hit) return hit;
  }

  if (!statewideGround.error && statewideGround.data?.features?.length) {
    const hit = pickNearestGroundPoint(
      lat,
      lng,
      statewideGround.data.features,
      "vicmap_statewide_ground_point"
    );
    if (hit) return { ...hit, approximate: true };
  }

  return null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function lookupAhdElevations({ state, points }) {
  const normalizedState = normalizeElevationState(state);
  if (normalizedState !== "VIC") {
    return {
      error: "AHD elevation lookup is currently available for Victoria (VIC) only",
      status: 400,
    };
  }

  const results = await mapWithConcurrency(points, 4, async (point) => {
    try {
      const hit = await lookupPointAhd(point.lat, point.lng);
      return {
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        ahdM: hit?.ahdM ?? null,
        approximate: hit?.approximate ?? false,
        source: hit?.source ?? null,
      };
    } catch (err) {
      return {
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        ahdM: null,
        approximate: false,
        source: null,
        error: err.message || String(err),
      };
    }
  });

  return {
    state: normalizedState,
    datum: "AHD",
    elevations: results,
    source: "VIC_VICMAP_ELEVATION",
  };
}

module.exports = {
  normalizeElevationState,
  parsePointsInput,
  lookupAhdElevations,
};
