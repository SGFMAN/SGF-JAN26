import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SCREEN_GREEN = "#22ff88";
const SCREEN_BG = "#061a10";

export default function SecretLevel() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/secret-area";
  const secretReturnTo = location.state?.secretReturnTo;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: SCREEN_BG,
        color: SCREEN_GREEN,
        fontFamily: "Consolas, Monaco, monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        padding: "32px",
        boxSizing: "border-box",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, letterSpacing: "0.08em" }}>
        LEVEL
      </h1>
      <p style={{ margin: 0, opacity: 0.85, textAlign: "center", maxWidth: "420px" }}>
        Level gameplay coming soon.
      </p>
      <button
        type="button"
        onClick={() =>
          navigate(returnTo, {
            state: secretReturnTo ? { returnTo: secretReturnTo } : undefined,
          })
        }
        style={{
          marginTop: "16px",
          padding: "14px 32px",
          fontSize: "1.1rem",
          fontWeight: 700,
          fontFamily: "inherit",
          color: SCREEN_BG,
          background: SCREEN_GREEN,
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          letterSpacing: "0.06em",
        }}
      >
        Back to Secret Area
      </button>
    </div>
  );
}
