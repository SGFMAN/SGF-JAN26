import * as THREE from "three";
import { CORRUGATED_ROOF_PITCH_M } from "./corrugatedRoofTexture";
import {
  floorPlanPixelToLatLng,
  floorPlanPixelToLocalEN,
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
/** Unit subfloor extends this far above the highest grass point under the footprint. */
export const FLOOR_PLAN_HEIGHT_ABOVE_GRASS_M = 0.65;
/** Light-grey unit volume above the subfloor (wall height). */
export const FLOOR_PLAN_UPPER_HEIGHT_M = 3;
/** Internal partition wall thickness in 3D (m). */
export const FLOOR_PLAN_INTERNAL_WALL_THICKNESS_M = 0.1;
/** Gable roof overhang beyond floor plan walls (m). */
export const FLOOR_PLAN_ROOF_OVERHANG_M = 0.3;
/** Gable ridge height above the top of the floor plan walls (m). */
export const FLOOR_PLAN_ROOF_RIDGE_RISE_M = 1;
/** Existing building volumes extend this far above the highest grass point under the footprint. */
export const BUILDING_HEIGHT_ABOVE_GRASS_M = 4.5;
/** Verandah deck height above the highest grass point under the footprint. */
export const VERANDAH_HEIGHT_ABOVE_GRASS_M = 0.65;

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
 * Flat floor plan footprint — top at highest grass point + FLOOR_PLAN_HEIGHT_ABOVE_GRASS_M.
 * @returns {{ positions: Float32Array, outlineYM: number, grassTopYM: number } | null}
 */
export function buildFloorPlanOutlineLinePositions(
  ring,
  siteCornerLevels,
  centerLat,
  centerLng,
  widthM,
  heightM,
  bearingDeg = 0,
  baseOffsetM = SITE_BASE_OFFSET_M,
  heightAboveGrassM = FLOOR_PLAN_HEIGHT_ABOVE_GRASS_M
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

  const grassTopYM = baseOffsetM + maxRelativeM + 0.012;
  const outlineYM = grassTopYM + heightAboveGrassM;
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

  return { positions, outlineYM, grassTopYM };
}

function computeFloorPlanPlacementHeights(
  ring,
  siteCornerLevels,
  sampleLatLngPoints,
  baseOffsetM = SITE_BASE_OFFSET_M,
  heightAboveGrassM = FLOOR_PLAN_HEIGHT_ABOVE_GRASS_M
) {
  const minAhdM = siteMinAhdM(ring, siteCornerLevels);
  if (minAhdM == null || !sampleLatLngPoints.length) return null;

  let maxRelativeM = 0;
  for (const point of sampleLatLngPoints) {
    const relativeM = grassRelativeHeightAt(point.lat, point.lng, siteCornerLevels, minAhdM);
    if (relativeM == null) return null;
    maxRelativeM = Math.max(maxRelativeM, relativeM);
  }

  const grassTopYM = baseOffsetM + maxRelativeM + 0.012;
  const outlineYM = grassTopYM + heightAboveGrassM;
  return { outlineYM, grassTopYM };
}

function latLngPointsFromPolygonPixels(
  polygon,
  centerLat,
  centerLng,
  imageWidth,
  imageHeight,
  widthM,
  heightM,
  bearingDeg
) {
  const points = polygon.map((pt) =>
    floorPlanPixelToLatLng(
      pt.x,
      pt.y,
      centerLat,
      centerLng,
      imageWidth,
      imageHeight,
      widthM,
      heightM,
      bearingDeg
    )
  );
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    points.push({
      lat: (points[i].lat + points[j].lat) / 2,
      lng: (points[i].lng + points[j].lng) / 2,
    });
  }
  return points;
}

/**
 * External wall polygon from Define 3D pixels → flat footprint ring in site local coords.
 * @returns {{ positions: Float32Array, outlineYM: number, grassTopYM: number } | null}
 */
