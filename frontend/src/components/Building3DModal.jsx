import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { disposeThreeObject } from "../utils/siteBoundary3DRender";
import {
  buildFootprintSlabGeometry,
  buildFootprintSlabOutlineGeometry,
  buildFootprintWallBandGeometry,
  buildFootprintWallBandOutlineGeometry,
  buildFootprintCladdingFaceParts,
  CLADDING_WALL_THICKNESS_M,
  footprintBounds,
  footprintCornerColumnCenters,
  resolveAlignedTraceRing,
  resolveBuildingFootprintRing,
  resolveModelDoors,
  resolveModelInternalDoors,
  resolveModelSlidingDoors,
  resolveModelWindows,
  sanitizeFootprintRing,
} from "../utils/buildingUnitGeometry";
import { parseFlooringRegions } from "../utils/planTracePolygon";
import { fetchAuthedImageBlobUrl } from "../utils/authedImageCache";
import {
  resolveUnitFinishHexes,
  UNIT_MATERIAL_META,
} from "../utils/buildingUnitFinishes.js";
import {
  assignTimberDeckUVs,
  createTimberDeckMaterial,
  createTimberDeckTexture,
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
  buildSkillionRoofSlabGeometry,
  buildSkillionRoofSlabMeshData,
  buildSkillionRoofSlabOutlineGeometry,
  clipRingToSkillionMinRise,
  resolveSkillionPitch,
  skillionExtraCladdingBands,
  skillionMaxWallRiseM,
  skillionUndersideRiseM,
  SKILLION_ROOF_PITCH_DEG,
  SKILLION_ROOF_SLAB_THICKNESS_M,
} from "../utils/skillionRoofGeometry.js";
import {
  getTracePlanXZMapping,
  normalizedPointToXZ,
  offsetPolygonInward,
  buildTraceInternalWallsGeometry,
} from "../utils/tracePlan3D.js";
import {
  createCorrugatedRoofTexture,
} from "../utils/corrugatedRoofTexture.js";
import grassImage from "../images/grass.jpg";
import skyImage from "../images/sky.jpg";
import { UI } from "../utils/uiThemeTokens.js";

export const BUILDING_3D_PARTS = Object.freeze({
  SUBFLOOR: "subfloor",
  SUBFLOOR_LAYER_1: "subfloor-layer-1",
  SUBFLOOR_LAYER_2: "subfloor-layer-2",
  SUBFLOOR_LAYER_3: "subfloor-layer-3",
  CORNER_COLUMNS: "corner-columns",
  DECK: "deck",
  DECK_LAYER_1: "deck-layer-1",
  DECK_LAYER_2: "deck-layer-2",
  DECK_LAYER_3: "deck-layer-3",
  DECK_TOP: "deck-top",
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
  INTERNAL_DOORS: "internal-doors",
  KITCHEN_BENCH: "kitchen-bench",
  KITCHEN_CABINET: "kitchen-cabinet",
  KITCHEN_BENCHTOP: "kitchen-benchtop",
  ROBES: "robes",
});

/** Standing eye height (1.8 m) above the 650 mm subfloor. */
const EYE_HEIGHT_M = 2.45;
const CAMERA_HEIGHT_STEP_M = 0.1;
const CAMERA_HEIGHT_MIN_M = 0.5;
/** Overhead interior orbit: fixed eye height, look-at on the floor. */
const INTERNAL_VIEW_CAMERA_HEIGHT_M = 15;
const INTERNAL_VIEW_FOCUS_Y_M = 0;
const VIEW_MODE_EXTERNAL = "external";
const VIEW_MODE_INTERNAL = "internal";
/** External walk speed (metres per second) — no collision. */
const EXTERNAL_WALK_SPEED_M_S = 4.5;
/** Thin finish layer on top of the subfloor. */
const FLOOR_FINISH_THICKNESS_M = 0.008;
const FLOOR_FINISH_Y_EPS_M = 0.002;
/** Kitchen: cabinetry 0–879 mm, benchtop slab 880–900 mm (above subfloor). */
const KITCHEN_CABINET_TOP_M = 0.879;
const KITCHEN_BENCHTOP_BOTTOM_M = 0.88;
const KITCHEN_BENCHTOP_TOP_M = 0.9;
const KITCHEN_CABINET_FALLBACK_COLOR = 0xb8b4af;
const KITCHEN_BENCHTOP_FALLBACK_COLOR = 0xd6d3d1;
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
const CORNER_COLUMN_PROJECTION_M = 0.005;
/** Thin timber board cap on the top deck slab. */
const DECK_TOP_CAP_THICKNESS_M = 0.008;
const CLADDING_LAYER_COUNT = 1;
/** Single cladding slab (weatherboard texture to be applied later). */
const CLADDING_LAYER_HEIGHT_M = 2.6;
const CLADDING_HEIGHT_M = CLADDING_LAYER_COUNT * CLADDING_LAYER_HEIGHT_M;
const WINDOW_HEIGHT_M = 1.8;
const WINDOW_TOP_ABOVE_SUBFLOOR_M = 2.1;
const WINDOW_PANEL_THICKNESS_M = 0.01;
const WINDOW_PROUD_M = 0;
const WINDOW_COLOR = 0x2b322c;
const WINDOW_SURROUND_THICKNESS_M = 0.03;
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
/** 100 mm surround on left/right/top, proud of the cladding (no bottom). */
const DOOR_SURROUND_WIDTH_M = 0.1;
const DOOR_SURROUND_THICKNESS_M = 0.03;
/** Four glass lights: 100 mm high, door width minus 100 mm each side, first at 300 mm up. */
const DOOR_GLASS_COUNT = 4;
const DOOR_GLASS_HEIGHT_M = 0.1;
const DOOR_GLASS_SIDE_MARGIN_M = 0.1;
const DOOR_GLASS_FIRST_BOTTOM_M = 0.3;
const DOOR_GLASS_TOP_MARGIN_M = 0.3;
const DOOR_GLASS_THICKNESS_M = 0.003;
const DOOR_GLASS_COLOR = 0x2b322c;
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
  if (outlineGeometry) {
    const outline = new THREE.LineSegments(
      outlineGeometry,
      new THREE.LineBasicMaterial({ color: outlineColor })
    );
    outline.name = `${partId}-outline`;
    parent.add(outline);
  }

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
  column.castShadow = true;
  column.receiveShadow = true;
  parent.add(column);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x202124 })
  );
  outline.name = `${partId}-outline`;
  outline.position.copy(column.position);
  parent.add(outline);
}

/**
 * Reusable building-model modal.
 *
 * Pass `footprintPoints` (normalized Trace Plan external polygon) to use that
 * shape. Otherwise the default rectangle is used.
 */
