import React, { useMemo } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import {
  buildFootprintElevations,
  resolveBuildingFootprintRing,
  resolveModelDoors,
  resolveModelSlidingDoors,
  resolveModelWindows,
} from "../utils/buildingUnitGeometry";
import { resolveUnitFinishCssHexes } from "../utils/buildingUnitFinishes.js";

const SUBFLOOR_HEIGHT_MM = 650;
const LAYER_HEIGHT_MM = 200;
const LAYER_GAP_MM = 25;
const COLUMN_WIDTH_MM = 50;
const COLUMN_PROJECTION_MM = 5;
const CLADDING_LAYER_COUNT = 13;
const CLADDING_LAYER_HEIGHT_MM = 200;
const CLADDING_HEIGHT_MM = CLADDING_LAYER_COUNT * CLADDING_LAYER_HEIGHT_MM;
const TOTAL_HEIGHT_MM = SUBFLOOR_HEIGHT_MM + CLADDING_HEIGHT_MM;
const OUTLINE_STROKE_WIDTH = 1;
const GROUND_STROKE_WIDTH = 7;

const WINDOW_TOP_ABOVE_SUBFLOOR_MM = 2100;
const WINDOW_HEIGHT_MM = 1800;
const WINDOW_TOP_MM = SUBFLOOR_HEIGHT_MM + WINDOW_TOP_ABOVE_SUBFLOOR_MM;
const WINDOW_SURROUND_WIDTH_MM = 70;
const WINDOW_FRAME_WIDTH_MM = 50;
const WINDOW_MULLION_WIDTH_MM = 60;
const WINDOW_MULLION_MIN_WIDTH_M = 1.2;
// Windows at least this tall get a horizontal transom. It sits a third of the way
// up from the sill (bottom pane = height / 3, top pane = 2/3).
const WINDOW_TRANSOM_MIN_HEIGHT_MM = 1500;
const WINDOW_TRANSOM_SPLIT_FRACTION = 1 / 3;
const WINDOW_GLASS_COLOR = "#2b322c";
const WINDOW_OUTLINE = "#202124";
const DOOR_HEIGHT_MM = 2100;
const DOOR_SURROUND_WIDTH_MM = 100;
const DOOR_GLASS_COUNT = 4;
const DOOR_GLASS_HEIGHT_MM = 100;
const DOOR_GLASS_SIDE_MARGIN_MM = 100;
const DOOR_GLASS_FIRST_BOTTOM_MM = 300;
const DOOR_GLASS_TOP_MARGIN_MM = 300;
const DOOR_GLASS_COLOR = "#2b322c";
const DOOR_OUTLINE = "#202124";
/** Sliding doors wider than this get two vertical frame dividers instead of one. */
const SLIDING_DOOR_DOUBLE_MULLION_MIN_WIDTH_M = 2.7;

