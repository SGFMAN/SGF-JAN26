import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess } from "../utils/userAccess";

/**
 * Drawing Manager and drawing-gated UI — requires Drawing in Settings → Permissions.
 * Does not require Managers.
 */
export default function DrawingAccessRoute({ children }) {
  const [ready, setReady] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    (async () => {
      setHasDrawing(await hasUserAccess("drawing"));
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

  if (!hasDrawing) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
