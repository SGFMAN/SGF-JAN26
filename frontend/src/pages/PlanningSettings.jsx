import React from "react";

import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;

export default function PlanningSettings() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "28px 32px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "12px",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "1.5rem",
          fontWeight: 700,
          color: MONUMENT,
        }}
      >
        Planning
      </h2>
      <p style={{ margin: 0, color: UI.textMuted, fontSize: "1rem" }}>
        Planning settings will go here.
      </p>
    </div>
  );
}
