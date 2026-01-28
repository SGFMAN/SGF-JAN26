import React, { useState } from "react";
import { Link } from "react-router-dom";
import Users from "./Users";
import FileSettings from "./FileSettings";
import EmailTemplate from "./EmailTemplate";
import AccountSettings from "./AccountSettings";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

// Sidebar menu entries
const menuOptions = [
  { key: "file", label: "File Settings" },
  { key: "email", label: "Email Settings" },
  { key: "users", label: "Users" },
  { key: "account", label: "Account Settings" },
];

export default function SettingsPage() {
  const [selected, setSelected] = useState(menuOptions[0].key);

  function renderContent() {
    switch (selected) {
      case "file":
        return <FileSettings />;
      case "email":
        return <EmailTemplate />;
      case "users":
        return <Users />;
      case "account":
        return <AccountSettings />;
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
        background: MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      {/* Section 1: Heading */}
      <div
        style={{
          background: SECTION_GREY,
          borderRadius: "18px",
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          height: "100px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            textAlign: "center",
            width: "100%",
            color: MONUMENT,
            letterSpacing: "1px",
          }}
        >
          Settings
        </h1>
      </div>

      {/* Sidebar and Main Content */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto",
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
            height: "700px",
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
                color: selected === option.key ? MONUMENT : "#404049",
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
                outline: selected === option.key ? `2px solid ${MONUMENT}` : "none",
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
            height: "700px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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