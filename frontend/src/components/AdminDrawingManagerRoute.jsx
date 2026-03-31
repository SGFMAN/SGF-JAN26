import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";
import DrawingManager from "../pages/DrawingManager";

/**
 * Renders Drawing Manager only for admin login (admin password + Admin position).
 * Others are redirected to Site Visit Manager.
 */
export default function AdminDrawingManagerRoute() {
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      setAdmin(await isUserAdmin());
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#42464d",
          color: "#fff",
          fontSize: "1rem",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!admin) {
    return <Navigate to="/managers/site-visit-manager" replace />;
  }

  return <DrawingManager />;
}
