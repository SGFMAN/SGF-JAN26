import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getLoggedInUserId, getLoggedInUserName, isAuthenticated } from "../utils/auth";
import UserSettingsModal from "./UserSettingsModal";
import { UI, MENU } from "../utils/uiThemeTokens";

const API_URL = "";
const MONUMENT = UI.textPrimary;
const PANEL_TRANSITION_MS = 300;

const AVATAR_COLORS = [
  "#E57373",
  "#F06292",
  "#BA68C8",
  "#7986CB",
  "#64B5F6",
  "#4DB6AC",
  "#81C784",
  "#FFD54F",
  "#FFB74D",
  "#A1887F",
];

function avatarColorForUser(userId) {
  const n = parseInt(userId, 10) || 0;
  return AVATAR_COLORS[Math.abs(n) % AVATAR_COLORS.length];
}

function initialFromName(name) {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export default function LoggedInUserButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userName, setUserName] = useState(() => getLoggedInUserName());

  const show = isAuthenticated() && location.pathname !== "/";

  useEffect(() => {
    if (!show) return;

    const storedName = getLoggedInUserName();
    if (storedName) {
      setUserName(storedName);
      return;
    }

    const userId = getLoggedInUserId();
    if (!userId) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/users`);
        if (!response.ok) return;
        const users = await response.json();
        const user = users.find((u) => u.id === parseInt(userId, 10));
        if (!cancelled && user?.name) {
          setUserName(user.name);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show, location.pathname]);

  useEffect(() => {
    if (!open) {
      setSlideIn(false);
      return;
    }

    setSlideIn(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlideIn(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function closePanel() {
    setSlideIn(false);
    window.setTimeout(() => setOpen(false), PANEL_TRANSITION_MS);
  }

  if (!show) {
    return null;
  }

  const userId = getLoggedInUserId();
  const initial = initialFromName(userName);
  const bgColor = avatarColorForUser(userId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={userName || "Account"}
        aria-label={userName ? `Account: ${userName}` : "Account"}
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          zIndex: 10001,
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "none",
          background: bgColor,
          color: "#fff",
          fontSize: "1.1rem",
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          padding: 0,
        }}
      >
        {initial}
      </button>

      {open && (
        <>
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              background: slideIn ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0)",
              zIndex: 10002,
              transition: `background ${PANEL_TRANSITION_MS}ms ease-in-out`,
              pointerEvents: "none",
            }}
          />
          <aside
            onMouseLeave={closePanel}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(320px, 90vw)",
              background: UI.cardBg,
              zIndex: 10003,
              boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              padding: "24px",
              boxSizing: "border-box",
              transform: slideIn ? "translateX(0)" : "translateX(100%)",
              transition: `transform ${PANEL_TRANSITION_MS}ms ease-in-out`,
            }}
          >
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close"
              style={{
                alignSelf: "flex-end",
                border: "none",
                background: "transparent",
                fontSize: "1.5rem",
                lineHeight: 1,
                cursor: "pointer",
                color: UI.textPrimary,
                padding: "4px 8px",
                marginBottom: "16px",
              }}
            >
              ×
            </button>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: bgColor,
                    color: "#fff",
                    fontSize: "1.5rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </div>
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "1.1rem",
                      color: UI.textPrimary,
                      lineHeight: 1.4,
                    }}
                  >
                    Logged in as:
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: "1.1rem",
                      color: UI.textPrimary,
                      lineHeight: 1.4,
                      fontWeight: 600,
                    }}
                  >
                    {userName || "Unknown user"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                style={{
                  marginTop: "20px",
                  background: MENU.greenActive,
                  color: MENU.activeText,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "center",
                }}
              >
                My Settings...
              </button>
            </div>
          </aside>
        </>
      )}

      <UserSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userName={userName}
      />
    </>
  );
}
