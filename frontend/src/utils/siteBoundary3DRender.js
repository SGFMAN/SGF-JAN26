import * as THREE from "three";
import { fetchMonumentBox, fetchFloorPlanImageBlob, floorPlanDimensionsMeters, loadImageSizeFromBlob } from "./floorPlanMap";
import {
  createCorrugatedRoofMaterial,
  createCorrugatedRoofTexture,
} from "./corrugatedRoofTexture";
import {
  assignEarthUVs,
  assignGrassUVs,
  createEarthMaterial,
  createEarthTexture,
  createGrassMaterial,
  createGrassTexture,
} from "./earthTexture";
import {
  buildEarthVolumeMesh,
  buildBuildingOutlineLinePositions,
  buildExtrudedFootprintMesh,
  buildFootprintEdgeLinePositions,
  buildFootprintTopCapMesh,
  buildFloorPlanGableRoofMesh,
  buildFloorPlanOutlineLinePositions,
  footprintRingAtY,
  FLOOR_PLAN_UPPER_HEIGHT_M,
  buildHeightTopSurfaceMesh,
  buildSiteSlabMesh,
  cornerRelativeHeightsM,
  extractOuterRings,
} from "./siteBoundaryMesh";

const FLOOR_PLAN_SUBFLOOR_COLOR = 0x323233;
const FLOOR_PLAN_UPPER_COLOR = 0xd1d5db;
const BUILDING_WALL_COLOR = 0xffffff;
const BUILDING_ROOF_COLOR = 0xffffff;
const BUILDING_EDGE_COLOR = 0x323233;
const FOOTPRINT_BOTTOM_Y = 0;

function addExtrudedFootprintMesh(boundaryGroup, topRingPositions, color, options = {}) {
  const bottomYM = options.bottomYM ?? FOOTPRINT_BOTTOM_Y;
  const volume = buildExtrudedFootprintMesh(topRingPositions, bottomYM, options);
  if (!volume) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(volume.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(volume.indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 15;
  boundaryGroup.add(mesh);
}

function addFlatFootprintCap(boundaryGroup, topRingPositions, color, options = {}) {
  const cap = buildFootprintTopCapMesh(topRingPositions, options.liftM ?? 0.008);
  if (!cap) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(cap.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(cap.indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color,
    side: options.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: !options.doubleSided,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 17;
  boundaryGroup.add(mesh);
}

function footprintCentroidXZ(topRingPositions) {
  const vertexCount = topRingPositions.length / 3;
  if (vertexCount < 1) return null;
  let x = 0;
  let z = 0;
  for (let i = 0; i < vertexCount; i += 1) {
    x += topRingPositions[i * 3];
    z += topRingPositions[i * 3 + 2];
  }
  return {
    x: x / vertexCount,
    y: topRingPositions[1],
    z: z / vertexCount,
  };
}

function createExistingBuildingLabelSprite(text = "Existing Building") {
  const labelScale = 8;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `600 ${20 * labelScale}px Arial, sans-serif`;
  ctx.font = font;
  const pad = 10 * labelScale;
  const textWidth = ctx.measureText(text).width;
  canvas.width = Math.ceil(textWidth + pad * 2);
  canvas.height = 32 * labelScale;
  ctx.font = font;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#323233";
  ctx.lineWidth = 2 * labelScale;
  ctx.strokeText(text, pad, 22 * labelScale);
  ctx.fillStyle = "#323233";
  ctx.fillText(text, pad, 22 * labelScale);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    })
  );
  const scale = 0.45;
  sprite.scale.set((canvas.width / 128) * scale, (canvas.height / 128) * scale, 1);
  return sprite;
}

function addExistingBuildingLabel(boundaryGroup, topRingPositions) {
  const center = footprintCentroidXZ(topRingPositions);
  if (!center) return;
  const sprite = createExistingBuildingLabelSprite();
  sprite.position.set(center.x, center.y + 0.55, center.z);
  sprite.renderOrder = 25;
  boundaryGroup.add(sprite);
}

function addFootprintEdgeLines(
  boundaryGroup,
  topRingPositions,
  bottomYM = FOOTPRINT_BOTTOM_Y,
  color = BUILDING_EDGE_COLOR
) {
  const positions = buildFootprintEdgeLinePositions(topRingPositions, bottomYM);
  if (!positions) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      depthTest: true,
      depthWrite: false,
    })
  );
  lines.renderOrder = 18;
  boundaryGroup.add(lines);
}