export default function Building3DModal({
  onClose,
  title = "3D Unit",
  widthM = 11.3,
  depthM = 5.0,
  subfloorHeightM = 0.65,
  footprintPoints = null,
  roofPoints = null,
  roofPivotLine = null,
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
}) {
  const containerRef = useRef(null);
  const captureRef = useRef(null);
  const cameraHeightRef = useRef(EYE_HEIGHT_M);
  const externalCameraHeightRef = useRef(EYE_HEIGHT_M);
  const viewModeRef = useRef(VIEW_MODE_EXTERNAL);
  const applyViewModeRef = useRef(null);
  const walkModeRef = useRef(false);
  const applyWalkModeRef = useRef(null);
  const [error, setError] = useState("");
  const [cameraHeightM, setCameraHeightM] = useState(EYE_HEIGHT_M);
  const [viewMode, setViewMode] = useState(VIEW_MODE_EXTERNAL);
  const [walkMode, setWalkMode] = useState(false);
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

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      // Esc first leaves walk → back to drag/orbit; does not close the modal.
      if (walkModeRef.current) {
        event.preventDefault();
        setWalkMode(false);
        applyWalkModeRef.current?.(false);
        return;
      }
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

    const { ring, fromTrace } = resolveBuildingFootprintRing(
      footprintPoints,
      widthM,
      depthM,
      calibration
    );
    const bounds = footprintBounds(ring);
    const spanM = Math.max(bounds.spanX, bounds.spanZ, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87c4ef);
    scene.fog = new THREE.Fog(0xb7daf5, Math.max(28, spanM * 2.2), Math.max(70, spanM * 5.5));

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    // preserveDrawingBuffer so we can capture the current view for AI render.
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    scene.add(new THREE.HemisphereLight(0xc8e4ff, 0x5d8a42, 1.15));
    const keyLight = new THREE.DirectionalLight(0xfff4e5, 2.35);
    keyLight.position.set(12, 22, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 80;
    const shadowSpan = Math.max(18, spanM + 10);
    keyLight.shadow.camera.left = -shadowSpan;
    keyLight.shadow.camera.right = shadowSpan;
    keyLight.shadow.camera.top = shadowSpan;
    keyLight.shadow.camera.bottom = -shadowSpan;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb7d7ff, 0.55);
    fillLight.position.set(-10, 10, -8);
    scene.add(fillLight);

    const modelGroup = new THREE.Group();
    modelGroup.name = "building";
    scene.add(modelGroup);

    try {
      const subfloor = new THREE.Group();
      subfloor.name = BUILDING_3D_PARTS.SUBFLOOR;
      subfloor.userData = {
        partId: BUILDING_3D_PARTS.SUBFLOOR,
        partType: "subfloor",
        fromTrace,
        widthM: bounds.widthM,
        depthM: bounds.depthM,
        heightM: subfloorHeightM,
        layerHeightM: SUBFLOOR_LAYER_HEIGHT_M,
        layerGapM: SUBFLOOR_LAYER_GAP_M,
      };
      modelGroup.add(subfloor);

      // Subfloor: 200 + 25 + 200 + 25 + 200 = 650 mm, custom footprint slabs.
      let builtSubfloorLayers = 0;
      SUBFLOOR_LAYER_IDS.forEach((partId, index) => {
        const bottomY = index * (SUBFLOOR_LAYER_HEIGHT_M + SUBFLOOR_LAYER_GAP_M);
        const topY = bottomY + SUBFLOOR_LAYER_HEIGHT_M;
        if (
          addFootprintSlab(subfloor, {
            partId,
            partType: "subfloor-layer",
            layerNumber: index + 1,
            ring,
            bottomY,
            topY,
            color: finishHex.baseboards,
            roughness: 0.78,
            metalness: 0.05,
          })
        ) {
          builtSubfloorLayers += 1;
        }
      });

      const cornerColumns = new THREE.Group();
      cornerColumns.name = BUILDING_3D_PARTS.CORNER_COLUMNS;
      cornerColumns.userData = {
        partId: BUILDING_3D_PARTS.CORNER_COLUMNS,
        partType: "corner-columns",
        columnSizeM: CORNER_COLUMN_SIZE_M,
        columnHeightM: CORNER_COLUMN_HEIGHT_M,
        exteriorProjectionM: CORNER_COLUMN_PROJECTION_M,
      };
      modelGroup.add(cornerColumns);

      footprintCornerColumnCenters(ring, CORNER_COLUMN_SIZE_M, CORNER_COLUMN_PROJECTION_M).forEach(
        ({ x, z, index }) => {
          addCornerColumn(cornerColumns, {
            partId: `corner-column-${index + 1}`,
            partType: "corner-column",
            x,
            z,
            y: CORNER_COLUMN_HEIGHT_M / 2,
            heightM: CORNER_COLUMN_HEIGHT_M,
            color: finishHex.baseboards,
            roughness: 0.72,
            metalness: 0.08,
          });
        }
      );

      // Decks: same 200 / 25 / 200 / 25 / 200 stack as subfloor, timber boards on top.
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
          layerHeightM: SUBFLOOR_LAYER_HEIGHT_M,
          layerGapM: SUBFLOOR_LAYER_GAP_M,
          heightM: subfloorHeightM,
        };
        modelGroup.add(deckGroup);

        let builtDeckLayers = 0;
        DECK_LAYER_IDS.forEach((partId, index) => {
          const bottomY = index * (SUBFLOOR_LAYER_HEIGHT_M + SUBFLOOR_LAYER_GAP_M);
          const topY = bottomY + SUBFLOOR_LAYER_HEIGHT_M;
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
        if (disposed || floorOuterRing.length < 3) return;
        const hybridUrl = flooringImages?.hybrid || null;
        const tilesUrl = flooringImages?.tiles || null;
        const carpetUrl = flooringImages?.carpet || null;
        const [hybridTex, tilesTex, carpetTex] = await Promise.all([
          hybridUrl ? loadFloorTextureFromUrl(hybridUrl) : Promise.resolve(null),
          tilesUrl ? loadFloorTextureFromUrl(tilesUrl) : Promise.resolve(null),
          carpetUrl ? loadFloorTextureFromUrl(carpetUrl) : Promise.resolve(null),
        ]);
        if (disposed) {
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
          if (!modelGroup.parent) {
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
            topY: subfloorHeightM + ROBES_HEIGHT_M,
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
      const modelDoors = fromTrace ? resolveModelDoors(footprintPoints, doors, calibration) : [];
      const modelSlidingDoors = fromTrace
        ? resolveModelSlidingDoors(footprintPoints, slidingDoors, calibration)
        : [];
      const modelWindows = fromTrace
        ? resolveModelWindows(footprintPoints, windows, calibration)
        : [];
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

      // Cladding: one continuous face per footprint edge (2600 mm × 100 mm), with
      // rectangular door/window holes. Outline uses the clean footprint only so
      // verticals appear at true corners — not around openings.
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
      const claddingFaces = buildFootprintCladdingFaceParts(
        ring,
        claddingBottomY,
        claddingTopY,
        claddingOpenings,
        CLADDING_WALL_THICKNESS_M
      );
      let builtCladdingLayers = 0;
      claddingFaces.forEach((face, faceIndex) => {
        const mesh = new THREE.Mesh(
          face.geometry,
          new THREE.MeshStandardMaterial({
            color: finishHex.cladding,
            roughness: 0.62,
            metalness: 0.02,
            side: THREE.DoubleSide,
          })
        );
        mesh.name = `cladding-face-${faceIndex + 1}`;
        mesh.userData = {
          partId: `cladding-face-${faceIndex + 1}`,
          partType: "cladding-layer",
          layerNumber: 1,
          heightM: CLADDING_HEIGHT_M,
          wallThicknessM: CLADDING_WALL_THICKNESS_M,
          color: `#${finishHex.cladding.toString(16).padStart(6, "0")}`,
        };
        mesh.position.set(face.position.x, face.position.y, face.position.z);
        mesh.rotation.y = face.rotationY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cladding.add(mesh);
        builtCladdingLayers += 1;
      });

      const claddingOutlineGeo = buildFootprintWallBandOutlineGeometry(
        ring,
        claddingBottomY,
        claddingTopY,
        CLADDING_WALL_THICKNESS_M
      );
      if (claddingOutlineGeo) {
        const outline = new THREE.LineSegments(
          claddingOutlineGeo,
          new THREE.LineBasicMaterial({ color: 0x202124 })
        );
        outline.name = "cladding-outline";
        cladding.add(outline);
      }

      const claddingCornerColumns = new THREE.Group();
      claddingCornerColumns.name = BUILDING_3D_PARTS.CLADDING_CORNER_COLUMNS;
      claddingCornerColumns.userData = {
        partId: BUILDING_3D_PARTS.CLADDING_CORNER_COLUMNS,
        partType: "cladding-corner-columns",
        columnSizeM: CORNER_COLUMN_SIZE_M,
        columnHeightM: CLADDING_HEIGHT_M,
        exteriorProjectionM: CORNER_COLUMN_PROJECTION_M,
      };
      cladding.add(claddingCornerColumns);

      footprintCornerColumnCenters(ring, CORNER_COLUMN_SIZE_M, CORNER_COLUMN_PROJECTION_M).forEach(
        ({ x, z, index }) => {
          addCornerColumn(claddingCornerColumns, {
            partId: `cladding-corner-column-${index + 1}`,
            partType: "cladding-corner-column",
            x,
            z,
            y: subfloorHeightM + CLADDING_HEIGHT_M / 2,
            heightM: CLADDING_HEIGHT_M,
            color: finishHex.cladding,
            roughness: 0.62,
            metalness: 0.02,
          });
        }
      );

      if (builtSubfloorLayers < 3 || builtCladdingLayers < 1) {
        throw new Error(
          `Could not extrude the unit footprint (${builtSubfloorLayers}/3 subfloor, ${builtCladdingLayers} cladding faces).`
        );
      }

      // Internal walls: 100 mm solid bands from subfloor to cladding top, with
      // openings cut for internal doors (lintel retained above the leaf).
      if (
        fromTrace &&
        Array.isArray(footprintPoints) &&
        footprintPoints.length >= 3 &&
        Array.isArray(internalWallSegments) &&
        internalWallSegments.length > 0
      ) {
        const mapping = getTracePlanXZMapping(footprintPoints, calibration);
        const internalWallsGroup = new THREE.Group();
        internalWallsGroup.name = BUILDING_3D_PARTS.INTERNAL_WALLS;
        internalWallsGroup.userData = {
          partId: BUILDING_3D_PARTS.INTERNAL_WALLS,
          partType: "internal-walls",
          thicknessM: 0.1,
        };
        let builtInternalWalls = 0;
        const wallTopY = subfloorHeightM + CLADDING_HEIGHT_M;
        const wallHalfT = 0.05;

        if (mapping) {
          const wallHeightM = wallTopY - subfloorHeightM;
          const wallThicknessM = wallHalfT * 2;

          internalWallSegments.forEach((seg, index) => {
            if (!seg?.a || !seg?.b) return;
            const startXZ = normalizedPointToXZ(seg.a, mapping);
            const endXZ = normalizedPointToXZ(seg.b, mapping);
            const dx = endXZ.x - startXZ.x;
            const dz = endXZ.z - startXZ.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.02) return;
            const dirX = dx / len;
            const dirZ = dz / len;

            const doorsOnSeg = modelInternalDoors
              .filter((door) => door.segmentIndex === index)
              .sort((a, b) => a.along0 - b.along0);

            // One continuous wall mesh with rectangular door holes — no separate
            // lintel slab / outline edges framing the opening.
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(len, 0);
            shape.lineTo(len, wallHeightM);
            shape.lineTo(0, wallHeightM);
            shape.closePath();

            doorsOnSeg.forEach((door) => {
              const d0 = Math.max(0, Math.min(len, door.along0));
              const d1 = Math.max(d0, Math.min(len, door.along1));
              if (d1 - d0 < 0.05) return;
              const holeH = Math.min(DOOR_HEIGHT_M, wallHeightM - 0.01);
              if (!(holeH > 0.05)) return;
              const hole = new THREE.Path();
              hole.moveTo(d0, 0);
              hole.lineTo(d1, 0);
              hole.lineTo(d1, holeH);
              hole.lineTo(d0, holeH);
              hole.closePath();
              shape.holes.push(hole);
            });

            const geometry = new THREE.ExtrudeGeometry(shape, {
              depth: wallThicknessM,
              bevelEnabled: false,
              curveSegments: 1,
            });
            // Extrude goes +Z locally; centre thickness on the wall centreline and
            // align local +X with the segment direction in world XZ.
            geometry.translate(0, 0, -wallThicknessM / 2);
            const mesh = new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({
                color: finishHex.cladding,
                roughness: 0.62,
                metalness: 0.02,
                side: THREE.DoubleSide,
              })
            );
            mesh.name = `internal-wall-${index + 1}`;
            mesh.userData = {
              partId: `internal-wall-${index + 1}`,
              partType: "internal-wall",
              layerNumber: index + 1,
              heightM: wallHeightM,
            };
            mesh.position.set(startXZ.x, subfloorHeightM, startXZ.z);
            mesh.rotation.y = Math.atan2(-dirZ, dirX);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            internalWallsGroup.add(mesh);
            builtInternalWalls += 1;
          });
        }

        // Fallback if per-segment slabs failed: merged clipped geometry (no door cutouts).
        if (builtInternalWalls === 0) {
          const internalWallsGeo = buildTraceInternalWallsGeometry(
            footprintPoints,
            internalWallSegments,
            {
              calibration,
              baseYM: subfloorHeightM,
              topYM: subfloorHeightM + CLADDING_HEIGHT_M,
            }
          );
          if (internalWallsGeo) {
            const mesh = new THREE.Mesh(
              internalWallsGeo,
              new THREE.MeshStandardMaterial({
                color: finishHex.cladding,
                roughness: 0.62,
                metalness: 0.02,
                side: THREE.DoubleSide,
              })
            );
            mesh.name = "internal-walls-merged";
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            internalWallsGroup.add(mesh);
            builtInternalWalls = 1;
          }
        }

        if (builtInternalWalls > 0) {
          internalWallsGroup.userData.count = builtInternalWalls;
          modelGroup.add(internalWallsGroup);
        }

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

      // Roof: 150 mm slab on full traced outline; 15° hip sits on the slab,
      // inset 150 mm for gutter.
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

          // Extra cladding under the skillion rise (roof geometry unchanged).
          // May run into the pitched roof; no stepped tops.
          if (showSkillionSlab) {
            const skillionPitch = resolveSkillionPitch(slabRing, pivotLineXZ, swingDoor);
            const maxRiseM = skillionMaxWallRiseM(skillionPitch, SKILLION_ROOF_PITCH_DEG);
            const bands = skillionExtraCladdingBands(maxRiseM, CLADDING_LAYER_HEIGHT_M);
            bands.forEach((band, bandIndex) => {
              const clipped = clipRingToSkillionMinRise(
                ring,
                skillionPitch,
                band.bottomRiseM,
                SKILLION_ROOF_PITCH_DEG
              );
              if (!clipped) return;
              addFootprintSlab(cladding, {
                partId: `cladding-layer-${CLADDING_LAYER_COUNT + bandIndex + 1}`,
                partType: "cladding-layer",
                layerNumber: CLADDING_LAYER_COUNT + bandIndex + 1,
                ring: clipped,
                bottomY: wallTopY + band.bottomRiseM,
                topY: wallTopY + band.topRiseM,
                color: finishHex.cladding,
                roughness: 0.62,
                metalness: 0.02,
                wallThicknessM: CLADDING_WALL_THICKNESS_M,
                extraUserData: {
                  color: `#${finishHex.cladding.toString(16).padStart(6, "0")}`,
                  skillionInfill: true,
                },
              });
            });

            // Extend corner posts up to the pitched underside at each corner.
            if (skillionPitch && maxRiseM > 1e-6) {
              footprintCornerColumnCenters(
                ring,
                CORNER_COLUMN_SIZE_M,
                CORNER_COLUMN_PROJECTION_M
              ).forEach(({ x, z, index }) => {
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
                });
              });
            }
          }

          const roofGroup = new THREE.Group();
          roofGroup.name = BUILDING_3D_PARTS.ROOF;
          roofGroup.userData = {
            partId: BUILDING_3D_PARTS.ROOF,
            partType: "roof",
            slabThicknessM: showSkillionSlab ? SKILLION_ROOF_SLAB_THICKNESS_M : ROOF_SLAB_THICKNESS_M,
            gutterInsetM: ROOF_GUTTER_INSET_M,
            pitchDeg: showSkillionSlab ? SKILLION_ROOF_PITCH_DEG : HIPPED_ROOF_PITCH_DEG,
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
            slabOk = addFootprintSlab(roofGroup, {
              partId: `${BUILDING_3D_PARTS.ROOF}-slab`,
              partType: "roof-slab",
              layerNumber: 1,
              ring: slabRing,
              bottomY: wallTopY,
              topY: wallTopY + ROOF_SLAB_THICKNESS_M,
              color: finishHex.roof,
              roughness: 0.55,
              metalness: 0.08,
              outlineColor: finishHex.roof,
              extraUserData: {
                color: `#${finishHex.roof.toString(16).padStart(6, "0")}`,
              },
            });

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
            roofStackM = ROOF_SLAB_THICKNESS_M;
          }
        }
      }
      modelGroup.userData = {
        ...(modelGroup.userData || {}),
        hasRoofSlab,
        roofThicknessM: hasRoofSlab ? roofStackM : 0,
        roofPitchDeg: hasRoofSlab ? HIPPED_ROOF_PITCH_DEG : 0,
      };

      // Windows: openings cut through the 100 mm cladding. Glass fills the wall
      // thickness (interior reads like an internal door rectangle); surround/frame
      // stay on the exterior only.
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

        modelWindows.forEach((win, index) => {
          const winHeight = win.heightM > 0 ? win.heightM : WINDOW_HEIGHT_M;
          const bottomY = topY - winHeight;
          const centerY = (topY + bottomY) / 2;
          const geometry = new THREE.BoxGeometry(
            win.lengthM,
            winHeight,
            CLADDING_WALL_THICKNESS_M
          );
          const material = new THREE.MeshPhysicalMaterial({
            color: WINDOW_COLOR,
            transparent: false,
            opacity: 1,
            roughness: 0.15,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.06,
            reflectivity: 0.5,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.name = `window-${index + 1}`;
          mesh.userData = {
            partId: `window-${index + 1}`,
            partType: "window",
            widthM: win.lengthM,
            heightM: winHeight,
          };
          // Centre glass in the wall thickness so both faces are flush with the cutout.
          const glassOffset = -CLADDING_WALL_THICKNESS_M / 2;
          const rotY = Math.atan2(-win.dirZ, win.dirX);
          mesh.position.set(
            win.midX + win.normalX * glassOffset,
            centerY,
            win.midZ + win.normalZ * glassOffset
          );
          mesh.rotation.y = rotY;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          windowsGroup.add(mesh);

          const halfLen = win.lengthM / 2;
          const halfHeight = winHeight / 2;

          // Interior face outline only (exterior keeps surround/frame styling).
          {
            const faceOffset =
              CLADDING_WALL_THICKNESS_M / 2 + INTERNAL_DOOR_OUTLINE_EPS_M;
            // Local -Z is inward (normal points outward after rotY).
            const outlinePositions = new Float32Array([
              -halfLen, -halfHeight, -faceOffset, halfLen, -halfHeight, -faceOffset,
              halfLen, -halfHeight, -faceOffset, halfLen, halfHeight, -faceOffset,
              halfLen, halfHeight, -faceOffset, -halfLen, halfHeight, -faceOffset,
              -halfLen, halfHeight, -faceOffset, -halfLen, -halfHeight, -faceOffset,
            ]);
            const outlineGeo = new THREE.BufferGeometry();
            outlineGeo.setAttribute(
              "position",
              new THREE.BufferAttribute(outlinePositions, 3)
            );
            const outline = new THREE.LineSegments(
              outlineGeo,
              new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
            );
            outline.name = `window-${index + 1}-interior-outline`;
            outline.position.copy(mesh.position);
            outline.rotation.y = rotY;
            windowsGroup.add(outline);
          }

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

          // Exterior surround only — interior is a clean cutout through the wall.
          {
            const band = WINDOW_SURROUND_WIDTH_M;
            addRingFrame(`window-${index + 1}-surround`, "window-surround", {
              outerHalfLen: halfLen + band,
              outerHalfH: halfHeight + band,
              band,
              thickness: WINDOW_SURROUND_THICKNESS_M,
              depthOffset: WINDOW_SURROUND_THICKNESS_M / 2,
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

      // Doors: 2.1 m black panels inset 70 mm into the cladding, sitting on top of the subfloor.
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
          const geometry = new THREE.BoxGeometry(
            door.lengthM,
            DOOR_HEIGHT_M,
            DOOR_PANEL_THICKNESS_M
          );
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
          // Outer face sits just proud of the notch back wall (avoids z-fighting).
          const doorFaceOffset = -(DOOR_INSET_M - DOOR_INSET_CLEARANCE_M);
          const offset = doorFaceOffset - DOOR_PANEL_THICKNESS_M / 2;
          const rotY = Math.atan2(-door.dirZ, door.dirX);
          mesh.position.set(
            door.midX + door.normalX * offset,
            doorCenterY,
            door.midZ + door.normalZ * offset
          );
          mesh.rotation.y = rotY;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          doorsGroup.add(mesh);

          const halfLen = door.lengthM / 2;
          const halfHeight = DOOR_HEIGHT_M / 2;

          // Four glass panels: evenly spaced, first bottom edge 300 mm above the sill.
          const glassWidth = Math.max(door.lengthM - DOOR_GLASS_SIDE_MARGIN_M * 2, 0.05);
          const glassSpan =
            DOOR_HEIGHT_M -
            DOOR_GLASS_FIRST_BOTTOM_M -
            DOOR_GLASS_TOP_MARGIN_M -
            DOOR_GLASS_COUNT * DOOR_GLASS_HEIGHT_M;
          const glassGap =
            DOOR_GLASS_COUNT > 1 ? glassSpan / (DOOR_GLASS_COUNT - 1) : 0;
          const glassDepthOffset = doorFaceOffset + DOOR_GLASS_THICKNESS_M / 2;
          for (let g = 0; g < DOOR_GLASS_COUNT; g += 1) {
            const panelBottom = DOOR_GLASS_FIRST_BOTTOM_M + g * (DOOR_GLASS_HEIGHT_M + glassGap);
            const panelCenterFromSill = panelBottom + DOOR_GLASS_HEIGHT_M / 2;
            const vCenter = panelCenterFromSill - halfHeight;
            const glass = new THREE.Mesh(
              new THREE.BoxGeometry(glassWidth, DOOR_GLASS_HEIGHT_M, DOOR_GLASS_THICKNESS_M),
              new THREE.MeshPhysicalMaterial({
                color: DOOR_GLASS_COLOR,
                transparent: false,
                opacity: 1,
                roughness: 0.15,
                metalness: 0,
                clearcoat: 1,
                clearcoatRoughness: 0.06,
                reflectivity: 0.5,
              })
            );
            glass.name = `door-${index + 1}-glass-${g + 1}`;
            glass.userData = { partId: glass.name, partType: "door-glass" };
            glass.position.set(
              door.midX + door.normalX * glassDepthOffset,
              doorCenterY + vCenter,
              door.midZ + door.normalZ * glassDepthOffset
            );
            glass.rotation.y = rotY;
            glass.castShadow = true;
            glass.receiveShadow = true;
            doorsGroup.add(glass);
          }

          const band = DOOR_SURROUND_WIDTH_M;
          const surroundDepthOffset = DOOR_SURROUND_THICKNESS_M / 2;

          // Single U-shaped extrusion (left + top + right) so corner outlines stay clean —
          // no seam lines where separate bars would butt together.
          {
            const outerL = halfLen + band;
            const outerT = halfHeight + band;
            const shape = new THREE.Shape();
            shape.moveTo(-outerL, -halfHeight);
            shape.lineTo(-outerL, outerT);
            shape.lineTo(outerL, outerT);
            shape.lineTo(outerL, -halfHeight);
            shape.lineTo(halfLen, -halfHeight);
            shape.lineTo(halfLen, halfHeight);
            shape.lineTo(-halfLen, halfHeight);
            shape.lineTo(-halfLen, -halfHeight);
            shape.closePath();
            const geo = new THREE.ExtrudeGeometry(shape, {
              depth: DOOR_SURROUND_THICKNESS_M,
              bevelEnabled: false,
              steps: 1,
            });
            geo.translate(0, 0, -DOOR_SURROUND_THICKNESS_M / 2);
            geo.computeVertexNormals();
            const surround = new THREE.Mesh(
              geo,
              new THREE.MeshStandardMaterial({
                color: finishHex.windowSurrounds,
                roughness: 0.7,
                metalness: 0.05,
              })
            );
            surround.name = `door-${index + 1}-surround`;
            surround.userData = {
              partId: surround.name,
              partType: "door-surround",
            };
            surround.position.set(
              door.midX + door.normalX * surroundDepthOffset,
              doorCenterY,
              door.midZ + door.normalZ * surroundDepthOffset
            );
            surround.rotation.y = rotY;
            surround.castShadow = true;
            surround.receiveShadow = true;
            const outline = new THREE.LineSegments(
              new THREE.EdgesGeometry(geo),
              new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
            );
            outline.name = `${surround.name}-outline`;
            surround.add(outline);
            doorsGroup.add(surround);
          }
        });
      }

      // Sliding doors: same height/sill as swing doors, white leaf + glass in the recess + U-surround.
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

        modelSlidingDoors.forEach((door, index) => {
          const geometry = new THREE.BoxGeometry(
            door.lengthM,
            DOOR_HEIGHT_M,
            DOOR_PANEL_THICKNESS_M
          );
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color: finishHex.windowFrames,
              roughness: 0.7,
              metalness: 0.05,
            })
          );
          mesh.name = `sliding-door-${index + 1}`;
          mesh.userData = {
            partId: mesh.name,
            partType: "sliding-door",
            widthM: door.lengthM,
            heightM: DOOR_HEIGHT_M,
          };
          const doorFaceOffset = -(DOOR_INSET_M - DOOR_INSET_CLEARANCE_M);
          const offset = doorFaceOffset - DOOR_PANEL_THICKNESS_M / 2;
          const rotY = Math.atan2(-door.dirZ, door.dirX);
          mesh.position.set(
            door.midX + door.normalX * offset,
            doorCenterY,
            door.midZ + door.normalZ * offset
          );
          mesh.rotation.y = rotY;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          slidingGroup.add(mesh);

          // Full glass pane filling the recessed door opening.
          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(door.lengthM, DOOR_HEIGHT_M, DOOR_GLASS_THICKNESS_M),
            new THREE.MeshPhysicalMaterial({
              color: DOOR_GLASS_COLOR,
              transparent: false,
              opacity: 1,
              roughness: 0.15,
              metalness: 0,
              clearcoat: 1,
              clearcoatRoughness: 0.06,
              reflectivity: 0.5,
            })
          );
          glass.name = `sliding-door-${index + 1}-glass`;
          glass.userData = { partId: glass.name, partType: "sliding-door-glass" };
          const glassDepthOffset = doorFaceOffset + DOOR_GLASS_THICKNESS_M / 2;
          glass.position.set(
            door.midX + door.normalX * glassDepthOffset,
            doorCenterY,
            door.midZ + door.normalZ * glassDepthOffset
          );
          glass.rotation.y = rotY;
          glass.castShadow = true;
          glass.receiveShadow = true;
          slidingGroup.add(glass);

          const halfLen = door.lengthM / 2;
          const halfHeight = DOOR_HEIGHT_M / 2;

          // 50 mm frame over the glass (same as windows): starts at the opening corners
          // and runs inward, covering the outer edge of the glass.
          {
            const frameBand = WINDOW_FRAME_WIDTH_M;
            const frameThickness = WINDOW_FRAME_THICKNESS_M;
            const frameDepthOffset =
              doorFaceOffset + DOOR_GLASS_THICKNESS_M + frameThickness / 2;
            const innerHalfLen = Math.max(halfLen - frameBand, 0.001);
            const innerHalfH = Math.max(halfHeight - frameBand, 0.001);
            const frameShape = new THREE.Shape();
            frameShape.moveTo(-halfLen, -halfHeight);
            frameShape.lineTo(halfLen, -halfHeight);
            frameShape.lineTo(halfLen, halfHeight);
            frameShape.lineTo(-halfLen, halfHeight);
            frameShape.closePath();
            const frameHole = new THREE.Path();
            frameHole.moveTo(-innerHalfLen, -innerHalfH);
            frameHole.lineTo(innerHalfLen, -innerHalfH);
            frameHole.lineTo(innerHalfLen, innerHalfH);
            frameHole.lineTo(-innerHalfLen, innerHalfH);
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
            const innerHeight = Math.max(DOOR_HEIGHT_M - frameBand * 2, 0.001);
            const mullionDepthOffset = frameDepthOffset;
            const mullionCenters =
              door.lengthM > SLIDING_DOOR_DOUBLE_MULLION_MIN_WIDTH_M
                ? [-innerHalfLen / 3, innerHalfLen / 3]
                : [0];
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
                doorCenterY,
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

          const band = DOOR_SURROUND_WIDTH_M;
          const surroundDepthOffset = DOOR_SURROUND_THICKNESS_M / 2;
          const outerL = halfLen + band;
          const outerT = halfHeight + band;
          const shape = new THREE.Shape();
          shape.moveTo(-outerL, -halfHeight);
          shape.lineTo(-outerL, outerT);
          shape.lineTo(outerL, outerT);
          shape.lineTo(outerL, -halfHeight);
          shape.lineTo(halfLen, -halfHeight);
          shape.lineTo(halfLen, halfHeight);
          shape.lineTo(-halfLen, halfHeight);
          shape.lineTo(-halfLen, -halfHeight);
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: DOOR_SURROUND_THICKNESS_M,
            bevelEnabled: false,
            steps: 1,
          });
          geo.translate(0, 0, -DOOR_SURROUND_THICKNESS_M / 2);
          geo.computeVertexNormals();
          const surround = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({
              color: finishHex.windowSurrounds,
              roughness: 0.7,
              metalness: 0.05,
            })
          );
          surround.name = `sliding-door-${index + 1}-surround`;
          surround.userData = { partId: surround.name, partType: "sliding-door-surround" };
          surround.position.set(
            door.midX + door.normalX * surroundDepthOffset,
            doorCenterY,
            door.midZ + door.normalZ * surroundDepthOffset
          );
          surround.rotation.y = rotY;
          surround.castShadow = true;
          surround.receiveShadow = true;
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: WINDOW_SURROUND_OUTLINE_COLOR })
          );
          outline.name = `${surround.name}-outline`;
          surround.add(outline);
          slidingGroup.add(surround);
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
          },
          footprintRing: ring,
          fromTrace,
        });
      }

      const groundSize = Math.max(40, Math.ceil(spanM + 24));
      const grassTexture = textureLoader.load(grassImage);
      grassTexture.wrapS = THREE.RepeatWrapping;
      grassTexture.wrapT = THREE.RepeatWrapping;
      grassTexture.colorSpace = THREE.SRGBColorSpace;
      // ~4 m per tile
      const grassRepeat = Math.max(6, groundSize * 0.25);
      grassTexture.repeat.set(grassRepeat, grassRepeat);
      grassTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 4);
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
      setError("");
    } catch (err) {
      setError(err?.message || "Could not build the 3D unit");
    }

    const buildingHeightM =
      subfloorHeightM +
      CLADDING_HEIGHT_M +
      (Number(modelGroup.userData?.roofThicknessM) > 0
        ? Number(modelGroup.userData.roofThicknessM)
        : 0);
    const externalFocusY = buildingHeightM / 2;
    const target = new THREE.Vector3(0, externalFocusY, 0);
    // Internal + external orbit use theta/distance; Walk mode uses free pose.
    let theta = Math.PI / 4;
    let distance = spanM * 1.25 + 4;
    const minDistance = spanM * 0.65;
    const maxDistance = spanM * 3.5;
    let walkX = distance * Math.sin(theta);
    let walkZ = distance * Math.cos(theta);
    let yaw = theta + Math.PI;
    let cameraHeight = externalCameraHeightRef.current;
    const maxCameraHeight = buildingHeightM + spanM * 2 + 4;
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

    const updateCamera = () => {
      const internal = viewModeRef.current === VIEW_MODE_INTERNAL;
      if (internal) {
        target.y = INTERNAL_VIEW_FOCUS_Y_M;
        camera.position.set(
          target.x + distance * Math.sin(theta),
          INTERNAL_VIEW_CAMERA_HEIGHT_M,
          target.z + distance * Math.cos(theta)
        );
        camera.lookAt(target.x, INTERNAL_VIEW_FOCUS_Y_M, target.z);
        return;
      }
      const height = externalCameraHeightRef.current;
      if (walkModeRef.current) {
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);
        camera.position.set(walkX, height, walkZ);
        camera.lookAt(walkX + forwardX, height, walkZ + forwardZ);
        return;
      }
      target.y = externalFocusY;
      camera.position.set(
        target.x + distance * Math.sin(theta),
        height,
        target.z + distance * Math.cos(theta)
      );
      camera.lookAt(target.x, externalFocusY, target.z);
    };

    applyWalkModeRef.current = (enabled) => {
      const next = Boolean(enabled);
      if (next === walkModeRef.current) {
        updateCamera();
        return;
      }
      if (next) {
        walkX = distance * Math.sin(theta);
        walkZ = distance * Math.cos(theta);
        yaw = theta + Math.PI;
        keysDown.clear();
      } else {
        const d = Math.hypot(walkX, walkZ);
        distance = Math.max(minDistance, Math.min(maxDistance, d || distance));
        if (d > 1e-6) theta = Math.atan2(walkX, walkZ);
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
        setWalkMode(false);
        keysDown.clear();
      }
      cameraHeight = next === VIEW_MODE_INTERNAL
        ? INTERNAL_VIEW_CAMERA_HEIGHT_M
        : externalCameraHeightRef.current;
      cameraHeightRef.current = cameraHeight;
      setCameraHeightM(cameraHeight);
      syncCursor();
      updateCamera();
    };

    walkModeRef.current = walkMode;
    cameraHeight =
      viewModeRef.current === VIEW_MODE_INTERNAL
        ? INTERNAL_VIEW_CAMERA_HEIGHT_M
        : externalCameraHeightRef.current;
    cameraHeightRef.current = cameraHeight;
    setCameraHeightM(cameraHeight);
    syncCursor();
    updateCamera();

    const isTypingTarget = (el) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement;

    const onCameraHeightKeyDown = (event) => {
      if (viewModeRef.current === VIEW_MODE_INTERNAL) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== "q" && key !== "z") return;
      event.preventDefault();
      const step = CAMERA_HEIGHT_STEP_M;
      let nextHeight = externalCameraHeightRef.current;
      if (key === "q") {
        nextHeight = Math.min(maxCameraHeight, nextHeight + step);
      } else {
        nextHeight = Math.max(CAMERA_HEIGHT_MIN_M, nextHeight - step);
      }
      externalCameraHeightRef.current = nextHeight;
      cameraHeight = nextHeight;
      cameraHeightRef.current = nextHeight;
      setCameraHeightM(nextHeight);
      updateCamera();
    };

    const onWalkKeyDown = (event) => {
      if (viewModeRef.current !== VIEW_MODE_EXTERNAL || !walkModeRef.current) return;
      if (isTypingTarget(event.target)) return;
      const { code } = event;
      if (
        code !== "KeyW" &&
        code !== "KeyA" &&
        code !== "KeyS" &&
        code !== "KeyD"
      ) {
        return;
      }
      event.preventDefault();
      keysDown.add(code);
    };
    const onWalkKeyUp = (event) => {
      keysDown.delete(event.code);
    };

    window.addEventListener("keydown", onCameraHeightKeyDown);
    window.addEventListener("keydown", onWalkKeyDown);
    window.addEventListener("keyup", onWalkKeyUp);

    let dragging = false;
    let dragButton = -1;
    let lastX = null;
    let lastY = null;

    const applyHeightDelta = (dyPx) => {
      if (viewModeRef.current === VIEW_MODE_INTERNAL) return;
      // Drag up (negative screen dy) raises the camera.
      const nextHeight = Math.max(
        CAMERA_HEIGHT_MIN_M,
        Math.min(maxCameraHeight, externalCameraHeightRef.current - dyPx * 0.012)
      );
      externalCameraHeightRef.current = nextHeight;
      cameraHeight = nextHeight;
      cameraHeightRef.current = nextHeight;
      setCameraHeightM(nextHeight);
    };

    const onPointerEnter = (event) => {
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerLeave = (event) => {
      lastX = null;
      lastY = null;
      if (dragging) endDrag(event);
    };
    const onPointerDown = (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      dragging = true;
      dragButton = event.button;
      lastX = event.clientX;
      lastY = event.clientY;
      container.setPointerCapture(event.pointerId);
      container.style.cursor = walkModeRef.current ? "ns-resize" : "grabbing";
    };
    const onPointerMove = (event) => {
      if (lastX == null || lastY == null) {
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (dx === 0 && dy === 0) return;

      if (viewModeRef.current === VIEW_MODE_INTERNAL) {
        if (!dragging) return;
        theta -= dx * 0.008;
        updateCamera();
        return;
      }

      if (walkModeRef.current) {
        if (dx !== 0) yaw -= dx * 0.008;
        if (dragging && dy !== 0) applyHeightDelta(dy);
        updateCamera();
        return;
      }

      if (!dragging) return;
      theta -= dx * 0.008;
      if (dy !== 0) applyHeightDelta(dy);
      updateCamera();
    };
    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      dragButton = -1;
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
      } else if (walkModeRef.current) {
        const step = raw * 0.02;
        walkX -= Math.sin(yaw) * step;
        walkZ -= Math.cos(yaw) * step;
      } else {
        const factor = Math.exp(raw * 0.0015);
        distance = Math.max(minDistance, Math.min(maxDistance, distance * factor));
      }
      updateCamera();
    };
    const onContextMenu = (event) => event.preventDefault();

    const canvas = renderer.domElement;
    container.addEventListener("pointerenter", onPointerEnter);
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
      if (
        viewModeRef.current === VIEW_MODE_EXTERNAL &&
        walkModeRef.current &&
        keysDown.size > 0
      ) {
        // Use the camera's actual view axes so A/D match on-screen left/right.
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
        if (keysDown.has("KeyS")) {
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
          walkX += moveX * step;
          walkZ += moveZ * step;
          updateCamera();
        }
      }
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      captureRef.current = null;
      applyViewModeRef.current = null;
      applyWalkModeRef.current = null;
      if (animationId != null) cancelAnimationFrame(animationId);
      resizeObserver?.disconnect();
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", endDrag);
      container.removeEventListener("pointercancel", endDrag);
      container.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onCameraHeightKeyDown);
      window.removeEventListener("keydown", onWalkKeyDown);
      window.removeEventListener("keyup", onWalkKeyUp);
      disposeThreeObject(scene);
      renderer?.dispose();
      if (renderer?.domElement?.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [buildModel, depthM, footprintKey, footprintPoints, roofPointsKey, roofPoints, roofPivotKey, roofPivotLine, deckPointsKey, resolvedDecks, kitchenBenchesKey, resolvedKitchenBenches, robesKey, resolvedRobes, windowsKey, windows, doorsKey, doors, slidingDoorsKey, slidingDoors, internalWallsKey, internalWallSegments, internalDoorsKey, internalDoors, flooringPointsKey, flooringPoints, hybridRegionsKey, hybridRegions, tilesRegionsKey, tilesRegions, carpetRegionsKey, carpetRegions, flooringImagesKey, flooringImages, flooringScalesKey, flooringScales, calibrationKey, calibration, subfloorHeightM, widthM, finishesKey, finishHex, kitchenFinishesKey, kitchenFinishes]);

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
            claddingBoardCount: CLADDING_LAYER_COUNT,
            claddingBoardHeightMm: Math.round(CLADDING_LAYER_HEIGHT_M * 1000),
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
  const roofLabel =
    roofPoints?.length >= 3
      ? isSuperiorSkillionRoofStyle(finishes?.roofStyle)
        ? ` · Roof: ${SKILLION_ROOF_PITCH_DEG}° skillion slab (400 mm)`
        : isSuperiorHippedRoofStyle(finishes?.roofStyle)
          ? ` · Roof: 150 mm slab + ${HIPPED_ROOF_PITCH_DEG}° planes to ridge per edge`
          : " · Roof: 150 mm slab"
      : "";
  const deckLabel =
    resolvedDecks.length
      ? ` · Deck${resolvedDecks.length > 1 ? `s (${resolvedDecks.length})` : ""}: 200 / 25 / 200 / 25 / 200 mm + timber top`
      : "";
  const kitchenBenchLabel =
    resolvedKitchenBenches.length
      ? ` · Kitchen bench${resolvedKitchenBenches.length > 1 ? `es (${resolvedKitchenBenches.length})` : ""}: cabinets to 879 mm + 20 mm benchtop`
      : "";
  const robesLabel =
    resolvedRobes.length
      ? ` · Robe${resolvedRobes.length > 1 ? `s (${resolvedRobes.length})` : ""}: 2600 mm slab on floor`
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="building-3d-modal-title"
      onClick={() => {
        if (renderBusy || renderOptionsOpen) return;
        onClose?.();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1001,
        display: "flex",
        padding: "16px",
        boxSizing: "border-box",
        background: "rgba(0, 0, 0, 0.58)",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          height: "100%",
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
            <div style={{ marginTop: "4px", color: "rgba(255,255,255,0.68)", fontSize: "0.85rem" }}>
              Subfloor: 200 / 25 / 200 / 25 / 200 mm solid slabs · {footprintLabel}
              {" · "}Cladding: 1 × 2600 mm slab, 100 mm thick
              {deckLabel}
              {kitchenBenchLabel}
              {robesLabel}
              {roofLabel}
              {" · "}50 mm corner posts, 5 mm proud
              {" — "}
              {walkMode
                ? `${cameraHeightM.toFixed(2)} m · Walk mode · WASD move · mouse look · L/R drag height · Esc = orbit`
                : viewMode === VIEW_MODE_INTERNAL
                  ? `${INTERNAL_VIEW_CAMERA_HEIGHT_M.toFixed(0)} m internal · drag to rotate · scroll to zoom`
                  : `${cameraHeightM.toFixed(2)} m · Orbit · drag to rotate & height · scroll zoom`}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                const next =
                  viewMode === VIEW_MODE_INTERNAL
                    ? VIEW_MODE_EXTERNAL
                    : VIEW_MODE_INTERNAL;
                if (next === VIEW_MODE_INTERNAL && walkMode) {
                  setWalkMode(false);
                  applyWalkModeRef.current?.(false);
                }
                setViewMode(next);
                applyViewModeRef.current?.(next);
              }}
              title="Toggle internal / external camera height"
              aria-label={
                viewMode === VIEW_MODE_INTERNAL
                  ? "Switch to external view"
                  : "Switch to internal view"
              }
              style={{
                ...headerBtnStyle,
                background: "rgba(255,255,255,0.28)",
                border: "1px solid rgba(255,255,255,0.55)",
                minWidth: "96px",
              }}
            >
              {viewMode === VIEW_MODE_INTERNAL ? "Internal" : "External"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (walkMode) {
                  setWalkMode(false);
                  applyWalkModeRef.current?.(false);
                  return;
                }
                // Walk uses eye-level external camera; leave Internal orbit first.
                if (viewMode === VIEW_MODE_INTERNAL) {
                  setViewMode(VIEW_MODE_EXTERNAL);
                  applyViewModeRef.current?.(VIEW_MODE_EXTERNAL);
                }
                setWalkMode(true);
                applyWalkModeRef.current?.(true);
              }}
              title={
                walkMode
                  ? "Back to orbit (Esc)"
                  : "Enter walk mode — WASD, mouse look; Esc returns to drag/rotate"
              }
              aria-pressed={walkMode}
              style={{
                ...headerBtnStyle,
                background: walkMode
                  ? "rgba(34, 197, 94, 0.45)"
                  : "rgba(255,255,255,0.12)",
                border: walkMode
                  ? "1px solid rgba(134, 239, 172, 0.85)"
                  : "1px solid rgba(255,255,255,0.25)",
                minWidth: "72px",
                fontWeight: walkMode ? 700 : 500,
              }}
            >
              {walkMode ? "Walking" : "Walk"}
            </button>
            <button
              type="button"
              onClick={openRenderOptions}
              disabled={renderBusy || !projectId}
              title={
                !projectId
                  ? "Open from a project to enable AI render"
                  : "Photoreal render of the current camera view"
              }
              style={{
                ...headerBtnStyle,
                background: renderBusy ? "rgba(255,255,255,0.06)" : "rgba(94, 160, 255, 0.28)",
                border: "1px solid rgba(140, 190, 255, 0.45)",
                opacity: renderBusy || !projectId ? 0.65 : 1,
                cursor: renderBusy || !projectId ? "not-allowed" : "pointer",
              }}
            >
              {renderBusy ? "Rendering…" : "Render"}
            </button>
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
          </div>
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
                          Cladding: {renderFinishesUsed.cladding}
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
