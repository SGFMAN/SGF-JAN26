/**
 * Victorian planning scheme lookup via Vicmap Planning (ArcGIS FeatureServer).
 * Source: https://services-ap1.arcgis.com/.../Vicmap_Planning/FeatureServer
 *
 * Layers: 3 = PLAN_ZONE, 2 = PLAN_OVERLAY
 * Query: point (pin) for zone; point or property envelope for overlays.
 */

const VICMAP_PLANNING_BASE =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Planning/FeatureServer";

const LAYER_PLAN_ZONE = 3;
const LAYER_PLAN_OVERLAY = 2;

const FETCH_TIMEOUT_MS = 20000;
const LOOKUP_BUDGET_MS = 35000;
const MAX_OVERLAY_FEATURES = 30;

function normalizePlanningState(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return s;
}

function parsePlanningLatLng(query) {
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
      error: aborted ? "Vicmap Planning request timed out" : e.message || String(e),
    };
  }
}

function layerQueryUrl(layerId, params) {
  return `${VICMAP_PLANNING_BASE}/${layerId}/query?${new URLSearchParams(params).toString()}`;
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

  const url = layerQueryUrl(layerId, params);
  const { data, durationMs, status, error } = await fetchArcGisJson(url, remaining);
  log.apiCalls = (log.apiCalls || 0) + 1;
  log.lastApiDurationMs = durationMs;
  log.lastApiStatus = status;
  if (error) {
    log.lastApiError = error;
    return [];
  }
  return Array.isArray(data?.objectIds) ? data.objectIds : [];
}

