export const MAX_TRACE_POINTS = 20;

export const EXTERNAL_WALLS_LAYER_ID = "externalWalls";

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
    id: "internalWalls",
    label: "Internal Walls",
    stroke: "#2563eb",
    fillClosed: "rgba(37, 99, 235, 0.2)",
    fillOpen: "rgba(37, 99, 235, 0.1)",
    marker: "#2563eb",
    origin: "#1d4ed8",
    saves: false,
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

export function createEmptyLayerTraces() {
  return Object.fromEntries(
    TRACE_PLAN_LAYERS.map((layer) => [layer.id, { points: [], polygonClosed: false }])
  );
}

export function getTracePlanLayer(layerId) {
  return TRACE_PLAN_LAYERS.find((layer) => layer.id === layerId) || TRACE_PLAN_LAYERS[0];
}

export function parsePlanTracePolygon(raw) {
  if (!raw) return { page: 1, points: [] };
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const points = data?.points;
    const page = Number(data?.page);
    if (!Array.isArray(points)) {
      return { page: Number.isFinite(page) && page >= 1 ? page : 1, points: [] };
    }
    return {
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      points: points
        .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
        .slice(0, MAX_TRACE_POINTS),
    };
  } catch {
    return { page: 1, points: [] };
  }
}

export function serializePlanTracePolygon(page, normalizedPoints) {
  return JSON.stringify({
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    points: normalizedPoints.slice(0, MAX_TRACE_POINTS),
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
