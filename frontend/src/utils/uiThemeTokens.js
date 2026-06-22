/** Use in inline styles — values track the active UI theme via CSS variables. */
export const UI = {
  pageBg: "var(--sgf-page-bg)",
  pageText: "var(--sgf-page-text)",
  textPrimary: "var(--sgf-text-primary)",
  panelBg: "var(--sgf-panel-bg)",
  cardBg: "var(--sgf-card-bg)",
  /** Text - Dark (same as textPrimary) */
  textMuted: "var(--sgf-text-primary)",
  /** Text - Dark (same as textPrimary) */
  textSecondary: "var(--sgf-text-primary)",
  inputBg: "var(--sgf-input-bg)",
  outline: "var(--sgf-outline)",
  buttonPrimary: "var(--sgf-button-primary)",
  buttonPrimaryText: "var(--sgf-page-text)",
};

/** App text colours — only Text - Light and Text - Dark from the colour theme. */
export const TEXT = {
  light: "var(--sgf-page-text)",
  dark: "var(--sgf-text-primary)",
};

/** Main sidebar menu group colours (Hot List, Design Phase, Managers, Maps, etc.). */
export const MENU = {
  blue: "var(--sgf-menu-blue)",
  blueActive: "var(--sgf-menu-blue-active)",
  green: "var(--sgf-menu-green)",
  greenActive: "var(--sgf-menu-green-active)",
  red: "var(--sgf-menu-red)",
  purple: "var(--sgf-menu-purple)",
  purpleLight: "var(--sgf-menu-purple-light)",
  groupBorder: "var(--sgf-outline)",
  activeText: "var(--sgf-page-text)",
};

/** ON HOLD / CANCELLED diagonal banners on project cards. */
export const BANNER = {
  onHold: "var(--sgf-on-hold-banner)",
  onHoldText: "var(--sgf-page-text)",
  cancelled: "var(--sgf-cancelled-banner)",
  cancelledText: "var(--sgf-page-text)",
};

/** Project grid folder rectangles (suburb / street cards). */
export const PROJECT_CARD = {
  bg: "var(--sgf-project-card-bg)",
  text: "var(--sgf-page-text)",
};

/** VIC / QLD / green stream colours (sales pages, folder badges, hot list). */
export const STREAM = {
  vicBlue: "var(--sgf-vic-blue)",
  vicBlueLight: "var(--sgf-vic-blue-light)",
  qldRed: "var(--sgf-qld-red)",
  qldRedLight: "var(--sgf-qld-red-light)",
  streamGreen: "var(--sgf-stream-green)",
  streamGreenLight: "var(--sgf-stream-green-light)",
};

/** Status traffic lights (manager grids, overview-style indicators). */
export const INDICATOR = {
  orange: "var(--sgf-indicator-orange-light)",
  orangeLight: "var(--sgf-indicator-orange-light)",
  orangeDark: "var(--sgf-indicator-orange-dark)",
  green: "var(--sgf-stream-green)",
  red: "var(--sgf-qld-red)",
};

/** Standard 1px outline border — matches form fields; use on menus, buttons, and filter chips. */
export const outlineBorder = `1px solid ${UI.outline}`;

/** Alias for form controls (Project Info, Client Info, etc.). */
export const fieldOutlineBorder = outlineBorder;
