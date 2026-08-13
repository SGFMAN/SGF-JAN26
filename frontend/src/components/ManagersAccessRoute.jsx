import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

export default function ManagersAccessRoute({ children }) {
  const peeked = peekUserAccess("managers");
  const [ready, setReady] = useState(() => peeked !== null);
  const [hasManagers, setHasManagers] = useState(() => peeked === true);

  useEffect(() => {
    (async () => {
      setHasManagers(await hasUserAccess("managers"));
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!hasManagers) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
