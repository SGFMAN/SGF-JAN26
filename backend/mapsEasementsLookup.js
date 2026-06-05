/**
 * Victorian property easements via Vicmap Property Easements and Road Casements.
 * Source: https://services-ap1.arcgis.com/.../Vicmap_Property_Easements_and_Road_Casements/FeatureServer
 *
 * Layers: 0 = EASEMENT (polyline), 1 = ROAD_CASEMENT_POLYGON (polygon)
 * Query: intersect title boundary polygon when available; envelope or point fallback.
 */

const VICMAP_EASEMENTS_BASE =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Property_Easements_and_Road_Casements/FeatureServer";

const LAYER_EASEMENT = 0;
const LAYER_ROAD_CASEMENT = 1;

const FETCH_TIMEOUT_MS = 20000;
const LOOKUP_BUDGET_MS = 35000;
const MAX_EASEMENT_FEATURES = 50;

const { clipEasementFeaturesToBoundary } = require("./mapsEasementClip");

const EASEMENT_WARNING =
  "Easement data is indicative only. Confirm against title and plan documents.";

function normalizeEasementsState(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return s;
}

function parseEasementsLatLng(query) {
  const lat = Number.parseFloat(query.lat);
  const lng = Number.parseFloat(query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "lat and lng query parameters are required and must be valid numbers" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "lat/lng out of valid range" };
  }
  return { lat, lng };
}

/** @returns {string|null} west,south,east,north */
function parseEnvelope(query) {
  const raw = query.envelope != null ? String(query.envelope).trim() : "";
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

function parseBoundaryGeometry(query) {
  const raw = query.boundary != null ? String(query.boundary).trim() : "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { error: "boundary must be a GeoJSON geometry object" };
    }
    if (parsed.type !== "Polygon" && parsed.type !== "MultiPolygon") {
      return { error: "boundary geometry must be Polygon or MultiPolygon" };
    }
    if (!Array.isArray(parsed.coordinates) || parsed.coordinates.length === 0) {
      return { error: "boundary geometry has no coordinates" };
    }
    return parsed;
  } catch {
    return { error: "boundary must be valid JSON GeoJSON geometry" };
  }
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
      return {
        data: null,
        durationMs,
        status: 200,
        error: data.error.message || String(data.error),
      };
    }
    return { data, durationMs, status: 200, error: null };
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return {
      data: null,
      durationMs: Date.now() - started,
      status: aborted ? 408 : 0,
      error: aborted ? "Vicmap easements request timed out" : e.message || String(e),
    };
  }
}

function layerQueryUrl(layerId, params) {
  return `${VICMAP_EASEMENTS_BASE}/${layerId}/query?${new URLSearchParams(params).toString()}`;
}

function geoJsonPolygonToEsriGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return JSON.stringify({
      rings: geometry.coordinates,
      spatialReference: { wkid: 4326 },
    });
  }
  if (geometry.type === "MultiPolygon" && geometry.coordinates?.length > 0) {
    return JSON.stringify({
      rings: geometry.coordinates[0],
      spatialReference: { wkid: 4326 },
    });
  }
  return null;
}

/** Expand west,south,east,north envelope by ~35 m at Victorian latitudes. */
function expandEnvelopeString(envelope, bufferDeg = 0.00035) {
  const parts = envelope.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return envelope;
  const [west, south, east, north] = parts;
  return `${west - bufferDeg},${south - bufferDeg},${east + bufferDeg},${north + bufferDeg}`;
}

