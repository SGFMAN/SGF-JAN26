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
 * Holds the staff UI until theme + (when logged in) access grants are ready,
 * so menu groups do not pop in one-by-one.
 */
export default function AppBootstrap({ children }) {
  const location = useLocation();
  const { ready: themeReady } = useUiTheme();
  const [sessionReady, setSessionReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Loading…");
  const [bootNonce, setBootNonce] = useState(0);
  const loggedIn = isAuthenticated();

  useEffect(() => {
    function onAuthChange() {
      setSessionReady(false);
      setBootNonce((n) => n + 1);
    }
    window.addEventListener("sgf-auth-session-change", onAuthChange);
    return () => window.removeEventListener("sgf-auth-session-change", onAuthChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setSessionReady(false);

      if (!themeReady) {
        setStatusMessage("Loading theme…");
        return;
      }

      if (!isAuthenticated()) {
        if (!cancelled) {
          setStatusMessage("Loading…");
          setSessionReady(true);
          removeStaticBootLoader();
        }
        return;
      }

      setStatusMessage("Loading permissions…");
      try {
        await Promise.all([getUserAccessGrants(), isUserAdmin()]);
      } catch (err) {
        console.error("App bootstrap failed:", err);
      }

      if (!cancelled) {
        setStatusMessage("Loading…");
        setSessionReady(true);
        removeStaticBootLoader();
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [themeReady, bootNonce, location.pathname, loggedIn]);

  const ready = themeReady && sessionReady;

  useEffect(() => {
    if (ready) removeStaticBootLoader();
  }, [ready]);

  const value = useMemo(() => ({ ready }), [ready]);

  return (
    <AppBootstrapContext.Provider value={value}>
      {!ready ? <AppLoadingScreen message={statusMessage} /> : null}
      {ready ? children : null}
    </AppBootstrapContext.Provider>
  );
}
