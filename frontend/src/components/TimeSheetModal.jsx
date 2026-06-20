import React from "react";
import TimeSheetSettingsContent from "./TimeSheetSettingsContent";
import { UI } from "../utils/uiThemeTokens";

export default function TimeSheetModal({ open, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
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
        aria-labelledby="timesheet-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.cardBg,
          borderRadius: "16px",
          padding: "28px 32px",
          width: "100%",
          maxWidth: "min(1100px, 95vw)",
          maxHeight: "min(90vh, 820px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          color: UI.textPrimary,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "20px",
            flexShrink: 0,
          }}
        >
          <h2
            id="timesheet-modal-title"
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 600,
              color: UI.textPrimary,
            }}
          >
            Time Sheet
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
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <TimeSheetSettingsContent />
        </div>
      </div>
    </div>
  );
}
