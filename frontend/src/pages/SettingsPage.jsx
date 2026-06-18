import React, { useState } from "react";
import { Link } from "react-router-dom";
import Users from "./Users";
import Permissions from "./Permissions";
import FileSettings from "./FileSettings";
import EmailTemplate from "./EmailTemplate";
import EmailSettings from "./EmailSettings";
import AccountSettings from "./AccountSettings";
import ColourSettings from "./ColourSettings";
import StreamSettings from "./StreamSettings";
import MapsSettings from "./MapsSettings";
import logo from "../images/logo.png";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

// Sidebar menu entries (alphabetical by label)
const menuOptions = [
  { key: "account", label: "Account Settings" },
  { key: "colourSettings", label: "Colour Settings" },
  { key: "streamSettings", label: "Email Settings" },
  { key: "emailTemplates", label: "Email Templates" },
  { key: "file", label: "File Settings" },
  { key: "maps", label: "Maps" },
  { key: "emailSettings", label: "SMTP Settings" },
  { key: "users", label: "Users" },
  { key: "permissions", label: "Permissions" },
];

export default function SettingsPage() {
  const [selected, setSelected] = useState(menuOptions[0].key);

  function renderContent() {
    switch (selected) {
      case "file":
        return <FileSettings />;
      case "emailTemplates":
        return <EmailTemplate />;
      case "emailSettings":
        return <EmailSettings />;
      case "users":
        return <Users />;
      case "permissions":
        return <Permissions />;
      case "account":
        return <AccountSettings />;
      case "colourSettings":
        return <ColourSettings />;
      case "maps":
        return <MapsSettings />;
      case "streamSettings":
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              minWidth: 0,
              minHeight: 0,
              alignSelf: "stretch",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <StreamSettings />
          </div>
        );
      default:
        return (
          <div>
            <div style={{ fontWeight: 600, fontSize: "1.28rem", textAlign: "center" }}>Settings</div>
            <div>(Select a menu option)</div>
          </div>
        );
    }
  }

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
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Settings
          </h1>
        </div>
      </div>

      {/* Sidebar and Main Content */}
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
        {/* Sidebar Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            maxWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            boxSizing: "border-box",
          }}
        >
          {/* Menu Buttons */}
          {menuOptions.map(option => (
            <button
              key={option.key}
              onClick={() => setSelected(option.key)}
              style={{
                background: selected === option.key ? WHITE : "transparent",
                color: selected === option.key ? MONUMENT : UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center", // Center the heading on the button
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "2px",
                outline: selected === option.key ? `2px solid ${UI.outline}` : "none",
                boxShadow: selected === option.key ? "0 2px 4px rgba(50,50,51,.04)" : "none"
              }}
            >
              {option.label}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Back to Main (Home) */}
          <Link
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.17s",
              marginBottom: "4px",
              display: "block", // Ensures the link stretches full width for centering
            }}
          >
            ← Back to Main
          </Link>
        </div>

        {/* Main Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            flex: 1,
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            display: "flex",
            alignItems: selected === "streamSettings" || selected === "maps" || selected === "permissions" ? "stretch" : "center",
            justifyContent: selected === "streamSettings" || selected === "maps" || selected === "permissions" ? "flex-start" : "center",
            overflow: selected === "streamSettings" || selected === "maps" || selected === "permissions" ? "hidden" : "visible",
            minWidth: 0,
            color: MONUMENT,
            fontSize: "1.22rem",
            fontWeight: 500,
            letterSpacing: "0.5px",
          }}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
}