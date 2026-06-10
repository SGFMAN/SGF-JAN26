/**
 * Victorian AHD elevation via Vicmap Elevation FeatureServer (DEECA).
 * Interpolates between nearby ground survey points so unit corners get distinct levels.
 */

const VICMAP_ELEVATION_METRO =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer";

const VICMAP_ELEVATION_STATEWIDE =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_STATEWIDE_10_to_20_metre/FeatureServer";

const METRO_GROUND_LAYER = 0;
const STATEWIDE_GROUND_LAYER = 4;

const FETCH_TIMEOUT_MS = 22000;
const MAX_POINTS = 32;
const LOOKUP_CONCURRENCY = 4;
const METRO_GROUND_RADIUS_M = 600;
const STATEWIDE_GROUND_RADIUS_M = 1200;
const GROUND_RESULT_COUNT = 50;
const IDW_MAX_CONTRIBUTORS = 10;
const IDW_MAX_RADIUS_M = 450;
const IDW_MIN_DISTANCE_M = 2;
/** When contributing surveys agree within this range, treat patch as flat. */
const FLAT_PATCH_RANGE_M = 0.35;

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

function roundAhd(value) {
  return Math.round(value * 100) / 100;
}

async function fetchArcGisJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const limit = Math.max(3000, Number(timeoutMs) || FETCH_TIMEOUT_MS);
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

function buildGroundQueryUrl(baseUrl, layerId, lat, lng, radiusM) {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusM),
    units: "esriSRUnit_Meter",
    outFields: "altitude",
    returnGeometry: "true",
    resultRecordCount: String(GROUND_RESULT_COUNT),
    f: "json",
  });
  return `${baseUrl}/${layerId}/query?${params.toString()}`;
}

