import React, { useState } from "react";
import { Link } from "react-router-dom";
import WalkingMan from "../components/WalkingMan.jsx";
import ScubaDive from "../components/ScubaDive.jsx";
import PlanetWalk from "../components/PlanetWalk.jsx";
import ForestDusk from "../components/ForestDusk.jsx";
import EscapeIsland from "../escapeIsland/EscapeIsland.jsx";
import Clockwork from "../clockwork/Clockwork.jsx";
import LostExpedition from "../lostExpedition/LostExpedition.jsx";
import { UI } from "../utils/uiThemeTokens.js";

const PAGE_TEXT = UI.pageText;

const hudButtonStyle = {
  color: PAGE_TEXT,
  fontSize: "0.8rem",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: 8,
  padding: "6px 12px",
  background: "rgba(6, 17, 39, 0.55)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const optionStyle = {
  width: 280,
  padding: "22px 20px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.38)",
  background: "rgba(6, 17, 39, 0.72)",
  color: PAGE_TEXT,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
};

function SandpitMenu({ onPick }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        overflowY: "auto",
        padding: "28px 16px",
        background:
          "radial-gradient(ellipse at 50% 115%, rgba(14, 92, 112, 0.85) 0%, rgba(7, 18, 28, 0.96) 52%, #05080c 100%)",
      }}
    >
      <div
        style={{
          color: PAGE_TEXT,
          fontSize: "0.78rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          opacity: 0.7,
        }}
      >
        Sandpit
      </div>
      <button type="button" style={optionStyle} onClick={() => onPick("kill")}>
        <div style={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "0.03em" }}>Kill Circle</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>100 on the grass</div>
      </button>
      <button type="button" style={{ ...optionStyle, borderColor: "rgba(140, 210, 230, 0.55)" }} onClick={() => onPick("scuba")}>
        <div style={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "0.03em" }}>Scuba</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>Swim the reef</div>
      </button>
      <button type="button" style={{ ...optionStyle, borderColor: "rgba(180, 160, 255, 0.7)" }} onClick={() => onPick("planet")}>
        <div style={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "0.03em" }}>Little Planet</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>Walk a tiny world</div>
      </button>
      <button type="button" style={{ ...optionStyle, borderColor: "rgba(150, 90, 190, 0.75)" }} onClick={() => onPick("forest")}>
        <div style={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "0.03em" }}>Dusk Wood</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>A heavy man in a dark forest</div>
      </button>
      <button type="button" style={{ ...optionStyle, borderColor: "rgba(80, 190, 140, 0.7)" }} onClick={() => onPick("island")}>
        <div style={{ fontSize: "1.35rem", fontWeight: 750, letterSpacing: "0.03em" }}>Escape Island</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>A small adventure</div>
      </button>
      <button type="button" style={{ ...optionStyle, borderColor: "rgba(212, 179, 106, 0.75)" }} onClick={() => onPick("clockwork")}>
        <div style={{ fontSize: "1.2rem", fontWeight: 750, letterSpacing: "0.02em", lineHeight: 1.25 }}>The Clockwork Conspiracy</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>A town adventure</div>
      </button>
      <button type="button" style={{ ...optionStyle, borderColor: "rgba(90, 170, 110, 0.75)" }} onClick={() => onPick("expedition")}>
        <div style={{ fontSize: "1.2rem", fontWeight: 750, letterSpacing: "0.02em", lineHeight: 1.25 }}>The Lost Expedition</div>
        <div style={{ marginTop: 6, fontSize: "0.82rem", opacity: 0.72 }}>A jungle adventure</div>
      </button>
    </div>
  );
}

export default function Sandpit() {
  const [mode, setMode] = useState(null);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#07141c",
      }}
    >
      {mode === null ? <SandpitMenu onPick={setMode} /> : null}
      {mode === "kill" ? <WalkingMan /> : null}
      {mode === "scuba" ? <ScubaDive key="turn-fix" /> : null}
      {mode === "planet" ? <PlanetWalk /> : null}
      {mode === "forest" ? <ForestDusk /> : null}
      {mode === "island" ? <EscapeIsland onExit={() => setMode(null)} /> : null}
      {mode === "clockwork" ? <Clockwork onExit={() => setMode(null)} /> : null}
      {mode === "expedition" ? <LostExpedition onExit={() => setMode(null)} /> : null}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 5, display: "flex", gap: 8 }}>
        <Link to="/projects" style={hudButtonStyle}>
          Back to Projects
        </Link>
        {mode ? (
          <button type="button" style={hudButtonStyle} onClick={() => setMode(null)}>
            Menu
          </button>
        ) : null}
      </div>
      {mode === "kill" ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 128,
            textAlign: "center",
            color: PAGE_TEXT,
            fontSize: "0.8rem",
            letterSpacing: "0.04em",
            opacity: 0.75,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          Drag to look around
        </div>
      ) : null}
    </div>
  );
}
