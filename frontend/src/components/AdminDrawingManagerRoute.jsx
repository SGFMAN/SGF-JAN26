import React from "react";
import DrawingAccessRoute from "./DrawingAccessRoute";
import DrawingManager from "../pages/DrawingManager";

/**
 * @deprecated Prefer DrawingAccessRoute + DrawingManager in App.jsx.
 * Kept so any leftover imports still use the Drawing permission (not Admin).
 */
export default function AdminDrawingManagerRoute() {
  return (
    <DrawingAccessRoute>
      <DrawingManager />
    </DrawingAccessRoute>
  );
}