function addFloorPlanGableRoof(boundaryGroup, topRingPositions, widthM, heightM, eaveYM) {
  const roof = buildFloorPlanGableRoofMesh(topRingPositions, widthM, heightM, eaveYM);
  if (!roof) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(roof.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(roof.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(roof.indices, 1));
  geometry.computeVertexNormals();

  const texture = createCorrugatedRoofTexture();
  const material = createCorrugatedRoofMaterial(texture);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 19;
  boundaryGroup.add(mesh);
}

export function fitCameraToObject(camera, object, padding = 1.4) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = (camera.fov * Math.PI) / 180;
  let dist = maxDim / (2 * Math.tan(fov / 2));
  dist *= padding;

  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.65, center.z + dist * 0.55);
  camera.lookAt(center);
  camera.near = Math.max(0.1, dist / 100);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
}

function addBoundaryScene(boundaryGroup, ring, siteCornerLevels, earthMaterial, grassMaterial) {
  const slabData = buildSiteSlabMesh(ring);
  if (!slabData) throw new Error("Could not build site boundary");

  const cornerHeights = cornerRelativeHeightsM(ring, siteCornerLevels);
  if (!cornerHeights) throw new Error("Could not calculate corner heights");

  const earthVolume = buildEarthVolumeMesh(ring, slabData.topPositions, cornerHeights);
  if (!earthVolume) throw new Error("Could not build earth volume");

  const earthGeometry = new THREE.BufferGeometry();
  earthGeometry.setAttribute("position", new THREE.BufferAttribute(earthVolume.positions, 3));
  earthGeometry.setIndex(earthVolume.indices);
  const earthUvs = new Float32Array((earthVolume.positions.length / 3) * 2);
  assignEarthUVs(earthVolume.positions, earthUvs);
  earthGeometry.setAttribute("uv", new THREE.BufferAttribute(earthUvs, 2));
  earthGeometry.computeVertexNormals();
  boundaryGroup.add(new THREE.Mesh(earthGeometry, earthMaterial));

  const topSurface = buildHeightTopSurfaceMesh(ring, slabData.topPositions, cornerHeights);
  if (!topSurface) throw new Error("Could not build grass top surface");

  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute("position", new THREE.BufferAttribute(topSurface.positions, 3));
  grassGeometry.setIndex(new THREE.BufferAttribute(topSurface.indices, 1));
  const grassUvs = new Float32Array((topSurface.positions.length / 3) * 2);
  assignGrassUVs(topSurface.positions, grassUvs);
  grassGeometry.setAttribute("uv", new THREE.BufferAttribute(grassUvs, 2));
  grassGeometry.computeVertexNormals();
  boundaryGroup.add(new THREE.Mesh(grassGeometry, grassMaterial));

  return cornerHeights;
}

async function addFloorPlanVolume(boundaryGroup, ring, siteCornerLevels, placedUnit) {
  const { plan, center, bearing = 0 } = placedUnit || {};
  if (!plan?.id || !plan?.scale?.metersPerPixel || !center?.lat || !center?.lng) {
    return;
  }

  const blob = await fetchFloorPlanImageBlob(plan.id);
  const { width, height } = await loadImageSizeFromBlob(blob);
  const dims = floorPlanDimensionsMeters(plan, width, height);
  if (!dims) return;

  const outline = buildFloorPlanOutlineLinePositions(
    ring,
    siteCornerLevels,
    center.lat,
    center.lng,
    dims.widthM,
    dims.heightM,
    bearing
  );
  if (!outline) return;

  addExtrudedFootprintMesh(boundaryGroup, outline.positions, FLOOR_PLAN_SUBFLOOR_COLOR, {
    doubleSided: true,
    bottomYM: FOOTPRINT_BOTTOM_Y,
  });

  const upperTopY = outline.outlineYM + FLOOR_PLAN_UPPER_HEIGHT_M;
  const upperRing = footprintRingAtY(outline.positions, upperTopY);
  addExtrudedFootprintMesh(boundaryGroup, upperRing, FLOOR_PLAN_UPPER_COLOR, {
    includeTopCap: false,
    doubleSided: true,
    bottomYM: outline.outlineYM,
  });
  addFootprintEdgeLines(boundaryGroup, upperRing, outline.outlineYM);
  addFloorPlanGableRoof(boundaryGroup, outline.positions, dims.widthM, dims.heightM, upperTopY);
}

