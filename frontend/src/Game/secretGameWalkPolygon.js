/** @typedef {{ x: number, z: number }} WalkPoint */

export function isWalkPolygonActive(polygon) {
  return Array.isArray(polygon) && polygon.length >= 3;
}

export function pointInWalkPolygon(x, z, polygon) {
  if (!isWalkPolygonActive(polygon)) return true;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distSq(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

function closestPointOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-8) return { x: ax, z: az };
  let t = ((px - ax) * abx + (pz - az) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + abx * t, z: az + abz * t };
}

/** Snap an outside point to the nearest point on the polygon boundary. */
export function closestPointOnWalkPolygon(x, z, polygon) {
  if (!isWalkPolygonActive(polygon)) return { x, z };
  if (pointInWalkPolygon(x, z, polygon)) return { x, z };

  let best = { x: polygon[0].x, z: polygon[0].z };
  let bestDist = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const candidate = closestPointOnSegment(x, z, a.x, a.z, b.x, b.z);
    const d = distSq(x, z, candidate.x, candidate.z);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

export function clampWalkTarget(x, z, polygon, bounds) {
  let px = x;
  let pz = z;
  if (bounds) {
    px = Math.max(bounds.minX, Math.min(bounds.maxX, px));
    pz = Math.max(bounds.minZ, Math.min(bounds.maxZ, pz));
  }
  if (!isWalkPolygonActive(polygon)) return { x: px, z: pz };
  if (pointInWalkPolygon(px, pz, polygon)) return { x: px, z: pz };
  return closestPointOnWalkPolygon(px, pz, polygon);
}

export function isNearWalkPoint(x, z, point, threshold) {
  return distSq(x, z, point.x, point.z) <= threshold * threshold;
}

/** Centroid for spawning inside the walk area. */
export function polygonCentroid(polygon) {
  if (!isWalkPolygonActive(polygon)) return { x: 0, z: 5 };
  let sx = 0;
  let sz = 0;
  for (const p of polygon) {
    sx += p.x;
    sz += p.z;
  }
  const cx = sx / polygon.length;
  const cz = sz / polygon.length;
  return closestPointOnWalkPolygon(cx, cz, polygon);
}
