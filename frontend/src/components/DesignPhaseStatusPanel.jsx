import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildDesignPhaseStatusTiles } from "../utils/designPhaseStatusTiles.js";
import startBuildingImage from "../images/start building.png";
import {
  PLANNER_FLOW_ITEMS,
  PLANNER_START_BUILDING_KEY,
  PLANNER_START_PROJECT_KEY,
  buildDrawnPlannerLinks,
  defaultPlannerPositions,
  fetchPlannerLayoutFromApi,
  getPlannerRequirementKeysByItem,
  isStartBuildingUnlocked,
  loadPlannerLayout,
  plannerBoardExtent,
  plannerLabelForKey,
  plannerNodeSize,
} from "../utils/plannerLayout.js";
import { STREAM, INDICATOR, UI } from "../utils/uiThemeTokens.js";
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
    text: UI.pageText,
  }),
  variant: "green",
};

function OverviewPlannerBoard({ tiles, layout, inactiveKeys, startBuildingUnlocked, onTileClick, readOnly }) {
  const boardRef = useRef(null);
  const [scale, setScale] = useState(1);
  const tileByKey = useMemo(() => new Map(tiles.map((tile) => [tile.key, tile])), [tiles]);
  const drawnLinks = useMemo(
    () => buildDrawnPlannerLinks(layout.positions, layout.links),
    [layout.positions, layout.links]
  );
  const extent = useMemo(() => plannerBoardExtent(layout.positions), [layout.positions]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const update = () => {
      const width = el.clientWidth;
      if (width < 1 || extent.width < 1 || extent.height < 1) return;
      const maxHeight = Math.max(240, window.innerHeight * 0.7);
      setScale(Math.min(width / extent.width, maxHeight / extent.height));
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
            <defs>
              <marker
                id="overview-planner-arrow"
                markerWidth="10"
                markerHeight="8"
                refX="9"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 4 L 0 8 z" fill={UI.textPrimary} />
              </marker>
            </defs>
            {drawnLinks.map((link) =>
              link.self ? (
                <path
                  key={link.id}
                  d={link.d}
                  fill="none"
                  stroke={UI.textPrimary}
                  strokeWidth="2"
                  markerEnd="url(#overview-planner-arrow)"
                />
              ) : (
                <line
                  key={link.id}
                  x1={link.x1}
                  y1={link.y1}
                  x2={link.x2}
                  y2={link.y2}
                  stroke={UI.textPrimary}
                  strokeWidth="2"
                  markerEnd="url(#overview-planner-arrow)"
                />
              )
            )}
          </svg>
          {PLANNER_FLOW_ITEMS.map((item) => {
            const point = layout.positions[item.key] || { x: 0, y: 0 };
            const size = plannerNodeSize(item.key);
            const tile = tileByKey.get(item.key);
            const isStartProject = item.key === PLANNER_START_PROJECT_KEY;
            const isStartBuilding = item.key === PLANNER_START_BUILDING_KEY;
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
            const background = isStartBuilding
              ? "transparent"
              : inactive
                ? "#C8C8C8"
                : style?.background;
            const color = inactive ? UI.textPrimary : style?.color;
            const border = isStartBuilding
              ? "none"
              : inactive
                ? `1px solid ${UI.outline}`
                : style?.border ?? "none";
            return (
              <div
                key={item.key}
                className={
                  [
                    "overview-planner-node",
                    inactive ? "overview-planner-node--inactive" : "",
                    isStartBuilding ? "overview-planner-node--image" : "",
                    !isStartBuilding && item.kind === "heading" ? "overview-planner-node--heading" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
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
                title={item.kind === "heading" ? item.label : tile?.value || item.label}
              >
                {isStartBuilding ? (
                  <img src={startBuildingImage} alt="Start Building" />
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
        </div>
      </div>
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

  const listView = (
    <div
      className="overview-status-list"
      style={{ "--overview-row-count": String(tiles.length) }}
    >
      {tiles.map((tile) => {
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
          {SHOW_PLANNER_LAYOUT ? (
            <OverviewPlannerBoard
              tiles={tiles}
              layout={plannerLayout}
              inactiveKeys={inactiveKeys}
              startBuildingUnlocked={startBuildingUnlocked}
              onTileClick={onTileClick}
              readOnly={readOnly}
            />
          ) : (
            listView
          )}
        </div>
      </div>
    </div>
  );
}
