import React from "react";
import { Link } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import MobilePreviewSimulator from "../components/MobilePreviewSimulator";
import { UI } from "../utils/uiThemeTokens.js";
import "../mobile/mobile-preview.css";

const PAGE_TEXT = UI.pageText;
const LIGHT_MONUMENT = UI.pageBg;

export default function MobilePreviewPage() {
  const logo = useAppLogo();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        overflowY: "auto",
        boxSizing: "border-box",
        padding: "32px 24px 48px",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
          <Link to="/projects" style={{ flexShrink: 0 }}>
            <img src={logo} alt="SGF Logo" style={{ width: "100px", height: "auto", display: "block" }} />
          </Link>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <Link
              to="/settings"
              state={{ section: "ui" }}
              style={{
                display: "inline-block",
                marginBottom: "8px",
                fontSize: "0.9rem",
                color: UI.textPrimary,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              ← Back to UI settings
            </Link>
            <h1
              style={{
                margin: 0,
                fontSize: "2rem",
                fontWeight: 700,
                color: PAGE_TEXT,
                letterSpacing: "0.5px",
              }}
            >
              Mobile preview
            </h1>
          </div>
        </div>

        <p className="mobile-preview-page__intro">
          Tap a project folder to open it inside the preview. The mobile layout is separate from desktop — nothing
          here navigates the main app.
        </p>

        <div className="mobile-preview-page__stage">
          <MobilePreviewSimulator />
        </div>
      </div>
    </div>
  );
}
