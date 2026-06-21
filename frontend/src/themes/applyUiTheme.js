import { getLoggedInUserId } from "../utils/auth";
import {
  getCachedUserThemeId,
  getGlobalColorOverrides,
} from "../utils/uiThemeSettings.js";
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
  menuPurpleLight: "--sgf-menu-purple-light",
  menuGroupBorder: "--sgf-outline",
  menuActiveText: "--sgf-menu-active-text",
  onHoldBanner: "--sgf-on-hold-banner",
  onHoldBannerText: "--sgf-on-hold-banner-text",
  cancelledBanner: "--sgf-cancelled-banner",
  cancelledBannerText: "--sgf-cancelled-banner-text",
  projectCardBackground: "--sgf-project-card-bg",
  projectCardText: "--sgf-project-card-text",
  vicBlue: "--sgf-vic-blue",
  vicBlueLight: "--sgf-vic-blue-light",
  qldRed: "--sgf-qld-red",
  qldRedLight: "--sgf-qld-red-light",
  streamGreen: "--sgf-stream-green",
  streamGreenLight: "--sgf-stream-green-light",
  indicatorOrangeDark: "--sgf-indicator-orange-dark",
  indicatorOrangeLight: "--sgf-indicator-orange-light",
};

export function applyUiThemeToDocument(themeId = DEFAULT_UI_THEME_ID, allColorOverrides) {
  if (typeof document === "undefined") return;

  const resolvedOverrides = allColorOverrides ?? getGlobalColorOverrides();
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

/** @deprecated Use getCachedUserThemeId() after ensureUiThemeSettingsLoaded(). */
export function readStoredUiThemeId(userId) {
  if (userId && userId === getLoggedInUserId()) {
    return getCachedUserThemeId();
  }
  return DEFAULT_UI_THEME_ID;
}

/** @deprecated Theme is saved via saveUserThemeId(). */
export function writeStoredUiThemeId(_userId, _themeId) {
  // no-op — persisted to database
}

/** @deprecated Use getGlobalColorOverrides() after ensureUiThemeSettingsLoaded(). */
export function readStoredUiThemeColorOverrides(_userId) {
  return getGlobalColorOverrides();
}

/** @deprecated Palette colours are global and saved via saveGlobalColorOverrides(). */
export function writeStoredUiThemeColorOverrides(_userId, _overrides) {
  // no-op — persisted to database
}

export function getThemeBannerColors(themeId = DEFAULT_UI_THEME_ID, _userId) {
  const allOverrides = getGlobalColorOverrides();
  const { colors } = getUiTheme(themeId, allOverrides?.[themeId] || {});
  return {
    onHold: colors.onHoldBanner,
    onHoldText: colors.onHoldBannerText,
    cancelled: colors.cancelledBanner,
    cancelledText: colors.cancelledBannerText,
  };
}
