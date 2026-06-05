const turf = require("@turf/turf");

function boundaryFeature(boundaryGeometry) {
  if (!boundaryGeometry?.type) return null;
  return turf.feature(boundaryGeometry);
}

function clipLineCoordinatesToPolygon(coordinates, boundary) {
  if (!coordinates || coordinates.length < 2) return [];

  let pieces = [turf.lineString(coordinates)];
  const boundaryLine = turf.polygonToLine(boundary);
  const splitters =
    boundaryLine.type === "FeatureCollection" ? boundaryLine.features : [boundaryLine];

  for (const splitter of splitters) {
    const nextPieces = [];
    for (const piece of pieces) {
      if (turf.length(piece, { units: "kilometers" }) === 0) continue;
      const split = turf.lineSplit(piece, splitter);
      nextPieces.push(...split.features);
    }
    pieces = nextPieces;
  }

  const inside = [];
  for (const piece of pieces) {
    const len = turf.length(piece, { units: "kilometers" });
    if (len === 0) continue;
    const mid = turf.along(piece, len / 2, { units: "kilometers" });
    if (turf.booleanPointInPolygon(mid, boundary)) {
      inside.push(piece.geometry.coordinates);
    }
  }
  return inside;
}

function clipGeometryToBoundary(geometry, boundary) {
  if (!geometry || !boundary) return null;

  if (geometry.type === "LineString") {
    const parts = clipLineCoordinatesToPolygon(geometry.coordinates, boundary);
    if (parts.length === 0) return null;
    if (parts.length === 1) return { type: "LineString", coordinates: parts[0] };
    return { type: "MultiLineString", coordinates: parts };
  }

  if (geometry.type === "MultiLineString") {
    const allParts = [];
    for (const line of geometry.coordinates) {
      allParts.push(...clipLineCoordinatesToPolygon(line, boundary));
    }
    if (allParts.length === 0) return null;
    if (allParts.length === 1) return { type: "LineString", coordinates: allParts[0] };
    return { type: "MultiLineString", coordinates: allParts };
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    try {
      const easementPoly = turf.feature(geometry);
      const clipped = turf.intersect(turf.featureCollection([easementPoly, boundary]));
      return clipped?.geometry || null;
    } catch {
      return null;
    }
  }

  return null;
}

/** Keep only easement geometry inside the title boundary polygon. */
function clipEasementFeaturesToBoundary(features, boundaryGeometry) {
  const boundary = boundaryFeature(boundaryGeometry);
  if (!boundary) return features;

  return features
    .map((feature) => {
      const geometry = clipGeometryToBoundary(feature.geometry, boundary);
      if (!geometry) return null;
      return { ...feature, geometry };
    })
    .filter(Boolean);
}

module.exports = {
  clipEasementFeaturesToBoundary,
};
