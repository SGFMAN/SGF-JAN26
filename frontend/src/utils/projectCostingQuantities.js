import {
  bearerRunAxis,
  CONCRETE_STUMP_SIZE_M,
  DEFAULT_BUILDING_3D,
  FRAME_NOGGING_STAGGER_M,
  FRAME_STUD_CENTRES_M,
  FRAME_SWING_DOOR_JAMB_OUTSET_M,
  FRAME_TIMBER_DEPTH_M,
  FRAME_TIMBER_FACE_M,
  FRAME_WINDOW_LINTEL_BEARING_M,
  FRAME_WINDOW_LINTEL_HEIGHT_M,
  FRAME_WINDOW_LINTEL_THICKNESS_M,
  INTERNAL_FRAME_STUD_CENTRES_M,
  MEGA_ANCHOR_DIAMETER_M,
  OUTER_BEARER_INSET_M,
  OUTER_STUMP_END_INSET_M,
  resolvedSubfloorDrawType,
} from "../constants/building3dDefaults";
import {
  CLADDING_TYPE_DURAGROOVE,
  loadVisualiserViewPrefs,
  parseCladdingType,
} from "../constants/buildingElements";
import {
  footprintBounds,
  footprintEdgeInwardXZ,
  footprintRingAreaM2,
  resolveAlignedTraceRing,
  resolveBuildingFootprintRing,
  resolveModelDoors,
  resolveModelInternalDoors,
  resolveModelSlidingDoors,
  resolveModelWindows,
  sanitizeFootprintRing,
  sumFootprintWeatherboardLinealM,
} from "./buildingUnitGeometry";
import { parsePlanTracePolygon } from "./planTracePolygon";
import { DEFAULT_WINDOW_HEIGHT_M } from "./planTraceWindows";
import { getTracePlanXZMapping, normalizedPointToXZ } from "./tracePlan3D";

const WINDOW_HEIGHT_M = DEFAULT_WINDOW_HEIGHT_M;
const DOOR_HEIGHT_M = 2.1;
const WINDOW_TOP_ABOVE_SUBFLOOR_M = 2.1;
const WINDOW_WALL_ALIGN_MIN = 0.85;
const WINDOW_WALL_MAX_PERP_M = 0.35;

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function stickMetres(piece) {
  return Math.max(Number(piece.sx) || 0, Number(piece.sy) || 0, Number(piece.sz) || 0);
}

function sumStickMetres(pieces) {
  return (pieces || []).reduce((sum, piece) => sum + stickMetres(piece), 0);
}

const STUD_STOCK_MM = 2550;
const PLATE_STOCK_MM = 5400;

function toMm(metres) {
  const n = Number(metres);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.round(n * 1000));
}

function pieceLengthMm(piece) {
  return toMm(piece.lengthM) || toMm(stickMetres(piece));
}

/** Pack cut lengths into stock sticks. Returns purchase count and leftover mm in each stick. */
function packIntoStock(lengthsMm, stockMm) {
  const stock = Math.max(1, Math.round(Number(stockMm) || 0));
  const remainders = [];
  let count = 0;
  const pieces = (lengthsMm || [])
    .map((n) => Math.max(0, Math.round(Number(n) || 0)))
    .filter((n) => n > 0)
    .sort((a, b) => b - a);

  const takeFromRemainders = (need) => {
    const idx = remainders.findIndex((left) => left >= need);
    if (idx < 0) return false;
    remainders[idx] -= need;
    return true;
  };

  const buy = (useMm) => {
    count += 1;
    const leftover = stock - useMm;
    if (leftover > 0) remainders.push(leftover);
  };

  for (const raw of pieces) {
    let left = raw;
    while (left > stock) {
      buy(stock);
      left -= stock;
    }
    if (left <= 0) continue;
    if (!takeFromRemainders(left)) buy(left);
  }

  return {
    count,
    remainders: remainders.filter((n) => n > 0).sort((a, b) => b - a),
  };
}

