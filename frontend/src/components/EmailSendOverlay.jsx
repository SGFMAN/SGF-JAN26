import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const EmailSendOverlayContext = createContext(null);

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;

/**
 * Full-screen blocking overlay with a percentage bar while an email request is in flight.
 * Prevents double-submits and backdrop interaction while sending.
 */
export function EmailSendOverlayProvider({ children }) {
  const [state, setState] = useState({ show: false, percent: 0 });
  const intervalRef = useRef(null);

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const runWithEmailOverlay = useCallback(async (fn) => {
    clearTimer();
    setState({ show: true, percent: 0 });
    const t0 = Date.now();
    intervalRef.current = setInterval(() => {
      setState((s) => {
        if (!s.show) return s;
        const elapsed = Date.now() - t0;
        const p = Math.min(95, Math.floor((elapsed / 2200) * 95));
        return { ...s, percent: p };
      });
    }, 80);

    try {
      await fn();
      clearTimer();
      setState({ show: true, percent: 100 });
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      clearTimer();
      setState({ show: false, percent: 0 });
      throw e;
    }
    setState({ show: false, percent: 0 });
  }, []);

  return (
    <EmailSendOverlayContext.Provider value={{ runWithEmailOverlay }}>
      {children}
      {state.show && (
        <div
          role="dialog"
          aria-live="polite"
          aria-busy="true"
          aria-label="Sending email"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "26px 30px",
              minWidth: 300,
              maxWidth: "92vw",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "1.05rem",
                fontWeight: 600,
                color: MONUMENT,
                marginBottom: 14,
                textAlign: "center",
              }}
            >
              Sending email…
            </div>
            <div style={{ height: 12, background: "#e8e8ea", borderRadius: 6, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${state.percent}%`,
                  background: MONUMENT,
                  borderRadius: 6,
                  transition: "width 0.12s ease-out",
                }}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: "0.95rem",
                color: "#666",
                textAlign: "center",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {state.percent}%
            </div>
          </div>
        </div>
      )}
    </EmailSendOverlayContext.Provider>
  );
}

export function useEmailSendOverlay() {
  const ctx = useContext(EmailSendOverlayContext);
  if (!ctx) {
    return { runWithEmailOverlay: async (fn) => fn() };
  }
  return ctx;
}
