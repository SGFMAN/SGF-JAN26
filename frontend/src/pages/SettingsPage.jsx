const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

import { Link } from "react-router-dom";

// Menu and main area: 200px wide for sidebar, 700px height for both sections
export default function SettingsPage() {
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

      {/* Sections 2 & 3: Sidebar and Main Content */}
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
        {/* Section 2: Sidebar (menu, 200px wide, 700px height) */}
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
            gap: "20px",
            boxSizing: "border-box",
          }}
        >
          <Link
            to="/"
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
              marginBottom: "12px",
            }}
          >
            ← Back to Home
          </Link>
          <div
            style={{
              color: "#56565a",
              fontSize: "1.15rem",
              fontWeight: 500,
              userSelect: "none",
            }}
          >
            Settings Menu
          </div>
          <div
            style={{
              color: "#909098",
              fontSize: "1rem",
              padding: "7px 0 0 6px",
              userSelect: "none",
              fontStyle: "italic",
            }}
          >
            (Coming soon...)
          </div>
        </div>

        {/* Section 3: Main Content (same color and 700px height as the menu) */}
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
          Settings page coming soon...
        </div>
      </div>
    </div>
  );
}