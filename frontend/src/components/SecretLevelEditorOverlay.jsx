import React from "react";

const SCREEN_GREEN = "#22ff88";
const SCREEN_BG = "#061a10";

export default function SecretLevelEditorOverlay({ frame, bezel, onBackToMenu }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Level editor"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          boxSizing: "border-box",
          background: SCREEN_BG,
          border: `${Math.max(4, frame.width * 0.018)}px solid ${bezel}`,
          borderRadius: "4px",
          boxShadow: "0 0 48px rgba(34, 255, 136, 0.35), inset 0 0 80px rgba(34, 255, 136, 0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(8px, 1.5vh, 20px)",
          padding: "clamp(12px, 2vh, 24px)",
          fontFamily: "Consolas, Monaco, monospace",
          color: SCREEN_GREEN,
          pointerEvents: "auto",
          overflow: "auto",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(1rem, 2.2vw, 1.75rem)",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textAlign: "center",
          }}
        >
          LEVEL EDITOR
        </h1>
        <p
          style={{
            margin: 0,
            opacity: 0.85,
            textAlign: "center",
            fontSize: "clamp(0.75rem, 1.4vw, 1rem)",
            maxWidth: "90%",
          }}
        >
          Level editor coming soon.
        </p>
        <button
          type="button"
          onClick={onBackToMenu}
          style={{
            marginTop: "clamp(4px, 1vh, 12px)",
            padding: "clamp(10px, 1.5vh, 14px) clamp(20px, 3vw, 32px)",
            fontSize: "clamp(0.85rem, 1.5vw, 1.1rem)",
            fontWeight: 700,
            fontFamily: "inherit",
            color: SCREEN_BG,
            background: SCREEN_GREEN,
            border: "2px solid #3dff9a",
            borderRadius: "6px",
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}
