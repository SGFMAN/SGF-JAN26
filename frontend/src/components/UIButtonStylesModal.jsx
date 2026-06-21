import React, { useEffect, useState } from "react";
import {
  EMPTY_BUTTON_STYLE,
  UI_BUTTON_COLOR_FIELDS,
  UI_BUTTON_FONT_SIZE_OPTIONS,
  buildButtonInlineStyle,
  deleteUiButtonStyle,
  getPaletteColorLabel,
  listUiButtonStyles,
  normalizeFontSize,
  normalizeToPaletteKey,
  resolvePaletteColor,
  saveUiButtonStyle,
  ensureUiButtonStylesLoaded,
} from "../utils/uiButtonStyles.js";
import { useUiTheme } from "../context/UiThemeProvider.jsx";
import { UI_THEME_COLOR_KEYS } from "../themes/uiThemes.js";
import { UI, MENU } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const COLOR_TILE_HEIGHT = 52;
const COLOR_SWATCH_WIDTH = COLOR_TILE_HEIGHT;

function FontSizePickerGrid({ selectedValue, onSelect, previewStyleBase }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {UI_BUTTON_FONT_SIZE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          style={{
            ...previewStyleBase,
            fontSize: value,
            width: "100%",
            border:
              selectedValue === value ? `2px solid ${UI.textPrimary}` : FIELD_OUTLINE,
            background: selectedValue === value ? UI.inputBg : WHITE,
          }}
        >
          Sample — {label}
        </button>
      ))}
    </div>
  );
}

function PaletteSwatchGrid({ colors, selectedKey, onSelect }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: "8px",
      }}
    >
      {UI_THEME_COLOR_KEYS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          title={label}
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <div
            style={{
              height: "28px",
              borderRadius: "6px",
              background: colors[key],
              border:
                selectedKey === key ? `2px solid ${UI.textPrimary}` : `1px solid ${UI.border}`,
              marginBottom: "4px",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontSize: "0.65rem", color: UI.textMuted, lineHeight: 1.2, display: "block" }}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

function parseDimension(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(px|rem|em|%)?$/i);
  if (match) {
    return { num: parseFloat(match[1]), unit: (match[2] || "px").toLowerCase() };
  }
  const numOnly = parseFloat(trimmed.replace(/[^\d.]/g, ""));
  if (Number.isFinite(numOnly)) {
    return { num: numOnly, unit: "px" };
  }
  return { num: 0, unit: "px" };
}

function formatDimension(num, unit) {
  const safe = Math.max(1, Math.round(num));
  return `${safe}${unit}`;
}

function adjustDimension(value, delta) {
  const { num, unit } = parseDimension(value);
  return formatDimension(num + delta, unit);
}

