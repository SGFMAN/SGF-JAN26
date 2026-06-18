import React from "react";
import { BANNER } from "../utils/uiThemeTokens.js";

const sashStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%) rotate(-45deg)",
  width: "280px",
  height: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
};

const labelStyle = {
  fontWeight: 700,
  fontSize: "1.1rem",
  letterSpacing: "2px",
  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
};

export function OnHoldSash({ zIndex = 10 } = {}) {
  return (
    <div style={{ ...sashStyle, background: BANNER.onHold, zIndex }}>
      <span style={{ ...labelStyle, color: BANNER.onHoldText }}>ON HOLD</span>
    </div>
  );
}

export function CancelledSash({ zIndex = 10 } = {}) {
  return (
    <div style={{ ...sashStyle, background: BANNER.cancelled, zIndex }}>
      <span style={{ ...labelStyle, color: BANNER.cancelledText }}>CANCELLED</span>
    </div>
  );
}
