import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

/**
 * Drawing Manager and drawing-gated UI — requires Drawing in Settings → Permissions.
 * Does not require Managers.
 */
export default function DrawingAccessRoute({ children }) {
  const peeked = peekUserAccess("drawing");
  const [ready, setReady] = useState(() => peeked !== null);
  const [hasDrawing, setHasDrawing] = useState(() => peeked === true);

  useEffect(() => {
    (async () => {
      setHasDrawing(await hasUserAccess("drawing"));
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!hasDrawing) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