function packUsingRemaindersThenStock(lengthsMm, seedRemaindersMm, stockMm) {
  const stock = Math.max(1, Math.round(Number(stockMm) || 0));
  const remainders = (seedRemaindersMm || [])
    .map((n) => Math.max(0, Math.round(Number(n) || 0)))
    .filter((n) => n > 0);
  let extra = 0;
  const pieces = (lengthsMm || [])
    .map((n) => Math.max(0, Math.round(Number(n) || 0)))
    .filter((n) => n > 0)
    .sort((a, b) => b - a);

  const takeFromRemainders = (need) => {
    const idx = remainders.findIndex((left) => left >= need);
    if (idx < 0) return false;
    remainders[idx] -= need;
    return true;
  };

  const buy = (useMm) => {
    extra += 1;
    const leftover = stock - useMm;
    if (leftover > 0) remainders.push(leftover);
  };

  for (const raw of pieces) {
    let left = raw;
    while (left > stock) {
      buy(stock);
      left -= stock;
    }
    if (left <= 0) continue;
    if (!takeFromRemainders(left)) buy(left);
  }

  return { extraStock: extra };
}

function summarizeFrameTimberStock(pieces) {
  const list = Array.isArray(pieces) ? pieces : [];
  const studs = list.filter((p) => p.role === "stud");
  const plates = list.filter((p) => p.role === "plate");
  const noggings = list.filter((p) => p.role === "nogging");
  const packedPlates = packIntoStock(
    plates.map((p) => pieceLengthMm(p)),
    PLATE_STOCK_MM
  );
  const studOffcutsMm = studs
    .map((p) => STUD_STOCK_MM - pieceLengthMm(p))
    .filter((mm) => mm >= 150);
  const packedNoggings = packUsingRemaindersThenStock(
    noggings.map((p) => pieceLengthMm(p)),
    [...packedPlates.remainders, ...studOffcutsMm],
    PLATE_STOCK_MM
  );
  return {
    studs2550: studs.length,
    plates5400: packedPlates.count,
    noggingsExtra5400: packedNoggings.extraStock,
    platesToBuy: packedPlates.count + packedNoggings.extraStock,
    noggingMetres: noggings.reduce((sum, p) => sum + (Number(p.lengthM) || stickMetres(p)), 0),
  };
}

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
    edges.push({
      a,
      b,
      len,
      dirX,
      dirZ,
      inX: inward.x,
      inZ: inward.z,
      midX: (a.x + b.x) / 2,
      midZ: (a.z + b.z) / 2,
    });
  }
  return edges;
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

function layoutFootprintFramingSites(ring, {
  widthM,
  depthM,
  bearerSpanMaxM,
  joistSpanMaxM,
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
  return sites.length ? sites : null;
}

function countStumpSites(ring, defaults, style) {
  const isMegaAnchors = style === "mega_anchors";
  const gridSize = CONCRETE_STUMP_SIZE_M;
  const diameter = MEGA_ANCHOR_DIAMETER_M;
  const alongInset = isMegaAnchors ? OUTER_STUMP_END_INSET_M : 0;
  const acrossInset = isMegaAnchors ? OUTER_BEARER_INSET_M : 0;
  const bounds = footprintBounds(ring);
  const widthM = bounds.widthM || defaults.widthM;
  const depthM = bounds.depthM || defaults.depthM;
  const bearerAxis = bearerRunAxis(widthM, depthM);
  const footprintLayout = layoutFootprintFramingSites(ring, {
    widthM,
    depthM,
    bearerSpanMaxM: defaults.bearerSpanMaxM,
    joistSpanMaxM: defaults.joistSpanMaxM,
    stumpSize: isMegaAnchors ? diameter : gridSize,
    acrossInset,
    alongInset,
  });
  const xs = footprintLayout
    ? []
    : axisGridPositions(
        widthM,
        bearerAxis === "x" ? defaults.bearerSpanMaxM : defaults.joistSpanMaxM,
        gridSize,
        bearerAxis === "x" ? alongInset : acrossInset
      );
  const zs = footprintLayout
    ? []
    : axisGridPositions(
        depthM,
        bearerAxis === "z" ? defaults.bearerSpanMaxM : defaults.joistSpanMaxM,
        gridSize,
        bearerAxis === "z" ? alongInset : acrossInset
      );
  let sites = footprintLayout || stumpGridSites(xs, zs, ring);
  if (sites.length < 1) sites = stumpGridSites(xs, zs, null);
  return sites.length;
}

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
    out.push(round3(a + i * pitch));
  }
  return out;
}

