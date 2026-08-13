import React from "react";
import defaultLogo from "../images/logo.png";
import { UI } from "../utils/uiThemeTokens";

/**
 * Full-viewport branded loading cover so no partial chrome flashes in.
 */
export default function AppLoadingScreen({ message = "Loading…" }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        background: UI.pageBg,
        color: UI.pageText,
        fontFamily: "system-ui, Avenir, Helvetica, Arial, sans-serif",
      }}
    >
      <img
        src={defaultLogo}
        alt="SGF"
        style={{
          width: "min(420px, 70vw)",
          height: "auto",
          objectFit: "contain",
          marginBottom: "12px",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.22)",
          borderTopColor: "#ffffff",
          animation: "sgf-boot-spin 0.75s linear infinite",
        }}
      />
      <div
        style={{
          marginTop: "10px",
          fontSize: "1.05rem",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {message}
      </div>
      <style>{`@keyframes sgf-boot-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
