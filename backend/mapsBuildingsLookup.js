/**
 * Victorian building footprints via Vicmap Features of Interest — BUILDING_POLYGON (layer 7).
 * Source: https://services-ap1.arcgis.com/.../Vicmap_Features_of_Interest/FeatureServer/7
 */

const turf = require("@turf/turf");

const VICMAP_BUILDINGS_BASE =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Features_of_Interest/FeatureServer";

const LAYER_BUILDING_POLYGON = 7;

const FETCH_TIMEOUT_MS = 20000;
const LOOKUP_BUDGET_MS = 35000;
const MAX_BUILDING_FEATURES = 50;
const POINT_BUFFER_DISTANCES_M = [80, 120];
const BUILDING_BOUNDARY_BUFFER_M = 25;
const BUILDING_NEAREST_MAX_M = 65;

const BUILDINGS_WARNING =
  "Building outlines are indicative only. Confirm against aerial imagery and site survey.";

function normalizeBuildingsState(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return s;
}

function parseBuildingsLatLng(input) {
  const lat = Number.parseFloat(input.lat);
  const lng = Number.parseFloat(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "lat and lng are required and must be valid numbers" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "lat/lng out of valid range" };
  }
  return { lat, lng };
}

function parseEnvelope(input) {
  const raw = input.envelope != null ? String(input.envelope).trim() : "";
  if (!raw) return null;
  const parts = raw.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return { error: "envelope must be west,south,east,north (four numbers)" };
  }
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    return { error: "envelope bounds are invalid" };
  }
  return `${west},${south},${east},${north}`;
}

function normalizeBoundaryInput(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.type) {
    if (raw.type !== "Polygon" && raw.type !== "MultiPolygon") {
      return { error: "boundary geometry must be Polygon or MultiPolygon" };
    }
    if (!Array.isArray(raw.coordinates) || raw.coordinates.length === 0) {
      return { error: "boundary geometry has no coordinates" };
    }
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return normalizeBoundaryInput(parsed);
    } catch {
      return { error: "boundary must be valid JSON GeoJSON geometry" };
    }
  }
  return { error: "boundary must be a GeoJSON geometry object" };
}

function budgetRemaining(deadlineMs) {
  return Math.max(0, deadlineMs - Date.now());
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
      return { data: null, durationMs, status: resp.status, error: resp.statusText };
    }
    const data = await resp.json().catch(() => null);
    if (data?.error) {
      const message =
        data.error.message ||
        data.error.details?.[0] ||
        JSON.stringify(data.error);
      return {
        data: null,
        durationMs,
        status: 200,
        error: message,
      };
    }
    return { data, durationMs, status: 200, error: null };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return {
      data: null,
      durationMs: Date.now() - started,
      status: aborted ? 408 : 0,
      error: aborted ? "Vicmap buildings request timed out" : e.message || String(e),
    };
  }
}

function layerQueryUrl(layerId, params) {
  return `${VICMAP_BUILDINGS_BASE}/${layerId}/query?${new URLSearchParams(params).toString()}`;
}

function geoJsonPolygonToEsriGeometry(geometry) {
  if (!geometry || geometry.type !== "Polygon") return null;
  return JSON.stringify({
    rings: geometry.coordinates,
    spatialReference: { wkid: 4326 },
  });
}

function boundaryPolygonParts(boundaryGeometry) {
  if (!boundaryGeometry?.type) return [];
  if (boundaryGeometry.type === "Polygon") return [boundaryGeometry];
  if (boundaryGeometry.type === "MultiPolygon") {
    return boundaryGeometry.coordinates.map((coordinates) => ({
      type: "Polygon",
      coordinates,
    }));
  }
  return [];
}

function envelopeFromBoundary(boundaryGeometry, bufferDeg = 0.00005) {
  try {
    const [west, south, east, north] = turf.bbox(turf.feature(boundaryGeometry));
    return `${west - bufferDeg},${south - bufferDeg},${east + bufferDeg},${north + bufferDeg}`;
  } catch {
    return null;
  }
}

function expandEnvelopeString(envelope, bufferDeg = 0.00035) {
  const parts = envelope.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return envelope;
  const [west, south, east, north] = parts;
  return `${west - bufferDeg},${south - bufferDeg},${east + bufferDeg},${north + bufferDeg}`;
}

