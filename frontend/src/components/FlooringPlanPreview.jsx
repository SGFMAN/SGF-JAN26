import React, { useEffect, useMemo, useState } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import {
  fetchAuthedImageBlobUrl,
  getCachedAuthedImageBlobUrl,
} from "../utils/authedImageCache";
import { computeMetresPerPixel, calibrationNormScales } from "../utils/planTraceScale";
import {
  FLOORING_FINISH_STYLES,
  parseFlooringRegions,
} from "../utils/planTracePolygon";
import {
  externalWallInnerBoundarySource,
  internalWallSegmentSourceFootprintForRender,
} from "../utils/tracePlanInternalWalls";

const WALL_FILL = "#000000";
const FLOOR_FILL = "rgba(217, 119, 6, 0.35)";
const TILES_PATTERN_ID = "flooring-tiles-image-pattern";
const CARPET_PATTERN_ID = "flooring-carpet-image-pattern";
const HYBRID_PATTERN_ID = "flooring-hybrid-image-pattern";
/** Real-world tile module size for plan fill (metres). */
const TILE_MODULE_WIDTH_M = 0.6;
const TILE_MODULE_HEIGHT_M = 0.3;
/** Grout / grid line width in metres (drawn inside each pattern cell). */
const TILE_GRID_LINE_M = 0.018;
/** Carpet swatch repeat size for plan fill (metres). */
const CARPET_MODULE_M = 0.5;
/** Hybrid plank repeat size for plan fill (metres). */
const HYBRID_MODULE_WIDTH_M = 2.44;
const HYBRID_MODULE_HEIGHT_M = 0.36;

