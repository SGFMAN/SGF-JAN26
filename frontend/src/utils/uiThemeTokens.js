/** Use in inline styles — values track the active UI theme via CSS variables. */
export const UI = {
  pageBg: "var(--sgf-page-bg)",
  pageText: "var(--sgf-page-text)",
  textPrimary: "var(--sgf-text-primary)",
  panelBg: "var(--sgf-panel-bg)",
  cardBg: "var(--sgf-card-bg)",
  textMuted: "var(--sgf-text-muted)",
  textSecondary: "var(--sgf-text-secondary)",
  inputBg: "var(--sgf-input-bg)",
  border: "var(--sgf-border)",
  outline: "var(--sgf-outline)",
  buttonPrimary: "var(--sgf-button-primary)",
  buttonPrimaryText: "var(--sgf-button-primary-text)",
};

/** Main sidebar menu group colours (Hot List, Design Phase, Managers, Maps, etc.). */
export const MENU = {
  blue: "var(--sgf-menu-blue)",
  blueActive: "var(--sgf-menu-blue-active)",
  green: "var(--sgf-menu-green)",
  greenActive: "var(--sgf-menu-green-active)",
  red: "var(--sgf-menu-red)",
  purple: "var(--sgf-menu-purple)",
  groupBorder: "var(--sgf-outline)",
  activeText: "var(--sgf-menu-active-text)",
};

/** ON HOLD / CANCELLED diagonal banners on project cards. */
export const BANNER = {
  onHold: "var(--sgf-on-hold-banner)",
  onHoldText: "var(--sgf-on-hold-banner-text)",
  cancelled: "var(--sgf-cancelled-banner)",
  cancelledText: "var(--sgf-cancelled-banner-text)",
};

/** Project grid folder rectangles (suburb / street cards). */
export const PROJECT_CARD = {
  bg: "var(--sgf-project-card-bg)",
  text: "var(--sgf-project-card-text)",
};

/** Standard 2px outline border for menus, folders, and filter chips. */
export const outlineBorder = `2px solid var(--sgf-outline)`;