function buildSpatialStrategies({ lat, lng, boundaryGeometry, envelope }) {
  const strategies = [];
  const point = `${lng},${lat}`;

  for (const part of boundaryPolygonParts(boundaryGeometry)) {
    const esriGeom = geoJsonPolygonToEsriGeometry(part);
    if (esriGeom) {
      strategies.push({
        mode: "boundary_intersects",
        confidence: "high",
        spatialRel: "esriSpatialRelIntersects",
        geometry: esriGeom,
        geometryType: "esriGeometryPolygon",
      });
    }
  }

  const boundaryEnvelope = boundaryGeometry ? envelopeFromBoundary(boundaryGeometry) : null;
  if (boundaryEnvelope) {
    strategies.push({
      mode: "boundary_envelope",
      confidence: "high",
      spatialRel: "esriSpatialRelIntersects",
      geometry: boundaryEnvelope,
      geometryType: "esriGeometryEnvelope",
    });
  }

  if (envelope) {
    strategies.push({
      mode: "envelope_buffered",
      confidence: "approximate",
      spatialRel: "esriSpatialRelIntersects",
      geometry: expandEnvelopeString(envelope),
      geometryType: "esriGeometryEnvelope",
    });
  }

  for (const distanceM of POINT_BUFFER_DISTANCES_M) {
    strategies.push({
      mode: `point_buffer_${distanceM}m`,
      confidence: "point",
      spatialRel: "esriSpatialRelIntersects",
      geometry: point,
      geometryType: "esriGeometryPoint",
      distance: String(distanceM),
      units: "esriSRUnit_Meter",
    });
  }

  return strategies;
}

function flattenPolygonFeatures(features) {
  const out = [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry?.type) continue;
    if (geometry.type === "Polygon") {
      out.push(feature);
      continue;
    }
    if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polyCoords, partIndex) => {
        out.push({
          type: "Feature",
          properties: { ...(feature.properties || {}), part_index: partIndex },
          geometry: { type: "Polygon", coordinates: polyCoords },
        });
      });
    }
  }
  return out;
}

function mapBuildingFeature(feature, index) {
  const props = feature?.properties || {};
  const objectId = props.OBJECTID ?? props.objectid ?? props.ufi ?? index;
  const featureType = props.feature_type ?? props.FEATURE_TYPE ?? null;
  const featureSubtype = props.feature_subtype ?? null;
  const label =
    featureSubtype && featureSubtype !== "undefined_building"
      ? String(featureSubtype).replace(/_/g, " ")
      : featureType
        ? String(featureType).replace(/_/g, " ")
        : `Building ${index + 1}`;
  return {
    type: "Feature",
    properties: {
      building_id: String(objectId),
      object_id: objectId,
      pfi: props.pfi ?? null,
      feature_type: featureType,
      feature_subtype: featureSubtype,
      source: "vicmap_building_polygon",
      label,
    },
    geometry: feature.geometry,
  };
}

