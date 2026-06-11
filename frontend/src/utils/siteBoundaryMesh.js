import * as THREE from "three";
import {
  interpolateSiteCornerGrid,
  METERS_PER_DEG_LAT,
  metersPerDegreeLng,
  offsetENFromCenter,
  rotateEN,
  rotatedFloorPlanCorners,
} from "./floorPlanMap";

/** Site slab thickness and height offset (m). Corner posts start at the top of the slab. */
export const SITE_THICKNESS_M = 2;
export const SITE_BASE_OFFSET_M = SITE_THICKNESS_M;

function ringAreaM2(ring) {
  if (ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + 1) % ring.length;
    area += ring[i].e * ring[j].n - ring[j].e * ring[i].n;
  }
  return Math.abs(area) / 2;
}

/** Remove duplicate closing vertex from GeoJSON rings. */
export function dedupeClosedRing(ring) {
  if (!ring?.length) return [];
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    Math.abs(first.lat - last.lat) < 1e-9 &&
    Math.abs(first.lng - last.lng) < 1e-9
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

/** @returns {{ lat: number, lng: number }[][]} outer rings */
export function extractOuterRings(geometry) {
  if (!geometry?.type || !geometry.coordinates) return [];

  if (geometry.type === "Polygon") {
    const outer = geometry.coordinates[0];
    return outer?.length ? [dedupeClosedRing(outer.map(([lng, lat]) => ({ lat, lng })))] : [];
  }

  if (geometry.type === "MultiPolygon") {
    let best = null;
    let bestArea = 0;
    for (const polygon of geometry.coordinates) {
      const outer = polygon?.[0];
      if (!outer?.length) continue;
      const ring = dedupeClosedRing(outer.map(([lng, lat]) => ({ lat, lng })));
      if (ring.length < 3) continue;
      const origin = ring[0];
      const en = ring.map((p) => latLngToEN(p.lat, p.lng, origin.lat, origin.lng));
      const area = ringAreaM2(en);
      if (area > bestArea) {
        bestArea = area;
        best = ring;
      }
    }
    return best ? [best] : [];
  }

  return [];
}

export function latLngToEN(lat, lng, originLat, originLng) {
  return {
    e: (lng - originLng) * metersPerDegreeLng(originLat),
    n: (lat - originLat) * METERS_PER_DEG_LAT,
  };
}

export function ringCentroid(ring) {
  if (!ring.length) return { lat: 0, lng: 0 };
  let sumLat = 0;
  let sumLng = 0;
  for (const point of ring) {
    sumLat += point.lat;
    sumLng += point.lng;
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

/**
 * Flat site boundary matching the map title boundary — exact vertices, y = 0.
 * @returns {{ positions: Float32Array, indices: Uint32Array } | null}
 */
export function buildFlatBoundaryMesh(ring) {
  const points = dedupeClosedRing(ring);
  if (points.length < 3) return null;

  const origin = ringCentroid(points);
  const en = points.map((p) => latLngToEN(p.lat, p.lng, origin.lat, origin.lng));

  let centerE = 0;
  let centerN = 0;
  for (const p of en) {
    centerE += p.e;
    centerN += p.n;
  }
  centerE /= en.length;
  centerN /= en.length;

  const positions = new Float32Array(en.length * 3);

  for (let i = 0; i < en.length; i += 1) {
    positions[i * 3] = en[i].e - centerE;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = -(en[i].n - centerN);
  }

  const contour = en.map((p) => new THREE.Vector2(p.e - centerE, p.n - centerN));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const indices = [];
  for (const tri of triangles) {
    indices.push(tri[0], tri[1], tri[2]);
  }

  return {
    positions,
    indices: new Uint32Array(indices),
  };
}

/**
 * 2 m thick site slab — bottom at y=0, top at y=SITE_THICKNESS_M.
 * @returns {{ positions: Float32Array, indices: Uint32Array, topPositions: Float32Array } | null}
 */
export function buildSiteSlabMesh(ring, thicknessM = SITE_THICKNESS_M) {
  const flat = buildFlatBoundaryMesh(ring);
  if (!flat) return null;

  const vertexCount = flat.positions.length / 3;
  const topPositions = new Float32Array(flat.positions.length);
  const bottomPositions = new Float32Array(flat.positions.length);

  for (let i = 0; i < vertexCount; i += 1) {
    const x = flat.positions[i * 3];
    const z = flat.positions[i * 3 + 2];
    bottomPositions[i * 3] = x;
    bottomPositions[i * 3 + 1] = 0;
    bottomPositions[i * 3 + 2] = z;
    topPositions[i * 3] = x;
    topPositions[i * 3 + 1] = thicknessM;
    topPositions[i * 3 + 2] = z;
  }

  const topTriCount = flat.indices.length;
  const bottomTriCount = flat.indices.length;
  const sideTriCount = vertexCount * 6;
  const indices = new Uint32Array(topTriCount + bottomTriCount + sideTriCount);
  let offset = 0;

  for (let i = 0; i < flat.indices.length; i += 1) {
    indices[offset + i] = flat.indices[i];
  }
  offset += topTriCount;

  for (let i = 0; i < flat.indices.length; i += 3) {
    indices[offset + i] = flat.indices[i + 2] + vertexCount;
    indices[offset + i + 1] = flat.indices[i + 1] + vertexCount;
    indices[offset + i + 2] = flat.indices[i] + vertexCount;
  }
  offset += bottomTriCount;

  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    const t0 = i;
    const t1 = j;
    const b0 = i + vertexCount;
    const b1 = j + vertexCount;
    const sideBase = offset + i * 6;
    indices[sideBase] = t0;
    indices[sideBase + 1] = b0;
    indices[sideBase + 2] = t1;
    indices[sideBase + 3] = t1;
    indices[sideBase + 4] = b0;
    indices[sideBase + 5] = b1;
  }

  const positions = new Float32Array(vertexCount * 2 * 3);
  positions.set(topPositions, 0);
  positions.set(bottomPositions, vertexCount * 3);

  return { positions, indices, topPositions };
}

/** Shared local frame for site boundary and floor plan overlays (metres, y up). */
export function getSiteMeshFrame(ring) {
  const points = dedupeClosedRing(ring);
  if (points.length < 3) return null;

  const origin = ringCentroid(points);
  const en = points.map((p) => latLngToEN(p.lat, p.lng, origin.lat, origin.lng));

  let centerE = 0;
  let centerN = 0;
  for (const p of en) {
    centerE += p.e;
    centerN += p.n;
  }
  centerE /= en.length;
  centerN /= en.length;

  return { originLat: origin.lat, originLng: origin.lng, centerE, centerN };
}

export function latLngToSiteLocalXZ(lat, lng, frame) {
  const en = latLngToEN(lat, lng, frame.originLat, frame.originLng);
  return {
    x: en.e - frame.centerE,
    z: -(en.n - frame.centerN),
  };
}

function siteMinAhdM(ring, siteCornerLevels) {
  const cornerHeights = cornerRelativeHeightsM(ring, siteCornerLevels);
  if (!cornerHeights) return null;
  return Math.min(...cornerHeights.map((corner) => corner.ahdM));
}

function grassRelativeHeightAt(lat, lng, siteCornerLevels, minAhdM) {
  const ahdM = interpolateSiteCornerGrid(lat, lng, siteCornerLevels);
  if (!Number.isFinite(ahdM) || !Number.isFinite(minAhdM)) return null;
  return ahdM - minAhdM;
}

/** Sample lat/lng points across a rotated floor plan rectangle. */
export function sampleRotatedRectanglePoints(
  centerLat,
  centerLng,
  widthM,
  heightM,
  bearingDeg = 0,
  gridSteps = 4
) {
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  const points = [];

  for (let iy = 0; iy <= gridSteps; iy += 1) {
    for (let ix = 0; ix <= gridSteps; ix += 1) {
      const localE = -halfW + (widthM * ix) / gridSteps;
      const localN = -halfH + (heightM * iy) / gridSteps;
      const rotated = rotateEN(localE, localN, bearingDeg);
      const latlng = offsetENFromCenter(centerLat, centerLng, rotated.east, rotated.north);
      points.push(latlng);
    }
  }

  return points;
}

/**
 * Flat yellow floor plan outline — horizontal at the highest grass point under the footprint.
 * @returns {{ positions: Float32Array, outlineYM: number } | null}
 */
export function buildFloorPlanOutlineLinePositions(
  ring,
  siteCornerLevels,
  centerLat,
  centerLng,
  widthM,
  heightM,
  bearingDeg = 0,
  baseOffsetM = SITE_BASE_OFFSET_M
) {
  const frame = getSiteMeshFrame(ring);
  const minAhdM = siteMinAhdM(ring, siteCornerLevels);
  if (!frame || minAhdM == null) return null;

  const samplePoints = sampleRotatedRectanglePoints(
    centerLat,
    centerLng,
    widthM,
    heightM,
    bearingDeg
  );

  let maxRelativeM = 0;
  for (const point of samplePoints) {
    const relativeM = grassRelativeHeightAt(point.lat, point.lng, siteCornerLevels, minAhdM);
    if (relativeM == null) return null;
    maxRelativeM = Math.max(maxRelativeM, relativeM);
  }

  const outlineYM = baseOffsetM + maxRelativeM + 0.012;
  const corners = rotatedFloorPlanCorners(centerLat, centerLng, widthM, heightM, bearingDeg);
  const order = ["sw", "se", "ne", "nw"];
  const byId = Object.fromEntries(corners.map((corner) => [corner.id, corner]));
  const positions = new Float32Array(order.length * 3);

  for (let i = 0; i < order.length; i += 1) {
    const corner = byId[order[i]];
    const { x, z } = latLngToSiteLocalXZ(corner.lat, corner.lng, frame);
    positions[i * 3] = x;
    positions[i * 3 + 1] = outlineYM;
    positions[i * 3 + 2] = z;
  }

  return { positions, outlineYM };
}

/** AHD at each boundary vertex, relative to the lowest corner (lowest = 0). */
export function cornerRelativeHeightsM(ring, siteCornerLevels) {
  const points = dedupeClosedRing(ring);
  if (points.length < 3) return null;

  const ahdValues = points.map((point) =>
    interpolateSiteCornerGrid(point.lat, point.lng, siteCornerLevels)
  );
  if (ahdValues.some((value) => !Number.isFinite(value))) return null;

  const minAhd = Math.min(...ahdValues);
  return ahdValues.map((ahdM, index) => ({
    lat: points[index].lat,
    lng: points[index].lng,
    ahdM,
    relativeM: ahdM - minAhd,
  }));
}

/** Vertical line segments from top of site slab to relative height at each boundary vertex. */
export function buildVerticalHeightLines(
  topBoundaryPositions,
  relativeHeightsM,
  baseOffsetM = SITE_BASE_OFFSET_M
) {
  const vertexCount = topBoundaryPositions.length / 3;
  if (relativeHeightsM.length !== vertexCount) return null;

  const linePositions = new Float32Array(vertexCount * 2 * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const x = topBoundaryPositions[i * 3];
    const z = topBoundaryPositions[i * 3 + 2];
    const h = relativeHeightsM[i].relativeM;
    const base = i * 6;
    linePositions[base] = x;
    linePositions[base + 1] = baseOffsetM;
    linePositions[base + 2] = z;
    linePositions[base + 3] = x;
    linePositions[base + 4] = baseOffsetM + h;
    linePositions[base + 5] = z;
  }
  return linePositions;
}

/** Triangulated surface through the tops of the corner height posts. */
export function buildHeightTopSurfaceMesh(
  ring,
  topBoundaryPositions,
  cornerHeights,
  baseOffsetM = SITE_BASE_OFFSET_M
) {
  const flat = buildFlatBoundaryMesh(ring);
  if (!flat) return null;

  const vertexCount = topBoundaryPositions.length / 3;
  if (cornerHeights.length !== vertexCount) return null;

  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    positions[i * 3] = topBoundaryPositions[i * 3];
    positions[i * 3 + 1] = baseOffsetM + cornerHeights[i].relativeM;
    positions[i * 3 + 2] = topBoundaryPositions[i * 3 + 2];
  }

  return {
    positions,
    indices: flat.indices,
  };
}

/**
 * Solid earth volume: outer shell from ground to below grass top (no internal caps).
 * @returns {{ positions: Float32Array, indices: number[] } | null}
 */
export function buildEarthVolumeMesh(
  ring,
  topBoundaryPositions,
  cornerHeights,
  baseOffsetM = SITE_BASE_OFFSET_M
) {
  const flat = buildFlatBoundaryMesh(ring);
  if (!flat) return null;

  const vertexCount = topBoundaryPositions.length / 3;
  if (cornerHeights.length !== vertexCount) return null;

  const positions = [];
  const indices = [];

  const pushVertex = (x, y, z) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  const bottomIdx = [];
  const outerTopIdx = [];

  for (let i = 0; i < vertexCount; i += 1) {
    const x = topBoundaryPositions[i * 3];
    const z = topBoundaryPositions[i * 3 + 2];
    bottomIdx.push(pushVertex(x, 0, z));
    outerTopIdx.push(pushVertex(x, baseOffsetM + cornerHeights[i].relativeM, z));
  }

  for (let i = 0; i < flat.indices.length; i += 3) {
    indices.push(
      bottomIdx[flat.indices[i]],
      bottomIdx[flat.indices[i + 1]],
      bottomIdx[flat.indices[i + 2]]
    );
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    const b0 = bottomIdx[i];
    const b1 = bottomIdx[j];
    const t0 = outerTopIdx[i];
    const t1 = outerTopIdx[j];
    indices.push(b0, b1, t1, b0, t1, t0);
  }

  return {
    positions: new Float32Array(positions),
    indices,
  };
}
