export const MAX_TRACE_POINTS = 20;

export const EXTERNAL_WALLS_LAYER_ID = "externalWalls";
export const INTERNAL_WALLS_LAYER_ID = "internalWalls";
export const WINDOWS_LAYER_ID = "windows";
export const DOORS_LAYER_ID = "doors";
export const SLIDING_DOORS_LAYER_ID = "slidingDoors";
export const ROOF_LAYER_ID = "roof";
export const DECK_LAYER_ID = "deck";

export const TRACE_PLAN_GROUPS = [
  { id: "external", label: "External" },
  { id: "internal", label: "Internal" },
];

export const TRACE_PLAN_LAYERS = [
  {
    id: EXTERNAL_WALLS_LAYER_ID,
    label: "Walls",
    group: "external",
    stroke: "#dc2626",
    fillClosed: "rgba(220, 38, 38, 0.2)",
    fillOpen: "rgba(220, 38, 38, 0.1)",
    marker: "#dc2626",
    origin: "#16a34a",
    saves: true,
  },
  {
    id: DECK_LAYER_ID,
    label: "Deck",
    group: "external",
    mode: "decks",
    stroke: "#059669",
    fillClosed: "rgba(5, 150, 105, 0.22)",
    fillOpen: "rgba(5, 150, 105, 0.12)",
    marker: "#059669",
    origin: "#047857",
    saves: true,
    submenu: [
      { id: "add", label: "Add" },
      { id: "edit", label: "Edit" },
      { id: "delete", label: "Delete" },
    ],
  },
  {
    id: ROOF_LAYER_ID,
    label: "Roof",
    group: "external",
    stroke: "#475569",
    fillClosed: "rgba(71, 85, 105, 0.25)",
    fillOpen: "rgba(71, 85, 105, 0.14)",
    marker: "#475569",
    origin: "#334155",
    saves: true,
    submenu: [
      { id: "outline", label: "Draw outline" },
      { id: "pivot", label: "Draw pivot point" },
    ],
  },
  {
    id: WINDOWS_LAYER_ID,
    label: "Windows",
    group: "external",
    mode: "windows",
    stroke: "#2563eb",
    fillClosed: "rgba(37, 99, 235, 0.22)",
    fillOpen: "rgba(37, 99, 235, 0.12)",
    marker: "#2563eb",
    origin: "#1d4ed8",
    saves: true,
    submenu: [
      { id: "add", label: "Add" },
      { id: "edit", label: "Edit" },
      { id: "delete", label: "Delete" },
    ],
  },
  {
    id: DOORS_LAYER_ID,
    label: "Swing Door",
    group: "external",
    mode: "doors",
    stroke: "#b45309",
    fillClosed: "rgba(180, 83, 9, 0.22)",
    fillOpen: "rgba(180, 83, 9, 0.12)",
    marker: "#b45309",
    origin: "#92400e",
    saves: true,
    submenu: [
      { id: "add", label: "Add" },
      { id: "edit", label: "Edit" },
      { id: "delete", label: "Delete" },
    ],
  },
  {
    id: SLIDING_DOORS_LAYER_ID,
    label: "Sliding Door",
    group: "external",
    mode: "slidingDoors",
    stroke: "#0f766e",
    fillClosed: "rgba(15, 118, 110, 0.22)",
    fillOpen: "rgba(15, 118, 110, 0.12)",
    marker: "#0f766e",
    origin: "#115e59",
    saves: true,
    submenu: [
      { id: "add", label: "Add" },
      { id: "edit", label: "Edit" },
      { id: "delete", label: "Delete" },
    ],
  },
  {
    id: "flooring",
    label: "Flooring",
    group: "internal",
    stroke: "#d97706",
    fillClosed: "rgba(217, 119, 6, 0.22)",
    fillOpen: "rgba(217, 119, 6, 0.12)",
    marker: "#d97706",
    origin: "#b45309",
    saves: false,
  },
  {
    id: INTERNAL_WALLS_LAYER_ID,
    label: "Walls",
    group: "internal",
    mode: "lines",
    stroke: "#14b8a6",
    fillClosed: "rgba(20, 184, 166, 0.2)",
    fillOpen: "rgba(20, 184, 166, 0.1)",
    marker: "#14b8a6",
    origin: "#0f766e",
    saves: true,
  },
];