function DimensionField({ label, value, onChange }) {
  const step = (delta) => onChange(adjustDimension(value, delta));

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", gap: "6px", alignItems: "stretch" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 120px"
          style={{ ...inputStyle, flex: 1, width: "auto" }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: FIELD_OUTLINE,
            borderRadius: "8px",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={`Increase ${label}`}
            style={stepperBtnStyle}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={`Decrease ${label}`}
            style={{ ...stepperBtnStyle, borderTop: FIELD_OUTLINE }}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UIButtonStylesModal({ isOpen, onClose }) {
  const { getThemeColors, themeId } = useUiTheme();
  const themeColors = getThemeColors(themeId);
  const [savedButtons, setSavedButtons] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_BUTTON_STYLE });
  const [colorPickerField, setColorPickerField] = useState(null);
  const [fontSizePickerOpen, setFontSizePickerOpen] = useState(false);

  const refreshList = () => {
    setSavedButtons(listUiButtonStyles());
  };

  useEffect(() => {
    if (isOpen) {
      void ensureUiButtonStylesLoaded().then(() => refreshList());
      setEditingId(null);
      setForm({ ...EMPTY_BUTTON_STYLE });
      setColorPickerField(null);
      setFontSizePickerOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLoad = (button) => {
    setEditingId(button.id);
    const colors = getThemeColors(themeId);
    setForm({
      width: button.width,
      height: button.height,
      fontSize: normalizeFontSize(button.fontSize),
      colorSelected: normalizeToPaletteKey(button.colorSelected, colors, EMPTY_BUTTON_STYLE.colorSelected),
      colorUnselected: normalizeToPaletteKey(button.colorUnselected, colors, EMPTY_BUTTON_STYLE.colorUnselected),
      outlineSelected: normalizeToPaletteKey(button.outlineSelected, colors, EMPTY_BUTTON_STYLE.outlineSelected),
      outlineUnselected: normalizeToPaletteKey(button.outlineUnselected, colors, EMPTY_BUTTON_STYLE.outlineUnselected),
      textSelected: normalizeToPaletteKey(button.textSelected, colors, EMPTY_BUTTON_STYLE.textSelected),
      textUnselected: normalizeToPaletteKey(button.textUnselected, colors, EMPTY_BUTTON_STYLE.textUnselected),
    });
  };

  const handleNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_BUTTON_STYLE });
  };

  const handleSave = () => {
    const saved = saveUiButtonStyle(editingId != null ? { ...form, id: editingId } : form);
    setEditingId(saved.id);
    refreshList();
  };

  const handleDelete = () => {
    if (editingId == null) return;
    if (!window.confirm(`Delete Button ${editingId}?`)) return;
    deleteUiButtonStyle(editingId);
    handleNew();
    refreshList();
  };

  const previewStyleUnselected = buildButtonInlineStyle(
    { ...form, id: editingId ?? "preview" },
    false,
    themeColors
  );
  const previewStyleSelected = buildButtonInlineStyle(
    { ...form, id: editingId ?? "preview" },
    true,
    themeColors
  );

  const colorPickerMeta = UI_BUTTON_COLOR_FIELDS.find(({ key }) => key === colorPickerField);

  const fontSizePreviewBase = (() => {
    const base = buildButtonInlineStyle({ ...form, id: editingId ?? "preview" }, false, themeColors);
    const { fontSize: _omit, ...rest } = base;
    return rest;
  })();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        pointerEvents: "auto",
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          background: WHITE,
          borderRadius: "12px",
          padding: "24px",
          width: "min(960px, 94vw)",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          color: MONUMENT,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-button-styles-title"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 id="ui-button-styles-title" style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>
            Button Styles
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: MONUMENT,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "24px", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "10px" }}>Saved buttons</div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                maxHeight: "420px",
                overflowY: "auto",
                marginBottom: "12px",
              }}
            >
              {savedButtons.length === 0 ? (
                <div style={{ fontSize: "0.85rem", color: UI.textMuted, fontStyle: "italic" }}>No buttons saved yet</div>
              ) : (
                savedButtons.map((button) => (
                  <button
                    key={button.id}
                    type="button"
                    onClick={() => handleLoad(button)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: editingId === button.id ? `1px solid ${UI.textPrimary}` : FIELD_OUTLINE,
                      background: editingId === button.id ? UI.inputBg : WHITE,
                      color: MONUMENT,
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      fontWeight: editingId === button.id ? 600 : 500,
                    }}
                  >
                    Button {button.id}
                  </button>
                ))
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button type="button" onClick={handleNew} style={actionBtnStyle(MENU.purple, MENU.activeText)}>
                New button
              </button>
              <button type="button" onClick={handleSave} style={actionBtnStyle(MENU.greenActive, MENU.activeText)}>
                Save
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={editingId == null}
                style={{
                  ...actionBtnStyle("#cc3333", WHITE),
                  opacity: editingId == null ? 0.5 : 1,
                  cursor: editingId == null ? "not-allowed" : "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: UI.textMuted }}>
              {editingId != null ? `Editing Button ${editingId}` : "New button (next number assigned on save)"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <DimensionField label="Width" value={form.width} onChange={(v) => handleField("width", v)} />
              <DimensionField label="Height" value={form.height} onChange={(v) => handleField("height", v)} />
            </div>

            <div
              style={{
                border: FIELD_OUTLINE,
                borderRadius: "10px",
                padding: "14px",
                background: UI.inputBg,
              }}
            >
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "10px" }}>
                Attributes
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "8px",
                }}
              >
                {UI_BUTTON_COLOR_FIELDS.map(({ key, label }) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "stretch",
                      gap: 0,
                      borderRadius: "8px",
                      border: FIELD_OUTLINE,
                      background: WHITE,
                      minWidth: 0,
                      overflow: "hidden",
                      minHeight: `${COLOR_TILE_HEIGHT}px`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setColorPickerField(key)}
                      title={`Choose ${label}`}
                      aria-label={`Choose ${label}`}
                      style={{
                        width: `${COLOR_SWATCH_WIDTH}px`,
                        minWidth: `${COLOR_SWATCH_WIDTH}px`,
                        alignSelf: "stretch",
                        flexShrink: 0,
                        borderRadius: 0,
                        background: resolvePaletteColor(form[key], themeColors),
                        border: "none",
                        borderRight: FIELD_OUTLINE,
                        boxSizing: "border-box",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "flex-end",
                        padding: "6px 8px",
                        textAlign: "right",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          color: MONUMENT,
                          lineHeight: 1.25,
                          width: "100%",
                          textAlign: "right",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: "0.65rem",
                          color: UI.textMuted,
                          lineHeight: 1.2,
                          marginTop: "2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          width: "100%",
                          textAlign: "right",
                        }}
                        title={getPaletteColorLabel(form[key])}
                      >
                        {getPaletteColorLabel(form[key])}
                      </div>
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "stretch",
                    gap: 0,
                    borderRadius: "8px",
                    border: FIELD_OUTLINE,
                    background: WHITE,
                    minWidth: 0,
                    overflow: "hidden",
                    minHeight: `${COLOR_TILE_HEIGHT}px`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setFontSizePickerOpen(true)}
                    title="Choose font size"
                    aria-label="Choose font size"
                    style={{
                      width: `${COLOR_SWATCH_WIDTH}px`,
                      minWidth: `${COLOR_SWATCH_WIDTH}px`,
                      alignSelf: "stretch",
                      flexShrink: 0,
                      borderRadius: 0,
                      background: UI.inputBg,
                      border: "none",
                      borderRight: FIELD_OUTLINE,
                      boxSizing: "border-box",
                      cursor: "pointer",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: MONUMENT,
                      fontWeight: 600,
                      fontSize: form.fontSize,
                      lineHeight: 1,
                    }}
                  >
                    Aa
                  </button>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "flex-end",
                      padding: "6px 8px",
                      textAlign: "right",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 500,
                        color: MONUMENT,
                        lineHeight: 1.25,
                        width: "100%",
                        textAlign: "right",
                      }}
                    >
                      Font size
                    </div>
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: UI.textMuted,
                        lineHeight: 1.2,
                        marginTop: "2px",
                        width: "100%",
                        textAlign: "right",
                      }}
                    >
                      {form.fontSize}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                border: FIELD_OUTLINE,
                borderRadius: "10px",
                padding: "16px",
                background: UI.inputBg,
              }}
            >
              <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "12px" }}>Preview</div>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: UI.textMuted, marginBottom: "6px" }}>Unselected</div>
                  <button type="button" style={previewStyleUnselected}>
                    Sample
                  </button>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: UI.textMuted, marginBottom: "6px" }}>Selected</div>
                  <button type="button" style={previewStyleSelected}>
                    Sample
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {colorPickerField && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2100,
            }}
            onClick={() => setColorPickerField(null)}
            role="presentation"
          >
            <div
              style={{
                background: WHITE,
                borderRadius: "12px",
                padding: "20px",
                width: "min(520px, 90vw)",
                maxHeight: "80vh",
                overflow: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="palette-picker-title"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 id="palette-picker-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: MONUMENT }}>
                  {colorPickerMeta?.label}
                </h3>
                <button
                  type="button"
                  onClick={() => setColorPickerField(null)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "1.35rem",
                    cursor: "pointer",
                    color: MONUMENT,
                    lineHeight: 1,
                  }}
                  aria-label="Close colour picker"
                >
                  ×
                </button>
              </div>
              <PaletteSwatchGrid
                colors={themeColors}
                selectedKey={form[colorPickerField]}
                onSelect={(paletteKey) => {
                  handleField(colorPickerField, paletteKey);
                  setColorPickerField(null);
                }}
              />
            </div>
          </div>
        )}

        {fontSizePickerOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0, 0, 0, 0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2100,
            }}
            onClick={() => setFontSizePickerOpen(false)}
            role="presentation"
          >
            <div
              style={{
                background: WHITE,
                borderRadius: "12px",
                padding: "20px",
                width: "min(420px, 90vw)",
                maxHeight: "80vh",
                overflow: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="font-size-picker-title"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 id="font-size-picker-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: MONUMENT }}>
                  Font size
                </h3>
                <button
                  type="button"
                  onClick={() => setFontSizePickerOpen(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "1.35rem",
                    cursor: "pointer",
                    color: MONUMENT,
                    lineHeight: 1,
                  }}
                  aria-label="Close font size picker"
                >
                  ×
                </button>
              </div>
              <FontSizePickerGrid
                selectedValue={form.fontSize}
                previewStyleBase={fontSizePreviewBase}
                onSelect={(value) => {
                  handleField("fontSize", value);
                  setFontSizePickerOpen(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "0.9rem",
  fontWeight: 500,
  color: MONUMENT,
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: FIELD_OUTLINE,
  borderRadius: "8px",
  fontSize: "0.9rem",
  boxSizing: "border-box",
  color: MONUMENT,
  background: WHITE,
};

function actionBtnStyle(bg, color) {
  return {
    background: bg,
    color,
    border: FIELD_OUTLINE,
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
  };
}

const stepperBtnStyle = {
  width: "32px",
  height: "20px",
  padding: 0,
  border: "none",
  background: WHITE,
  color: MONUMENT,
  fontSize: "0.65rem",
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
