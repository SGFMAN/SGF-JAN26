import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildDesignPhaseStatusTiles } from "../utils/designPhaseStatusTiles.js";
import startProjectImage from "../images/start.png";
import finishProjectImage from "../images/finish.png";
import {
  PLANNER_BOARD_HEIGHT,
  PLANNER_BOARD_WIDTH,
  PLANNER_FLOW_ITEMS,
  PLANNER_START_BUILDING_KEY,
  PLANNER_START_PROJECT_KEY,
  buildDrawnPlannerLinks,
  defaultPlannerPositions,
  fetchPlannerLayoutFromApi,
  getPlannerRequirementKeysByItem,
  isStartBuildingUnlocked,
  loadPlannerLayout,
  plannerLabelForKey,
  plannerNodeSize,
} from "../utils/plannerLayout.js";
import { STREAM, INDICATOR, UI, TEXT } from "../utils/uiThemeTokens.js";
import { getOverviewIndicatorStyle } from "../utils/uiButtonStyles.js";
import "../pages/Overview.css";

/**
 * Overview experiment: show the Planner flowchart with RAG colours.
 * Set to false to restore the list (heading / colour / Requires / Next to Work On).
 */
const SHOW_PLANNER_LAYOUT = true;

function isTileComplete(tile) {
  return tile?.indicatorStyle?.variant === "green";
}

function isTileInProgress(tile) {
  return tile?.indicatorStyle?.variant === "orange";
}

/** Hide Town Planning / BAL nodes and arrows when Planning marks them Not Required. */
function isHiddenOptionalPlanningTile(tile) {
  if (!tile) return false;
  if (tile.key !== "town-planning" && tile.key !== "bal") return false;
  return String(tile.value || "").trim() === "Not Required";
}

function OverviewStatusRow({ label, requires, value, indicatorStyle, onClick, readOnly }) {
  const interactive = !readOnly && typeof onClick === "function";

  return (
    <div
      className="overview-status-row"
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{ cursor: interactive ? "pointer" : "default" }}
    >
      <div className="overview-status-heading" style={{ color: UI.textPrimary }}>
        {label}
      </div>
      <div
        className="overview-status-tab"
        style={{
          background: indicatorStyle.background,
          color: indicatorStyle.color,
          border: indicatorStyle.border ?? "none",
        }}
      >
        <span className="overview-status-tab__text">{value}</span>
      </div>
      <div className="overview-status-requires" style={{ color: UI.textPrimary }}>
        {requires ? `Requires: ${requires}` : ""}
      </div>
    </div>
  );
}

const HEADING_GREEN_STYLE = {
  ...getOverviewIndicatorStyle("green", {
    red: STREAM.qldRed,
    orange: INDICATOR.orange,
    green: STREAM.streamGreen,
    text: TEXT.dark,
  }),
  variant: "green",
};

function plannerNodeHoverLines({ item, tile, inactive, requirementsByKey, isSourceDone }) {
  if (inactive) {
    const outstanding = (requirementsByKey?.get(item.key) || []).filter((key) => !isSourceDone(key));
    return outstanding.map(plannerLabelForKey);
  }
  const isGreen =
    item.key === PLANNER_START_PROJECT_KEY ||
    item.key === PLANNER_START_BUILDING_KEY ||
    tile?.indicatorStyle?.variant === "green";
  return [isGreen ? "Complete" : "In Progress"];
}

const ROAD_ASPHALT_WIDTH = 14;
const ROAD_EDGE_WIDTH = 2.2;
const ROAD_TOTAL_WIDTH = ROAD_ASPHALT_WIDTH + ROAD_EDGE_WIDTH * 2;
const ROAD_HEAD_LENGTH = 32;
const ROAD_HEAD_OVERLAP = 6;
const ROAD_HEAD_WIDTH_SCALE = 3.4;

function parseCubicPath(d) {
  const nums = String(d || "").match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
  if (!nums || nums.length < 8) return null;
  return {
    p0: { x: nums[0], y: nums[1] },
    p1: { x: nums[2], y: nums[3] },
    p2: { x: nums[4], y: nums[5] },
    p3: { x: nums[6], y: nums[7] },
  };
}

function cubicTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const dx =
    3 * mt * mt * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  const dy =
    3 * mt * mt * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  const len = Math.hypot(dx, dy);
  if (len > 0.001) return { x: dx / len, y: dy / len };
  const fb = Math.hypot(p3.x - p0.x, p3.y - p0.y) || 1;
  return { x: (p3.x - p0.x) / fb, y: (p3.y - p0.y) / fb };
}

function plannerLinkCubic(link) {
  if (link.self) {
    const parsed = parseCubicPath(link.d);
    if (parsed) return parsed;
  }
  const x1 = Number(link.x1) || 0;
  const y1 = Number(link.y1) || 0;
  const x2 = Number(link.x2) || 0;
  const y2 = Number(link.y2) || 0;
  const adx = x2 - x1;
  const ady = y2 - y1;
  const dist = Math.hypot(adx, ady) || 1;
  const sx = adx >= 0 ? 1 : -1;
  const sy = ady >= 0 ? 1 : -1;
  const nearlyH = Math.abs(ady) < 10;
  const nearlyV = Math.abs(adx) < 10;
  const ox = Number.isFinite(Number(link.ox)) ? Number(link.ox) : nearlyV ? 0 : sx;
  const oy = Number.isFinite(Number(link.oy)) ? Number(link.oy) : nearlyV ? sy : 0;
  const ix = Number.isFinite(Number(link.ix)) ? Number(link.ix) : nearlyH ? sx : 0;
  const iy = Number.isFinite(Number(link.iy)) ? Number(link.iy) : nearlyH ? 0 : sy;
  if (nearlyH || nearlyV) {
    const delta = nearlyH ? Math.abs(adx) : Math.abs(ady);
    const reach = Math.min(dist * 0.5, Math.max(48, delta * 0.5));
    return {
      p0: { x: x1, y: y1 },
      p1: { x: x1 + ox * reach, y: y1 + oy * reach },
      p2: { x: x2 - ix * reach, y: y2 - iy * reach },
      p3: { x: x2, y: y2 },
    };
  }
  const handleOut = Math.min(dist * 0.42, Math.max(56, dist * 0.36));
  const handleIn = Math.min(dist * 0.42, Math.max(56, dist * 0.36));
  return {
    p0: { x: x1, y: y1 },
    p1: { x: x1 + ox * handleOut, y: y1 + oy * handleOut },
    p2: { x: x2 - ix * handleIn, y: y2 - iy * handleIn },
    p3: { x: x2, y: y2 },
  };
}

function arrivalDirection(link, cubic) {
  if (Number.isFinite(Number(link?.ix)) && Number.isFinite(Number(link?.iy))) {
    const len = Math.hypot(link.ix, link.iy) || 1;
    return { x: link.ix / len, y: link.iy / len };
  }
  return cubicTangent(cubic.p0, cubic.p1, cubic.p2, cubic.p3, 1);
}

function fmtPt(n) {
  return Number(n).toFixed(2);
}

function plannerRoadGeometry(link) {
  const cubic = plannerLinkCubic(link);
  const tan = arrivalDirection(link, cubic);
  const span = Math.hypot(cubic.p3.x - cubic.p0.x, cubic.p3.y - cubic.p0.y) || 1;
  const headLen = Math.min(ROAD_HEAD_LENGTH, Math.max(22, span * 0.32));
  const tip = {
    x: cubic.p3.x + tan.x * ROAD_HEAD_OVERLAP,
    y: cubic.p3.y + tan.y * ROAD_HEAD_OVERLAP,
  };
  const end = {
    x: tip.x - tan.x * headLen,
    y: tip.y - tan.y * headLen,
  };
  const d = `M ${fmtPt(cubic.p0.x)} ${fmtPt(cubic.p0.y)} C ${fmtPt(cubic.p1.x)} ${fmtPt(cubic.p1.y)}, ${fmtPt(cubic.p2.x)} ${fmtPt(cubic.p2.y)}, ${fmtPt(end.x)} ${fmtPt(end.y)}`;
  const half = (ROAD_TOTAL_WIDTH / 2) * ROAD_HEAD_WIDTH_SCALE;
  const px = -tan.y;
  const py = tan.x;
  const left = { x: end.x + px * half, y: end.y + py * half };
  const right = { x: end.x - px * half, y: end.y - py * half };
  const centerStop = {
    x: end.x + tan.x * headLen * 0.62,
    y: end.y + tan.y * headLen * 0.62,
  };
  return {
    d,
    headPoints: `${fmtPt(left.x)},${fmtPt(left.y)} ${fmtPt(tip.x)},${fmtPt(tip.y)} ${fmtPt(right.x)},${fmtPt(right.y)}`,
    headEdge: `M ${fmtPt(left.x)} ${fmtPt(left.y)} L ${fmtPt(tip.x)} ${fmtPt(tip.y)} L ${fmtPt(right.x)} ${fmtPt(right.y)}`,
    headCenter: `M ${fmtPt(end.x)} ${fmtPt(end.y)} L ${fmtPt(centerStop.x)} ${fmtPt(centerStop.y)}`,
  };
}

