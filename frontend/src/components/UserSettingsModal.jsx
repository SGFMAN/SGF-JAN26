import React, { useEffect, useRef, useState } from "react";
import { getLoggedInUserId } from "../utils/auth";
import { useUiTheme } from "../context/UiThemeProvider";
import { UI } from "../utils/uiThemeTokens";
import { applyUiThemeToDocument } from "../themes/applyUiTheme";
import { UI_THEME_COLOR_KEYS, UI_THEME_LIST, UI_THEMES } from "../themes/uiThemes";

const AUTO_SAVE_DELAY_MS = 600;
const THEME_COLOR_SAVE_DELAY_MS = 400;

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

function ThemeColorSwatchGrid({ colors, highlightKey, onSwatchContextMenu, compact }) {
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
          <div
            role="button"
            tabIndex={0}
            title={`${label} — right-click to edit`}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSwatchContextMenu?.(key, label);
            }}
            style={{
              height: compact ? "24px" : "28px",
              borderRadius: "6px",
              background: colors[key],
              border:
                highlightKey === key
                  ? `2px solid ${UI.textPrimary}`
                  : `1px solid ${UI.border}`,
              marginBottom: "4px",
              cursor: onSwatchContextMenu ? "context-menu" : "default",
              boxSizing: "border-box",
            }}
          />
          <span style={{ fontSize: compact ? "0.65rem" : "0.7rem", color: UI.textMuted }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ColourThemeEditor({ editing, onBack, onEditColor }) {
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
    const timer = window.setTimeout(() => {
      setThemeColor(editing.themeId, editing.colorKey, draftValue.trim());
      setSaveStatus("Saved");
      window.setTimeout(() => setSaveStatus(""), 1500);
    }, THEME_COLOR_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draftValue, editing.themeId, editing.colorKey, setThemeColor]);

  useEffect(() => {
    if (skipNextSave.current || !draftValue.trim()) return;
    if (activeThemeId !== editing.themeId) return;
    const previewOverrides = {
      ...colorOverrides,
      [editing.themeId]: {
        ...(colorOverrides[editing.themeId] || {}),
        [editing.colorKey]: draftValue.trim(),
      },
    };
    applyUiThemeToDocument(editing.themeId, previewOverrides);
  }, [draftValue, activeThemeId, editing.themeId, editing.colorKey, colorOverrides]);

  const previewColors = getThemeColors(editing.themeId, { [editing.colorKey]: draftValue.trim() });

  function handlePickerChange(hex) {
    setDraftValue(hex);
  }

  function handleReset() {
    clearThemeColor(editing.themeId, editing.colorKey);
    setDraftValue(defaultValue ?? "");
    setSaveStatus("Reset");
    window.setTimeout(() => setSaveStatus(""), 1500);
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
        ← Back to themes
      </button>
      <h3
        style={{
          margin: "0 0 4px 0",
          fontSize: "1.2rem",
          fontWeight: 600,
          color: UI.textPrimary,
        }}
      >
        {themeMeta.name} — {editing.label}
      </h3>
      <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.45 }}>
        {activeThemeId === editing.themeId
          ? "Live preview updates across the app."
          : "Select this theme to preview changes app-wide."}
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
          border: `1px solid ${UI.border}`,
        }}
      >
        <div>
          <label
            htmlFor="theme-color-picker"
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: UI.textMuted,
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            Colour picker
          </label>
          <input
            id="theme-color-picker"
            type="color"
            value={hexColorInputValue(draftValue)}
            onChange={(e) => handlePickerChange(e.target.value)}
            style={{
              width: "72px",
              height: "48px",
              padding: 0,
              border: `1px solid ${UI.border}`,
              borderRadius: "8px",
              cursor: "pointer",
              background: "transparent",
            }}
          />
        </div>
        <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
          <label
            htmlFor="theme-color-value"
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: UI.textMuted,
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            Value (hex or rgba)
          </label>
          <input
            id="theme-color-value"
            type="text"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${UI.border}`,
              fontSize: "0.95rem",
              color: UI.textPrimary,
              background: UI.inputBg,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "10px",
              flexWrap: "wrap",
            }}
          >
            {hasStoredOverride ? (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  background: "transparent",
                  border: `1px solid ${UI.border}`,
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
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "10px",
            background: draftValue || UI.border,
            border: `2px solid ${UI.outline}`,
            flexShrink: 0,
          }}
          title="Preview"
        />
      </div>

      <h4
        style={{
          margin: "0 0 10px 0",
          fontSize: "1rem",
          fontWeight: 600,
          color: UI.textPrimary,
        }}
      >
        {themeMeta.name} colours
      </h4>
      <ThemeColorSwatchGrid
        colors={previewColors}
        highlightKey={editing.colorKey}
        onSwatchContextMenu={(key, label) => onEditColor(key, label)}
      />
    </>
  );
}

function ColourThemeContent() {
  const { themeId, setThemeId, getThemeColors } = useUiTheme();
  const [editing, setEditing] = useState(null);

  if (editing) {
    return (
      <ColourThemeEditor
        editing={editing}
        onBack={() => setEditing(null)}
        onEditColor={(colorKey, label) =>
          setEditing({ themeId: editing.themeId, colorKey, label })
        }
      />
    );
  }

  return (
    <>
      <h3
        style={{
          margin: "0 0 8px 0",
          fontSize: "1.2rem",
          fontWeight: 600,
          color: UI.textPrimary,
        }}
      >
        Colour Theme
      </h3>
      <p
        style={{
          margin: "0 0 20px 0",
          fontSize: "0.9rem",
          color: UI.textMuted,
          lineHeight: 1.45,
        }}
      >
        Changes core UI colours only. Right-click any swatch to customise a colour — changes save
        automatically.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {UI_THEME_LIST.map((theme) => {
          const isSelected = themeId === theme.id;
          const colors = getThemeColors(theme.id);
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setThemeId(theme.id)}
              style={{
                textAlign: "left",
                background: UI.cardBg,
                border: isSelected ? `2px solid ${UI.textPrimary}` : `1px solid ${UI.border}`,
                borderRadius: "12px",
                padding: "16px",
                cursor: "pointer",
                boxSizing: "border-box",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "6px",
                }}
              >
                <span style={{ fontSize: "1.05rem", fontWeight: 600, color: UI.textPrimary }}>
                  {theme.name}
                </span>
                {isSelected ? (
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: UI.textPrimary }}>
                    Selected
                  </span>
                ) : null}
              </div>
              <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: UI.textMuted }}>
                {theme.description}
              </p>
              <ThemeColorSwatchGrid
                colors={colors}
                onSwatchContextMenu={(key, label) => {
                  setEditing({ themeId: theme.id, colorKey: key, label });
                }}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}

const MENU_OPTIONS = [
  { key: "account", label: "Account" },
  { key: "colourTheme", label: "Colour Theme" },
];

function firstNameFromFullName(fullName) {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return "User";
  return trimmed.split(/\s+/)[0];
}

function AccountSettingsContent({ open }) {
  const [userRecord, setUserRecord] = useState(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const lastSavedPassword = useRef("");
  const skipNextSave = useRef(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    const userId = getLoggedInUserId();
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    skipNextSave.current = true;

    (async () => {
      setLoading(true);
      setSaveStatus("");
      try {
        const response = await fetch("/api/users");
        if (!response.ok) {
          throw new Error("Failed to load account");
        }
        const users = await response.json();
        const user = users.find((u) => u.id === parseInt(userId, 10));
        if (cancelled) return;

        if (user) {
          const currentPassword = user.password || "admin";
          setUserRecord(user);
          setPassword(currentPassword);
          lastSavedPassword.current = currentPassword;
        }
      } catch (error) {
        console.error("Error loading account:", error);
        if (!cancelled) {
          setSaveStatus("Could not load account");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          window.setTimeout(() => {
            skipNextSave.current = false;
          }, 0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !userRecord || skipNextSave.current) {
      return;
    }

    const trimmed = password.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed === lastSavedPassword.current) {
      setSaveStatus("");
      return;
    }

    setSaveStatus("Saving…");
    const timer = window.setTimeout(async () => {
      try {
        const userPositionIds =
          userRecord.positions && Array.isArray(userRecord.positions)
            ? userRecord.positions.map((p) => p.id)
            : [];

        const response = await fetch(`/api/users/${userRecord.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: userRecord.name,
            email: userRecord.email || null,
            phone: userRecord.phone || null,
            password: trimmed,
            positionIds: userPositionIds,
            primaryPositionId: userRecord.primary_position_id || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Save failed" }));
          throw new Error(errorData.error || "Failed to save password");
        }

        lastSavedPassword.current = trimmed;
        setUserRecord((prev) => (prev ? { ...prev, password: trimmed } : prev));
        setSaveStatus("Saved");
        window.setTimeout(() => setSaveStatus(""), 2000);
      } catch (error) {
        console.error("Error saving password:", error);
        setSaveStatus(error.message || "Save failed");
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [password, userRecord, open]);

  if (loading) {
    return <p style={{ margin: 0, color: UI.textMuted }}>Loading…</p>;
  }

  if (!userRecord) {
    return <p style={{ margin: 0, color: UI.textMuted }}>Could not load your account.</p>;
  }

  return (
    <>
      <h3
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.2rem",
          fontWeight: 600,
          color: UI.textPrimary,
        }}
      >
        Account
      </h3>
      <div style={{ maxWidth: "400px" }}>
        <label
          htmlFor="account-password"
          style={{
            display: "block",
            fontSize: "0.9rem",
            color: UI.textMuted,
            marginBottom: "6px",
            fontWeight: 500,
          }}
        >
          Password
        </label>
        <input
          id="account-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoComplete="new-password"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: `1px solid ${UI.border}`,
            fontSize: "1rem",
            color: UI.textPrimary,
            background: UI.cardBg,
            boxSizing: "border-box",
          }}
        />
        {saveStatus ? (
          <p
            style={{
              margin: "8px 0 0 0",
              fontSize: "0.85rem",
              color: saveStatus === "Saved" ? "#2e7d32" : UI.textMuted,
            }}
          >
            {saveStatus}
          </p>
        ) : null}
        <p
          style={{
            margin: "12px 0 0 0",
            fontSize: "0.85rem",
            color: UI.textMuted,
            lineHeight: 1.4,
          }}
        >
          This is the password you use to log in. Changes save automatically.
        </p>
      </div>
    </>
  );
}

