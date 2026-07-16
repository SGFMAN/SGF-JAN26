import React from "react";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens";
import { APP_VERSION } from "../utils/appVersion";

const LIGHT_MONUMENT = UI.pageBg;
const PAGE_TEXT = UI.pageText;

/**
 * Placeholder Client Portal landing — UI only.
 * No staff login, no staff API calls, no links into the staff app.
 */
export default function ClientPortalLanding() {
  const logo = useAppLogo();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "calc(15% - 500px)",
      }}
    >
      <img
        src={logo}
        alt="Superior Granny Flats"
        style={{
          maxWidth: "1000px",
          maxHeight: "80%",
          objectFit: "contain",
          position: "relative",
          zIndex: 1,
          marginTop: "-50px",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          alignItems: "center",
          minWidth: "280px",
          maxWidth: "360px",
          width: "100%",
          marginTop: "-40px",
          padding: "0 16px",
          boxSizing: "border-box",
          position: "relative",
          zIndex: 2,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "0.75rem",
            color: "#ffffff",
            opacity: 0.7,
            letterSpacing: "0.02em",
          }}
        >
          {APP_VERSION}
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontWeight: 600,
            color: PAGE_TEXT,
            letterSpacing: "0.01em",
          }}
        >
          Client Portal
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: "1rem",
            color: PAGE_TEXT,
            opacity: 0.9,
            lineHeight: 1.45,
          }}
        >
          Client Portal coming soon.
        </p>
      </div>
    </div>
  );
}