export function buildFloorPlanPolygonFootprintPositions(
  ring,
  siteCornerLevels,
  centerLat,
  centerLng,
  polygonPixels,
  imageWidth,
  imageHeight,
  widthM,
  heightM,
  bearingDeg = 0
) {
  const frame = getSiteMeshFrame(ring);
  if (!frame || !polygonPixels || polygonPixels.length < 3) return null;

  const samplePoints = latLngPointsFromPolygonPixels(
    polygonPixels,
    centerLat,
    centerLng,
    imageWidth,
    imageHeight,
    widthM,
    heightM,
    bearingDeg
  );
  const heights = computeFloorPlanPlacementHeights(ring, siteCornerLevels, samplePoints);
  if (!heights) return null;

  const positions = new Float32Array(polygonPixels.length * 3);
  for (let i = 0; i < polygonPixels.length; i += 1) {
    const latlng = floorPlanPixelToLatLng(
      polygonPixels[i].x,
      polygonPixels[i].y,
      centerLat,
      centerLng,
      imageWidth,
      imageHeight,
      widthM,
      heightM,
      bearingDeg
    );
    const { x, z } = latLngToSiteLocalXZ(latlng.lat, latlng.lng, frame);
    positions[i * 3] = x;
    positions[i * 3 + 1] = heights.outlineYM;
    positions[i * 3 + 2] = z;
  }

  return { positions, outlineYM: heights.outlineYM, grassTopYM: heights.grassTopYM };
}

/**
 * Internal wall segment from Define 3D pixels → thin quad footprint at subfloor height.
 * @returns {{ positions: Float32Array, outlineYM: number } | null}
 */
export function buildFloorPlanInternalWallFootprintPositions(
  ring,
  siteCornerLevels,
  centerLat,
  centerLng,
  segmentPixels,
  imageWidth,
  imageHeight,
  widthM,
  heightM,
  bearingDeg = 0,
  thicknessM = FLOOR_PLAN_INTERNAL_WALL_THICKNESS_M
) {
  const frame = getSiteMeshFrame(ring);
  if (!frame || segmentPixels?.length !== 2) return null;

  const start = floorPlanPixelToLatLng(
    segmentPixels[0].x,
    segmentPixels[0].y,
    centerLat,
    centerLng,
    imageWidth,
    imageHeight,
    widthM,
    heightM,
    bearingDeg
  );
  const end = floorPlanPixelToLatLng(
    segmentPixels[1].x,
    segmentPixels[1].y,
    centerLat,
    centerLng,
    imageWidth,
    imageHeight,
    widthM,
    heightM,
    bearingDeg
  );
  const mid = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
  const heights = computeFloorPlanPlacementHeights(ring, siteCornerLevels, [start, end, mid]);
  if (!heights) return null;

  const startXZ = latLngToSiteLocalXZ(start.lat, start.lng, frame);
  const endXZ = latLngToSiteLocalXZ(end.lat, end.lng, frame);
  const dx = endXZ.x - startXZ.x;
  const dz = endXZ.z - startXZ.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;

  const halfT = thicknessM / 2;
  const nx = (-dz / len) * halfT;
  const nz = (dx / len) * halfT;
  const y = heights.outlineYM;
  const positions = new Float32Array([
    startXZ.x + nx,
    y,
    startXZ.z + nz,
    endXZ.x + nx,
    y,
    endXZ.z + nz,
    endXZ.x - nx,
    y,
    endXZ.z - nz,
    startXZ.x - nx,
    y,
    startXZ.z - nz,
  ]);

  return { positions, outlineYM: heights.outlineYM };
}

/**
 * Axis-aligned gable roof footprint from the bounding box of Define 3D external walls.
 * @returns {{ positions: Float32Array, widthM: number, heightM: number } | null}
 */
