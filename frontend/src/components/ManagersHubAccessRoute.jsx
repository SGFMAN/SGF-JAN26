import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

/**
 * Managers hub (/managers) — Managers or Drawing.
 * Drawing-only users use the hub to open Drawing Manager; other manager pages stay Managers-gated.
 */
export default function ManagersHubAccessRoute({ children }) {
  const peekedManagers = peekUserAccess("managers");
  const peekedDrawing = peekUserAccess("drawing");
  const cacheWarm = peekedManagers !== null && peekedDrawing !== null;
  const [ready, setReady] = useState(() => cacheWarm);
  const [allowed, setAllowed] = useState(
    () => (peekedManagers === true || peekedDrawing === true)
  );

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
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!allowed) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
