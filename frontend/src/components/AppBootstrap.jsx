import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isAuthenticated, isUserAdmin } from "../utils/auth";
import { getUserAccessGrants } from "../utils/userAccess";
import { fetchProjectsList, getCachedProjectsList } from "../utils/projectsListCache";
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
 * After login only: preload theme, permissions, and the projects list.
 * Never blocks Back / route changes. Never leaves the UI on a grey cover
 * if the list request is slow.
 */
export default function AppBootstrap({ children }) {
  const { ready: themeReady } = useUiTheme();
  const [bootNonce, setBootNonce] = useState(0);
  const loggedIn = isAuthenticated();
  const [sessionReady, setSessionReady] = useState(() => {
    if (!isAuthenticated()) return true;
    return Boolean(getCachedProjectsList("card"));
  });

  useEffect(() => {
    removeStaticBootLoader();
  }, []);

  useEffect(() => {
    function onAuthChange() {
      if (isAuthenticated()) {
        setSessionReady(Boolean(getCachedProjectsList("card")));
        setBootNonce((n) => n + 1);
      } else {
        setSessionReady(true);
      }
    }
    window.addEventListener("sgf-auth-session-change", onAuthChange);
    return () => window.removeEventListener("sgf-auth-session-change", onAuthChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      setSessionReady(true);
      return undefined;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setSessionReady(true);
    }, 2500);

    (async () => {
      try {
        await Promise.all([
          getUserAccessGrants(),
          isUserAdmin(),
          fetchProjectsList({ view: "card" }),
        ]);
      } catch (err) {
        console.error("App bootstrap failed:", err);
      }
      if (!cancelled) setSessionReady(true);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [bootNonce, loggedIn]);

  const ready = !loggedIn || sessionReady;
  const value = useMemo(() => ({ ready: ready && (themeReady || !loggedIn) }), [ready, themeReady, loggedIn]);
  const showLoadingCover = loggedIn && !sessionReady;

  return (
    <AppBootstrapContext.Provider value={value}>
      {showLoadingCover ? <AppLoadingScreen message="Loading…" /> : null}
      {children}
    </AppBootstrapContext.Provider>
  );
}
