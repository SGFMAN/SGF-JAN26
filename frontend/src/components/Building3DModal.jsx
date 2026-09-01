import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeThreeObject } from "../utils/siteBoundary3DRender";
import {
  buildFootprintSlabGeometry,
  buildFootprintSlabOutlineGeometry,
  buildFootprintWallBandGeometry,
  buildFootprintWallBandOutlineGeometry,
  buildFootprintWeatherboardParts,
  buildFootprintDuragrooveParts,
  weatherboardRowTops,
  CLADDING_WALL_THICKNESS_M,
  WALL_LINING_THICKNESS_M,
  WALL_LINING_FRAME_GAP_M,
  buildExternalWallLiningParts,
  buildInternalWallLiningParts,
  liningTJunctionOpeningsOnRing,
  WEATHERBOARD_HEIGHT_M,
  WEATHERBOARD_THICKNESS_M,
  WEATHERBOARD_LAP_M,
  WEATHERBOARD_FRAME_GAP_M,
  DURAGROOVE_THICKNESS_M,
  DURAGROOVE_FRAME_GAP_M,
  getDuragrooveMaps,
  footprintBounds,
  footprintCornerColumnCenters,
  resolveAlignedTraceRing,
  resolveBuildingFootprintRing,
  resolveModelDoors,
  resolveModelInternalDoors,
  resolveModelSlidingDoors,
  resolveModelWindows,
  sanitizeFootprintRing,
  footprintEdgeInwardXZ,
} from "../utils/buildingUnitGeometry";
import { parseFlooringRegions } from "../utils/planTracePolygon";
import { fetchAuthedImageBlobUrl } from "../utils/authedImageCache";
import {
  resolveUnitFinishHexes,
  UNIT_MATERIAL_META,
} from "../utils/buildingUnitFinishes.js";
import {
  DEFAULT_BUILDING_3D,
  DEFAULT_SUBFLOOR_TYPE,
  CONCRETE_STUMP_SIZE_M,
  MEGA_ANCHOR_DIAMETER_M,
  MEGA_ANCHOR_PLATE_SIZE_M,
  MEGA_ANCHOR_PLATE_THICKNESS_M,
  MEGA_ANCHOR_BEARER_TO_UPRIGHT_M,
  MEGA_ANCHOR_PILE_DIAMETER_M,
  MEGA_ANCHOR_PILE_VISIBLE_M,
  MEGA_ANCHOR_PILE_BELOW_M,
  MEGA_ANCHOR_PILE_TILT_RAD,
  MEGA_ANCHOR_PILE_RAKE_RAD,
  concreteStumpHeightM,
  bearerRunAxis,
  STRUCTURAL_FLOOR_THICKNESS_M,
  BASEBOARD_HEIGHT_M,
  BASEBOARD_THICKNESS_M,
  BASEBOARD_GAP_M,
  FRAME_TIMBER_DEPTH_M,
  FRAME_TIMBER_FACE_M,
  FRAME_STUD_CENTRES_M,
  INTERNAL_FRAME_STUD_CENTRES_M,
  FRAME_WINDOW_LINTEL_HEIGHT_M,
  FRAME_WINDOW_LINTEL_THICKNESS_M,
  FRAME_WINDOW_LINTEL_BEARING_M,
  FRAME_SWING_DOOR_JAMB_OUTSET_M,
  FRAME_NOGGING_STAGGER_M,
  OUTER_BEARER_INSET_M,
  OUTER_STUMP_END_INSET_M,
} from "../constants/building3dDefaults.js";
import {
  normalizeElementVisibility,
  parseCladdingType,
  CLADDING_TYPE_DURAGROOVE,
  CLADDING_TYPE_WEATHERBOARD,
  FOOTING_VISIBILITY_KEYS,
} from "../constants/buildingElements.js";
import {
  assignTimberDeckUVs,
  createTimberDeckMaterial,
  createTimberDeckTexture,
  createFramingTimberMaterial,
  createFramingTimberTexture,
  createTreatedPineMaterial,
  createTreatedPineTexture,
  createParticleBoardMaterial,
  createParticleBoardTexture,
  TIMBER_DECK_BOARD_PITCH_M,
} from "../utils/timberDeckTexture.js";
import {
  buildHippedRoofGeometry,
  buildHippedRoofMeshData,
  buildHippedRoofOutlineGeometry,
  HIPPED_ROOF_PITCH_DEG,
  ROOF_GUTTER_INSET_M,
  ROOF_SLAB_THICKNESS_M,
  hippedRoofEaveYM,
  insetRoofRingForGutter,
} from "../utils/hippedRoofGeometry.js";
import { isSuperiorHippedRoofStyle, isSuperiorSkillionRoofStyle } from "../constants/roofStyles.js";
import {
  AFFORDABLE_ROOF_PITCH_DEG,
  AFFORDABLE_ROOF_SLAB_THICKNESS_M,
  affordableBattenParts,
  affordableBattenStations,
  affordableCutawayFasciaParts,
  affordableGutterChannelParts,
  buildAffordableGableEndPanelMeshData,
  buildAffordableRoofSheetMeshData,
} from "../utils/affordableRoofGeometry.js";
import {
  buildSkillionRoofSlabGeometry,
  buildSkillionRoofSlabMeshData,
  buildSkillionRoofSlabOutlineGeometry,
  clipRingToSkillionMinRise,
  resolveSkillionPitch,
  skillionMaxWallRiseM,
  skillionUndersideRiseM,
  SKILLION_ROOF_PITCH_DEG,
  SKILLION_ROOF_SLAB_THICKNESS_M,
} from "../utils/skillionRoofGeometry.js";
import {
  getTracePlanXZMapping,
  normalizedPointToXZ,
  offsetPolygonInward,
} from "../utils/tracePlan3D.js";
import {
  createCorrugatedRoofTexture,
} from "../utils/corrugatedRoofTexture.js";
import grassImage from "../images/grass.jpg";
import skyImage from "../images/sky.jpg";
import { UI } from "../utils/uiThemeTokens.js";
import { addTimberBoundaryFence } from "../utils/timberFence.js";

export const BUILDING_3D_PARTS = Object.freeze({
  SUBFLOOR: "subfloor",
  SUBFLOOR_SLAB: "subfloor-slab",
  SUBFLOOR_STUMPS: "subfloor-stumps",
  SUBFLOOR_LAYER_1: "subfloor-layer-1",
  SUBFLOOR_LAYER_2: "subfloor-layer-2",
  SUBFLOOR_LAYER_3: "subfloor-layer-3",
  CORNER_COLUMNS: "corner-columns",
  DECK: "deck",
  DECK_LAYER_1: "deck-layer-1",
  DECK_LAYER_2: "deck-layer-2",
  DECK_LAYER_3: "deck-layer-3",
  DECK_TOP: "deck-top",
  BEARERS: "bearers",
  JOISTS: "joists",
  STRUCTURAL_FLOOR: "structural-floor",
  BASEBOARDS: "baseboards",
  FRAME: "frame",
  CLADDING: "cladding",
  CLADDING_LAYER_1: "cladding-layer-1",
  CLADDING_LAYER_2: "cladding-layer-2",
  CLADDING_LAYER_3: "cladding-layer-3",
  CLADDING_LAYER_4: "cladding-layer-4",
  CLADDING_LAYER_5: "cladding-layer-5",
  CLADDING_LAYER_6: "cladding-layer-6",
  CLADDING_LAYER_7: "cladding-layer-7",
  CLADDING_LAYER_8: "cladding-layer-8",
  CLADDING_LAYER_9: "cladding-layer-9",
  CLADDING_LAYER_10: "cladding-layer-10",
  CLADDING_LAYER_11: "cladding-layer-11",
  CLADDING_LAYER_12: "cladding-layer-12",
  CLADDING_LAYER_13: "cladding-layer-13",
  CLADDING_CORNER_COLUMNS: "cladding-corner-columns",
  ROOF: "roof",
  WINDOWS: "windows",
  DOORS: "doors",
  SLIDING_DOORS: "sliding-doors",
  INTERNAL_WALLS: "internal-walls",
  INTERNAL_WALL_LINING: "internal-wall-lining",
  INTERNAL_DOORS: "internal-doors",
  KITCHEN_BENCH: "kitchen-bench",
  KITCHEN_CABINET: "kitchen-cabinet",
  KITCHEN_BENCHTOP: "kitchen-benchtop",
  ROBES: "robes",
});

function visibilityKeyForPart(type, id) {
  const t = String(type || "");
  const n = String(id || "");
  if (t === "subfloor-slab" || n === BUILDING_3D_PARTS.SUBFLOOR_SLAB) return "slab";
  if (t === "subfloor" || n === BUILDING_3D_PARTS.SUBFLOOR) return "footing";
  if (t === "concrete-stumps") return "concrete-stumps";
  if (t === "mega-anchors") return "mega-anchors";
  if (t === "bearers" || n === BUILDING_3D_PARTS.BEARERS) return "bearers";
  if (t === "joists" || n === BUILDING_3D_PARTS.JOISTS) return "joists";
  if (t === "structural-floor" || n === BUILDING_3D_PARTS.STRUCTURAL_FLOOR) return "structural-floor";
  if (t === "baseboards" || n === BUILDING_3D_PARTS.BASEBOARDS) return "baseboards";
  if (t === "frame" || n === BUILDING_3D_PARTS.FRAME) return "frame";
  if (
    t.startsWith("internal-wall-lining") ||
    n === "internal-wall-lining" ||
    n.startsWith("internal-wall-lining-")
  ) {
    return "internal-wall-lining";
  }
  if (t.startsWith("internal-wall") || n === "internal-walls" || n.startsWith("internal-walls-")) {
    return "frame";
  }
  if (
    t.startsWith("cladding") ||
    n.startsWith("cladding") ||
    t.startsWith("weatherboard") ||
    n.startsWith("weatherboard") ||
    t.startsWith("duragroove") ||
    n.startsWith("duragroove")
  ) {
    return "cladding";
  }
  if (t.startsWith("window") || n === "windows" || n.startsWith("windows-")) return "windows";
  if (t.startsWith("sliding-door") || n === "sliding-doors" || n.startsWith("sliding-doors-")) {
    return "sliding-doors";
  }
  if (t.startsWith("internal-door") || n === "internal-doors" || n.startsWith("internal-doors-")) {
    return "internal-doors";
  }
  if (t.startsWith("door") || n === "doors" || n.startsWith("doors-")) return "doors";
  if (t.includes("roof") || n === "roof" || n.startsWith("roof-")) return "roof";
  if (t.startsWith("deck") || n === "deck" || n.startsWith("deck-")) return "deck";
  if (t.startsWith("kitchen") || n.startsWith("kitchen")) return "kitchen";
  if (t.startsWith("robe") || n.startsWith("robe")) return "robes";
  if (t === "floor-finish" || t === "flooring" || n === "flooring" || n.startsWith("floor-finish")) {
    return "flooring";
  }
  return null;
}

function applyBuildingElementVisibility(scene, modelGroup, vis, claddingType) {
  const on = (key) => vis?.[key] !== false;
  const claddingOn = on("cladding") && on("weatherboards") && on("wall");
  const footingOn = on("footing");
  const style = parseCladdingType(claddingType);
  if (modelGroup) {
    modelGroup.traverse((obj) => {
      const key = visibilityKeyForPart(obj.userData?.partType, obj.userData?.partId || obj.name);
      if (!key) return;
      if (key === "cladding") {
        const id = `${obj.userData?.partType || ""} ${obj.userData?.partId || obj.name || ""}`.toLowerCase();
        if (id.includes("duragroove")) {
          obj.visible = claddingOn && style === CLADDING_TYPE_DURAGROOVE;
        } else if (
          id.includes("weatherboard") ||
          id.includes("cladding-layer") ||
          id.includes("cladding-corner")
        ) {
          obj.visible = claddingOn && style === CLADDING_TYPE_WEATHERBOARD;
        } else {
          obj.visible = claddingOn;
        }
        return;
      }
      if (FOOTING_VISIBILITY_KEYS.includes(key)) {
        obj.visible = footingOn && on(key);
        return;
      }
      obj.visible = on(key);
    });
  }
  const fence = scene?.getObjectByName("timber-fence");
  if (fence) fence.visible = on("fence");
}

/** Grass / fence stay this size so building edits do not rebuild the WebGL scene. */
const SCENE_GROUND_SIZE_M = 80;

function removeDirectChildByName(parent, name) {
  const child = parent?.children?.find((obj) => obj.name === name);
  if (!child) return;
  parent.remove(child);
  disposeThreeObject(child);
}

function removeDirectChildrenExcept(parent, keepNames) {
  if (!parent) return;
  [...parent.children].forEach((child) => {
    if (keepNames.has(child.name)) return;
    parent.remove(child);
    disposeThreeObject(child);
  });
}

function buildingContentKeys(p) {
  return {
    subfloor: [
      p.widthM,
      p.depthM,
      p.subfloorHeightM,
      p.resolvedSubfloorType,
      p.bearerHeightM,
      p.joistHeightM,
      p.bearerWidthM,
      p.joistWidthM,
      p.bearerSpanMaxM,
      p.joistSpanMaxM,
      p.joistCentresM,
      p.finishHex?.baseboards,
      p.footprintKey,
      p.calibrationKey,
    ].join("\0"),
    frame: [
      p.widthM,
      p.depthM,
      p.subfloorHeightM,
      p.resolvedSubfloorType,
      p.CLADDING_HEIGHT_M,
      p.footprintKey,
      p.calibrationKey,
      p.windowsKey,
      p.doorsKey,
      p.slidingDoorsKey,
    ].join("\0"),
    envelope: [
      p.widthM,
      p.depthM,
      p.subfloorHeightM,
      p.CLADDING_HEIGHT_M,
      p.footprintKey,
      p.roofPointsKey,
      p.roofPivotKey,
      p.roofRidgeAxisKey,
      p.deckPointsKey,
      p.kitchenBenchesKey,
      p.robesKey,
      p.windowsKey,
      p.doorsKey,
      p.slidingDoorsKey,
      p.internalWallsKey,
      p.internalDoorsKey,
      p.flooringPointsKey,
      p.hybridRegionsKey,
      p.tilesRegionsKey,
      p.carpetRegionsKey,
      p.flooringImagesKey,
      p.flooringScalesKey,
      p.calibrationKey,
      p.finishesKey,
      p.kitchenFinishesKey,
    ].join("\0"),
  };
}

/** Finished floor is top of 650 mm subfloor; standing eye height is 1.8 m above that. */
const SUBFLOOR_TOP_M = 0.65;
const STANDING_EYE_ABOVE_FLOOR_M = 1.8;
const EYE_HEIGHT_M = SUBFLOOR_TOP_M + STANDING_EYE_ABOVE_FLOOR_M;
const VIEW_MODE_EXTERNAL = "external";
const VIEW_MODE_INTERNAL = "internal";
/** Overhead interior orbit: fixed eye height, look-at on the floor. */
const INTERNAL_VIEW_CAMERA_HEIGHT_M = 15;
const INTERNAL_VIEW_FOCUS_Y_M = 0;
/** External walk speed (metres per second) — no collision. */
const EXTERNAL_WALK_SPEED_M_S = 4.5;
/** Q (up) / Z (down) camera height speed. */
const CAMERA_HEIGHT_SPEED_M_S = 3.5;
const CAMERA_HEIGHT_MIN_M = 0.2;
const CAMERA_HEIGHT_MAX_M = 40;
/** Kept across in-modal scene rebuilds so setting changes do not reset orbit / walk / height. */
const persistedViewPose = { current: null };
/** Thin finish layer on top of the subfloor. */
const FLOOR_FINISH_THICKNESS_M = 0.008;
const FLOOR_FINISH_Y_EPS_M = 0.002;
/** Kitchen: cabinetry 0–879 mm, benchtop slab 880–900 mm (above subfloor). */
const KITCHEN_CABINET_TOP_M = 0.879;
const KITCHEN_BENCHTOP_BOTTOM_M = 0.88;
const KITCHEN_BENCHTOP_TOP_M = 0.9;
const KITCHEN_CABINET_FALLBACK_COLOR = 0xb8b4af;
const KITCHEN_BENCHTOP_FALLBACK_COLOR = 0xd6d3d1;
/** 10 mm plasterboard, off-white. */
const WALL_LINING_COLOR = 0xf2efe8;
/** Robes solid slab height above floor level (full cladding height). */
const ROBES_HEIGHT_M = 2.6;
const ROBES_COLOR = 0xc7c9d3;
const TILE_MODULE_WIDTH_M = 0.6;
const TILE_MODULE_HEIGHT_M = 0.3;
const CARPET_MODULE_M = 0.5;
const HYBRID_MODULE_WIDTH_M = 2.44;
const HYBRID_MODULE_HEIGHT_M = 0.36;
const HYBRID_FLOOR_FALLBACK_COLOR = 0xc4a574;
const TILES_FLOOR_FALLBACK_COLOR = 0x059669;
const CARPET_FLOOR_FALLBACK_COLOR = 0x7c3aed;
const SUBFLOOR_LAYER_HEIGHT_M = 0.2;
const SUBFLOOR_LAYER_GAP_M = 0.025;
const CORNER_COLUMN_SIZE_M = 0.05;
const CORNER_COLUMN_HEIGHT_M = 0.65;
const CORNER_COLUMN_PROJECTION_M = 0.01;
/** Thin timber board cap on the top deck slab. */
const DECK_TOP_CAP_THICKNESS_M = 0.008;
const CLADDING_LAYER_COUNT = 1;
/** Nominal wall height used when the project has no wall height (metres). */
const CLADDING_LAYER_HEIGHT_M = 2.6;
const DEFAULT_CLADDING_HEIGHT_M = CLADDING_LAYER_COUNT * CLADDING_LAYER_HEIGHT_M;
const WINDOW_HEIGHT_M = 1.8;
const WINDOW_TOP_ABOVE_SUBFLOOR_M = 2.1;
const WINDOW_PANEL_THICKNESS_M = 0.005;
const WINDOW_PROUD_M = 0;
const WINDOW_COLOR = 0x9ec9d8;
const WINDOW_SURROUND_THICKNESS_M = 0.04;
const WINDOW_SURROUND_WIDTH_M = 0.07;
const WINDOW_FRAME_THICKNESS_M = 0.003;
const WINDOW_FRAME_WIDTH_M = 0.05;
const WINDOW_MULLION_WIDTH_M = 0.06;
const WINDOW_MULLION_MIN_WIDTH_M = 1.2;
// Windows at least this tall get a horizontal transom. It sits a third of the way
// up from the sill (bottom pane = height / 3, top pane = 2/3).
const WINDOW_TRANSOM_MIN_HEIGHT_M = 1.5;
const WINDOW_TRANSOM_SPLIT_FRACTION = 1 / 3;
const WINDOW_SURROUND_OUTLINE_COLOR = 0x202124;

const RENDER_TIME_OF_DAY_OPTIONS = [
  { value: "morning", label: "Morning" },
  { value: "late_afternoon", label: "Late Afternoon" },
  { value: "evening", label: "Evening" },
];

const DOOR_HEIGHT_M = 2.1;
/** Thin door leaf for external doors (inset into cladding). */
const DOOR_PANEL_THICKNESS_M = 0.01;
/** Internal door leaf fills the full 100 mm wall thickness (no reveal frame). */
const INTERNAL_DOOR_PANEL_THICKNESS_M = 0.1;
/** Pull door face outlines slightly off each wall face to avoid z-fighting. */
const INTERNAL_DOOR_OUTLINE_EPS_M = 0.002;
/** Door outer face sits this far behind the cladding face. */
const DOOR_INSET_M = 0.07;
/** Pull the door slightly proud of the notch back face to avoid z-fighting. */
const DOOR_INSET_CLEARANCE_M = 0.005;
/** Four glass lights: 100 mm high, door width minus 100 mm each side, first at 300 mm up. */
const DOOR_GLASS_COUNT = 4;
const DOOR_GLASS_HEIGHT_M = 0.1;
const DOOR_GLASS_SIDE_MARGIN_M = 0.1;
const DOOR_GLASS_FIRST_BOTTOM_M = 0.3;
const DOOR_GLASS_TOP_MARGIN_M = 0.3;
/** Sliding doors wider than this get two vertical frame dividers instead of one. */
const SLIDING_DOOR_DOUBLE_MULLION_MIN_WIDTH_M = 2.7;

const SUBFLOOR_LAYER_IDS = [
  BUILDING_3D_PARTS.SUBFLOOR_LAYER_1,
  BUILDING_3D_PARTS.SUBFLOOR_LAYER_2,
  BUILDING_3D_PARTS.SUBFLOOR_LAYER_3,
];

const DECK_LAYER_IDS = [
  BUILDING_3D_PARTS.DECK_LAYER_1,
  BUILDING_3D_PARTS.DECK_LAYER_2,
  BUILDING_3D_PARTS.DECK_LAYER_3,
];

function clampPositiveScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

function xzRingToShapePath(ring, { asHole = false } = {}) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3) return null;
  const pts = asHole ? [...clean].reverse() : clean;
  const path = asHole ? new THREE.Path() : new THREE.Shape();
  path.moveTo(pts[0].x, -pts[0].z);
  for (let i = 1; i < pts.length; i += 1) {
    path.lineTo(pts[i].x, -pts[i].z);
  }
  path.closePath();
  return path;
}