export function buildFloorPlanGableRoofFootprintFromDefine3D(
  ring,
  centerLat,
  centerLng,
  externalPolygons,
  imageWidth,
  imageHeight,
  widthM,
  heightM,
  bearingDeg,
  wallTopYM
) {
  const frame = getSiteMeshFrame(ring);
  if (!frame || !externalPolygons?.length) return null;

  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;

  for (const polygon of externalPolygons) {
    for (const pt of polygon) {
      const { eastM, northM } = floorPlanPixelToLocalEN(
        pt.x,
        pt.y,
        imageWidth,
        imageHeight,
        widthM,
        heightM
      );
      minE = Math.min(minE, eastM);
      maxE = Math.max(maxE, eastM);
      minN = Math.min(minN, northM);
      maxN = Math.max(maxN, northM);
    }
  }

  if (!Number.isFinite(minE) || maxE - minE < 0.05 || maxN - minN < 0.05) return null;

  const localCorners = {
    sw: { e: minE, n: minN },
    se: { e: maxE, n: minN },
    ne: { e: maxE, n: maxN },
    nw: { e: minE, n: maxN },
  };
  const order = ["sw", "se", "ne", "nw"];
  const positions = new Float32Array(order.length * 3);

  for (let i = 0; i < order.length; i += 1) {
    const local = localCorners[order[i]];
    const rotated = rotateEN(local.e, local.n, bearingDeg);
    const latlng = offsetENFromCenter(centerLat, centerLng, rotated.east, rotated.north);
    const { x, z } = latLngToSiteLocalXZ(latlng.lat, latlng.lng, frame);
    positions[i * 3] = x;
    positions[i * 3 + 1] = wallTopYM;
    positions[i * 3 + 2] = z;
  }

  return {
    positions,
    widthM: maxE - minE,
    heightM: maxN - minN,
  };
}

/** Same footprint ring at a flat height (x/z unchanged). */
export function footprintRingAtY(topRingPositions, y) {
  const ring = topRingPositions.slice();
  for (let i = 1; i < ring.length; i += 3) {
    ring[i] = y;
  }
  return ring;
}

function readFootprintCornerXZ(topRingPositions, index) {
  return {
    x: topRingPositions[index * 3],
    z: topRingPositions[index * 3 + 2],
  };
}

function midpointXZ(a, b) {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

function outwardNormalCCW(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return { x: 0, z: 0 };
  return { x: dz / len, z: -dx / len };
}

function intersectOffsetEdges(fromA, toA, normalA, fromB, toB, normalB, offsetM) {
  const startA = {
    x: fromA.x + normalA.x * offsetM,
    z: fromA.z + normalA.z * offsetM,
  };
  const dirA = { x: toA.x - fromA.x, z: toA.z - fromA.z };
  const startB = {
    x: fromB.x + normalB.x * offsetM,
    z: fromB.z + normalB.z * offsetM,
  };
  const dirB = { x: toB.x - fromB.x, z: toB.z - fromB.z };
  const cross = dirA.x * dirB.z - dirA.z * dirB.x;
  if (Math.abs(cross) < 1e-12) {
    return { x: startA.x, z: startA.z };
  }
  const dx = startB.x - startA.x;
  const dz = startB.z - startA.z;
  const t = (dx * dirB.z - dz * dirB.x) / cross;
  return { x: startA.x + t * dirA.x, z: startA.z + t * dirA.z };
}

function rectangleSignedAreaXZ(sw, se, ne, nw) {
  const pts = [sw, se, ne, nw];
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].z - pts[j].x * pts[i].z;
  }
  return area * 0.5;
}

function offsetRectangleCorners(sw, se, ne, nw, offsetM) {
  // Floor plan rings are clockwise in site XZ (z = -north); flip offset when needed.
  const outwardOffset = rectangleSignedAreaXZ(sw, se, ne, nw) >= 0 ? offsetM : -offsetM;
  const normalSouth = outwardNormalCCW(sw, se);
  const normalEast = outwardNormalCCW(se, ne);
  const normalNorth = outwardNormalCCW(ne, nw);
  const normalWest = outwardNormalCCW(nw, sw);
  return {
    sw: intersectOffsetEdges(nw, sw, normalWest, sw, se, normalSouth, outwardOffset),
    se: intersectOffsetEdges(sw, se, normalSouth, se, ne, normalEast, outwardOffset),
    ne: intersectOffsetEdges(se, ne, normalEast, ne, nw, normalNorth, outwardOffset),
    nw: intersectOffsetEdges(ne, nw, normalNorth, nw, sw, normalWest, outwardOffset),
  };
}

function unitXZ(dx, dz) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return { x: 0, z: 0 };
  return { x: dx / len, z: dz / len };
}

function roofUV(x, z, originX, originZ, uDir, vDir, pitchM = CORRUGATED_ROOF_PITCH_M) {
  const rx = x - originX;
  const rz = z - originZ;
  return {
    u: (rx * uDir.x + rz * uDir.z) / pitchM,
    v: (rx * vDir.x + rz * vDir.z) / pitchM,
  };
}

