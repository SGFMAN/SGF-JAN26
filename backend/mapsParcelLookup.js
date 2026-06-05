/**
 * Cadastral title boundary lookup for the Maps page.
 * VIC: Vicmap Parcel (EPSG:4326). QLD: stub for future QSpatial integration.
 *
 * Selection rule: pin must drive matching — containing polygon first (smallest area),
 * then nearest polygon edge as approximate fallback (never nearest centroid).
 */

const VICMAP_PARCEL_QUERY_URL =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Parcel/FeatureServer/0/query";

const VICMAP_FETCH_TIMEOUT_MS = 90000;
const VICMAP_POINT_BUFFER_METRES = 50;
/** Smallest envelope first (~33 m at 0.0003°) to limit neighbour lots in dense areas. */
const VICMAP_ENVELOPE_DELTAS = [0.0003, 0.0005, 0.0008, 0.001, 0.002];
const VICMAP_PAGE_SIZE = 50;
const VICMAP_MAX_PAGES = 3;
const PARCEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PARCEL_MISS_CACHE_TTL_MS = 5 * 60 * 1000;
const PARCEL_CACHE_MAX = 500;
/** Ignore degenerate slivers when picking smallest containing parcel (≈ few m² in degrees²). */
const MIN_PARCEL_AREA_SQ_DEG = 1e-11;

const APPROXIMATE_WARNING =
  "Boundary is approximate — confirm against title.";

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

function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function closestPointOnSegment(lng, lat, lng1, lat1, lng2, lat2) {
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  if (dx === 0 && dy === 0) return { lng: lng1, lat: lat1 };
  let t = ((lng - lng1) * dx + (lat - lat1) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return { lng: lng1 + t * dx, lat: lat1 + t * dy };
}

function distancePointToRingMetres(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    const closest = closestPointOnSegment(lng, lat, lng1, lat1, lng2, lat2);
    const d = haversineMetres(lat, lng, closest.lat, closest.lng);
    if (d < min) min = d;
  }
  return min;
}

/** Minimum distance from pin to polygon exterior (metres). Zero when pin is inside. */
function distancePointToPolygonMetres(geometry, lat, lng) {
  if (!geometry) return Infinity;
  if (geometryContainsPoint(geometry, lat, lng)) return 0;

  if (geometry.type === "Polygon") {
    return distancePointToRingMetres(lng, lat, geometry.coordinates?.[0]);
  }
  if (geometry.type === "MultiPolygon") {
    let min = Infinity;
    for (const poly of geometry.coordinates || []) {
      const d = distancePointToRingMetres(lng, lat, poly?.[0]);
      if (d < min) min = d;
    }
    return min;
  }
  return Infinity;
}

function dedupeParcelFeatures(features) {
  const seen = new Map();
  for (const feature of features || []) {
    const pfi = feature?.properties?.parcel_pfi;
    const key = pfi || JSON.stringify(feature?.geometry?.coordinates?.[0]?.[0]);
    if (!key || seen.has(key)) continue;
    seen.set(key, feature);
  }
  return [...seen.values()];
}

function parcelIdentifiers(properties) {
  const p = properties || {};
  const lot = p.parcel_lot_number != null ? String(p.parcel_lot_number).trim() : "";
  const plan = p.parcel_plan_number != null ? String(p.parcel_plan_number).trim() : "";
  const spi = lot && plan ? `${lot}/${plan}` : lot || plan || null;
  return {
    parcelPfi: p.parcel_pfi != null ? String(p.parcel_pfi) : null,
    parcelId: p.parcel_id != null ? String(p.parcel_id) : null,
    parcelLot: lot || null,
    parcelPlan: plan || null,
    parcelSpi: spi,
  };
}

/**
 * Pick parcel whose polygon contains the pin (smallest valid area).
 * If none contain the pin, pick nearest polygon by edge distance (not centroid).
 */
