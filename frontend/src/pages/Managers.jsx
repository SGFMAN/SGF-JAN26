import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import { useManagersAccess } from "../hooks/useManagersAccess";
import useAppLogo from "../hooks/useAppLogo.js";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

export default function Managers() {
  const logo = useAppLogo();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const { hasDrawing, ready: drawingReady } = useDrawingAccess();
  const { hasManagers, ready: managersReady } = useManagersAccess();

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  // Default landing: Site Visit if Managers; Drawing Manager if Drawing-only.
  useEffect(() => {
    if (!managersReady || !drawingReady) return;
    if (hasManagers) {
      navigate("/managers/site-visit-manager", { replace: true });
      return;
    }
    if (hasDrawing) {
      navigate("/managers/drawing-manager", { replace: true });
    }
  }, [navigate, hasManagers, hasDrawing, managersReady, drawingReady]);

  const navLinkStyle = {
    background: "transparent",
    color: UI.textSecondary,
    border: "none",
    borderRadius: "10px",
    padding: "8px 8px",
    fontSize: "0.95rem",
    fontWeight: 500,
    textAlign: "center",
    textDecoration: "none",
    letterSpacing: "0.5px",
    cursor: "pointer",
    transition: "background 0.18s, color 0.15s",
    marginBottom: "0px",
    lineHeight: "1.4",
    display: "block",
  };
  
  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      {/* Section 1: Heading */}
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img
            src={logo}
            alt="SGF Logo"
            style={{
              width: "120px",
              height: "auto",
            }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Managers
          </h1>
        </div>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        {/* Section 2: Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
            overflowY: "auto",
          }}
        >
          {/* Menu Buttons */}
          {hasManagers ? (
            <>
              <Link
                to="/managers/site-visit-manager"
                style={{
                  ...navLinkStyle,
                  background: WHITE,
                  color: MONUMENT,
                  outline: `1px solid ${UI.outline}`,
                  boxShadow: "0 2px 4px rgba(50,50,51,.04)",
                }}
              >
                Site Visit Manager
              </Link>
              <Link to="/managers/contract-manager" style={navLinkStyle}>
                Contract Manager
              </Link>
              <Link to="/managers/colour-manager" style={navLinkStyle}>
                Colour Manager
              </Link>
              <Link to="/managers/windows-manager" style={navLinkStyle}>
                Windows Manager
              </Link>
              <Link to="/managers/status-manager" style={navLinkStyle}>
                Status Manager
              </Link>
              {isAdmin ? (
                <>
                  <Link to="/managers/next-outs" style={navLinkStyle}>
                    Next Outs
                  </Link>
                  <Link to="/managers/planning-manager" style={navLinkStyle}>
                    Planning Manager
                  </Link>
                </>
              ) : null}
            </>
          ) : null}
          {hasDrawing ? (
            <Link
              to="/managers/drawing-manager"
              style={
                hasManagers
                  ? navLinkStyle
                  : {
                      ...navLinkStyle,
                      background: WHITE,
                      color: MONUMENT,
                      outline: `1px solid ${UI.outline}`,
                      boxShadow: "0 2px 4px rgba(50,50,51,.04)",
                    }
              }
            >
              Drawing Manager
            </Link>
          ) : null}
          <div style={{ flex: 1 }} />
          <Link
            to="/projects"
            style={{
              background: "transparent",
              color: UI.textSecondary,
              border: "none",
              borderRadius: "10px",
              padding: "8px 8px",
              fontSize: "0.95rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "0px",
              lineHeight: "1.4",
              display: "block",
            }}
          >
            ← Back to Main
          </Link>
        </div>

        {/* Section 3: Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <p style={{ fontSize: "1.2rem", color: MONUMENT }}>
            Select a manager from the menu
          </p>
        </div>
      </div>
    </div>
  );
}
