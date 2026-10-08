import HotlistSidebarSection from "./HotlistSidebarSection";
import ProjectStatusSidebarSection from "./ProjectStatusSidebarSection";
import ManagersSalesMenuGroup from "./ManagersSalesMenuGroup";
import AdminToolsSidebarSection from "./AdminToolsSidebarSection";
import { useSalesAccess } from "../hooks/useSalesAccess";
import { useManagersAccess } from "../hooks/useManagersAccess";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import { useToolsAccess } from "../hooks/useToolsAccess";

/**
 * Renders the full main sidebar menu only when every access check is ready,
 * so green / blue / red / purple groups appear together (never partially).
 */
export default function MainSidebarMenu({ activePath = "", stateFilter }) {
  const { ready: salesReady } = useSalesAccess();
  const { ready: managersReady } = useManagersAccess();
  const { ready: drawingReady } = useDrawingAccess();
  const { ready: toolsReady, isAdmin, showToolsMenu } = useToolsAccess();

  if (!salesReady || !managersReady || !drawingReady || !toolsReady) {
    return null;
  }

  return (
    <>
      <HotlistSidebarSection />
      <ProjectStatusSidebarSection activePath={activePath} stateFilter={stateFilter} />
      <ManagersSalesMenuGroup />
      <AdminToolsSidebarSection
        activePath={activePath}
        showTools={showToolsMenu}
        showSettings={isAdmin}
      />
    </>
  );
}