function mergeStudPositions(positions, faceM, plateLenM) {
  const face = Math.max(0.02, Number(faceM) || FRAME_TIMBER_FACE_M);
  const half = Math.max(face, Number(plateLenM) || 0) / 2;
  const minC = round3(-half + face / 2);
  const maxC = round3(half - face / 2);
  const mergeTol = 0.02;
  const sorted = [...positions]
    .map((p) => round3(p))
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

function noggingBaysBetweenStuds(studPositions, faceM) {
  const face = Math.max(0.02, Number(faceM) || FRAME_TIMBER_FACE_M);
  const bays = [];
  for (let i = 0; i < studPositions.length - 1; i += 1) {
    const a = studPositions[i];
    const b = studPositions[i + 1];
    const length = Math.abs(b - a) - face;
    if (length < face) continue;
    bays.push({
      center: round3((a + b) / 2),
      length: round3(length),
      staggerSign: i % 2 === 0 ? 1 : -1,
    });
  }
  return bays;
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
      kind === "door" || kind === "sliding-door" ? FRAME_SWING_DOOR_JAMB_OUTSET_M : 0;
    const alongHalf = kind === "window" ? (lengthM / 2) * align : lengthM / 2 + jambOutset;
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

function wallFrameOpenings(windows, doors, slidingDoors, originX, originZ, dirX, dirZ, plateLenM) {
  return [
    ...openingsAlongWall(windows, originX, originZ, dirX, dirZ, plateLenM, WINDOW_HEIGHT_M, "window"),
    ...openingsAlongWall(doors, originX, originZ, dirX, dirZ, plateLenM, DOOR_HEIGHT_M, "door"),
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
        along: round3((cursor + cut.min) / 2),
        length: round3(cut.min - cursor),
      });
    }
    cursor = Math.max(cursor, cut.max);
  }
  if (half - cursor > 0.02) {
    runs.push({
      along: round3((cursor + half) / 2),
      length: round3(half - cursor),
    });
  }
  return runs;
}

function fillCrippleStuds(leftJambM, rightJambM, centresM, faceM) {
  const filled = fillStudsBetween(leftJambM, rightJambM, centresM);
  if (filled.length) return filled;
  const span = Number(rightJambM) - Number(leftJambM);
  const face = Math.max(0.02, Number(faceM) || FRAME_TIMBER_FACE_M);
  if (span > face * 2.5) {
    return [round3((Number(leftJambM) + Number(rightJambM)) / 2)];
  }
  return [];
}

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
    lintelActualH = room > lintelH + 0.04 ? lintelH : round3(room);
    lintelBottom = topPlateUndersideY - lintelActualH;
  }
  return {
    bottomPlateTopY,
    topPlateUndersideY,
    headY,
    headPlateTopY,
    lintelActualH,
    lintelBottom,
  };
}

function partitionStudsForLintels(studLocals, openings, plateLenM) {
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
        sx: openingLen,
        sy,
        sz: timberDepth,
        role: "plate",
        lengthM: openingLen,
      });
    };

    const isDoor = isWallDoorOpening(op);
    if (!isDoor && sillY - timberFace > bottomPlateTopY + 0.01) {
      pushHorizontal(sillY - timberFace / 2, timberFace);
      const belowH = round3(sillY - timberFace - bottomPlateTopY);
      if (belowH > 0.02) {
        const belowY = bottomPlateTopY + belowH / 2;
        for (const along of fillCrippleStuds(leftJamb, rightJamb, centres, timberFace)) {
          pieces.push({
            along,
            y: belowY,
            sx: timberFace,
            sy: belowH,
            sz: timberDepth,
            role: "nogging",
            lengthM: belowH,
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
          sx: span.length,
          sy: lintelActualH,
          sz: lintelThick,
          role: "plate",
          lengthM: span.length,
        });
        const aboveH = round3(lintelBottom - headPlateTopY);
        if (aboveH > 0.02) {
          const aboveY = headPlateTopY + aboveH / 2;
          for (const along of fillCrippleStuds(leftJamb, rightJamb, centres, timberFace)) {
            pieces.push({
              along,
              y: aboveY,
              sx: timberFace,
              sy: aboveH,
              sz: timberDepth,
              role: "nogging",
              lengthM: aboveH,
            });
          }
        }
      }
    }
  }
  return pieces;
}