function pushRoofVertex(positions, uvs, x, y, z, u, v) {
  const index = positions.length / 3;
  positions.push(x, y, z);
  uvs.push(u, v);
  return index;
}

function pushRoofQuad(indices, a, b, c, d) {
  indices.push(a, b, c, a, c, d);
}

/** Emit quad triangles with normals facing upward (+Y). */
function pushRoofQuadFacingUp(indices, positions, a, b, c, d) {
  const ax = positions[a * 3];
  const ay = positions[a * 3 + 1];
  const az = positions[a * 3 + 2];
  const bx = positions[b * 3];
  const by = positions[b * 3 + 1];
  const bz = positions[b * 3 + 2];
  const cx = positions[c * 3];
  const cy = positions[c * 3 + 1];
  const cz = positions[c * 3 + 2];
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const normalY = uz * vx - ux * vz;
  if (normalY >= 0) {
    pushRoofQuad(indices, a, b, c, d);
  } else {
    pushRoofQuad(indices, a, d, c, b);
  }
}

/**
 * Two-plane gable roof for a rectangular floor plan footprint.
 * Ridge runs lengthways; eaves overhang outward by overhangM at wallTopYM;
 * ridge is ridgeRiseM above wallTopYM.
 * @returns {{ positions: Float32Array, indices: Uint32Array } | null}
 */
