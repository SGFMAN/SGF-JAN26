import React from "react";
import { Link, useLocation } from "react-router-dom";
import { UI } from "../utils/uiThemeTokens.js";
import { TOOLS_MENU_LINKS, isToolsLinkActive } from "../constants/toolsMenu.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;

const sidebarStyle = {
  background: SECTION_GREY,
  borderRadius: "16px",
  width: "200px",
  minWidth: "200px",
  height: "758px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
  padding: "32px 12px",
  boxSizing: "border-box",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: "18px",
  color: MONUMENT,
  overflowY: "auto",
};

const navLinkStyle = {
  background: "transparent",
  color: UI.textSecondary,
  border: "none",
  borderRadius: "10px",
  padding: "8px 8px",
  fontSize: "0.95rem",
  fontWeight: 500,
  textAlign: "center",
  textDecoration: "none",
  letterSpacing: "0.5px",
  cursor: "pointer",
  transition: "background 0.18s, color 0.15s",
  marginBottom: "0px",
  lineHeight: "1.4",
  display: "block",
};

export function ToolsNavLinks({ activePath }) {
  const location = useLocation();
  const path = activePath || location.pathname;

  return (
    <>
      {TOOLS_MENU_LINKS.map(({ to, label }) => {
        const active = isToolsLinkActive(path, to);
        return (
          <Link
            key={to}
            to={to}
            style={
              active
                ? {
                    ...navLinkStyle,
                    background: WHITE,
                    color: MONUMENT,
                    outline: `1px solid ${UI.outline}`,
                    boxShadow: "0 2px 4px rgba(50,50,51,.04)",
                  }
                : navLinkStyle
            }
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}

/** Tools submenu: Email Generator, Maps, Apply Fields — used on the Tools hub and tool pages. */
export default function ToolsSidebarMenu({ activePath, children, fillHeight = false }) {
  return (
    <div
      className="sidebar-menu"
      style={{
        ...sidebarStyle,
        ...(fillHeight ? { height: "100%", minHeight: 0 } : null),
      }}
    >
      <ToolsNavLinks activePath={activePath} />
      {children}
      <div style={{ flex: 1 }} />
      <Link
        to="/projects"
        style={{
          ...navLinkStyle,
          background: WHITE,
          color: MONUMENT,
          outline: `1px solid ${UI.outline}`,
          boxShadow: "0 2px 4px rgba(50,50,51,.04)",
        }}
      >
        ← Back to Main
      </Link>
    </div>
  );
}
