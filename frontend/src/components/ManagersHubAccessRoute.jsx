import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess } from "../utils/userAccess";

/**
 * Managers hub (/managers) — Managers or Drawing.
 * Drawing-only users use the hub to open Drawing Manager; other manager pages stay Managers-gated.
 */
export default function ManagersHubAccessRoute({ children }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      const [managers, drawing] = await Promise.all([
        hasUserAccess("managers"),
        hasUserAccess("drawing"),
      ]);
      setAllowed(managers || drawing);
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
          color: "var(--sgf-page-text)",
          fontSize: "1rem",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
