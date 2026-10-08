import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getUserAccessGrants, peekUserAccess } from "../utils/userAccess";
import AppLoadingScreen from "./AppLoadingScreen";

/** Allow the page when the user has any one of the named permissions. */
export default function RequireAccessRoute({ anyOf, children }) {
  const areas = Array.isArray(anyOf) ? anyOf : [];
  const areaKey = areas.join("|");
  const peeked = areas.map((area) => peekUserAccess(area));
  const cacheReady = peeked.some((value) => value !== null);
  const [ready, setReady] = useState(cacheReady);
  const [allowed, setAllowed] = useState(() => peeked.some((value) => value === true));

  useEffect(() => {
    let cancelled = false;
    const names = areaKey ? areaKey.split("|") : [];
    (async () => {
      const grants = await getUserAccessGrants();
      if (cancelled) return;
      setAllowed(names.some((area) => grants[area] === true));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [areaKey]);

  if (!ready) {
    return <AppLoadingScreen message="Loading…" />;
  }

  if (!allowed) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
