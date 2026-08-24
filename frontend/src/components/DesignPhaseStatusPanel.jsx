import React, { useEffect, useMemo, useState } from "react";
import { buildDesignPhaseStatusTiles } from "../utils/designPhaseStatusTiles.js";
import {
  fetchPlannerLayoutFromApi,
  getPlannerRequirementKeysByItem,
  loadPlannerLayout,
  plannerLabelForKey,
} from "../utils/plannerLayout.js";
import { UI } from "../utils/uiThemeTokens.js";
import "../pages/Overview.css";

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
  const [plannerLinks, setPlannerLinks] = useState(() => loadPlannerLayout().links);
  const requirementsByKey = useMemo(
    () => getPlannerRequirementKeysByItem(plannerLinks),
    [plannerLinks]
  );

  useEffect(() => {
    let cancelled = false;
    fetchPlannerLayoutFromApi().then((layout) => {
      if (cancelled || !layout) return;
      setPlannerLinks(layout.links);
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project || tiles.length === 0) return null;

  const completeByKey = new Map(tiles.map((tile) => [tile.key, isTileComplete(tile)]));
  const readyNow = tiles.filter((tile) => {
    if (isTileComplete(tile)) return false;
    if (isTileInProgress(tile)) return true;
    const outstanding = (requirementsByKey.get(tile.key) || []).filter(
      (key) => completeByKey.get(key) !== true
    );
    return outstanding.length === 0;
  });

  return (
    <div className="overview-stack">
      <div className="overview-progress-block">
        {showHeading ? <h2 className="overview-progress-heading">{heading}</h2> : null}
        <div className="overview-progress-section">
          <div
            className="overview-status-list"
            style={{ "--overview-row-count": String(tiles.length) }}
          >
            {tiles.map((tile) => {
              const outstanding = (requirementsByKey.get(tile.key) || []).filter(
                (key) => completeByKey.get(key) !== true
              );
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
        </div>
      </div>
    </div>
  );
}
