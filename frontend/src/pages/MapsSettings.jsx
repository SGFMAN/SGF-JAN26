import React, { useState } from "react";
import FloorPlansModal from "../components/FloorPlansModal";
import MapsQuoteSettingsModal from "../components/MapsQuoteSettingsModal";

const MONUMENT = "#323233";
const WHITE = "#fff";

const settingsButtonStyle = {
  padding: "12px 24px",
  fontSize: "1rem",
  fontWeight: 600,
  borderRadius: "10px",
  border: "none",
  background: WHITE,
  color: MONUMENT,
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

export default function MapsSettings() {
  const [showFloorPlansModal, setShowFloorPlansModal] = useState(false);
  const [showQuoteSettingsModal, setShowQuoteSettingsModal] = useState(false);

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
        style={settingsButtonStyle}
      >
        Floor Plans
      </button>

      <button
        type="button"
        onClick={() => setShowQuoteSettingsModal(true)}
        style={settingsButtonStyle}
      >
        Quote
      </button>

      {showFloorPlansModal && (
        <FloorPlansModal onClose={() => setShowFloorPlansModal(false)} />
      )}

      {showQuoteSettingsModal && (
        <MapsQuoteSettingsModal onClose={() => setShowQuoteSettingsModal(false)} />
      )}
    </div>
  );
}