export function isLineTraceLayer(layerId) {
  const layer = getTracePlanLayer(layerId);
  return layer.mode === "lines";
}

export function isWindowsTraceLayer(layerId) {
  const layer = getTracePlanLayer(layerId);
  return layer.mode === "windows";
}

export function isDoorsTraceLayer(layerId) {
  const layer = getTracePlanLayer(layerId);
  return layer.mode === "doors";
}

export function isSlidingDoorsTraceLayer(layerId) {
  const layer = getTracePlanLayer(layerId);
  return layer.mode === "slidingDoors";
}

export function isDeckTraceLayer(layerId) {
  const layer = getTracePlanLayer(layerId);
  return layer.mode === "decks";
}

export function createEmptyLayerTrace(layerId) {
  if (isWindowsTraceLayer(layerId)) {
    return { windows: [] };
  }
  if (isDoorsTraceLayer(layerId)) {
    return { doors: [] };
  }
  if (isSlidingDoorsTraceLayer(layerId)) {
    return { slidingDoors: [] };
  }
  if (isDeckTraceLayer(layerId)) {
    return { decks: [], points: [], polygonClosed: false };
  }
  if (isLineTraceLayer(layerId)) {
    return { segments: [], draftStart: null };
  }
  if (isRoofTraceLayer(layerId)) {
    return { points: [], polygonClosed: false, pivotLine: null };
  }
  return { points: [], polygonClosed: false };
}

export function createEmptyLayerTraces() {
  return Object.fromEntries(
    TRACE_PLAN_LAYERS.map((layer) => [layer.id, createEmptyLayerTrace(layer.id)])
  );
}

export function hasLayerDraft(layerId, trace) {
  if (!trace) return false;
  if (isWindowsTraceLayer(layerId)) {
    return (trace.windows?.length ?? 0) > 0;
  }
  if (isDoorsTraceLayer(layerId)) {
    return (trace.doors?.length ?? 0) > 0;
  }
  if (isSlidingDoorsTraceLayer(layerId)) {
    return (trace.slidingDoors?.length ?? 0) > 0;
  }
  if (isDeckTraceLayer(layerId)) {
    return (
      (trace.decks?.length ?? 0) > 0 ||
      (trace.points?.length ?? 0) > 0 ||
      Boolean(trace.polygonClosed)
    );
  }
  if (isLineTraceLayer(layerId)) {
    return (trace.segments?.length ?? 0) > 0 || trace.draftStart != null;
  }
  if (isRoofTraceLayer(layerId)) {
    return (
      (trace.points?.length ?? 0) > 0 ||
      Boolean(trace.polygonClosed) ||
      Boolean(trace.pivotLine?.a && trace.pivotLine?.b)
    );
  }
  return (trace.points?.length ?? 0) > 0 || Boolean(trace.polygonClosed);
}

export function getTracePlanLayer(layerId) {
  return TRACE_PLAN_LAYERS.find((layer) => layer.id === layerId) || TRACE_PLAN_LAYERS[0];
}

export function parseInternalWallSegments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((seg) => {
      const ax = seg?.a?.x;
      const ay = seg?.a?.y;
      const bx = seg?.b?.x;
      const by = seg?.b?.y;
      if (![ax, ay, bx, by].every((v) => Number.isFinite(v))) return null;
      return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
    })
    .filter(Boolean);
}

