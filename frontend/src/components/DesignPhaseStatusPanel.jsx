import React from "react";
import { buildDesignPhaseStatusTiles } from "../utils/designPhaseStatusTiles.js";
import { UI } from "../utils/uiThemeTokens.js";
import "../pages/Overview.css";

function OverviewStatusRow({ label, value, indicatorStyle, onClick, readOnly }) {
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
  if (!project || tiles.length === 0) return null;

  return (
    <div className="overview-stack">
      <div className="overview-progress-block">
        {showHeading ? <h2 className="overview-progress-heading">{heading}</h2> : null}
        <div className="overview-progress-section">
          <div className="overview-status-list">
            {tiles.map((tile) => (
              <OverviewStatusRow
                key={tile.key}
                label={tile.label}
                value={tile.value}
                indicatorStyle={tile.indicatorStyle}
                readOnly={readOnly}
                onClick={
                  onTileClick
                    ? () => onTileClick(tile)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
