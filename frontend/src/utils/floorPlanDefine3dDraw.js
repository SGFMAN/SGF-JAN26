/** Snap `to` to horizontal or vertical from `from` (orthogonal / 90° only). */
export function orthogonalSnap(from, to) {
  if (!from) return { x: to.x, y: to.y };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: to.x, y: from.y };
  }
  return { x: from.x, y: to.y };
}

export function isNearPoint(a, b, threshold) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= threshold;
}

/** Map screen coords on canvas to image/source coords. */
export function screenToImagePoint(screenX, screenY, view) {
  const scale = view.baseFit * view.zoom;
  return {
    x: (screenX - view.panX) / scale,
    y: (screenY - view.panY) / scale,
  };
}

/** Map image point to screen coords. */
export function imageToScreenPoint(imageX, imageY, view) {
  const scale = view.baseFit * view.zoom;
  return {
    x: imageX * scale + view.panX,
    y: imageY * scale + view.panY,
  };
}

export function fitImageInViewport(imageWidth, imageHeight, viewportWidth, viewportHeight) {
  if (!imageWidth || !imageHeight || !viewportWidth || !viewportHeight) {
    return { baseFit: 1, panX: 0, panY: 0 };
  }
  const baseFit = Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight);
  const panX = (viewportWidth - imageWidth * baseFit) / 2;
  const panY = (viewportHeight - imageHeight * baseFit) / 2;
  return { baseFit, panX, panY, zoom: 1 };
}

/** Pointer hit radius in image pixels for a given on-screen pixel size. */
export function hitThresholdImagePx(view, screenPx = 12) {
  const scale = view.baseFit * view.zoom;
  return screenPx / Math.max(scale, 0.001);
}

export function findExternalWallNodeHit(imagePt, polygons, view) {
  const threshold = hitThresholdImagePx(view);
  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex += 1) {
    const polygon = polygons[polygonIndex];
    for (let vertexIndex = 0; vertexIndex < polygon.length; vertexIndex += 1) {
      if (isNearPoint(imagePt, polygon[vertexIndex], threshold)) {
        return { polygonIndex, vertexIndex };
      }
    }
  }
  return null;
}

export function findInternalWallNodeHit(imagePt, segments, view) {
  const threshold = hitThresholdImagePx(view);
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    if (segment?.length !== 2) continue;
    for (let endIndex = 0; endIndex < 2; endIndex += 1) {
      if (isNearPoint(imagePt, segment[endIndex], threshold)) {
        return { segmentIndex, endIndex };
      }
    }
  }
  return null;
}

function distancePointToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Hit-test closed external wall polygon (edge or interior). Returns polygon index. */
export function findExternalWallPolygonHit(imagePt, polygons, view) {
  const edgeThreshold = hitThresholdImagePx(view, 10);

  for (let polygonIndex = polygons.length - 1; polygonIndex >= 0; polygonIndex -= 1) {
    const polygon = polygons[polygonIndex];
    if (!polygon || polygon.length < 3) continue;

    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (distancePointToSegment(imagePt, a, b) <= edgeThreshold) {
        return polygonIndex;
      }
    }

    if (isPointInPolygon(imagePt, polygon)) {
      return polygonIndex;
    }
  }
  return null;
}

/** Hit-test internal wall line segment. Returns segment index. */
export function findInternalWallSegmentHit(imagePt, segments, view) {
  const threshold = hitThresholdImagePx(view, 10);

  for (let segmentIndex = segments.length - 1; segmentIndex >= 0; segmentIndex -= 1) {
    const segment = segments[segmentIndex];
    if (segment?.length !== 2) continue;
    if (distancePointToSegment(imagePt, segment[0], segment[1]) <= threshold) {
      return segmentIndex;
    }
  }
  return null;
}

/** Close polygon if click is near first vertex (threshold in image pixels). */
export function closeThresholdImagePx(view) {
  const scale = view.baseFit * view.zoom;
  return 12 / Math.max(scale, 0.001);
}

export function clampImagePoint(point, imageWidth, imageHeight) {
  return {
    x: Math.max(0, Math.min(imageWidth, point.x)),
    y: Math.max(0, Math.min(imageHeight, point.y)),
  };
}