export function parsePlanTraceCrop(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  const w = Number(raw.w);
  const h = Number(raw.h);
  if (![x, y, w, h].every((v) => Number.isFinite(v))) return null;
  if (w <= 0 || h <= 0) return null;
  if (x < 0 || y < 0 || x + w > 1.0001 || y + h > 1.0001) return null;
  return {
    x: Math.round(x * 1e6) / 1e6,
    y: Math.round(y * 1e6) / 1e6,
    w: Math.round(w * 1e6) / 1e6,
    h: Math.round(h * 1e6) / 1e6,
  };
}

/** Windows stored as outer-face endpoints (normalized page coords). */
export function parsePlanTraceWindows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((win) => {
      const ax = win?.a?.x;
      const ay = win?.a?.y;
      const bx = win?.b?.x;
      const by = win?.b?.y;
      if (![ax, ay, bx, by].every((v) => Number.isFinite(v))) return null;
      const out = { a: { x: ax, y: ay }, b: { x: bx, y: by } };
      const heightM = Number(win?.heightM);
      if (Number.isFinite(heightM) && heightM > 0) out.heightM = Math.round(heightM * 1e4) / 1e4;
      return out;
    })
    .filter(Boolean);
}

/** Doors stored as outer-face endpoints (normalized page coords). */
export function parsePlanTraceDoors(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((door) => {
      const ax = door?.a?.x;
      const ay = door?.a?.y;
      const bx = door?.b?.x;
      const by = door?.b?.y;
      if (![ax, ay, bx, by].every((v) => Number.isFinite(v))) return null;
      return { a: { x: ax, y: ay }, b: { x: bx, y: by } };
    })
    .filter(Boolean);
}

/** Sliding doors use the same endpoint storage as swing doors. */
export function parsePlanTraceSlidingDoors(raw) {
  return parsePlanTraceDoors(raw);
}

/** Calibration line (normalized endpoints + real length in metres + page aspect). */
export function parsePlanTraceCalibration(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ax = Number(raw.a?.x);
  const ay = Number(raw.a?.y);
  const bx = Number(raw.b?.x);
  const by = Number(raw.b?.y);
  const lengthM = Number(raw.lengthM);
  const aspect = Number(raw.aspect);
  if (![ax, ay, bx, by, lengthM].every((v) => Number.isFinite(v))) return null;
  if (!(lengthM > 0)) return null;
  const out = {
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    lengthM: Math.round(lengthM * 1e4) / 1e4,
  };
  if (Number.isFinite(aspect) && aspect > 0) out.aspect = Math.round(aspect * 1e6) / 1e6;
  return out;
}

/** Roof skillion pivot / hinge line (normalized endpoints, H or V in plan). */
export function parsePlanTraceRoofPivotLine(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ax = Number(raw.a?.x);
  const ay = Number(raw.a?.y);
  const bx = Number(raw.b?.x);
  const by = Number(raw.b?.y);
  if (![ax, ay, bx, by].every((v) => Number.isFinite(v))) return null;
  if (Math.hypot(bx - ax, by - ay) < 1e-9) return null;
  return {
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
  };
}

export function isRoofTraceLayer(layerId) {
  return layerId === ROOF_LAYER_ID;
}

/** Normalize a deck outline to page 0–1 points (min 3). */
export function parsePlanTraceDeckPoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .slice(0, MAX_TRACE_POINTS)
    .map((p) => ({ x: p.x, y: p.y }));
}

/**
 * Prefer `decks: [{ points }]`. Migrate legacy `deckPoints` → one deck.
 * @returns {{ points: { x: number, y: number }[] }[]}
 */
export function parsePlanTraceDecks(rawDecks, legacyDeckPoints) {
  const fromArray = Array.isArray(rawDecks)
    ? rawDecks
        .map((deck) => {
          const points = parsePlanTraceDeckPoints(deck?.points ?? deck);
          return points.length >= 3 ? { points } : null;
        })
        .filter(Boolean)
    : [];
  if (fromArray.length) return fromArray;
  const legacy = parsePlanTraceDeckPoints(legacyDeckPoints);
  return legacy.length >= 3 ? [{ points: legacy }] : [];
}

