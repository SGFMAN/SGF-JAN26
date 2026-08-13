import React, { useEffect, useState } from "react";
import HotlistSidebarSection from "./HotlistSidebarSection";
import ProjectStatusSidebarSection from "./ProjectStatusSidebarSection";
import ManagersSalesMenuGroup from "./ManagersSalesMenuGroup";
import AdminToolsSidebarSection from "./AdminToolsSidebarSection";
import { useSalesAccess } from "../hooks/useSalesAccess";
import { useManagersAccess } from "../hooks/useManagersAccess";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import { isUserAdmin } from "../utils/auth";
import { peekUserAccess } from "../utils/userAccess";

/**
 * Renders the full main sidebar menu only when every access check is ready,
 * so green / blue / red / purple groups appear together (never partially).
 */
export default function MainSidebarMenu({ activePath = "", stateFilter }) {
  const { ready: salesReady } = useSalesAccess();
  const { ready: managersReady } = useManagersAccess();
  const { ready: drawingReady } = useDrawingAccess();
  const peekedAdmin = peekUserAccess("admin");
  const [adminReady, setAdminReady] = useState(() => peekedAdmin !== null);
  const [isAdmin, setIsAdmin] = useState(() => peekedAdmin === true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const admin = await isUserAdmin();
      if (!cancelled) {
        setIsAdmin(admin);
        setAdminReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!salesReady || !managersReady || !drawingReady || !adminReady) {
    return null;
  }

  return (
    <>
      <HotlistSidebarSection />
      <ProjectStatusSidebarSection activePath={activePath} stateFilter={stateFilter} />
      <ManagersSalesMenuGroup />
      <AdminToolsSidebarSection activePath={activePath} visible={isAdmin} />
    </>
  );
}
