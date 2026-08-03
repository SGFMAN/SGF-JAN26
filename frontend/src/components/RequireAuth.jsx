import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, verifyServerSession } from "../utils/auth";

/**
 * Gate staff routes. If this tab has no sessionStorage login yet, check the
 * HttpOnly session cookie first so email deep-links can skip re-login.
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
        // Refresh cookie session / hydrate in background
        void verifyServerSession();
        return;
      }

      const user = await verifyServerSession();
      if (cancelled) return;
      setAllowed(Boolean(user) || isAuthenticated());
      setReady(true);
    }

    void ensureAuth();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search]);

  if (!ready) {
    return null;
  }

  if (!allowed) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}
