import React from "react";
import { Link } from "react-router-dom";
import { UI, MENU } from "../utils/uiThemeTokens";

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

const ADMIN_TOOL_LINKS = [
  { to: "/email-generator", label: "Email Generator" },
  { to: "/maps", label: "Maps" },
  { to: "/settings", label: "Settings" },
];

/** Purple admin menu: Email Generator → Maps → Settings. */
export default function AdminToolsSidebarSection({ activePath = "", visible = true }) {
  if (!visible) return null;

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
      {ADMIN_TOOL_LINKS.map(({ to, label }) => {
        const active = activePath === to || (to === "/settings" && String(activePath).startsWith("/settings"));
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