function selectParcelForPin(features, lat, lng) {
  const list = features || [];
  const containing = list.filter((f) => {
    const area = polygonArea(f?.geometry);
    return geometryContainsPoint(f?.geometry, lat, lng) && area >= MIN_PARCEL_AREA_SQ_DEG;
  });

  if (containing.length > 0) {
    let best = containing[0];
    let bestArea = polygonArea(best.geometry);
    for (let i = 1; i < containing.length; i++) {
      const area = polygonArea(containing[i].geometry);
      if (area < bestArea) {
        bestArea = area;
        best = containing[i];
      }
    }
    return {
      feature: best,
      matchMethod: "contains",
      containsPin: true,
      approximate: false,
      confidence: "high",
      distanceToBoundaryMetres: 0,
      warning: null,
    };
  }

  let nearest = null;
  let nearestDist = Infinity;
  for (const f of list) {
    const d = distancePointToPolygonMetres(f?.geometry, lat, lng);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = f;
    }
  }

  if (!nearest || !Number.isFinite(nearestDist)) {
    return null;
  }

  return {
    feature: nearest,
    matchMethod: "nearest",
    containsPin: false,
    approximate: true,
    confidence: "approximate",
    distanceToBoundaryMetres: Math.round(nearestDist * 10) / 10,
    warning: APPROXIMATE_WARNING,
  };
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

async function fetchAllParcelFeaturesInQuery(baseParams, log) {
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
      break;
    }

    const batch = geo?.features || [];
    allFeatures = dedupeParcelFeatures([...allFeatures, ...batch]);

    const exceeded = geo?.properties?.exceededTransferLimit === true;
    if (batch.length === 0 || (!exceeded && batch.length < VICMAP_PAGE_SIZE)) {
      log.pagesFetched = (log.pagesFetched || 0) + page + 1;
      break;
    }
    offset += batch.length;
    log.pagesFetched = page + 1;
  }

  return allFeatures;
}

function buildParcelHitFromSelection(selection, lat, lng, log) {
  const picked = selection.feature;
  const ids = parcelIdentifiers(picked.properties);

  log.matchMethod = selection.matchMethod;
  log.containsPin = selection.containsPin;
  log.approximate = selection.approximate;
  log.confidence = selection.confidence;
  log.distanceToBoundaryMetres = selection.distanceToBoundaryMetres;
  log.selectedParcelPfi = ids.parcelPfi;
  log.selectedParcelId = ids.parcelId;
  log.selectedParcelSpi = ids.parcelSpi;
  log.selectedLot = ids.parcelLot;
  log.selectedPlan = ids.parcelPlan;

  return {
    geometry: picked.geometry,
    properties: picked.properties || {},
    source: "VIC_CADASTRE",
    containsPin: selection.containsPin,
    approximate: selection.approximate,
    matchMethod: selection.matchMethod,
    confidence: selection.confidence,
    distanceToBoundaryMetres: selection.distanceToBoundaryMetres,
    warning: selection.warning,
    parcelPfi: ids.parcelPfi,
    parcelId: ids.parcelId,
    parcelSpi: ids.parcelSpi,
  };
}

/**
 * Query Vicmap parcels near the search pin (WGS84) and return the best-matching lot.
 * GIS query point: x = lng, y = lat, inSR/outSR = EPSG:4326.
 */
async function queryVicParcelForPin(lat, lng, log) {
  const outFields =
    "parcel_pfi,parcel_lot_number,parcel_plan_number,parcel_id,parcel_lga_code";
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
  let allCandidates = [];

  for (const delta of VICMAP_ENVELOPE_DELTAS) {
    const envelope = [lng - delta, lat - delta, lng + delta, lat + delta].join(",");
    log.queryMode = "envelope";
    log.envelopeDelta = delta;
    log.envelope = envelope;

    const batch = await fetchAllParcelFeaturesInQuery(
      {
        ...base,
        geometry: envelope,
        geometryType: "esriGeometryEnvelope",
      },
      log
    );
    allCandidates = dedupeParcelFeatures([...allCandidates, ...batch]);
    log.candidateCount = allCandidates.length;

    const selection = selectParcelForPin(allCandidates, lat, lng);
    if (selection?.matchMethod === "contains") {
      log.featuresScanned = allCandidates.length;
      return buildParcelHitFromSelection(selection, lat, lng, log);
    }
  }

  log.queryMode = "point_buffer";
  log.envelope = undefined;
  log.envelopeDelta = undefined;

  const bufferBatch = await fetchAllParcelFeaturesInQuery(
    {
      ...base,
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      distance: String(VICMAP_POINT_BUFFER_METRES),
      units: "esriSRUnit_Meter",
    },
    log
  );
  allCandidates = dedupeParcelFeatures([...allCandidates, ...bufferBatch]);
  log.candidateCount = allCandidates.length;
  log.featuresScanned = allCandidates.length;

  const selection = selectParcelForPin(allCandidates, lat, lng);
  if (!selection) {
    log.selectedParcelPfi = null;
    log.containsPin = false;
    log.matchMethod = null;
    return null;
  }

  return buildParcelHitFromSelection(selection, lat, lng, log);
}

