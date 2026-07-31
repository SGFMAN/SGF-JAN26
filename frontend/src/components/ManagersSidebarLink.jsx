import React from "react";
import { Link } from "react-router-dom";
import { useManagersAccess } from "../hooks/useManagersAccess";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import { UI } from "../utils/uiThemeTokens";

const DEFAULT_STYLE = {
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

/** Managers hub — Managers permission, or Drawing (to reach Drawing Manager only). */
export default function ManagersSidebarLink({ style = DEFAULT_STYLE }) {
  const { hasManagers, ready: managersReady } = useManagersAccess();
  const { hasDrawing, ready: drawingReady } = useDrawingAccess();

  if (!managersReady || !drawingReady) {
    return null;
  }
  if (!hasManagers && !hasDrawing) {
    return null;
  }

  return (
    <Link to="/managers" style={style}>
      Managers
    </Link>
  );
}
