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
const PLANE_FIT_MAX_POINTS = 12;
const PLANE_FIT_MIN_POINTS = 3;

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

function toLocalEN(lat, lng, originLat, originLng) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos((originLat * Math.PI) / 180);
  return {
    e: (lng - originLng) * metersPerDegLng,
    n: (lat - originLat) * metersPerDegLat,
  };
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

function selectNearestGroundPoints(lat, lng, groundPoints, maxCount = PLANE_FIT_MAX_POINTS) {
  return groundPoints
    .map((point) => ({
      ...point,
      distM: haversineM(lat, lng, point.lat, point.lng),
    }))
    .sort((a, b) => a.distM - b.distM)
    .slice(0, maxCount);
}

function idwElevation(lat, lng, groundPoints) {
  if (!groundPoints.length) return null;

  let weightSum = 0;
  let valueSum = 0;
  let minDist = Infinity;

  for (const point of groundPoints) {
    const dist = Math.max(haversineM(lat, lng, point.lat, point.lng), 0.5);
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

function fitElevationPlane(groundPoints, originLat, originLng) {
  const n = groundPoints.length;
  if (n < PLANE_FIT_MIN_POINTS) return null;

  let sEe = 0;
  let sEn = 0;
  let sEz = 0;
  let sEeEe = 0;
  let sEnEn = 0;
  let sEeEn = 0;
  let sEeZ = 0;
  let sEnZ = 0;

  for (const point of groundPoints) {
    const { e, n: north } = toLocalEN(point.lat, point.lng, originLat, originLng);
    const z = point.alt;
    sEe += e;
    sEn += north;
    sEz += z;
    sEeEe += e * e;
    sEnEn += north * north;
    sEeEn += e * north;
    sEeZ += e * z;
    sEnZ += north * z;
  }

  const matrix = [
    [sEeEe, sEeEn, sEe],
    [sEeEn, sEnEn, sEn],
    [sEe, sEn, n],
  ];

  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const determinant = det3(matrix);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null;

  const detA = det3([
    [sEeZ, sEeEn, sEe],
    [sEnZ, sEnEn, sEn],
    [sEz, sEn, n],
  ]);
  const detB = det3([
    [sEeEe, sEeZ, sEe],
    [sEeEn, sEnZ, sEn],
    [sEe, sEz, n],
  ]);
  const detC = det3([
    [sEeEe, sEeEn, sEeZ],
    [sEeEn, sEnEn, sEnZ],
    [sEe, sEn, sEz],
  ]);

  return {
    a: detA / determinant,
    b: detB / determinant,
    c: detC / determinant,
  };
}

function evalElevationPlane(plane, lat, lng, originLat, originLng) {
  const { e, n } = toLocalEN(lat, lng, originLat, originLng);
  return plane.a * e + plane.b * n + plane.c;
}

function requestCentroid(points) {
  let latSum = 0;
  let lngSum = 0;
  for (const point of points) {
    latSum += point.lat;
    lngSum += point.lng;
  }
  return {
    lat: latSum / points.length,
    lng: lngSum / points.length,
  };
}

function interpolateFromGround(lat, lng, groundPoints, origin) {
  const nearest = selectNearestGroundPoints(lat, lng, groundPoints);
  if (!nearest.length) return null;

  const idw = idwElevation(lat, lng, nearest);
  if (!idw) return null;

  if (nearest.length < PLANE_FIT_MIN_POINTS) {
    return {
      ahdM: idw.ahdM,
      approximate: idw.minDistM > 12,
      source: "vicmap_ground_idw",
    };
  }

  const plane = fitElevationPlane(nearest, origin.lat, origin.lng);
  if (!plane) {
    return {
      ahdM: idw.ahdM,
      approximate: idw.minDistM > 12,
      source: "vicmap_ground_idw",
    };
  }

  const idwAtOrigin = idwElevation(origin.lat, origin.lng, nearest);
  const planeAtOrigin = evalElevationPlane(plane, origin.lat, origin.lng, origin.lat, origin.lng);
  const planeAtPoint = evalElevationPlane(plane, lat, lng, origin.lat, origin.lng);

  if (!idwAtOrigin) {
    return {
      ahdM: roundAhd(planeAtPoint),
      approximate: true,
      source: "vicmap_ground_plane",
    };
  }

  const offset = idwAtOrigin.ahdM - planeAtOrigin;
  return {
    ahdM: roundAhd(planeAtPoint + offset),
    approximate: idw.minDistM > 12 || idwAtOrigin.minDistM > 12,
    source: "vicmap_ground_plane",
  };
}

async function lookupAhdElevations({ state, points }) {
  const normalizedState = normalizeElevationState(state);
  if (normalizedState !== "VIC") {
    return {
      error: "AHD elevation lookup is currently available for Victoria (VIC) only",
      status: 400,
    };
  }

  const origin = requestCentroid(points);
  const { points: groundPoints, errors } = await fetchGroundSurveyPoints(origin.lat, origin.lng);

  if (!groundPoints.length) {
    return {
      state: normalizedState,
      datum: "AHD",
      elevations: points.map((point) => ({
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        ahdM: null,
        approximate: false,
        source: null,
        error: errors[0] || "No Vicmap elevation data within search radius",
      })),
      source: "VIC_VICMAP_ELEVATION",
    };
  }

  const results = await mapWithConcurrency(points, LOOKUP_CONCURRENCY, async (point) => {
    try {
      const hit = interpolateFromGround(point.lat, point.lng, groundPoints, origin);
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
    groundSurveyCount: groundPoints.length,
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
