import React, { useEffect, useRef, useState } from "react";
import { useUiTheme } from "../context/UiThemeProvider.jsx";
import { UI, MENU } from "../utils/uiThemeTokens.js";
import { UI_THEME_COLOR_KEYS, UI_THEME_LIST, UI_THEMES } from "../themes/uiThemes.js";

const MONUMENT = UI.textPrimary;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;

function hexColorInputValue(color) {
  if (typeof color !== "string") return "#000000";
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const match = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const hex = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
    return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
  }
  return "#000000";
}

function ThemeColorSwatchGrid({ colors, highlightKey, onSwatchClick, compact }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: compact ? "6px" : "8px",
      }}
    >
      {UI_THEME_COLOR_KEYS.map(({ key, label }) => (
        <div key={key}>
          <button
            type="button"
            title={label}
            onClick={() => onSwatchClick?.(key, label)}
            style={{
              width: "100%",
              height: compact ? "24px" : "28px",
              padding: 0,
              borderRadius: "6px",
              background: colors[key],
              border:
                highlightKey === key ? `2px solid ${UI.textPrimary}` : `1px solid ${UI.border}`,
              marginBottom: "4px",
              cursor: onSwatchClick ? "pointer" : "default",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontSize: compact ? "0.65rem" : "0.7rem", color: UI.textMuted }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function PaletteColorEditor({ editing, onBack, onEditColor }) {
  const { themeId: activeThemeId, getThemeColors, setThemeColor, clearThemeColor, colorOverrides } =
    useUiTheme();
  const themeMeta = UI_THEMES[editing.themeId] || UI_THEMES.classic;
  const [draftValue, setDraftValue] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const skipNextSave = useRef(true);
  const hasStoredOverride = Boolean(colorOverrides[editing.themeId]?.[editing.colorKey]);
  const defaultValue = themeMeta.colors[editing.colorKey];

  useEffect(() => {
    skipNextSave.current = true;
    const current = getThemeColors(editing.themeId)[editing.colorKey];
    setDraftValue(current ?? defaultValue ?? "");
    setSaveStatus("");
    const timer = window.setTimeout(() => {
      skipNextSave.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editing.themeId, editing.colorKey, getThemeColors, defaultValue]);

  useEffect(() => {
    if (skipNextSave.current || !draftValue.trim()) return;
    setSaveStatus("Saving…");
    const timer = window.setTimeout(async () => {
      try {
        await setThemeColor(editing.themeId, editing.colorKey, draftValue.trim());
        setSaveStatus("Saved");
        window.setTimeout(() => setSaveStatus(""), 1500);
      } catch {
        setSaveStatus("Save failed");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draftValue, editing.themeId, editing.colorKey, setThemeColor]);

  const previewColors = getThemeColors(editing.themeId, { [editing.colorKey]: draftValue.trim() });

  async function handleReset() {
    try {
      await clearThemeColor(editing.themeId, editing.colorKey);
      setDraftValue(defaultValue ?? "");
      setSaveStatus("Reset");
      window.setTimeout(() => setSaveStatus(""), 1500);
    } catch {
      setSaveStatus("Reset failed");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: UI.textSecondary,
          cursor: "pointer",
          padding: "0 0 12px 0",
          fontSize: "0.9rem",
          fontWeight: 500,
        }}
      >
        ← Back to palettes
      </button>
      <h3 style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: 600, color: MONUMENT }}>
        {themeMeta.name} — {editing.label}
      </h3>
      <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.45 }}>
        Changes apply for all users. {activeThemeId === editing.themeId ? "Live preview is active." : ""}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "flex-start",
          marginBottom: "20px",
          padding: "16px",
          background: UI.cardBg,
          borderRadius: "12px",
          border: FIELD_OUTLINE,
        }}
      >
        <div>
          <label
            htmlFor="palette-color-picker"
            style={{ display: "block", fontSize: "0.85rem", color: UI.textMuted, marginBottom: "8px", fontWeight: 500 }}
          >
            Colour picker
          </label>
          <input
            id="palette-color-picker"
            type="color"
            value={hexColorInputValue(draftValue)}
            onChange={(e) => setDraftValue(e.target.value)}
            style={{
              width: "72px",
              height: "48px",
              padding: 0,
              border: FIELD_OUTLINE,
              borderRadius: "8px",
              cursor: "pointer",
              background: "transparent",
            }}
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
          <label
            htmlFor="palette-color-value"
            style={{ display: "block", fontSize: "0.85rem", color: UI.textMuted, marginBottom: "8px", fontWeight: 500 }}
          >
            Value (hex or rgba)
          </label>
          <input
            id="palette-color-value"
            type="text"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: FIELD_OUTLINE,
              fontSize: "0.95rem",
              color: MONUMENT,
              background: UI.inputBg,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
            {hasStoredOverride ? (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: "transparent",
                  border: FIELD_OUTLINE,
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  color: UI.textSecondary,
                  cursor: "pointer",
                }}
              >
                Reset to default
              </button>
            ) : null}
            {saveStatus ? (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: saveStatus === "Saved" || saveStatus === "Reset" ? "#2e7d32" : UI.textMuted,
                }}
              >
                {saveStatus}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <ThemeColorSwatchGrid
        colors={previewColors}
        highlightKey={editing.colorKey}
        onSwatchClick={(key, label) => onEditColor(key, label)}
      />
    </>
  );
}

export default function UIPaletteSettingsModal({ isOpen, onClose }) {
  const { getThemeColors } = useUiTheme();
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!isOpen) setEditing(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10006,
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-palette-settings-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.cardBg,
          borderRadius: "16px",
          padding: "28px 32px",
          maxWidth: "920px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 id="ui-palette-settings-title" style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600, color: MONUMENT }}>
            Palette Colours
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: "1.5rem", cursor: "pointer", color: MONUMENT }}
          >
            ×
          </button>
        </div>

        {editing ? (
          <PaletteColorEditor
            editing={editing}
            onBack={() => setEditing(null)}
            onEditColor={(colorKey, label) => setEditing({ themeId: editing.themeId, colorKey, label })}
          />
        ) : (
          <>
            <p style={{ margin: "0 0 20px 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.45 }}>
              Customise palette colours for each theme. Saved to the server — all users see the same colours. Click a
              swatch to edit.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {UI_THEME_LIST.map((theme) => (
                <div
                  key={theme.id}
                  style={{
                    background: UI.inputBg,
                    border: FIELD_OUTLINE,
                    borderRadius: "12px",
                    padding: "16px",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ marginBottom: "8px", fontSize: "1.05rem", fontWeight: 600, color: MONUMENT }}>
                    {theme.name}
                  </div>
                  <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: UI.textMuted }}>{theme.description}</p>
                  <ThemeColorSwatchGrid
                    colors={getThemeColors(theme.id)}
                    onSwatchClick={(colorKey, label) => setEditing({ themeId: theme.id, colorKey, label })}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
