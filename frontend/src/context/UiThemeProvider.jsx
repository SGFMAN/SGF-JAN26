import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLoggedInUserId } from "../utils/auth";
import {
  applyUiThemeToDocument,
  readStoredUiThemeColorOverrides,
  readStoredUiThemeId,
  writeStoredUiThemeColorOverrides,
  writeStoredUiThemeId,
} from "../themes/applyUiTheme";
import { DEFAULT_UI_THEME_ID, getUiTheme } from "../themes/uiThemes";

const UiThemeContext = createContext(null);

export function UiThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(DEFAULT_UI_THEME_ID);
  const [colorOverrides, setColorOverrides] = useState({});

  useEffect(() => {
    const userId = getLoggedInUserId();
    const stored = readStoredUiThemeId(userId);
    const storedOverrides = readStoredUiThemeColorOverrides(userId);
    setThemeIdState(stored);
    setColorOverrides(storedOverrides);
    applyUiThemeToDocument(stored, storedOverrides);

    function onThemeChange(event) {
      const nextId = event?.detail?.themeId;
      if (nextId && getUiTheme(nextId).id === nextId) {
        setThemeIdState(nextId);
      }
      if (event?.detail?.colorOverrides) {
        setColorOverrides(event.detail.colorOverrides);
      }
    }

    window.addEventListener("sgf-ui-theme-change", onThemeChange);
    return () => window.removeEventListener("sgf-ui-theme-change", onThemeChange);
  }, []);

  const setThemeId = useCallback(
    (nextThemeId) => {
      const theme = getUiTheme(nextThemeId);
      setThemeIdState(theme.id);
      applyUiThemeToDocument(theme.id, colorOverrides);
      writeStoredUiThemeId(getLoggedInUserId(), theme.id);
    },
    [colorOverrides]
  );

  const getThemeColors = useCallback(
    (targetThemeId, draftOverrides = {}) => {
      const merged = { ...(colorOverrides[targetThemeId] || {}), ...draftOverrides };
      return getUiTheme(targetThemeId, merged).colors;
    },
    [colorOverrides]
  );

  const setThemeColor = useCallback(
    (targetThemeId, colorKey, value) => {
      setColorOverrides((prev) => {
        const userId = getLoggedInUserId();
        const themePatch = { ...(prev[targetThemeId] || {}), [colorKey]: value };
        const next = { ...prev, [targetThemeId]: themePatch };
        writeStoredUiThemeColorOverrides(userId, next);
        if (targetThemeId === themeId) {
          applyUiThemeToDocument(targetThemeId, next);
        }
        return next;
      });
    },
    [themeId]
  );

  const clearThemeColor = useCallback(
    (targetThemeId, colorKey) => {
      setColorOverrides((prev) => {
        const userId = getLoggedInUserId();
        const themePatch = { ...(prev[targetThemeId] || {}) };
        delete themePatch[colorKey];
        const next = { ...prev };
        if (Object.keys(themePatch).length === 0) {
          delete next[targetThemeId];
        } else {
          next[targetThemeId] = themePatch;
        }
        writeStoredUiThemeColorOverrides(userId, next);
        if (targetThemeId === themeId) {
          applyUiThemeToDocument(targetThemeId, next);
        }
        return next;
      });
    },
    [themeId]
  );

  const value = useMemo(
    () => ({
      themeId,
      theme: getUiTheme(themeId, colorOverrides[themeId] || {}),
      colorOverrides,
      setThemeId,
      getThemeColors,
      setThemeColor,
      clearThemeColor,
    }),
    [themeId, colorOverrides, setThemeId, getThemeColors, setThemeColor, clearThemeColor]
  );

  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme() {
  const ctx = useContext(UiThemeContext);
  if (!ctx) {
    throw new Error("useUiTheme must be used within UiThemeProvider");
  }
  return ctx;
}