export function parsePlanTracePolygon(raw) {
  const empty = {
    page: 1,
    points: [],
    roofPoints: [],
    roofPivotLine: null,
    decks: [],
    deckPoints: [],
    internalWallSegments: [],
    crop: null,
    windows: [],
    doors: [],
    slidingDoors: [],
    calibration: null,
  };
  if (!raw) return empty;
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const points = data?.points;
    const page = Number(data?.page);
    const internalWallSegments = parseInternalWallSegments(data?.internalWallSegments);
    const crop = parsePlanTraceCrop(data?.crop);
    const windows = parsePlanTraceWindows(data?.windows);
    const doors = parsePlanTraceDoors(data?.doors);
    const slidingDoors = parsePlanTraceSlidingDoors(data?.slidingDoors);
    const calibration = parsePlanTraceCalibration(data?.calibration);
    const roofPivotLine = parsePlanTraceRoofPivotLine(data?.roofPivotLine);
    const roofPoints = Array.isArray(data?.roofPoints)
      ? data.roofPoints
          .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
          .slice(0, MAX_TRACE_POINTS)
      : [];
    const decks = parsePlanTraceDecks(data?.decks, data?.deckPoints);
    const deckPoints = decks[0]?.points ?? [];
    const safePage = Number.isFinite(page) && page >= 1 ? page : 1;
    if (!Array.isArray(points)) {
      return {
        page: safePage,
        points: [],
        roofPoints,
        roofPivotLine,
        decks,
        deckPoints,
        internalWallSegments,
        crop,
        windows,
        doors,
        slidingDoors,
        calibration,
      };
    }
    return {
      page: safePage,
      points: points
        .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        .slice(0, MAX_TRACE_POINTS),
      roofPoints,
      roofPivotLine,
      decks,
      deckPoints,
      internalWallSegments,
      crop,
      windows,
      doors,
      slidingDoors,
      calibration,
    };
  } catch {
    return {
      page: 1,
      points: [],
      roofPoints: [],
      roofPivotLine: null,
      decks: [],
      deckPoints: [],
      internalWallSegments: [],
      crop: null,
      windows: [],
      doors: [],
      slidingDoors: [],
      calibration: null,
    };
  }
}

