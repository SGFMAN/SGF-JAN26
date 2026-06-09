import React, { useState } from "react";
import FloorPlansModal from "../components/FloorPlansModal";

const MONUMENT = "#323233";
const WHITE = "#fff";

export default function MapsSettings() {
  const [showFloorPlansModal, setShowFloorPlansModal] = useState(false);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "24px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "24px",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
        Maps Settings
      </h2>

      <button
        type="button"
        onClick={() => setShowFloorPlansModal(true)}
        style={{
          padding: "12px 24px",
          fontSize: "1rem",
          fontWeight: 600,
          borderRadius: "10px",
          border: "none",
          background: WHITE,
          color: MONUMENT,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        Floor Plans
      </button>

      {showFloorPlansModal && (
        <FloorPlansModal onClose={() => setShowFloorPlansModal(false)} />
      )}
    </div>
  );
}