function parseGroundFeatures(features) {
  const rows = [];
  for (const feature of features || []) {
    const alt = Number(feature.attributes?.altitude);
    const lng = Number(feature.geometry?.x);
    const lat = Number(feature.geometry?.y);
    if (!Number.isFinite(alt) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push({ lat, lng, alt });
  }
  return rows;
}

function dedupeGroundPoints(points) {
  const seen = new Set();
  const out = [];
  for (const point of points) {
    const key = `${point.lat.toFixed(6)},${point.lng.toFixed(6)},${point.alt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(point);
  }
  return out;
}

async function fetchGroundSurveyPoints(lat, lng) {
  const [metro, statewide] = await Promise.all([
    fetchArcGisJson(
      buildGroundQueryUrl(
        VICMAP_ELEVATION_METRO,
        METRO_GROUND_LAYER,
        lat,
        lng,
        METRO_GROUND_RADIUS_M
      )
    ),
    fetchArcGisJson(
      buildGroundQueryUrl(
        VICMAP_ELEVATION_STATEWIDE,
        STATEWIDE_GROUND_LAYER,
        lat,
        lng,
        STATEWIDE_GROUND_RADIUS_M
      )
    ),
  ]);

  const merged = dedupeGroundPoints([
    ...parseGroundFeatures(metro.data?.features),
    ...parseGroundFeatures(statewide.data?.features),
  ]);

  return {
    points: merged,
    errors: [metro.error, statewide.error].filter(Boolean),
  };
}

function rankGroundPoints(lat, lng, groundPoints, maxCount = IDW_MAX_CONTRIBUTORS) {
  return groundPoints
    .map((point) => ({
      ...point,
      distM: haversineM(lat, lng, point.lat, point.lng),
    }))
    .filter((point) => point.distM <= IDW_MAX_RADIUS_M)
    .sort((a, b) => a.distM - b.distM)
    .slice(0, maxCount);
}

function idwElevation(lat, lng, rankedPoints) {
  if (!rankedPoints.length) return null;

  let weightSum = 0;
  let valueSum = 0;
  let minDist = Infinity;

  for (const point of rankedPoints) {
    const dist = Math.max(point.distM ?? haversineM(lat, lng, point.lat, point.lng), IDW_MIN_DISTANCE_M);
    minDist = Math.min(minDist, dist);
    const weight = 1 / (dist * dist);
    weightSum += weight;
    valueSum += weight * point.alt;
  }

  if (weightSum <= 0) return null;
  return {
    ahdM: roundAhd(valueSum / weightSum),
    minDistM: minDist,
  };
}

function lookupSurveyAtPoint(lat, lng, groundPoints) {
  let nearest = null;
  let nearestDistM = Infinity;

  for (const point of groundPoints) {
    const distM = haversineM(lat, lng, point.lat, point.lng);
    if (distM < nearestDistM) {
      nearestDistM = distM;
      nearest = point;
    }
  }

  if (!nearest) return null;

  return {
    ahdM: roundAhd(nearest.alt),
    approximate: nearestDistM > 12,
    source: "vicmap_nearest_survey",
    surveyDistM: Math.round(nearestDistM),
    surveyLat: nearest.lat,
    surveyLng: nearest.lng,
  };
}

/** Estimate AHD at (lat,lng) from nearby Vicmap survey monuments. */
function lookupIdwAtPoint(lat, lng, groundPoints) {
  const ranked = rankGroundPoints(lat, lng, groundPoints);
  if (!ranked.length) return null;

  const nearest = ranked[0];
  const alts = ranked.map((point) => point.alt);
  const rangeM = Math.max(...alts) - Math.min(...alts);

  let ahdM;
  let source;
  if (ranked.length === 1) {
    ahdM = roundAhd(nearest.alt);
    source = "vicmap_nearest_survey";
  } else if (rangeM <= FLAT_PATCH_RANGE_M) {
    ahdM = roundAhd(alts.reduce((sum, alt) => sum + alt, 0) / alts.length);
    source = "vicmap_idw_flat";
  } else {
    const idw = idwElevation(lat, lng, ranked);
    if (!idw) return null;
    ahdM = idw.ahdM;
    source = "vicmap_idw";
  }

  return {
    ahdM,
    approximate: nearest.distM > 12,
    source,
    surveyDistM: Math.round(nearest.distM),
    surveyLat: nearest.lat,
    surveyLng: nearest.lng,
    surveyCount: ranked.length,
    surveyRangeM: roundAhd(rangeM),
  };
}

function normalizeLookupMode(raw) {
  const mode = String(raw || "interpolate")
    .trim()
    .toLowerCase();
  if (mode === "survey") return "survey";
  return "interpolate";
}

function elevationHitToRow(point, hit) {
  if (!hit) {
    return {
      id: point.id,
      lat: point.lat,
      lng: point.lng,
      ahdM: null,
      approximate: false,
      source: null,
      error: "No Vicmap elevation data within search radius",
    };
  }
  return {
    id: point.id,
    lat: point.lat,
    lng: point.lng,
    ahdM: hit.ahdM,
    approximate: hit.approximate ?? false,
    source: hit.source ?? null,
    surveyDistM: hit.surveyDistM ?? null,
    surveyLat: hit.surveyLat ?? null,
    surveyLng: hit.surveyLng ?? null,
    surveyCount: hit.surveyCount ?? null,
    surveyRangeM: hit.surveyRangeM ?? null,
  };
}

async function lookupAhdElevations({ state, points, mode: rawMode }) {
  const normalizedState = normalizeElevationState(state);
  if (normalizedState !== "VIC") {
    return {
      error: "AHD elevation lookup is currently available for Victoria (VIC) only",
      status: 400,
    };
  }

  const mode = normalizeLookupMode(rawMode);
  const groundCache = new Map();

  async function groundNear(lat, lng) {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (!groundCache.has(key)) {
      groundCache.set(key, await fetchGroundSurveyPoints(lat, lng));
    }
    return groundCache.get(key);
  }

  const lookupFn = mode === "survey" ? lookupSurveyAtPoint : lookupIdwAtPoint;

  const results = await mapWithConcurrency(points, LOOKUP_CONCURRENCY, async (point) => {
    try {
      const { points: groundPoints, errors } = await groundNear(point.lat, point.lng);
      if (!groundPoints.length) {
        return {
          id: point.id,
          lat: point.lat,
          lng: point.lng,
          ahdM: null,
          approximate: false,
          source: null,
          error: errors[0] || "No Vicmap elevation data within search radius",
        };
      }

      const hit = lookupFn(point.lat, point.lng, groundPoints);
      return elevationHitToRow(point, hit);
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
    mode,
    elevations: results,
    source: "VIC_VICMAP_ELEVATION",
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

module.exports = {
  normalizeElevationState,
  parsePointsInput,
  lookupAhdElevations,
};