function buildSpatialStrategies({ lat, lng, boundaryGeometry, envelope }) {
  const point = `${lng},${lat}`;
  const strategies = [];

  if (boundaryGeometry?.type) {
    const esriGeom = geoJsonPolygonToEsriGeometry(boundaryGeometry);
    if (esriGeom) {
      return [
        {
          mode: "boundary_intersects",
          confidence: "high",
          spatialRel: "esriSpatialRelIntersects",
          geometry: esriGeom,
          geometryType: "esriGeometryPolygon",
        },
      ];
    }
  }

  if (envelope) {
    strategies.push({
      mode: "envelope_buffered",
      confidence: "approximate",
      spatialRel: "esriSpatialRelIntersects",
      geometry: expandEnvelopeString(envelope),
      geometryType: "esriGeometryEnvelope",
    });
    strategies.push({
      mode: "envelope_intersects",
      confidence: "approximate",
      spatialRel: "esriSpatialRelIntersects",
      geometry: envelope,
      geometryType: "esriGeometryEnvelope",
    });
  }

  strategies.push({
    mode: "point_buffer",
    confidence: "point",
    spatialRel: "esriSpatialRelIntersects",
    geometry: point,
    geometryType: "esriGeometryPoint",
    distance: "50",
    units: "esriSRUnit_Meter",
  });

  return strategies;
}

function normalizeBoundaryInput(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.type) {
    if (raw.type !== "Polygon" && raw.type !== "MultiPolygon") return { error: "boundary geometry must be Polygon or MultiPolygon" };
    if (!Array.isArray(raw.coordinates) || raw.coordinates.length === 0) {
      return { error: "boundary geometry has no coordinates" };
    }
    return raw;
  }
  if (typeof raw === "string") return parseBoundaryGeometry({ boundary: raw });
  return { error: "boundary must be a GeoJSON geometry object" };
}

async function fetchSpatialObjectIds(layerId, spatial, log, deadlineMs) {
  const remaining = budgetRemaining(deadlineMs);
  if (remaining < 2500) {
    log.lastApiError = "lookup_budget_exceeded";
    return [];
  }

  const params = {
    f: "json",
    inSR: "4326",
    outSR: "4326",
    spatialRel: spatial.spatialRel,
    geometry: spatial.geometry,
    geometryType: spatial.geometryType,
    returnIdsOnly: "true",
  };
  if (spatial.distance != null) {
    params.distance = String(spatial.distance);
    params.units = spatial.units || "esriSRUnit_Meter";
  }

  const url = layerQueryUrl(layerId, params);
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
  return Array.isArray(data?.objectIds) ? data.objectIds : [];
}

async function fetchFeaturesByObjectIds(layerId, objectIds, outFields, log, deadlineMs) {
  if (!objectIds?.length) return [];
  const remaining = budgetRemaining(deadlineMs);
  if (remaining < 2500) {
    log.lastApiError = "lookup_budget_exceeded";
    return [];
  }

  const ids = objectIds.slice(0, MAX_EASEMENT_FEATURES);
  const where = `OBJECTID IN (${ids.join(",")})`;
  const params = {
    f: "geojson",
    outSR: "4326",
    returnGeometry: "true",
    outFields,
    where,
    resultRecordCount: String(ids.length),
  };

  const url = layerQueryUrl(layerId, params);
  const { data, durationMs, status, error } = await fetchArcGisJson(url, remaining);
  log.apiCalls = (log.apiCalls || 0) + 1;
  log.lastApiDurationMs = durationMs;
  log.lastApiStatus = status;
  if (error) {
    log.lastApiError = error;
    return [];
  }
  return data?.features || [];
}

function mapEasementFeature(feature, layerKind) {
  const p = feature?.properties || {};
  const label =
    layerKind === "road_casement"
      ? p.locality_name
        ? `Road casement — ${p.locality_name}`
        : "Road casement"
      : p.status
        ? `Easement (${p.status})`
        : "Easement";

  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      easement_type: layerKind,
      label,
      pfi: p.pfi != null ? String(p.pfi) : null,
      status: p.status != null ? String(p.status) : null,
      locality_name: p.locality_name != null ? String(p.locality_name) : null,
      intersection: p.intersection != null ? String(p.intersection) : null,
      lga_code: p.lga_code != null ? String(p.lga_code) : null,
      z_level: p.z_level != null ? String(p.z_level) : null,
      object_id: p.OBJECTID != null ? p.OBJECTID : null,
    },
  };
}

