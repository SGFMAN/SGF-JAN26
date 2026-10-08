import React from "react";
import { Link } from "react-router-dom";
import { UI, MENU } from "../utils/uiThemeTokens";
import { TOOLS_PAGE_PATH, isToolsPath } from "../constants/toolsMenu.js";

const LINK_BASE_STYLE = {
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

/** Purple menu: Tools for anyone who can open a tool, Settings for admins. */
export default function AdminToolsSidebarSection({
  activePath = "",
  showTools = false,
  showSettings = false,
}) {
  if (!showTools && !showSettings) return null;

  const links = [
    showTools ? { to: TOOLS_PAGE_PATH, label: "Tools" } : null,
    showSettings ? { to: "/settings", label: "Settings" } : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        background: MENU.purpleLight,
        borderRadius: "10px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        border: `1px solid ${UI.outline}`,
      }}
    >
      {links.map(({ to, label }) => {
        const active =
          to === TOOLS_PAGE_PATH
            ? isToolsPath(activePath)
            : activePath === to || String(activePath).startsWith("/settings");
        return (
          <Link
            key={to}
            to={to}
            style={{
              ...LINK_BASE_STYLE,
              background: active ? MENU.purple : "transparent",
              color: active ? MENU.activeText : UI.textSecondary,
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
