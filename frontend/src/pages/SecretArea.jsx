import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import NightWalkerCharacterWalk from "../components/NightWalkerCharacterWalk";
import SecretLevelEditorOverlay from "../components/SecretLevelEditorOverlay";
import {
  isSecretAreaSessionUnlocked,
  lockSecretAreaSession,
} from "../utils/secretAreaProject";
import { SECRET_GAME_SCENES, INITIAL_SCENE_INDEX } from "../Game/secretGameScenes";

const MONUMENT = "#323233";
const WHITE = "#fff";

export default function SecretArea() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || "/projects";
  const [roomFull, setRoomFull] = useState(false);
  const [terminalView, setTerminalView] = useState(false);
  const [levelEditorOpen, setLevelEditorOpen] = useState(() => Boolean(location.state?.openLevelEditor));
  const [terminalFrame, setTerminalFrame] = useState({ progress: 0, rect: null });
  const [doorwayFade, setDoorwayFade] = useState(0);
  const disconnectRef = useRef(null);
  const levelNavStartedRef = useRef(false);

  useEffect(() => {
    if (!isSecretAreaSessionUnlocked()) {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo]);

  useEffect(() => {
    if (!location.state?.openLevelEditor) return;
    setLevelEditorOpen(true);
    navigate(location.pathname, {
      replace: true,
      state: { returnTo: location.state.returnTo || returnTo },
    });
  }, [location.key, location.pathname, location.state?.openLevelEditor, location.state?.returnTo, navigate, returnTo]);

  const handleDoorwayEntered = useCallback(() => {
    if (levelNavStartedRef.current) return;
    levelNavStartedRef.current = true;
    disconnectRef.current?.();
    navigate("/secret-area/level", {
      state: {
        sceneId: SECRET_GAME_SCENES[INITIAL_SCENE_INDEX].id,
        returnTo: "/secret-area",
        secretReturnTo: returnTo,
      },
    });
  }, [navigate, returnTo]);

  const handleTerminalFrame = useCallback((frame) => {
    setTerminalFrame((prev) => {
      if (prev.progress === frame.progress) {
        const a = prev.rect;
        const b = frame.rect;
        if (!a && !b) return prev;
        if (a && b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height) {
          return prev;
        }
      }
      return frame;
    });
  }, []);

  const closeTerminal = useCallback(() => {
    setTerminalView(false);
    setLevelEditorOpen(false);
    setTerminalFrame({ progress: 0, rect: null });
  }, []);

  const SCREEN_GREEN = "#22ff88";
  const SCREEN_BG = "#061a10";
  const BEZEL = "#1e2228";

  function handleBack() {
    disconnectRef.current?.();
    lockSecretAreaSession();
    navigate(returnTo);
  }

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
          onClick={handleBack}
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

  const showTerminalMenu =
    !levelEditorOpen && terminalView && terminalFrame.progress > 0 && terminalFrame.rect;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#061127",
        overflow: "hidden",
      }}
    >
      <NightWalkerCharacterWalk
        disconnectRef={disconnectRef}
        onRoomFull={() => setRoomFull(true)}
        terminalViewActive={terminalView}
        onTerminalOpen={() => setTerminalView(true)}
        onTerminalFrame={handleTerminalFrame}
        onDoorwayFade={setDoorwayFade}
        onDoorwayEntered={handleDoorwayEntered}
      />
      {doorwayFade > 0 ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            background: "#000",
            opacity: doorwayFade,
            pointerEvents: doorwayFade >= 1 ? "auto" : "none",
          }}
        />
      ) : null}
      {showTerminalMenu ? (
        <TerminalZoomOverlay
          frame={terminalFrame.rect}
          screenBg={SCREEN_BG}
          screenGreen={SCREEN_GREEN}
          bezel={BEZEL}
          progress={terminalFrame.progress}
          onLevelEditor={() => setLevelEditorOpen(true)}
          onExit={closeTerminal}
        />
      ) : null}
      {levelEditorOpen && terminalFrame.rect ? (
        <SecretLevelEditorOverlay
          frame={terminalFrame.rect}
          bezel={BEZEL}
          onBackToMenu={() => setLevelEditorOpen(false)}
        />
      ) : null}
      <button
        type="button"
        onClick={handleBack}
        style={{
          position: "absolute",
          top: "24px",
          left: "24px",
          zIndex:
            levelEditorOpen && terminalFrame.rect ? 60 : showTerminalMenu && terminalFrame.progress > 0.5 ? 5 : 10,
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

function TerminalZoomOverlay({ frame, screenBg, screenGreen, bezel, progress, onLevelEditor, onExit }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Computer terminal"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 15,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          boxSizing: "border-box",
          background: screenBg,
          border: `${Math.max(4, frame.width * 0.018)}px solid ${bezel}`,
          borderRadius: "4px",
          boxShadow: "0 0 48px rgba(34, 255, 136, 0.35), inset 0 0 80px rgba(34, 255, 136, 0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "clamp(8px, 2vh, 20px)",
          fontFamily: "Consolas, Monaco, monospace",
          color: screenGreen,
          pointerEvents: progress > 0.85 ? "auto" : "none",
          opacity: Math.min(1, Math.max(0, (progress - 0.55) / 0.35)),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: "clamp(0.65rem, 1.6vw, 0.85rem)",
            opacity: 0.7,
            letterSpacing: "0.12em",
          }}
        >
          SGF TERMINAL
        </div>
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "clamp(6px, 1.2vh, 12px)",
            width: "min(280px, 72%)",
          }}
        >
          <button type="button" onClick={onLevelEditor} style={terminalMenuButtonStyle}>
            Level Editor
          </button>
          <button type="button" onClick={onExit} style={terminalMenuButtonStyle}>
            Exit
          </button>
        </nav>
      </div>
    </div>
  );
}

const terminalMenuButtonStyle = {
  width: "100%",
  padding: "16px 20px",
  fontSize: "1.15rem",
  fontWeight: 700,
  fontFamily: "Consolas, Monaco, monospace",
  letterSpacing: "0.08em",
  color: "#061a10",
  background: "#22ff88",
  border: "2px solid #3dff9a",
  borderRadius: "6px",
  cursor: "pointer",
  textAlign: "center",
  transition: "filter 0.15s",
};