async function queryEasementFeatures(spatial, log, deadlineMs) {
  const easementIds = await fetchSpatialObjectIds(LAYER_EASEMENT, spatial, log, deadlineMs);
  const roadCasementIds = await fetchSpatialObjectIds(
    LAYER_ROAD_CASEMENT,
    spatial,
    log,
    deadlineMs
  );

  const easementFeaturesRaw = await fetchFeaturesByObjectIds(
    LAYER_EASEMENT,
    easementIds,
    "OBJECTID,pfi,status,ufi",
    log,
    deadlineMs
  );
  const roadCasementFeaturesRaw = await fetchFeaturesByObjectIds(
    LAYER_ROAD_CASEMENT,
    roadCasementIds,
    "OBJECTID,pfi,locality_name,intersection,lga_code,z_level",
    log,
    deadlineMs
  );

  return dedupeEasementFeatures([
    ...easementFeaturesRaw.map((f) => mapEasementFeature(f, "easement")),
    ...roadCasementFeaturesRaw.map((f) => mapEasementFeature(f, "road_casement")),
  ]).slice(0, MAX_EASEMENT_FEATURES);
}

function dedupeEasementFeatures(features) {
  const seen = new Set();
  return features.filter((f) => {
    const key = [
      f.properties?.easement_type,
      f.properties?.object_id,
      f.properties?.pfi,
      f.geometry?.type,
      JSON.stringify(f.geometry?.coordinates?.[0]?.[0] ?? null),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {{ state: string, lat: number, lng: number, envelope?: string|null, boundaryGeometry?: object|null, parcelId?: string|null }} input
 */
async function lookupPropertyEasements({
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
    source: "VIC_VICMAP_PROPERTY_EASEMENTS",
  };

  if (state === "QLD") {
    log.durationMs = Date.now() - started;
    console.log("[property-easements]", log);
    return { error: "QLD easements lookup is not implemented yet", status: 501, log };
  }

  if (state !== "VIC") {
    log.durationMs = Date.now() - started;
    console.log("[property-easements]", log);
    return { error: "Unsupported state. Use VIC or QLD.", status: 400, log };
  }

  const deadlineMs = Date.now() + LOOKUP_BUDGET_MS;
  const strategies = buildSpatialStrategies({ lat, lng, boundaryGeometry, envelope });

  let features = [];
  let usedStrategy = null;
  for (const spatial of strategies) {
    features = await queryEasementFeatures(spatial, log, deadlineMs);
    if (features.length > 0) {
      usedStrategy = spatial;
      break;
    }
  }

  log.queryMode = usedStrategy?.mode || strategies[0]?.mode || null;
  log.confidence = usedStrategy?.confidence || strategies[0]?.confidence || null;

  const countBeforeClip = features.length;
  if (boundaryGeometry && features.length > 0) {
    features = clipEasementFeaturesToBoundary(features, boundaryGeometry);
    log.clippedToBoundary = true;
    log.countBeforeClip = countBeforeClip;
    log.countAfterClip = features.length;
  }

  const easementsGeoJson =
    features.length > 0
      ? {
          type: "FeatureCollection",
          features,
        }
      : null;

  log.easementCount = features.filter((f) => f.properties?.easement_type === "easement").length;
  log.roadCasementCount = features.filter((f) => f.properties?.easement_type === "road_casement").length;
  log.count = features.length;
  log.durationMs = Date.now() - started;
  console.log("[property-easements]", log);

  return {
    hit: {
      easementsGeoJson,
      count: features.length,
      source: "VIC_VICMAP_PROPERTY_EASEMENTS",
      confidence: usedStrategy?.confidence || strategies[0]?.confidence || "point",
      warning: EASEMENT_WARNING,
      message: features.length === 0 ? "No mapped easements found." : null,
      parcelId: parcelId || null,
    },
    log,
  };
}

function formatPropertyEasementsResponse(hit) {
  return {
    ok: true,
    easementsGeoJson: hit.easementsGeoJson,
    count: hit.count,
    source: hit.source,
    confidence: hit.confidence,
    warning: hit.warning,
    message: hit.message,
    parcelId: hit.parcelId,
  };
}

module.exports = {
  normalizeEasementsState,
  parseEasementsLatLng,
  parseEnvelope,
  parseBoundaryGeometry,
  normalizeBoundaryInput,
  lookupPropertyEasements,
  formatPropertyEasementsResponse,
  EASEMENT_WARNING,
};
