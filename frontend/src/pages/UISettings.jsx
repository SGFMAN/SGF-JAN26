import React, { useState } from "react";
import UIButtonStylesModal from "../components/UIButtonStylesModal.jsx";
import UIPaletteSettingsModal from "../components/UIPaletteSettingsModal.jsx";
import { UI, MENU } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;

const actionButtonStyle = {
  background: MENU.purple,
  color: MENU.activeText,
  border: FIELD_OUTLINE,
  borderRadius: "10px",
  padding: "12px 24px",
  fontSize: "0.95rem",
  fontWeight: 500,
  cursor: "pointer",
  minWidth: "160px",
};

export default function UISettings() {
  const [showButtonsModal, setShowButtonsModal] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);

  return (
    <>
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          overflow: "auto",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
          UI
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
            <button type="button" onClick={() => setShowPaletteModal(true)} style={actionButtonStyle}>
              Palette Colours
            </button>
            <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted, maxWidth: "480px", lineHeight: 1.45 }}>
              Customise the shared palette colours for each theme. All users see the same colours; each user still
              chooses their own palette in My Settings.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start" }}>
            <button type="button" onClick={() => setShowButtonsModal(true)} style={actionButtonStyle}>
              Buttons
            </button>
            <p style={{ margin: 0, fontSize: "0.9rem", color: UI.textMuted, maxWidth: "480px", lineHeight: 1.45 }}>
              Define reusable button styles numbered 1, 2, 3… Saved to the server so every user sees the same buttons.
            </p>
          </div>
        </div>
      </div>

      <UIPaletteSettingsModal isOpen={showPaletteModal} onClose={() => setShowPaletteModal(false)} />
      <UIButtonStylesModal isOpen={showButtonsModal} onClose={() => setShowButtonsModal(false)} />
    </>
  );
}
