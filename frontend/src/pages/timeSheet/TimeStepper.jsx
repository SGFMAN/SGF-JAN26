import React from "react";
import { UI, PROJECT_CARD } from "../../utils/uiThemeTokens";

const VALUE_WIDTH = "78px";

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
    width: "20px",
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
          flexDirection: "row",
          alignItems: "center",
          gap: "6px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            flexShrink: 0,
          }}
        >
          <button type="button" disabled={disabled} onClick={onStepUp} style={buttonStyle} aria-label="Increase">
            ▲
          </button>
          <button type="button" disabled={disabled} onClick={onStepDown} style={buttonStyle} aria-label="Decrease">
            ▼
          </button>
        </div>
        <div
          style={{
            width: VALUE_WIDTH,
            minWidth: VALUE_WIDTH,
            maxWidth: VALUE_WIDTH,
            fontSize: "0.76rem",
            fontWeight: 600,
            color: dark ? PROJECT_CARD.text : UI.textPrimary,
            textAlign: "left",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
            boxSizing: "border-box",
          }}
        >
          {formatValue(value)}
        </div>
      </div>
    </div>
  );
}
