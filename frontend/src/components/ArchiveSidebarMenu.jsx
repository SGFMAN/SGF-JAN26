import React from "react";
import { Link, useLocation } from "react-router-dom";
import { UI } from "../utils/uiThemeTokens";

const LINK_STYLE = {
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

const ACTIVE_STYLE = {
  ...LINK_STYLE,
  background: UI.cardBg,
  color: UI.textPrimary,
  outline: `1px solid ${UI.outline}`,
  boxShadow: "0 2px 4px rgba(50,50,51,.04)",
};

const ARCHIVE_LINKS = [
  { to: "/finished-projects", label: "Completed" },
  { to: "/cancelled", label: "Cancelled" },
];

/**
 * Managers-style archive submenu: Completed, Cancelled, ← Back to Main.
 * Replaces the full main sidebar on archive routes.
 */
export default function ArchiveSidebarMenu({ activePath: activePathProp }) {
  const location = useLocation();
  const activePath = activePathProp || location.pathname;

  return (
    <>
      {ARCHIVE_LINKS.map(({ to, label }) => (
        <Link key={to} to={to} style={activePath === to ? ACTIVE_STYLE : LINK_STYLE}>
          {label}
        </Link>
      ))}
      <div style={{ flex: 1 }} />
      <Link to="/projects" style={LINK_STYLE}>
        ← Back to Main
      </Link>
    </>
  );
}