function PlannerRoad({ link, layer }) {
  const geo = plannerRoadGeometry(link);
  if (layer === "heads") {
    return (
      <g className="overview-planner-road">
        <polygon className="overview-planner-road__head" points={geo.headPoints} />
        <path className="overview-planner-road__head-edge" d={geo.headEdge} />
        <path className="overview-planner-road__head-center" d={geo.headCenter} />
      </g>
    );
  }
  return (
    <g className="overview-planner-road">
      <path className="overview-planner-road__edging" d={geo.d} />
      <path className="overview-planner-road__asphalt" d={geo.d} />
      <path className="overview-planner-road__center" d={geo.d} />
    </g>
  );
}

function OverviewPlannerBoard({
  tiles,
  layout,
  inactiveKeys,
  startBuildingUnlocked,
  onTileClick,
  readOnly,
  requirementsByKey,
  isSourceDone,
  hiddenKeys,
}) {
  const boardRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [hoverTip, setHoverTip] = useState(null);
  const tileByKey = useMemo(() => new Map(tiles.map((tile) => [tile.key, tile])), [tiles]);
  const hidden = hiddenKeys || new Set();
  const drawnLinks = useMemo(
    () =>
      buildDrawnPlannerLinks(
        layout.positions,
        (layout.links || []).filter((link) => !hidden.has(link.from) && !hidden.has(link.to))
      ),
    [layout.positions, layout.links, hidden]
  );
  const extent = useMemo(
    () => ({ width: PLANNER_BOARD_WIDTH, height: PLANNER_BOARD_HEIGHT }),
    []
  );

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width < 1 || extent.width < 1 || extent.height < 1) return;
      const pad = 8;
      const maxHeight = height >= 40 ? height : Math.max(240, window.innerHeight * 0.7);
      const next = Math.min((width - pad) / extent.width, (maxHeight - pad) / extent.height);
      setScale(Number.isFinite(next) && next > 0.01 ? next : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [extent.height, extent.width]);

  return (
    <div className="overview-planner-board" ref={boardRef}>
      <div
        className="overview-planner-scale"
        style={{
          width: extent.width * scale,
          height: extent.height * scale,
        }}
      >
        <div
          className="overview-planner-canvas"
          style={{
            width: extent.width,
            height: extent.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <svg
            width={extent.width}
            height={extent.height}
            className="overview-planner-arrows"
            aria-hidden="true"
          >
            {drawnLinks.map((link) => (
              <PlannerRoad key={link.id} link={link} layer="shafts" />
            ))}
          </svg>
          {PLANNER_FLOW_ITEMS.map((item) => {
            if (hidden.has(item.key)) return null;
            const point = layout.positions[item.key] || { x: 0, y: 0 };
            const size = plannerNodeSize(item.key);
            const tile = tileByKey.get(item.key);
            const isStartProject = item.key === PLANNER_START_PROJECT_KEY;
            const isStartBuilding = item.key === PLANNER_START_BUILDING_KEY;
            const isImageNode = isStartProject || isStartBuilding;
            const headingUnlocked = isStartProject || (isStartBuilding && startBuildingUnlocked);
            const headingInactive = isStartBuilding && !startBuildingUnlocked;
            const style = isStartProject || headingUnlocked
              ? HEADING_GREEN_STYLE
              : headingInactive
                ? null
                : tile?.indicatorStyle || {};
            const inactive = headingInactive || (!item.kind || item.kind === "stage" ? inactiveKeys?.has(item.key) : false);
            const interactive =
              item.kind === "stage" &&
              !inactive &&
              !readOnly &&
              typeof onTileClick === "function";
            const background = isImageNode
              ? "transparent"
              : inactive
                ? UI.panelBg
                : style?.background;
            const color = inactive ? TEXT.dark : style?.color;
            const border = isImageNode
              ? "none"
              : inactive
                ? `1px solid ${UI.outline}`
                : style?.border ?? "none";
            const hoverLines = plannerNodeHoverLines({
              item,
              tile,
              inactive,
              requirementsByKey,
              isSourceDone,
            });
            const showHover = (event) => {
              if (hoverLines.length === 0) {
                setHoverTip(null);
                return;
              }
              setHoverTip({
                key: item.key,
                lines: hoverLines,
                list: Boolean(inactive),
                x: event.clientX,
                y: event.clientY,
              });
            };
            return (
              <div
                key={item.key}
                className={
                  [
                    "overview-planner-node",
                    inactive && !isImageNode ? "overview-planner-node--inactive" : "",
                    isImageNode ? "overview-planner-node--image" : "",
                    !isImageNode && item.kind === "heading" ? "overview-planner-node--heading" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => onTileClick(tile) : undefined}
                onPointerEnter={showHover}
                onPointerMove={showHover}
                onPointerLeave={() =>
                  setHoverTip((current) => (current?.key === item.key ? null : current))
                }
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onTileClick(tile);
                        }
                      }
                    : undefined
                }
                style={{
                  left: point.x,
                  top: point.y,
                  width: size.width,
                  height: size.height,
                  background,
                  color,
                  border,
                  cursor: interactive ? "pointer" : "default",
                }}
              >
                {isStartProject ? (
                  <img src={startProjectImage} alt="Start Project" />
                ) : isStartBuilding ? (
                  <img src={finishProjectImage} alt="Start Building" />
                ) : (
                  <>
                    <span className="overview-planner-node__label">{item.label}</span>
                    {item.kind === "stage" ? (
                      <span className="overview-planner-node__value">{tile?.value}</span>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
          <svg
            width={extent.width}
            height={extent.height}
            className="overview-planner-arrows overview-planner-arrows--heads"
            aria-hidden="true"
          >
            {drawnLinks.map((link) => (
              <PlannerRoad key={`${link.id}-head`} link={link} layer="heads" />
            ))}
          </svg>
        </div>
      </div>
      {hoverTip
        ? createPortal(
            <div
              className="overview-planner-tooltip"
              role="tooltip"
              style={{
                left: hoverTip.x,
                top: hoverTip.y,
                transform: `translate(${
                  hoverTip.x < window.innerWidth / 2 ? "14px" : "calc(-100% - 14px)"
                }, ${hoverTip.y < window.innerHeight / 2 ? "14px" : "calc(-100% - 14px)"})`,
              }}
            >
              {hoverTip.list ? (
                <ul>
                  {hoverTip.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                hoverTip.lines[0]
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/**
 * Design Phase Progress list — shared by staff Overview and Client Portal.
 */
export default function DesignPhaseStatusPanel({
  project,
  onTileClick,
  readOnly = false,
  heading = "Design Phase Progress",
  showHeading = true,
}) {
  const tiles = buildDesignPhaseStatusTiles(project);
  const hiddenKeys = useMemo(
    () => new Set(tiles.filter(isHiddenOptionalPlanningTile).map((tile) => tile.key)),
    [tiles]
  );
  const [plannerLayout, setPlannerLayout] = useState(() =>
    loadPlannerLayout(defaultPlannerPositions())
  );
  const requirementsByKey = useMemo(
    () => getPlannerRequirementKeysByItem(plannerLayout.links),
    [plannerLayout.links]
  );

  useEffect(() => {
    let cancelled = false;
    fetchPlannerLayoutFromApi(defaultPlannerPositions()).then((layout) => {
      if (cancelled || !layout) return;
      setPlannerLayout(layout);
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project || tiles.length === 0) return null;

  const completeByKey = new Map(tiles.map((tile) => [tile.key, isTileComplete(tile)]));
  const startBuildingUnlocked = isStartBuildingUnlocked(
    plannerLayout.links,
    (key) => completeByKey.get(key) === true
  );
  const isSourceDone = (key) => {
    if (key === PLANNER_START_PROJECT_KEY) return true;
    if (key === PLANNER_START_BUILDING_KEY) return startBuildingUnlocked;
    return completeByKey.get(key) === true;
  };
  const readyNow = tiles.filter((tile) => {
    if (isTileComplete(tile)) return false;
    if (isTileInProgress(tile)) return true;
    const outstanding = (requirementsByKey.get(tile.key) || []).filter((key) => !isSourceDone(key));
    return outstanding.length === 0;
  });
  const readyKeys = new Set(readyNow.map((tile) => tile.key));
  const inactiveKeys = new Set(
    tiles
      .filter((tile) => !isTileComplete(tile) && !readyKeys.has(tile.key))
      .map((tile) => tile.key)
  );
  const outstandingTiles = tiles.filter(
    (tile) =>
      !hiddenKeys.has(tile.key) &&
      !isTileComplete(tile) &&
      !inactiveKeys.has(tile.key)
  );

  const listView = (
    <div
      className="overview-status-list"
      style={{ "--overview-row-count": String(tiles.filter((tile) => !hiddenKeys.has(tile.key)).length) }}
    >
      {tiles.filter((tile) => !hiddenKeys.has(tile.key)).map((tile) => {
        const outstanding = (requirementsByKey.get(tile.key) || []).filter((key) => !isSourceDone(key));
        const requires = outstanding.map(plannerLabelForKey).join(", ");
        return (
          <OverviewStatusRow
            key={tile.key}
            label={tile.label}
            requires={requires}
            value={tile.value}
            indicatorStyle={tile.indicatorStyle}
            readOnly={readOnly}
            onClick={
              onTileClick
                ? () => onTileClick(tile)
                : undefined
            }
          />
        );
      })}
      <div className="overview-working-column" style={{ color: UI.textPrimary }}>
        <div className="overview-working-heading">Next to Work On:</div>
        {readyNow.length ? (
          readyNow.map((tile) => {
            const interactive = !readOnly && typeof onTileClick === "function";
            return (
              <div
                key={tile.key}
                className="overview-working-item"
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => onTileClick(tile) : undefined}
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onTileClick(tile);
                        }
                      }
                    : undefined
                }
                style={{ cursor: interactive ? "pointer" : "default" }}
              >
                {tile.label}
              </div>
            );
          })
        ) : (
          <div className="overview-working-item">None</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="overview-stack">
      <div className="overview-progress-block">
        {showHeading ? <h2 className="overview-progress-heading">{heading}</h2> : null}
        <div className="overview-progress-section">
          <div className="overview-view-body">
            <OverviewPlannerBoard
              tiles={tiles}
              layout={plannerLayout}
              inactiveKeys={inactiveKeys}
              startBuildingUnlocked={startBuildingUnlocked}
              onTileClick={onTileClick}
              readOnly={readOnly}
              requirementsByKey={requirementsByKey}
              isSourceDone={isSourceDone}
              hiddenKeys={hiddenKeys}
            />
            <aside className="overview-outstanding">
              <h3 className="overview-outstanding__heading">To Do List</h3>
              {outstandingTiles.length ? (
                outstandingTiles.map((tile) => {
                  const interactive = !readOnly && typeof onTileClick === "function";
                  return (
                    <button
                      key={tile.key}
                      type="button"
                      className="overview-outstanding__item"
                      disabled={!interactive}
                      onClick={interactive ? () => onTileClick(tile) : undefined}
                      style={{
                        background: tile.indicatorStyle?.background,
                        color: tile.indicatorStyle?.color,
                        border: tile.indicatorStyle?.border ?? "none",
                        cursor: interactive ? "pointer" : "default",
                      }}
                    >
                      <span className="overview-outstanding__label">{tile.label}</span>
                      <span className="overview-outstanding__value">{tile.value}</span>
                    </button>
                  );
                })
              ) : (
                <div className="overview-outstanding__empty">None</div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
