import React from "react";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;

export default function ProjectListGroupHeader({ label, isFirst = false }) {
  if (!label) return null;

  return (
    <div style={{ flexBasis: "100%", width: "100%", marginTop: isFirst ? 0 : "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            fontSize: "1.3rem",
            fontWeight: 800,
            color: MONUMENT,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
        <div style={{ height: "2px", background: MONUMENT, flex: 1, opacity: 0.4 }} />
      </div>
    </div>
  );
}