export function buildFloorPlanGableRoofMesh(
  topRingPositions,
  widthM,
  heightM,
  wallTopYM,
  overhangM = FLOOR_PLAN_ROOF_OVERHANG_M,
  ridgeRiseM = FLOOR_PLAN_ROOF_RIDGE_RISE_M
) {
  const vertexCount = topRingPositions.length / 3;
  if (vertexCount < 4) return null;

  const sw = readFootprintCornerXZ(topRingPositions, 0);
  const se = readFootprintCornerXZ(topRingPositions, 1);
  const ne = readFootprintCornerXZ(topRingPositions, 2);
  const nw = readFootprintCornerXZ(topRingPositions, 3);
  const eave = offsetRectangleCorners(sw, se, ne, nw, overhangM);
  const eaveYM = wallTopYM;
  const ridgeYM = wallTopYM + ridgeRiseM;

  const positions = [];
  const uvs = [];
  const indices = [];
  const lengthRunsEastWest = widthM >= heightM;

  if (lengthRunsEastWest) {
    const ridgeWest = midpointXZ(eave.sw, eave.nw);
    const ridgeEast = midpointXZ(eave.se, eave.ne);
    const southUDir = unitXZ(eave.se.x - eave.sw.x, eave.se.z - eave.sw.z);
    const southVDir = unitXZ(ridgeWest.x - eave.sw.x, ridgeWest.z - eave.sw.z);
    const northUDir = unitXZ(eave.ne.x - eave.nw.x, eave.ne.z - eave.nw.z);
    const northVDir = unitXZ(ridgeWest.x - eave.nw.x, ridgeWest.z - eave.nw.z);

    const swUV = roofUV(eave.sw.x, eave.sw.z, eave.sw.x, eave.sw.z, southUDir, southVDir);
    const seUV = roofUV(eave.se.x, eave.se.z, eave.sw.x, eave.sw.z, southUDir, southVDir);
    const ridgeWestUV = roofUV(ridgeWest.x, ridgeWest.z, eave.sw.x, eave.sw.z, southUDir, southVDir);
    const ridgeEastUV = roofUV(ridgeEast.x, ridgeEast.z, eave.sw.x, eave.sw.z, southUDir, southVDir);

    const swIdx = pushRoofVertex(positions, uvs, eave.sw.x, eaveYM, eave.sw.z, swUV.u, swUV.v);
    const seIdx = pushRoofVertex(positions, uvs, eave.se.x, eaveYM, eave.se.z, seUV.u, seUV.v);
    const ridgeWestIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeWest.x,
      ridgeYM,
      ridgeWest.z,
      ridgeWestUV.u,
      ridgeWestUV.v
    );
    const ridgeEastIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeEast.x,
      ridgeYM,
      ridgeEast.z,
      ridgeEastUV.u,
      ridgeEastUV.v
    );

    const nwUV = roofUV(eave.nw.x, eave.nw.z, eave.nw.x, eave.nw.z, northUDir, northVDir);
    const neUV = roofUV(eave.ne.x, eave.ne.z, eave.nw.x, eave.nw.z, northUDir, northVDir);
    const ridgeWestNorthUV = roofUV(ridgeWest.x, ridgeWest.z, eave.nw.x, eave.nw.z, northUDir, northVDir);
    const ridgeEastNorthUV = roofUV(ridgeEast.x, ridgeEast.z, eave.nw.x, eave.nw.z, northUDir, northVDir);

    const nwIdx = pushRoofVertex(positions, uvs, eave.nw.x, eaveYM, eave.nw.z, nwUV.u, nwUV.v);
    const neIdx = pushRoofVertex(positions, uvs, eave.ne.x, eaveYM, eave.ne.z, neUV.u, neUV.v);
    const ridgeWestNorthIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeWest.x,
      ridgeYM,
      ridgeWest.z,
      ridgeWestNorthUV.u,
      ridgeWestNorthUV.v
    );
    const ridgeEastNorthIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeEast.x,
      ridgeYM,
      ridgeEast.z,
      ridgeEastNorthUV.u,
      ridgeEastNorthUV.v
    );

    pushRoofQuadFacingUp(indices, positions, swIdx, seIdx, ridgeEastIdx, ridgeWestIdx);
    pushRoofQuadFacingUp(indices, positions, nwIdx, neIdx, ridgeEastNorthIdx, ridgeWestNorthIdx);
  } else {
    const ridgeSouth = midpointXZ(eave.sw, eave.se);
    const ridgeNorth = midpointXZ(eave.nw, eave.ne);
    const westUDir = unitXZ(eave.nw.x - eave.sw.x, eave.nw.z - eave.sw.z);
    const westVDir = unitXZ(ridgeSouth.x - eave.sw.x, ridgeSouth.z - eave.sw.z);
    const eastUDir = unitXZ(eave.ne.x - eave.se.x, eave.ne.z - eave.se.z);
    const eastVDir = unitXZ(ridgeSouth.x - eave.se.x, ridgeSouth.z - eave.se.z);

    const swUV = roofUV(eave.sw.x, eave.sw.z, eave.sw.x, eave.sw.z, westUDir, westVDir);
    const nwUV = roofUV(eave.nw.x, eave.nw.z, eave.sw.x, eave.sw.z, westUDir, westVDir);
    const ridgeSouthUV = roofUV(ridgeSouth.x, ridgeSouth.z, eave.sw.x, eave.sw.z, westUDir, westVDir);
    const ridgeNorthWestUV = roofUV(ridgeNorth.x, ridgeNorth.z, eave.sw.x, eave.sw.z, westUDir, westVDir);

    const swIdx = pushRoofVertex(positions, uvs, eave.sw.x, eaveYM, eave.sw.z, swUV.u, swUV.v);
    const nwIdx = pushRoofVertex(positions, uvs, eave.nw.x, eaveYM, eave.nw.z, nwUV.u, nwUV.v);
    const ridgeSouthIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeSouth.x,
      ridgeYM,
      ridgeSouth.z,
      ridgeSouthUV.u,
      ridgeSouthUV.v
    );
    const ridgeNorthWestIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeNorth.x,
      ridgeYM,
      ridgeNorth.z,
      ridgeNorthWestUV.u,
      ridgeNorthWestUV.v
    );

    const seUV = roofUV(eave.se.x, eave.se.z, eave.se.x, eave.se.z, eastUDir, eastVDir);
    const neUV = roofUV(eave.ne.x, eave.ne.z, eave.se.x, eave.se.z, eastUDir, eastVDir);
    const ridgeSouthEastUV = roofUV(ridgeSouth.x, ridgeSouth.z, eave.se.x, eave.se.z, eastUDir, eastVDir);
    const ridgeNorthEastUV = roofUV(ridgeNorth.x, ridgeNorth.z, eave.se.x, eave.se.z, eastUDir, eastVDir);

    const seIdx = pushRoofVertex(positions, uvs, eave.se.x, eaveYM, eave.se.z, seUV.u, seUV.v);
    const neIdx = pushRoofVertex(positions, uvs, eave.ne.x, eaveYM, eave.ne.z, neUV.u, neUV.v);
    const ridgeSouthEastIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeSouth.x,
      ridgeYM,
      ridgeSouth.z,
      ridgeSouthEastUV.u,
      ridgeSouthEastUV.v
    );
    const ridgeNorthEastIdx = pushRoofVertex(
      positions,
      uvs,
      ridgeNorth.x,
      ridgeYM,
      ridgeNorth.z,
      ridgeNorthEastUV.u,
      ridgeNorthEastUV.v
    );

    pushRoofQuadFacingUp(indices, positions, swIdx, nwIdx, ridgeNorthWestIdx, ridgeSouthIdx);
    pushRoofQuadFacingUp(indices, positions, seIdx, neIdx, ridgeNorthEastIdx, ridgeSouthEastIdx);
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/**
 * Building footprint — top at highest grass point + BUILDING_HEIGHT_ABOVE_GRASS_M.
 * @returns {{ positions: Float32Array, outlineYM: number, grassTopYM: number } | null}
 */