function addBuildingVolumes(boundaryGroup, siteRing, siteCornerLevels, buildingsGeoJson) {
  const features = buildingsGeoJson?.features || [];
  if (!features.length) return;

  for (const feature of features) {
    const rings = extractOuterRings(feature.geometry);
    for (const ring of rings) {
      const outline = buildBuildingOutlineLinePositions(ring, siteRing, siteCornerLevels);
      if (!outline) continue;
      addExtrudedFootprintMesh(boundaryGroup, outline.positions, BUILDING_WALL_COLOR, {
        includeTopCap: false,
        doubleSided: true,
      });
      addFlatFootprintCap(boundaryGroup, outline.positions, BUILDING_ROOF_COLOR, {
        doubleSided: true,
      });
      addFootprintEdgeLines(boundaryGroup, outline.positions);
      addExistingBuildingLabel(boundaryGroup, outline.positions);
    }
  }
}

export function disposeThreeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
    }
  });
}

export async function populateSiteBoundary3DGroup(
  boundaryGroup,
  { siteGeometry, lookupState = "VIC", placedUnit = null, buildingsGeoJson = null, earthMaterial, grassMaterial }
) {
  const rings = extractOuterRings(siteGeometry);
  if (!rings.length) {
    throw new Error("No site boundary geometry");
  }

  const data = await fetchMonumentBox(siteGeometry, lookupState);
  const levels = data.siteCornerLevels;
  const complete =
    levels && ["nw", "ne", "se", "sw"].every((id) => Number.isFinite(levels[id]?.ahdM));

  if (!complete) {
    throw new Error(
      data.missing?.length
        ? `Missing monument data (${data.missing.join(", ").toUpperCase()})`
        : "Could not calculate site corner levels"
    );
  }

  const cornerHeights = addBoundaryScene(boundaryGroup, rings[0], levels, earthMaterial, grassMaterial);
  try {
    await addFloorPlanVolume(boundaryGroup, rings[0], levels, placedUnit);
  } catch {
    /* unit outline is optional */
  }
  addBuildingVolumes(boundaryGroup, rings[0], levels, buildingsGeoJson);

  return {
    maxRelativeFall: Math.max(...cornerHeights.map((c) => c.relativeM)),
    siteRing: rings[0],
  };
}

export async function captureSiteBoundary3DSnapshot({
  siteGeometry,
  lookupState = "VIC",
  placedUnit = null,
  buildingsGeoJson = null,
  width = 1280,
  height = 720,
}) {
  const container = document.createElement("div");
  container.style.cssText = `width:${width}px;height:${height}px;position:fixed;left:-20000px;top:0;overflow:hidden;`;
  document.body.appendChild(container);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2332);
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(40, 60, 30);
  scene.add(keyLight);

  const earthTexture = createEarthTexture();
  const earthMaterial = createEarthMaterial(earthTexture);
  const grassTexture = createGrassTexture();
  const grassMaterial = createGrassMaterial(grassTexture);
  const boundaryGroup = new THREE.Group();
  scene.add(boundaryGroup);

  try {
    await populateSiteBoundary3DGroup(boundaryGroup, {
      siteGeometry,
      lookupState,
      placedUnit,
      buildingsGeoJson,
      earthMaterial,
      grassMaterial,
    });

    fitCameraToObject(camera, boundaryGroup);
    renderer.render(scene, camera);

    const blob = await new Promise((resolve, reject) => {
      renderer.domElement.toBlob(
        (result) => (result ? resolve(result) : reject(new Error("3D visualisation capture failed"))),
        "image/png"
      );
    });
    return blob;
  } finally {
    disposeThreeObject(scene);
    earthTexture.dispose();
    grassTexture.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
    document.body.removeChild(container);
  }
}
