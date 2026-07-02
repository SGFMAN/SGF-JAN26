export const MAX_TRACE_POINTS = 20;

export const EXTERNAL_WALLS_LAYER_ID = "externalWalls";
export const INTERNAL_WALLS_LAYER_ID = "internalWalls";

export const TRACE_PLAN_LAYERS = [
  {
    id: EXTERNAL_WALLS_LAYER_ID,
    label: "External Walls",
    stroke: "#dc2626",
    fillClosed: "rgba(220, 38, 38, 0.2)",
    fillOpen: "rgba(220, 38, 38, 0.1)",
    marker: "#dc2626",
    origin: "#16a34a",
    saves: true,
  },
  {
    id: INTERNAL_WALLS_LAYER_ID,
    label: "Internal Walls",
    mode: "lines",
    stroke: "#14b8a6",
    fillClosed: "rgba(20, 184, 166, 0.2)",
    fillOpen: "rgba(20, 184, 166, 0.1)",
    marker: "#14b8a6",
    origin: "#0f766e",
    saves: true,
  },
  {
    id: "flooring",
    label: "Flooring",
    stroke: "#d97706",
    fillClosed: "rgba(217, 119, 6, 0.22)",
    fillOpen: "rgba(217, 119, 6, 0.12)",
    marker: "#d97706",
    origin: "#b45309",
    saves: false,
  },
  {
    id: "deck",
    label: "Deck",
    stroke: "#059669",
    fillClosed: "rgba(5, 150, 105, 0.22)",
    fillOpen: "rgba(5, 150, 105, 0.12)",
    marker: "#059669",
    origin: "#047857",
    saves: false,
  },
  {
    id: "verandah",
    label: "Verandah",
    stroke: "#7c3aed",
    fillClosed: "rgba(124, 58, 237, 0.22)",
    fillOpen: "rgba(124, 58, 237, 0.12)",
    marker: "#7c3aed",
    origin: "#6d28d9",
    saves: false,
  },
  {
    id: "roof",
    label: "Roof",
    stroke: "#475569",
    fillClosed: "rgba(71, 85, 105, 0.25)",
    fillOpen: "rgba(71, 85, 105, 0.14)",
    marker: "#475569",
    origin: "#334155",
    saves: false,
  },
];

export function isLineTraceLayer(layerId) {
  const layer = getTracePlanLayer(layerId);
  return layer.mode === "lines";
}

export function createEmptyLayerTrace(layerId) {
  if (isLineTraceLayer(layerId)) {
    return { segments: [], draftStart: null };
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
  if (isLineTraceLayer(layerId)) {
    return (trace.segments?.length ?? 0) > 0 || trace.draftStart != null;
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

export function parsePlanTracePolygon(raw) {
  if (!raw) return { page: 1, points: [], internalWallSegments: [] };
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const points = data?.points;
    const page = Number(data?.page);
    const internalWallSegments = parseInternalWallSegments(data?.internalWallSegments);
    if (!Array.isArray(points)) {
      return {
        page: Number.isFinite(page) && page >= 1 ? page : 1,
        points: [],
        internalWallSegments,
      };
    }
    return {
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      points: points
        .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        .slice(0, MAX_TRACE_POINTS),
      internalWallSegments,
    };
  } catch {
    return { page: 1, points: [], internalWallSegments: [] };
  }
}

export function serializePlanTracePolygon(page, normalizedPoints, internalWallSegments = []) {
  return JSON.stringify({
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    points: normalizedPoints.slice(0, MAX_TRACE_POINTS),
    internalWallSegments: (internalWallSegments ?? []).map((seg) => ({
      a: {
        x: Math.round(seg.a.x * 1e6) / 1e6,
        y: Math.round(seg.a.y * 1e6) / 1e6,
      },
      b: {
        x: Math.round(seg.b.x * 1e6) / 1e6,
        y: Math.round(seg.b.y * 1e6) / 1e6,
      },
    })),
  });
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
