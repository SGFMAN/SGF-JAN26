/**
 * Cadastral title boundary lookup for the Maps page.
 * VIC: Vicmap Parcel (EPSG:4326). QLD: stub for future QSpatial integration.
 */

const VICMAP_PARCEL_QUERY_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Parcel/FeatureServer/0/query";

const VICMAP_FETCH_TIMEOUT_MS = 90000;
const VICMAP_POINT_BUFFER_METRES = 50;
/** Try smallest envelope first (~55 m at 0.0005°) to reduce neighbour lots in dense areas. */
const VICMAP_ENVELOPE_DELTAS = [0.0005, 0.0008, 0.001];
const VICMAP_PAGE_SIZE = 25;
const VICMAP_MAX_PAGES = 2;
const PARCEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PARCEL_MISS_CACHE_TTL_MS = 5 * 60 * 1000;
const PARCEL_CACHE_MAX = 500;

/** @type {Map<string, { at: number, value: object | null }>} */
const parcelCache = new Map();

function shouldUseDevParcelMock() {
  return process.env.MAPS_PARCEL_MOCK === "1";
}

function normalizeParcelState(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return s;
}

function parseParcelLatLng(query) {
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

function parcelCacheKey(state, lat, lng) {
  return `${state}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

function trimParcelCache() {
  if (parcelCache.size <= PARCEL_CACHE_MAX) return;
  const entries = [...parcelCache.entries()].sort((a, b) => a[1].at - b[1].at);
  const remove = entries.length - PARCEL_CACHE_MAX;
  for (let i = 0; i < remove; i++) {
    parcelCache.delete(entries[i][0]);
  }
}

function buildMockVicParcelGeometry(lat, lng) {
  const dLat = 0.00011;
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  const dLng = dLat / cosLat;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  };
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const denom = yj - yi;
    if (denom === 0) continue;
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry, lat, lng) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates;
    if (!Array.isArray(rings?.[0])) return false;
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) return false;
    }
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) => {
      if (!Array.isArray(poly?.[0])) return false;
      if (!pointInRing(lng, lat, poly[0])) return false;
      for (let i = 1; i < poly.length; i++) {
        if (pointInRing(lng, lat, poly[i])) return false;
      }
      return true;
    });
  }
  return false;
}

function ringSignedArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return Infinity;
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}

function polygonArea(geometry) {
  if (!geometry) return Infinity;
  if (geometry.type === "Polygon") return ringSignedArea(geometry.coordinates?.[0]);
  if (geometry.type === "MultiPolygon") {
    let total = 0;
    for (const poly of geometry.coordinates || []) {
      total += ringSignedArea(poly?.[0]);
    }
    return total || Infinity;
  }
  return Infinity;
}

function dedupeParcelFeatures(features) {
  const seen = new Map();
  for (const feature of features || []) {
    const pfi = feature?.properties?.parcel_pfi;
    if (!pfi || seen.has(pfi)) continue;
    seen.set(pfi, feature);
  }
  return [...seen.values()];
}

/** Return the parcel whose polygon contains the point, or null. Never returns a neighbour by distance. */
function pickParcelContainingPoint(features, lat, lng) {
  const containing = (features || []).filter((f) =>
    geometryContainsPoint(f?.geometry, lat, lng)
  );
  if (containing.length === 0) return null;
  if (containing.length === 1) return containing[0];

  let best = containing[0];
  let bestArea = polygonArea(best.geometry);
  for (let i = 1; i < containing.length; i++) {
    const area = polygonArea(containing[i].geometry);
    if (area < bestArea) {
      bestArea = area;
      best = containing[i];
    }
  }
  return best;
}

async function fetchVicmapPage(params) {
  const url = `${VICMAP_PARCEL_QUERY_URL}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VICMAP_FETCH_TIMEOUT_MS);
  const fetchStarted = Date.now();
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const durationMs = Date.now() - fetchStarted;
    if (!resp.ok) {
      return { geo: null, durationMs, status: resp.status, error: resp.statusText };
    }
    const geo = await resp.json().catch(() => null);
    if (geo?.error) {
      return { geo: null, durationMs, status: 200, error: geo.error };
    }
    return { geo, durationMs, status: 200, error: null };
  } catch (e) {
    return {
      geo: null,
      durationMs: Date.now() - fetchStarted,
      status: 0,
      error: e.message || String(e),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchParcelsContainingPoint(baseParams, lat, lng, log) {
  let offset = 0;
  let allFeatures = [];

  for (let page = 0; page < VICMAP_MAX_PAGES; page++) {
    const { geo, durationMs, status, error } = await fetchVicmapPage({
      ...baseParams,
      resultRecordCount: String(VICMAP_PAGE_SIZE),
      resultOffset: String(offset),
    });

    log.apiCalls = (log.apiCalls || 0) + 1;
    log.lastApiDurationMs = durationMs;
    log.lastApiStatus = status;
    if (error) {
      log.lastApiError = error;
      return null;
    }

    const batch = geo?.features || [];
    allFeatures = dedupeParcelFeatures([...allFeatures, ...batch]);
    log.featuresScanned = allFeatures.length;

    const picked = pickParcelContainingPoint(allFeatures, lat, lng);
    if (picked) {
      log.pagesFetched = page + 1;
      return picked;
    }

    const exceeded = geo?.properties?.exceededTransferLimit === true;
    if (batch.length === 0 || (!exceeded && batch.length < VICMAP_PAGE_SIZE)) {
      log.pagesFetched = page + 1;
      return null;
    }
    offset += batch.length;
  }

  log.pagesFetched = VICMAP_MAX_PAGES;
  return null;
}

function buildParcelHit(picked, lat, lng, log) {
  log.selectedParcelPfi = picked.properties?.parcel_pfi || null;
  log.selectedLot = picked.properties?.parcel_lot_number || null;
  log.selectedPlan = picked.properties?.parcel_plan_number || null;
  log.containsPin = geometryContainsPoint(picked.geometry, lat, lng);

  if (!log.containsPin) {
    log.selectedParcelPfi = null;
    return null;
  }

  return {
    geometry: picked.geometry,
    properties: picked.properties || {},
    source: "VIC_CADASTRE",
    containsPin: true,
  };
}

/**
 * Query Vicmap parcels near the search pin (WGS84) and return the lot that contains the pin.
 * GIS query point: x = lng, y = lat, inSR/outSR = EPSG:4326.
 */
async function queryVicParcelContainingPoint(lat, lng, log) {
  const outFields = "parcel_pfi,parcel_lot_number,parcel_plan_number,parcel_id,parcel_lga_code";
  const base = {
    f: "geojson",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "true",
    outFields,
  };

  log.apiUrl = VICMAP_PARCEL_QUERY_URL;
  log.apiCalls = 0;
  let envelopeHadFeatures = false;

  for (const delta of VICMAP_ENVELOPE_DELTAS) {
    const envelope = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
    log.queryMode = "envelope";
    log.envelopeDelta = delta;
    log.envelope = envelope;
    log.queryParams = {
      ...base,
      geometry: envelope,
      geometryType: "esriGeometryEnvelope",
    };

    const picked = await searchParcelsContainingPoint(
      {
        ...base,
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
      },
      lat,
      lng,
      log
    );
    if (picked) {
      return buildParcelHit(picked, lat, lng, log);
    }
    if ((log.featuresScanned || 0) > 0) {
      envelopeHadFeatures = true;
    }
  }

  if (envelopeHadFeatures) {
    log.queryMode = "envelope_exhausted";
    log.selectedParcelPfi = null;
    log.containsPin = false;
    log.featuresReturned = log.featuresScanned || 0;
    return null;
  }

  log.queryMode = "point_buffer";
  log.envelope = undefined;
  log.envelopeDelta = undefined;
  log.queryParams = {
    ...base,
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    distance: String(VICMAP_POINT_BUFFER_METRES),
    units: "esriSRUnit_Meter",
  };

  const picked = await searchParcelsContainingPoint(
    {
      ...base,
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      distance: String(VICMAP_POINT_BUFFER_METRES),
      units: "esriSRUnit_Meter",
    },
    lat,
    lng,
    log
  );
  if (picked) {
    return buildParcelHit(picked, lat, lng, log);
  }

  log.selectedParcelPfi = null;
  log.containsPin = false;
  log.featuresReturned = log.featuresScanned || 0;
  return null;
}

async function lookupParcelBoundary({ state, lat, lng }) {
  const started = Date.now();
  const log = {
    state,
    searchedLat: lat,
    searchedLng: lng,
    queryX: lng,
    queryY: lat,
    spatialReference: "EPSG:4326",
    bufferMetres: VICMAP_POINT_BUFFER_METRES,
    cacheHit: false,
  };

  if (state === "QLD") {
    log.durationMs = Date.now() - started;
    console.log("[maps/parcel]", log);
    return { error: "QLD parcel lookup is not implemented yet", status: 501, log };
  }

  if (state !== "VIC") {
    log.durationMs = Date.now() - started;
    console.log("[maps/parcel]", log);
    return { error: "Unsupported state. Use VIC or QLD.", status: 400, log };
  }

  const cacheKey = parcelCacheKey(state, lat, lng);
  const cached = parcelCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.at;
    const ttl = cached.value ? PARCEL_CACHE_TTL_MS : PARCEL_MISS_CACHE_TTL_MS;
    if (age < ttl) {
      log.cacheHit = true;
      log.durationMs = Date.now() - started;
      log.containsPin = cached.value?.containsPin ?? false;
      log.selectedParcelPfi = cached.value?.properties?.parcel_pfi ?? null;
      console.log("[maps/parcel]", log);
      if (!cached.value) {
        return { notFound: true, log };
      }
      return { hit: cached.value, log };
    }
  }

  let hit = await queryVicParcelContainingPoint(lat, lng, log);

  if (!hit && shouldUseDevParcelMock()) {
    console.warn("[maps/parcel] Using dev mock parcel boundary (MAPS_PARCEL_MOCK=1)");
    hit = {
      geometry: buildMockVicParcelGeometry(lat, lng),
      properties: { mock: true, note: "Dev mock boundary — not official cadastral data" },
      source: "VIC_CADASTRE_MOCK",
      containsPin: true,
    };
    log.selectedParcelPfi = "MOCK";
    log.containsPin = true;
  }

  parcelCache.set(cacheKey, { at: Date.now(), value: hit });
  trimParcelCache();

  log.durationMs = Date.now() - started;
  log.featuresReturned = log.featuresScanned || 0;
  console.log("[maps/parcel]", log);

  if (!hit) {
    return { notFound: true, log };
  }

  return { hit, log };
}

module.exports = {
  normalizeParcelState,
  parseParcelLatLng,
  lookupParcelBoundary,
  geometryContainsPoint,
};
