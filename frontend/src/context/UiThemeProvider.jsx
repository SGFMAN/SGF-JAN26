import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLoggedInUserId } from "../utils/auth";
import { applyUiThemeToDocument } from "../themes/applyUiTheme";
import { DEFAULT_UI_THEME_ID, getUiTheme } from "../themes/uiThemes";
import { ensureUiButtonStylesLoaded, resetUiButtonStylesCache } from "../utils/uiButtonStyles.js";
import {
  ensureUiThemeSettingsLoaded,
  getGlobalColorOverrides,
  resetUiThemeSettingsCache,
  saveGlobalColorOverrides,
  saveUserThemeId,
} from "../utils/uiThemeSettings.js";

const UiThemeContext = createContext(null);

export function UiThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(DEFAULT_UI_THEME_ID);
  const [colorOverrides, setColorOverrides] = useState({});

  useEffect(() => {
    async function loadAllSettings() {
      if (!getLoggedInUserId()) {
        resetUiButtonStylesCache();
        resetUiThemeSettingsCache();
        setThemeIdState(DEFAULT_UI_THEME_ID);
        setColorOverrides({});
        return;
      }

      const [{ themeId: loadedThemeId, colorOverrides: loadedOverrides }] = await Promise.all([
        ensureUiThemeSettingsLoaded({ force: true }),
        ensureUiButtonStylesLoaded({ force: true }),
      ]);

      setThemeIdState(loadedThemeId);
      setColorOverrides(loadedOverrides);
      applyUiThemeToDocument(loadedThemeId, loadedOverrides);
    }

    void loadAllSettings();

    function onAuthSessionChange() {
      void loadAllSettings();
    }

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
    window.addEventListener("sgf-auth-session-change", onAuthSessionChange);
    return () => {
      window.removeEventListener("sgf-ui-theme-change", onThemeChange);
      window.removeEventListener("sgf-auth-session-change", onAuthSessionChange);
    };
  }, []);

  const setThemeId = useCallback(
    async (nextThemeId) => {
      const theme = getUiTheme(nextThemeId);
      setThemeIdState(theme.id);
      applyUiThemeToDocument(theme.id, colorOverrides);
      try {
        await saveUserThemeId(theme.id);
      } catch (err) {
        console.error("Failed to save palette preference:", err);
      }
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
    async (targetThemeId, colorKey, value) => {
      const themePatch = { ...(colorOverrides[targetThemeId] || {}), [colorKey]: value };
      const next = { ...colorOverrides, [targetThemeId]: themePatch };
      setColorOverrides(next);
      if (targetThemeId === themeId) {
        applyUiThemeToDocument(targetThemeId, next);
      }
      try {
        await saveGlobalColorOverrides(next);
      } catch (err) {
        console.error("Failed to save palette colour:", err);
        throw err;
      }
    },
    [colorOverrides, themeId]
  );

  const clearThemeColor = useCallback(
    async (targetThemeId, colorKey) => {
      const themePatch = { ...(colorOverrides[targetThemeId] || {}) };
      delete themePatch[colorKey];
      const next = { ...colorOverrides };
      if (Object.keys(themePatch).length === 0) {
        delete next[targetThemeId];
      } else {
        next[targetThemeId] = themePatch;
      }
      setColorOverrides(next);
      if (targetThemeId === themeId) {
        applyUiThemeToDocument(targetThemeId, next);
      }
      try {
        await saveGlobalColorOverrides(next);
      } catch (err) {
        console.error("Failed to reset palette colour:", err);
        throw err;
      }
    },
    [colorOverrides, themeId]
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

export { getGlobalColorOverrides };
