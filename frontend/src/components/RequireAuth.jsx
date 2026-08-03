import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  isAuthenticated,
  verifyServerSession,
  isStaffProjectDeepLink,
} from "../utils/auth";

/**
 * Gate staff routes.
 * - Tab already logged in (sessionStorage) → allow.
 * - Project deep-link (email) + valid session cookie → adopt and allow.
 * - Everything else (e.g. fresh open of /projects) → login required, even
 *   if a leftover cookie still exists in the browser.
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
        // Refresh cookie session into memory only when already logged in this tab
        void verifyServerSession({ adoptTabAuth: true });
        return;
      }

      // Cold start / new tab without tab login: only skip password for email deep-links
      if (isStaffProjectDeepLink(location.pathname)) {
        const user = await verifyServerSession({ adoptTabAuth: true });
        if (cancelled) return;
        setAllowed(Boolean(user) || isAuthenticated());
        setReady(true);
        return;
      }

      if (!cancelled) {
        setAllowed(false);
        setReady(true);
      }
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
