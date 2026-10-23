import React from "react";
import { Link } from "react-router-dom";
import WalkingMan from "../components/WalkingMan.jsx";
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
        background: "#1c2433",
      }}
    >
      <WalkingMan />
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 2 }}>
        <Link to="/projects" style={hudButtonStyle}>
          Back to Projects
        </Link>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 128,
          textAlign: "center",
          color: PAGE_TEXT,
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          opacity: 0.75,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        Drag to look around
      </div>
    </div>
  );
}
