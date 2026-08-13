import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  isAuthenticated,
  verifyServerSession,
  probeLiveStaffPeerSession,
} from "../utils/auth";
import AppLoadingScreen from "./AppLoadingScreen";

/**
 * Gate staff routes.
 * - This tab already logged in (sessionStorage) → allow.
 * - Another open SGF tab is logged in + valid cookie → adopt and allow
 *   (email links / new windows while already using the app).
 * - No open peer session → login required, even with a leftover cookie.
 */
export default function RequireAuth({ children }) {
  const location = useLocation();
  const [ready, setReady] = useState(() => isAuthenticated());
  const [allowed, setAllowed] = useState(() => isAuthenticated());

  useEffect(() => {
    let cancelled = false;

    async function ensureAuth() {
      if (isAuthenticated()) {
        if (!cancelled) {
          setAllowed(true);
          setReady(true);
        }
        void verifyServerSession({ adoptTabAuth: true });
        return;
      }

      // Only skip password when another tab answers "I'm logged in"
      const peerAlive = await probeLiveStaffPeerSession();
      if (cancelled) return;

      if (peerAlive) {
        const user = await verifyServerSession({ adoptTabAuth: true });
        if (cancelled) return;
        setAllowed(Boolean(user) || isAuthenticated());
        setReady(true);
        return;
      }

      setAllowed(false);
      setReady(true);
    }

    void ensureAuth();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  if (!ready) {
    // Only show the branded loader when this tab is already logged in
    // (main view boot). Unauthenticated probes should not cover the login page.
    if (isAuthenticated()) {
      return <AppLoadingScreen message="Loading…" />;
    }
    return null;
  }

  if (!allowed) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}
