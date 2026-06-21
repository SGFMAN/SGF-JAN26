import React, { useEffect, useRef, useState } from "react";
import { getApiHeaders, getLoggedInUserId } from "../utils/auth";
import { useUiTheme } from "../context/UiThemeProvider";
import { UI } from "../utils/uiThemeTokens";
import { UI_THEME_LIST } from "../themes/uiThemes";
import { getThemeDisplayName } from "../utils/uiThemeSettings.js";

const AUTO_SAVE_DELAY_MS = 600;

function ThemeColorSwatchGrid({ colors, compact }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: compact ? "6px" : "8px",
      }}
    >
      {Object.entries(colors)
        .filter(([key]) =>
          [
            "pageBackground",
            "pageText",
            "textPrimary",
            "panelBackground",
            "cardBackground",
            "vicBlue",
            "vicBlueLight",
            "qldRed",
            "qldRedLight",
            "streamGreen",
            "streamGreenLight",
            "menuPurple",
            "indicatorOrangeLight",
            "outline",
            "projectCardBackground",
          ].includes(key)
        )
        .slice(0, 15)
        .map(([key, value]) => (
          <div
            key={key}
            style={{
              height: compact ? "24px" : "28px",
              borderRadius: "6px",
              background: value,
              border: `1px solid ${UI.border}`,
              boxSizing: "border-box",
            }}
            title={key}
          />
        ))}
    </div>
  );
}

function ColourThemeContent() {
  const { themeId, setThemeId, getThemeColors } = useUiTheme();
  const [saving, setSaving] = useState(false);

  async function handleSelect(nextThemeId) {
    if (nextThemeId === themeId) return;
    setSaving(true);
    try {
      await setThemeId(nextThemeId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h3 style={{ margin: "0 0 8px 0", fontSize: "1.2rem", fontWeight: 600, color: UI.textPrimary }}>
        Colour Theme
      </h3>
      <p style={{ margin: "0 0 8px 0", fontSize: "0.95rem", color: UI.textPrimary, fontWeight: 500 }}>
        Your palette: {getThemeDisplayName(themeId)}
      </p>
      <p style={{ margin: "0 0 20px 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.45 }}>
        Choose which colour palette you use. Palette colours are shared across the team; your choice is saved to your
        account.
        {saving ? " Saving…" : ""}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {UI_THEME_LIST.map((theme) => {
          const isSelected = themeId === theme.id;
          const colors = getThemeColors(theme.id);
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              disabled={saving}
              style={{
                textAlign: "left",
                background: UI.cardBg,
                border: isSelected ? `2px solid ${UI.textPrimary}` : `1px solid ${UI.border}`,
                borderRadius: "12px",
                padding: "16px",
                cursor: saving ? "wait" : "pointer",
                boxSizing: "border-box",
                width: "100%",
                opacity: saving && !isSelected ? 0.7 : 1,
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
                <span style={{ fontSize: "1.05rem", fontWeight: 600, color: UI.textPrimary }}>{theme.name}</span>
                {isSelected ? (
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: UI.textPrimary }}>Selected</span>
                ) : null}
              </div>
              <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: UI.textMuted }}>{theme.description}</p>
              <ThemeColorSwatchGrid colors={colors} compact />
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
  const { themeId } = useUiTheme();
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
        const response = await fetch("/api/users", { headers: getApiHeaders() });
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
          headers: getApiHeaders(),
          body: JSON.stringify({
            name: userRecord.name,
            email: userRecord.email || null,
            phone: userRecord.phone || null,
            password: trimmed,
            positionIds: userPositionIds,
            primaryPositionId: userRecord.primary_position_id || null,
            uiThemeId: themeId,
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
  }, [password, userRecord, open, themeId]);

  if (loading) {
    return <p style={{ margin: 0, color: UI.textMuted }}>Loading…</p>;
  }

  if (!userRecord) {
    return <p style={{ margin: 0, color: UI.textMuted }}>Could not load your account.</p>;
  }

  return (
    <>
      <h3 style={{ margin: "0 0 20px 0", fontSize: "1.2rem", fontWeight: 600, color: UI.textPrimary }}>
        Account
      </h3>
      <div style={{ maxWidth: "400px" }}>
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>Palette</div>
          <div
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
          >
            {getThemeDisplayName(themeId)}
          </div>
          <p style={{ margin: "8px 0 0 0", fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.4 }}>
            Change your palette under Colour Theme in this menu.
          </p>
        </div>

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
        <p style={{ margin: "12px 0 0 0", fontSize: "0.85rem", color: UI.textMuted, lineHeight: 1.4 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
