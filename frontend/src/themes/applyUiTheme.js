import { getLoggedInUserId } from "../utils/auth";
import { DEFAULT_UI_THEME_ID, getUiTheme } from "./uiThemes";

const CSS_VAR_MAP = {
  pageBackground: "--sgf-page-bg",
  pageText: "--sgf-page-text",
  textPrimary: "--sgf-text-primary",
  panelBackground: "--sgf-panel-bg",
  cardBackground: "--sgf-card-bg",
  textMuted: "--sgf-text-muted",
  textSecondary: "--sgf-text-secondary",
  inputBackground: "--sgf-input-bg",
  border: "--sgf-border",
  outline: "--sgf-outline",
  buttonPrimary: "--sgf-button-primary",
  buttonPrimaryText: "--sgf-button-primary-text",
  menuBlue: "--sgf-menu-blue",
  menuBlueActive: "--sgf-menu-blue-active",
  menuGreen: "--sgf-menu-green",
  menuGreenActive: "--sgf-menu-green-active",
  menuRed: "--sgf-menu-red",
  menuPurple: "--sgf-menu-purple",
  menuGroupBorder: "--sgf-outline",
  menuActiveText: "--sgf-menu-active-text",
  onHoldBanner: "--sgf-on-hold-banner",
  onHoldBannerText: "--sgf-on-hold-banner-text",
  cancelledBanner: "--sgf-cancelled-banner",
  cancelledBannerText: "--sgf-cancelled-banner-text",
  projectCardBackground: "--sgf-project-card-bg",
  projectCardText: "--sgf-project-card-text",
};

export function applyUiThemeToDocument(themeId = DEFAULT_UI_THEME_ID, allColorOverrides) {
  if (typeof document === "undefined") return;

  const resolvedOverrides = allColorOverrides ?? readStoredUiThemeColorOverrides();
  const themeOverrides = resolvedOverrides?.[themeId] || {};
  const theme = getUiTheme(themeId, themeOverrides);
  const root = document.documentElement;

  for (const [colorKey, cssVar] of Object.entries(CSS_VAR_MAP)) {
    root.style.setProperty(cssVar, theme.colors[colorKey]);
  }

  root.dataset.sgfUiTheme = theme.id;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("sgf-ui-theme-change", {
        detail: { themeId: theme.id, colorOverrides: resolvedOverrides },
      })
    );
  }
}

export function getUiThemeStorageKey(userId) {
  return `sgfUiTheme_${userId || "guest"}`;
}

export function readStoredUiThemeId(userId) {
  try {
    const stored = localStorage.getItem(getUiThemeStorageKey(userId));
    if (stored && getUiTheme(stored).id === stored) {
      return stored;
    }
  } catch {
    // ignore
  }
  return DEFAULT_UI_THEME_ID;
}

export function writeStoredUiThemeId(userId, themeId) {
  try {
    localStorage.setItem(getUiThemeStorageKey(userId), themeId);
  } catch {
    // ignore
  }
}

export function getUiThemeColorOverridesStorageKey(userId) {
  return `sgfUiThemeColors_${userId || "guest"}`;
}

export function readStoredUiThemeColorOverrides(userId) {
  try {
    const key = getUiThemeColorOverridesStorageKey(userId ?? getLoggedInUserId());
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStoredUiThemeColorOverrides(userId, overrides) {
  try {
    localStorage.setItem(getUiThemeColorOverridesStorageKey(userId), JSON.stringify(overrides));
  } catch {
    // ignore
  }
}

export function getThemeBannerColors(themeId = DEFAULT_UI_THEME_ID, userId) {
  const allOverrides = readStoredUiThemeColorOverrides(userId);
  const { colors } = getUiTheme(themeId, allOverrides?.[themeId] || {});
  return {
    onHold: colors.onHoldBanner,
    onHoldText: colors.onHoldBannerText,
    cancelled: colors.cancelledBanner,
    cancelledText: colors.cancelledBannerText,
  };
}
