import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NightWalkerCharacterWalk from "../components/NightWalkerCharacterWalk";

const MONUMENT = "#323233";
const WHITE = "#fff";

export default function SecretArea() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/projects";
  const [roomFull, setRoomFull] = useState(false);

  if (roomFull) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#061127",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          boxSizing: "border-box",
          gap: "28px",
        }}
      >
        <p
          style={{
            margin: 0,
            color: WHITE,
            fontSize: "1.5rem",
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.5px",
          }}
        >
          ROOM FULL - Come back later
        </p>
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          style={{
            padding: "28px 56px",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: MONUMENT,
            background: WHITE,
            border: "none",
            borderRadius: "14px",
            cursor: "pointer",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.25)",
            letterSpacing: "0.5px",
          }}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#061127",
        overflow: "hidden",
      }}
    >
      <NightWalkerCharacterWalk onRoomFull={() => setRoomFull(true)} />
      <button
        type="button"
        onClick={() => navigate(returnTo)}
        style={{
          position: "absolute",
          top: "24px",
          left: "24px",
          zIndex: 10,
          padding: "28px 56px",
          fontSize: "1.75rem",
          fontWeight: 700,
          color: MONUMENT,
          background: WHITE,
          border: "none",
          borderRadius: "14px",
          cursor: "pointer",
          boxShadow: "0 8px 28px rgba(0, 0, 0, 0.25)",
          letterSpacing: "0.5px",
        }}
      >
        Back
      </button>
    </div>
  );
}
