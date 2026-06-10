/**
 * Victorian AHD elevation via Vicmap Elevation FeatureServer (DEECA).
 * Interpolate mode: four surrounding survey monuments + bilinear patch over the site.
 */

const VICMAP_ELEVATION_METRO =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer";

const VICMAP_ELEVATION_STATEWIDE =
  "https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_STATEWIDE_10_to_20_metre/FeatureServer";

const METRO_GROUND_LAYER = 0;
const METRO_CONTOUR_LAYER = 1;
const STATEWIDE_GROUND_LAYER = 4;
const STATEWIDE_CONTOUR_LAYER = 6;

const FETCH_TIMEOUT_MS = 22000;
const MAX_POINTS = 64;
const LOOKUP_CONCURRENCY = 4;
const METRO_GROUND_RADIUS_M = 600;
const STATEWIDE_GROUND_RADIUS_M = 1200;
const GROUND_RESULT_COUNT = 80;
const MONUMENT_RESULT_COUNT = 2000;
const MONUMENT_ENVELOPE_PAD_M = 3500;
const MONUMENT_CORNER_RADII_M = [400, 800, 1600, 3200, 6400, 10000, 15000];
const IDW_MAX_CONTRIBUTORS = 10;
const IDW_MAX_RADIUS_M = 450;
const IDW_MIN_DISTANCE_M = 2;
const SURROUND_QUADRANT_TRY = 16;
const QUAD_MIN_EDGE_M = 4;

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

function latLngToWebMercator(lat, lng) {
  const x = (lng * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180) * 20037508.34) / 180;
  return { x, y };
}