async function fetchFeaturesByObjectIds(layerId, objectIds, returnGeometry, log, deadlineMs) {
  if (!objectIds?.length) return [];
  const remaining = budgetRemaining(deadlineMs);
  if (remaining < 2500) {
    log.lastApiError = "lookup_budget_exceeded";
    return [];
  }

  const ids = objectIds.slice(0, MAX_OVERLAY_FEATURES);
  const where = `OBJECTID IN (${ids.join(",")})`;
  const params = {
    f: "geojson",
    outSR: "4326",
    returnGeometry: returnGeometry ? "true" : "false",
    outFields:
      "OBJECTID,pfi,scheme_code,lga_code,lga,zone_num,zone_status,zone_code,zone_description",
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

function mapZoneFeature(feature) {
  const p = feature?.properties || {};
  return {
    code: p.zone_code != null ? String(p.zone_code) : null,
    description: p.zone_description != null ? String(p.zone_description) : null,
    schemeCode: p.scheme_code != null ? String(p.scheme_code) : null,
    lgaCode: p.lga_code != null ? String(p.lga_code) : null,
    council: p.lga != null ? String(p.lga) : null,
    zoneNum: p.zone_num != null ? p.zone_num : null,
    zoneStatus: p.zone_status != null ? String(p.zone_status) : null,
    pfi: p.pfi != null ? String(p.pfi) : null,
  };
}

function mapOverlayFeature(feature) {
  const p = feature?.properties || {};
  return {
    code: p.zone_code != null ? String(p.zone_code) : null,
    description: p.zone_description != null ? String(p.zone_description) : null,
    schemeCode: p.scheme_code != null ? String(p.scheme_code) : null,
    council: p.lga != null ? String(p.lga) : null,
    lgaCode: p.lga_code != null ? String(p.lga_code) : null,
    pfi: p.pfi != null ? String(p.pfi) : null,
  };
}

function dedupeOverlays(overlays) {
  const seen = new Set();
  return overlays.filter((o) => {
    const key = o.code || o.description;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {{ state: string, lat: number, lng: number, envelope?: string|null }} input
 */
async function lookupPlanningInfo({ state, lat, lng, envelope }) {
  const started = Date.now();
  const log = {
    state,
    markerLat: lat,
    markerLng: lng,
    envelope: envelope || null,
    apiCalls: 0,
    queryMode: null,
    source: "VIC_VICMAP_PLANNING",
  };

  if (state === "QLD") {
    log.durationMs = Date.now() - started;
    console.log("[planning-info]", log);
    return { error: "QLD planning lookup is not implemented yet", status: 501, log };
  }

  if (state !== "VIC") {
    log.durationMs = Date.now() - started;
    console.log("[planning-info]", log);
    return { error: "Unsupported state. Use VIC or QLD.", status: 400, log };
  }

  const deadlineMs = Date.now() + LOOKUP_BUDGET_MS;
  const point = `${lng},${lat}`;

  log.queryMode = "point_zone";
  const zoneIds = await fetchSpatialObjectIds(
    LAYER_PLAN_ZONE,
    {
      spatialRel: "esriSpatialRelWithin",
      geometry: point,
      geometryType: "esriGeometryPoint",
    },
    log,
    deadlineMs
  );

  let zoneFeatures = [];
  if (zoneIds.length > 0) {
    zoneFeatures = await fetchFeaturesByObjectIds(
      LAYER_PLAN_ZONE,
      zoneIds.slice(0, 1),
      true,
      log,
      deadlineMs
    );
  }

  const overlaySpatial = envelope
    ? {
        spatialRel: "esriSpatialRelIntersects",
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
      }
    : {
        spatialRel: "esriSpatialRelIntersects",
        geometry: point,
        geometryType: "esriGeometryPoint",
      };

  log.overlayQueryMode = envelope ? "envelope" : "point";
  const overlayIds = await fetchSpatialObjectIds(
    LAYER_PLAN_OVERLAY,
    overlaySpatial,
    log,
    deadlineMs
  );

  const overlayFeaturesRaw = await fetchFeaturesByObjectIds(
    LAYER_PLAN_OVERLAY,
    overlayIds,
    true,
    log,
    deadlineMs
  );

  const zone = zoneFeatures[0] ? mapZoneFeature(zoneFeatures[0]) : null;
  const overlays = dedupeOverlays(overlayFeaturesRaw.map(mapOverlayFeature));
  const council = zone?.council || overlays[0]?.council || null;

  const overlayGeoJson =
    overlayFeaturesRaw.length > 0
      ? {
          type: "FeatureCollection",
          features: overlayFeaturesRaw.map((f) => ({
            type: "Feature",
            geometry: f.geometry,
            properties: {
              overlay_code: f.properties?.zone_code || null,
              overlay_description: f.properties?.zone_description || null,
              scheme_code: f.properties?.scheme_code || null,
            },
          })),
        }
      : null;

  const zoneGeoJson =
    zoneFeatures[0]?.geometry
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: zoneFeatures[0].geometry,
              properties: {
                zone_code: zoneFeatures[0].properties?.zone_code || null,
                zone_description: zoneFeatures[0].properties?.zone_description || null,
                scheme_code: zoneFeatures[0].properties?.scheme_code || null,
              },
            },
          ],
        }
      : null;

  log.zoneCount = zone ? 1 : 0;
  log.overlayCount = overlays.length;
  log.durationMs = Date.now() - started;
  console.log("[planning-info]", log);

  return {
    hit: {
      council,
      planningZone: zone
        ? {
            code: zone.code,
            description: zone.description,
            schemeCode: zone.schemeCode,
            lgaCode: zone.lgaCode,
          }
        : null,
      overlays,
      overlayCodes: overlays.map((o) => o.code).filter(Boolean),
      overlayGeoJson,
      zoneGeoJson,
      source: "VIC_VICMAP_PLANNING",
    },
    log,
  };
}

function formatPlanningInfoResponse(hit) {
  return {
    ok: true,
    council: hit.council,
    planningZone: hit.planningZone,
    overlays: hit.overlays,
    overlayCodes: hit.overlayCodes,
    overlayGeoJson: hit.overlayGeoJson,
    zoneGeoJson: hit.zoneGeoJson,
    source: hit.source,
  };
}

module.exports = {
  normalizePlanningState,
  parsePlanningLatLng,
  parseEnvelope,
  lookupPlanningInfo,
  formatPlanningInfoResponse,
};
