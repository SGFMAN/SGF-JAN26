import React from "react";
import { Link } from "react-router-dom";
import { useSalesAccess } from "../hooks/useSalesAccess";
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

export default function HotlistSidebarSection({ active = false }) {
  const { hasSales, ready } = useSalesAccess();

  if (!ready || !hasSales) {
    return null;
  }

  return (
    <div
      style={{
        background: MENU.blue,
        borderRadius: "10px",
        padding: "4px",
        border: `1px solid ${UI.outline}`,
      }}
    >
      <Link
        to="/hotlist"
        style={{
          ...LINK_BASE_STYLE,
          background: active ? MENU.blueActive : "transparent",
          color: active ? MENU.activeText : UI.textSecondary,
        }}
      >
        Hot List
      </Link>
    </div>
  );
}
