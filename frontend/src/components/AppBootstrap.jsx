import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { isAuthenticated, isUserAdmin } from "../utils/auth";
import { getUserAccessGrants } from "../utils/userAccess";
import { useUiTheme } from "../context/UiThemeProvider";
import AppLoadingScreen from "./AppLoadingScreen";

const AppBootstrapContext = createContext({ ready: false });

export function useAppBootstrap() {
  return useContext(AppBootstrapContext);
}

function removeStaticBootLoader() {
  const el = document.getElementById("sgf-boot-loader");
  if (el) el.remove();
}

/**
 * After login only: hold the main staff UI until theme + permissions are ready
 * so menu groups do not pop in one-by-one. Login/splash is never covered.
 */
export default function AppBootstrap({ children }) {
  const location = useLocation();
  const { ready: themeReady } = useUiTheme();
  const [sessionReady, setSessionReady] = useState(() => !isAuthenticated());
  const [bootNonce, setBootNonce] = useState(0);
  const loggedIn = isAuthenticated();

  useEffect(() => {
    removeStaticBootLoader();
  }, []);

  useEffect(() => {
    function onAuthChange() {
      if (isAuthenticated()) {
        setSessionReady(false);
        setBootNonce((n) => n + 1);
      } else {
        setSessionReady(true);
      }
    }
    window.addEventListener("sgf-auth-session-change", onAuthChange);
    return () => window.removeEventListener("sgf-auth-session-change", onAuthChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // Login / splash: show immediately — no loading cover.
      if (!isAuthenticated()) {
        if (!cancelled) setSessionReady(true);
        return;
      }

      setSessionReady(false);

      if (!themeReady) return;

      try {
        await Promise.all([getUserAccessGrants(), isUserAdmin()]);
      } catch (err) {
        console.error("App bootstrap failed:", err);
      }

      if (!cancelled) setSessionReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [themeReady, bootNonce, location.pathname, loggedIn]);

  const ready = !loggedIn || (themeReady && sessionReady);
  const value = useMemo(() => ({ ready }), [ready]);
  const showLoadingCover = loggedIn && !ready;

  return (
    <AppBootstrapContext.Provider value={value}>
      {showLoadingCover ? <AppLoadingScreen message="Loading…" /> : null}
      {!loggedIn || ready ? children : null}
    </AppBootstrapContext.Provider>
  );
}