export function buildBuildingOutlineLinePositions(
  ring,
  siteBoundaryRing,
  siteCornerLevels,
  baseOffsetM = SITE_BASE_OFFSET_M,
  heightAboveGrassM = BUILDING_HEIGHT_ABOVE_GRASS_M
) {
  const frame = getSiteMeshFrame(siteBoundaryRing);
  const minAhdM = siteMinAhdM(siteBoundaryRing, siteCornerLevels);
  if (!frame || minAhdM == null) return null;

  const points = dedupeClosedRing(ring);
  if (points.length < 3) return null;

  let maxRelativeM = 0;
  const samplePoints = [...points];
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    samplePoints.push({
      lat: (points[i].lat + points[j].lat) / 2,
      lng: (points[i].lng + points[j].lng) / 2,
    });
  }

  for (const point of samplePoints) {
    const relativeM = grassRelativeHeightAt(point.lat, point.lng, siteCornerLevels, minAhdM);
    if (relativeM == null) return null;
    maxRelativeM = Math.max(maxRelativeM, relativeM);
  }

  const grassTopYM = baseOffsetM + maxRelativeM + 0.012;
  const outlineYM = grassTopYM + heightAboveGrassM;
  const positions = new Float32Array(points.length * 3);

  for (let i = 0; i < points.length; i += 1) {
    const { x, z } = latLngToSiteLocalXZ(points[i].lat, points[i].lng, frame);
    positions[i * 3] = x;
    positions[i * 3 + 1] = outlineYM;
    positions[i * 3 + 2] = z;
  }

  return { positions, outlineYM, grassTopYM };
}

/** Verandah deck — top at highest grass point + VERANDAH_HEIGHT_ABOVE_GRASS_M. */
export function buildVerandahOutlineLinePositions(
  ring,
  siteBoundaryRing,
  siteCornerLevels,
  baseOffsetM = SITE_BASE_OFFSET_M,
  heightAboveGrassM = VERANDAH_HEIGHT_ABOVE_GRASS_M
) {
  return buildBuildingOutlineLinePositions(
    ring,
    siteBoundaryRing,
    siteCornerLevels,
    baseOffsetM,
    heightAboveGrassM
  );
}

/**
 * Solid extrusion of a flat footprint from its top ring down to the bottom of the dirt (y=0).
 * @param {Float32Array} topRingPositions - n vertices × 3 (flat top, shared Y)
 * @param {number} bottomYM
 * @param {{ includeTopCap?: boolean }} [options]
 * @returns {{ positions: Float32Array, indices: Uint32Array } | null}
 */