function collectWallFramePieces({
  edges,
  wallH,
  windows,
  doors,
  slidingDoors,
  studCentresM,
  extraFixedForEdge,
}) {
  const depth = FRAME_TIMBER_DEPTH_M;
  const face = FRAME_TIMBER_FACE_M;
  const floorY = 0;
  const studH = Math.max(0.05, round3(wallH - face * 3));
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
    windowHeadAboveFloorM: WINDOW_TOP_ABOVE_SUBFLOOR_M,
  });
  const jackH = round3(aboveLayout.lintelBottom - aboveLayout.bottomPlateTopY);
  const jackY = aboveLayout.bottomPlateTopY + jackH / 2;
  const trimJacks = aboveLayout.lintelActualH > 0.03 && jackH > 0.05;

  edges.forEach((edge, edgeIndex) => {
    const wallPhase = edgeIndex % 2 === 0 ? 1 : -1;
    const cx = edge.midX + edge.inX * (depth / 2);
    const cz = edge.midZ + edge.inZ * (depth / 2);
    const { dirX, dirZ, len } = edge;
    const openings = wallFrameOpenings(windows, doors, slidingDoors, cx, cz, dirX, dirZ, len);
    const extraFixed = extraFixedForEdge ? extraFixedForEdge(edge, edgeIndex, len, dirX, dirZ) : [];
    [top1Y, top2Y].forEach((y) => {
      pieces.push({ sx: len, sy: face, sz: depth, x: cx, y, z: cz, role: "plate", lengthM: len });
    });
    plateRunsSkippingDoorOpenings(len, openings).forEach((run) => {
      pieces.push({
        sx: run.length,
        sy: face,
        sz: depth,
        x: cx + dirX * run.along,
        y: bottomY,
        z: cz + dirZ * run.along,
        role: "plate",
        lengthM: run.length,
      });
    });
    const studLocals = layoutWallStuds(len, studCentresM, face, openings, extraFixed);
    const studParts = trimJacks
      ? partitionStudsForLintels(studLocals, openings, len)
      : { full: studLocals, jacks: [] };
    studParts.full.forEach((localX) => {
      pieces.push({
        sx: face,
        sy: studH,
        sz: depth,
        x: cx + dirX * localX,
        y: studY,
        z: cz + dirZ * localX,
        role: "stud",
        lengthM: studH,
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
        role: "stud",
        lengthM: jackH,
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
        role: "nogging",
        lengthM: bay.length,
      });
    });
    pieces.push(
      ...windowOpeningFrameLocalPieces({
        openings,
        floorY,
        wallH,
        face,
        depth,
        windowHeadAboveFloorM: WINDOW_TOP_ABOVE_SUBFLOOR_M,
        plateLenM: len,
        studCentresM,
      })
    );
  });
  return pieces;
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

function collectInternalFramePieces({
  footprintPoints,
  segments,
  doors,
  calibration,
  wallH,
}) {
  const mapping = getTracePlanXZMapping(footprintPoints, calibration);
  if (!mapping || !Array.isArray(segments) || !segments.length) return [];
  const depth = FRAME_TIMBER_DEPTH_M;
  const face = FRAME_TIMBER_FACE_M;
  const centres = INTERNAL_FRAME_STUD_CENTRES_M;
  const floorY = 0;
  const studH = Math.max(0.05, round3(wallH - face * 3));
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
  const jackH = round3(aboveLayout.lintelBottom - aboveLayout.bottomPlateTopY);
  const jackY = aboveLayout.bottomPlateTopY + jackH / 2;
  const trimJacks = aboveLayout.lintelActualH > 0.03 && jackH > 0.05;
  const segmentsXZ = segments.map((seg) => ({
    a: seg?.a ? normalizedPointToXZ(seg.a, mapping) : null,
    b: seg?.b ? normalizedPointToXZ(seg.b, mapping) : null,
  }));

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
    const wallPhase = index % 2 === 0 ? 1 : -1;
    const openings = internalDoorOpeningsOnSegment(doors, index, len);
    const junctions = internalWallJunctionLocals(seg.a, seg.b, len, dirX, dirZ, segmentsXZ, index);
    [top1Y, top2Y].forEach((y) => {
      pieces.push({ sx: len, sy: face, sz: depth, x: cx, y, z: cz, role: "plate", lengthM: len });
    });
    plateRunsSkippingDoorOpenings(len, openings).forEach((run) => {
      pieces.push({
        sx: run.length,
        sy: face,
        sz: depth,
        x: cx + dirX * run.along,
        y: bottomY,
        z: cz + dirZ * run.along,
        role: "plate",
        lengthM: run.length,
      });
    });
    const studLocals = layoutWallStuds(len, centres, face, openings, junctions);
    const studParts = trimJacks
      ? partitionStudsForLintels(studLocals, openings, len)
      : { full: studLocals, jacks: [] };
    studParts.full.forEach((localX) => {
      pieces.push({
        sx: face,
        sy: studH,
        sz: depth,
        x: cx + dirX * localX,
        y: studY,
        z: cz + dirZ * localX,
        role: "stud",
        lengthM: studH,
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
        role: "stud",
        lengthM: jackH,
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
        role: "nogging",
        lengthM: bay.length,
      });
    });
    pieces.push(
      ...windowOpeningFrameLocalPieces({
        openings,
        floorY,
        wallH,
        face,
        depth,
        windowHeadAboveFloorM: DOOR_HEIGHT_M,
        plateLenM: len,
        studCentresM: centres,
      })
    );
  });
  return pieces;
}

