import React from "react";
import { Link } from "react-router-dom";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

/** Layout tokens — keep in sync with AllProjects.jsx */
export const SGF_PANEL_HEIGHT_PX = 758;

export const sgfPageHeadingStyle = {
  margin: "32px auto 14px auto",
  width: "calc(100vw - 64px)",
  maxWidth: "100%",
  display: "flex",
  alignItems: "center",
  padding: "0 32px",
  boxSizing: "border-box",
  justifyContent: "center",
  position: "relative",
};

export const sgfSectionsContainerStyle = {
  display: "flex",
  width: "calc(100vw - 64px)",
  maxWidth: "100%",
  margin: "50px auto 0 auto",
  gap: "32px",
};

export const sgfSidebarMenuStyle = {
  background: SECTION_GREY,
  borderRadius: "16px",
  width: "200px",
  minWidth: "200px",
  height: `${SGF_PANEL_HEIGHT_PX}px`,
  boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
  padding: "32px 12px",
  boxSizing: "border-box",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "18px",
  color: MONUMENT,
};

export const sgfContentPanelStyle = {
  background: SECTION_GREY,
  borderRadius: "18px",
  flex: 1,
  minHeight: `${SGF_PANEL_HEIGHT_PX}px`,
  height: `${SGF_PANEL_HEIGHT_PX}px`,
  boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
  boxSizing: "border-box",
  overflow: "hidden",
};

/** @deprecated Use SGF_PANEL_HEIGHT_PX */
export const MAPS_PANEL_HEIGHT_PX = SGF_PANEL_HEIGHT_PX;

function navLinkStyle(active) {
  return {
    background: active ? MONUMENT : WHITE,
    color: active ? WHITE : MONUMENT,
    border: "none",
    borderRadius: "10px",
    padding: "13px 8px",
    fontSize: "1.05rem",
    fontWeight: 600,
    textAlign: "center",
    textDecoration: "none",
    letterSpacing: "0.5px",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
  };
}

function bulkSelectionLabel(selection) {
  if (selection === "VIC") return "VIC";
  if (selection === "QLD") return "QLD";
  return "ALL";
}

function sidebarButtonStyle(disabled) {
  return {
    background: disabled ? "#e0e0e0" : WHITE,
    color: MONUMENT,
    border: "none",
    borderRadius: "10px",
    padding: "11px 8px",
    fontSize: "0.95rem",
    fontWeight: 600,
    textAlign: "center",
    letterSpacing: "0.3px",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const SOLD_PROJECT_OPTIONS = [
  { key: "VIC", label: "VIC Projects" },
  { key: "QLD", label: "QLD Projects" },
  { key: "ALL", label: "ALL Projects" },
];

/** Shared left nav for Maps, Recent, and Sold Projects pages. */
export default function MapsSidebar({
  activeView,
  onLoadBulkProjects,
  bulkLoading = false,
  bulkSelection = null,
  onAddUnit,
  showAddUnit = false,
  onQuote,
  showQuote = false,
}) {
  const showBulkActions = typeof onLoadBulkProjects === "function";
  const onSoldMenu = activeView === "sold";

  return (
    <div className="sidebar-menu" style={sgfSidebarMenuStyle}>
      <Link to="/maps" style={navLinkStyle(activeView === "map")}>
        Map
      </Link>
      <Link to="/maps/recent" style={navLinkStyle(activeView === "recent")}>
        Recent
      </Link>

      {showAddUnit && typeof onAddUnit === "function" && (
        <button type="button" onClick={onAddUnit} style={sidebarButtonStyle(false)}>
          Add Unit
        </button>
      )}

      {showQuote && typeof onQuote === "function" && (
        <button type="button" onClick={onQuote} style={sidebarButtonStyle(false)}>
          Quote
        </button>
      )}

      {onSoldMenu && (
        <>
          <div style={navLinkStyle(true)}>Sold Projects</div>
          {showBulkActions &&
            SOLD_PROJECT_OPTIONS.map(({ key: selKey, label }) => {
              const busy = bulkLoading && bulkSelection === selKey;
              return (
                <button
                  key={selKey}
                  type="button"
                  onClick={() => onLoadBulkProjects(selKey)}
                  disabled={bulkLoading}
                  style={sidebarButtonStyle(bulkLoading)}
                >
                  {busy ? `Loading ${bulkSelectionLabel(selKey)}…` : label}
                </button>
              );
            })}
        </>
      )}

      <div style={{ flex: 1 }} />

      {!onSoldMenu && (
        <Link to="/maps/sold-projects" style={navLinkStyle(false)}>
          Sold Projects
        </Link>
      )}

      <Link
        to="/projects"
        style={{
          ...navLinkStyle(false),
          fontWeight: 500,
        }}
      >
        ← Back to Main
      </Link>
    </div>
  );
}

export { MONUMENT, SECTION_GREY, LIGHT_MONUMENT, WHITE };

