import React, { useMemo } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import { computeMetresPerPixel } from "../utils/planTraceScale";
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
}) {
  const aspect = calibration?.aspect > 0 ? calibration.aspect : 1;

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

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
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
          {floorWithHoles ? (
            <path d={floorWithHoles} fill={FLOOR_FILL} fillRule="evenodd" stroke="none" />
          ) : null}
          {hybridDisplay.map((ring, i) => (
            <path
              key={`hybrid-${i}`}
              d={pointsToPath(ring)}
              fill={FLOORING_FINISH_STYLES.hybrid.fillClosed}
              stroke={FLOORING_FINISH_STYLES.hybrid.stroke}
              strokeWidth={Math.max(view.width, view.height) * 0.002}
            />
          ))}
          {tilesDisplay.map((ring, i) => (
            <path
              key={`tiles-${i}`}
              d={pointsToPath(ring)}
              fill={FLOORING_FINISH_STYLES.tiles.fillClosed}
              stroke={FLOORING_FINISH_STYLES.tiles.stroke}
              strokeWidth={Math.max(view.width, view.height) * 0.002}
            />
          ))}
          {carpetDisplay.map((ring, i) => (
            <path
              key={`carpet-${i}`}
              d={pointsToPath(ring)}
              fill={FLOORING_FINISH_STYLES.carpet.fillClosed}
              stroke={FLOORING_FINISH_STYLES.carpet.stroke}
              strokeWidth={Math.max(view.width, view.height) * 0.002}
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
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexShrink: 0,
          flexWrap: "wrap",
          fontSize: "0.85rem",
          color: UI.textMuted,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: WALL_FILL,
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
          Walls
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: FLOOR_FILL,
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
          Floor
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: FLOORING_FINISH_STYLES.hybrid.fillClosed,
              border: `1px solid ${FLOORING_FINISH_STYLES.hybrid.stroke}`,
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
          Hybrid
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: FLOORING_FINISH_STYLES.tiles.fillClosed,
              border: `1px solid ${FLOORING_FINISH_STYLES.tiles.stroke}`,
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
          Tiles
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: FLOORING_FINISH_STYLES.carpet.fillClosed,
              border: `1px solid ${FLOORING_FINISH_STYLES.carpet.stroke}`,
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
          Carpet
        </span>
      </div>
    </div>
  );
}