function assignFloorFinishUVs(geometry, moduleWidthM, moduleHeightM, originX, originZ) {
  const pos = geometry.getAttribute("position");
  if (!pos) return;
  const w = moduleWidthM > 1e-9 ? moduleWidthM : 1;
  const h = moduleHeightM > 1e-9 ? moduleHeightM : 1;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uvs[i * 2] = (pos.getX(i) - originX) / w;
    uvs[i * 2 + 1] = (pos.getZ(i) - originZ) / h;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

/** Thin floor finish slab (optional holes) on top of the subfloor. */
function buildFloorFinishGeometry(outerRing, holeRings, bottomYM, thicknessM) {
  const shape = xzRingToShapePath(outerRing, { asHole: false });
  if (!shape || !(thicknessM > 0)) return null;
  for (const holeRing of holeRings || []) {
    const hole = xzRingToShapePath(holeRing, { asHole: true });
    if (hole) shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thicknessM,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottomYM, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function loadFloorTextureFromUrl(url) {
  return fetchAuthedImageBlobUrl(url).then(async (blobUrl) => {
    if (!blobUrl) return null;
    const image = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = blobUrl;
    });
    if (!image) return null;
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  });
}

function addFloorFinishMesh(parent, {
  partId,
  outerRing,
  holeRings = [],
  yM,
  texture = null,
  fallbackColor,
  moduleWidthM,
  moduleHeightM,
  originX = 0,
  originZ = 0,
}) {
  const geometry = buildFloorFinishGeometry(
    outerRing,
    holeRings,
    yM,
    FLOOR_FINISH_THICKNESS_M
  );
  if (!geometry) return false;
  assignFloorFinishUVs(geometry, moduleWidthM, moduleHeightM, originX, originZ);
  const material = new THREE.MeshStandardMaterial({
    map: texture || null,
    color: texture ? 0xffffff : fallbackColor,
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = partId;
  mesh.userData = { partId, partType: "floor-finish" };
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

function resolveRegionXZRings(regions, referencePoints, calibration) {
  return parseFlooringRegions(regions)
    .map((region) =>
      resolveAlignedTraceRing(region.points, referencePoints, calibration).ring
    )
    .filter((ring) => ring.length >= 3);
}

function addFootprintSlab(parent, {
  partId,
  partType,
  layerNumber,
  ring,
  bottomY,
  topY,
  color,
  roughness,
  metalness,
  map = null,
  outlineColor = 0x202124,
  extraUserData = {},
  /** When set, extrude a hollow wall band of this thickness instead of a solid slab. */
  wallThicknessM = null,
}) {
  const hollow = Number(wallThicknessM) > 0;
  const geometry = hollow
    ? buildFootprintWallBandGeometry(ring, bottomY, topY, wallThicknessM)
    : buildFootprintSlabGeometry(ring, bottomY, topY);
  if (!geometry) return false;

  const material = new THREE.MeshStandardMaterial({
    map: map || null,
    color: map ? 0xffffff : color,
    roughness,
    metalness,
    // Double-sided so the inner face of hollow cladding is visible from inside.
    side: hollow ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = partId;
  mesh.userData = {
    partId,
    partType,
    layerNumber,
    heightM: topY - bottomY,
    ...(hollow ? { wallThicknessM } : {}),
    ...extraUserData,
  };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  const outlineGeometry = hollow
    ? buildFootprintWallBandOutlineGeometry(ring, bottomY, topY, wallThicknessM)
    : buildFootprintSlabOutlineGeometry(ring, bottomY, topY);
  if (outlineGeometry && outlineColor != null) {
    const outline = new THREE.LineSegments(
      outlineGeometry,
      new THREE.LineBasicMaterial({ color: outlineColor })
    );
    outline.name = `${partId}-outline`;
    parent.add(outline);
  }

  return true;
}

/** Affordable dual-fall battens (B1–B5 pyramid) on top of the roof slab. */
function addAffordableEaveBattens(parent, { ring, ridgeAxis, slabTopY }) {
  const stations = affordableBattenStations(ring, ridgeAxis, AFFORDABLE_ROOF_PITCH_DEG);
  if (!stations.length) return false;
  const texture = createFramingTimberTexture();
  const material = createFramingTimberMaterial(texture);
  let added = 0;
  stations.forEach((station, index) => {
    const parts = affordableBattenParts(station.type);
    if (!parts.length) return;
    const spans = clipAxisSpansToRing(
      station.alongX,
      station.cross,
      station.minRun,
      station.maxRun,
      ring
    );
    if (!spans.length) return;
    spans.forEach((span, spanIndex) => {
      const runLength = span.end - span.start;
      if (runLength < 0.05) return;
      const runCenter = (span.start + span.end) / 2;
      parts.forEach((part, partIndex) => {
        const across = station.mirror ? -part.across : part.across;
        const geometry = station.alongX
          ? new THREE.BoxGeometry(runLength, part.h, part.w)
          : new THREE.BoxGeometry(part.w, part.h, runLength);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          station.alongX ? runCenter : station.cross + across,
          Number(slabTopY) + part.y,
          station.alongX ? station.cross + across : runCenter
        );
        mesh.name = `${BUILDING_3D_PARTS.ROOF}-batten-${station.type}-${index + 1}-${spanIndex + 1}-${partIndex + 1}`;
        mesh.userData = {
          partId: BUILDING_3D_PARTS.ROOF,
          partType: "roof-eave-batten",
          battenType: station.type,
          widthM: part.w,
          thickM: part.h,
          lengthM: runLength,
        };
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        added += 1;
      });
    });
  });
  return added > 0;
}

/** Corrugated sheet draped over the affordable batten pyramid (dual 3° falls). */
function addAffordableRoofSheet(parent, { ring, ridgeAxis, slabTopY, color }) {
  try {
  const data = buildAffordableRoofSheetMeshData(
    ring,
    ridgeAxis,
    slabTopY,
    AFFORDABLE_ROOF_PITCH_DEG
  );
  if (!data) return 0;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  const corrugated = createCorrugatedRoofTexture();
  corrugated.repeat.set(1, 1);
  const material = new THREE.MeshStandardMaterial({
    map: corrugated,
    color,
    roughness: 0.42,
    metalness: 0.35,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${BUILDING_3D_PARTS.ROOF}-affordable-sheet`;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.ROOF,
    partType: "affordable-roof-sheet",
    pitchDeg: AFFORDABLE_ROOF_PITCH_DEG,
    riseM: data.maxRiseM,
  };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  if (data.outline?.length) {
    const outlineGeom = new THREE.BufferGeometry();
    outlineGeom.setAttribute("position", new THREE.BufferAttribute(data.outline, 3));
    const outline = new THREE.LineSegments(
      outlineGeom,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
      })
    );
    outline.name = `${BUILDING_3D_PARTS.ROOF}-affordable-sheet-outline`;
    parent.add(outline);
  }
  return data.maxRiseM;
  } catch (err) {
    console.error("addAffordableRoofSheet failed", err);
    return 0;
  }
}

function colorbondTrimMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.42,
    side: THREE.DoubleSide,
  });
}

/** 100×100 ColorBond gutters along both eaves (low side of each fall). */
function addAffordableEaveGutters(parent, { ring, ridgeAxis, slabTopY, color }) {
  const parts = affordableGutterChannelParts(
    ring,
    ridgeAxis,
    slabTopY,
    AFFORDABLE_ROOF_PITCH_DEG
  );
  if (!parts.length) return false;
  const material = colorbondTrimMaterial(color);
  parts.forEach((part, index) => {
    const geometry = new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    mesh.name = `${BUILDING_3D_PARTS.ROOF}-gutter-${index + 1}`;
    mesh.userData = {
      partId: BUILDING_3D_PARTS.ROOF,
      partType: "affordable-roof-gutter",
      sizeM: 0.1,
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
  return true;
}

/** Gable barge / end panels covering batten ends on both gables. */
function addAffordableGableEndPanels(parent, { ring, ridgeAxis, slabTopY, color }) {
  const data = buildAffordableGableEndPanelMeshData(
    ring,
    ridgeAxis,
    slabTopY,
    AFFORDABLE_ROOF_PITCH_DEG
  );
  if (!data) return false;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, colorbondTrimMaterial(color));
  mesh.name = `${BUILDING_3D_PARTS.ROOF}-gable-barge`;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.ROOF,
    partType: "affordable-roof-gable-barge",
  };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

/** 5 mm drop plate under each cutaway gutter, down to the slab soffit. */
function addAffordableCutawayFascia(parent, { sheetRing, roofRing, ridgeAxis, slabTopY, color }) {
  const parts = affordableCutawayFasciaParts(
    sheetRing,
    roofRing,
    ridgeAxis,
    slabTopY,
    AFFORDABLE_ROOF_PITCH_DEG
  );
  if (!parts.length) return false;
  const material = colorbondTrimMaterial(color);
  parts.forEach((part, index) => {
    const geometry = new THREE.BoxGeometry(part.size.x, part.size.y, part.size.z);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(part.position.x, part.position.y, part.position.z);
    mesh.name = `${BUILDING_3D_PARTS.ROOF}-cutaway-fascia-${index + 1}`;
    mesh.userData = {
      partId: BUILDING_3D_PARTS.ROOF,
      partType: "affordable-roof-cutaway-fascia",
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
  return true;
}

/** Single rectangular slab: building length × width × slab height, centred on origin. */
function addSubfloorSlabCube(parent, { widthM, depthM, heightM, color, roughness, metalness }) {
  const slabW = Math.max(0.1, Number(widthM) || DEFAULT_BUILDING_3D.widthM);
  const slabD = Math.max(0.1, Number(depthM) || DEFAULT_BUILDING_3D.depthM);
  const slabH = Math.max(0.01, Number(heightM) || DEFAULT_BUILDING_3D.slabHeightM);
  const geometry = new THREE.BoxGeometry(slabW, slabH, slabD);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = BUILDING_3D_PARTS.SUBFLOOR_SLAB;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.SUBFLOOR_SLAB,
    partType: "subfloor-slab",
    widthM: slabW,
    depthM: slabD,
    heightM: slabH,
  };
  mesh.position.set(0, slabH / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x202124 })
  );
  outline.name = `${BUILDING_3D_PARTS.SUBFLOOR_SLAB}-outline`;
  mesh.add(outline);
  return true;
}

function axisGridPositions(lengthM, maxSpanM, sizeM, edgeInsetM = 0) {
  const len = Math.max(sizeM, Number(lengthM) || sizeM);
  const span = Math.max(sizeM, Number(maxSpanM) || sizeM);
  const inset = Math.max(0, Number(edgeInsetM) || 0);
  const first = -len / 2 + sizeM / 2 + inset;
  const last = len / 2 - sizeM / 2 - inset;
  const run = Math.max(0, last - first);
  if (run < 1e-6) return [0];
  const steps = Math.max(1, Math.ceil(run / span - 1e-9));
  const step = run / steps;
  const out = [];
  for (let i = 0; i <= steps; i += 1) out.push(first + i * step);
  return out;
}

/**
 * Joist centres are exact (not stretched). Leftover length is split equally
 * at both ends so the set stays centred.
 * Example: 4.7 m building, 0.45 m centres → 10 spaces (4.5 m) and 0.2 m leftover
 * → 0.1 m at each end. Double joists sit at both building edges.
 */
function joistLayoutPositions(lengthM, centresM, joistWidthM) {
  const len = Math.max(0.3, Number(lengthM) || 0);
  const centres = Math.max(0.2, Number(centresM) || DEFAULT_BUILDING_3D.joistCentresM);
  const width = Math.max(0.02, Number(joistWidthM) || DEFAULT_BUILDING_3D.joistWidthM);
  const half = len / 2;
  const nSpaces = Math.max(0, Math.floor(len / centres + 1e-9));
  const leftover = len - nSpaces * centres;
  const offset = leftover / 2;
  const singles = [];
  for (let i = 0; i <= nSpaces; i += 1) {
    singles.push(Math.round((-half + offset + i * centres) * 1000) / 1000);
  }
  const minC = -half + width / 2;
  const maxC = half - width / 2;
  const extraBeside = (pos, towardNegative) => {
    const towardEdge = towardNegative ? pos - width : pos + width;
    if (towardEdge >= minC - 1e-9 && towardEdge <= maxC + 1e-9) {
      return Math.round(towardEdge * 1000) / 1000;
    }
    const towardInside = towardNegative ? pos + width : pos - width;
    if (towardInside >= minC - 1e-9 && towardInside <= maxC + 1e-9) {
      return Math.round(towardInside * 1000) / 1000;
    }
    return null;
  };
  const extras = [];
  if (singles.length) {
    extras.push(extraBeside(singles[0], true));
    extras.push(extraBeside(singles[singles.length - 1], false));
  }
  const seen = new Set();
  const out = [];
  for (const p of [...singles, ...extras]) {
    if (p == null || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  out.sort((a, b) => a - b);
  return out.length ? out : [0];
}

/**
 * 600 mm centres (max) between two existing studs. Spacing is even and
 * recentred in the bay so no gap is over 600 mm (corner→jamb or jamb→jamb).
 */
function fillStudsBetween(startM, endM, centresM) {
  const a = Number(startM);
  const b = Number(endM);
  const span = b - a;
  const centres = Math.max(0.2, Number(centresM) || FRAME_STUD_CENTRES_M);
  if (!(span > centres + 1e-6)) return [];
  const nSpaces = Math.max(2, Math.ceil(span / centres - 1e-9));
  const pitch = span / nSpaces;
  const out = [];
  for (let i = 1; i < nSpaces; i += 1) {
    out.push(Math.round((a + i * pitch) * 1000) / 1000);
  }
  return out;
}

const WINDOW_WALL_ALIGN_MIN = 0.85;
const WINDOW_WALL_MAX_PERP_M = 0.35;

function windowsToLocalFrame(windows, originX, originZ, rotationY) {
  if (!Array.isArray(windows) || !windows.length) return [];
  const c = Math.cos(rotationY || 0);
  const s = Math.sin(rotationY || 0);
  return windows.map((win) => {
    const dx = (win.midX || 0) - originX;
    const dz = (win.midZ || 0) - originZ;
    return {
      ...win,
      midX: dx * c - dz * s,
      midZ: dx * s + dz * c,
      dirX: (win.dirX || 0) * c - (win.dirZ || 0) * s,
      dirZ: (win.dirX || 0) * s + (win.dirZ || 0) * c,
    };
  });
}

/** Opening spans along a wall plate, in plate-local X (0 at the plate centre). */
function openingsAlongWall(items, originX, originZ, dirX, dirZ, plateLenM, defaultHeightM, kind) {
  if (!Array.isArray(items) || !items.length) return [];
  const halfPlate = Math.max(0, Number(plateLenM) || 0) / 2;
  const openings = [];
  for (const item of items) {
    const lengthM = Number(item?.lengthM);
    if (!(lengthM > 0.05)) continue;
    const wdx = Number(item.dirX) || 0;
    const wdz = Number(item.dirZ) || 0;
    const align = Math.abs(wdx * dirX + wdz * dirZ);
    if (align < WINDOW_WALL_ALIGN_MIN) continue;
    const vx = (item.midX || 0) - originX;
    const vz = (item.midZ || 0) - originZ;
    const along = vx * dirX + vz * dirZ;
    const perp = vx * dirZ - vz * dirX;
    if (Math.abs(perp) > WINDOW_WALL_MAX_PERP_M) continue;
    const jambOutset =
      kind === "door" || kind === "sliding-door"
        ? FRAME_SWING_DOOR_JAMB_OUTSET_M
        : 0;
    const alongHalf =
      kind === "window" ? (lengthM / 2) * align : lengthM / 2 + jambOutset;
    if (Math.abs(along) > halfPlate + alongHalf + 0.15) continue;
    const min = along - alongHalf;
    const max = along + alongHalf;
    if (max - min < 0.05) continue;
    const heightM = Number(item.heightM);
    openings.push({
      min,
      max,
      kind: kind || "window",
      heightM: Number.isFinite(heightM) && heightM > 0 ? heightM : defaultHeightM,
    });
  }
  return openings;
}

function wallFrameOpenings(
  windows,
  doors,
  slidingDoors,
  originX,
  originZ,
  dirX,
  dirZ,
  plateLenM
) {
  return [
    ...openingsAlongWall(
      windows,
      originX,
      originZ,
      dirX,
      dirZ,
      plateLenM,
      WINDOW_HEIGHT_M,
      "window"
    ),
    ...openingsAlongWall(
      doors,
      originX,
      originZ,
      dirX,
      dirZ,
      plateLenM,
      DOOR_HEIGHT_M,
      "door"
    ),
    ...openingsAlongWall(
      slidingDoors,
      originX,
      originZ,
      dirX,
      dirZ,
      plateLenM,
      DOOR_HEIGHT_M,
      "sliding-door"
    ),
  ];
}

function isWallDoorOpening(op) {
  return op?.kind === "door" || op?.kind === "sliding-door";
}

/** Bottom-plate runs with swing and sliding doorways cut out. Local X, 0 at plate centre. */
function plateRunsSkippingDoorOpenings(plateLenM, openings) {
  const half = Math.max(0, Number(plateLenM) || 0) / 2;
  if (!(half > 0)) return [];
  const cuts = [];
  for (const op of openings || []) {
    if (!isWallDoorOpening(op)) continue;
    const min = Math.max(-half, Number(op.min));
    const max = Math.min(half, Number(op.max));
    if (max - min > 0.02) cuts.push({ min, max });
  }
  cuts.sort((a, b) => a.min - b.min);
  const merged = [];
  for (const cut of cuts) {
    const last = merged[merged.length - 1];
    if (last && cut.min <= last.max + 0.01) {
      last.max = Math.max(last.max, cut.max);
    } else {
      merged.push({ min: cut.min, max: cut.max });
    }
  }
  const runs = [];
  let cursor = -half;
  for (const cut of merged) {
    if (cut.min - cursor > 0.02) {
      runs.push({
        along: Math.round(((cursor + cut.min) / 2) * 1000) / 1000,
        length: Math.round((cut.min - cursor) * 1000) / 1000,
      });
    }
    cursor = Math.max(cursor, cut.max);
  }
  if (half - cursor > 0.02) {
    runs.push({
      along: Math.round(((cursor + half) / 2) * 1000) / 1000,
      length: Math.round((half - cursor) * 1000) / 1000,
    });
  }
  return runs;
}

/** 600 mm centres in a window bay; one centred cripple if the opening is under 600 mm. */
function fillCrippleStuds(leftJambM, rightJambM, centresM, faceM) {
  const filled = fillStudsBetween(leftJambM, rightJambM, centresM);
  if (filled.length) return filled;
  const span = Number(rightJambM) - Number(leftJambM);
  const face = Math.max(0.02, Number(faceM) || FRAME_TIMBER_FACE_M);
  if (span > face * 2.5) {
    return [Math.round(((Number(leftJambM) + Number(rightJambM)) / 2) * 1000) / 1000];
  }
  return [];
}

/**
 * Sill + head plates, cripples below the sill, cripples above the head plate,
 * then a 45×140 mm treated-pine lintel centred on the stud, hard under the
 * double top plate, overhanging the opening by 200 mm each side.
 * Local `along` is plate-local X.
 */
function windowLintelSpan(op, plateLenM, bearingM) {
  const bearing = Number(bearingM) > 0 ? Number(bearingM) : FRAME_WINDOW_LINTEL_BEARING_M;
  const half = Math.max(0, Number(plateLenM) || 0) / 2 || 50;
  const mid = (op.min + op.max) / 2;
  const halfLen = (op.max - op.min) / 2 + bearing;
  const lo = Math.max(-half, mid - halfLen);
  const hi = Math.min(half, mid + halfLen);
  return { along: (lo + hi) / 2, length: Math.max(0, hi - lo) };
}

function windowAboveOpeningLayout({ floorY, wallH, face, windowHeadAboveFloorM }) {
  const timberFace = Math.max(0.02, Number(face) || FRAME_TIMBER_FACE_M);
  const studClearH = Math.max(0.05, Number(wallH) - timberFace * 3);
  const bottomPlateTopY = Number(floorY) + timberFace;
  const topPlateUndersideY = Number(floorY) + timberFace + studClearH;
  const headY =
    Number(floorY) +
    (Number(windowHeadAboveFloorM) > 0.2
      ? Number(windowHeadAboveFloorM)
      : WINDOW_TOP_ABOVE_SUBFLOOR_M);
  const lintelH = FRAME_WINDOW_LINTEL_HEIGHT_M;
  const headPlateTopY = headY + timberFace;
  const room = topPlateUndersideY - headPlateTopY;
  let lintelActualH = 0;
  let lintelBottom = topPlateUndersideY;
  if (headY + timberFace < topPlateUndersideY - 0.01 && room > 0.03) {
    lintelActualH =
      room > lintelH + 0.04 ? lintelH : Math.round(room * 1000) / 1000;
    lintelBottom = topPlateUndersideY - lintelActualH;
  }
  return {
    timberFace,
    bottomPlateTopY,
    topPlateUndersideY,
    headY,
    headPlateTopY,
    lintelActualH,
    lintelBottom,
  };
}

/**
 * Side infill between the door leaf and jambs. Optional 20 mm head bar sits
 * under the door head plate and spans the two sides (a U, not a fill to the lintel).
 */
function addDoorJambInfill(group, {
  door,
  rotY,
  halfLen,
  halfHeight,
  doorCenterY,
  doorBottomY,
  color,
  name,
  partType,
  includeHead = true,
}) {
  const infill = FRAME_SWING_DOOR_JAMB_OUTSET_M;
  const infillDepth = FRAME_TIMBER_DEPTH_M;
  const infillOffset = -FRAME_TIMBER_DEPTH_M / 2;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.05,
  });

  const placeInfill = (mesh, along, y) => {
    mesh.position.set(
      door.midX + door.dirX * along + door.normalX * infillOffset,
      y,
      door.midZ + door.dirZ * along + door.normalZ * infillOffset
    );
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const openingH = halfHeight * 2;
  const sideH = includeHead ? Math.max(openingH - infill, infill) : openingH;
  const sideY = includeHead ? doorBottomY + sideH / 2 : doorCenterY;
  const sideGeo = new THREE.BoxGeometry(infill, sideH, infillDepth);
  [-1, 1].forEach((side, i) => {
    const mesh = new THREE.Mesh(sideGeo, material);
    mesh.name = `${name}-side-${i + 1}`;
    mesh.userData = { partId: mesh.name, partType };
    placeInfill(mesh, side * (halfLen + infill / 2), sideY);
  });

  if (!includeHead) return;

  const doorTopY = doorBottomY + openingH;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(2 * (halfLen + infill), infill, infillDepth),
    material
  );
  head.name = `${name}-head`;
  head.userData = { partId: head.name, partType };
  placeInfill(head, 0, doorTopY - infill / 2);
}

/** Exterior architrave: one U (sides + head, no sill) on the weatherboard face. */
function addDoorUSurround(group, {
  door,
  rotY,
  halfLen,
  halfHeight,
  doorCenterY,
  color,
  name,
  partType,
}) {
  const band = WINDOW_SURROUND_WIDTH_M;
  const thickness = WINDOW_SURROUND_THICKNESS_M;
  const surroundBackM = WEATHERBOARD_FRAME_GAP_M + WEATHERBOARD_THICKNESS_M;
  const depthOffset = surroundBackM + thickness / 2;
  const outer = halfLen + band;
  const inner = halfLen;
  const bottom = -halfHeight;
  const innerTop = halfHeight;
  const outerTop = halfHeight + band;

  const shape = new THREE.Shape();
  shape.moveTo(-outer, bottom);
  shape.lineTo(-inner, bottom);
  shape.lineTo(-inner, innerTop);
  shape.lineTo(inner, innerTop);
  shape.lineTo(inner, bottom);
  shape.lineTo(outer, bottom);
  shape.lineTo(outer, outerTop);
  shape.lineTo(-outer, outerTop);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  );
  mesh.name = name;
  mesh.userData = { partId: name, partType };
  mesh.position.set(
    door.midX + door.normalX * depthOffset,
    doorCenterY,
    door.midZ + door.normalZ * depthOffset
  );
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const hz = thickness / 2;
  const ring = [
    [-outer, bottom],
    [-inner, bottom],
    [-inner, innerTop],
    [inner, innerTop],
    [inner, bottom],
    [outer, bottom],
    [outer, outerTop],
    [-outer, outerTop],
  ];
  const outlinePos = [];
  const pushSeg = (ax, ay, az, bx, by, bz) => {
    outlinePos.push(ax, ay, az, bx, by, bz);
  };
  for (const z of [-hz, hz]) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      pushSeg(a[0], a[1], z, b[0], b[1], z);
    }
  }
  for (const [x, y] of ring) {
    pushSeg(x, y, -hz, x, y, hz);
  }
  const outlineGeo = new THREE.BufferGeometry();
  outlineGeo.setAttribute("position", new THREE.Float32BufferAttribute(outlinePos, 3));
  const outline = new THREE.LineSegments(
    outlineGeo,
    new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
  );
  outline.name = `${name}-outline`;
  outline.userData = { partId: outline.name, partType: `${partType}-outline` };
  mesh.add(outline);
  group.add(mesh);
}

function partitionStudsForLintels(studLocals, openings, plateLenM, faceM) {
  const bearing = FRAME_WINDOW_LINTEL_BEARING_M;
  const full = [];
  const jacks = [];
  for (const pos of studLocals || []) {
    const under = (openings || []).some((op) => {
      const span = windowLintelSpan(op, plateLenM, bearing);
      const half = span.length / 2;
      return pos >= span.along - half - 0.01 && pos <= span.along + half + 0.01;
    });
    if (under) jacks.push(pos);
    else full.push(pos);
  }
  return { full, jacks };
}

function windowOpeningFrameLocalPieces({
  openings,
  floorY,
  wallH,
  face,
  depth,
  windowHeadAboveFloorM,
  plateLenM,
  studCentresM = FRAME_STUD_CENTRES_M,
}) {
  const pieces = [];
  const list = Array.isArray(openings) ? openings : [];
  if (!list.length) return pieces;
  const timberFace = Math.max(0.02, Number(face) || FRAME_TIMBER_FACE_M);
  const timberDepth = Math.max(0.02, Number(depth) || FRAME_TIMBER_DEPTH_M);
  const layout = windowAboveOpeningLayout({
    floorY,
    wallH,
    face: timberFace,
    windowHeadAboveFloorM,
  });
  const {
    bottomPlateTopY,
    topPlateUndersideY,
    headY,
    headPlateTopY,
    lintelActualH,
    lintelBottom,
  } = layout;
  const lintelThick = FRAME_WINDOW_LINTEL_THICKNESS_M;
  const centres = Math.max(0.2, Number(studCentresM) || FRAME_STUD_CENTRES_M);
  const bearing = FRAME_WINDOW_LINTEL_BEARING_M;

  for (const op of list) {
    const openingLen = op.max - op.min;
    if (!(openingLen > 0.05)) continue;
    const mid = (op.min + op.max) / 2;
    const height = op.heightM > 0 ? op.heightM : WINDOW_HEIGHT_M;
    const sillY = headY - height;
    const leftJamb = op.min - timberFace / 2;
    const rightJamb = op.max + timberFace / 2;
    const pushHorizontal = (y, sy) => {
      pieces.push({
        along: mid,
        y,
        sxAlong: openingLen,
        sy,
        szDepth: timberDepth,
      });
    };

    const isDoor = isWallDoorOpening(op);
    if (!isDoor && sillY - timberFace > bottomPlateTopY + 0.01) {
      pushHorizontal(sillY - timberFace / 2, timberFace);
      const belowH = Math.round((sillY - timberFace - bottomPlateTopY) * 1000) / 1000;
      if (belowH > 0.02) {
        const belowY = bottomPlateTopY + belowH / 2;
        for (const along of fillCrippleStuds(leftJamb, rightJamb, centres, timberFace)) {
          pieces.push({
            along,
            y: belowY,
            sxAlong: timberFace,
            sy: belowH,
            szDepth: timberDepth,
          });
        }
      }
    }

    if (headY + timberFace < topPlateUndersideY - 0.01) {
      pushHorizontal(headY + timberFace / 2, timberFace);
      if (lintelActualH > 0.03) {
        const span = windowLintelSpan(op, plateLenM, bearing);
        pieces.push({
          along: span.along,
          y: lintelBottom + lintelActualH / 2,
          sxAlong: span.length,
          sy: lintelActualH,
          szDepth: lintelThick,
          treated: true,
        });
        const aboveH = Math.round((lintelBottom - headPlateTopY) * 1000) / 1000;
        if (aboveH > 0.02) {
          const aboveY = headPlateTopY + aboveH / 2;
          for (const along of fillCrippleStuds(leftJamb, rightJamb, centres, timberFace)) {
            pieces.push({
              along,
              y: aboveY,
              sxAlong: timberFace,
              sy: aboveH,
              szDepth: timberDepth,
            });
          }
        }
      }
    }
  }
  return pieces;
}

function mapWindowFramePiecesToWall(localPieces, { originX, originZ, dirX, dirZ, rotationY }) {
  return (localPieces || []).map((p) => ({
    x: originX + dirX * p.along,
    y: p.y,
    z: originZ + dirZ * p.along,
    sx: p.sxAlong,
    sy: p.sy,
    sz: p.szDepth,
    rotationY: rotationY || 0,
    treated: p.treated,
  }));
}

function mapWindowFramePiecesAxisAligned(localPieces, { alongX, wallX, wallZ }) {
  return (localPieces || []).map((p) =>
    alongX
      ? {
          x: p.along,
          y: p.y,
          z: wallZ,
          sx: p.sxAlong,
          sy: p.sy,
          sz: p.szDepth,
          treated: p.treated,
        }
      : {
          x: wallX,
          y: p.y,
          z: p.along,
          sx: p.szDepth,
          sy: p.sy,
          sz: p.sxAlong,
          treated: p.treated,
        }
  );
}

function mergeStudPositions(positions, faceM, plateLenM) {
  const face = Math.max(0.02, Number(faceM) || FRAME_TIMBER_FACE_M);
  const half = Math.max(face, Number(plateLenM) || 0) / 2;
  const minC = Math.round((-half + face / 2) * 1000) / 1000;
  const maxC = Math.round((half - face / 2) * 1000) / 1000;
  const mergeTol = 0.02;
  const sorted = [...positions]
    .map((p) => Math.round(Number(p) * 1000) / 1000)
    .filter((p) => Number.isFinite(p))
    .sort((a, b) => a - b);
  const out = [];
  for (const p of sorted) {
    const clamped = Math.max(minC, Math.min(maxC, p));
    if (out.length && Math.abs(out[out.length - 1] - clamped) < mergeTol) continue;
    out.push(clamped);
  }
  return out.length ? out : [0];
}

/** Corner/end studs plus window jambs; centres recentred in each solid bay. */
function layoutWallStuds(plateLenM, centresM, studFaceM, openings = [], extraFixed = []) {
  const face = Math.max(0.02, Number(studFaceM) || FRAME_TIMBER_FACE_M);
  const centres = Math.max(0.2, Number(centresM) || FRAME_STUD_CENTRES_M);
  const halfFace = face / 2;
  const half = Math.max(face, Number(plateLenM) || 0) / 2;
  const minC = -half + halfFace;
  const maxC = half - halfFace;
  const jambs = (Array.isArray(openings) ? openings : []).flatMap((op) => [
    op.min - halfFace,
    op.max + halfFace,
  ]);
  const extra = (Array.isArray(extraFixed) ? extraFixed : [])
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p));
  const fixed = mergeStudPositions([minC, maxC, ...jambs, ...extra], face, plateLenM);
  const filled = [...fixed];
  for (let i = 0; i < fixed.length - 1; i += 1) {
    const a = fixed[i];
    const b = fixed[i + 1];
    const isWindowBay = (Array.isArray(openings) ? openings : []).some(
      (op) => a < op.max - 0.01 && b > op.min + 0.01
    );
    if (isWindowBay) continue;
    filled.push(...fillStudsBetween(a, b, centres));
  }
  return mergeStudPositions(filled, face, plateLenM);
}

function noggingBaysSkippingWindowOpenings(studPositions, faceM, openings) {
  const bays = noggingBaysBetweenStuds(studPositions, faceM);
  if (!Array.isArray(openings) || !openings.length) return bays;
  return bays.filter((bay) => {
    const bayMin = bay.center - bay.length / 2;
    const bayMax = bay.center + bay.length / 2;
    return !openings.some((op) => bayMin < op.max - 0.01 && bayMax > op.min + 0.01);
  });
}

/** Horizontal noggings between consecutive studs, staggered so they meet at mid-wall. */
function noggingBaysBetweenStuds(studPositions, faceM) {
  const face = Math.max(0.02, Number(faceM) || FRAME_TIMBER_FACE_M);
  const bays = [];
  for (let i = 0; i < studPositions.length - 1; i += 1) {
    const a = studPositions[i];
    const b = studPositions[i + 1];
    const length = Math.abs(b - a) - face;
    if (length < face) continue;
    bays.push({
      center: Math.round(((a + b) / 2) * 1000) / 1000,
      length: Math.round(length * 1000) / 1000,
      staggerSign: i % 2 === 0 ? 1 : -1,
    });
  }
  return bays;
}

function pointInFootprintRing(x, z, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const crosses = zi > z !== zj > z;
    if (!crosses) continue;
    const atX = ((xj - xi) * (z - zi)) / (zj - zi || 1e-12) + xi;
    if (x < atX) inside = !inside;
  }
  return inside;
}

/** Keep only the parts of an axis-aligned run that sit inside the footprint. */
function clipAxisSpansToRing(alongX, cross, minRun, maxRun, ring) {
  const lo = Number(minRun);
  const hi = Number(maxRun);
  if (!(hi > lo) || !Array.isArray(ring) || ring.length < 3) {
    return hi > lo ? [{ start: lo, end: hi }] : [];
  }
  const hits = [lo, hi];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];
    const aC = alongX ? a.z : a.x;
    const bC = alongX ? b.z : b.x;
    const aR = alongX ? a.x : a.z;
    const bR = alongX ? b.x : b.z;
    if (aC > cross === bC > cross) continue;
    const run = aR + ((cross - aC) / (bC - aC || 1e-12)) * (bR - aR);
    if (run > lo + 1e-6 && run < hi - 1e-6) hits.push(run);
  }
  hits.sort((a, b) => a - b);
  const uniq = [];
  for (const h of hits) {
    if (!uniq.length || h - uniq[uniq.length - 1] > 0.001) uniq.push(h);
  }
  const spans = [];
  for (let i = 0; i < uniq.length - 1; i += 1) {
    const start = uniq[i];
    const end = uniq[i + 1];
    if (end - start < 0.1) continue;
    const mid = (start + end) / 2;
    const x = alongX ? mid : cross;
    const z = alongX ? cross : mid;
    if (!pointInFootprintRing(x, z, ring)) continue;
    const last = spans[spans.length - 1];
    if (last && Math.abs(start - last.end) < 0.002) {
      last.end = end;
    } else {
      spans.push({ start, end });
    }
  }
  return spans;
}

function mergeCrossAnchors(items, tolM = 0.04) {
  if (!Array.isArray(items) || items.length < 1) return [];
  const sorted = [...items].sort((a, b) => a.cross - b.cross);
  const groups = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && item.cross - last.cross < tolM) {
      const w = last.weight + item.len;
      last.cross = (last.cross * last.weight + item.cross * item.len) / (w || 1);
      last.weight = w;
      last.len += item.len;
      if (item.len > last.bestLen) {
        last.inward = item.inward;
        last.bestLen = item.len;
      }
    } else {
      groups.push({
        cross: item.cross,
        inward: item.inward,
        len: item.len,
        weight: item.len,
        bestLen: item.len,
      });
    }
  }
  return groups.map((g) => ({
    cross: Math.round(g.cross * 1000) / 1000,
    inward: g.inward < 0 ? -1 : 1,
  }));
}

/** Footprint edges parallel to the bearer run (red / purple lines). */
function longEdgeCrossPositions(ring, alongX) {
  const items = [];
  for (const e of footprintRingEdges(ring)) {
    const aligned = alongX ? Math.abs(e.dirX) >= 0.95 : Math.abs(e.dirZ) >= 0.95;
    if (!aligned) continue;
    const inwardRaw = alongX ? e.inZ : e.inX;
    items.push({
      cross: alongX ? e.midZ : e.midX,
      inward: inwardRaw >= 0 ? 1 : -1,
      len: e.len,
    });
  }
  return mergeCrossAnchors(items);
}

/** Footprint edges square to the bearers (joist-end walls). */
function shortEdgeRunPositions(ring, alongX) {
  const items = [];
  for (const e of footprintRingEdges(ring)) {
    const aligned = alongX ? Math.abs(e.dirZ) >= 0.95 : Math.abs(e.dirX) >= 0.95;
    if (!aligned) continue;
    const inwardRaw = alongX ? e.inX : e.inZ;
    items.push({
      cross: alongX ? e.midX : e.midZ,
      inward: inwardRaw >= 0 ? 1 : -1,
      len: e.len,
    });
  }
  return mergeCrossAnchors(items);
}

/** Green runs: even spaces between consecutive red/purple anchors, within max span. */
function fillCrossRows(anchors, maxSpanM) {
  const span = Math.max(0.3, Number(maxSpanM) || DEFAULT_BUILDING_3D.bearerSpanMaxM);
  const out = [];
  for (let i = 0; i < anchors.length; i += 1) {
    out.push({ cross: anchors[i].cross, inward: anchors[i].inward });
    if (i >= anchors.length - 1) continue;
    const a = anchors[i].cross;
    const b = anchors[i + 1].cross;
    const gap = b - a;
    if (gap < 0.12) continue;
    const nSpaces = Math.max(1, Math.ceil(gap / span - 1e-9));
    const step = gap / nSpaces;
    for (let k = 1; k < nSpaces; k += 1) {
      out.push({
        cross: Math.round((a + k * step) * 1000) / 1000,
        inward: 0,
      });
    }
  }
  return out;
}

function spanGridPositions(start, end, maxSpanM, sizeM, endInsetM = 0) {
  const size = Math.max(0.02, Number(sizeM) || 0.1);
  const span = Math.max(size, Number(maxSpanM) || size);
  const inset = Math.max(0, Number(endInsetM) || 0);
  const first = start + size / 2 + inset;
  const last = end - size / 2 - inset;
  if (!(last >= first - 1e-6)) {
    return [Math.round(((start + end) / 2) * 1000) / 1000];
  }
  const run = last - first;
  const steps = Math.max(1, Math.ceil(run / span - 1e-9));
  const step = run / steps;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push(Math.round((first + i * step) * 1000) / 1000);
  }
  return out;
}

function joistPositionsFromBays(wallPositions, centresM, joistWidthM) {
  const walls = [...new Set((wallPositions || []).map((p) => Math.round(p * 1000) / 1000))]
    .sort((a, b) => a - b);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < walls.length - 1; i += 1) {
    const a = walls[i];
    const b = walls[i + 1];
    const len = b - a;
    if (len < 0.3) continue;
    const mid = (a + b) / 2;
    for (const local of joistLayoutPositions(len, centresM, joistWidthM)) {
      const p = Math.round((local + mid) * 1000) / 1000;
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

function megaAnchorOutwardSign(site, bearersAlongX) {
  if (Number.isFinite(Number(site?.inward)) && Number(site.inward) !== 0) {
    return -Math.sign(site.inward);
  }
  return bearersAlongX ? (site?.zi === 0 ? -1 : 1) : (site?.xi === 0 ? -1 : 1);
}

/**
 * Bearer rows on every long footprint edge, then intermediates to max span.
 * Stumps follow each row's clipped run; joists are laid out wall-to-wall per bay.
 */
function layoutFootprintFraming(ring, {
  widthM,
  depthM,
  bearerSpanMaxM,
  joistSpanMaxM,
  joistCentresM,
  joistWidthM,
  stumpSize,
  acrossInset,
  alongInset,
}) {
  const bearerAxis = bearerRunAxis(widthM, depthM);
  const alongX = bearerAxis !== "z";
  const rawAnchors = longEdgeCrossPositions(ring, alongX);
  if (rawAnchors.length < 2) return null;

  const offset =
    Math.max(0, Number(stumpSize) || 0) / 2 + Math.max(0, Number(acrossInset) || 0);
  const insetAnchors = mergeCrossAnchors(
    rawAnchors.map((a) => ({
      cross: a.cross + a.inward * offset,
      inward: a.inward,
      len: 1,
    })),
    0.08
  );
  if (insetAnchors.length < 2) return null;
  const bearerRows = fillCrossRows(insetAnchors, bearerSpanMaxM);
  const bounds = footprintBounds(ring);
  const minRun = alongX ? bounds.minX : bounds.minZ;
  const maxRun = alongX ? bounds.maxX : bounds.maxZ;
  const sites = [];
  for (const row of bearerRows) {
    const spans = clipAxisSpansToRing(alongX, row.cross, minRun, maxRun, ring);
    for (const span of spans) {
      for (const along of spanGridPositions(
        span.start,
        span.end,
        joistSpanMaxM,
        stumpSize,
        alongInset
      )) {
        sites.push({
          x: alongX ? along : row.cross,
          z: alongX ? row.cross : along,
          inward: row.inward,
        });
      }
    }
  }
  if (sites.length < 1) return null;

  const shortAnchors = shortEdgeRunPositions(ring, alongX);
  let joistCross = joistPositionsFromBays(
    shortAnchors.map((a) => a.cross),
    joistCentresM,
    joistWidthM
  );
  if (joistCross.length < 2) {
    const runM = alongX ? widthM : depthM;
    joistCross = joistLayoutPositions(runM, joistCentresM, joistWidthM);
  }

  return { bearerAxis, alongX, bearerRows, sites, joistCross };
}

/** Outer-face edges with inward normals (winding, so L re-entrant walls stay correct). */
function footprintRingEdges(ring) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length < 3) return [];
  const edges = [];
  for (let i = 0; i < clean.length; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % clean.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const dirX = dx / len;
    const dirZ = dz / len;
    const inward = footprintEdgeInwardXZ(dirX, dirZ, clean);
    const inX = inward.x;
    const inZ = inward.z;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    let rotationY = Math.atan2(-dirZ, dirX);
    if (-dirZ * inX + dirX * inZ < 0) rotationY += Math.PI;
    edges.push({ a, b, len, dirX, dirZ, inX, inZ, midX, midZ, rotationY });
  }
  return edges;
}

/**
 * Axis-aligned or rotated rectangle from a 4-sided footprint.
 * Axis-aligned traces keep world X = length and Z = width (no 90° swap).
 * Rotated rectangles put the longer sides on local +X.
 */
function orientedRectangleFromRing(ring) {
  const clean = sanitizeFootprintRing(ring);
  if (clean.length !== 4) return null;
  const edges = [];
  for (let i = 0; i < 4; i += 1) {
    const a = clean[i];
    const b = clean[(i + 1) % 4];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return null;
    edges.push({ dx: dx / len, dz: dz / len, len });
  }
  for (let i = 0; i < 4; i += 1) {
    const dot =
      edges[i].dx * edges[(i + 1) % 4].dx + edges[i].dz * edges[(i + 1) % 4].dz;
    if (Math.abs(dot) > 0.15) return null;
  }
  if (Math.abs(edges[0].len - edges[2].len) > 0.2) return null;
  if (Math.abs(edges[1].len - edges[3].len) > 0.2) return null;
  const cx = (clean[0].x + clean[1].x + clean[2].x + clean[3].x) / 4;
  const cz = (clean[0].z + clean[1].z + clean[2].z + clean[3].z) / 4;
  const axisAligned = edges.every(
    (e) => Math.abs(e.dx) > 0.98 || Math.abs(e.dz) > 0.98
  );
  if (axisAligned) {
    const bounds = footprintBounds(clean);
    return {
      widthM: bounds.widthM,
      depthM: bounds.depthM,
      x: cx,
      z: cz,
      rotationY: 0,
    };
  }
  const len0 = (edges[0].len + edges[2].len) / 2;
  const len1 = (edges[1].len + edges[3].len) / 2;
  const longFirst = len0 >= len1;
  const long = longFirst ? edges[0] : edges[1];
  return {
    widthM: longFirst ? len0 : len1,
    depthM: longFirst ? len1 : len0,
    x: cx,
    z: cz,
    rotationY: Math.atan2(-long.dz, long.dx),
  };
}

function stumpGridSites(xs, zs, clipRing) {
  const sites = [];
  for (let xi = 0; xi < xs.length; xi += 1) {
    for (let zi = 0; zi < zs.length; zi += 1) {
      const x = xs[xi];
      const z = zs[zi];
      if (clipRing && !pointInFootprintRing(x, z, clipRing)) continue;
      sites.push({ x, z, xi, zi });
    }
  }
  return sites;
}

/** Bearer/joist span grid. Concrete stumps are 100×100 mm cubes; mega-anchors are 50 mm cylinders. */
function addConcreteStumpGrid(parent, {
  widthM,
  depthM,
  subfloorHeightM,
  bearerHeightM,
  joistHeightM,
  bearerWidthM,
  joistWidthM,
  bearerSpanMaxM,
  joistSpanMaxM,
  joistCentresM,
  style = "concrete_stumps",
  clipRing = null,
}) {
  const isMegaAnchors = style === "mega_anchors";
  const gridSize = CONCRETE_STUMP_SIZE_M;
  const diameter = MEGA_ANCHOR_DIAMETER_M;
  const stackHeight = concreteStumpHeightM({
    subfloorHeightM,
    bearerHeightM,
    joistHeightM,
  });
  const plateThick = isMegaAnchors ? MEGA_ANCHOR_PLATE_THICKNESS_M : 0;
  const height = isMegaAnchors
    ? Math.max(plateThick, stackHeight - plateThick)
    : stackHeight;
  const bearerAxis = bearerRunAxis(widthM, depthM);
  const alongInset = isMegaAnchors ? OUTER_STUMP_END_INSET_M : 0;
  const acrossInset = isMegaAnchors ? OUTER_BEARER_INSET_M : 0;
  const footprintLayout = clipRing
    ? layoutFootprintFraming(clipRing, {
        widthM,
        depthM,
        bearerSpanMaxM,
        joistSpanMaxM,
        joistCentresM,
        joistWidthM,
        stumpSize: isMegaAnchors ? diameter : gridSize,
        acrossInset,
        alongInset,
      })
    : null;
  const xs = footprintLayout
    ? []
    : axisGridPositions(
        widthM,
        bearerAxis === "x" ? bearerSpanMaxM : joistSpanMaxM,
        gridSize,
        bearerAxis === "x" ? alongInset : acrossInset
      );
  const zs = footprintLayout
    ? []
    : axisGridPositions(
        depthM,
        bearerAxis === "z" ? bearerSpanMaxM : joistSpanMaxM,
        gridSize,
        bearerAxis === "z" ? alongInset : acrossInset
      );
  let sites = footprintLayout
    ? footprintLayout.sites
    : stumpGridSites(xs, zs, clipRing);
  if (sites.length < 1) sites = stumpGridSites(xs, zs, null);
  const count = sites.length;
  if (count < 1) return false;

  const geometry = isMegaAnchors
    ? new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 20)
    : new THREE.BoxGeometry(gridSize, height, gridSize);
  const material = new THREE.MeshStandardMaterial(
    isMegaAnchors
      ? { color: 0x8e949a, roughness: 0.38, metalness: 0.62 }
      : { color: 0xb8b6b1, roughness: 0.94, metalness: 0.02 }
  );
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = BUILDING_3D_PARTS.SUBFLOOR_STUMPS;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.SUBFLOOR_STUMPS,
    partType: isMegaAnchors ? "mega-anchors" : "concrete-stumps",
    sizeM: isMegaAnchors ? diameter : gridSize,
    heightM: height,
    count,
  };
  const dummy = new THREE.Object3D();
  let index = 0;
  for (const site of sites) {
    dummy.position.set(site.x, height / 2, site.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    index += 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const assembly = isMegaAnchors ? new THREE.Group() : parent;
  if (isMegaAnchors) {
    assembly.name = "mega-anchors";
    assembly.userData = {
      partId: BUILDING_3D_PARTS.SUBFLOOR_STUMPS,
      partType: "mega-anchors",
    };
    parent.add(assembly);
  }
  assembly.add(mesh);

  if (isMegaAnchors) {
    addMegaAnchorTopPlates(assembly, {
      xs,
      zs,
      sites,
      poleHeight: height,
      material,
      bearerAxis,
    });
    addMegaAnchorPiles(assembly, { xs, zs, sites, material, bearerAxis });
  }
  const bearerRows = footprintLayout
    ? footprintLayout.bearerRows.map((row) => row.cross)
    : bearerAxis === "x"
      ? zs
      : xs;
  const bearerCross = [];
  if (isMegaAnchors) {
    const bearerW = Math.max(0.02, Number(bearerWidthM) || DEFAULT_BUILDING_3D.bearerWidthM);
    const towardPlate = MEGA_ANCHOR_BEARER_TO_UPRIGHT_M;
    if (footprintLayout) {
      for (const row of footprintLayout.bearerRows) {
        const sign = row.inward === 0 ? 1 : -row.inward;
        const plated = row.cross + towardPlate * sign;
        bearerCross.push(plated, plated - bearerW * sign);
      }
    } else {
      for (let i = 0; i < bearerRows.length; i += 1) {
        const sign = i === 0 ? -1 : 1;
        const plated = bearerRows[i] + towardPlate * sign;
        bearerCross.push(plated, plated - bearerW * sign);
      }
    }
  } else {
    bearerCross.push(...bearerRows);
  }
  addBearerTimbers(parent, {
    widthM,
    depthM,
    bearerAxis,
    crossPositions: bearerCross,
    stackHeight,
    bearerHeightM,
    bearerWidthM,
    clipRing,
  });
  addJoistTimbers(parent, {
    widthM,
    depthM,
    bearerAxis,
    stackHeight,
    bearerHeightM,
    joistHeightM,
    joistWidthM,
    joistCentresM,
    clipRing,
    runPositions: footprintLayout?.joistCross ?? null,
  });
  return true;
}

/** Full-length timber bearers on the stump rows. Mega-anchors use a doubled pair toward the upright plate. */
function addBearerTimbers(parent, {
  widthM,
  depthM,
  bearerAxis,
  crossPositions,
  stackHeight,
  bearerHeightM,
  bearerWidthM,
  clipRing = null,
}) {
  const alongX = bearerAxis !== "z";
  const height = Math.max(0.02, Number(bearerHeightM) || DEFAULT_BUILDING_3D.bearerHeightM);
  const y = stackHeight + height / 2;
  return addFramingTimbers(parent, {
    partId: BUILDING_3D_PARTS.BEARERS,
    partType: "bearers",
    alongX,
    lengthM: alongX ? widthM : depthM,
    heightM: height,
    widthM: Math.max(0.02, Number(bearerWidthM) || DEFAULT_BUILDING_3D.bearerWidthM),
    y,
    crossPositions,
    clipRing,
  });
}

/** Joists sit on the bearers and run 90° to them, full short-side length. */
function addJoistTimbers(parent, {
  widthM,
  depthM,
  bearerAxis,
  stackHeight,
  bearerHeightM,
  joistHeightM,
  joistWidthM,
  joistCentresM,
  clipRing = null,
  runPositions = null,
}) {
  const alongX = bearerAxis === "z";
  const bearerH = Math.max(0.02, Number(bearerHeightM) || DEFAULT_BUILDING_3D.bearerHeightM);
  const height = Math.max(0.02, Number(joistHeightM) || DEFAULT_BUILDING_3D.joistHeightM);
  const joistW = Math.max(0.02, Number(joistWidthM) || DEFAULT_BUILDING_3D.joistWidthM);
  const y = stackHeight + bearerH + height / 2;
  const runM = bearerAxis === "x" ? widthM : depthM;
  const centres = Math.max(0.2, Number(joistCentresM) || DEFAULT_BUILDING_3D.joistCentresM);
  const crossPositions = Array.isArray(runPositions) && runPositions.length
    ? runPositions
    : joistLayoutPositions(runM, centres, joistW);
  return addFramingTimbers(parent, {
    partId: BUILDING_3D_PARTS.JOISTS,
    partType: "joists",
    alongX,
    lengthM: alongX ? widthM : depthM,
    heightM: height,
    widthM: joistW,
    y,
    crossPositions,
    clipRing,
  });
}

function addFramingTimbers(parent, {
  partId,
  partType,
  alongX,
  lengthM,
  heightM,
  widthM,
  y,
  crossPositions,
  clipRing = null,
}) {
  const length = Math.max(0.3, Number(lengthM) || 0);
  const height = Math.max(0.02, Number(heightM) || 0.02);
  const width = Math.max(0.02, Number(widthM) || 0.02);
  const rows = Array.isArray(crossPositions) ? crossPositions : [];
  if (!rows.length || length < 0.3) return false;

  const half = length / 2;
  const pieces = [];
  for (const p of rows) {
    const spans = clipRing
      ? clipAxisSpansToRing(alongX, p, -half, half, clipRing)
      : [{ start: -half, end: half }];
    for (const span of spans) {
      const runLength = span.end - span.start;
      if (runLength < 0.1) continue;
      pieces.push({
        runCenter: (span.start + span.end) / 2,
        runLength,
        cross: p,
      });
    }
  }
  const count = pieces.length;
  if (count < 1) return false;

  const geometry = alongX
    ? new THREE.BoxGeometry(1, height, width)
    : new THREE.BoxGeometry(width, height, 1);
  const texture = createFramingTimberTexture();
  texture.repeat.set(Math.max(1, length / 0.35), 1);
  const material = createFramingTimberMaterial(texture);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = partId;
  mesh.userData = {
    partId,
    partType,
    lengthM: length,
    heightM: height,
    widthM: width,
    count,
  };
  const dummy = new THREE.Object3D();
  pieces.forEach((piece, index) => {
    dummy.position.set(
      alongX ? piece.runCenter : piece.cross,
      y,
      alongX ? piece.cross : piece.runCenter
    );
    dummy.scale.set(
      alongX ? piece.runLength : 1,
      1,
      alongX ? 1 : piece.runLength
    );
    dummy.updateMatrix();
    dummy.scale.set(1, 1, 1);
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

/** 20 mm particleboard sheet: faces chipboard, edges yellow-tongue. Sits on the joists. */
function addStructuralFloor(parent, { widthM, depthM, subfloorHeightM, dropM = 0 }) {
  const thick = STRUCTURAL_FLOOR_THICKNESS_M;
  const length = Math.max(0.3, Number(widthM) || 0);
  const width = Math.max(0.3, Number(depthM) || 0);
  if (length < 0.3 || width < 0.3) return false;

  const geometry = new THREE.BoxGeometry(length, thick, width);
  const faceTexture = createParticleBoardTexture();
  faceTexture.repeat.set(Math.max(1, length / 0.35), Math.max(1, width / 0.35));
  const face = createParticleBoardMaterial(faceTexture);
  const edge = new THREE.MeshStandardMaterial({
    color: 0xf2d000,
    roughness: 0.48,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, [edge, edge, face, face, edge, edge]);
  mesh.name = BUILDING_3D_PARTS.STRUCTURAL_FLOOR;
  mesh.position.set(0, Number(subfloorHeightM) - Number(dropM || 0) + thick / 2, 0);
  mesh.userData = {
    partId: BUILDING_3D_PARTS.STRUCTURAL_FLOOR,
    partType: "structural-floor",
    widthM: length,
    depthM: width,
    thicknessM: thick,
  };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

function baseboardRowCount(subfloorHeightM) {
  const cover = Math.max(BASEBOARD_HEIGHT_M, Number(subfloorHeightM) || 0);
  let n = 1;
  while (n * BASEBOARD_HEIGHT_M + (n - 1) * BASEBOARD_GAP_M + 1e-9 < cover) n += 1;
  return n;
}

/** 200×19 mm boards, 25 mm gaps, top-aligned to subfloor.
 * Short sides run the full building width plus both long-board thicknesses so corners meet.
 * Long sides run the building length and butt into the short boards. */
function addBaseboards(parent, { widthM, depthM, subfloorHeightM, color }) {
  const length = Math.max(0.3, Number(widthM) || 0);
  const width = Math.max(0.3, Number(depthM) || 0);
  const thick = BASEBOARD_THICKNESS_M;
  const boardH = BASEBOARD_HEIGHT_M;
  const gap = BASEBOARD_GAP_M;
  const topY = Number(subfloorHeightM) || 0;
  const rows = baseboardRowCount(topY);
  const longAlongX = length >= width;
  const shortDim = longAlongX ? width : length;
  const longDim = longAlongX ? length : width;
  const shortBoardLen = shortDim + 2 * thick;
  const longBoardLen = longDim;
  if (shortBoardLen < 0.05 || longBoardLen < 0.05) return false;

  const group = new THREE.Group();
  group.name = BUILDING_3D_PARTS.BASEBOARDS;
  group.userData = {
    partId: BUILDING_3D_PARTS.BASEBOARDS,
    partType: "baseboards",
    thicknessM: thick,
    boardHeightM: boardH,
    gapM: gap,
    rows,
  };
  const material = new THREE.MeshStandardMaterial({
    color: color || 0x8a8680,
    roughness: 0.78,
    metalness: 0.05,
  });
  const addBoard = (sx, sy, sz, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(x, y, z);
    mesh.userData = {
      partId: BUILDING_3D_PARTS.BASEBOARDS,
      partType: "baseboards",
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  for (let i = 0; i < rows; i += 1) {
    const y = topY - i * (boardH + gap) - boardH / 2;
    if (longAlongX) {
      addBoard(thick, boardH, shortBoardLen, length / 2 + thick / 2, y, 0);
      addBoard(thick, boardH, shortBoardLen, -(length / 2 + thick / 2), y, 0);
      addBoard(longBoardLen, boardH, thick, 0, y, width / 2 + thick / 2);
      addBoard(longBoardLen, boardH, thick, 0, y, -(width / 2 + thick / 2));
    } else {
      addBoard(shortBoardLen, boardH, thick, 0, y, width / 2 + thick / 2);
      addBoard(shortBoardLen, boardH, thick, 0, y, -(width / 2 + thick / 2));
      addBoard(thick, boardH, longBoardLen, length / 2 + thick / 2, y, 0);
      addBoard(thick, boardH, longBoardLen, -(length / 2 + thick / 2), y, 0);
    }
  }
  parent.add(group);
  return true;
}

function applyPlanarUVsFromXZ(geometry, tileM = 0.35) {
  const pos = geometry.getAttribute("position");
  if (!pos) return;
  const uvs = new Float32Array(pos.count * 2);
  const pitch = Math.max(0.05, Number(tileM) || 0.35);
  for (let i = 0; i < pos.count; i += 1) {
    uvs[i * 2] = pos.getX(i) / pitch;
    uvs[i * 2 + 1] = pos.getZ(i) / pitch;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function addSubfloorSlabFromRing(parent, { ring, heightM, color, roughness, metalness }) {
  const slabH = Math.max(0.01, Number(heightM) || DEFAULT_BUILDING_3D.slabHeightM);
  return addFootprintSlab(parent, {
    partId: BUILDING_3D_PARTS.SUBFLOOR_SLAB,
    partType: "subfloor-slab",
    ring,
    bottomY: 0,
    topY: slabH,
    color,
    roughness,
    metalness,
  });
}

function addStructuralFloorFromRing(parent, { ring, subfloorHeightM, dropM = 0 }) {
  const thick = STRUCTURAL_FLOOR_THICKNESS_M;
  const bottomY = Number(subfloorHeightM) - Number(dropM || 0);
  const topY = bottomY + thick;
  const geometry = buildFootprintSlabGeometry(ring, bottomY, topY);
  if (!geometry) return false;
  applyPlanarUVsFromXZ(geometry, 0.35);
  const faceTexture = createParticleBoardTexture();
  const mesh = new THREE.Mesh(geometry, createParticleBoardMaterial(faceTexture));
  mesh.name = BUILDING_3D_PARTS.STRUCTURAL_FLOOR;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.STRUCTURAL_FLOOR,
    partType: "structural-floor",
    thicknessM: thick,
  };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

function addBaseboardsAlongRing(parent, { ring, subfloorHeightM, color }) {
  const edges = footprintRingEdges(ring);
  const thick = BASEBOARD_THICKNESS_M;
  const boardH = BASEBOARD_HEIGHT_M;
  const gap = BASEBOARD_GAP_M;
  const topY = Number(subfloorHeightM) || 0;
  const rows = baseboardRowCount(topY);
  if (!edges.length || rows < 1) return false;

  const group = new THREE.Group();
  group.name = BUILDING_3D_PARTS.BASEBOARDS;
  group.userData = {
    partId: BUILDING_3D_PARTS.BASEBOARDS,
    partType: "baseboards",
    thicknessM: thick,
    boardHeightM: boardH,
    gapM: gap,
    rows,
  };
  const material = new THREE.MeshStandardMaterial({
    color: color || 0x8a8680,
    roughness: 0.78,
    metalness: 0.05,
  });
  edges.forEach((edge) => {
    const cx = edge.midX - edge.inX * (thick / 2);
    const cz = edge.midZ - edge.inZ * (thick / 2);
    for (let i = 0; i < rows; i += 1) {
      const y = topY - i * (boardH + gap) - boardH / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(edge.len, boardH, thick), material);
      mesh.position.set(cx, y, cz);
      mesh.rotation.y = edge.rotationY;
      mesh.userData = {
        partId: BUILDING_3D_PARTS.BASEBOARDS,
        partType: "baseboards",
      };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  });
  parent.add(group);
  return true;
}

function fillRectangularSubfloor(subfloor, {
  widthM,
  depthM,
  subfloorHeightM,
  resolvedSubfloorType,
  bearerHeightM,
  joistHeightM,
  bearerWidthM,
  joistWidthM,
  bearerSpanMaxM,
  joistSpanMaxM,
  joistCentresM,
  finishHex,
  clipRing = null,
}) {
  if (resolvedSubfloorType === "slab") {
    addSubfloorSlabCube(subfloor, {
      widthM,
      depthM,
      heightM: subfloorHeightM,
      color: finishHex.baseboards,
      roughness: 0.78,
      metalness: 0.05,
    });
  } else if (
    resolvedSubfloorType === "concrete_stumps" ||
    resolvedSubfloorType === "mega_anchors"
  ) {
    addConcreteStumpGrid(subfloor, {
      widthM,
      depthM,
      subfloorHeightM,
      bearerHeightM,
      joistHeightM,
      bearerWidthM,
      joistWidthM,
      bearerSpanMaxM,
      joistSpanMaxM,
      joistCentresM,
      style: resolvedSubfloorType,
      clipRing,
    });
  }
  if (resolvedSubfloorType === "slab") return;
  addStructuralFloor(subfloor, {
    widthM,
    depthM,
    subfloorHeightM,
    dropM:
      resolvedSubfloorType === "concrete_stumps" || resolvedSubfloorType === "mega_anchors"
        ? STRUCTURAL_FLOOR_THICKNESS_M
        : 0,
  });
  addBaseboards(subfloor, {
    widthM,
    depthM,
    subfloorHeightM,
    color: finishHex.baseboards,
  });
}

function populateSubfloorGroup(parent, {
  widthM,
  depthM,
  subfloorHeightM,
  resolvedSubfloorType,
  bearerHeightM,
  joistHeightM,
  bearerWidthM,
  joistWidthM,
  bearerSpanMaxM,
  joistSpanMaxM,
  joistCentresM,
  finishHex,
  ring = null,
}) {
  const clean = Array.isArray(ring) && ring.length >= 3 ? sanitizeFootprintRing(ring) : [];
  const rect = clean.length >= 3 ? orientedRectangleFromRing(clean) : null;
  const subfloor = new THREE.Group();
  subfloor.name = BUILDING_3D_PARTS.SUBFLOOR;
  subfloor.userData = {
    partId: BUILDING_3D_PARTS.SUBFLOOR,
    partType: "subfloor",
    subfloorType: resolvedSubfloorType,
    widthM: rect ? rect.widthM : widthM,
    depthM: rect ? rect.depthM : depthM,
    heightM: subfloorHeightM,
  };
  parent.add(subfloor);

  const shared = {
    subfloorHeightM,
    resolvedSubfloorType,
    bearerHeightM,
    joistHeightM,
    bearerWidthM,
    joistWidthM,
    bearerSpanMaxM,
    joistSpanMaxM,
    joistCentresM,
    finishHex,
  };

  if (rect) {
    subfloor.position.set(rect.x, 0, rect.z);
    subfloor.rotation.y = rect.rotationY;
    fillRectangularSubfloor(subfloor, {
      ...shared,
      widthM: rect.widthM,
      depthM: rect.depthM,
    });
    return;
  }

  if (clean.length >= 3) {
    const bounds = footprintBounds(clean);
    if (resolvedSubfloorType === "slab") {
      addSubfloorSlabFromRing(subfloor, {
        ring: clean,
        heightM: subfloorHeightM,
        color: finishHex.baseboards,
        roughness: 0.78,
        metalness: 0.05,
      });
    } else if (
      resolvedSubfloorType === "concrete_stumps" ||
      resolvedSubfloorType === "mega_anchors"
    ) {
      addConcreteStumpGrid(subfloor, {
        widthM: bounds.widthM,
        depthM: bounds.depthM,
        subfloorHeightM,
        bearerHeightM,
        joistHeightM,
        bearerWidthM,
        joistWidthM,
        bearerSpanMaxM,
        joistSpanMaxM,
        joistCentresM,
        style: resolvedSubfloorType,
        clipRing: clean,
      });
    }
    const dropM =
      resolvedSubfloorType === "concrete_stumps" || resolvedSubfloorType === "mega_anchors"
        ? STRUCTURAL_FLOOR_THICKNESS_M
        : 0;
    if (resolvedSubfloorType !== "slab") {
      addStructuralFloorFromRing(subfloor, {
        ring: clean,
        subfloorHeightM,
        dropM,
      });
      addBaseboardsAlongRing(subfloor, {
        ring: clean,
        subfloorHeightM,
        color: finishHex.baseboards,
      });
    }
    return;
  }

  fillRectangularSubfloor(subfloor, { ...shared, widthM, depthM });
}

function addFrameTimberBatch(parent, { sx, sy, sz, positions }) {
  const count = Array.isArray(positions) ? positions.length : 0;
  if (count < 1) return;
  const texture = createFramingTimberTexture();
  const longest = Math.max(sx, sy, sz);
  texture.repeat.set(Math.max(1, longest / 0.35), 1);
  const material = createFramingTimberMaterial(texture);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(sx, sy, sz), material, count);
  mesh.name = BUILDING_3D_PARTS.FRAME;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.FRAME,
    partType: "frame",
    count,
  };
  const dummy = new THREE.Object3D();
  positions.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(
      p.sx != null ? p.sx / sx : 1,
      p.sy != null ? p.sy / sy : 1,
      p.sz != null ? p.sz / sz : 1
    );
    dummy.updateMatrix();
    dummy.scale.set(1, 1, 1);
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

/**
 * 90×45 mm wall frame on the floor: bottom plate all around (cut at doors),
 * studs at 600 mm centres, double top plate. Window and door bays get jambs,
 * a head plate, cripples above, and a 45×140 mm lintel under the top plates.
 * Windows also get a sill and cripples below; doors sit on the floor.
 * Long plates run the building length and take the corners; short plates sit
 * between them.
 */
function addWallFrameRect(parent, {
  widthM,
  depthM,
  floorTopY,
  wallHeightM,
  asChildGroup = true,
  windows = [],
  doors = [],
  slidingDoors = [],
  windowHeadAboveFloorM,
}) {
  const lengthX = Math.max(0.3, Number(widthM) || 0);
  const widthZ = Math.max(0.3, Number(depthM) || 0);
  const depth = FRAME_TIMBER_DEPTH_M;
  const face = FRAME_TIMBER_FACE_M;
  const wallH = Math.max(face * 3 + 0.05, Number(wallHeightM) || DEFAULT_BUILDING_3D.wallHeightM);
  const floorY = Number(floorTopY) || 0;
  const studH = Math.max(0.05, Math.round((wallH - face * 3) * 1000) / 1000);
  const shortPlateLen = Math.max(face, widthZ - 2 * depth);
  if (lengthX < 0.3 || widthZ < 0.3 || shortPlateLen < face) return false;

  const group = asChildGroup ? new THREE.Group() : parent;
  if (asChildGroup) {
    group.name = BUILDING_3D_PARTS.FRAME;
    group.userData = {
      partId: BUILDING_3D_PARTS.FRAME,
      partType: "frame",
      timberDepthM: depth,
      timberFaceM: face,
      studCentresM: FRAME_STUD_CENTRES_M,
      wallHeightM: wallH,
      studHeightM: studH,
    };
  }

  const longZ = widthZ / 2 - depth / 2;
  const shortX = lengthX / 2 - depth / 2;
  const bottomY = floorY + face / 2;
  const studY = floorY + face + studH / 2;
  const top1Y = floorY + face + studH + face / 2;
  const top2Y = top1Y + face;

  const windowFrameOpts = {
    floorY,
    wallH,
    face,
    depth,
    windowHeadAboveFloorM,
  };
  const longOpenPos = wallFrameOpenings(
    windows,
    doors,
    slidingDoors,
    0,
    longZ,
    1,
    0,
    lengthX
  );
  const longOpenNeg = wallFrameOpenings(
    windows,
    doors,
    slidingDoors,
    0,
    -longZ,
    1,
    0,
    lengthX
  );
  const shortOpenPos = wallFrameOpenings(
    windows,
    doors,
    slidingDoors,
    shortX,
    0,
    0,
    1,
    shortPlateLen
  );
  const shortOpenNeg = wallFrameOpenings(
    windows,
    doors,
    slidingDoors,
    -shortX,
    0,
    0,
    1,
    shortPlateLen
  );

  const longPlates = [];
  const shortPlates = [];
  for (const y of [top1Y, top2Y]) {
    longPlates.push({ x: 0, y, z: longZ }, { x: 0, y, z: -longZ });
    shortPlates.push({ x: shortX, y, z: 0 }, { x: -shortX, y, z: 0 });
  }
  addFrameTimberBatch(group, {
    sx: lengthX,
    sy: face,
    sz: depth,
    positions: longPlates,
  });
  addFrameTimberBatch(group, {
    sx: depth,
    sy: face,
    sz: shortPlateLen,
    positions: shortPlates,
  });
  const longStudXsPos = layoutWallStuds(lengthX, FRAME_STUD_CENTRES_M, face, longOpenPos);
  const longStudXsNeg = layoutWallStuds(lengthX, FRAME_STUD_CENTRES_M, face, longOpenNeg);
  const shortStudZsPos = layoutWallStuds(
    shortPlateLen,
    FRAME_STUD_CENTRES_M,
    face,
    shortOpenPos
  );
  const shortStudZsNeg = layoutWallStuds(
    shortPlateLen,
    FRAME_STUD_CENTRES_M,
    face,
    shortOpenNeg
  );
  const aboveLayout = windowAboveOpeningLayout({
    floorY,
    wallH,
    face,
    windowHeadAboveFloorM,
  });
  const jackH = Math.round((aboveLayout.lintelBottom - aboveLayout.bottomPlateTopY) * 1000) / 1000;
  const jackY = aboveLayout.bottomPlateTopY + jackH / 2;
  const trimJacks = aboveLayout.lintelActualH > 0.03 && jackH > 0.05;
  const longPosParts = trimJacks
    ? partitionStudsForLintels(longStudXsPos, longOpenPos, lengthX, face)
    : { full: longStudXsPos, jacks: [] };
  const longNegParts = trimJacks
    ? partitionStudsForLintels(longStudXsNeg, longOpenNeg, lengthX, face)
    : { full: longStudXsNeg, jacks: [] };
  const shortPosParts = trimJacks
    ? partitionStudsForLintels(shortStudZsPos, shortOpenPos, shortPlateLen, face)
    : { full: shortStudZsPos, jacks: [] };
  const shortNegParts = trimJacks
    ? partitionStudsForLintels(shortStudZsNeg, shortOpenNeg, shortPlateLen, face)
    : { full: shortStudZsNeg, jacks: [] };
  const longStuds = [];
  for (const x of longPosParts.full) longStuds.push({ x, y: studY, z: longZ });
  for (const x of longNegParts.full) longStuds.push({ x, y: studY, z: -longZ });
  const shortStuds = [];
  for (const z of shortPosParts.full) shortStuds.push({ x: shortX, y: studY, z });
  for (const z of shortNegParts.full) shortStuds.push({ x: -shortX, y: studY, z });
  addFrameTimberBatch(group, {
    sx: face,
    sy: studH,
    sz: depth,
    positions: longStuds,
  });
  addFrameTimberBatch(group, {
    sx: depth,
    sy: studH,
    sz: face,
    positions: shortStuds,
  });

  const midY = floorY + wallH / 2;
  const stagger = FRAME_NOGGING_STAGGER_M;
  const noggingTexture = createFramingTimberTexture();
  const noggingMaterial = createFramingTimberMaterial(noggingTexture);
  const addNogging = (sx, sy, sz, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), noggingMaterial);
    mesh.position.set(x, y, z);
    mesh.name = BUILDING_3D_PARTS.FRAME;
    mesh.userData = { partId: BUILDING_3D_PARTS.FRAME, partType: "frame" };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  for (const bay of noggingBaysSkippingWindowOpenings(longStudXsPos, face, longOpenPos)) {
    addNogging(bay.length, face, depth, bay.center, midY + stagger * bay.staggerSign, longZ);
  }
  for (const bay of noggingBaysSkippingWindowOpenings(longStudXsNeg, face, longOpenNeg)) {
    addNogging(bay.length, face, depth, bay.center, midY - stagger * bay.staggerSign, -longZ);
  }
  for (const bay of noggingBaysSkippingWindowOpenings(shortStudZsPos, face, shortOpenPos)) {
    addNogging(depth, face, bay.length, shortX, midY + stagger * bay.staggerSign, bay.center);
  }
  for (const bay of noggingBaysSkippingWindowOpenings(shortStudZsNeg, face, shortOpenNeg)) {
    addNogging(depth, face, bay.length, -shortX, midY - stagger * bay.staggerSign, bay.center);
  }

  const bottomPlateLocals = (openings, plateLenM) =>
    plateRunsSkippingDoorOpenings(plateLenM, openings).map((run) => ({
      along: run.along,
      y: bottomY,
      sxAlong: run.length,
      sy: face,
      szDepth: depth,
    }));
  const windowPieces = [
    ...mapWindowFramePiecesAxisAligned(bottomPlateLocals(longOpenPos, lengthX), {
      alongX: true,
      wallX: 0,
      wallZ: longZ,
    }),
    ...mapWindowFramePiecesAxisAligned(bottomPlateLocals(longOpenNeg, lengthX), {
      alongX: true,
      wallX: 0,
      wallZ: -longZ,
    }),
    ...mapWindowFramePiecesAxisAligned(
      bottomPlateLocals(shortOpenPos, shortPlateLen),
      { alongX: false, wallX: shortX, wallZ: 0 }
    ),
    ...mapWindowFramePiecesAxisAligned(
      bottomPlateLocals(shortOpenNeg, shortPlateLen),
      { alongX: false, wallX: -shortX, wallZ: 0 }
    ),
    ...mapWindowFramePiecesAxisAligned(
      windowOpeningFrameLocalPieces({
        ...windowFrameOpts,
        openings: longOpenPos,
        plateLenM: lengthX,
      }),
      { alongX: true, wallX: 0, wallZ: longZ }
    ),
    ...mapWindowFramePiecesAxisAligned(
      windowOpeningFrameLocalPieces({
        ...windowFrameOpts,
        openings: longOpenNeg,
        plateLenM: lengthX,
      }),
      { alongX: true, wallX: 0, wallZ: -longZ }
    ),
    ...mapWindowFramePiecesAxisAligned(
      windowOpeningFrameLocalPieces({
        ...windowFrameOpts,
        openings: shortOpenPos,
        plateLenM: shortPlateLen,
      }),
      { alongX: false, wallX: shortX, wallZ: 0 }
    ),
    ...mapWindowFramePiecesAxisAligned(
      windowOpeningFrameLocalPieces({
        ...windowFrameOpts,
        openings: shortOpenNeg,
        plateLenM: shortPlateLen,
      }),
      { alongX: false, wallX: -shortX, wallZ: 0 }
    ),
  ];
  if (trimJacks) {
    for (const x of longPosParts.jacks) {
      windowPieces.push({ x, y: jackY, z: longZ, sx: face, sy: jackH, sz: depth });
    }
    for (const x of longNegParts.jacks) {
      windowPieces.push({ x, y: jackY, z: -longZ, sx: face, sy: jackH, sz: depth });
    }
    for (const z of shortPosParts.jacks) {
      windowPieces.push({ x: shortX, y: jackY, z, sx: depth, sy: jackH, sz: face });
    }
    for (const z of shortNegParts.jacks) {
      windowPieces.push({ x: -shortX, y: jackY, z, sx: depth, sy: jackH, sz: face });
    }
  }
  const treatedMaterial = createTreatedPineMaterial(createTreatedPineTexture());
  addFrameTimberPiecesSplit(group, noggingMaterial, treatedMaterial, windowPieces);

  if (asChildGroup) parent.add(group);
  return true;
}

function addFrameTimberPieces(parent, material, pieces, partId = BUILDING_3D_PARTS.FRAME) {
  const partType = partId === BUILDING_3D_PARTS.INTERNAL_WALLS ? "internal-walls" : "frame";
  pieces.forEach((p) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.sx, p.sy, p.sz), material);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.rotationY || 0;
    mesh.name = partId;
    mesh.userData = { partId, partType };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  });
}

function addFrameTimberPiecesSplit(
  parent,
  naturalMaterial,
  treatedMaterial,
  pieces,
  partId = BUILDING_3D_PARTS.FRAME
) {
  const natural = [];
  const treated = [];
  for (const p of pieces || []) {
    (p.treated ? treated : natural).push(p);
  }
  if (natural.length) addFrameTimberPieces(parent, naturalMaterial, natural, partId);
  if (treated.length) addFrameTimberPieces(parent, treatedMaterial, treated, partId);
}

/** Frame along each footprint wall: plates, 600 mm studs, staggered noggings. */
function addWallFrameAlongRing(parent, {
  ring,
  floorTopY,
  wallHeightM,
  windows = [],
  doors = [],
  slidingDoors = [],
  windowHeadAboveFloorM,
}) {
  const edges = footprintRingEdges(ring);
  const depth = FRAME_TIMBER_DEPTH_M;
  const face = FRAME_TIMBER_FACE_M;
  const wallH = Math.max(face * 3 + 0.05, Number(wallHeightM) || DEFAULT_BUILDING_3D.wallHeightM);
  const floorY = Number(floorTopY) || 0;
  const studH = Math.max(0.05, Math.round((wallH - face * 3) * 1000) / 1000);
  if (!edges.length) return false;

  const group = new THREE.Group();
  group.name = BUILDING_3D_PARTS.FRAME;
  group.userData = {
    partId: BUILDING_3D_PARTS.FRAME,
    partType: "frame",
    timberDepthM: depth,
    timberFaceM: face,
    studCentresM: FRAME_STUD_CENTRES_M,
    wallHeightM: wallH,
    studHeightM: studH,
  };

  const texture = createFramingTimberTexture();
  const material = createFramingTimberMaterial(texture);
  const bottomY = floorY + face / 2;
  const studY = floorY + face + studH / 2;
  const top1Y = floorY + face + studH + face / 2;
  const top2Y = top1Y + face;
  const midY = floorY + wallH / 2;
  const stagger = FRAME_NOGGING_STAGGER_M;
  const pieces = [];
  const aboveLayout = windowAboveOpeningLayout({
    floorY,
    wallH,
    face,
    windowHeadAboveFloorM,
  });
  const jackH = Math.round((aboveLayout.lintelBottom - aboveLayout.bottomPlateTopY) * 1000) / 1000;
  const jackY = aboveLayout.bottomPlateTopY + jackH / 2;
  const trimJacks = aboveLayout.lintelActualH > 0.03 && jackH > 0.05;

  edges.forEach((edge, edgeIndex) => {
    const wallPhase = edgeIndex % 2 === 0 ? 1 : -1;
    const cx = edge.midX + edge.inX * (depth / 2);
    const cz = edge.midZ + edge.inZ * (depth / 2);
    const { dirX, dirZ, rotationY, len } = edge;
    const openings = wallFrameOpenings(
      windows,
      doors,
      slidingDoors,
      cx,
      cz,
      dirX,
      dirZ,
      len
    );
    [top1Y, top2Y].forEach((y) => {
      pieces.push({
        sx: len,
        sy: face,
        sz: depth,
        x: cx,
        y,
        z: cz,
        rotationY,
      });
    });
    plateRunsSkippingDoorOpenings(len, openings).forEach((run) => {
      pieces.push({
        sx: run.length,
        sy: face,
        sz: depth,
        x: cx + dirX * run.along,
        y: bottomY,
        z: cz + dirZ * run.along,
        rotationY,
      });
    });
    const studLocals = layoutWallStuds(len, FRAME_STUD_CENTRES_M, face, openings);
    const studParts = trimJacks
      ? partitionStudsForLintels(studLocals, openings, len, face)
      : { full: studLocals, jacks: [] };
    studParts.full.forEach((localX) => {
      pieces.push({
        sx: face,
        sy: studH,
        sz: depth,
        x: cx + dirX * localX,
        y: studY,
        z: cz + dirZ * localX,
        rotationY,
      });
    });
    studParts.jacks.forEach((localX) => {
      pieces.push({
        sx: face,
        sy: jackH,
        sz: depth,
        x: cx + dirX * localX,
        y: jackY,
        z: cz + dirZ * localX,
        rotationY,
      });
    });
    noggingBaysSkippingWindowOpenings(studLocals, face, openings).forEach((bay) => {
      pieces.push({
        sx: bay.length,
        sy: face,
        sz: depth,
        x: cx + dirX * bay.center,
        y: midY + stagger * bay.staggerSign * wallPhase,
        z: cz + dirZ * bay.center,
        rotationY,
      });
    });
    pieces.push(
      ...mapWindowFramePiecesToWall(
        windowOpeningFrameLocalPieces({
          openings,
          floorY,
          wallH,
          face,
          depth,
          windowHeadAboveFloorM,
          plateLenM: len,
        }),
        { originX: cx, originZ: cz, dirX, dirZ, rotationY }
      )
    );
  });

  const treatedMaterial = createTreatedPineMaterial(createTreatedPineTexture());
  addFrameTimberPiecesSplit(group, material, treatedMaterial, pieces);
  parent.add(group);
  return true;
}

function internalWallJunctionLocals(startXZ, endXZ, len, dirX, dirZ, segmentsXZ, selfIndex) {
  const half = len / 2;
  const perpTol = FRAME_TIMBER_DEPTH_M * 0.75;
  const locals = [];
  (segmentsXZ || []).forEach((other, j) => {
    if (j === selfIndex || !other?.a || !other?.b) return;
    for (const pt of [other.a, other.b]) {
      const vx = pt.x - startXZ.x;
      const vz = pt.z - startXZ.z;
      const along = vx * dirX + vz * dirZ;
      const perp = vx * dirZ - vz * dirX;
      if (Math.abs(perp) > perpTol) continue;
      if (along < 0.08 || along > len - 0.08) continue;
      locals.push(along - half);
    }
  });
  return locals;
}

function internalDoorOpeningsOnSegment(doors, segmentIndex, len) {
  const half = len / 2;
  const outset = FRAME_SWING_DOOR_JAMB_OUTSET_M;
  return (doors || [])
    .filter((door) => door.segmentIndex === segmentIndex)
    .map((door) => ({
      min: door.along0 - half - outset,
      max: door.along1 - half + outset,
      kind: "door",
      heightM: DOOR_HEIGHT_M,
    }))
    .filter((op) => op.max - op.min > 0.05);
}

/**
 * Internal walls as 90×45 frames: bottom plate (cut at doors), 450 mm studs
 * with the same bay-recentring as the external frame, double top plate,
 * staggered noggings, and door jambs / lintels.
 */
function addInternalWallFrames(parent, {
  footprintPoints,
  segments,
  doors = [],
  calibration = null,
  floorTopY,
  wallHeightM,
}) {
  const mapping = getTracePlanXZMapping(footprintPoints, calibration);
  if (!mapping || !Array.isArray(segments) || !segments.length) return false;

  const depth = FRAME_TIMBER_DEPTH_M;
  const face = FRAME_TIMBER_FACE_M;
  const centres = INTERNAL_FRAME_STUD_CENTRES_M;
  const wallH = Math.max(face * 3 + 0.05, Number(wallHeightM) || DEFAULT_BUILDING_3D.wallHeightM);
  const floorY = Number(floorTopY) || 0;
  const studH = Math.max(0.05, Math.round((wallH - face * 3) * 1000) / 1000);

  const segmentsXZ = segments.map((seg) => ({
    a: seg?.a ? normalizedPointToXZ(seg.a, mapping) : null,
    b: seg?.b ? normalizedPointToXZ(seg.b, mapping) : null,
  }));

  const group = new THREE.Group();
  group.name = BUILDING_3D_PARTS.INTERNAL_WALLS;
  group.userData = {
    partId: BUILDING_3D_PARTS.INTERNAL_WALLS,
    partType: "internal-walls",
    timberDepthM: depth,
    timberFaceM: face,
    studCentresM: centres,
    wallHeightM: wallH,
    studHeightM: studH,
  };

  const texture = createFramingTimberTexture();
  const material = createFramingTimberMaterial(texture);
  const bottomY = floorY + face / 2;
  const studY = floorY + face + studH / 2;
  const top1Y = floorY + face + studH + face / 2;
  const top2Y = top1Y + face;
  const midY = floorY + wallH / 2;
  const stagger = FRAME_NOGGING_STAGGER_M;
  const pieces = [];
  const aboveLayout = windowAboveOpeningLayout({
    floorY,
    wallH,
    face,
    windowHeadAboveFloorM: DOOR_HEIGHT_M,
  });
  const jackH = Math.round((aboveLayout.lintelBottom - aboveLayout.bottomPlateTopY) * 1000) / 1000;
  const jackY = aboveLayout.bottomPlateTopY + jackH / 2;
  const trimJacks = aboveLayout.lintelActualH > 0.03 && jackH > 0.05;
  let built = 0;

  segmentsXZ.forEach((seg, index) => {
    if (!seg?.a || !seg?.b) return;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const len = Math.hypot(dx, dz);
    if (len < face * 2) return;
    const dirX = dx / len;
    const dirZ = dz / len;
    const cx = (seg.a.x + seg.b.x) / 2;
    const cz = (seg.a.z + seg.b.z) / 2;
    const rotationY = Math.atan2(-dirZ, dirX);
    const wallPhase = index % 2 === 0 ? 1 : -1;
    const openings = internalDoorOpeningsOnSegment(doors, index, len);
    const junctions = internalWallJunctionLocals(
      seg.a,
      seg.b,
      len,
      dirX,
      dirZ,
      segmentsXZ,
      index
    );

    [top1Y, top2Y].forEach((y) => {
      pieces.push({
        sx: len,
        sy: face,
        sz: depth,
        x: cx,
        y,
        z: cz,
        rotationY,
      });
    });
    plateRunsSkippingDoorOpenings(len, openings).forEach((run) => {
      pieces.push({
        sx: run.length,
        sy: face,
        sz: depth,
        x: cx + dirX * run.along,
        y: bottomY,
        z: cz + dirZ * run.along,
        rotationY,
      });
    });
    const studLocals = layoutWallStuds(len, centres, face, openings, junctions);
    const studParts = trimJacks
      ? partitionStudsForLintels(studLocals, openings, len, face)
      : { full: studLocals, jacks: [] };
    studParts.full.forEach((localX) => {
      pieces.push({
        sx: face,
        sy: studH,
        sz: depth,
        x: cx + dirX * localX,
        y: studY,
        z: cz + dirZ * localX,
        rotationY,
      });
    });
    studParts.jacks.forEach((localX) => {
      pieces.push({
        sx: face,
        sy: jackH,
        sz: depth,
        x: cx + dirX * localX,
        y: jackY,
        z: cz + dirZ * localX,
        rotationY,
      });
    });
    noggingBaysSkippingWindowOpenings(studLocals, face, openings).forEach((bay) => {
      pieces.push({
        sx: bay.length,
        sy: face,
        sz: depth,
        x: cx + dirX * bay.center,
        y: midY + stagger * bay.staggerSign * wallPhase,
        z: cz + dirZ * bay.center,
        rotationY,
      });
    });
    pieces.push(
      ...mapWindowFramePiecesToWall(
        windowOpeningFrameLocalPieces({
          openings,
          floorY,
          wallH,
          face,
          depth,
          windowHeadAboveFloorM: DOOR_HEIGHT_M,
          plateLenM: len,
          studCentresM: centres,
        }),
        { originX: cx, originZ: cz, dirX, dirZ, rotationY }
      )
    );
    built += 1;
  });

  if (!pieces.length || built < 1) return false;
  const treatedMaterial = createTreatedPineMaterial(createTreatedPineTexture());
  addFrameTimberPiecesSplit(
    group,
    material,
    treatedMaterial,
    pieces,
    BUILDING_3D_PARTS.INTERNAL_WALLS
  );
  group.userData.count = built;
  parent.add(group);
  return true;
}

function addWallFrame(parent, {
  widthM,
  depthM,
  floorTopY,
  wallHeightM,
  ring = null,
  windows = [],
  doors = [],
  slidingDoors = [],
  windowHeadAboveFloorM,
}) {
  const clean = Array.isArray(ring) && ring.length >= 3 ? sanitizeFootprintRing(ring) : [];
  const rect = clean.length >= 3 ? orientedRectangleFromRing(clean) : null;
  const resolvedWindows = Array.isArray(windows) ? windows : [];
  const resolvedDoors = Array.isArray(doors) ? doors : [];
  const resolvedSlidingDoors = Array.isArray(slidingDoors) ? slidingDoors : [];
  if (rect) {
    const holder = new THREE.Group();
    holder.name = BUILDING_3D_PARTS.FRAME;
    holder.userData = {
      partId: BUILDING_3D_PARTS.FRAME,
      partType: "frame",
    };
    holder.position.set(rect.x, 0, rect.z);
    holder.rotation.y = rect.rotationY;
    parent.add(holder);
    return addWallFrameRect(holder, {
      widthM: rect.widthM,
      depthM: rect.depthM,
      floorTopY,
      wallHeightM,
      asChildGroup: false,
      windows: windowsToLocalFrame(resolvedWindows, rect.x, rect.z, rect.rotationY),
      doors: windowsToLocalFrame(resolvedDoors, rect.x, rect.z, rect.rotationY),
      slidingDoors: windowsToLocalFrame(
        resolvedSlidingDoors,
        rect.x,
        rect.z,
        rect.rotationY
      ),
      windowHeadAboveFloorM,
    });
  }
  if (clean.length >= 3) {
    return addWallFrameAlongRing(parent, {
      ring: clean,
      floorTopY,
      wallHeightM,
      windows: resolvedWindows,
      doors: resolvedDoors,
      slidingDoors: resolvedSlidingDoors,
      windowHeadAboveFloorM,
    });
  }
  return addWallFrameRect(parent, {
    widthM,
    depthM,
    floorTopY,
    wallHeightM,
    windows: resolvedWindows,
    doors: resolvedDoors,
    slidingDoors: resolvedSlidingDoors,
    windowHeadAboveFloorM,
  });
}

/** 75×75×5 mm cap plus a matching plate stood on edge, parallel to the bearers. */
function addMegaAnchorTopPlates(parent, { xs, zs, sites, poleHeight, material, bearerAxis }) {
  const size = MEGA_ANCHOR_PLATE_SIZE_M;
  const thick = MEGA_ANCHOR_PLATE_THICKNESS_M;
  const points = Array.isArray(sites) && sites.length
    ? sites
    : xs.flatMap((x, xi) => zs.map((z, zi) => ({ x, z, xi, zi })));
  const count = points.length;
  if (count < 1) return false;

  const bearersAlongX = bearerAxis !== "z";
  const flatGeometry = new THREE.BoxGeometry(size, thick, size);
  const uprightGeometry = bearersAlongX
    ? new THREE.BoxGeometry(size, size, thick)
    : new THREE.BoxGeometry(thick, size, size);
  const flat = new THREE.InstancedMesh(flatGeometry, material, count);
  const upright = new THREE.InstancedMesh(uprightGeometry, material, count);
  flat.name = `${BUILDING_3D_PARTS.SUBFLOOR_STUMPS}-plates`;
  upright.name = `${BUILDING_3D_PARTS.SUBFLOOR_STUMPS}-plates-upright`;
  flat.userData = {
    partId: BUILDING_3D_PARTS.SUBFLOOR_STUMPS,
    partType: "mega-anchors",
    sizeM: size,
    thicknessM: thick,
    count,
  };
  upright.userData = {
    partId: BUILDING_3D_PARTS.SUBFLOOR_STUMPS,
    partType: "mega-anchors",
    sizeM: size,
    thicknessM: thick,
    count,
  };
  const dummy = new THREE.Object3D();
  const plateY = poleHeight + thick / 2;
  const uprightY = poleHeight + thick + size / 2;
  const edge = (size - thick) / 2;
  let index = 0;
  for (const site of points) {
    const x = site.x;
    const z = site.z;
    const sign = megaAnchorOutwardSign(site, bearersAlongX);
    dummy.position.set(x, plateY, z);
    dummy.updateMatrix();
    flat.setMatrixAt(index, dummy.matrix);
    dummy.position.set(
      bearersAlongX ? x : x + edge * sign,
      uprightY,
      bearersAlongX ? z + edge * sign : z
    );
    dummy.updateMatrix();
    upright.setMatrixAt(index, dummy.matrix);
    index += 1;
  }
  flat.instanceMatrix.needsUpdate = true;
  upright.instanceMatrix.needsUpdate = true;
  flat.castShadow = true;
  flat.receiveShadow = true;
  upright.castShadow = true;
  upright.receiveShadow = true;
  parent.add(flat);
  parent.add(upright);
  return true;
}

/** Three piles around each riser, 120° apart, driven into the ground; 70 mm shows above grade. */
function addMegaAnchorPiles(parent, { xs, zs, sites, material, bearerAxis }) {
  const visibleM = MEGA_ANCHOR_PILE_VISIBLE_M;
  const belowM = MEGA_ANCHOR_PILE_BELOW_M;
  const splay = MEGA_ANCHOR_PILE_TILT_RAD;
  const rake = MEGA_ANCHOR_PILE_RAKE_RAD;
  const pileDia = MEGA_ANCHOR_PILE_DIAMETER_M;
  const topY = visibleM;
  const bottomY = -belowM;
  const radiusTop = MEGA_ANCHOR_DIAMETER_M / 2 + pileDia / 2;
  const axisY = Math.cos(splay) * Math.cos(rake);
  const length = (topY - bottomY) / axisY;
  const points = Array.isArray(sites) && sites.length
    ? sites
    : xs.flatMap((x, xi) => zs.map((z, zi) => ({ x, z, xi, zi })));
  const count = points.length * 3;
  if (count < 1 || length < 0.05 || axisY < 0.2) return false;

  const geometry = new THREE.CylinderGeometry(pileDia / 2, pileDia / 2, length, 16);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = `${BUILDING_3D_PARTS.SUBFLOOR_STUMPS}-piles`;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.SUBFLOOR_STUMPS,
    partType: "mega-anchors",
    sizeM: pileDia,
    visibleM,
    belowM,
    count,
  };
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const bearersAlongX = bearerAxis !== "z";
  let index = 0;
  for (const site of points) {
    const x = site.x;
    const z = site.z;
    const flip = megaAnchorOutwardSign(site, bearersAlongX);
    for (let i = 0; i < 3; i += 1) {
        const yaw = (i * Math.PI * 2) / 3;
        let radialX = Math.sin(yaw);
        let radialZ = Math.cos(yaw);
        let tangentX = Math.cos(yaw);
        let tangentZ = -Math.sin(yaw);
        if (flip < 0) {
          if (bearersAlongX) {
            radialZ = -radialZ;
            tangentZ = -tangentZ;
          } else {
            radialX = -radialX;
            tangentX = -tangentX;
          }
        }
        axis.set(
          Math.cos(splay) * Math.sin(rake) * tangentX - Math.sin(splay) * radialX,
          axisY,
          Math.cos(splay) * Math.sin(rake) * tangentZ - Math.sin(splay) * radialZ
        );
        const topX = x + radiusTop * radialX;
        const topZ = z + radiusTop * radialZ;
        const botX = topX - axis.x * length;
        const botZ = topZ - axis.z * length;
        dummy.position.set((topX + botX) / 2, (topY + bottomY) / 2, (topZ + botZ) / 2);
        dummy.quaternion.setFromUnitVectors(up, axis);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

/** Thin timber-decking cap on the top face of a deck stack. */
function addDeckTopBoards(parent, ring, topY) {
  const geometry = buildFootprintSlabGeometry(
    ring,
    topY,
    topY + DECK_TOP_CAP_THICKNESS_M
  );
  if (!geometry) return false;

  const pos = geometry.getAttribute("position");
  if (pos) {
    const uvs = new Float32Array(pos.count * 2);
    assignTimberDeckUVs(pos.array, uvs, TIMBER_DECK_BOARD_PITCH_M);
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }

  const texture = createTimberDeckTexture();
  const material = createTimberDeckMaterial(texture);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = BUILDING_3D_PARTS.DECK_TOP;
  mesh.userData = {
    partId: BUILDING_3D_PARTS.DECK_TOP,
    partType: "deck-top",
    thicknessM: DECK_TOP_CAP_THICKNESS_M,
  };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return true;
}

function addCornerColumn(parent, {
  partId,
  partType,
  x,
  z,
  y,
  heightM,
  color,
  roughness,
  metalness,
  rotationY = 0,
}) {
  const geometry = new THREE.BoxGeometry(
    CORNER_COLUMN_SIZE_M,
    heightM,
    CORNER_COLUMN_SIZE_M
  );
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
  const column = new THREE.Mesh(geometry, material);
  column.name = partId;
  column.userData = {
    partId,
    partType,
    heightM,
    exteriorProjectionM: CORNER_COLUMN_PROJECTION_M,
  };
  column.position.set(x, y, z);
  column.rotation.y = rotationY;
  column.castShadow = true;
  column.receiveShadow = true;
  parent.add(column);

  // Child of the column so outline tracks position + wall-aligned rotation.
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x202124 })
  );
  outline.name = `${partId}-outline`;
  column.add(outline);
}

/**
 * Reusable building-model modal.
 *
 * Pass `footprintPoints` (normalized Trace Plan external polygon) to use that
 * shape. Otherwise the default rectangle is used.
 *
 * `embedded`: render inline (Colour Settings) instead of a full-screen overlay.
 * `rightPanel`: optional side menu (Colour Settings). View/render buttons sit above it.
 */
export default function Building3DModal({
  onClose,
  embedded = false,
  rightPanel = null,
  elementsPanel = null,
  title = "3D Unit",
  widthM = DEFAULT_BUILDING_3D.widthM,
  depthM = DEFAULT_BUILDING_3D.depthM,
  subfloorHeightM = DEFAULT_BUILDING_3D.subfloorHeightM,
  wallHeightM = DEFAULT_BUILDING_3D.wallHeightM,
  footprintPoints = null,
  roofPoints = null,
  roofPivotLine = null,
  roofRidgeAxis = null,
  decks = null,
  deckPoints = null,
  kitchenBenches = null,
  kitchenBenchPoints = null,
  robes = null,
  robesPoints = null,
  windows = null,
  doors = null,
  slidingDoors = null,
  calibration = null,
  flooringPoints = null,
  hybridRegions = null,
  tilesRegions = null,
  carpetRegions = null,
  flooringImages = null,
  flooringScales = null,
  internalWallSegments = null,
  internalDoors = null,
  buildModel,
  projectId = null,
  finishes = null,
  /** { cabinetImageUrl, cabinetColorHex, benchtopImageUrl, benchtopColorHex } */
  kitchenFinishes = null,
  showFence = DEFAULT_BUILDING_3D.showFence,
  showSubfloor = DEFAULT_BUILDING_3D.showSubfloor,
  showWall = DEFAULT_BUILDING_3D.showWall,
  elementVisibility = null,
  claddingType = null,
  subfloorType = DEFAULT_SUBFLOOR_TYPE,
  bearerHeightM = DEFAULT_BUILDING_3D.bearerHeightM,
  joistHeightM = DEFAULT_BUILDING_3D.joistHeightM,
  bearerWidthM = DEFAULT_BUILDING_3D.bearerWidthM,
  joistWidthM = DEFAULT_BUILDING_3D.joistWidthM,
  bearerSpanMaxM = DEFAULT_BUILDING_3D.bearerSpanMaxM,
  joistSpanMaxM = DEFAULT_BUILDING_3D.joistSpanMaxM,
  joistCentresM = DEFAULT_BUILDING_3D.joistCentresM,
}) {
  const resolvedSubfloorType = (() => {
    const raw = String(subfloorType || DEFAULT_SUBFLOOR_TYPE).trim() || DEFAULT_SUBFLOOR_TYPE;
    if (raw === "stumps") return "concrete_stumps";
    return raw;
  })();
  const CLADDING_HEIGHT_M =
    Number.isFinite(Number(wallHeightM)) && Number(wallHeightM) > 0.5
      ? Number(wallHeightM)
      : DEFAULT_CLADDING_HEIGHT_M;
  const subfloorLayerCount = SUBFLOOR_LAYER_IDS.length;
  const subfloorGapM =
    Number(subfloorHeightM) >= 0.4
      ? SUBFLOOR_LAYER_GAP_M
      : Math.max(0.004, Number(subfloorHeightM) * 0.038);
  const subfloorLayerHeightM = Math.max(
    0.04,
    (Number(subfloorHeightM) - subfloorGapM * (subfloorLayerCount - 1)) / subfloorLayerCount
  );
  const eyeHeightM = Number(subfloorHeightM) + STANDING_EYE_ABOVE_FLOOR_M;
  const containerRef = useRef(null);
  const captureRef = useRef(null);
  const cameraHeightRef = useRef(EYE_HEIGHT_M);
  const externalCameraHeightRef = useRef(EYE_HEIGHT_M);
  const cameraHeightUserSetRef = useRef(false);
  const viewModeRef = useRef(VIEW_MODE_EXTERNAL);
  const applyViewModeRef = useRef(null);
  const walkModeRef = useRef(false);
  const applyWalkModeRef = useRef(null);
  const applyVisibilityRef = useRef(null);
  const sceneApiRef = useRef(null);
  const skipFirstBuildingRebuildRef = useRef(true);
  const paramsRef = useRef(null);
  const resolvedVisibility = useMemo(
    () =>
      normalizeElementVisibility(elementVisibility, {
        showFence,
        showSubfloor,
        showWall,
      }),
    [elementVisibility, showFence, showSubfloor, showWall]
  );
  const elementVisibilityRef = useRef(resolvedVisibility);
  elementVisibilityRef.current = resolvedVisibility;
  const claddingTypeRef = useRef(parseCladdingType(claddingType));
  claddingTypeRef.current = parseCladdingType(claddingType);
  const [error, setError] = useState("");
  const [sideMenuMode, setSideMenuMode] = useState(rightPanel ? "edit" : "elements");
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [renderImageUrl, setRenderImageUrl] = useState(null);
  const [renderFinishesUsed, setRenderFinishesUsed] = useState(null);
  const [renderOptionsOpen, setRenderOptionsOpen] = useState(false);
  const [renderTimeOfDay, setRenderTimeOfDay] = useState("morning");
  const [lastRenderTimeOfDay, setLastRenderTimeOfDay] = useState(null);
  const footprintKey = useMemo(
    () => JSON.stringify(footprintPoints ?? null),
    [footprintPoints]
  );
  const roofPointsKey = useMemo(() => JSON.stringify(roofPoints ?? null), [roofPoints]);
  const roofPivotKey = useMemo(() => JSON.stringify(roofPivotLine ?? null), [roofPivotLine]);
  const roofRidgeAxisKey = useMemo(
    () => JSON.stringify(roofRidgeAxis ?? null),
    [roofRidgeAxis]
  );
  const resolvedDecks = useMemo(() => {
    if (Array.isArray(decks) && decks.length) {
      return decks
        .map((deck) => (Array.isArray(deck?.points) ? deck.points : Array.isArray(deck) ? deck : null))
        .filter((pts) => Array.isArray(pts) && pts.length >= 3);
    }
    if (Array.isArray(deckPoints) && deckPoints.length >= 3) return [deckPoints];
    return [];
  }, [decks, deckPoints]);
  const deckPointsKey = useMemo(() => JSON.stringify(resolvedDecks), [resolvedDecks]);
  const resolvedKitchenBenches = useMemo(() => {
    if (Array.isArray(kitchenBenches) && kitchenBenches.length) {
      return kitchenBenches
        .map((item) =>
          Array.isArray(item?.points) ? item.points : Array.isArray(item) ? item : null
        )
        .filter((pts) => Array.isArray(pts) && pts.length >= 3);
    }
    if (Array.isArray(kitchenBenchPoints) && kitchenBenchPoints.length >= 3) {
      return [kitchenBenchPoints];
    }
    return [];
  }, [kitchenBenches, kitchenBenchPoints]);
  const kitchenBenchesKey = useMemo(
    () => JSON.stringify(resolvedKitchenBenches),
    [resolvedKitchenBenches]
  );
  const resolvedRobes = useMemo(() => {
    if (Array.isArray(robes) && robes.length) {
      return robes
        .map((item) =>
          Array.isArray(item?.points) ? item.points : Array.isArray(item) ? item : null
        )
        .filter((pts) => Array.isArray(pts) && pts.length >= 3);
    }
    if (Array.isArray(robesPoints) && robesPoints.length >= 3) {
      return [robesPoints];
    }
    return [];
  }, [robes, robesPoints]);
  const robesKey = useMemo(() => JSON.stringify(resolvedRobes), [resolvedRobes]);
  const windowsKey = useMemo(() => JSON.stringify(windows ?? null), [windows]);
  const doorsKey = useMemo(() => JSON.stringify(doors ?? null), [doors]);
  const slidingDoorsKey = useMemo(
    () => JSON.stringify(slidingDoors ?? null),
    [slidingDoors]
  );
  const internalWallsKey = useMemo(
    () => JSON.stringify(internalWallSegments ?? null),
    [internalWallSegments]
  );
  const internalDoorsKey = useMemo(
    () => JSON.stringify(internalDoors ?? null),
    [internalDoors]
  );
  const flooringPointsKey = useMemo(
    () => JSON.stringify(flooringPoints ?? null),
    [flooringPoints]
  );
  const hybridRegionsKey = useMemo(
    () => JSON.stringify(hybridRegions ?? null),
    [hybridRegions]
  );
  const tilesRegionsKey = useMemo(
    () => JSON.stringify(tilesRegions ?? null),
    [tilesRegions]
  );
  const carpetRegionsKey = useMemo(
    () => JSON.stringify(carpetRegions ?? null),
    [carpetRegions]
  );
  const flooringImagesKey = useMemo(
    () =>
      JSON.stringify({
        hybrid: flooringImages?.hybrid || null,
        tiles: flooringImages?.tiles || null,
        carpet: flooringImages?.carpet || null,
      }),
    [flooringImages]
  );
  const flooringScalesKey = useMemo(
    () =>
      JSON.stringify({
        hybrid: flooringScales?.hybrid ?? 1,
        tiles: flooringScales?.tiles ?? 1,
        carpet: flooringScales?.carpet ?? 1,
      }),
    [flooringScales]
  );
  const calibrationKey = useMemo(() => JSON.stringify(calibration ?? null), [calibration]);
  const finishesKey = useMemo(() => JSON.stringify(finishes ?? null), [finishes]);
  const finishHex = useMemo(() => resolveUnitFinishHexes(finishes), [finishesKey]);
  const kitchenFinishesKey = useMemo(
    () =>
      JSON.stringify({
        cabinetImageUrl: kitchenFinishes?.cabinetImageUrl || null,
        cabinetColorHex: kitchenFinishes?.cabinetColorHex ?? null,
        benchtopImageUrl: kitchenFinishes?.benchtopImageUrl || null,
        benchtopColorHex: kitchenFinishes?.benchtopColorHex ?? null,
      }),
    [kitchenFinishes]
  );

  paramsRef.current = {
    widthM,
    depthM,
    subfloorHeightM,
    wallHeightM,
    CLADDING_HEIGHT_M,
    resolvedSubfloorType,
    bearerHeightM,
    joistHeightM,
    bearerWidthM,
    joistWidthM,
    bearerSpanMaxM,
    joistSpanMaxM,
    joistCentresM,
    finishHex,
    finishes,
    footprintPoints,
    roofPoints,
    roofPivotLine,
    roofRidgeAxis,
    calibration,
    resolvedDecks,
    resolvedKitchenBenches,
    resolvedRobes,
    windows,
    doors,
    slidingDoors,
    internalWallSegments,
    internalDoors,
    flooringPoints,
    hybridRegions,
    tilesRegions,
    carpetRegions,
    flooringImages,
    flooringScales,
    kitchenFinishes,
    buildModel,
    subfloorLayerHeightM,
    subfloorGapM,
    footprintKey,
    roofPointsKey,
    roofPivotKey,
    roofRidgeAxisKey,
    deckPointsKey,
    kitchenBenchesKey,
    robesKey,
    windowsKey,
    doorsKey,
    slidingDoorsKey,
    internalWallsKey,
    internalDoorsKey,
    flooringPointsKey,
    hybridRegionsKey,
    tilesRegionsKey,
    carpetRegionsKey,
    flooringImagesKey,
    flooringScalesKey,
    calibrationKey,
    finishesKey,
    kitchenFinishesKey,
    eyeHeightM,
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (renderOptionsOpen && !renderBusy) {
        setRenderOptionsOpen(false);
        return;
      }
      if (renderImageUrl || renderBusy) {
        if (!renderBusy) {
          setRenderImageUrl(null);
          setRenderFinishesUsed(null);
          setLastRenderTimeOfDay(null);
          setRenderError("");
        }
        return;
      }
      onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, renderBusy, renderImageUrl, renderOptionsOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let disposed = false;
    let animationId = null;
    let resizeObserver = null;
    let renderer = null;
    const groundSize = SCENE_GROUND_SIZE_M;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87c4ef);
    scene.fog = new THREE.Fog(0xb7daf5, 48, Math.max(90, groundSize * 2.4));

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    // preserveDrawingBuffer so we can capture the current view for AI render.
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.outline = "none";
    renderer.domElement.tabIndex = 0;

    captureRef.current = {
      capturePngDataUrl: () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      },
    };

    const textureLoader = new THREE.TextureLoader();
    const skyTexture = textureLoader.load(skyImage);
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 48, 24),
      new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      })
    );
    sky.name = "sky";
    sky.renderOrder = -1;
    scene.add(sky);

    // Neutral ground fill — a grass-green ground colour tints the undersides
    // of weatherboards (and anything else facing down) as if they bounce lawn.
    scene.add(new THREE.HemisphereLight(0xc8e4ff, 0xb8b0a4, 1.35));
    const keyLight = new THREE.DirectionalLight(0xfff4e5, 1.45);
    keyLight.position.set(12, 22, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    // Tight ortho around the unit — a wide 80 m frustum caused striped
    // self-shadow (acne / banding) across weatherboards, floor, and frame.
    keyLight.shadow.camera.near = 8;
    keyLight.shadow.camera.far = 55;
    const shadowSpan = 18;
    keyLight.shadow.camera.left = -shadowSpan;
    keyLight.shadow.camera.right = shadowSpan;
    keyLight.shadow.camera.top = shadowSpan;
    keyLight.shadow.camera.bottom = -shadowSpan;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.08;
    keyLight.shadow.radius = 1;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb7d7ff, 0.85);
    fillLight.position.set(-10, 10, -8);
    scene.add(fillLight);

    const modelGroup = new THREE.Group();
    modelGroup.name = "building";
    scene.add(modelGroup);

    let envelopeGen = 0;
    let lastContentKeys = { subfloor: null, frame: null, envelope: null };
    let applyCameraLimits = () => {};

    function rebuildBuilding() {
      const p = paramsRef.current;
      if (!p) return;
      const {
        widthM,
        depthM,
        subfloorHeightM,
        CLADDING_HEIGHT_M,
        resolvedSubfloorType,
        bearerHeightM,
        joistHeightM,
        bearerWidthM,
        joistWidthM,
        bearerSpanMaxM,
        joistSpanMaxM,
        joistCentresM,
        finishHex,
        finishes,
        footprintPoints,
        roofPoints,
        roofPivotLine,
        roofRidgeAxis,
        calibration,
        resolvedDecks,
        resolvedKitchenBenches,
        resolvedRobes,
        windows,
        doors,
        slidingDoors,
        internalWallSegments,
        internalDoors,
        flooringPoints,
        hybridRegions,
        tilesRegions,
        carpetRegions,
        flooringImages,
        flooringScales,
        kitchenFinishes,
        buildModel,
        subfloorLayerHeightM,
        subfloorGapM,
      } = p;
      const { ring, fromTrace } = resolveBuildingFootprintRing(
        footprintPoints,
        widthM,
        depthM,
        calibration
      );
      const modelWindows = fromTrace
        ? resolveModelWindows(footprintPoints, windows, calibration)
        : [];
      const modelDoors = fromTrace ? resolveModelDoors(footprintPoints, doors, calibration) : [];
      const modelSlidingDoors = fromTrace
        ? resolveModelSlidingDoors(footprintPoints, slidingDoors, calibration)
        : [];
      const bounds = footprintBounds(ring);
      const keys = buildingContentKeys(p);
      const first = lastContentKeys.subfloor == null;
      const doSub = first || keys.subfloor !== lastContentKeys.subfloor;
      const doFrame = first || keys.frame !== lastContentKeys.frame;
      const doEnv = first || keys.envelope !== lastContentKeys.envelope;
      if (!doSub && !doFrame && !doEnv) {
        applyCameraLimits(bounds, p);
        return;
      }

      try {
        if (doSub) {
          removeDirectChildByName(modelGroup, BUILDING_3D_PARTS.SUBFLOOR);
          populateSubfloorGroup(modelGroup, {
            widthM,
            depthM,
            subfloorHeightM,
            resolvedSubfloorType,
            bearerHeightM,
            joistHeightM,
            bearerWidthM,
            joistWidthM,
            bearerSpanMaxM,
            joistSpanMaxM,
            joistCentresM,
            finishHex,
            ring,
          });
        }
        if (doFrame) {
          removeDirectChildByName(modelGroup, BUILDING_3D_PARTS.FRAME);
          const floorDropM =
            resolvedSubfloorType === "concrete_stumps" || resolvedSubfloorType === "mega_anchors"
              ? STRUCTURAL_FLOOR_THICKNESS_M
              : 0;
          const floorTopY =
            Number(subfloorHeightM) - floorDropM + STRUCTURAL_FLOOR_THICKNESS_M;
          addWallFrame(modelGroup, {
            widthM,
            depthM,
            floorTopY,
            wallHeightM: CLADDING_HEIGHT_M,
            ring,
            windows: modelWindows,
            doors: modelDoors,
            slidingDoors: modelSlidingDoors,
            windowHeadAboveFloorM:
              Number(subfloorHeightM) + WINDOW_TOP_ABOVE_SUBFLOOR_M - floorTopY,
          });
        }
        if (doEnv) {
          envelopeGen += 1;
          const thisEnvelopeGen = envelopeGen;
          removeDirectChildrenExcept(
            modelGroup,
            new Set([BUILDING_3D_PARTS.SUBFLOOR, BUILDING_3D_PARTS.FRAME])
          );

      // Decks: same 200 / 25 / 200 / 25 / 200 stack as the previous subfloor, timber boards on top.
      // No walls above — second subfloor(s) attached beside the unit.
      let hasDeck = false;
      const wallRef = footprintPoints?.length >= 3 ? footprintPoints : null;
      resolvedDecks.forEach((deckPts, deckIndex) => {
        const deckResolved = resolveAlignedTraceRing(
          deckPts,
          wallRef || deckPts,
          calibration
        );
        if (deckResolved.ring.length < 3) return;

        const deckGroup = new THREE.Group();
        deckGroup.name = deckIndex === 0 ? BUILDING_3D_PARTS.DECK : `${BUILDING_3D_PARTS.DECK}-${deckIndex}`;
        deckGroup.userData = {
          partId: BUILDING_3D_PARTS.DECK,
          partType: "deck",
          deckIndex,
        layerHeightM: subfloorLayerHeightM,
        layerGapM: subfloorGapM,
        heightM: subfloorHeightM,
        };
        modelGroup.add(deckGroup);

        let builtDeckLayers = 0;
        DECK_LAYER_IDS.forEach((partId, index) => {
          const bottomY = index * (subfloorLayerHeightM + subfloorGapM);
          const topY = bottomY + subfloorLayerHeightM;
          if (
            addFootprintSlab(deckGroup, {
              partId: deckIndex === 0 ? partId : `${partId}-${deckIndex}`,
              partType: "deck-layer",
              layerNumber: index + 1,
              ring: deckResolved.ring,
              bottomY,
              topY,
              color: finishHex.baseboards,
              roughness: 0.78,
              metalness: 0.05,
            })
          ) {
            builtDeckLayers += 1;
          }
        });

        if (builtDeckLayers > 0) {
          const topped = addDeckTopBoards(deckGroup, deckResolved.ring, subfloorHeightM);
          if (topped) hasDeck = true;
        }
      });
      modelGroup.userData = {
        ...(modelGroup.userData || {}),
        hasDeck,
      };

      // Interior floor finishes on top of the subfloor (hybrid base + tiles/carpet regions).
      const flooringGroup = new THREE.Group();
      flooringGroup.name = "flooring";
      flooringGroup.userData = { partId: "flooring", partType: "flooring" };
      modelGroup.add(flooringGroup);

      const wallRefPoints = footprintPoints?.length >= 3 ? footprintPoints : null;
      let floorOuterRing = [];
      if (Array.isArray(flooringPoints) && flooringPoints.length >= 3 && wallRefPoints) {
        floorOuterRing = resolveAlignedTraceRing(
          flooringPoints,
          wallRefPoints,
          calibration
        ).ring;
      }
      if (floorOuterRing.length < 3) {
        floorOuterRing =
          offsetPolygonInward(ring, CLADDING_WALL_THICKNESS_M) ||
          sanitizeFootprintRing(ring);
      }
      const hybridXZ = wallRefPoints
        ? resolveRegionXZRings(hybridRegions, wallRefPoints, calibration)
        : [];
      const tilesXZ = wallRefPoints
        ? resolveRegionXZRings(tilesRegions, wallRefPoints, calibration)
        : [];
      const carpetXZ = wallRefPoints
        ? resolveRegionXZRings(carpetRegions, wallRefPoints, calibration)
        : [];
      const floorY = subfloorHeightM + FLOOR_FINISH_Y_EPS_M;
      const floorBounds = footprintBounds(floorOuterRing);
      const floorOriginX = floorBounds?.minX ?? 0;
      const floorOriginZ = floorBounds?.minZ ?? 0;
      const hybridScale = clampPositiveScale(flooringScales?.hybrid);
      const tilesScale = clampPositiveScale(flooringScales?.tiles);
      const carpetScale = clampPositiveScale(flooringScales?.carpet);
      const hybridModuleW = HYBRID_MODULE_WIDTH_M * hybridScale;
      const hybridModuleH = HYBRID_MODULE_HEIGHT_M * hybridScale;
      const tilesModuleW = TILE_MODULE_WIDTH_M * tilesScale;
      const tilesModuleH = TILE_MODULE_HEIGHT_M * tilesScale;
      const carpetModule = CARPET_MODULE_M * carpetScale;

      (async () => {
        if (disposed || thisEnvelopeGen !== envelopeGen || floorOuterRing.length < 3) return;
        const hybridUrl = flooringImages?.hybrid || null;
        const tilesUrl = flooringImages?.tiles || null;
        const carpetUrl = flooringImages?.carpet || null;
        const [hybridTex, tilesTex, carpetTex] = await Promise.all([
          hybridUrl ? loadFloorTextureFromUrl(hybridUrl) : Promise.resolve(null),
          tilesUrl ? loadFloorTextureFromUrl(tilesUrl) : Promise.resolve(null),
          carpetUrl ? loadFloorTextureFromUrl(carpetUrl) : Promise.resolve(null),
        ]);
        if (disposed || thisEnvelopeGen !== envelopeGen) {
          hybridTex?.dispose();
          tilesTex?.dispose();
          carpetTex?.dispose();
          return;
        }

        // Hybrid covers the main floor only when a hybrid colour/image is selected —
        // never the plan-preview orange placeholder.
        const showHybridBase = Boolean(hybridUrl || hybridTex);
        const regionHolesForHybrid = [...tilesXZ, ...carpetXZ];
        if (showHybridBase) {
          addFloorFinishMesh(flooringGroup, {
            partId: "floor-hybrid-base",
            outerRing: floorOuterRing,
            holeRings: [...hybridXZ, ...regionHolesForHybrid],
            yM: floorY,
            texture: hybridTex,
            fallbackColor: HYBRID_FLOOR_FALLBACK_COLOR,
            moduleWidthM: hybridModuleW,
            moduleHeightM: hybridModuleH,
            originX: floorOriginX,
            originZ: floorOriginZ,
          });
        }

        hybridXZ.forEach((regionRing, index) => {
          const b = footprintBounds(regionRing);
          addFloorFinishMesh(flooringGroup, {
            partId: `floor-hybrid-region-${index + 1}`,
            outerRing: regionRing,
            yM: floorY + 0.0004,
            texture: hybridTex,
            fallbackColor: HYBRID_FLOOR_FALLBACK_COLOR,
            moduleWidthM: hybridModuleW,
            moduleHeightM: hybridModuleH,
            originX: b?.minX ?? floorOriginX,
            originZ: b?.minZ ?? floorOriginZ,
          });
        });

        tilesXZ.forEach((regionRing, index) => {
          const b = footprintBounds(regionRing);
          addFloorFinishMesh(flooringGroup, {
            partId: `floor-tiles-region-${index + 1}`,
            outerRing: regionRing,
            yM: floorY + 0.0008,
            texture: tilesTex,
            fallbackColor: TILES_FLOOR_FALLBACK_COLOR,
            moduleWidthM: tilesModuleW,
            moduleHeightM: tilesModuleH,
            originX: b?.minX ?? floorOriginX,
            originZ: b?.minZ ?? floorOriginZ,
          });
        });

        carpetXZ.forEach((regionRing, index) => {
          const b = footprintBounds(regionRing);
          addFloorFinishMesh(flooringGroup, {
            partId: `floor-carpet-region-${index + 1}`,
            outerRing: regionRing,
            yM: floorY + 0.0012,
            texture: carpetTex,
            fallbackColor: CARPET_FLOOR_FALLBACK_COLOR,
            moduleWidthM: carpetModule,
            moduleHeightM: carpetModule,
            originX: b?.minX ?? floorOriginX,
            originZ: b?.minZ ?? floorOriginZ,
          });
        });
      })();

      // Kitchen benches: cabinetry (0–879 mm) + 20 mm benchtop (880–900 mm), lit finishes.
      if (fromTrace && resolvedKitchenBenches.length && wallRefPoints) {
        const cabinetUrl = kitchenFinishes?.cabinetImageUrl || null;
        const benchtopUrl = kitchenFinishes?.benchtopImageUrl || null;
        const cabinetColor =
          Number.isFinite(kitchenFinishes?.cabinetColorHex)
            ? kitchenFinishes.cabinetColorHex
            : KITCHEN_CABINET_FALLBACK_COLOR;
        const benchtopColor =
          Number.isFinite(kitchenFinishes?.benchtopColorHex)
            ? kitchenFinishes.benchtopColorHex
            : KITCHEN_BENCHTOP_FALLBACK_COLOR;

        (async () => {
          const [cabinetTex, benchtopTex] = await Promise.all([
            cabinetUrl ? loadFloorTextureFromUrl(cabinetUrl) : Promise.resolve(null),
            benchtopUrl ? loadFloorTextureFromUrl(benchtopUrl) : Promise.resolve(null),
          ]);
          if (disposed || thisEnvelopeGen !== envelopeGen || !modelGroup.parent) {
            cabinetTex?.dispose();
            benchtopTex?.dispose();
            return;
          }
          resolvedKitchenBenches.forEach((benchPts, index) => {
            const benchResolved = resolveAlignedTraceRing(
              benchPts,
              wallRefPoints,
              calibration
            );
            if (benchResolved.ring.length < 3) return;
            const suffix = index === 0 ? "" : `-${index}`;
            addFootprintSlab(modelGroup, {
              partId: `${BUILDING_3D_PARTS.KITCHEN_CABINET}${suffix}`,
              partType: "kitchen-cabinet",
              ring: benchResolved.ring,
              bottomY: subfloorHeightM,
              topY: subfloorHeightM + KITCHEN_CABINET_TOP_M,
              color: cabinetColor,
              map: cabinetTex,
              roughness: 0.78,
              metalness: 0.04,
              extraUserData: { benchIndex: index },
            });
            addFootprintSlab(modelGroup, {
              partId: `${BUILDING_3D_PARTS.KITCHEN_BENCHTOP}${suffix}`,
              partType: "kitchen-benchtop",
              ring: benchResolved.ring,
              bottomY: subfloorHeightM + KITCHEN_BENCHTOP_BOTTOM_M,
              topY: subfloorHeightM + KITCHEN_BENCHTOP_TOP_M,
              color: benchtopColor,
              map: benchtopTex,
              roughness: 0.55,
              metalness: 0.04,
              extraUserData: { benchIndex: index },
            });
          });
        })();
      }

      // Robes: solid 2600 mm slabs sitting on floor level.
      if (fromTrace && resolvedRobes.length && wallRefPoints) {
        resolvedRobes.forEach((robePts, index) => {
          const robesResolved = resolveAlignedTraceRing(
            robePts,
            wallRefPoints,
            calibration
          );
          if (robesResolved.ring.length < 3) return;
          addFootprintSlab(modelGroup, {
            partId:
              index === 0
                ? BUILDING_3D_PARTS.ROBES
                : `${BUILDING_3D_PARTS.ROBES}-${index}`,
            partType: "robes",
            ring: robesResolved.ring,
            bottomY: subfloorHeightM,
            topY: subfloorHeightM + CLADDING_HEIGHT_M,
            color: ROBES_COLOR,
            roughness: 0.7,
            metalness: 0.04,
            extraUserData: { robesIndex: index },
          });
        });
      }

      const cladding = new THREE.Group();
      cladding.name = BUILDING_3D_PARTS.CLADDING;
      cladding.userData = {
        partId: BUILDING_3D_PARTS.CLADDING,
        partType: "cladding",
        fromTrace,
        layerCount: CLADDING_LAYER_COUNT,
        layerHeightM: CLADDING_LAYER_HEIGHT_M,
        color: `#${finishHex.cladding.toString(16).padStart(6, "0")}`,
      };
      modelGroup.add(cladding);

      // Resolve openings early so cladding boards that span them can be notched through.
      const modelInternalDoors =
        fromTrace &&
        Array.isArray(internalWallSegments) &&
        internalWallSegments.length > 0
          ? resolveModelInternalDoors(
              footprintPoints,
              internalDoors,
              internalWallSegments,
              calibration
            )
          : [];
      const allDoorOpenings = [...modelDoors, ...modelSlidingDoors];
      const doorTopY = subfloorHeightM + DOOR_HEIGHT_M;
      const windowHeadY = subfloorHeightM + WINDOW_TOP_ABOVE_SUBFLOOR_M;

      const windowVerticalRange = (win) => {
        const height = win.heightM > 0 ? win.heightM : WINDOW_HEIGHT_M;
        return { topY: windowHeadY, bottomY: windowHeadY - height };
      };

      // Weatherboards: 230 × 10 mm, 30 mm lap, one board per row per wall run,
      // split around door/window openings. Length follows each footprint edge.
      const claddingBottomY = subfloorHeightM;
      const claddingTopY = subfloorHeightM + CLADDING_HEIGHT_M;
      const claddingOpenings = [
        ...allDoorOpenings.map((door) => ({
          ...door,
          openingBottomYM: subfloorHeightM,
          openingTopYM: doorTopY,
        })),
        ...modelWindows.map((win) => {
          const { topY: wTop, bottomY: wBot } = windowVerticalRange(win);
          return {
            ...win,
            openingBottomYM: wBot,
            openingTopYM: wTop,
          };
        }),
      ];
      const claddingMaterial = new THREE.MeshStandardMaterial({
        color: finishHex.cladding,
        roughness: 0.86,
        metalness: 0,
        vertexColors: true,
      });
      const duragrooveMaps = getDuragrooveMaps();
      const duragrooveMaterial = new THREE.MeshStandardMaterial({
        color: finishHex.cladding,
        roughness: 0.86,
        metalness: 0,
        map: duragrooveMaps.map,
        normalMap: duragrooveMaps.normalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const addCladdingMeshes = (
        parent,
        parts,
        namePrefix,
        partType,
        thicknessM,
        material = claddingMaterial
      ) => {
        if (!parts.length) return;
        const geos = parts.map((part) => {
          const geo = part.geometry;
          geo.rotateX(part.tiltX || 0);
          geo.rotateY(part.rotationY);
          geo.translate(part.position.x, part.position.y, part.position.z);
          return geo;
        });
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (geos.length > 1) {
          geos.forEach((g) => g.dispose());
        }
        if (!merged) return;
        merged.computeVertexNormals();
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = namePrefix;
        mesh.userData = {
          partId: namePrefix,
          partType,
          wallThicknessM: thicknessM,
          color: `#${finishHex.cladding.toString(16).padStart(6, "0")}`,
        };
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        parent.add(mesh);
      };
      const weatherboardParts = buildFootprintWeatherboardParts(
        ring,
        claddingBottomY,
        claddingTopY,
        claddingOpenings,
        WEATHERBOARD_THICKNESS_M
      );
      addCladdingMeshes(
        cladding,
        weatherboardParts,
        "weatherboard",
        "weatherboard",
        WEATHERBOARD_THICKNESS_M
      );
      const duragrooveParts = buildFootprintDuragrooveParts(
        ring,
        claddingBottomY,
        claddingTopY,
        claddingOpenings
      );
      addCladdingMeshes(
        cladding,
        duragrooveParts,
        "duragroove",
        "duragroove",
        DURAGROOVE_THICKNESS_M,
        duragrooveMaterial
      );
      let builtCladdingLayers = weatherboardParts.length + duragrooveParts.length;
      const weatherboardMainRowCount = weatherboardRowTops(CLADDING_HEIGHT_M).length;

      const addCladdingCornerColumns = (
        name,
        partType,
        thicknessM,
        frameGapM = WEATHERBOARD_FRAME_GAP_M
      ) => {
        const outerProudM = frameGapM + thicknessM;
        const cornerProjectionM = outerProudM + CORNER_COLUMN_PROJECTION_M;
        const group = new THREE.Group();
        group.name = name;
        group.userData = {
          partId: name,
          partType,
          columnSizeM: CORNER_COLUMN_SIZE_M,
          columnHeightM: CLADDING_HEIGHT_M,
          exteriorProjectionM: cornerProjectionM,
        };
        cladding.add(group);
        footprintCornerColumnCenters(ring, CORNER_COLUMN_SIZE_M, cornerProjectionM).forEach(
          ({ x, z, index, rotationY }) => {
            addCornerColumn(group, {
              partId: `${name}-${index + 1}`,
              partType,
              x,
              z,
              y: subfloorHeightM + CLADDING_HEIGHT_M / 2,
              heightM: CLADDING_HEIGHT_M,
              color: finishHex.cladding,
              roughness: 0.62,
              metalness: 0.02,
              rotationY,
            });
          }
        );
        return { group, cornerProjectionM };
      };
      const weatherboardCorners = addCladdingCornerColumns(
        BUILDING_3D_PARTS.CLADDING_CORNER_COLUMNS,
        "cladding-corner-columns",
        WEATHERBOARD_THICKNESS_M
      );
      const duragrooveCorners = addCladdingCornerColumns(
        "duragroove-corner-columns",
        "duragroove-corner-columns",
        DURAGROOVE_THICKNESS_M,
        DURAGROOVE_FRAME_GAP_M
      );
      const claddingCornerColumns = weatherboardCorners.group;
      const cornerProjectionM = weatherboardCorners.cornerProjectionM;

      if (builtCladdingLayers < 1) {
        throw new Error(
          `Could not build weatherboards for the unit footprint (${builtCladdingLayers} boards).`
        );
      }

      // Internal walls: 90×45 frame at 450 mm centres (same plates / noggins
      // / door openings as the external frame), centred on each traced wall.
      if (
        fromTrace &&
        Array.isArray(footprintPoints) &&
        footprintPoints.length >= 3 &&
        Array.isArray(internalWallSegments) &&
        internalWallSegments.length > 0
      ) {
        const floorDropM =
          resolvedSubfloorType === "concrete_stumps" || resolvedSubfloorType === "mega_anchors"
            ? STRUCTURAL_FLOOR_THICKNESS_M
            : 0;
        const internalFloorTopY =
          Number(subfloorHeightM) - floorDropM + STRUCTURAL_FLOOR_THICKNESS_M;
        addInternalWallFrames(modelGroup, {
          footprintPoints,
          segments: internalWallSegments,
          doors: modelInternalDoors,
          calibration,
          floorTopY: internalFloorTopY,
          wallHeightM: CLADDING_HEIGHT_M,
        });

        // Solid internal door leaves centred in the wall openings.
        if (modelInternalDoors.length) {
          const internalDoorsGroup = new THREE.Group();
          internalDoorsGroup.name = BUILDING_3D_PARTS.INTERNAL_DOORS;
          internalDoorsGroup.userData = {
            partId: BUILDING_3D_PARTS.INTERNAL_DOORS,
            partType: "internal-doors",
            heightM: DOOR_HEIGHT_M,
            count: modelInternalDoors.length,
          };
          modelGroup.add(internalDoorsGroup);

          const doorBottomY = subfloorHeightM;
          const doorCenterY = doorBottomY + DOOR_HEIGHT_M / 2;

          modelInternalDoors.forEach((door, index) => {
            const geometry = new THREE.BoxGeometry(
              door.lengthM,
              DOOR_HEIGHT_M,
              INTERNAL_DOOR_PANEL_THICKNESS_M
            );
            const material = new THREE.MeshStandardMaterial({
              color: finishHex.frontDoor,
              roughness: 0.72,
              metalness: 0.04,
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `internal-door-${index + 1}`;
            mesh.userData = {
              partId: `internal-door-${index + 1}`,
              partType: "internal-door",
              widthM: door.lengthM,
              heightM: DOOR_HEIGHT_M,
            };
            const rotY = Math.atan2(-door.dirZ, door.dirX);
            mesh.position.set(door.midX, doorCenterY, door.midZ);
            mesh.rotation.y = rotY;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            internalDoorsGroup.add(mesh);

            // Rectangle outline on both wall faces so the door reads clearly from either side.
            const halfW = door.lengthM / 2;
            const halfH = DOOR_HEIGHT_M / 2;
            const faceOffset =
              INTERNAL_DOOR_PANEL_THICKNESS_M / 2 + INTERNAL_DOOR_OUTLINE_EPS_M;
            const outlinePositions = new Float32Array([
              // Face +normal
              -halfW, -halfH, faceOffset, halfW, -halfH, faceOffset,
              halfW, -halfH, faceOffset, halfW, halfH, faceOffset,
              halfW, halfH, faceOffset, -halfW, halfH, faceOffset,
              -halfW, halfH, faceOffset, -halfW, -halfH, faceOffset,
              // Face -normal
              -halfW, -halfH, -faceOffset, halfW, -halfH, -faceOffset,
              halfW, -halfH, -faceOffset, halfW, halfH, -faceOffset,
              halfW, halfH, -faceOffset, -halfW, halfH, -faceOffset,
              -halfW, halfH, -faceOffset, -halfW, -halfH, -faceOffset,
            ]);
            const outlineGeo = new THREE.BufferGeometry();
            outlineGeo.setAttribute(
              "position",
              new THREE.BufferAttribute(outlinePositions, 3)
            );
            const outline = new THREE.LineSegments(
              outlineGeo,
              new THREE.LineBasicMaterial({ color: 0x202124 })
            );
            outline.name = `internal-door-${index + 1}-outline`;
            outline.position.copy(mesh.position);
            outline.rotation.y = rotY;
            internalDoorsGroup.add(outline);
          });
        }
      }

      // 10 mm plaster lining on the inner face of external walls and both
      // faces of internal walls. Window and door openings are cut out.
      {
        const liningBottomY = claddingBottomY;
        const liningTopY = claddingTopY;
        let segmentsXZ = [];
        if (
          fromTrace &&
          Array.isArray(footprintPoints) &&
          footprintPoints.length >= 3 &&
          Array.isArray(internalWallSegments) &&
          internalWallSegments.length > 0
        ) {
          const mapping = getTracePlanXZMapping(footprintPoints, calibration);
          if (mapping) {
            segmentsXZ = internalWallSegments.map((seg) => ({
              a: seg?.a ? normalizedPointToXZ(seg.a, mapping) : null,
              b: seg?.b ? normalizedPointToXZ(seg.b, mapping) : null,
            }));
          }
        }
        const tWidth =
          FRAME_TIMBER_DEPTH_M + 2 * (WALL_LINING_THICKNESS_M + WALL_LINING_FRAME_GAP_M);
        const junctionOpenings = liningTJunctionOpeningsOnRing(
          ring,
          segmentsXZ,
          liningBottomY,
          liningTopY,
          tWidth
        );
        const liningOpenings = [...claddingOpenings, ...junctionOpenings];
        const externalParts = buildExternalWallLiningParts(
          ring,
          liningBottomY,
          liningTopY,
          liningOpenings,
          {
            frameDepthM: FRAME_TIMBER_DEPTH_M,
            thicknessM: WALL_LINING_THICKNESS_M,
          }
        );
        const internalDoorOpenings = (modelInternalDoors || []).map((door) => ({
          ...door,
          openingBottomYM: liningBottomY,
          openingTopYM: liningBottomY + DOOR_HEIGHT_M,
        }));
        const internalParts = buildInternalWallLiningParts({
          segmentsXZ,
          doors: internalDoorOpenings,
          ring,
          bottomYM: liningBottomY,
          topYM: liningTopY,
          frameDepthM: FRAME_TIMBER_DEPTH_M,
          thicknessM: WALL_LINING_THICKNESS_M,
        });
        const liningParts = [...externalParts, ...internalParts];
        if (liningParts.length) {
          const liningGroup = new THREE.Group();
          liningGroup.name = BUILDING_3D_PARTS.INTERNAL_WALL_LINING;
          liningGroup.userData = {
            partId: BUILDING_3D_PARTS.INTERNAL_WALL_LINING,
            partType: "internal-wall-lining",
            thicknessM: WALL_LINING_THICKNESS_M,
          };
          const liningMaterial = new THREE.MeshStandardMaterial({
            color: WALL_LINING_COLOR,
            roughness: 0.94,
            metalness: 0,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          });
          const addMergedLiningMeshes = (partList) => {
            if (!partList.length) return;
            const geos = partList.map((part) => {
              const geo = part.geometry;
              geo.rotateY(part.rotationY);
              geo.translate(part.position.x, part.position.y, part.position.z);
              return geo;
            });
            const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
            if (geos.length > 1 && merged) geos.forEach((g) => g.dispose());
            const liningGeos = merged ? [merged] : geos;
            liningGeos.forEach((geo, index) => {
              geo.computeVertexNormals();
              const mesh = new THREE.Mesh(geo, liningMaterial);
              mesh.name =
                index === 0
                  ? BUILDING_3D_PARTS.INTERNAL_WALL_LINING
                  : `${BUILDING_3D_PARTS.INTERNAL_WALL_LINING}-${index}`;
              mesh.userData = {
                partId: BUILDING_3D_PARTS.INTERNAL_WALL_LINING,
                partType: "internal-wall-lining",
              };
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              liningGroup.add(mesh);
            });
          };
          addMergedLiningMeshes(liningParts.filter((part) => !part.isReveal));
          addMergedLiningMeshes(liningParts.filter((part) => part.isReveal));
          modelGroup.add(liningGroup);
        }
      }

      // Roof: slab on full traced outline (100 mm affordable / 150 mm hipped);
      // 15° hip sits on the slab, inset 150 mm for gutter.
      const wallTopY = subfloorHeightM + CLADDING_HEIGHT_M;
      const eaveYM = hippedRoofEaveYM(wallTopY);
      let hasRoofSlab = false;
      let roofStackM = 0;
      if (fromTrace && Array.isArray(roofPoints) && roofPoints.length >= 3) {
        const roofResolved = resolveAlignedTraceRing(
          roofPoints,
          footprintPoints,
          calibration
        );
        if (roofResolved.fromTrace && roofResolved.ring.length >= 3) {
          const slabRing = roofResolved.ring;
          const hipRing = insetRoofRingForGutter(slabRing, ROOF_GUTTER_INSET_M);
          const showHippedPlanes = isSuperiorHippedRoofStyle(finishes?.roofStyle);
          const showSkillionSlab = isSuperiorSkillionRoofStyle(finishes?.roofStyle);
          const swingDoor = modelDoors[0] ?? null;
          let pivotLineXZ = null;
          if (roofPivotLine?.a && roofPivotLine?.b) {
            const mapping = getTracePlanXZMapping(
              Array.isArray(footprintPoints) && footprintPoints.length >= 3
                ? footprintPoints
                : roofPoints,
              calibration
            );
            if (mapping) {
              pivotLineXZ = {
                a: normalizedPointToXZ(roofPivotLine.a, mapping),
                b: normalizedPointToXZ(roofPivotLine.b, mapping),
              };
            }
          }

          // Extra weatherboards under the skillion rise (roof geometry unchanged).
          if (showSkillionSlab) {
            const skillionPitch = resolveSkillionPitch(slabRing, pivotLineXZ, swingDoor);
            const maxRiseM = skillionMaxWallRiseM(skillionPitch, SKILLION_ROOF_PITCH_DEG);
            weatherboardRowTops(maxRiseM).forEach((rowTop, bandIndex) => {
              const boardH = Math.min(WEATHERBOARD_HEIGHT_M, rowTop);
              if (!(boardH > 0.02)) return;
              const rowBottom = Math.max(0, rowTop - boardH);
              const clipped = clipRingToSkillionMinRise(
                ring,
                skillionPitch,
                rowBottom,
                SKILLION_ROOF_PITCH_DEG
              );
              if (!clipped) return;
              const extraParts = buildFootprintWeatherboardParts(
                clipped,
                wallTopY + rowBottom,
                wallTopY + rowTop,
                [],
                WEATHERBOARD_THICKNESS_M,
                { rowIndexOffset: weatherboardMainRowCount + bandIndex }
              );
              addCladdingMeshes(
                cladding,
                extraParts,
                `weatherboard-skillion-${bandIndex + 1}`,
                "weatherboard",
                WEATHERBOARD_THICKNESS_M
              );
            });
            if (skillionPitch && maxRiseM > 0.02) {
              const duragrooveSkillion = clipRingToSkillionMinRise(
                ring,
                skillionPitch,
                0,
                SKILLION_ROOF_PITCH_DEG
              );
              if (duragrooveSkillion) {
                const extraDuragroove = buildFootprintDuragrooveParts(
                  duragrooveSkillion,
                  wallTopY,
                  wallTopY + maxRiseM,
                  []
                );
                addCladdingMeshes(
                  cladding,
                  extraDuragroove,
                  "duragroove-skillion",
                  "duragroove",
                  DURAGROOVE_THICKNESS_M,
                  duragrooveMaterial
                );
              }
            }

            // Extend corner posts up to the pitched underside at each corner.
            if (skillionPitch && maxRiseM > 1e-6) {
              footprintCornerColumnCenters(
                ring,
                CORNER_COLUMN_SIZE_M,
                cornerProjectionM
              ).forEach(({ x, z, index, rotationY }) => {
                const riseM = skillionUndersideRiseM(
                  { x, z },
                  skillionPitch,
                  SKILLION_ROOF_PITCH_DEG
                );
                if (!(riseM > 1e-4)) return;
                addCornerColumn(claddingCornerColumns, {
                  partId: `cladding-corner-column-${index + 1}-skillion`,
                  partType: "cladding-corner-column",
                  x,
                  z,
                  y: wallTopY + riseM / 2,
                  heightM: riseM,
                  color: finishHex.cladding,
                  roughness: 0.62,
                  metalness: 0.02,
                  rotationY,
                });
              });
              footprintCornerColumnCenters(
                ring,
                CORNER_COLUMN_SIZE_M,
                duragrooveCorners.cornerProjectionM
              ).forEach(({ x, z, index, rotationY }) => {
                const riseM = skillionUndersideRiseM(
                  { x, z },
                  skillionPitch,
                  SKILLION_ROOF_PITCH_DEG
                );
                if (!(riseM > 1e-4)) return;
                addCornerColumn(duragrooveCorners.group, {
                  partId: `duragroove-corner-column-${index + 1}-skillion`,
                  partType: "duragroove-corner-columns",
                  x,
                  z,
                  y: wallTopY + riseM / 2,
                  heightM: riseM,
                  color: finishHex.cladding,
                  roughness: 0.62,
                  metalness: 0.02,
                  rotationY,
                });
              });
            }
          }

          const roofGroup = new THREE.Group();
          roofGroup.name = BUILDING_3D_PARTS.ROOF;
          roofGroup.userData = {
            partId: BUILDING_3D_PARTS.ROOF,
            partType: "roof",
            slabThicknessM: showSkillionSlab
              ? SKILLION_ROOF_SLAB_THICKNESS_M
              : showHippedPlanes
                ? ROOF_SLAB_THICKNESS_M
                : AFFORDABLE_ROOF_SLAB_THICKNESS_M,
            gutterInsetM: ROOF_GUTTER_INSET_M,
            pitchDeg: showSkillionSlab
              ? SKILLION_ROOF_PITCH_DEG
              : showHippedPlanes
                ? HIPPED_ROOF_PITCH_DEG
                : AFFORDABLE_ROOF_PITCH_DEG,
            color: `#${finishHex.roof.toString(16).padStart(6, "0")}`,
          };
          modelGroup.add(roofGroup);

          let slabOk = false;
          let hipOk = false;
          if (showSkillionSlab) {
            const skillionData = buildSkillionRoofSlabMeshData(
              slabRing,
              wallTopY,
              swingDoor,
              SKILLION_ROOF_PITCH_DEG,
              SKILLION_ROOF_SLAB_THICKNESS_M,
              pivotLineXZ
            );
            const skillionGeom = buildSkillionRoofSlabGeometry(
              slabRing,
              wallTopY,
              swingDoor,
              SKILLION_ROOF_PITCH_DEG,
              SKILLION_ROOF_SLAB_THICKNESS_M,
              pivotLineXZ
            );
            if (skillionGeom && skillionData) {
              const material = new THREE.MeshBasicMaterial({
                color: finishHex.roof,
                side: THREE.DoubleSide,
              });
              const mesh = new THREE.Mesh(skillionGeom, material);
              mesh.name = `${BUILDING_3D_PARTS.ROOF}-skillion-slab`;
              mesh.userData = {
                partId: BUILDING_3D_PARTS.ROOF,
                partType: "skillion-roof",
                pitchDeg: SKILLION_ROOF_PITCH_DEG,
                slabThicknessM: SKILLION_ROOF_SLAB_THICKNESS_M,
                color: `#${finishHex.roof.toString(16).padStart(6, "0")}`,
              };
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              roofGroup.add(mesh);

              const outlineGeom = buildSkillionRoofSlabOutlineGeometry(
                slabRing,
                wallTopY,
                swingDoor,
                SKILLION_ROOF_PITCH_DEG,
                SKILLION_ROOF_SLAB_THICKNESS_M,
                pivotLineXZ
              );
              if (outlineGeom) {
                const outline = new THREE.LineSegments(
                  outlineGeom,
                  new THREE.LineBasicMaterial({ color: 0x202124 })
                );
                outline.name = `${BUILDING_3D_PARTS.ROOF}-skillion-outline`;
                roofGroup.add(outline);
              }

              roofGroup.userData.riseM = skillionData.maxRiseM;
              roofStackM = skillionData.maxRiseM;
              slabOk = true;
            }
          } else {
            const dualFallSlabM = showHippedPlanes
              ? ROOF_SLAB_THICKNESS_M
              : AFFORDABLE_ROOF_SLAB_THICKNESS_M;
            slabOk = addFootprintSlab(roofGroup, {
              partId: `${BUILDING_3D_PARTS.ROOF}-slab`,
              partType: "roof-slab",
              layerNumber: 1,
              ring: slabRing,
              bottomY: wallTopY,
              topY: wallTopY + dualFallSlabM,
              color: finishHex.roof,
              roughness: 0.55,
              metalness: 0.08,
              outlineColor: showHippedPlanes ? finishHex.roof : null,
              extraUserData: {
                color: `#${finishHex.roof.toString(16).padStart(6, "0")}`,
              },
            });

            if (slabOk && !showHippedPlanes) {
              addAffordableEaveBattens(roofGroup, {
                ring: slabRing,
                ridgeAxis: roofRidgeAxis,
                slabTopY: wallTopY + dualFallSlabM,
              });
              const sheetRiseM = addAffordableRoofSheet(roofGroup, {
                ring: slabRing,
                ridgeAxis: roofRidgeAxis,
                slabTopY: wallTopY + dualFallSlabM,
                color: finishHex.roof,
              });
              const trimColor = finishHex.fasciaGutter ?? finishHex.roof;
              addAffordableEaveGutters(roofGroup, {
                ring: slabRing,
                ridgeAxis: roofRidgeAxis,
                slabTopY: wallTopY + dualFallSlabM,
                color: trimColor,
              });
              addAffordableGableEndPanels(roofGroup, {
                ring: slabRing,
                ridgeAxis: roofRidgeAxis,
                slabTopY: wallTopY + dualFallSlabM,
                color: trimColor,
              });
              addAffordableCutawayFascia(roofGroup, {
                sheetRing: slabRing,
                roofRing: slabRing,
                ridgeAxis: roofRidgeAxis,
                slabTopY: wallTopY + dualFallSlabM,
                color: trimColor,
              });
              if (sheetRiseM > 0) {
                roofGroup.userData.riseM = sheetRiseM;
                roofStackM = dualFallSlabM + sheetRiseM;
              }
            }

            if (showHippedPlanes && hipRing?.length >= 3) {
              const roofData = buildHippedRoofMeshData(
              hipRing,
              eaveYM,
              HIPPED_ROOF_PITCH_DEG
            );
            const roofGeom = buildHippedRoofGeometry(
              hipRing,
              eaveYM,
              HIPPED_ROOF_PITCH_DEG
            );
            if (roofGeom && roofData) {
              const corrugated = createCorrugatedRoofTexture();
              corrugated.repeat.set(1, 1);
              const material = new THREE.MeshStandardMaterial({
                map: corrugated,
                color: finishHex.roof,
                roughness: 0.42,
                metalness: 0.35,
                side: THREE.DoubleSide,
              });
              const mesh = new THREE.Mesh(roofGeom, material);
              mesh.name = `${BUILDING_3D_PARTS.ROOF}-planes`;
              mesh.userData = {
                partId: BUILDING_3D_PARTS.ROOF,
                partType: "hipped-roof",
                pitchDeg: HIPPED_ROOF_PITCH_DEG,
                eaveYM,
                gutterInsetM: ROOF_GUTTER_INSET_M,
              };
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              roofGroup.add(mesh);

              const outlineGeom = buildHippedRoofOutlineGeometry(
                hipRing,
                eaveYM,
                HIPPED_ROOF_PITCH_DEG
              );
              if (outlineGeom) {
                const outline = new THREE.LineSegments(
                  outlineGeom,
                  new THREE.LineBasicMaterial({
                    color: finishHex.roof,
                    transparent: true,
                    opacity: 0.55,
                  })
                );
                outline.name = `${BUILDING_3D_PARTS.ROOF}-outline`;
                roofGroup.add(outline);
              }

              roofGroup.userData.riseM = roofData.maxRiseM;
              hipOk = true;
              roofStackM = ROOF_SLAB_THICKNESS_M + roofData.maxRiseM;
            }
            }
          }

          hasRoofSlab = slabOk || hipOk;
          if (hasRoofSlab && !(roofStackM > 0)) {
            roofStackM = showSkillionSlab
              ? SKILLION_ROOF_SLAB_THICKNESS_M
              : showHippedPlanes
                ? ROOF_SLAB_THICKNESS_M
                : AFFORDABLE_ROOF_SLAB_THICKNESS_M;
          }
        }
      }
      modelGroup.userData = {
        ...(modelGroup.userData || {}),
        hasRoofSlab,
        roofThicknessM: hasRoofSlab ? roofStackM : 0,
        roofPitchDeg: hasRoofSlab
          ? isSuperiorSkillionRoofStyle(finishes?.roofStyle)
            ? SKILLION_ROOF_PITCH_DEG
            : isSuperiorHippedRoofStyle(finishes?.roofStyle)
              ? HIPPED_ROOF_PITCH_DEG
              : AFFORDABLE_ROOF_PITCH_DEG
          : 0,
      };

      // Windows: 5 mm glass centred on the 90 mm stud. Surround/frame stay on
      // the exterior cladding face.
      if (modelWindows.length) {
        const windowsGroup = new THREE.Group();
        windowsGroup.name = BUILDING_3D_PARTS.WINDOWS;
        windowsGroup.userData = {
          partId: BUILDING_3D_PARTS.WINDOWS,
          partType: "windows",
          heightM: WINDOW_HEIGHT_M,
          topAboveSubfloorM: WINDOW_TOP_ABOVE_SUBFLOOR_M,
          count: modelWindows.length,
        };
        modelGroup.add(windowsGroup);

        // Window heads are always 2.1 m above the subfloor; the opening extends down
        // by the per-window height, so the top edge stays fixed.
        const topY = subfloorHeightM + WINDOW_TOP_ABOVE_SUBFLOOR_M;
        const glassOffset = -FRAME_TIMBER_DEPTH_M / 2;

        modelWindows.forEach((win, index) => {
          const winHeight = win.heightM > 0 ? win.heightM : WINDOW_HEIGHT_M;
          const bottomY = topY - winHeight;
          const centerY = (topY + bottomY) / 2;
          const geometry = new THREE.BoxGeometry(
            win.lengthM,
            winHeight,
            WINDOW_PANEL_THICKNESS_M
          );
          const material = new THREE.MeshPhysicalMaterial({
            color: WINDOW_COLOR,
            transparent: true,
            opacity: 0.32,
            roughness: 0.06,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            reflectivity: 0.62,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = `window-${index + 1}`;
          mesh.userData = {
            partId: `window-${index + 1}`,
            partType: "window",
            widthM: win.lengthM,
            heightM: winHeight,
          };
          const rotY = Math.atan2(-win.dirZ, win.dirX);
          mesh.position.set(
            win.midX + win.normalX * glassOffset,
            centerY,
            win.midZ + win.normalZ * glassOffset
          );
          mesh.rotation.y = rotY;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          windowsGroup.add(mesh);

          const halfLen = win.lengthM / 2;
          const halfHeight = winHeight / 2;

          const addBar = (name, partType, { sizeAlong, sizeVertical, thickness, sCenter, vCenter, depthOffset, color }) => {
            const barMaterial = new THREE.MeshStandardMaterial({
              color,
              roughness: 0.7,
              metalness: 0.05,
            });
            const bar = new THREE.Mesh(
              new THREE.BoxGeometry(sizeAlong, sizeVertical, thickness),
              barMaterial
            );
            bar.name = name;
            bar.userData = { partId: name, partType };
            bar.position.set(
              win.midX + win.dirX * sCenter + win.normalX * depthOffset,
              centerY + vCenter,
              win.midZ + win.dirZ * sCenter + win.normalZ * depthOffset
            );
            bar.rotation.y = rotY;
            bar.castShadow = true;
            bar.receiveShadow = true;

            const outline = new THREE.LineSegments(
              new THREE.EdgesGeometry(bar.geometry),
              new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
            );
            outline.name = `${name}-outline`;
            outline.userData = { partId: `${name}-outline`, partType: `${partType}-outline` };
            bar.add(outline);

            windowsGroup.add(bar);
          };

          const addRingFrame = (name, partType, { outerHalfLen, outerHalfH, band, thickness, depthOffset, color }) => {
            const innerHalfLen = Math.max(outerHalfLen - band, 0.001);
            const innerHalfH = Math.max(outerHalfH - band, 0.001);
            const shape = new THREE.Shape();
            shape.moveTo(-outerHalfLen, -outerHalfH);
            shape.lineTo(outerHalfLen, -outerHalfH);
            shape.lineTo(outerHalfLen, outerHalfH);
            shape.lineTo(-outerHalfLen, outerHalfH);
            shape.closePath();
            const hole = new THREE.Path();
            hole.moveTo(-innerHalfLen, -innerHalfH);
            hole.lineTo(innerHalfLen, -innerHalfH);
            hole.lineTo(innerHalfLen, innerHalfH);
            hole.lineTo(-innerHalfLen, innerHalfH);
            hole.closePath();
            shape.holes.push(hole);
            const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
            geo.translate(0, 0, -thickness / 2);
            geo.computeVertexNormals();
            const ringMesh = new THREE.Mesh(
              geo,
              new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 })
            );
            ringMesh.name = name;
            ringMesh.userData = { partId: name, partType };
            ringMesh.position.set(
              win.midX + win.normalX * depthOffset,
              centerY,
              win.midZ + win.normalZ * depthOffset
            );
            ringMesh.rotation.y = rotY;
            ringMesh.castShadow = true;
            ringMesh.receiveShadow = true;
            const outline = new THREE.LineSegments(
              new THREE.EdgesGeometry(geo),
              new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
            );
            outline.name = `${name}-outline`;
            outline.userData = { partId: `${name}-outline`, partType: `${partType}-outline` };
            ringMesh.add(outline);
            windowsGroup.add(ringMesh);
          };

          // Exterior surround sits on the weatherboard face so the full
          // thickness stands proud of the timber frame.
          {
            const band = WINDOW_SURROUND_WIDTH_M;
            const surroundBackM =
              WEATHERBOARD_FRAME_GAP_M + WEATHERBOARD_THICKNESS_M;
            addRingFrame(`window-${index + 1}-surround`, "window-surround", {
              outerHalfLen: halfLen + band,
              outerHalfH: halfHeight + band,
              band,
              thickness: WINDOW_SURROUND_THICKNESS_M,
              depthOffset: surroundBackM + WINDOW_SURROUND_THICKNESS_M / 2,
              color: finishHex.windowSurrounds,
            });
          }

          // Exterior frame on the outer face of the opening (stays within/outward of the wall).
          {
            const band = WINDOW_FRAME_WIDTH_M;
            const frameDepth = -WINDOW_FRAME_THICKNESS_M / 2;
            const innerHeight = Math.max(winHeight - band * 2, 0.001);
            const opts = {
              thickness: WINDOW_FRAME_THICKNESS_M,
              depthOffset: frameDepth,
              color: finishHex.windowFrames,
            };
            addRingFrame(`window-${index + 1}-frame`, "window-frame", {
              outerHalfLen: halfLen,
              outerHalfH: halfHeight,
              band,
              thickness: WINDOW_FRAME_THICKNESS_M,
              depthOffset: frameDepth,
              color: finishHex.windowFrames,
            });

            if (win.lengthM > WINDOW_MULLION_MIN_WIDTH_M) {
              addBar(`window-${index + 1}-frame-mullion`, "window-frame", {
                ...opts,
                sizeAlong: WINDOW_MULLION_WIDTH_M,
                sizeVertical: innerHeight,
                sCenter: 0,
                vCenter: 0,
              });
            }

            if (winHeight >= WINDOW_TRANSOM_MIN_HEIGHT_M - 0.001) {
              const innerWidth = Math.max(win.lengthM - band * 2, 0.001);
              addBar(`window-${index + 1}-frame-transom`, "window-frame", {
                ...opts,
                sizeAlong: innerWidth,
                sizeVertical: WINDOW_MULLION_WIDTH_M,
                sCenter: 0,
                vCenter: -halfHeight + winHeight * WINDOW_TRANSOM_SPLIT_FRACTION,
              });
            }
          }
        });
      }

      // Doors: 2.1 m leaf inset 70 mm into the cladding, with four 5 mm glass lights.
      if (modelDoors.length) {
        const doorsGroup = new THREE.Group();
        doorsGroup.name = BUILDING_3D_PARTS.DOORS;
        doorsGroup.userData = {
          partId: BUILDING_3D_PARTS.DOORS,
          partType: "doors",
          heightM: DOOR_HEIGHT_M,
          insetM: DOOR_INSET_M,
          count: modelDoors.length,
        };
        modelGroup.add(doorsGroup);

        const doorBottomY = subfloorHeightM;
        const doorCenterY = doorBottomY + DOOR_HEIGHT_M / 2;

        modelDoors.forEach((door, index) => {
          const halfLen = door.lengthM / 2;
          const halfHeight = DOOR_HEIGHT_M / 2;
          const glassWidth = Math.max(door.lengthM - DOOR_GLASS_SIDE_MARGIN_M * 2, 0.05);
          const glassSpan =
            DOOR_HEIGHT_M -
            DOOR_GLASS_FIRST_BOTTOM_M -
            DOOR_GLASS_TOP_MARGIN_M -
            DOOR_GLASS_COUNT * DOOR_GLASS_HEIGHT_M;
          const glassGap =
            DOOR_GLASS_COUNT > 1 ? glassSpan / (DOOR_GLASS_COUNT - 1) : 0;
          const glassVCenters = [];
          for (let g = 0; g < DOOR_GLASS_COUNT; g += 1) {
            const panelBottom =
              DOOR_GLASS_FIRST_BOTTOM_M + g * (DOOR_GLASS_HEIGHT_M + glassGap);
            glassVCenters.push(panelBottom + DOOR_GLASS_HEIGHT_M / 2 - halfHeight);
          }

          // Outer face sits just proud of the notch back wall (avoids z-fighting).
          const doorFaceOffset = -(DOOR_INSET_M - DOOR_INSET_CLEARANCE_M);
          const offset = doorFaceOffset - DOOR_PANEL_THICKNESS_M / 2;
          const rotY = Math.atan2(-door.dirZ, door.dirX);

          const doorShape = new THREE.Shape();
          doorShape.moveTo(-halfLen, -halfHeight);
          doorShape.lineTo(halfLen, -halfHeight);
          doorShape.lineTo(halfLen, halfHeight);
          doorShape.lineTo(-halfLen, halfHeight);
          doorShape.closePath();
          const holeHalfW = glassWidth / 2;
          const holeHalfH = DOOR_GLASS_HEIGHT_M / 2;
          for (const vCenter of glassVCenters) {
            const hole = new THREE.Path();
            hole.moveTo(-holeHalfW, vCenter - holeHalfH);
            hole.lineTo(holeHalfW, vCenter - holeHalfH);
            hole.lineTo(holeHalfW, vCenter + holeHalfH);
            hole.lineTo(-holeHalfW, vCenter + holeHalfH);
            hole.closePath();
            doorShape.holes.push(hole);
          }
          const geometry = new THREE.ExtrudeGeometry(doorShape, {
            depth: DOOR_PANEL_THICKNESS_M,
            bevelEnabled: false,
            steps: 1,
          });
          geometry.translate(0, 0, -DOOR_PANEL_THICKNESS_M / 2);
          geometry.computeVertexNormals();
          const material = new THREE.MeshStandardMaterial({
            color: finishHex.frontDoor,
            roughness: 0.7,
            metalness: 0.05,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = `door-${index + 1}`;
          mesh.userData = {
            partId: `door-${index + 1}`,
            partType: "door",
            widthM: door.lengthM,
            heightM: DOOR_HEIGHT_M,
          };
          mesh.position.set(
            door.midX + door.normalX * offset,
            doorCenterY,
            door.midZ + door.normalZ * offset
          );
          mesh.rotation.y = rotY;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          doorsGroup.add(mesh);

          const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: WINDOW_COLOR,
            transparent: true,
            opacity: 0.32,
            roughness: 0.06,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            reflectivity: 0.62,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          glassVCenters.forEach((vCenter, g) => {
            const glass = new THREE.Mesh(
              new THREE.BoxGeometry(
                glassWidth,
                DOOR_GLASS_HEIGHT_M,
                WINDOW_PANEL_THICKNESS_M
              ),
              glassMaterial
            );
            glass.name = `door-${index + 1}-glass-${g + 1}`;
            glass.userData = { partId: glass.name, partType: "door-glass" };
            glass.position.set(
              door.midX + door.normalX * offset,
              doorCenterY + vCenter,
              door.midZ + door.normalZ * offset
            );
            glass.rotation.y = rotY;
            glass.castShadow = false;
            glass.receiveShadow = false;
            doorsGroup.add(glass);
          });

          // Sides plus a 20 mm head under the door head plate (not up to the lintel).
          addDoorJambInfill(doorsGroup, {
            door,
            rotY,
            halfLen,
            halfHeight,
            doorCenterY,
            doorBottomY,
            color: finishHex.frontDoor,
            name: `door-${index + 1}-infill`,
            partType: "door-infill",
            includeHead: true,
          });

          addDoorUSurround(doorsGroup, {
            door,
            rotY,
            halfLen,
            halfHeight,
            doorCenterY,
            color: finishHex.windowSurrounds,
            name: `door-${index + 1}-surround`,
            partType: "door-surround",
          });
        });
      }

      // Sliding doors: 5 mm glass centred on the 90 mm stud (same as windows),
      // plus frame, mullions, side + head infill, and a U surround (no sill).
      if (modelSlidingDoors.length) {
        const slidingGroup = new THREE.Group();
        slidingGroup.name = BUILDING_3D_PARTS.SLIDING_DOORS;
        slidingGroup.userData = {
          partId: BUILDING_3D_PARTS.SLIDING_DOORS,
          partType: "sliding-doors",
          heightM: DOOR_HEIGHT_M,
          insetM: DOOR_INSET_M,
          count: modelSlidingDoors.length,
        };
        modelGroup.add(slidingGroup);

        const doorBottomY = subfloorHeightM;
        const doorCenterY = doorBottomY + DOOR_HEIGHT_M / 2;
        const slidingGlassMaterial = new THREE.MeshPhysicalMaterial({
          color: WINDOW_COLOR,
          transparent: true,
          opacity: 0.32,
          roughness: 0.06,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          reflectivity: 0.62,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const glassOffset = -FRAME_TIMBER_DEPTH_M / 2;

        modelSlidingDoors.forEach((door, index) => {
          const rotY = Math.atan2(-door.dirZ, door.dirX);
          const halfLen = door.lengthM / 2;
          const halfHeight = DOOR_HEIGHT_M / 2;

          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(
              door.lengthM,
              DOOR_HEIGHT_M,
              WINDOW_PANEL_THICKNESS_M
            ),
            slidingGlassMaterial
          );
          glass.name = `sliding-door-${index + 1}-glass`;
          glass.userData = {
            partId: glass.name,
            partType: "sliding-door-glass",
            widthM: door.lengthM,
            heightM: DOOR_HEIGHT_M,
          };
          glass.position.set(
            door.midX + door.normalX * glassOffset,
            doorCenterY,
            door.midZ + door.normalZ * glassOffset
          );
          glass.rotation.y = rotY;
          glass.castShadow = false;
          glass.receiveShadow = false;
          slidingGroup.add(glass);

          addDoorJambInfill(slidingGroup, {
            door,
            rotY,
            halfLen,
            halfHeight,
            doorCenterY,
            doorBottomY,
            color: finishHex.frontDoor,
            name: `sliding-door-${index + 1}-infill`,
            partType: "sliding-door-infill",
            includeHead: true,
          });

          addDoorUSurround(slidingGroup, {
            door,
            rotY,
            halfLen,
            halfHeight,
            doorCenterY,
            color: finishHex.windowSurrounds,
            name: `sliding-door-${index + 1}-surround`,
            partType: "sliding-door-surround",
          });

          // 50 mm frame over the glass, inset 20 mm from the top so the head
          // infill stays visible under the door head plate.
          {
            const frameBand = WINDOW_FRAME_WIDTH_M;
            const frameThickness = WINDOW_FRAME_THICKNESS_M;
            const frameDepthOffset = -WINDOW_FRAME_THICKNESS_M / 2;
            const headReveal = FRAME_SWING_DOOR_JAMB_OUTSET_M;
            const outerTop = halfHeight - headReveal;
            const outerBottom = -halfHeight;
            const innerLeft = -Math.max(halfLen - frameBand, 0.001);
            const innerRight = Math.max(halfLen - frameBand, 0.001);
            const innerTop = outerTop - frameBand;
            const innerBottom = outerBottom + frameBand;
            const frameShape = new THREE.Shape();
            frameShape.moveTo(-halfLen, outerBottom);
            frameShape.lineTo(halfLen, outerBottom);
            frameShape.lineTo(halfLen, outerTop);
            frameShape.lineTo(-halfLen, outerTop);
            frameShape.closePath();
            const frameHole = new THREE.Path();
            frameHole.moveTo(innerLeft, innerBottom);
            frameHole.lineTo(innerRight, innerBottom);
            frameHole.lineTo(innerRight, innerTop);
            frameHole.lineTo(innerLeft, innerTop);
            frameHole.closePath();
            frameShape.holes.push(frameHole);
            const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
              depth: frameThickness,
              bevelEnabled: false,
              steps: 1,
            });
            frameGeo.translate(0, 0, -frameThickness / 2);
            frameGeo.computeVertexNormals();
            const frame = new THREE.Mesh(
              frameGeo,
              new THREE.MeshStandardMaterial({
                color: finishHex.windowFrames,
                roughness: 0.7,
                metalness: 0.05,
              })
            );
            frame.name = `sliding-door-${index + 1}-frame`;
            frame.userData = { partId: frame.name, partType: "sliding-door-frame" };
            frame.position.set(
              door.midX + door.normalX * frameDepthOffset,
              doorCenterY,
              door.midZ + door.normalZ * frameDepthOffset
            );
            frame.rotation.y = rotY;
            frame.castShadow = true;
            frame.receiveShadow = true;
            const frameOutline = new THREE.LineSegments(
              new THREE.EdgesGeometry(frameGeo),
              new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
            );
            frameOutline.name = `${frame.name}-outline`;
            frame.add(frameOutline);
            slidingGroup.add(frame);

            // Vertical frame divider(s) between the top and bottom frame bars.
            const innerHeight = Math.max(innerTop - innerBottom, 0.001);
            const mullionDepthOffset = frameDepthOffset;
            const innerHalfLen = innerRight;
            const mullionCenters =
              door.lengthM > SLIDING_DOOR_DOUBLE_MULLION_MIN_WIDTH_M
                ? [-innerHalfLen / 3, innerHalfLen / 3]
                : [0];
            const mullionY = doorCenterY + (innerTop + innerBottom) / 2;
            mullionCenters.forEach((sCenter, mIndex) => {
              const mullion = new THREE.Mesh(
                new THREE.BoxGeometry(
                  WINDOW_MULLION_WIDTH_M,
                  innerHeight,
                  frameThickness
                ),
                new THREE.MeshStandardMaterial({
                  color: finishHex.windowFrames,
                  roughness: 0.7,
                  metalness: 0.05,
                })
              );
              mullion.name = `sliding-door-${index + 1}-mullion-${mIndex + 1}`;
              mullion.userData = {
                partId: mullion.name,
                partType: "sliding-door-frame",
              };
              mullion.position.set(
                door.midX + door.dirX * sCenter + door.normalX * mullionDepthOffset,
                mullionY,
                door.midZ + door.dirZ * sCenter + door.normalZ * mullionDepthOffset
              );
              mullion.rotation.y = rotY;
              mullion.castShadow = true;
              mullion.receiveShadow = true;
              const mullionOutline = new THREE.LineSegments(
                new THREE.EdgesGeometry(mullion.geometry),
                new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
              );
              mullionOutline.name = `${mullion.name}-outline`;
              mullion.add(mullionOutline);
              slidingGroup.add(mullion);
            });
          }
        });
      }

      if (typeof buildModel === "function") {
        buildModel({
          group: modelGroup,
          THREE,
          parts: BUILDING_3D_PARTS,
          getPart: (partId) => modelGroup.getObjectByName(partId),
          dimensions: {
            widthM: bounds.widthM,
            depthM: bounds.depthM,
            subfloorHeightM,
            wallHeightM: CLADDING_HEIGHT_M,
          },
          footprintRing: ring,
          fromTrace,
        });
      }
        }

        // Building meshes self-shadow in a striped pattern (shadow-map acne)
        // across weatherboards, floor, and frame. Cast onto the ground only.
        modelGroup.traverse((obj) => {
          if (obj.isMesh || obj.isInstancedMesh) obj.receiveShadow = false;
        });

        applyVisibilityRef.current = (vis) =>
          applyBuildingElementVisibility(
            scene,
            modelGroup,
            vis,
            claddingTypeRef.current
          );
        applyVisibilityRef.current(elementVisibilityRef.current);
        setError("");
      } catch (err) {
        setError(err?.message || "Could not build the 3D unit");
      }

      lastContentKeys = keys;
      applyCameraLimits(bounds, p);
    }

    const grassTexture = textureLoader.load(grassImage);
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      grassTexture.colorSpace = THREE.SRGBColorSpace;
      // ~4 m per tile
      const grassRepeat = Math.max(6, groundSize * 0.25);
      grassTexture.repeat.set(grassRepeat, grassRepeat);
      grassTexture.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(groundSize, groundSize),
        new THREE.MeshStandardMaterial({
          map: grassTexture,
          roughness: 0.92,
          metalness: 0.02,
        })
      );
      ground.name = "grass-ground";
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.01;
      ground.receiveShadow = true;
      scene.add(ground);
      addTimberBoundaryFence(scene, groundSize);

    const initialP = paramsRef.current;
    const initBounds = footprintBounds(
      resolveBuildingFootprintRing(
        initialP.footprintPoints,
        initialP.widthM,
        initialP.depthM,
        initialP.calibration
      ).ring
    );
    let spanM = Math.max(initBounds.spanX, initBounds.spanZ, 1);
    const buildingHeightM =
      initialP.subfloorHeightM +
      initialP.CLADDING_HEIGHT_M +
      (Number(modelGroup.userData?.roofThicknessM) > 0
        ? Number(modelGroup.userData.roofThicknessM)
        : 0);
    let externalFocusY = buildingHeightM / 2;
    const target = new THREE.Vector3(0, externalFocusY, 0);
    // Internal + external orbit use theta/distance; Walk mode uses free pose.
    let theta = Math.PI / 4;
    let distance = spanM * 1.25 + 4;
    let minDistance = spanM * 0.65;
    let maxDistance = spanM * 3.5;
    let walkX = distance * Math.sin(theta);
    let walkZ = distance * Math.cos(theta);
    let yaw = theta + Math.PI;
    let cameraHeight = initialP.eyeHeightM;
    let internalCameraHeight = INTERNAL_VIEW_CAMERA_HEIGHT_M;
    const savedPose = persistedViewPose.current;
    if (savedPose) {
      theta = savedPose.theta;
      distance = Math.max(minDistance, Math.min(maxDistance, savedPose.distance));
      walkX = savedPose.walkX;
      walkZ = savedPose.walkZ;
      yaw = savedPose.yaw;
      internalCameraHeight = savedPose.internalCameraHeight;
      if (Number.isFinite(savedPose.targetX) && Number.isFinite(savedPose.targetZ)) {
        target.x = savedPose.targetX;
        target.z = savedPose.targetZ;
      }
      if (Number.isFinite(savedPose.externalCameraHeight)) {
        externalCameraHeightRef.current = savedPose.externalCameraHeight;
        cameraHeightUserSetRef.current = true;
      }
    } else if (!cameraHeightUserSetRef.current) {
      externalCameraHeightRef.current = initialP.eyeHeightM;
    }
    let camX = target.x + distance * Math.sin(theta);
    let camZ = target.z + distance * Math.cos(theta);
    const keysDown = new Set();
    let lastFrameTs = performance.now();

    const syncCursor = () => {
      if (viewModeRef.current === VIEW_MODE_INTERNAL) {
        container.style.cursor = "grab";
      } else if (walkModeRef.current) {
        container.style.cursor = "crosshair";
      } else {
        container.style.cursor = "grab";
      }
    };

    const persistViewPose = () => {
      persistedViewPose.current = {
        theta,
        distance,
        walkX,
        walkZ,
        yaw,
        targetX: target.x,
        targetZ: target.z,
        internalCameraHeight,
        externalCameraHeight: externalCameraHeightRef.current,
      };
    };

    const syncCamFromOrbit = () => {
      camX = target.x + distance * Math.sin(theta);
      camZ = target.z + distance * Math.cos(theta);
    };
    const syncTargetFromCam = () => {
      target.x = camX - distance * Math.sin(theta);
      target.z = camZ - distance * Math.cos(theta);
    };

    const updateCamera = () => {
      const internal = viewModeRef.current === VIEW_MODE_INTERNAL;
      if (internal) {
        target.y = INTERNAL_VIEW_FOCUS_Y_M;
        camera.position.set(camX, internalCameraHeight, camZ);
        camera.lookAt(target.x, INTERNAL_VIEW_FOCUS_Y_M, target.z);
        persistViewPose();
        return;
      }
      const height = externalCameraHeightRef.current;
      if (walkModeRef.current) {
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);
        camera.position.set(walkX, height, walkZ);
        camera.lookAt(walkX + forwardX, height, walkZ + forwardZ);
        persistViewPose();
        return;
      }
      target.y = externalFocusY;
      camera.position.set(camX, height, camZ);
      camera.lookAt(target.x, externalFocusY, target.z);
      persistViewPose();
    };

    applyWalkModeRef.current = (enabled) => {
      const next = Boolean(enabled);
      if (next === walkModeRef.current) {
        updateCamera();
        return;
      }
      if (next) {
        walkX = camX;
        walkZ = camZ;
        yaw = theta + Math.PI;
        keysDown.clear();
      } else {
        const d = Math.hypot(walkX, walkZ);
        distance = Math.max(minDistance, Math.min(maxDistance, d || distance));
        if (d > 1e-6) theta = Math.atan2(walkX, walkZ);
        camX = walkX;
        camZ = walkZ;
        syncTargetFromCam();
        keysDown.clear();
      }
      walkModeRef.current = next;
      syncCursor();
      updateCamera();
    };

    applyViewModeRef.current = (mode) => {
      const next =
        mode === VIEW_MODE_INTERNAL ? VIEW_MODE_INTERNAL : VIEW_MODE_EXTERNAL;
      viewModeRef.current = next;
      if (next === VIEW_MODE_INTERNAL && walkModeRef.current) {
        walkModeRef.current = false;
        keysDown.clear();
      }
      cameraHeight = next === VIEW_MODE_INTERNAL
        ? internalCameraHeight
        : externalCameraHeightRef.current;
      if (next === VIEW_MODE_EXTERNAL && !cameraHeightUserSetRef.current) {
        externalCameraHeightRef.current = paramsRef.current?.eyeHeightM ?? EYE_HEIGHT_M;
      }
      cameraHeightRef.current = cameraHeight;
      syncCursor();
      updateCamera();
    };

    walkModeRef.current = false;
    if (!cameraHeightUserSetRef.current && !savedPose) {
      externalCameraHeightRef.current = initialP.eyeHeightM;
    }
    cameraHeight =
      viewModeRef.current === VIEW_MODE_INTERNAL
        ? internalCameraHeight
        : externalCameraHeightRef.current;
    cameraHeightRef.current = cameraHeight;
    syncCursor();
    updateCamera();

    applyCameraLimits = (bounds, p) => {
      spanM = Math.max(bounds.spanX, bounds.spanZ, 1);
      minDistance = spanM * 0.65;
      maxDistance = spanM * 3.5;
      distance = Math.max(minDistance, Math.min(maxDistance, distance));
      syncCamFromOrbit();
      const roofT =
        Number(modelGroup.userData?.roofThicknessM) > 0
          ? Number(modelGroup.userData.roofThicknessM)
          : 0;
      externalFocusY =
        (Number(p.subfloorHeightM) + Number(p.CLADDING_HEIGHT_M) + roofT) / 2;
      updateCamera();
    };
    rebuildBuilding();
    sceneApiRef.current = { rebuildBuilding };

    const isTypingTarget = (el) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement;

    const onWalkKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      const { code } = event;
      const moveOrHeightKey =
        code === "KeyQ" ||
        code === "KeyZ" ||
        code === "KeyW" ||
        code === "KeyA" ||
        code === "KeyD" ||
        code === "KeyX" ||
        code === "KeyS";
      if (!moveOrHeightKey) return;
      event.preventDefault();
      keysDown.add(code);
    };
    const onWalkKeyUp = (event) => {
      keysDown.delete(event.code);
    };

    window.addEventListener("keydown", onWalkKeyDown);
    window.addEventListener("keyup", onWalkKeyUp);

    let dragging = false;
    let pendingLookDx = 0;

    const onPointerLeave = (event) => {
      if (dragging) endDrag(event);
    };
    const onPointerDown = (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      dragging = true;
      container.setPointerCapture(event.pointerId);
      container.style.cursor = walkModeRef.current ? "crosshair" : "grabbing";
    };
    const onPointerMove = (event) => {
      const dx = event.movementX;
      if (!dx) return;
      if (walkModeRef.current) {
        pendingLookDx += dx;
        return;
      }
      if (!dragging) return;
      pendingLookDx += dx;
    };
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      try {
        container.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer may already have been released.
      }
      syncCursor();
    };
    const onWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const raw =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * 800
            : event.deltaY;
      if (viewModeRef.current === VIEW_MODE_INTERNAL) {
        const factor = Math.exp(raw * 0.0015);
        distance = Math.max(minDistance, Math.min(maxDistance, distance * factor));
        syncCamFromOrbit();
      } else if (walkModeRef.current) {
        const step = raw * 0.02;
        walkX -= Math.sin(yaw) * step;
        walkZ -= Math.cos(yaw) * step;
      } else {
        const factor = Math.exp(raw * 0.0015);
        distance = Math.max(minDistance, Math.min(maxDistance, distance * factor));
        syncCamFromOrbit();
      }
      updateCamera();
    };
    const onContextMenu = (event) => event.preventDefault();

    const canvas = renderer.domElement;
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointercancel", endDrag);
    container.addEventListener("pointerleave", onPointerLeave);
    // Listen on the canvas (hit target) and container so zoom always works.
    canvas.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("contextmenu", onContextMenu);
    syncCursor();
    container.style.touchAction = "none";

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width < 1 || height < 1) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const walkForward = new THREE.Vector3();
    const walkRight = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    const render = () => {
      if (disposed) return;
      animationId = requestAnimationFrame(render);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrameTs) / 1000);
      lastFrameTs = now;
      let camDirty = false;
      if (pendingLookDx !== 0) {
        const dx = pendingLookDx;
        pendingLookDx = 0;
        if (walkModeRef.current) {
          yaw -= dx * 0.008;
        } else {
          theta -= dx * 0.008;
          syncTargetFromCam();
        }
        camDirty = true;
      }
      if (keysDown.size > 0) {
        // A/W/D/X (S also back) pan the orbit target; drag/scroll/Q-Z stay as they are.
        camera.getWorldDirection(walkForward);
        walkForward.y = 0;
        if (walkForward.lengthSq() > 1e-8) walkForward.normalize();
        walkRight.crossVectors(walkForward, worldUp);
        if (walkRight.lengthSq() > 1e-8) walkRight.normalize();

        let moveX = 0;
        let moveZ = 0;
        if (keysDown.has("KeyW")) {
          moveX += walkForward.x;
          moveZ += walkForward.z;
        }
        if (keysDown.has("KeyX") || keysDown.has("KeyS")) {
          moveX -= walkForward.x;
          moveZ -= walkForward.z;
        }
        if (keysDown.has("KeyA")) {
          moveX -= walkRight.x;
          moveZ -= walkRight.z;
        }
        if (keysDown.has("KeyD")) {
          moveX += walkRight.x;
          moveZ += walkRight.z;
        }
        const len = Math.hypot(moveX, moveZ);
        if (len > 1e-6) {
          const step = (EXTERNAL_WALK_SPEED_M_S * dt) / len;
          camX += moveX * step;
          camZ += moveZ * step;
          target.x += moveX * step;
          target.z += moveZ * step;
          camDirty = true;
        }
      }
      if (keysDown.has("KeyQ") || keysDown.has("KeyZ")) {
        const dir = (keysDown.has("KeyQ") ? 1 : 0) + (keysDown.has("KeyZ") ? -1 : 0);
        if (dir !== 0) {
          const delta = dir * CAMERA_HEIGHT_SPEED_M_S * dt;
          if (viewModeRef.current === VIEW_MODE_INTERNAL) {
            internalCameraHeight = Math.max(
              2,
              Math.min(80, internalCameraHeight + delta)
            );
          } else {
            cameraHeightUserSetRef.current = true;
            externalCameraHeightRef.current = Math.max(
              CAMERA_HEIGHT_MIN_M,
              Math.min(CAMERA_HEIGHT_MAX_M, externalCameraHeightRef.current + delta)
            );
            cameraHeightRef.current = externalCameraHeightRef.current;
          }
          camDirty = true;
        }
      }
      if (camDirty) updateCamera();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      persistViewPose();
      disposed = true;
      sceneApiRef.current = null;
      captureRef.current = null;
      applyViewModeRef.current = null;
      applyWalkModeRef.current = null;
      applyVisibilityRef.current = null;
      if (animationId != null) cancelAnimationFrame(animationId);
      resizeObserver?.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", endDrag);
      container.removeEventListener("pointercancel", endDrag);
      container.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onWalkKeyDown);
      window.removeEventListener("keyup", onWalkKeyUp);
      disposeThreeObject(scene);
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (skipFirstBuildingRebuildRef.current) {
      skipFirstBuildingRebuildRef.current = false;
      return;
    }
    sceneApiRef.current?.rebuildBuilding?.();
  }, [
    buildModel,
    depthM,
    widthM,
    subfloorHeightM,
    wallHeightM,
    resolvedSubfloorType,
    bearerHeightM,
    joistHeightM,
    bearerWidthM,
    joistWidthM,
    bearerSpanMaxM,
    joistSpanMaxM,
    joistCentresM,
    footprintKey,
    roofPointsKey,
    roofPivotKey,
    roofRidgeAxisKey,
    deckPointsKey,
    kitchenBenchesKey,
    robesKey,
    windowsKey,
    doorsKey,
    slidingDoorsKey,
    internalWallsKey,
    internalDoorsKey,
    flooringPointsKey,
    hybridRegionsKey,
    tilesRegionsKey,
    carpetRegionsKey,
    flooringImagesKey,
    flooringScalesKey,
    calibrationKey,
    finishesKey,
    kitchenFinishesKey,
  ]);

  useEffect(() => {
    applyVisibilityRef.current?.(resolvedVisibility);
  }, [resolvedVisibility, claddingType]);

  function openRenderOptions() {
    if (renderBusy) return;
    setRenderError("");
    if (!projectId) {
      setRenderError("No project loaded — cannot generate a render.");
      return;
    }
    setRenderOptionsOpen(true);
  }

  async function handlePhotorealRender(timeOfDayOverride) {
    if (renderBusy) return;
    setRenderError("");
    if (!projectId) {
      setRenderError("No project loaded — cannot generate a render.");
      return;
    }
    const capture = captureRef.current?.capturePngDataUrl;
    if (typeof capture !== "function") {
      setRenderError("3D view is not ready yet.");
      return;
    }

    let imageDataUrl;
    try {
      imageDataUrl = capture();
    } catch (err) {
      setRenderError(err?.message || "Could not capture the current view.");
      return;
    }
    if (!imageDataUrl || !imageDataUrl.startsWith("data:image")) {
      setRenderError("Captured view was empty.");
      return;
    }

    const timeOfDay =
      typeof timeOfDayOverride === "string" && timeOfDayOverride
        ? timeOfDayOverride
        : renderTimeOfDay;

    setRenderOptionsOpen(false);
    setRenderBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/generate-3d-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          timeOfDay,
          finishes: finishes && typeof finishes === "object" ? finishes : undefined,
          materials: UNIT_MATERIAL_META,
          geometry: {
            subfloorHeightM,
            subfloorHeightMm: Math.round(subfloorHeightM * 1000),
            claddingHeightM: CLADDING_HEIGHT_M,
            wallHeightMm: Math.round(CLADDING_HEIGHT_M * 1000),
            claddingBoardCount: weatherboardRowTops(CLADDING_HEIGHT_M).length,
            claddingBoardHeightMm: Math.round(WEATHERBOARD_HEIGHT_M * 1000),
            claddingBoardThicknessMm: Math.round(WEATHERBOARD_THICKNESS_M * 1000),
            claddingBoardLapMm: Math.round(WEATHERBOARD_LAP_M * 1000),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Render failed (${response.status})`);
      }
      if (!data.imageDataUrl) {
        throw new Error("Render succeeded but no image was returned.");
      }
      setRenderImageUrl(data.imageDataUrl);
      setRenderFinishesUsed(data.finishesUsed || null);
      setLastRenderTimeOfDay(data.timeOfDay || timeOfDay);
    } catch (err) {
      setRenderError(err?.message || "Failed to generate photoreal render.");
    } finally {
      setRenderBusy(false);
    }
  }

  const footprintLabel = footprintPoints?.length >= 3 ? "traced plan footprint" : `${widthM.toFixed(1)} m × ${depthM.toFixed(1)} m`;
  const wallHeightMm = Math.round(CLADDING_HEIGHT_M * 1000);
  const subfloorHeightMm = Math.round(Number(subfloorHeightM) * 1000);
  const roofLabel =
    roofPoints?.length >= 3
      ? isSuperiorSkillionRoofStyle(finishes?.roofStyle)
        ? ` · Roof: ${SKILLION_ROOF_PITCH_DEG}° skillion slab (400 mm)`
        : isSuperiorHippedRoofStyle(finishes?.roofStyle)
          ? ` · Roof: 150 mm slab + ${HIPPED_ROOF_PITCH_DEG}° planes to ridge per edge`
          : ` · Roof: 100 mm slab + ${AFFORDABLE_ROOF_PITCH_DEG}° dual-fall sheet`
      : "";
  const deckLabel =
    resolvedDecks.length
      ? ` · Deck${resolvedDecks.length > 1 ? `s (${resolvedDecks.length})` : ""}: ${subfloorHeightMm} mm + timber top`
      : "";
  const kitchenBenchLabel =
    resolvedKitchenBenches.length
      ? ` · Kitchen bench${resolvedKitchenBenches.length > 1 ? `es (${resolvedKitchenBenches.length})` : ""}: cabinets to 879 mm + 20 mm benchtop`
      : "";
  const robesLabel =
    resolvedRobes.length
      ? ` · Robe${resolvedRobes.length > 1 ? `s (${resolvedRobes.length})` : ""}: ${wallHeightMm} mm slab on floor`
      : "";
  const headerBtnStyle = {
    padding: "7px 13px",
    color: UI.cardBg,
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: "8px",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  };
  const sideBtnStyle = ({ active = false, walk = false, disabled = false } = {}) => ({
    padding: "8px 14px",
    borderRadius: "8px",
    border:
      walk && active
        ? "1px solid rgba(22, 163, 74, 0.85)"
        : "1px solid #ddd",
    background: walk && active ? "rgba(34, 197, 94, 0.18)" : UI.cardBg,
    color: walk && active ? "#15803d" : UI.textPrimary,
    fontSize: "0.9rem",
    fontWeight: active ? 700 : 600,
    cursor: disabled ? "not-allowed" : "pointer",
    width: "100%",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
    textAlign: "center",
    opacity: disabled ? 0.65 : 1,
    minHeight: 40,
  });
  const controlsOnSide = Boolean(rightPanel || elementsPanel);
  const showElementsMenu = Boolean(elementsPanel) && (!rightPanel || sideMenuMode === "elements");
  const viewControlButtons = (placement) => {
    const side = placement === "side";
    return (
      <>
        <button
          type="button"
          onClick={openRenderOptions}
          disabled={renderBusy || !projectId}
          title={
            !projectId
              ? "Open from a project to enable AI render"
              : "Photoreal render of the current camera view"
          }
          style={
            side
              ? sideBtnStyle({ disabled: renderBusy || !projectId })
              : {
                  ...headerBtnStyle,
                  background: renderBusy ? "rgba(255,255,255,0.06)" : "rgba(94, 160, 255, 0.28)",
                  border: "1px solid rgba(140, 190, 255, 0.45)",
                  opacity: renderBusy || !projectId ? 0.65 : 1,
                  cursor: renderBusy || !projectId ? "not-allowed" : "pointer",
                }
          }
        >
          {renderBusy ? "Rendering…" : "Render"}
        </button>
        {elementsPanel && rightPanel ? (
          <button
            type="button"
            onClick={() =>
              setSideMenuMode((prev) => (prev === "edit" ? "elements" : "edit"))
            }
            title={
              sideMenuMode === "edit"
                ? "Show building element visibility"
                : "Back to the 3D edit menu"
            }
            style={
              side
                ? sideBtnStyle({ active: sideMenuMode === "elements" })
                : headerBtnStyle
            }
          >
            {sideMenuMode === "edit" ? "Building Elements" : "Edit"}
          </button>
        ) : null}
      </>
    );
  };

  return (
    <div
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-labelledby="building-3d-modal-title"
      onClick={() => {
        if (embedded || renderBusy || renderOptionsOpen) return;
        onClose?.();
      }}
      style={
        embedded
          ? {
              position: "relative",
              flex: 1,
              minHeight: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: controlsOnSide ? "row" : undefined,
              gap: controlsOnSide ? "16px" : undefined,
              boxSizing: "border-box",
              background: "transparent",
            }
          : {
              position: "fixed",
              inset: 0,
              zIndex: 1001,
              display: "flex",
              flexDirection: controlsOnSide ? "row" : undefined,
              alignItems: "stretch",
              gap: controlsOnSide ? "16px" : undefined,
              padding: "16px",
              boxSizing: "border-box",
              background: "rgba(0, 0, 0, 0.58)",
            }
      }
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: controlsOnSide ? undefined : "100%",
          height: "100%",
          flex: embedded || controlsOnSide ? 1 : undefined,
          minWidth: embedded || controlsOnSide ? 0 : undefined,
          minHeight: embedded || controlsOnSide ? 0 : undefined,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#6eb0e4",
          borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.28)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            padding: "12px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.28)",
            background: "linear-gradient(180deg, rgba(26, 95, 180, 0.55) 0%, rgba(110, 176, 228, 0.2) 100%)",
          }}
        >
          <div>
            <h2 id="building-3d-modal-title" style={{ margin: 0, color: UI.cardBg, fontSize: "1.35rem" }}>
              {title}
            </h2>
            {embedded ? null : (
            <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.68)", fontSize: "0.85rem" }}>
              Subfloor: {subfloorHeightMm} mm · {footprintLabel}
              {" · "}Weatherboards: {wallHeightMm} mm wall · 230 × 19 mm, 30 mm lap
              {deckLabel}
              {kitchenBenchLabel}
              {robesLabel}
              {roofLabel}
              {" · "}50 mm corner posts, 10 mm proud
              {" — "}
              {`${STANDING_EYE_ABOVE_FLOOR_M.toFixed(1)} m eye · drag to look around · scroll zoom · Q/Z height · A/W/D/X move`}
            </div>
            )}
          </div>
          {controlsOnSide && !onClose ? null : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            {controlsOnSide ? null : viewControlButtons("header")}
            {onClose ? (
            <button
              type="button"
              onClick={onClose}
              disabled={renderBusy}
              style={{
                ...headerBtnStyle,
                opacity: renderBusy ? 0.55 : 1,
                cursor: renderBusy ? "not-allowed" : "pointer",
              }}
            >
              Close
            </button>
            ) : null}
          </div>
          )}
        </div>

        {error ? (
          <div style={{ margin: "16px", padding: "12px", color: "#842029", background: "#fdecea", borderRadius: "8px" }}>
            {error}
          </div>
        ) : null}
        {renderError && !renderImageUrl ? (
          <div style={{ margin: "0 16px 12px", padding: "12px", color: "#842029", background: "#fdecea", borderRadius: "8px" }}>
            {renderError}
          </div>
        ) : null}
        <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {(renderBusy || renderImageUrl) && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                background: renderBusy ? "rgba(10, 14, 22, 0.72)" : "#0b1018",
              }}
            >
              {renderBusy ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    color: UI.cardBg,
                    padding: "24px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "1.15rem", fontWeight: 600 }}>Creating photoreal render…</div>
                  <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.7)", maxWidth: "420px" }}>
                    Using the current camera view. This usually takes a minute — grass, sky, trees, and lighting are added around the unit.
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 16px",
                      borderBottom: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.35)",
                    }}
                  >
                    <div>
                      <div style={{ color: UI.cardBg, fontWeight: 600 }}>Photoreal render</div>
                      {renderFinishesUsed ? (
                        <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.72)", fontSize: "0.8rem" }}>
                          Weatherboards: {renderFinishesUsed.cladding}
                          {" · "}
                          Baseboards: {renderFinishesUsed.baseboards}
                          {" · "}
                          Roof: {renderFinishesUsed.roof}
                          {lastRenderTimeOfDay
                            ? ` · ${
                                RENDER_TIME_OF_DAY_OPTIONS.find((o) => o.value === lastRenderTimeOfDay)
                                  ?.label || lastRenderTimeOfDay
                              }`
                            : ""}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <a
                        href={renderImageUrl}
                        download="AI-3D-Render.png"
                        style={{ ...headerBtnStyle, textDecoration: "none", display: "inline-block" }}
                      >
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setRenderImageUrl(null);
                          setRenderFinishesUsed(null);
                          setLastRenderTimeOfDay(null);
                          setRenderError("");
                        }}
                        style={headerBtnStyle}
                      >
                        Back to 3D
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "16px",
                      overflow: "auto",
                    }}
                  >
                    <img
                      src={renderImageUrl}
                      alt="Photoreal AI render of the 3D unit"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                        borderRadius: "8px",
                        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {controlsOnSide ? (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "240px",
            flexShrink: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            overflow: "visible",
            position: "relative",
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            {viewControlButtons("side")}
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: showElementsMenu ? "hidden" : "visible",
            }}
          >
            {showElementsMenu ? elementsPanel : rightPanel}
          </div>
        </div>
      ) : null}

      {renderOptionsOpen && !renderBusy ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="render-options-title"
          onClick={() => setRenderOptionsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0, 0, 0, 0.45)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: UI.cardBg || "#fff",
              borderRadius: "12px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
              padding: "22px 24px",
              color: UI.textPrimary,
            }}
          >
            <h3 id="render-options-title" style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>
              Render options
            </h3>
            <p style={{ margin: "0 0 18px", fontSize: "0.9rem", opacity: 0.75, lineHeight: 1.4 }}>
              Choose the lighting for this photoreal render. Geometry and finishes stay the same.
            </p>
            <label
              htmlFor="render-time-of-day"
              style={{ display: "block", fontWeight: 600, fontSize: "0.92rem", marginBottom: "8px" }}
            >
              Time of Day
            </label>
            <select
              id="render-time-of-day"
              value={renderTimeOfDay}
              onChange={(e) => setRenderTimeOfDay(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.18)",
                fontSize: "1rem",
                background: "#fff",
                color: "inherit",
                boxSizing: "border-box",
              }}
            >
              {RENDER_TIME_OF_DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div style={{ marginTop: "10px", fontSize: "0.82rem", opacity: 0.7, lineHeight: 1.35 }}>
              {renderTimeOfDay === "evening"
                ? "Evening: dusk lighting with interior and exterior lights on."
                : renderTimeOfDay === "late_afternoon"
                  ? "Late afternoon: warm sunset / golden-hour light."
                  : "Morning: fresh soft daylight."}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                onClick={() => setRenderOptionsOpen(false)}
                style={{
                  padding: "9px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "transparent",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handlePhotorealRender(renderTimeOfDay)}
                style={{
                  padding: "9px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(40, 110, 200, 0.45)",
                  background: "rgba(94, 160, 255, 0.35)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Create render
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
