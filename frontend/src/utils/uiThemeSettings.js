import { getApiHeaders, getLoggedInUserId, isUserAdmin } from "./auth.js";
import { DEFAULT_UI_THEME_ID, getUiTheme, UI_THEMES } from "../themes/uiThemes.js";

const API_URL = "";

const LEGACY_THEME_KEY_PREFIX = "sgfUiTheme_";
const LEGACY_OVERRIDES_KEY_PREFIX = "sgfUiThemeColors_";

let globalColorOverrides = null;
let cachedUserThemeId = null;
let loadPromise = null;

function isValidThemeId(themeId) {
  return Boolean(themeId && getUiTheme(themeId).id === themeId);
}

function normalizeColorOverrides(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const [themeId, patch] of Object.entries(parsed)) {
    if (!isValidThemeId(themeId)) continue;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) continue;
    const colors = {};
    for (const [key, value] of Object.entries(patch)) {
      const v = String(value ?? "").trim();
      if (v) colors[key] = v;
    }
    if (Object.keys(colors).length > 0) out[themeId] = colors;
  }
  return out;
}

function readLegacyThemeId(userId) {
  try {
    const stored = localStorage.getItem(`${LEGACY_THEME_KEY_PREFIX}${userId || "guest"}`);
    return isValidThemeId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readLegacyColorOverrides(userId) {
  try {
    const raw = localStorage.getItem(`${LEGACY_OVERRIDES_KEY_PREFIX}${userId ?? getLoggedInUserId()}`);
    if (!raw) return {};
    return normalizeColorOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

function clearLegacyThemeStorage(userId) {
  try {
    localStorage.removeItem(`${LEGACY_THEME_KEY_PREFIX}${userId || "guest"}`);
    localStorage.removeItem(`${LEGACY_OVERRIDES_KEY_PREFIX}${userId ?? getLoggedInUserId()}`);
  } catch {
    // ignore
  }
}

export function resetUiThemeSettingsCache() {
  globalColorOverrides = null;
  cachedUserThemeId = null;
  loadPromise = null;
}

export function getGlobalColorOverrides() {
  return globalColorOverrides ?? {};
}

export function getCachedUserThemeId() {
  return cachedUserThemeId ?? DEFAULT_UI_THEME_ID;
}

async function fetchGlobalColorOverrides() {
  const res = await fetch(`${API_URL}/api/ui-theme-colors`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`Failed to load theme colours (${res.status})`);
  const data = await res.json();
  return normalizeColorOverrides(data.overrides);
}

async function persistGlobalColorOverrides(overrides) {
  const res = await fetch(`${API_URL}/api/ui-theme-colors`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify({ overrides }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save theme colours (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  return normalizeColorOverrides(data.overrides ?? overrides);
}

async function fetchUserThemeId() {
  const res = await fetch(`${API_URL}/api/users/me/ui-preferences`, { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`Failed to load UI preferences (${res.status})`);
  const data = await res.json();
  const themeId = data.uiThemeId;
  return isValidThemeId(themeId) ? themeId : DEFAULT_UI_THEME_ID;
}

export async function saveUserThemeId(themeId) {
  const resolved = isValidThemeId(themeId) ? themeId : DEFAULT_UI_THEME_ID;
  const res = await fetch(`${API_URL}/api/users/me/ui-preferences`, {
    method: "PUT",
    headers: getApiHeaders(),
    body: JSON.stringify({ uiThemeId: resolved }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save palette preference (${res.status})`);
  }
  cachedUserThemeId = resolved;
  const userId = getLoggedInUserId();
  if (userId) clearLegacyThemeStorage(userId);
  return resolved;
}

export async function saveGlobalColorOverrides(overrides) {
  const normalized = normalizeColorOverrides(overrides);
  globalColorOverrides = await persistGlobalColorOverrides(normalized);
  const userId = getLoggedInUserId();
  if (userId) clearLegacyThemeStorage(userId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("sgf-ui-theme-change", {
        detail: { colorOverrides: globalColorOverrides },
      })
    );
  }
  return globalColorOverrides;
}

/** Load global palette colours and the current user's theme from the database. */
export async function ensureUiThemeSettingsLoaded({ force = false } = {}) {
  if (!getLoggedInUserId()) {
    return { themeId: DEFAULT_UI_THEME_ID, colorOverrides: {} };
  }
  if (force) resetUiThemeSettingsCache();
  if (globalColorOverrides != null && cachedUserThemeId != null && !force) {
    return { themeId: cachedUserThemeId, colorOverrides: globalColorOverrides };
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const userId = getLoggedInUserId();
    try {
      let overrides = await fetchGlobalColorOverrides();
      let themeId = await fetchUserThemeId();

      const legacyOverrides = readLegacyColorOverrides(userId);
      const legacyThemeId = readLegacyThemeId(userId);
      const serverOverridesEmpty = Object.keys(overrides).length === 0;
      const legacyOverridesHasData = Object.keys(legacyOverrides).length > 0;

      if (serverOverridesEmpty && legacyOverridesHasData) {
        const admin = await isUserAdmin();
        if (admin) {
          try {
            overrides = await persistGlobalColorOverrides(legacyOverrides);
          } catch (err) {
            console.warn("Could not migrate local theme colours to server:", err);
            overrides = legacyOverrides;
          }
        }
      } else if (!serverOverridesEmpty) {
        clearLegacyThemeStorage(userId);
      }

      if ((!themeId || themeId === DEFAULT_UI_THEME_ID) && legacyThemeId && legacyThemeId !== DEFAULT_UI_THEME_ID) {
        try {
          themeId = await saveUserThemeId(legacyThemeId);
        } catch {
          themeId = legacyThemeId;
        }
      }

      globalColorOverrides = overrides;
      cachedUserThemeId = themeId;
      return { themeId, colorOverrides: overrides };
    } catch (err) {
      console.warn("Failed to load UI theme settings from server:", err);
      globalColorOverrides = readLegacyColorOverrides(userId);
      cachedUserThemeId = readLegacyThemeId(userId) ?? DEFAULT_UI_THEME_ID;
      return { themeId: cachedUserThemeId, colorOverrides: globalColorOverrides };
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function getThemeDisplayName(themeId) {
  return UI_THEMES[themeId]?.name ?? UI_THEMES.classic.name;
}