function renderSectionContent(selected, open) {
  if (selected === "account") {
    return <AccountSettingsContent open={open} />;
  }
  if (selected === "colourTheme") {
    return <ColourThemeContent />;
  }
  return null;
}

export default function UserSettingsModal({ open, onClose, userName }) {
  const [selected, setSelected] = useState(MENU_OPTIONS[0].key);

  if (!open) {
    return null;
  }

  const firstName = firstNameFromFullName(userName);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10005,
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-settings-modal-title"
        style={{
          background: UI.cardBg,
          borderRadius: "16px",
          padding: "32px",
          maxWidth: "1000px",
          width: "100%",
          height: "min(80vh, 720px)",
          minHeight: "480px",
          maxHeight: "92vh",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          color: UI.textPrimary,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "24px",
            flexShrink: 0,
          }}
        >
          <h2
            id="user-settings-modal-title"
            style={{
              margin: 0,
              fontSize: "1.5rem",
              color: UI.textPrimary,
              fontWeight: 600,
            }}
          >
            {firstName} Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: "1.5rem",
              lineHeight: 1,
              cursor: "pointer",
              color: UI.textPrimary,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: "24px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <nav
            style={{
              background: UI.panelBg,
              borderRadius: "12px",
              padding: "16px 12px",
              display: "flex",
              flexDirection: "column",
              width: "220px",
              minWidth: "220px",
              flexShrink: 0,
              alignSelf: "stretch",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {MENU_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelected(option.key)}
                  style={{
                    background: selected === option.key ? UI.cardBg : "transparent",
                    color: selected === option.key ? UI.textPrimary : UI.textSecondary,
                    border: "none",
                    borderRadius: "10px",
                    padding: "12px 12px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "background 0.18s, color 0.15s",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                marginTop: "auto",
                background: UI.buttonPrimary,
                color: UI.buttonPrimaryText,
                border: "none",
                borderRadius: "10px",
                padding: "12px 12px",
                fontSize: "1rem",
                fontWeight: 500,
                textAlign: "center",
                cursor: "pointer",
                width: "100%",
              }}
            >
              Close
            </button>
          </nav>

          <div
            style={{
              flex: 1,
              background: UI.inputBg,
              borderRadius: "12px",
              padding: "24px",
              overflowY: "auto",
              minWidth: 0,
            }}
          >
            {renderSectionContent(selected, open)}
          </div>
        </div>
      </div>
    </div>
  );
}