function dedupeBuildingFeatures(features) {
  const seen = new Set();
  return features.filter((feature) => {
    const key =
      feature.properties?.building_id ||
      JSON.stringify(feature.geometry?.coordinates?.[0]?.[0] ?? null);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Keep building footprints on/near the title boundary (cadastre vs footprint often misalign). */
function filterBuildingsForSite(features, boundaryGeometry, lat, lng) {
  if (!features?.length) return [];
  if (!boundaryGeometry) return features;

  const boundary = turf.feature(boundaryGeometry);
  const asFeature = (feature) => turf.feature(feature.geometry);

  let matched = features.filter((feature) => {
    try {
      return turf.booleanIntersects(asFeature(feature), boundary);
    } catch {
      return false;
    }
  });
  if (matched.length) return { features: matched, filterMode: "boundary_intersects" };

  matched = features.filter((feature) => {
    try {
      return turf.booleanPointInPolygon(turf.centroid(asFeature(feature)), boundary);
    } catch {
      return false;
    }
  });
  if (matched.length) return { features: matched, filterMode: "centroid_in_boundary" };

  try {
    const buffered = turf.buffer(boundary, BUILDING_BOUNDARY_BUFFER_M, { units: "meters" });
    matched = features.filter((feature) => {
      try {
        return turf.booleanIntersects(asFeature(feature), buffered);
      } catch {
        return false;
      }
    });
    if (matched.length) return { features: matched, filterMode: "buffered_boundary" };
  } catch {
    // ignore buffer failures
  }

  try {
    const pin = turf.point([lng, lat]);
    if (turf.booleanPointInPolygon(pin, boundary)) {
      const ranked = features
        .map((feature) => {
          try {
            const dist = turf.distance(pin, turf.centroid(asFeature(feature)), { units: "meters" });
            return { feature, dist };
          } catch {
            return { feature, dist: Infinity };
          }
        })
        .filter(({ dist }) => dist <= BUILDING_NEAREST_MAX_M)
        .sort((a, b) => a.dist - b.dist);
      if (ranked.length) {
        const closestDist = ranked[0].dist;
        return {
          features: ranked
            .filter(({ dist }) => dist <= closestDist + 15)
            .map(({ feature }) => feature),
          filterMode: "nearest_to_pin",
        };
      }
    }
  } catch {
    // ignore nearest fallback failures
  }

  return { features: [], filterMode: "none" };
}

async function queryBuildingFeatures(spatial, log, deadlineMs) {
  const remaining = budgetRemaining(deadlineMs);
  if (remaining < 2500) {
    log.lastApiError = "lookup_budget_exceeded";
    return [];
  }

  const params = {
    f: "geojson",
    inSR: "4326",
    outSR: "4326",
    returnGeometry: "true",
    outFields: "*",
    resultRecordCount: String(MAX_BUILDING_FEATURES),
    spatialRel: spatial.spatialRel,
    geometry: spatial.geometry,
    geometryType: spatial.geometryType,
  };
  if (spatial.distance != null) {
    params.distance = String(spatial.distance);
    params.units = spatial.units || "esriSRUnit_Meter";
  }

  const url = layerQueryUrl(LAYER_BUILDING_POLYGON, params);
  let { data, durationMs, status, error } = await fetchArcGisJson(url, remaining);
  log.apiCalls = (log.apiCalls || 0) + 1;
  log.lastApiDurationMs = durationMs;
  log.lastApiStatus = status;

  if (error && String(error).toLowerCase().includes("too many requests") && remaining > 4000) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    ({ data, durationMs, status, error } = await fetchArcGisJson(url, budgetRemaining(deadlineMs)));
    log.apiCalls = (log.apiCalls || 0) + 1;
    log.lastApiDurationMs = durationMs;
    log.lastApiStatus = status;
  }

  if (error) {
    log.lastApiError = error;
    return [];
  }

  const rawFeatures = Array.isArray(data?.features) ? data.features : [];
  return flattenPolygonFeatures(rawFeatures).map((feature, index) => mapBuildingFeature(feature, index));
}

/**
 * @param {{ state: string, lat: number, lng: number, envelope?: string|null, boundaryGeometry?: object|null, parcelId?: string|null }} input
 */
async function lookupPropertyBuildings({
  state,
  lat,
  lng,
  envelope,
  boundaryGeometry,
  parcelId,
}) {
  const started = Date.now();
  const log = {
    state,
    markerLat: lat,
    markerLng: lng,
    envelope: envelope || null,
    parcelId: parcelId || null,
    hasBoundary: Boolean(boundaryGeometry),
    apiCalls: 0,
    source: "VIC_VICMAP_BUILDING_POLYGON",
  };

  if (state === "QLD") {
    log.durationMs = Date.now() - started;
    console.log("[property-buildings]", log);
    return { error: "QLD building footprints lookup is not implemented yet", status: 501, log };
  }

  if (state !== "VIC") {
    log.durationMs = Date.now() - started;
    console.log("[property-buildings]", log);
    return { error: "Unsupported state. Use VIC or QLD.", status: 400, log };
  }

  const deadlineMs = Date.now() + LOOKUP_BUDGET_MS;
  const strategies = buildSpatialStrategies({ lat, lng, boundaryGeometry, envelope });

  let features = [];
  const modesUsed = [];
  for (const spatial of strategies) {
    if (budgetRemaining(deadlineMs) < 2500) break;
    const batch = await queryBuildingFeatures(spatial, log, deadlineMs);
    if (batch.length > 0) {
      modesUsed.push(spatial.mode);
      features = dedupeBuildingFeatures([...features, ...batch]);
      if (features.length >= MAX_BUILDING_FEATURES) break;
    }
  }

  log.queryModes = modesUsed;
  log.confidence = boundaryGeometry ? "high" : "point";

  const countBeforeFilter = features.length;
  if (boundaryGeometry && features.length > 0) {
    const filtered = filterBuildingsForSite(features, boundaryGeometry, lat, lng);
    features = filtered.features;
    log.filteredToBoundary = true;
    log.filterMode = filtered.filterMode;
    log.countBeforeFilter = countBeforeFilter;
    log.countAfterFilter = features.length;
  }

  features = features.slice(0, MAX_BUILDING_FEATURES);

  const buildingsGeoJson =
    features.length > 0
      ? {
          type: "FeatureCollection",
          features,
        }
      : null;

  log.count = features.length;
  log.durationMs = Date.now() - started;
  console.log("[property-buildings]", log);

  return {
    hit: {
      buildingsGeoJson,
      count: features.length,
      source: "VIC_VICMAP_BUILDING_POLYGON",
      confidence: log.confidence,
      warning: BUILDINGS_WARNING,
      message: features.length === 0 ? "No building outlines found." : null,
      parcelId: parcelId || null,
    },
    log,
  };
}

function formatPropertyBuildingsResponse(hit) {
  return {
    ok: true,
    buildingsGeoJson: hit.buildingsGeoJson,
    count: hit.count,
    source: hit.source,
    confidence: hit.confidence,
    warning: hit.warning,
    message: hit.message,
    parcelId: hit.parcelId,
  };
}

module.exports = {
  normalizeBuildingsState,
  parseBuildingsLatLng,
  parseEnvelope,
  normalizeBoundaryInput,
  lookupPropertyBuildings,
  formatPropertyBuildingsResponse,
};
