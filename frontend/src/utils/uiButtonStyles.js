import { getLoggedInUserId } from "./auth.js";
import {
  readStoredUiThemeColorOverrides,
  readStoredUiThemeId,
} from "../themes/applyUiTheme.js";
import { UI_THEME_COLOR_KEYS, getUiTheme } from "../themes/uiThemes.js";

const STORAGE_KEY = "sgfUiButtonStyles";

export const UI_BUTTON_FONT_SIZE_OPTIONS = [
  { value: "0.75rem", label: "0.75rem" },
  { value: "0.8rem", label: "0.8rem" },
  { value: "0.85rem", label: "0.85rem" },
  { value: "0.9rem", label: "0.9rem" },
  { value: "0.95rem", label: "0.95rem" },
  { value: "1rem", label: "1rem" },
  { value: "1.05rem", label: "1.05rem" },
];

const FONT_SIZE_SET = new Set(UI_BUTTON_FONT_SIZE_OPTIONS.map(({ value }) => value));

export const UI_BUTTON_COLOR_FIELDS = [
  { key: "colorSelected", label: "Colour — selected" },
  { key: "outlineSelected", label: "Outline — selected" },
  { key: "textSelected", label: "Text — selected" },
  { key: "colorUnselected", label: "Colour — unselected" },
  { key: "outlineUnselected", label: "Outline — unselected" },
  { key: "textUnselected", label: "Text — unselected" },
];

const PALETTE_KEY_SET = new Set(UI_THEME_COLOR_KEYS.map(({ key }) => key));

export const EMPTY_BUTTON_STYLE = {
  width: "120px",
  height: "48px",
  fontSize: "0.9rem",
  colorSelected: "indicatorOrangeLight",
  colorUnselected: "cardBackground",
  outlineSelected: "indicatorOrangeDark",
  outlineUnselected: "outline",
  textSelected: "textPrimary",
  textUnselected: "textPrimary",
};

export function getActiveThemeColors() {
  const userId = getLoggedInUserId();
  const themeId = readStoredUiThemeId(userId);
  const overrides = readStoredUiThemeColorOverrides(userId);
  return getUiTheme(themeId, overrides?.[themeId] || {}).colors;
}

export function getPaletteColorLabel(paletteKey) {
  return UI_THEME_COLOR_KEYS.find(({ key }) => key === paletteKey)?.label ?? paletteKey;
}

export function isPaletteColorKey(value) {
  return PALETTE_KEY_SET.has(String(value || "").trim());
}

function normalizeHex(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeToPaletteKey(value, colors = getActiveThemeColors(), fallback = "textPrimary") {
  const key = String(value || "").trim();
  if (isPaletteColorKey(key)) return key;

  const normalized = normalizeHex(key);
  for (const { key: paletteKey } of UI_THEME_COLOR_KEYS) {
    if (normalizeHex(colors[paletteKey]) === normalized) {
      return paletteKey;
    }
  }

  return isPaletteColorKey(fallback) ? fallback : "textPrimary";
}

export function normalizeFontSize(value) {
  const v = String(value || "").trim();
  if (FONT_SIZE_SET.has(v)) return v;
  return EMPTY_BUTTON_STYLE.fontSize;
}

function normalizeButtonColors(style, colors = getActiveThemeColors()) {
  const normalized = { ...style };
  for (const { key } of UI_BUTTON_COLOR_FIELDS) {
    normalized[key] = normalizeToPaletteKey(style[key], colors, EMPTY_BUTTON_STYLE[key]);
  }
  return normalized;
}

function normalizeButtonStyle(style, colors = getActiveThemeColors()) {
  const normalized = normalizeButtonColors(style, colors);
  normalized.fontSize = normalizeFontSize(style?.fontSize);
  normalized.width = String(style?.width || "").trim() || EMPTY_BUTTON_STYLE.width;
  normalized.height = String(style?.height || "").trim() || EMPTY_BUTTON_STYLE.height;
  return normalized;
}

function normalizeStore(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { nextId: 1, buttons: {} };
  }
  const buttons = parsed.buttons && typeof parsed.buttons === "object" ? parsed.buttons : {};
  const ids = Object.values(buttons)
    .map((b) => Number(b?.id))
    .filter((n) => Number.isFinite(n));
  const maxId = ids.length ? Math.max(...ids) : 0;
  const nextId = Math.max(Number(parsed.nextId) || 1, maxId + 1);
  return { nextId, buttons };
}

