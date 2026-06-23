import React from "react";
import { UI, PROJECT_CARD } from "../../utils/uiThemeTokens";

export default function TimeStepper({
  value,
  onStepUp,
  onStepDown,
  formatValue,
  disabled = false,
  dark = false,
}) {
  const buttonStyle = {
    background: dark ? UI.cardBg : UI.inputBg,
    color: UI.textPrimary,
    border: "none",
    borderRadius: "3px",
    width: "100%",
    height: "18px",
    flexShrink: 0,
    fontSize: "0.55rem",
    lineHeight: 1,
    cursor: disabled ? "not-allowed" : "pointer",
    padding: 0,
    opacity: disabled ? 0.35 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          width: "max-content",
          maxWidth: "100%",
          gap: "2px",
          flexShrink: 0,
        }}
      >
        <button type="button" disabled={disabled} onClick={onStepUp} style={buttonStyle} aria-label="Increase">
          ▲
        </button>
        <div
          style={{
            fontSize: "0.95rem",
            fontWeight: 600,
            color: dark ? PROJECT_CARD.text : UI.textPrimary,
            textAlign: "center",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            padding: "0 2px",
            boxSizing: "border-box",
          }}
        >
          {formatValue(value)}
        </div>
        <button type="button" disabled={disabled} onClick={onStepDown} style={buttonStyle} aria-label="Decrease">
          ▼
        </button>
      </div>
    </div>
  );
}