export function buildExtrudedFootprintMesh(topRingPositions, bottomYM = 0, options = {}) {
  const includeTopCap = options.includeTopCap !== false;
  const vertexCount = topRingPositions.length / 3;
  if (vertexCount < 3) return null;

  const contour = [];
  for (let i = 0; i < vertexCount; i += 1) {
    contour.push(
      new THREE.Vector2(topRingPositions[i * 3], topRingPositions[i * 3 + 2])
    );
  }

  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!triangles.length) return null;

  const topY = topRingPositions[1];
  const topPositions = new Float32Array(vertexCount * 3);
  const bottomPositions = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i += 1) {
    const x = topRingPositions[i * 3];
    const z = topRingPositions[i * 3 + 2];
    topPositions[i * 3] = x;
    topPositions[i * 3 + 1] = topY;
    topPositions[i * 3 + 2] = z;
    bottomPositions[i * 3] = x;
    bottomPositions[i * 3 + 1] = bottomYM;
    bottomPositions[i * 3 + 2] = z;
  }

  const flatIndices = [];
  for (const tri of triangles) {
    flatIndices.push(tri[0], tri[1], tri[2]);
  }

  let signedArea = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const j = (i + 1) % contour.length;
    signedArea += contour[i].x * contour[j].y - contour[j].x * contour[i].y;
  }
  const counterClockwise = signedArea > 0;

  const topTriCount = includeTopCap ? flatIndices.length : 0;
  const bottomTriCount = flatIndices.length;
  const sideTriCount = vertexCount * 6;
  const indices = new Uint32Array(topTriCount + bottomTriCount + sideTriCount);
  let offset = 0;

  if (includeTopCap) {
    for (let i = 0; i < flatIndices.length; i += 3) {
      const a = flatIndices[i];
      const b = flatIndices[i + 1];
      const c = flatIndices[i + 2];
      if (counterClockwise) {
        indices[offset + i] = a;
        indices[offset + i + 1] = b;
        indices[offset + i + 2] = c;
      } else {
        indices[offset + i] = a;
        indices[offset + i + 1] = c;
        indices[offset + i + 2] = b;
      }
    }
    offset += topTriCount;
  }

  for (let i = 0; i < flatIndices.length; i += 3) {
    const a = flatIndices[i] + vertexCount;
    const b = flatIndices[i + 1] + vertexCount;
    const c = flatIndices[i + 2] + vertexCount;
    if (counterClockwise) {
      indices[offset + i] = c;
      indices[offset + i + 1] = b;
      indices[offset + i + 2] = a;
    } else {
      indices[offset + i] = a;
      indices[offset + i + 1] = b;
      indices[offset + i + 2] = c;
    }
  }
  offset += bottomTriCount;

  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    const t0 = i;
    const t1 = j;
    const b0 = i + vertexCount;
    const b1 = j + vertexCount;
    const sideBase = offset + i * 6;
    if (counterClockwise) {
      indices[sideBase] = t0;
      indices[sideBase + 1] = b0;
      indices[sideBase + 2] = t1;
      indices[sideBase + 3] = t1;
      indices[sideBase + 4] = b0;
      indices[sideBase + 5] = b1;
    } else {
      indices[sideBase] = t0;
      indices[sideBase + 1] = t1;
      indices[sideBase + 2] = b0;
      indices[sideBase + 3] = t1;
      indices[sideBase + 4] = b1;
      indices[sideBase + 5] = b0;
    }
  }

  const positions = new Float32Array(vertexCount * 2 * 3);
  positions.set(topPositions, 0);
  positions.set(bottomPositions, vertexCount * 3);

  return { positions, indices };
}

/**
 * Flat horizontal cap matching a footprint polygon (for building roofs).
 * @param {Float32Array} topRingPositions - n vertices × 3 (flat ring, shared Y)
 * @param {number} liftM - tiny offset above the ring to avoid z-fighting
 * @returns {{ positions: Float32Array, indices: Uint32Array } | null}
 */
export function buildFootprintTopCapMesh(topRingPositions, liftM = 0.003) {
  const vertexCount = topRingPositions.length / 3;
  if (vertexCount < 3) return null;

  const contour = [];
  for (let i = 0; i < vertexCount; i += 1) {
    contour.push(
      new THREE.Vector2(topRingPositions[i * 3], topRingPositions[i * 3 + 2])
    );
  }

  let signedArea = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const j = (i + 1) % contour.length;
    signedArea += contour[i].x * contour[j].y - contour[j].x * contour[i].y;
  }
  const counterClockwise = signedArea > 0;

  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (!triangles.length) return null;

  const capY = topRingPositions[1] + liftM;
  const positions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i += 1) {
    positions[i * 3] = topRingPositions[i * 3];
    positions[i * 3 + 1] = capY;
    positions[i * 3 + 2] = topRingPositions[i * 3 + 2];
  }

  const indices = [];
  for (const tri of triangles) {
    if (counterClockwise) {
      indices.push(tri[0], tri[1], tri[2]);
    } else {
      indices.push(tri[0], tri[2], tri[1]);
    }
  }

  return { positions, indices: new Uint32Array(indices) };
}

