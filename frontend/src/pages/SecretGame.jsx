import React, { useState } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";
import NightWalkerGame from "./NightWalkerGame";
import PlaygroundTrain from "./PlaygroundTrain";
import FlySwatGame from "./FlySwatGame";

const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

/**
 * Playground hub: mini-projects (routes from Home “Playground” → /inbox).
 */
export default function SecretGame() {
  const [activeGame, setActiveGame] = useState(null); // null | "nightWalker" | "train" | "flySwat"

  if (activeGame === "train") {
    return <PlaygroundTrain />;
  }

  if (activeGame === "flySwat") {
    return <FlySwatGame onBack={() => setActiveGame(null)} />;
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
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "1px",
          }}
        >
          Playground
        </h1>
        {activeGame != null && (
          <button
            type="button"
            onClick={() => setActiveGame(null)}
            style={{
              position: "absolute",
              right: "40px",
              padding: "8px 16px",
              borderRadius: "10px",
              border: "2px solid rgba(255,255,255,0.45)",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: WHITE,
              background: "rgba(255,255,255,0.12)",
              cursor: "pointer",
              outline: "none",
            }}
          >
            ← Menu
          </button>
        )}
      </div>

      {activeGame == null ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "calc(100vh - 140px)",
            padding: "24px 20px 80px",
            boxSizing: "border-box",
          }}
        >
          <p
            style={{
              margin: "0 0 28px",
              fontSize: "1.05rem",
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              maxWidth: "420px",
              lineHeight: 1.5,
            }}
          >
            Pick a mini-project to open it.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveGame("nightWalker")}
              style={{
                padding: "16px 28px",
                borderRadius: "14px",
                border: "2px solid #7cb342",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: WHITE,
                background: "#558b2f",
                cursor: "pointer",
                outline: "none",
                letterSpacing: "0.4px",
                minWidth: "200px",
              }}
            >
              Night Walker
            </button>
            <button
              type="button"
              onClick={() => setActiveGame("train")}
              style={{
                padding: "16px 28px",
                borderRadius: "14px",
                border: "2px solid #7986cb",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: WHITE,
                background: "#3949ab",
                cursor: "pointer",
                outline: "none",
                letterSpacing: "0.4px",
                minWidth: "200px",
              }}
            >
              Train
            </button>
            <button
              type="button"
              onClick={() => setActiveGame("flySwat")}
              style={{
                padding: "16px 28px",
                borderRadius: "14px",
                border: "2px solid #ffb74d",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: WHITE,
                background: "#f57c00",
                cursor: "pointer",
                outline: "none",
                letterSpacing: "0.4px",
                minWidth: "200px",
              }}
            >
              Fly Swat
            </button>
          </div>
        </div>
      ) : (
        <div style={{ margin: "0 auto 80px", maxWidth: "100%" }}>
          <NightWalkerGame embedded />
        </div>
      )}
    </div>
  );
}