function webMercatorToLatLng(x, y) {
  const lng = (x / 20037508.34) * 180;
  const lat =
    (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
  return { lat, lng };
}

function latLngFromArcGisGeometry(geometry) {
  if (!geometry) return null;
  const x = Number(geometry.x ?? geometry?.paths?.[0]?.[0]?.[0]);
  const y = Number(geometry.y ?? geometry?.paths?.[0]?.[0]?.[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > 180 || Math.abs(y) > 90) {
    return webMercatorToLatLng(x, y);
  }
  return { lat: y, lng: x };
}

const ELEVATION_MONUMENT_LAYERS = [
  { baseUrl: VICMAP_ELEVATION_METRO, layerId: METRO_GROUND_LAYER, kind: "point", label: "metro_ground" },
  { baseUrl: VICMAP_ELEVATION_METRO, layerId: METRO_CONTOUR_LAYER, kind: "contour", label: "metro_contour" },
  {
    baseUrl: VICMAP_ELEVATION_STATEWIDE,
    layerId: STATEWIDE_GROUND_LAYER,
    kind: "point",
    label: "statewide_ground",
  },
  {
    baseUrl: VICMAP_ELEVATION_STATEWIDE,
    layerId: STATEWIDE_CONTOUR_LAYER,
    kind: "contour",
    label: "statewide_contour",
  },
];

function toLocalEN(lat, lng, originLat, originLng) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos((originLat * Math.PI) / 180);
  return {
    e: (lng - originLng) * metersPerDegLng,
    n: (lat - originLat) * metersPerDegLat,
  };
}

function cross2d(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function centroidOfPoints(points) {
  let latSum = 0;
  let lngSum = 0;
  for (const point of points) {
    latSum += point.lat;
    lngSum += point.lng;
  }
  return { lat: latSum / points.length, lng: lngSum / points.length };
}

function sitePolygonFromPoints(points) {
  const siteRows = points.filter((point) => String(point.id).startsWith("site-"));
  return siteRows.length >= 3 ? siteRows : points;
}

function siteBounds(points) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
    if (point.lng < minLng) minLng = point.lng;
    if (point.lng > maxLng) maxLng = point.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function bboxCenter(bounds) {
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
}

function isOutsideSiteBounds(lat, lng, bounds) {
  return (
    lat < bounds.minLat ||
    lat > bounds.maxLat ||
    lng < bounds.minLng ||
    lng > bounds.maxLng
  );
}

/** Boundary vertices plus bbox corners/center — ensures the quad truly wraps the site. */
function siteEncapsulationTestPoints(sitePoints) {
  const bounds = siteBounds(sitePoints);
  const center = bboxCenter(bounds);
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const extra = [
    { lat: minLat, lng: minLng },
    { lat: minLat, lng: maxLng },
    { lat: maxLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
    center,
  ];
  return [...sitePoints, ...extra];
}

/** 0=SW, 1=SE, 2=NE, 3=NW relative to centroid. */
function quadrantIndex(dLat, dLng) {
  if (dLat <= 0 && dLng <= 0) return 0;
  if (dLat <= 0 && dLng > 0) return 1;
  if (dLat > 0 && dLng > 0) return 2;
  return 3;
}

function monumentsByQuadrant(bounds, monuments) {
  const center = bboxCenter(bounds);
  const lists = [[], [], [], []];

  for (const monument of monuments) {
    const dLat = monument.lat - center.lat;
    const dLng = monument.lng - center.lng;
    const q = quadrantIndex(dLat, dLng);
    lists[q].push({
      ...monument,
      outsideBbox: isOutsideSiteBounds(monument.lat, monument.lng, bounds),
      distM: haversineM(center.lat, center.lng, monument.lat, monument.lng),
    });
  }

  const quadrantDirs = [
    { dLat: -1, dLng: -1 },
    { dLat: -1, dLng: 1 },
    { dLat: 1, dLng: 1 },
    { dLat: 1, dLng: -1 },
  ];

  for (let q = 0; q < 4; q += 1) {
    if (lists[q].length > 0) continue;
    let best = null;
    let bestScore = -Infinity;
    for (const monument of monuments) {
      const dLat = monument.lat - center.lat;
      const dLng = monument.lng - center.lng;
      const { dLat: dirLat, dLng: dirLng } = quadrantDirs[q];
      const score = dLat * dirLat + dLng * dirLng;
      if (score > bestScore) {
        bestScore = score;
        best = monument;
      }
    }
    if (best) {
      lists[q].push({
        ...best,
        outsideBbox: isOutsideSiteBounds(best.lat, best.lng, bounds),
        distM: haversineM(center.lat, center.lng, best.lat, best.lng),
      });
    }
  }

  for (const list of lists) {
    list.sort((a, b) => {
      if (a.outsideBbox !== b.outsideBbox) return a.outsideBbox ? -1 : 1;
      return a.distM - b.distM;
    });
  }
  return lists;
}

function quadOrientationValid(quad) {
  const origin = quad.sw;
  const se = toLocalEN(quad.se.lat, quad.se.lng, origin.lat, origin.lng);
  const nw = toLocalEN(quad.nw.lat, quad.nw.lng, origin.lat, origin.lng);
  const ne = toLocalEN(quad.ne.lat, quad.ne.lng, origin.lat, origin.lng);
  return (
    se.e >= QUAD_MIN_EDGE_M &&
    nw.n >= QUAD_MIN_EDGE_M &&
    ne.e >= se.e * 0.35 &&
    ne.n >= nw.n * 0.35
  );
}

function quadAltitudesSane(quad, maxCornerSpreadM = 15) {
  const alts = [quad.sw.alt, quad.se.alt, quad.ne.alt, quad.nw.alt];
  const spread = Math.max(...alts) - Math.min(...alts);
  return spread <= maxCornerSpreadM;
}

function quadFromIndices(lists, indices) {
  const sw = lists[0][indices[0]];
  const se = lists[1][indices[1]];
  const ne = lists[2][indices[2]];
  const nw = lists[3][indices[3]];
  if (!sw || !se || !ne || !nw) return null;
  return { sw, se, ne, nw };
}

function siteEncapsulatedByQuad(sitePoints, quad) {
  const origin = quad.sw;
  const sw = { e: 0, n: 0 };
  const se = toLocalEN(quad.se.lat, quad.se.lng, origin.lat, origin.lng);
  const ne = toLocalEN(quad.ne.lat, quad.ne.lng, origin.lat, origin.lng);
  const nw = toLocalEN(quad.nw.lat, quad.nw.lng, origin.lat, origin.lng);

  for (const point of sitePoints) {
    const p = toLocalEN(point.lat, point.lng, origin.lat, origin.lng);
    const st = inverseBilinearST(p, sw, se, ne, nw);
    if (!st) return false;
    const [s, t] = st;
    if (s < -0.02 || s > 1.02 || t < -0.02 || t > 1.02) return false;
  }
  return true;
}

function filterGroundOutliers(monuments, maxDeltaM = 12) {
  if (monuments.length < 4) return monuments;
  const sorted = monuments.map((point) => point.alt).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const filtered = monuments.filter((point) => Math.abs(point.alt - median) <= maxDeltaM);
  return filtered.length >= 4 ? filtered : monuments;
}

function quadCandidateScore(quad) {
  const corners = [quad.sw, quad.se, quad.ne, quad.nw];
  const avgDist = corners.reduce((sum, corner) => sum + corner.distM, 0) / 4;
  const outsideCount = corners.filter((corner) => corner.outsideBbox).length;
  return avgDist - outsideCount * 100;
}

function pickSurroundingQuad(sitePoints, monuments) {
  if (!sitePoints.length || !monuments.length) return null;

  const bounds = siteBounds(sitePoints);
  const testPoints = siteEncapsulationTestPoints(sitePoints);
  const lists = monumentsByQuadrant(bounds, monuments);
  if (lists.some((list) => list.length === 0)) return null;

  const limits = lists.map((list) => Math.min(SURROUND_QUADRANT_TRY, list.length));

  function acceptQuad(quad) {
    return (
      quad &&
      quadOrientationValid(quad) &&
      quadAltitudesSane(quad) &&
      siteEncapsulatedByQuad(testPoints, quad)
    );
  }

  let bestQuad = null;
  let bestScore = Infinity;

  for (let i0 = 0; i0 < limits[0]; i0 += 1) {
    for (let i1 = 0; i1 < limits[1]; i1 += 1) {
      for (let i2 = 0; i2 < limits[2]; i2 += 1) {
        for (let i3 = 0; i3 < limits[3]; i3 += 1) {
          const quad = quadFromIndices(lists, [i0, i1, i2, i3]);
          if (!acceptQuad(quad)) continue;
          const score = quadCandidateScore(quad);
          if (score < bestScore) {
            bestScore = score;
            bestQuad = quad;
          }
        }
      }
    }
  }

  return bestQuad;
}

/** Nearest monument per quadrant — always shown on map even when bilinear is unavailable. */
function pickNearestQuadPerQuadrant(sitePoints, monuments) {
  if (!sitePoints.length || !monuments.length) return null;
  const bounds = siteBounds(sitePoints);
  const lists = monumentsByQuadrant(bounds, monuments);
  if (lists.some((list) => list.length === 0)) return null;
  return quadFromIndices(lists, [0, 0, 0, 0]);
}

function idwContributorsSummary(lat, lng, groundPoints) {
  return rankGroundPoints(lat, lng, groundPoints).map((point) => ({
    lat: point.lat,
    lng: point.lng,
    ahdM: roundAhd(point.alt),
    distM: Math.round(point.distM),
  }));
}

function resolveInterpolationMonuments(siteRing, filteredGround, surroundQuad) {
  const bounds = siteBounds(siteRing);
  const centroid = bboxCenter(bounds);
  const testPoints = siteEncapsulationTestPoints(siteRing);

  if (surroundQuad) {
    return {
      interpolationMethod: "bilinear",
      quad: surroundQuadSummary(surroundQuad, siteRing),
      idwContributors: null,
    };
  }

  const nearestQuad = pickNearestQuadPerQuadrant(siteRing, filteredGround);
  const ranked = rankGroundPoints(centroid.lat, centroid.lng, filteredGround);
  let interpolationMethod = "idw";
  if (ranked.length === 0) {
    interpolationMethod = "none";
  } else if (ranked.length === 1) {
    interpolationMethod = "nearest";
  } else {
    const alts = ranked.map((point) => point.alt);
    const rangeM = Math.max(...alts) - Math.min(...alts);
    if (rangeM <= 0.35) interpolationMethod = "idw_flat";
  }

  return {
    interpolationMethod,
    quad: nearestQuad ? surroundQuadSummary(nearestQuad, siteRing) : null,
    idwContributors: ranked.length ? idwContributorsSummary(centroid.lat, centroid.lng, filteredGround) : [],
  };
}

/** Inverse bilinear: SW=a, SE=b, NE=c, NW=d in local EN metres. */
function inverseBilinearST(p, a, b, c, d) {
  const e = { e: p.e - a.e, n: p.n - a.n };
  const f = { e: b.e - a.e, n: b.n - a.n };
  const g = { e: d.e - a.e, n: d.n - a.n };
  const h = { e: a.e - b.e + c.e - d.e, n: a.n - b.n + c.n - d.n };

  const k2 = cross2d(h.e, h.n, g.e, g.n);
  const k1 = cross2d(e.e, e.n, h.e, h.n) + cross2d(f.e, f.n, g.e, g.n);
  const k0 = cross2d(e.e, e.n, f.e, f.n);

  let s;
  let t;

  if (Math.abs(k2) < 1e-12) {
    if (Math.abs(k1) < 1e-12) return null;
    t = -k0 / k1;
    if (t < 0 || t > 1) return null;
    const denom = (1 - t) * f.e + t * (c.e - d.e + f.e);
    if (Math.abs(denom) < 1e-12) return null;
    s = (e.e - t * (d.e - a.e)) / denom;
  } else {
    const w = k1 * k1 - 4 * k0 * k2;
    if (w < 0) return null;
    const sqrtW = Math.sqrt(w);
    const t1 = (-k1 + sqrtW) / (2 * k2);
    const t2 = (-k1 - sqrtW) / (2 * k2);
    t = t1 >= 0 && t1 <= 1 ? t1 : t2;
    if (t < 0 || t > 1) return null;
    const denom = (1 - t) * f.e + t * h.e;
    if (Math.abs(denom) < 1e-12) return null;
    s = (e.e - (1 - t) * g.e - t * (d.e - a.e)) / denom;
  }

  if (!Number.isFinite(s) || !Number.isFinite(t)) return null;
  return [s, t];
}

function bilinearElevationAt(lat, lng, quad) {
  const origin = quad.sw;
  const sw = { e: 0, n: 0 };
  const se = toLocalEN(quad.se.lat, quad.se.lng, origin.lat, origin.lng);
  const ne = toLocalEN(quad.ne.lat, quad.ne.lng, origin.lat, origin.lng);
  const nw = toLocalEN(quad.nw.lat, quad.nw.lng, origin.lat, origin.lng);
  const p = toLocalEN(lat, lng, origin.lat, origin.lng);

  const st = inverseBilinearST(p, sw, se, ne, nw);
  if (!st) return null;

  const [s, t] = st;
  const sClamped = Math.max(0, Math.min(1, s));
  const tClamped = Math.max(0, Math.min(1, t));
  const z =
    (1 - sClamped) * (1 - tClamped) * quad.sw.alt +
    sClamped * (1 - tClamped) * quad.se.alt +
    sClamped * tClamped * quad.ne.alt +
    (1 - sClamped) * tClamped * quad.nw.alt;

  const nearestDistM = Math.min(
    haversineM(lat, lng, quad.sw.lat, quad.sw.lng),
    haversineM(lat, lng, quad.se.lat, quad.se.lng),
    haversineM(lat, lng, quad.ne.lat, quad.ne.lng),
    haversineM(lat, lng, quad.nw.lat, quad.nw.lng)
  );

  return {
    ahdM: roundAhd(z),
    approximate: nearestDistM > 12,
    source: "vicmap_surround_bilinear",
    surveyDistM: Math.round(nearestDistM),
    surveyCount: 4,
    surveyRangeM: roundAhd(
      Math.max(quad.sw.alt, quad.se.alt, quad.ne.alt, quad.nw.alt) -
        Math.min(quad.sw.alt, quad.se.alt, quad.ne.alt, quad.nw.alt)
    ),
  };
}

function surroundQuadSummary(quad, sitePoints = null) {
  if (!quad) return null;
  const testPoints = sitePoints ? siteEncapsulationTestPoints(sitePoints) : null;
  return {
    sw: { lat: quad.sw.lat, lng: quad.sw.lng, ahdM: roundAhd(quad.sw.alt) },
    se: { lat: quad.se.lat, lng: quad.se.lng, ahdM: roundAhd(quad.se.alt) },
    ne: { lat: quad.ne.lat, lng: quad.ne.lng, ahdM: roundAhd(quad.ne.alt) },
    nw: { lat: quad.nw.lat, lng: quad.nw.lng, ahdM: roundAhd(quad.nw.alt) },
    encapsulatesSite: testPoints ? siteEncapsulatedByQuad(testPoints, quad) : true,
  };
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
    if (!Number.isFinite(alt)) continue;
    const latLng = latLngFromArcGisGeometry(feature.geometry);
    if (!latLng) continue;
    rows.push({ lat: latLng.lat, lng: latLng.lng, alt });
  }
  return rows;
}

function parseContourFeatures(features) {
  const rows = [];
  for (const feature of features || []) {
    const alt = Number(feature.attributes?.altitude);
    if (!Number.isFinite(alt)) continue;
    for (const path of feature.geometry?.paths || []) {
      if (!Array.isArray(path)) continue;
      for (const coord of path) {
        if (!Array.isArray(coord) || coord.length < 2) continue;
        const x = Number(coord[0]);
        const y = Number(coord[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const { lat, lng } = webMercatorToLatLng(x, y);
        rows.push({ lat, lng, alt });
      }
    }
  }
  return rows;
}

function buildPointQueryUrl3857(baseUrl, layerId, lat, lng, radiusM, resultCount = MONUMENT_RESULT_COUNT) {
  const { x, y } = latLngToWebMercator(lat, lng);
  const params = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: "esriGeometryPoint",
    inSR: "3857",
    outSR: "3857",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusM),
    units: "esriSRUnit_Meter",
    outFields: "altitude",
    returnGeometry: "true",
    resultRecordCount: String(resultCount),
    f: "json",
  });
  return `${baseUrl}/${layerId}/query?${params.toString()}`;
}

function buildEnvelopeQueryUrl3857(baseUrl, layerId, bounds, padM, resultCount = MONUMENT_RESULT_COUNT) {
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const padLat = padM / 111320;
  const padLng = padM / (111320 * Math.cos((centerLat * Math.PI) / 180));
  const sw = latLngToWebMercator(bounds.minLat - padLat, bounds.minLng - padLng);
  const ne = latLngToWebMercator(bounds.maxLat + padLat, bounds.maxLng + padLng);
  const geometry = JSON.stringify({
    xmin: Math.min(sw.x, ne.x),
    ymin: Math.min(sw.y, ne.y),
    xmax: Math.max(sw.x, ne.x),
    ymax: Math.max(sw.y, ne.y),
  });
  const params = new URLSearchParams({
    geometry,
    geometryType: "esriGeometryEnvelope",
    inSR: "3857",
    outSR: "3857",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "altitude",
    returnGeometry: "true",
    resultRecordCount: String(resultCount),
    f: "json",
  });
  return `${baseUrl}/${layerId}/query?${params.toString()}`;
}

async function fetchElevationLayerPoints(layer, lat, lng, radiusM) {
  const { data, error } = await fetchArcGisJson(
    buildPointQueryUrl3857(layer.baseUrl, layer.layerId, lat, lng, radiusM)
  );
  if (error || !data?.features?.length) return [];
  return layer.kind === "contour"
    ? parseContourFeatures(data.features)
    : parseGroundFeatures(data.features);
}

async function fetchElevationLayerEnvelope(layer, bounds, padM) {
  const { data, error } = await fetchArcGisJson(
    buildEnvelopeQueryUrl3857(layer.baseUrl, layer.layerId, bounds, padM)
  );
  if (error || !data?.features?.length) return [];
  return layer.kind === "contour"
    ? parseContourFeatures(data.features)
    : parseGroundFeatures(data.features);
}

async function fetchAllElevationMonumentsAt(lat, lng, radiusM) {
  const chunks = await Promise.all(
    ELEVATION_MONUMENT_LAYERS.map((layer) => fetchElevationLayerPoints(layer, lat, lng, radiusM))
  );
  return dedupeGroundPoints(chunks.flat());
}

async function fetchAllElevationMonumentsInEnvelope(bounds, padM) {
  const chunks = await Promise.all(
    ELEVATION_MONUMENT_LAYERS.map((layer) => fetchElevationLayerEnvelope(layer, bounds, padM))
  );
  return dedupeGroundPoints(chunks.flat());
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
  } else if (rangeM <= 0.35) {
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

  if (mode === "interpolate") {
    const siteRing = sitePolygonFromPoints(points);
    const bounds = siteBounds(siteRing);
    const centroid = bboxCenter(bounds);
    const groundAnchors = [
      centroid,
      { lat: bounds.minLat, lng: bounds.minLng },
      { lat: bounds.minLat, lng: bounds.maxLng },
      { lat: bounds.maxLat, lng: bounds.minLng },
      { lat: bounds.maxLat, lng: bounds.maxLng },
    ];
    const groundErrors = [];
    const mergedGround = [];
    for (const anchor of groundAnchors) {
      const { points: chunk, errors } = await groundNear(anchor.lat, anchor.lng);
      mergedGround.push(...chunk);
      groundErrors.push(...errors);
    }
    const groundPoints = dedupeGroundPoints(mergedGround);
    const errors = [...new Set(groundErrors.filter(Boolean))];

    if (!groundPoints.length) {
      return {
        state: normalizedState,
        datum: "AHD",
        mode,
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

    const filteredGround = filterGroundOutliers(groundPoints);
    const surroundQuad = pickSurroundingQuad(siteRing, filteredGround);
    const useSurround = surroundQuad != null;
    const monumentContext = resolveInterpolationMonuments(siteRing, filteredGround, surroundQuad);

    const results = points.map((point) => {
      try {
        let hit = null;
        if (useSurround) {
          hit = bilinearElevationAt(point.lat, point.lng, surroundQuad);
        }
        if (!hit) {
          hit = lookupIdwAtPoint(point.lat, point.lng, groundPoints);
        }
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
      surroundQuad: surroundQuadSummary(surroundQuad, siteRing),
      interpolationMethod: monumentContext.interpolationMethod,
      displayQuad: monumentContext.quad,
      idwContributors: monumentContext.idwContributors,
      groundSurveyCount: groundPoints.length,
    };
  }

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

      const hit = lookupSurveyAtPoint(point.lat, point.lng, groundPoints);
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

function parseBoundaryRingFromGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return [];

  const ringFromCoords = (coords) => {
    if (!Array.isArray(coords)) return [];
    const ring = [];
    for (const coord of coords) {
      if (!Array.isArray(coord) || coord.length < 2) continue;
      const lng = Number(coord[0]);
      const lat = Number(coord[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) ring.push({ lat, lng });
    }
    return ring;
  };

  if (geometry.type === "Polygon") {
    return ringFromCoords(geometry.coordinates?.[0]);
  }
  if (geometry.type === "MultiPolygon") {
    let best = [];
    for (const poly of geometry.coordinates || []) {
      const ring = ringFromCoords(poly?.[0]);
      if (ring.length > best.length) best = ring;
    }
    return best;
  }
  return [];
}

/** Most extreme boundary vertex in each compass direction. */
function pickExtremeSiteCorner(ring, cornerId) {
  if (!ring.length) return null;

  let best = ring[0];
  let bestScore = cornerScore(ring[0], cornerId);

  for (let i = 1; i < ring.length; i += 1) {
    const score = cornerScore(ring[i], cornerId);
    if (score > bestScore) {
      bestScore = score;
      best = ring[i];
    }
  }
  return { lat: best.lat, lng: best.lng };
}

function cornerScore(point, cornerId) {
  if (cornerId === "nw") return point.lat - point.lng;
  if (cornerId === "ne") return point.lat + point.lng;
  if (cornerId === "se") return -point.lat + point.lng;
  if (cornerId === "sw") return -point.lat - point.lng;
  return 0;
}

function monumentOutsideCorner(monuments, corner, cornerId) {
  let best = null;
  let bestDist = Infinity;

  for (const monument of monuments) {
    let outside = false;
    if (cornerId === "nw") {
      outside = monument.lat > corner.lat && monument.lng < corner.lng;
    } else if (cornerId === "ne") {
      outside = monument.lat > corner.lat && monument.lng > corner.lng;
    } else if (cornerId === "se") {
      outside = monument.lat < corner.lat && monument.lng > corner.lng;
    } else if (cornerId === "sw") {
      outside = monument.lat < corner.lat && monument.lng < corner.lng;
    }
    if (!outside) continue;

    const distM = haversineM(corner.lat, corner.lng, monument.lat, monument.lng);
    if (distM < bestDist) {
      bestDist = distM;
      best = monument;
    }
  }

  if (!best) return null;
  return {
    lat: best.lat,
    lng: best.lng,
    ahdM: roundAhd(best.alt),
    distM: Math.round(bestDist),
  };
}

async function findMonumentOutsideCorner(corner, cornerId) {
  for (const radiusM of MONUMENT_CORNER_RADII_M) {
    const pool = await fetchAllElevationMonumentsAt(corner.lat, corner.lng, radiusM);
    const hit = monumentOutsideCorner(pool, corner, cornerId);
    if (hit) {
      return { ...hit, searchRadiusM: radiusM };
    }
  }
  return null;
}

function siteInsideMonumentBox(siteRing, monuments) {
  const corners = ["nw", "ne", "se", "sw"];
  if (corners.some((id) => !monuments[id])) return false;

  const lats = corners.map((id) => monuments[id].lat);
  const lngs = corners.map((id) => monuments[id].lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  for (const point of siteRing) {
    if (point.lat <= minLat || point.lat >= maxLat) return false;
    if (point.lng <= minLng || point.lng >= maxLng) return false;
  }
  return true;
}

function monumentBoxSummary(siteCorners, monuments, siteRing) {
  const missing = ["nw", "ne", "se", "sw"].filter((id) => !monuments[id]);
  return {
    siteCorners,
    monuments: {
      nw: monuments.nw,
      ne: monuments.ne,
      se: monuments.se,
      sw: monuments.sw,
    },
    missing,
    encapsulatesSite: missing.length === 0 && siteInsideMonumentBox(siteRing, monuments),
  };
}

function monumentsToInterpolationQuad(monuments) {
  const corners = ["nw", "ne", "se", "sw"];
  if (corners.some((id) => !monuments[id] || !Number.isFinite(monuments[id].ahdM))) {
    return null;
  }
  return {
    nw: { lat: monuments.nw.lat, lng: monuments.nw.lng, alt: monuments.nw.ahdM },
    ne: { lat: monuments.ne.lat, lng: monuments.ne.lng, alt: monuments.ne.ahdM },
    se: { lat: monuments.se.lat, lng: monuments.se.lng, alt: monuments.se.ahdM },
    sw: { lat: monuments.sw.lat, lng: monuments.sw.lng, alt: monuments.sw.ahdM },
  };
}

function sampleBoundaryPoints(siteRing, maxPoints = 64) {
  if (siteRing.length <= maxPoints) {
    return siteRing.map((point, index) => ({ ...point, id: `site-${index}` }));
  }
  const sampled = [];
  const step = siteRing.length / maxPoints;
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.min(siteRing.length - 1, Math.floor(i * step));
    sampled.push({ ...siteRing[idx], id: `site-${i}` });
  }
  return sampled;
}

function interpolateBoundaryElevations(siteRing, monuments) {
  const quad = monumentsToInterpolationQuad(monuments);
  if (!quad) return [];

  return sampleBoundaryPoints(siteRing).map((point) => {
    const hit = bilinearElevationAt(point.lat, point.lng, quad);
    if (!hit) {
      return {
        id: point.id,
        lat: point.lat,
        lng: point.lng,
        ahdM: null,
        approximate: false,
        source: null,
        error: "Could not bilinear interpolate at this boundary vertex",
      };
    }
    return {
      id: point.id,
      lat: point.lat,
      lng: point.lng,
      ahdM: hit.ahdM,
      approximate: hit.approximate,
      source: "vicmap_monument_bilinear",
      surveyDistM: hit.surveyDistM,
      surveyCount: hit.surveyCount,
      surveyRangeM: hit.surveyRangeM,
    };
  });
}

async function fetchMonumentsNearSite(siteRing) {
  const bounds = siteBounds(siteRing);
  const merged = await fetchAllElevationMonumentsInEnvelope(bounds, MONUMENT_ENVELOPE_PAD_M);
  const errors = merged.length ? [] : ["No Vicmap elevation monuments in search area"];

  return {
    points: merged,
    errors,
  };
}

/**
 * Pick four Vicmap monuments outside the site's extreme NW/NE/SE/SW boundary points.
 * Uses metro + statewide ground points and contour vertices (Web Mercator queries).
 */
async function lookupMonumentBox({ state, geometry }) {
  const normalizedState = normalizeElevationState(state);
  if (normalizedState !== "VIC") {
    return {
      error: "Monument box lookup is currently available for Victoria (VIC) only",
      status: 400,
    };
  }

  const siteRing = parseBoundaryRingFromGeometry(geometry);
  if (siteRing.length < 3) {
    return { error: "geometry must be a Polygon or MultiPolygon with at least 3 vertices", status: 400 };
  }

  const siteCorners = {
    nw: pickExtremeSiteCorner(siteRing, "nw"),
    ne: pickExtremeSiteCorner(siteRing, "ne"),
    se: pickExtremeSiteCorner(siteRing, "se"),
    sw: pickExtremeSiteCorner(siteRing, "sw"),
  };

  const { points: pool, errors } = await fetchMonumentsNearSite(siteRing);

  const monuments = {
    nw: monumentOutsideCorner(pool, siteCorners.nw, "nw"),
    ne: monumentOutsideCorner(pool, siteCorners.ne, "ne"),
    se: monumentOutsideCorner(pool, siteCorners.se, "se"),
    sw: monumentOutsideCorner(pool, siteCorners.sw, "sw"),
  };

  for (const cornerId of ["nw", "ne", "se", "sw"]) {
    if (monuments[cornerId]) continue;
    monuments[cornerId] = await findMonumentOutsideCorner(siteCorners[cornerId], cornerId);
  }

  const foundCount = ["nw", "ne", "se", "sw"].filter((id) => monuments[id]).length;
  if (foundCount === 0) {
    return {
      error: errors[0] || "No Vicmap elevation monuments found near this site",
      status: 404,
    };
  }

  return {
    state: normalizedState,
    datum: "AHD",
    dataSources: ELEVATION_MONUMENT_LAYERS.map((layer) => layer.label),
    groundSurveyCount: pool.length,
    boundaryElevations: interpolateBoundaryElevations(siteRing, monuments),
    ...monumentBoxSummary(siteCorners, monuments, siteRing),
  };
}

module.exports = {
  normalizeElevationState,
  parsePointsInput,
  lookupAhdElevations,
  lookupMonumentBox,
};