function mmFromMetres(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

function openingListItem(kind, item, defaultHeightM) {
  const widthM = Number(item.lengthM);
  const heightM = Number(item.heightM) > 0 ? Number(item.heightM) : defaultHeightM;
  return {
    kind,
    widthM,
    heightM,
    widthMm: mmFromMetres(widthM),
    heightMm: mmFromMetres(heightM),
  };
}

function regionAreaM2(regions, referencePoints, calibration) {
  return (regions || []).reduce((sum, region) => {
    const points = region?.points ?? region;
    const { ring } = resolveAlignedTraceRing(points, referencePoints, calibration);
    return sum + footprintRingAreaM2(ring);
  }, 0);
}

function materialLooksLikeDuragroove(raw) {
  const n = String(raw || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return n.includes("duragroove") || n.includes("duragrove");
}

function projectUsesDuragroove(project, defaults) {
  if (materialLooksLikeDuragroove(project?.cladding_material)) return true;
  const saved = loadVisualiserViewPrefs(project?.id);
  if (saved?.claddingType === CLADDING_TYPE_DURAGROOVE) return true;
  return parseCladdingType(defaults?.claddingType) === CLADDING_TYPE_DURAGROOVE;
}

function openingFaceAreaM2(item, defaultHeightM) {
  const widthM = Number(item?.lengthM) || 0;
  const heightM = Number(item?.heightM) > 0 ? Number(item.heightM) : defaultHeightM;
  if (!(widthM > 0) || !(heightM > 0)) return 0;
  return widthM * heightM;
}

function claddingWallAreasM2(ring, wallH, windows, doors, slidingDoors) {
  const perimeterM = footprintRingEdges(ring).reduce((sum, edge) => sum + edge.len, 0);
  const totalM2 = Math.max(0, perimeterM * wallH);
  const openingsM2 =
    windows.reduce((sum, item) => sum + openingFaceAreaM2(item, WINDOW_HEIGHT_M), 0) +
    doors.reduce((sum, item) => sum + openingFaceAreaM2(item, DOOR_HEIGHT_M), 0) +
    slidingDoors.reduce((sum, item) => sum + openingFaceAreaM2(item, DOOR_HEIGHT_M), 0);
  return {
    totalM2,
    withoutOpeningsM2: Math.max(0, totalM2 - openingsM2),
  };
}

export function computeProjectCostingQuantities(project, buildingDefaults) {
  const defaults = buildingDefaults && typeof buildingDefaults === "object"
    ? buildingDefaults
    : DEFAULT_BUILDING_3D;
  const parsed = parsePlanTracePolygon(project?.colours_plan_trace_polygon);
  const footprintPoints = parsed.points;
  const calibration = parsed.calibration;
  const { ring, fromTrace } = resolveBuildingFootprintRing(
    footprintPoints,
    defaults.widthM,
    defaults.depthM,
    calibration
  );
  const wallH = Math.max(
    FRAME_TIMBER_FACE_M * 3 + 0.05,
    Number(defaults.wallHeightM) || DEFAULT_BUILDING_3D.wallHeightM
  );
  const drawType = resolvedSubfloorDrawType(defaults);
  const slabAreaM2 = footprintRingAreaM2(ring);

  const modelWindows = fromTrace
    ? resolveModelWindows(footprintPoints, parsed.windows, calibration)
    : [];
  const modelDoors = fromTrace
    ? resolveModelDoors(footprintPoints, parsed.doors, calibration)
    : [];
  const modelSlidingDoors = fromTrace
    ? resolveModelSlidingDoors(footprintPoints, parsed.slidingDoors, calibration)
    : [];
  const modelInternalDoors =
    fromTrace && parsed.internalWallSegments.length
      ? resolveModelInternalDoors(
          footprintPoints,
          parsed.internalDoors,
          parsed.internalWallSegments,
          calibration
        )
      : [];

  const claddingOpenings = [
    ...modelDoors.map((door) => ({
      ...door,
      openingBottomYM: 0,
      openingTopYM: DOOR_HEIGHT_M,
    })),
    ...modelSlidingDoors.map((door) => ({
      ...door,
      openingBottomYM: 0,
      openingTopYM: DOOR_HEIGHT_M,
    })),
    ...modelWindows.map((win) => {
      const height = win.heightM > 0 ? win.heightM : WINDOW_HEIGHT_M;
      return {
        ...win,
        openingBottomYM: WINDOW_TOP_ABOVE_SUBFLOOR_M - height,
        openingTopYM: WINDOW_TOP_ABOVE_SUBFLOOR_M,
      };
    }),
  ];

  const usesDuragroove = projectUsesDuragroove(project, defaults);
  const claddingArea = claddingWallAreasM2(
    ring,
    wallH,
    modelWindows,
    modelDoors,
    modelSlidingDoors
  );
  const weatherboardMetres = usesDuragroove
    ? 0
    : sumFootprintWeatherboardLinealM(ring, 0, wallH, claddingOpenings);

  const edges = footprintRingEdges(ring).map((edge) => ({
    ...edge,
    inX: edge.inX,
    inZ: edge.inZ,
  }));
  const externalPieces = collectWallFramePieces({
    edges,
    wallH,
    windows: modelWindows,
    doors: modelDoors,
    slidingDoors: modelSlidingDoors,
    studCentresM: FRAME_STUD_CENTRES_M,
  });
  const internalPieces = fromTrace
    ? collectInternalFramePieces({
        footprintPoints,
        segments: parsed.internalWallSegments,
        doors: modelInternalDoors,
        calibration,
        wallH,
      })
    : [];
  const frameTimberMetres = sumStickMetres(externalPieces) + sumStickMetres(internalPieces);
  const frameStock = summarizeFrameTimberStock([...externalPieces, ...internalPieces]);

  const openings = [
    ...modelWindows.map((item) => openingListItem("Window", item, WINDOW_HEIGHT_M)),
    ...modelDoors.map((item) => openingListItem("Swing Door", item, DOOR_HEIGHT_M)),
    ...modelSlidingDoors.map((item) => openingListItem("Sliding Door", item, DOOR_HEIGHT_M)),
    ...modelInternalDoors.map((item) => openingListItem("Internal Door", item, DOOR_HEIGHT_M)),
  ];

  const wallRef = fromTrace && footprintPoints.length >= 3 ? footprintPoints : null;
  const flooring = {
    hybridM2: wallRef ? regionAreaM2(parsed.hybridRegions, wallRef, calibration) : 0,
    tilesM2: wallRef ? regionAreaM2(parsed.tilesRegions, wallRef, calibration) : 0,
    carpetM2: wallRef ? regionAreaM2(parsed.carpetRegions, wallRef, calibration) : 0,
  };

  let footing = { type: drawType, count: 0, areaM2: 0 };
  if (drawType === "slab") {
    footing = { type: "slab", count: 0, areaM2: slabAreaM2 };
  } else if (drawType === "mega_anchors") {
    footing = { type: "mega_anchors", count: countStumpSites(ring, defaults, "mega_anchors"), areaM2: 0 };
  } else {
    footing = {
      type: "concrete_stumps",
      count: countStumpSites(ring, defaults, "concrete_stumps"),
      areaM2: 0,
    };
  }

  return {
    fromTrace,
    hasPlan: fromTrace,
    wallHeightM: wallH,
    footing,
    usesDuragroove,
    claddingArea,
    weatherboardMetres,
    frameTimberMetres,
    frameStock,
    openings,
    flooring,
  };
}
