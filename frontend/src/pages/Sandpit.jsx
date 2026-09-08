import React from "react";
import { Link } from "react-router-dom";
import { UI } from "../utils/uiThemeTokens.js";

const PAGE_TEXT = UI.pageText;

const hudButtonStyle = {
  color: PAGE_TEXT,
  fontSize: "0.8rem",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: 8,
  padding: "6px 12px",
  background: "rgba(6, 17, 39, 0.55)",
  cursor: "pointer",
  fontFamily: "inherit",
};

export default function Sandpit() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#061127",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          background:
            "radial-gradient(circle at 50% 28%, rgba(70, 110, 180, 0.28), transparent 42%), #061127",
        }}
      >
        <div style={{ position: "absolute", top: 16, left: 16 }}>
          <Link to="/projects" style={hudButtonStyle}>
            Back to Projects
          </Link>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              color: PAGE_TEXT,
              fontSize: "2.4rem",
              fontWeight: 800,
              letterSpacing: "0.18em",
            }}
          >
            SANDPIT
          </div>
        </div>
      </div>
    </div>
  );
}