/** How far edge lines sit outside wall corners (m) — keeps alcove corners visible. */
export const FOOTPRINT_EDGE_OFFSET_M = 0.045;

/**
 * Monument edge lines for an extruded footprint. Corner vertices are nudged along the
 * exterior bisector so concave (alcove) corners stay visible, not buried in the walls.
 * @returns {Float32Array | null} line-segment positions (pairs of xyz)
 */
export function buildFootprintEdgeLinePositions(
  topRingPositions,
  bottomYM = 0,
  offsetM = FOOTPRINT_EDGE_OFFSET_M
) {
  const vertexCount = topRingPositions.length / 3;
  if (vertexCount < 3) return null;

  const topY = topRingPositions[1];

  let signedArea = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    signedArea +=
      topRingPositions[i * 3] * topRingPositions[j * 3 + 2] -
      topRingPositions[j * 3] * topRingPositions[i * 3 + 2];
  }
  const counterClockwise = signedArea > 0;

  const offsetXZ = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    const prev = (i - 1 + vertexCount) % vertexCount;
    const next = (i + 1) % vertexCount;

    const px0 = topRingPositions[prev * 3];
    const pz0 = topRingPositions[prev * 3 + 2];
    const px1 = topRingPositions[i * 3];
    const pz1 = topRingPositions[i * 3 + 2];
    const px2 = topRingPositions[next * 3];
    const pz2 = topRingPositions[next * 3 + 2];

    const d1x = px1 - px0;
    const d1z = pz1 - pz0;
    const d2x = px2 - px1;
    const d2z = pz2 - pz1;
    const len1 = Math.hypot(d1x, d1z) || 1;
    const len2 = Math.hypot(d2x, d2z) || 1;

    const n1x = counterClockwise ? d1z / len1 : -d1z / len1;
    const n1z = counterClockwise ? -d1x / len1 : d1x / len1;
    const n2x = counterClockwise ? d2z / len2 : -d2z / len2;
    const n2z = counterClockwise ? -d2x / len2 : d2x / len2;

    let bx = n1x + n2x;
    let bz = n1z + n2z;
    const blen = Math.hypot(bx, bz);
    if (blen < 1e-9) {
      bx = n1x;
      bz = n1z;
    } else {
      bx /= blen;
      bz /= blen;
    }

    const dot = Math.max(-1, Math.min(1, n1x * n2x + n1z * n2z));
    const halfAngleCos = Math.sqrt((1 + dot) / 2);
    const miterScale = Math.min(3, 1 / Math.max(0.3, halfAngleCos));
    const scale = offsetM * miterScale;

    offsetXZ[i] = {
      x: px1 + bx * scale,
      z: pz1 + bz * scale,
    };
  }

  const segmentCount = vertexCount * 3;
  const positions = new Float32Array(segmentCount * 6);
  let offset = 0;

  const pushSegment = (x0, y0, z0, x1, y1, z1) => {
    positions[offset] = x0;
    positions[offset + 1] = y0;
    positions[offset + 2] = z0;
    positions[offset + 3] = x1;
    positions[offset + 4] = y1;
    positions[offset + 5] = z1;
    offset += 6;
  };

  for (let i = 0; i < vertexCount; i += 1) {
    const { x, z } = offsetXZ[i];
    pushSegment(x, bottomYM, z, x, topY, z);
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const j = (i + 1) % vertexCount;
    const a = offsetXZ[i];
    const b = offsetXZ[j];
    pushSegment(a.x, topY, a.z, b.x, topY, b.z);
    pushSegment(a.x, bottomYM, a.z, b.x, bottomYM, b.z);
  }

  return positions;
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
