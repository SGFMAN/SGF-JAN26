import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

export default function AdminAccessRoute({ children }) {
  const peeked = peekUserAccess("admin");
  const [ready, setReady] = useState(() => peeked !== null);
  const [hasAdmin, setHasAdmin] = useState(() => peeked === true);

  useEffect(() => {
    (async () => {
      setHasAdmin(await hasUserAccess("admin"));
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!hasAdmin) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
