/** Geodesic area of a GeoJSON polygon ring in square metres (WGS84). */
export function polygonAreaSquareMetres(geometry) {
  if (!geometry) return 0;
  if (geometry.type === "Polygon") {
    return ringAreaSquareMetres(geometry.coordinates?.[0]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).reduce(
      (sum, poly) => sum + ringAreaSquareMetres(poly?.[0]),
      0
    );
  }
  return 0;
}

function ringAreaSquareMetres(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;

  const R = 6378137;
  let area = 0;
  const n = ring.length - 1;
  for (let i = 0; i < n; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    if (!Number.isFinite(lng1) || !Number.isFinite(lat1)) continue;
    area +=
      ((lng2 - lng1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((area * R * R) / 2);
}

export function totalVerandahAreaSquareMetres(verandahsGeoJson) {
  const features = verandahsGeoJson?.features || [];
  return features.reduce((sum, feature) => sum + polygonAreaSquareMetres(feature?.geometry), 0);
}