function FootprintElevation({
  title,
  segments,
  minS,
  maxS,
  scaleLengthM,
  windows = [],
  doors = [],
  slidingDoors = [],
  colours,
}) {
  const {
    cladding: claddingColor,
    baseboards: baseboardsColor,
    windowFrames: windowFrameColor,
    windowSurrounds: windowSurroundColor,
    frontDoor: doorColor,
  } = colours;
  const lengthMm = (maxS - minS) * 1000;
  const scaleLengthMm = scaleLengthM * 1000;
  const marginX = Math.max(150, scaleLengthMm * 0.025);
  const marginTop = 100;
  const marginBottom = 720;
  const groundY = marginTop + TOTAL_HEIGHT_MM;
  const viewWidth = scaleLengthMm + marginX * 2;
  const viewHeight = marginTop + TOTAL_HEIGHT_MM + marginBottom;
  const elevationOriginX = marginX + (scaleLengthMm - lengthMm) / 2;

  const toX = (s) => elevationOriginX + (s - minS) * 1000;

  const subfloorLayers = [
    { id: "layer-1", bottomMm: 0 },
    { id: "layer-2", bottomMm: LAYER_HEIGHT_MM + LAYER_GAP_MM },
    { id: "layer-3", bottomMm: (LAYER_HEIGHT_MM + LAYER_GAP_MM) * 2 },
  ];

  const claddingLayers = Array.from({ length: CLADDING_LAYER_COUNT }, (_, index) => ({
    id: `cladding-${index + 1}`,
    bottomMm: SUBFLOOR_HEIGHT_MM + index * CLADDING_LAYER_HEIGHT_MM,
  }));

  const drawSegments = segments.length
    ? segments
    : [{ s0: minS, s1: maxS }];

  const labelFontSize = 300;
  const labelY = groundY + GROUND_STROKE_WIDTH + labelFontSize + 240;

  return (
    <div style={{ minWidth: 0 }}>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        role="img"
        aria-label={`${title}, ${(maxS - minS).toFixed(1)} metres wide by ${(TOTAL_HEIGHT_MM / 1000).toFixed(2)} metres high`}
        style={{
          display: "block",
          width: "100%",
          height: "240px",
          background: "transparent",
        }}
        preserveAspectRatio="xMidYMid meet"
      >
        {drawSegments.map((segment, segmentIndex) => {
          const x = toX(segment.s0);
          const width = Math.max(1, (segment.s1 - segment.s0) * 1000);
          return (
            <g key={`seg-${segmentIndex}`}>
              {subfloorLayers.map((layer) => {
                const y = groundY - layer.bottomMm - LAYER_HEIGHT_MM;
                return (
                  <rect
                    key={`${segmentIndex}-${layer.id}`}
                    x={x}
                    y={y}
                    width={width}
                    height={LAYER_HEIGHT_MM}
                    fill={baseboardsColor}
                    stroke="#202124"
                    strokeWidth={OUTLINE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {claddingLayers.map((layer) => {
                const layerTopMm = layer.bottomMm + CLADDING_LAYER_HEIGHT_MM;
                const doorBottomMm = SUBFLOOR_HEIGHT_MM;
                const doorTopMm = SUBFLOOR_HEIGHT_MM + DOOR_HEIGHT_MM;
                const yTop = groundY - layerTopMm;
                const yBottom = groundY - layer.bottomMm;

                // Door leaf hole within this board (may be only part of the board height).
                const holeBottomMm = Math.max(layer.bottomMm, doorBottomMm);
                const holeTopMm = Math.min(layerTopMm, doorTopMm);
                const doorHoles = [];
                const allDoors = [...doors, ...slidingDoors];
                if (allDoors.length && holeTopMm > holeBottomMm + 1e-6) {
                  for (const door of allDoors) {
                    const s0 = Math.max(door.sMin, segment.s0);
                    const s1 = Math.min(door.sMax, segment.s1);
                    if (s1 <= s0) continue;
                    doorHoles.push({
                      x0: toX(s0),
                      x1: toX(s1),
                      yTop: groundY - holeTopMm,
                      yBottom: groundY - holeBottomMm,
                    });
                  }
                }

                if (!doorHoles.length) {
                  return (
                    <rect
                      key={`${segmentIndex}-${layer.id}`}
                      x={x}
                      y={yTop}
                      width={width}
                      height={CLADDING_LAYER_HEIGHT_MM}
                      fill={claddingColor}
                      stroke="#202124"
                      strokeWidth={OUTLINE_STROKE_WIDTH}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                }

                // One board path with door holes punched out — no mid-board split line.
                let d = `M ${x} ${yTop} H ${x + width} V ${yBottom} H ${x} Z`;
                for (const hole of doorHoles) {
                  d += ` M ${hole.x0} ${hole.yTop} H ${hole.x1} V ${hole.yBottom} H ${hole.x0} Z`;
                }
                return (
                  <path
                    key={`${segmentIndex}-${layer.id}`}
                    d={d}
                    fill={claddingColor}
                    fillRule="evenodd"
                    stroke="#202124"
                    strokeWidth={OUTLINE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              <rect
                x={x - COLUMN_PROJECTION_MM}
                y={groundY - SUBFLOOR_HEIGHT_MM}
                width={COLUMN_WIDTH_MM}
                height={SUBFLOOR_HEIGHT_MM}
                fill={baseboardsColor}
                stroke="#202124"
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x + width - COLUMN_WIDTH_MM + COLUMN_PROJECTION_MM}
                y={groundY - SUBFLOOR_HEIGHT_MM}
                width={COLUMN_WIDTH_MM}
                height={SUBFLOOR_HEIGHT_MM}
                fill={baseboardsColor}
                stroke="#202124"
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x - COLUMN_PROJECTION_MM}
                y={groundY - TOTAL_HEIGHT_MM}
                width={COLUMN_WIDTH_MM}
                height={CLADDING_HEIGHT_MM}
                fill={claddingColor}
                stroke="#202124"
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={x + width - COLUMN_WIDTH_MM + COLUMN_PROJECTION_MM}
                y={groundY - TOTAL_HEIGHT_MM}
                width={COLUMN_WIDTH_MM}
                height={CLADDING_HEIGHT_MM}
                fill={claddingColor}
                stroke="#202124"
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {windows.map((win, windowIndex) => {
          const xLeft = toX(win.sMin);
          const widthPx = Math.max(1, (win.sMax - win.sMin) * 1000);
          const xRight = xLeft + widthPx;
          const winHeightMm = win.heightMm > 0 ? win.heightMm : WINDOW_HEIGHT_MM;
          const surround = {
            x: xLeft - WINDOW_SURROUND_WIDTH_MM,
            y: groundY - (WINDOW_TOP_MM + WINDOW_SURROUND_WIDTH_MM),
            w: widthPx + WINDOW_SURROUND_WIDTH_MM * 2,
            h: winHeightMm + WINDOW_SURROUND_WIDTH_MM * 2,
          };
          const glassW = Math.max(1, widthPx - WINDOW_FRAME_WIDTH_MM * 2);
          const glassH = Math.max(1, winHeightMm - WINDOW_FRAME_WIDTH_MM * 2);
          const hasMullion = (win.widthM ?? 0) > WINDOW_MULLION_MIN_WIDTH_M;
          const hasTransom = winHeightMm >= WINDOW_TRANSOM_MIN_HEIGHT_MM - 1;
          // Transom sits a third of the way up from the sill (bottom of the opening).
          const transomCenterY =
            groundY - WINDOW_TOP_MM + winHeightMm - winHeightMm * WINDOW_TRANSOM_SPLIT_FRACTION;
          return (
            <g key={`window-${windowIndex}`}>
              {/* 70 mm surround (outside the opening) */}
              <rect
                x={surround.x}
                y={surround.y}
                width={surround.w}
                height={surround.h}
                fill={windowSurroundColor}
                stroke={WINDOW_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              {/* window edge / 50 mm frame band */}
              <rect
                x={xLeft}
                y={groundY - WINDOW_TOP_MM}
                width={widthPx}
                height={winHeightMm}
                fill={windowFrameColor}
                stroke={WINDOW_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              {/* glass opening (window minus the 50 mm frame) */}
              <rect
                x={xLeft + WINDOW_FRAME_WIDTH_MM}
                y={groundY - (WINDOW_TOP_MM - WINDOW_FRAME_WIDTH_MM)}
                width={glassW}
                height={glassH}
                fill={WINDOW_GLASS_COLOR}
                stroke={WINDOW_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              {/* central vertical mullion for wide windows */}
              {hasMullion && (
                <rect
                  x={(xLeft + xRight) / 2 - WINDOW_MULLION_WIDTH_MM / 2}
                  y={groundY - (WINDOW_TOP_MM - WINDOW_FRAME_WIDTH_MM)}
                  width={WINDOW_MULLION_WIDTH_MM}
                  height={glassH}
                  fill={windowFrameColor}
                  stroke={WINDOW_OUTLINE}
                  strokeWidth={OUTLINE_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {/* horizontal transom for 1.8 m windows (splits opening 1200/600) */}
              {hasTransom && (
                <rect
                  x={xLeft + WINDOW_FRAME_WIDTH_MM}
                  y={transomCenterY - WINDOW_MULLION_WIDTH_MM / 2}
                  width={glassW}
                  height={WINDOW_MULLION_WIDTH_MM}
                  fill={windowFrameColor}
                  stroke={WINDOW_OUTLINE}
                  strokeWidth={OUTLINE_STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}

        {doors.map((door, doorIndex) => {
          const xLeft = toX(door.sMin);
          const widthPx = Math.max(1, (door.sMax - door.sMin) * 1000);
          const xRight = xLeft + widthPx;
          const doorTopY = groundY - SUBFLOOR_HEIGHT_MM - DOOR_HEIGHT_MM;
          const doorBottomY = groundY - SUBFLOOR_HEIGHT_MM;
          const band = DOOR_SURROUND_WIDTH_MM;
          const glassW = Math.max(1, widthPx - DOOR_GLASS_SIDE_MARGIN_MM * 2);
          const glassX = xLeft + DOOR_GLASS_SIDE_MARGIN_MM;
          const glassSpan =
            DOOR_HEIGHT_MM -
            DOOR_GLASS_FIRST_BOTTOM_MM -
            DOOR_GLASS_TOP_MARGIN_MM -
            DOOR_GLASS_COUNT * DOOR_GLASS_HEIGHT_MM;
          const glassGap =
            DOOR_GLASS_COUNT > 1 ? glassSpan / (DOOR_GLASS_COUNT - 1) : 0;
          return (
            <g key={`door-${doorIndex}`}>
              {/* Single U-path surround (top + left + right) — no corner seam strokes */}
              <path
                d={[
                  `M ${xLeft - band} ${doorBottomY}`,
                  `L ${xLeft - band} ${doorTopY - band}`,
                  `L ${xRight + band} ${doorTopY - band}`,
                  `L ${xRight + band} ${doorBottomY}`,
                  `L ${xRight} ${doorBottomY}`,
                  `L ${xRight} ${doorTopY}`,
                  `L ${xLeft} ${doorTopY}`,
                  `L ${xLeft} ${doorBottomY}`,
                  "Z",
                ].join(" ")}
                fill={windowSurroundColor}
                stroke={DOOR_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={xLeft}
                y={doorTopY}
                width={widthPx}
                height={DOOR_HEIGHT_MM}
                fill={doorColor}
                stroke={DOOR_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              {Array.from({ length: DOOR_GLASS_COUNT }, (_, g) => {
                const panelBottomFromSill =
                  DOOR_GLASS_FIRST_BOTTOM_MM + g * (DOOR_GLASS_HEIGHT_MM + glassGap);
                const panelY = doorBottomY - panelBottomFromSill - DOOR_GLASS_HEIGHT_MM;
                return (
                  <rect
                    key={`door-${doorIndex}-glass-${g}`}
                    x={glassX}
                    y={panelY}
                    width={glassW}
                    height={DOOR_GLASS_HEIGHT_MM}
                    fill={DOOR_GLASS_COLOR}
                    stroke={DOOR_OUTLINE}
                    strokeWidth={OUTLINE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          );
        })}

        {slidingDoors.map((door, doorIndex) => {
          const xLeft = toX(door.sMin);
          const widthPx = Math.max(1, (door.sMax - door.sMin) * 1000);
          const xRight = xLeft + widthPx;
          const doorTopY = groundY - SUBFLOOR_HEIGHT_MM - DOOR_HEIGHT_MM;
          const doorBottomY = groundY - SUBFLOOR_HEIGHT_MM;
          const band = DOOR_SURROUND_WIDTH_MM;
          return (
            <g key={`sliding-door-${doorIndex}`}>
              <path
                d={[
                  `M ${xLeft - band} ${doorBottomY}`,
                  `L ${xLeft - band} ${doorTopY - band}`,
                  `L ${xRight + band} ${doorTopY - band}`,
                  `L ${xRight + band} ${doorBottomY}`,
                  `L ${xRight} ${doorBottomY}`,
                  `L ${xRight} ${doorTopY}`,
                  `L ${xLeft} ${doorTopY}`,
                  `L ${xLeft} ${doorBottomY}`,
                  "Z",
                ].join(" ")}
                fill={windowSurroundColor}
                stroke={DOOR_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={xLeft}
                y={doorTopY}
                width={widthPx}
                height={DOOR_HEIGHT_MM}
                fill={windowFrameColor}
                stroke={DOOR_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              {/* Glass opening inset 50 mm by the inner frame */}
              <rect
                x={xLeft + WINDOW_FRAME_WIDTH_MM}
                y={doorTopY + WINDOW_FRAME_WIDTH_MM}
                width={Math.max(1, widthPx - WINDOW_FRAME_WIDTH_MM * 2)}
                height={Math.max(1, DOOR_HEIGHT_MM - WINDOW_FRAME_WIDTH_MM * 2)}
                fill={DOOR_GLASS_COLOR}
                stroke={DOOR_OUTLINE}
                strokeWidth={OUTLINE_STROKE_WIDTH}
                vectorEffect="non-scaling-stroke"
              />
              {/* Vertical frame divider(s): 1 centred, or 2 when wider than 2700 mm */}
              {(() => {
                const glassLeft = xLeft + WINDOW_FRAME_WIDTH_MM;
                const glassW = Math.max(1, widthPx - WINDOW_FRAME_WIDTH_MM * 2);
                const glassTop = doorTopY + WINDOW_FRAME_WIDTH_MM;
                const glassH = Math.max(1, DOOR_HEIGHT_MM - WINDOW_FRAME_WIDTH_MM * 2);
                const widthM = door.widthM ?? widthPx / 1000;
                const centers =
                  widthM > SLIDING_DOOR_DOUBLE_MULLION_MIN_WIDTH_M
                    ? [glassLeft + glassW / 3, glassLeft + (2 * glassW) / 3]
                    : [glassLeft + glassW / 2];
                return centers.map((cx, mIndex) => (
                  <rect
                    key={`sliding-door-${doorIndex}-mullion-${mIndex}`}
                    x={cx - WINDOW_MULLION_WIDTH_MM / 2}
                    y={glassTop}
                    width={WINDOW_MULLION_WIDTH_MM}
                    height={glassH}
                    fill={windowFrameColor}
                    stroke={DOOR_OUTLINE}
                    strokeWidth={OUTLINE_STROKE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                  />
                ));
              })()}
            </g>
          );
        })}

        <line
          x1={elevationOriginX - marginX * 0.75}
          y1={groundY}
          x2={elevationOriginX + lengthMm + marginX * 0.75}
          y2={groundY}
          stroke="#000000"
          strokeWidth={GROUND_STROKE_WIDTH}
          vectorEffect="non-scaling-stroke"
        />

        <text
          x={elevationOriginX + lengthMm / 2}
          y={labelY}
          textAnchor="middle"
          fontSize={labelFontSize}
          fontWeight="600"
          fill={UI.textPrimary}
        >
          {title}
        </text>
      </svg>
    </div>
  );
}

/** Flat, perspective-free elevations of the unit footprint. */
export default function BuildingElevations({
  widthM = 11.3,
  depthM = 5.0,
  footprintPoints = null,
  windows = null,
  doors = null,
  slidingDoors = null,
  calibration = null,
  finishes = null,
}) {
  const colours = useMemo(() => resolveUnitFinishCssHexes(finishes), [finishes]);
  const elevations = useMemo(() => {
    const { ring, fromTrace } = resolveBuildingFootprintRing(
      footprintPoints,
      widthM,
      depthM,
      calibration
    );
    const modelWindows = fromTrace ? resolveModelWindows(footprintPoints, windows, calibration) : [];
    const modelDoors = fromTrace ? resolveModelDoors(footprintPoints, doors, calibration) : [];
    const modelSlidingDoors = fromTrace
      ? resolveModelSlidingDoors(footprintPoints, slidingDoors, calibration)
      : [];
    return buildFootprintElevations(ring).map((elev) => {
      const screenAxis = { x: elev.viewDir.z, z: -elev.viewDir.x };
      const projectS = (x, z) => x * screenAxis.x + z * screenAxis.z;
      const elevWindows = modelWindows
        .filter((w) => w.normalX * elev.viewDir.x + w.normalZ * elev.viewDir.z > 0.05)
        .map((w) => {
          const half = w.lengthM / 2;
          const sA = projectS(w.midX - w.dirX * half, w.midZ - w.dirZ * half);
          const sB = projectS(w.midX + w.dirX * half, w.midZ + w.dirZ * half);
          const heightMm = w.heightM > 0 ? w.heightM * 1000 : WINDOW_HEIGHT_MM;
          return { sMin: Math.min(sA, sB), sMax: Math.max(sA, sB), widthM: w.lengthM, heightMm };
        });
      const elevDoors = modelDoors
        .filter((d) => d.normalX * elev.viewDir.x + d.normalZ * elev.viewDir.z > 0.05)
        .map((d) => {
          const half = d.lengthM / 2;
          const sA = projectS(d.midX - d.dirX * half, d.midZ - d.dirZ * half);
          const sB = projectS(d.midX + d.dirX * half, d.midZ + d.dirZ * half);
          return { sMin: Math.min(sA, sB), sMax: Math.max(sA, sB), widthM: d.lengthM };
        });
      const elevSlidingDoors = modelSlidingDoors
        .filter((d) => d.normalX * elev.viewDir.x + d.normalZ * elev.viewDir.z > 0.05)
        .map((d) => {
          const half = d.lengthM / 2;
          const sA = projectS(d.midX - d.dirX * half, d.midZ - d.dirZ * half);
          const sB = projectS(d.midX + d.dirX * half, d.midZ + d.dirZ * half);
          return { sMin: Math.min(sA, sB), sMax: Math.max(sA, sB), widthM: d.lengthM };
        });
      return {
        ...elev,
        windows: elevWindows,
        doors: elevDoors,
        slidingDoors: elevSlidingDoors,
      };
    });
  }, [depthM, footprintPoints, windows, doors, slidingDoors, widthM, calibration]);

  const scaleLengthM = Math.max(...elevations.map((e) => e.lengthM), 0.01);

  return (
    <div
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "16px 24px",
      }}
    >
      {elevations.map((elevation) => (
        <FootprintElevation
          key={elevation.title}
          title={elevation.title}
          segments={elevation.segments}
          minS={elevation.minS}
          maxS={elevation.maxS}
          scaleLengthM={scaleLengthM}
          windows={elevation.windows}
          doors={elevation.doors}
          slidingDoors={elevation.slidingDoors}
          colours={colours}
        />
      ))}
    </div>
  );
}
