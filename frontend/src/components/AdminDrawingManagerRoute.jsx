import React from "react";
import AdminAccessRoute from "./AdminAccessRoute";
import DrawingManager from "../pages/DrawingManager";

/**
 * Drawing Manager — requires Admin checked in Settings → Permissions.
 */
export default function AdminDrawingManagerRoute() {
  return (
    <AdminAccessRoute>
      <DrawingManager />
    </AdminAccessRoute>
  );
}