/** Shared-cache blob URL for plan pattern fills. */
function useAuthedBlobUrl(src) {
  const [blobUrl, setBlobUrl] = useState(() => getCachedAuthedImageBlobUrl(src));

  useEffect(() => {
    let cancelled = false;

    if (!src) {
      setBlobUrl(null);
      return undefined;
    }

    const cached = getCachedAuthedImageBlobUrl(src);
    if (cached) {
      setBlobUrl(cached);
      return undefined;
    }

    (async () => {
      const url = await fetchAuthedImageBlobUrl(src);
      if (!cancelled) setBlobUrl(url);
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return blobUrl;
}

function pointsToPath(points) {
  if (!points?.length) return "";
  return (
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z"
  );
}

function boundsOf(...rings) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring || []) {
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const pad = Math.max((maxX - minX) * 0.08, (maxY - minY) * 0.08, 0.02);
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(maxX - minX + pad * 2, 0.01),
    height: Math.max(maxY - minY + pad * 2, 0.01),
  };
}

/**
 * Page-normalized points (x÷width, y÷height) are anisotropic. Scale x by
 * page aspect (width/height) so display units match real plan proportions.
 */
function toDisplayPoints(points, aspect) {
  const a = aspect > 0 ? aspect : 1;
  return (points || [])
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((p) => ({ x: p.x * a, y: p.y }));
}

function pagePixelSize(calibration) {
  const aspect = calibration?.aspect > 0 ? calibration.aspect : 1;
  return { W: 1000 * aspect, H: 1000, aspect };
}

/** Prefer saved flooring; otherwise derive from external wall inside face. */
function resolveFlooringPoints(externalPoints, flooringPoints, calibration) {
  if (Array.isArray(flooringPoints) && flooringPoints.length >= 3) {
    return flooringPoints;
  }
  if (!Array.isArray(externalPoints) || externalPoints.length < 3) return [];
  const { W, H } = pagePixelSize(calibration);
  const outerPx = externalPoints.map((p) => ({ x: p.x * W, y: p.y * H }));
  const mpp = computeMetresPerPixel(calibration, W, H);
  const inner = externalWallInnerBoundarySource(outerPx, mpp);
  if (!inner || inner.length < 3) return [];
  return inner.map((p) => ({ x: p.x / W, y: p.y / H }));
}

/** Internal wall bands as display-space quads (solid 100 mm thickness). */
function resolveInternalWallFootprints(segments, externalPoints, calibration) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  if (!Array.isArray(externalPoints) || externalPoints.length < 3) return [];
  const { W, H, aspect } = pagePixelSize(calibration);
  const outerPx = externalPoints.map((p) => ({ x: p.x * W, y: p.y * H }));
  const segsPx = segments
    .map((seg) => {
      const ax = seg?.a?.x;
      const ay = seg?.a?.y;
      const bx = seg?.b?.x;
      const by = seg?.b?.y;
      if (![ax, ay, bx, by].every((v) => Number.isFinite(v))) return null;
      return {
        a: { x: ax * W, y: ay * H },
        b: { x: bx * W, y: by * H },
      };
    })
    .filter(Boolean);
  if (!segsPx.length) return [];
  const mpp = computeMetresPerPixel(calibration, W, H);
  const footprints = [];
  for (let i = 0; i < segsPx.length; i += 1) {
    const fp = internalWallSegmentSourceFootprintForRender(
      segsPx[i],
      i,
      segsPx,
      outerPx,
      mpp
    );
    if (!fp || fp.length < 3) continue;
    footprints.push(
      fp.map((p) => ({
        x: (p.x / W) * aspect,
        y: p.y / H,
      }))
    );
  }
  return footprints;
}

function resolveFinishDisplayRegions(regions, aspect) {
  return parseFlooringRegions(regions).map((region) =>
    toDisplayPoints(region.points, aspect)
  );
}

/**
 * Top-down plan preview: external walls, internal walls, flooring polygon,
 * plus Hybrid / Tiles / Carpet finish regions cutting the auto orange floor.
 */
export default function FlooringPlanPreview({
  externalPoints = [],
  flooringPoints = [],
  hybridRegions = [],
  tilesRegions = [],
  carpetRegions = [],
  internalWallSegments = [],
  calibration = null,
  tilesImageUrl = null,
  carpetImageUrl = null,
  hybridImageUrl = null,
}) {
  const aspect = calibration?.aspect > 0 ? calibration.aspect : 1;
  const tilesImageBlobUrl = useAuthedBlobUrl(tilesImageUrl);
  const carpetImageBlobUrl = useAuthedBlobUrl(carpetImageUrl);
  const hybridImageBlobUrl = useAuthedBlobUrl(hybridImageUrl);

  const wallsNorm = useMemo(
    () =>
      (externalPoints || []).filter(
        (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)
      ),
    [externalPoints]
  );

  const floorNorm = useMemo(
    () => resolveFlooringPoints(wallsNorm, flooringPoints, calibration),
    [wallsNorm, flooringPoints, calibration]
  );

  const walls = useMemo(() => toDisplayPoints(wallsNorm, aspect), [wallsNorm, aspect]);
  const floor = useMemo(() => toDisplayPoints(floorNorm, aspect), [floorNorm, aspect]);
  const hybridDisplay = useMemo(
    () => resolveFinishDisplayRegions(hybridRegions, aspect),
    [hybridRegions, aspect]
  );
  const tilesDisplay = useMemo(
    () => resolveFinishDisplayRegions(tilesRegions, aspect),
    [tilesRegions, aspect]
  );
  const carpetDisplay = useMemo(
    () => resolveFinishDisplayRegions(carpetRegions, aspect),
    [carpetRegions, aspect]
  );
  const finishRings = useMemo(
    () => [...hybridDisplay, ...tilesDisplay, ...carpetDisplay],
    [hybridDisplay, tilesDisplay, carpetDisplay]
  );
  const internalFootprints = useMemo(
    () => resolveInternalWallFootprints(internalWallSegments, wallsNorm, calibration),
    [internalWallSegments, wallsNorm, calibration]
  );
  const view = useMemo(
    () => boundsOf(walls, floor, ...finishRings, ...internalFootprints),
    [walls, floor, finishRings, internalFootprints]
  );

  // Display space is isotropic in metres: displayX = normX * aspect, displayY = normY.
  // metres-per-display-unit = Ky (= Kx / aspect) from the trace calibration.
  const tileModuleDisplay = useMemo(() => {
    const scales = calibrationNormScales(calibration);
    const metresPerDisplay = scales?.Ky;
    if (!(metresPerDisplay > 1e-9)) {
      const fallback = Math.max(view?.width || 1, view?.height || 1) * 0.08;
      return {
        width: fallback * 2,
        height: fallback,
        gridStroke: fallback * 0.04,
      };
    }
    return {
      width: TILE_MODULE_WIDTH_M / metresPerDisplay,
      height: TILE_MODULE_HEIGHT_M / metresPerDisplay,
      gridStroke: TILE_GRID_LINE_M / metresPerDisplay,
    };
  }, [calibration, view]);

  const carpetModuleDisplay = useMemo(() => {
    const scales = calibrationNormScales(calibration);
    const metresPerDisplay = scales?.Ky;
    if (!(metresPerDisplay > 1e-9)) {
      const fallback = Math.max(view?.width || 1, view?.height || 1) * 0.12;
      return { width: fallback, height: fallback };
    }
    return {
      width: CARPET_MODULE_M / metresPerDisplay,
      height: CARPET_MODULE_M / metresPerDisplay,
    };
  }, [calibration, view]);

  const hybridModuleDisplay = useMemo(() => {
    const scales = calibrationNormScales(calibration);
    const metresPerDisplay = scales?.Ky;
    if (!(metresPerDisplay > 1e-9)) {
      const fallback = Math.max(view?.width || 1, view?.height || 1) * 0.2;
      return { width: fallback * 6, height: fallback };
    }
    return {
      width: HYBRID_MODULE_WIDTH_M / metresPerDisplay,
      height: HYBRID_MODULE_HEIGHT_M / metresPerDisplay,
    };
  }, [calibration, view]);

  if (walls.length < 3 || !view) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: UI.textMuted,
          fontSize: "1rem",
          textAlign: "center",
          padding: "24px",
        }}
      >
        Trace External Walls on the plan to show the flooring outline here.
      </div>
    );
  }

  const floorWithHoles =
    floor.length >= 3
      ? [pointsToPath(floor), ...finishRings.map((ring) => pointsToPath(ring))]
          .filter(Boolean)
          .join(" ")
      : "";

  const tilesUseImage = Boolean(tilesImageBlobUrl);
  // Suppress green fill/stroke whenever a tile image is selected (including while loading).
  const tilesShowPlainGreen = !tilesImageUrl;
  const carpetUseImage = Boolean(carpetImageBlobUrl);
  const carpetShowPlainPurple = !carpetImageUrl;
  const hybridUseImage = Boolean(hybridImageBlobUrl);
  const hybridShowPlain = !hybridImageUrl;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: UI.inputBg || "#f5f5f5",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        >
          {(tilesUseImage || carpetUseImage || hybridUseImage) ? (
            <defs>
              {tilesUseImage ? (
                <pattern
                  id={TILES_PATTERN_ID}
                  patternUnits="userSpaceOnUse"
                  width={tileModuleDisplay.width}
                  height={tileModuleDisplay.height}
                >
                  <image
                    href={tilesImageBlobUrl}
                    x={0}
                    y={0}
                    width={tileModuleDisplay.width}
                    height={tileModuleDisplay.height}
                    preserveAspectRatio="none"
                  />
                  {/* Opaque black/white bands — contrast on light and dark tiles.
                      Right + bottom edges only so shared joints aren't double-drawn. */}
                  <rect
                    x={tileModuleDisplay.width - tileModuleDisplay.gridStroke}
                    y={0}
                    width={tileModuleDisplay.gridStroke}
                    height={tileModuleDisplay.height}
                    fill="#ffffff"
                  />
                  <rect
                    x={0}
                    y={tileModuleDisplay.height - tileModuleDisplay.gridStroke}
                    width={tileModuleDisplay.width}
                    height={tileModuleDisplay.gridStroke}
                    fill="#ffffff"
                  />
                  <rect
                    x={tileModuleDisplay.width - tileModuleDisplay.gridStroke * 0.55}
                    y={0}
                    width={tileModuleDisplay.gridStroke * 0.55}
                    height={tileModuleDisplay.height}
                    fill="#111111"
                  />
                  <rect
                    x={0}
                    y={tileModuleDisplay.height - tileModuleDisplay.gridStroke * 0.55}
                    width={tileModuleDisplay.width}
                    height={tileModuleDisplay.gridStroke * 0.55}
                    fill="#111111"
                  />
                </pattern>
              ) : null}
              {carpetUseImage ? (
                <pattern
                  id={CARPET_PATTERN_ID}
                  patternUnits="userSpaceOnUse"
                  width={carpetModuleDisplay.width}
                  height={carpetModuleDisplay.height}
                >
                  <image
                    href={carpetImageBlobUrl}
                    x={0}
                    y={0}
                    width={carpetModuleDisplay.width}
                    height={carpetModuleDisplay.height}
                    preserveAspectRatio="none"
                  />
                </pattern>
              ) : null}
              {hybridUseImage ? (
                <pattern
                  id={HYBRID_PATTERN_ID}
                  patternUnits="userSpaceOnUse"
                  width={hybridModuleDisplay.width}
                  height={hybridModuleDisplay.height}
                >
                  <image
                    href={hybridImageBlobUrl}
                    x={0}
                    y={0}
                    width={hybridModuleDisplay.width}
                    height={hybridModuleDisplay.height}
                    preserveAspectRatio="none"
                  />
                </pattern>
              ) : null}
            </defs>
          ) : null}
          {floorWithHoles ? (
            <path
              d={floorWithHoles}
              fill={hybridUseImage ? `url(#${HYBRID_PATTERN_ID})` : FLOOR_FILL}
              fillRule="evenodd"
              stroke="none"
            />
          ) : null}
          {hybridDisplay.map((ring, i) => (
            <path
              key={`hybrid-${i}`}
              d={pointsToPath(ring)}
              fill={
                hybridUseImage
                  ? `url(#${HYBRID_PATTERN_ID})`
                  : hybridShowPlain
                    ? FLOORING_FINISH_STYLES.hybrid.fillClosed
                    : "transparent"
              }
              stroke={hybridShowPlain ? FLOORING_FINISH_STYLES.hybrid.stroke : "none"}
              strokeWidth={
                hybridShowPlain ? Math.max(view.width, view.height) * 0.002 : 0
              }
            />
          ))}
          {tilesDisplay.map((ring, i) => (
            <path
              key={`tiles-${i}`}
              d={pointsToPath(ring)}
              fill={
                tilesUseImage
                  ? `url(#${TILES_PATTERN_ID})`
                  : tilesShowPlainGreen
                    ? FLOORING_FINISH_STYLES.tiles.fillClosed
                    : "transparent"
              }
              stroke={tilesShowPlainGreen ? FLOORING_FINISH_STYLES.tiles.stroke : "none"}
              strokeWidth={
                tilesShowPlainGreen ? Math.max(view.width, view.height) * 0.002 : 0
              }
            />
          ))}
          {carpetDisplay.map((ring, i) => (
            <path
              key={`carpet-${i}`}
              d={pointsToPath(ring)}
              fill={
                carpetUseImage
                  ? `url(#${CARPET_PATTERN_ID})`
                  : carpetShowPlainPurple
                    ? FLOORING_FINISH_STYLES.carpet.fillClosed
                    : "transparent"
              }
              stroke={carpetShowPlainPurple ? FLOORING_FINISH_STYLES.carpet.stroke : "none"}
              strokeWidth={
                carpetShowPlainPurple ? Math.max(view.width, view.height) * 0.002 : 0
              }
            />
          ))}
          {/* Solid black external wall band */}
          {floor.length >= 3 ? (
            <path
              d={`${pointsToPath(walls)} ${pointsToPath(floor)}`}
              fill={WALL_FILL}
              fillRule="evenodd"
            />
          ) : (
            <path
              d={pointsToPath(walls)}
              fill={WALL_FILL}
              stroke={WALL_FILL}
              strokeWidth={Math.max(view.width, view.height) * 0.01}
              strokeLinejoin="round"
            />
          )}
          {/* Solid black internal wall bands */}
          {internalFootprints.map((fp, i) => (
            <path key={`iw-${i}`} d={pointsToPath(fp)} fill={WALL_FILL} stroke="none" />
          ))}
        </svg>
      </div>
    </div>
  );
}
