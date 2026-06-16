import React from "react";
import { ENTRY_SIDES } from "../Game/secretGameSceneConfig";

const ACTION_BUTTON_STYLE = {
  padding: "12px 16px",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#061a10",
  background: "#ffdd00",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  textAlign: "left",
};

const CLOSE_BUTTON_STYLE = {
  padding: "10px 16px",
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#c8d8d0",
  background: "transparent",
  border: "1px solid #3a4a56",
  borderRadius: "8px",
  cursor: "pointer",
};

const SIDE_LABELS = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
};

export default function SecretSceneEditModal({
  open,
  sceneLabel,
  sceneOptions,
  sceneLinks,
  onSceneLinkChange,
  onClose,
  onDefinePath,
  onDefineEntryPoint,
}) {
  if (!open) return null;

  const entryActions = ENTRY_SIDES.map((side) => ({
    side,
    label: `Define ${SIDE_LABELS[side]} Entry Point`,
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-scene-edit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.72)",
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          maxHeight: "min(90vh, 720px)",
          overflowY: "auto",
          background: "#101820",
          border: "1px solid #2a3a4a",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.45)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="secret-scene-edit-title"
          style={{ margin: "0 0 8px", fontSize: "1.25rem", color: "#e8fff4" }}
        >
          Edit Scene
        </h2>
        <p style={{ margin: "0 0 20px", color: "#9ab0a8", fontSize: "0.92rem" }}>
          {sceneLabel}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button type="button" onClick={onDefinePath} style={ACTION_BUTTON_STYLE}>
            Define Path
          </button>
          {entryActions.map(({ side, label }) => (
            <button
              key={side}
              type="button"
              onClick={() => onDefineEntryPoint(side)}
              style={ACTION_BUTTON_STYLE}
            >
              {label}
            </button>
          ))}

          <div
            style={{
              marginTop: "8px",
              paddingTop: "16px",
              borderTop: "1px solid #2a3a4a",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem", color: "#c8e8d8" }}>
              Exit scene links
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: "0.82rem", color: "#8aa098" }}>
              Scene to load when the player crosses each entry edge.
            </p>
            {ENTRY_SIDES.map((side) => (
              <label
                key={side}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "10px",
                  fontSize: "0.88rem",
                  color: "#b8ccc4",
                }}
              >
                <span>Exit {SIDE_LABELS[side]} →</span>
                <select
                  value={sceneLinks?.[side] || ""}
                  onChange={(e) => onSceneLinkChange(side, e.target.value || null)}
                  style={{
                    flex: 1,
                    maxWidth: "160px",
                    padding: "8px 10px",
                    borderRadius: "6px",
                    border: "1px solid #3a4a56",
                    background: "#0a1018",
                    color: "#e8fff4",
                  }}
                >
                  <option value="">None</option>
                  {sceneOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      Scene {opt.id}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <button type="button" onClick={onClose} style={CLOSE_BUTTON_STYLE}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
