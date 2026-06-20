import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess } from "../utils/userAccess";

export default function ManagersAccessRoute({ children }) {
  const [ready, setReady] = useState(false);
  const [hasManagers, setHasManagers] = useState(false);

  useEffect(() => {
    (async () => {
      setHasManagers(await hasUserAccess("managers"));
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

  if (!hasManagers) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
