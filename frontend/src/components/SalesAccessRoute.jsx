import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

export default function SalesAccessRoute({ children }) {
  const peeked = peekUserAccess("sales");
  const [ready, setReady] = useState(() => peeked !== null);
  const [hasSales, setHasSales] = useState(() => peeked === true);

  useEffect(() => {
    (async () => {
      setHasSales(await hasUserAccess("sales"));
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!hasSales) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