export function readUiButtonStylesStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nextId: 1, buttons: {} };
    return normalizeStore(JSON.parse(raw));
  } catch {
    return { nextId: 1, buttons: {} };
  }
}

export function writeUiButtonStylesStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sgf-ui-button-styles-change"));
    }
  } catch {
    // ignore
  }
}

export function listUiButtonStyles() {
  const { buttons } = readUiButtonStylesStore();
  return Object.values(buttons)
    .filter(Boolean)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

export function getUiButtonStyle(id) {
  if (id == null || id === "") return null;
  const { buttons } = readUiButtonStylesStore();
  const style = buttons[String(id)] ?? null;
  return style ? normalizeButtonStyle(style) : null;
}

export function resolvePaletteColor(value, colors = getActiveThemeColors()) {
  const key = normalizeToPaletteKey(value, colors);
  return colors[key] ?? colors.textPrimary ?? "#323233";
}

export function saveUiButtonStyle(style) {
  const store = readUiButtonStylesStore();
  let id = style?.id != null && style.id !== "" ? Number(style.id) : null;

  if (!Number.isFinite(id)) {
    id = store.nextId;
    store.nextId = id + 1;
  } else if (id >= store.nextId) {
    store.nextId = id + 1;
  }

  const normalized = normalizeButtonStyle(style);
  const record = {
    id,
    width: normalized.width,
    height: normalized.height,
    fontSize: normalized.fontSize,
    colorSelected: normalized.colorSelected,
    colorUnselected: normalized.colorUnselected,
    outlineSelected: normalized.outlineSelected,
    outlineUnselected: normalized.outlineUnselected,
    textSelected: normalized.textSelected,
    textUnselected: normalized.textUnselected,
  };

  store.buttons[String(id)] = record;
  writeUiButtonStylesStore(store);
  return record;
}

export function deleteUiButtonStyle(id) {
  const store = readUiButtonStylesStore();
  delete store.buttons[String(id)];
  writeUiButtonStylesStore(store);
}

export function getSavedButtonSelectedBackground(buttonId, fallback, colors = getActiveThemeColors()) {
  const style = getUiButtonStyle(buttonId);
  if (!style) return fallback;
  return resolvePaletteColor(style.colorSelected, colors);
}

/** Overview status tiles: red=2, orange=4, green=5 (selected button colours). */
export function getOverviewIndicatorStyle(variant, fallbacks, colors = getActiveThemeColors()) {
  const buttonId = { red: 2, orange: 4, green: 5 }[variant];
  const saved = buildSavedButtonStyle(buttonId, true, colors);
  if (saved) {
    return {
      background: saved.background,
      color: saved.color,
      border: saved.border,
    };
  }
  return {
    background: fallbacks[variant],
    color: fallbacks.text ?? colors.pageText ?? "#323233",
    border: "none",
  };
}

/** Delete Project, Clear Drawing Data, and other destructive admin actions. */
export const UI_DESTRUCTIVE_BUTTON_ID = 6;

export function mergeDestructiveButtonStyle(fallback, selected = true) {
  const saved = buildSavedButtonStyle(UI_DESTRUCTIVE_BUTTON_ID, selected);
  return saved ? { ...saved, lineHeight: "1.2" } : { ...fallback };
}

export function destructiveButtonUsesSavedStyle(selected = true) {
  return Boolean(buildSavedButtonStyle(UI_DESTRUCTIVE_BUTTON_ID, selected));
}

export function buildButtonInlineStyle(style, selected, colors = getActiveThemeColors()) {
  if (!style) return {};
  const resolved = normalizeButtonStyle(style, colors);
  return {
    width: resolved.width,
    height: resolved.height,
    boxSizing: "border-box",
    background: selected
      ? resolvePaletteColor(resolved.colorSelected, colors)
      : resolvePaletteColor(resolved.colorUnselected, colors),
    border: `1px solid ${
      selected
        ? resolvePaletteColor(resolved.outlineSelected, colors)
        : resolvePaletteColor(resolved.outlineUnselected, colors)
    }`,
    color: selected
      ? resolvePaletteColor(resolved.textSelected, colors)
      : resolvePaletteColor(resolved.textUnselected, colors),
    borderRadius: "8px",
    fontSize: resolved.fontSize,
    fontWeight: 500,
    cursor: "pointer",
    padding: "0 12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  };
}

export function buildSavedButtonStyle(buttonId, selected, colors = getActiveThemeColors()) {
  const style = getUiButtonStyle(buttonId);
  if (!style) return null;
  return buildButtonInlineStyle(style, selected, colors);
}