async function lookupParcelBoundary({ state, lat, lng, address }) {
  const started = Date.now();
  const log = {
    state,
    searchedAddress: address ? String(address).trim() : null,
    markerLat: lat,
    markerLng: lng,
    searchedLat: lat,
    searchedLng: lng,
    queryX: lng,
    queryY: lat,
    spatialReference: "EPSG:4326",
    bufferMetres: VICMAP_POINT_BUFFER_METRES,
    cacheHit: false,
    candidateCount: 0,
    matchMethod: null,
    approximate: false,
  };

  if (state === "QLD") {
    log.durationMs = Date.now() - started;
    console.log("[property-boundary]", log);
    return { error: "QLD parcel lookup is not implemented yet", status: 501, log };
  }

  if (state !== "VIC") {
    log.durationMs = Date.now() - started;
    console.log("[property-boundary]", log);
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
      if (cached.value) {
        log.containsPin = cached.value.containsPin;
        log.approximate = cached.value.approximate;
        log.matchMethod = cached.value.matchMethod;
        log.candidateCount = cached.value.candidateCount;
        log.selectedParcelPfi = cached.value.parcelPfi;
        log.distanceToBoundaryMetres = cached.value.distanceToBoundaryMetres;
      }
      console.log("[property-boundary]", log);
      if (!cached.value) {
        return { notFound: true, log };
      }
      return { hit: cached.value, log };
    }
  }

  let hit = await queryVicParcelForPin(lat, lng, log);
  log.candidateCount = log.featuresScanned || log.candidateCount || 0;

  if (!hit && shouldUseDevParcelMock()) {
    console.warn("[property-boundary] Using dev mock parcel boundary (MAPS_PARCEL_MOCK=1)");
    hit = {
      geometry: buildMockVicParcelGeometry(lat, lng),
      properties: { mock: true, note: "Dev mock boundary — not official cadastral data" },
      source: "VIC_CADASTRE_MOCK",
      containsPin: true,
      approximate: false,
      matchMethod: "contains",
      confidence: "high",
      distanceToBoundaryMetres: 0,
      warning: null,
      parcelPfi: "MOCK",
      parcelId: null,
      parcelSpi: null,
    };
    log.selectedParcelPfi = "MOCK";
    log.containsPin = true;
    log.matchMethod = "contains";
    log.approximate = false;
  }

  const cacheValue = hit
    ? { ...hit, candidateCount: log.candidateCount }
    : null;
  parcelCache.set(cacheKey, { at: Date.now(), value: cacheValue });
  trimParcelCache();

  log.durationMs = Date.now() - started;
  log.featuresReturned = log.featuresScanned || 0;
  console.log("[property-boundary]", log);

  if (!hit) {
    return { notFound: true, log };
  }

  return { hit, log };
}

/** JSON body for Maps / property-boundary API responses. */
function formatPropertyBoundaryResponse(hit) {
  return {
    ok: true,
    type: "Feature",
    geometry: hit.geometry,
    properties: hit.properties,
    source: hit.source,
    containsPin: hit.containsPin === true,
    approximate: hit.approximate === true,
    matchMethod: hit.matchMethod || null,
    confidence: hit.confidence || (hit.containsPin ? "high" : "approximate"),
    distanceToBoundaryMetres: hit.distanceToBoundaryMetres ?? null,
    warning: hit.warning || null,
    parcelPfi: hit.parcelPfi ?? null,
    parcelId: hit.parcelId ?? null,
    parcelSpi: hit.parcelSpi ?? null,
  };
}

module.exports = {
  normalizeParcelState,
  parseParcelLatLng,
  lookupParcelBoundary,
  formatPropertyBoundaryResponse,
  geometryContainsPoint,
  APPROXIMATE_WARNING,
};
