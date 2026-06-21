import React from "react";
import { useManagersAccess } from "../hooks/useManagersAccess";
import { useSalesAccess } from "../hooks/useSalesAccess";
import ManagersSidebarLink from "./ManagersSidebarLink";
import SalesSidebarLink from "./SalesSidebarLink";
import { UI, MENU } from "../utils/uiThemeTokens";

export default function ManagersSalesMenuGroup() {
  const { hasManagers, ready: managersReady } = useManagersAccess();
  const { hasSales, ready: salesReady } = useSalesAccess();

  if (!managersReady || !salesReady) {
    return null;
  }

  if (!hasManagers && !hasSales) {
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
