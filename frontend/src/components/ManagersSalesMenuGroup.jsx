import React from "react";
import { useManagersAccess } from "../hooks/useManagersAccess";
import { useSalesAccess } from "../hooks/useSalesAccess";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import ManagersSidebarLink from "./ManagersSidebarLink";
import SalesSidebarLink from "./SalesSidebarLink";
import { UI, MENU } from "../utils/uiThemeTokens";

export default function ManagersSalesMenuGroup() {
  const { hasManagers, ready: managersReady } = useManagersAccess();
  const { hasSales, ready: salesReady } = useSalesAccess();
  const { hasDrawing, ready: drawingReady } = useDrawingAccess();

  if (!managersReady || !salesReady || !drawingReady) {
    return null;
  }

  // Drawing users need the Managers hub entry to reach Drawing Manager (no separate main-menu item).
  if (!hasManagers && !hasSales && !hasDrawing) {
    return null;
  }

  return (
    <div
      style={{
        background: MENU.red,
        borderRadius: "10px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        border: `1px solid ${UI.outline}`,
      }}
    >
      <ManagersSidebarLink />
      <SalesSidebarLink />
    </div>
  );
}
