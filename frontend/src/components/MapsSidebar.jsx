import React from "react";
import { Link } from "react-router-dom";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

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

/** Shared left nav for Maps and Recent pages. */
export default function MapsSidebar({ activeView }) {
  return (
    <div
      className="sidebar-menu"
      style={{
        background: SECTION_GREY,
        borderRadius: "16px",
        width: "200px",
        minWidth: "200px",
        minHeight: "520px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
        padding: "32px 12px",
        boxSizing: "border-box",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: "18px",
        color: MONUMENT,
      }}
    >
      <Link to="/maps" style={navLinkStyle(activeView === "map")}>
        Map
      </Link>
      <Link to="/maps/recent" style={navLinkStyle(activeView === "recent")}>
        Recent
      </Link>
      <div style={{ flex: 1 }} />
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
