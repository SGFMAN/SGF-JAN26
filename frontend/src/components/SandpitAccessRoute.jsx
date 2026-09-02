import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

export default function SandpitAccessRoute({ children }) {
  const peeked = peekUserAccess("sandpit");
  const [ready, setReady] = useState(() => peeked !== null);
  const [hasSandpit, setHasSandpit] = useState(() => peeked === true);

  useEffect(() => {
    (async () => {
      setHasSandpit(await hasUserAccess("sandpit"));
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!hasSandpit) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