export function serializePlanTracePolygon(
  page,
  normalizedPoints,
  internalWallSegments = [],
  crop = null,
  windows = [],
  calibration = null,
  doors = [],
  slidingDoors = [],
  roofPoints = [],
  decks = [],
  roofPivotLine = null
) {
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const payload = {
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    points: normalizedPoints.slice(0, MAX_TRACE_POINTS),
    internalWallSegments: (internalWallSegments ?? []).map((seg) => ({
      a: { x: round(seg.a.x), y: round(seg.a.y) },
      b: { x: round(seg.b.x), y: round(seg.b.y) },
    })),
  };
  const normalizedRoof = (roofPoints ?? [])
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .slice(0, MAX_TRACE_POINTS)
    .map((p) => ({ x: round(p.x), y: round(p.y) }));
  if (normalizedRoof.length >= 3) payload.roofPoints = normalizedRoof;
  const pivot = parsePlanTraceRoofPivotLine(roofPivotLine);
  if (pivot) {
    payload.roofPivotLine = {
      a: { x: round(pivot.a.x), y: round(pivot.a.y) },
      b: { x: round(pivot.b.x), y: round(pivot.b.y) },
    };
  }
  // Accept either decks[] or a legacy single deckPoints array as the last arg.
  const deckList = Array.isArray(decks) && decks.length && !Number.isFinite(decks[0]?.x)
    ? decks
    : Array.isArray(decks) && decks.length >= 3 && Number.isFinite(decks[0]?.x)
      ? [{ points: decks }]
      : [];
  const normalizedDecks = deckList
    .map((deck) => {
      const pts = parsePlanTraceDeckPoints(deck?.points ?? deck)
        .slice(0, MAX_TRACE_POINTS)
        .map((p) => ({ x: round(p.x), y: round(p.y) }));
      return pts.length >= 3 ? { points: pts } : null;
    })
    .filter(Boolean);
  if (normalizedDecks.length) {
    payload.decks = normalizedDecks;
    // Keep legacy key so older readers still see the first deck.
    payload.deckPoints = normalizedDecks[0].points;
  }
  const normalizedWindows = parsePlanTraceWindows(windows).map((win) => {
    const out = {
      a: { x: round(win.a.x), y: round(win.a.y) },
      b: { x: round(win.b.x), y: round(win.b.y) },
    };
    if (Number.isFinite(win.heightM) && win.heightM > 0) out.heightM = round(win.heightM);
    return out;
  });
  if (normalizedWindows.length) payload.windows = normalizedWindows;
  const normalizedDoors = parsePlanTraceDoors(doors).map((door) => ({
    a: { x: round(door.a.x), y: round(door.a.y) },
    b: { x: round(door.b.x), y: round(door.b.y) },
  }));
  if (normalizedDoors.length) payload.doors = normalizedDoors;
  const normalizedSlidingDoors = parsePlanTraceSlidingDoors(slidingDoors).map((door) => ({
    a: { x: round(door.a.x), y: round(door.a.y) },
    b: { x: round(door.b.x), y: round(door.b.y) },
  }));
  if (normalizedSlidingDoors.length) payload.slidingDoors = normalizedSlidingDoors;
  const normalizedCrop = parsePlanTraceCrop(crop);
  if (normalizedCrop) payload.crop = normalizedCrop;
  const normalizedCalibration = parsePlanTraceCalibration(calibration);
  if (normalizedCalibration) payload.calibration = normalizedCalibration;
  return JSON.stringify(payload);
}

/** Source-pixel crop rect → page-normalized {x,y,w,h}. */
export function normalizeCropRect(rect, width, height) {
  if (!rect || !width || !height) return null;
  return parsePlanTraceCrop({
    x: rect.x / width,
    y: rect.y / height,
    w: rect.w / width,
    h: rect.h / height,
  });
}

/** Page-normalized crop → source-pixel rect. */
export function denormalizeCropRect(crop, width, height) {
  const normalized = parsePlanTraceCrop(crop);
  if (!normalized || !width || !height) return null;
  return {
    x: normalized.x * width,
    y: normalized.y * height,
    w: normalized.w * width,
    h: normalized.h * height,
  };
}

/** Normalize a pixel crop so x/y are top-left and w/h positive. */
export function normalizePixelCropRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  return { x, y, w, h };
}

export function normalizeTracePoints(points, width, height) {
  if (!width || !height) return [];
  return points.map((p) => ({
    x: Math.round((p.x / width) * 1e6) / 1e6,
    y: Math.round((p.y / height) * 1e6) / 1e6,
  }));
}

export function denormalizeTracePoints(normalizedPoints, width, height) {
  if (!width || !height) return [];
  return normalizedPoints.map((p) => ({
    x: p.x * width,
    y: p.y * height,
  }));
}

export function normalizeTraceSegments(segments, width, height) {
  if (!width || !height || !Array.isArray(segments)) return [];
  return segments.map((seg) => ({
    a: {
      x: Math.round((seg.a.x / width) * 1e6) / 1e6,
      y: Math.round((seg.a.y / height) * 1e6) / 1e6,
    },
    b: {
      x: Math.round((seg.b.x / width) * 1e6) / 1e6,
      y: Math.round((seg.b.y / height) * 1e6) / 1e6,
    },
  }));
}

export function denormalizeTraceSegments(normalizedSegments, width, height) {
  if (!width || !height || !Array.isArray(normalizedSegments)) return [];
  return normalizedSegments.map((seg) => ({
    a: { x: seg.a.x * width, y: seg.a.y * height },
    b: { x: seg.b.x * width, y: seg.b.y * height },
  }));
}
