export const MAX_TRACE_POINTS = 20;

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
