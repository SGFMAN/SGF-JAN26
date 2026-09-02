import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import SandpitRacer from "../components/SandpitRacer";
import { UI } from "../utils/uiThemeTokens.js";

const PAGE_TEXT = UI.pageText;

export default function Sandpit() {
  const startRaceRef = useRef(null);
  const [drivers, setDrivers] = useState([]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#061127",
      }}
    >
      <SandpitRacer startRaceRef={startRaceRef} onDriversChange={setDrivers} />
      <Link
        to="/projects"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 2,
          color: PAGE_TEXT,
          fontSize: "0.8rem",
          textDecoration: "none",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 8,
          padding: "6px 12px",
          background: "rgba(6, 17, 39, 0.55)",
        }}
      >
        Back to Projects
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          startRaceRef.current?.();
        }}
        style={{
          position: "absolute",
          top: 16,
          left: 168,
          zIndex: 2,
          color: PAGE_TEXT,
          fontSize: "0.8rem",
          fontWeight: 700,
          cursor: "pointer",
          tabIndex: -1,
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 8,
          padding: "6px 14px",
          background: "rgba(180, 40, 40, 0.75)",
        }}
      >
        Start Race
      </button>
      <div
        role="status"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 2,
          color: "rgba(255,255,255,0.85)",
          fontSize: "0.75rem",
          background: "rgba(6, 17, 39, 0.55)",
          borderRadius: 8,
          padding: "6px 10px",
          maxWidth: 220,
          textAlign: "right",
        }}
      >
        {drivers.length === 0
          ? "Connecting…"
          : `${drivers.length} driver${drivers.length === 1 ? "" : "s"}`}
        {drivers.length > 0 ? (
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            {drivers.map((d) => d.name).join(" · ")}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          zIndex: 2,
          color: "rgba(255,255,255,0.8)",
          fontSize: "0.75rem",
          background: "rgba(6, 17, 39, 0.55)",
          borderRadius: 8,
          padding: "6px 10px",
          pointerEvents: "none",
        }}
      >
        W / ↑ accelerate · X / ↓ brake · A D or ← → steer
      </div>
    </div>
  );
}
