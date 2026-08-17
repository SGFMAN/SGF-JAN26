import React, { useEffect, useRef, useState } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const API_URL = "";
const RUN_BUTTON_ID = 3;

function mergeButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved, lineHeight: "1.2" } : fallback;
}

/** Inject focus helper so arrow-key games work even if the model forgot to focus. */
function withKeyboardFocusBoot(html) {
  const boot =
    "<script>(function(){function f(){try{var b=document.body;if(b){b.tabIndex=-1;b.focus();}window.focus();}catch(e){}}window.addEventListener('load',f);document.addEventListener('DOMContentLoaded',f);document.addEventListener('pointerdown',f);setTimeout(f,0);})();</script>";
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${boot}</body>`);
  }
  return `${html}${boot}`;
}

export default function Sandpit() {
  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const iframeRef = useRef(null);

  const runButtonStyle = mergeButtonStyle(RUN_BUTTON_ID, {
    padding: "10px 18px",
    borderRadius: "10px",
    border: FIELD_OUTLINE,
    background: UI.textPrimary,
    color: WHITE,
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  });

  function focusPlayArea() {
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      frame.focus();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!html) return undefined;
    const t = window.setTimeout(() => focusPlayArea(), 50);
    return () => window.clearTimeout(t);
  }, [html]);

  async function handleGenerate() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/sandpit/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Generate failed (${res.status})`);
      }
      if (!data.html) {
        throw new Error("No HTML returned");
      }
      setHtml(withKeyboardFocusBoot(String(data.html)));
    } catch (err) {
      console.error("Sandpit generate failed:", err);
      setError(err.message || "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        boxSizing: "border-box",
      }}
    >
      <div>
        <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
          Sandpit
        </h2>
        <div style={{ marginTop: "6px", fontSize: "0.9rem", color: UI.textMuted, fontWeight: 400 }}>
          Describe a game or interactive tool — AI builds it and runs it in the display below.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "Make a simple snake game" or "Build a tile colour picker with hex codes"'
          rows={4}
          disabled={busy}
          style={{
            width: "100%",
            resize: "vertical",
            minHeight: "96px",
            padding: "12px 14px",
            borderRadius: "10px",
            border: FIELD_OUTLINE,
            background: WHITE,
            color: MONUMENT,
            fontSize: "0.95rem",
            fontFamily: "inherit",
            lineHeight: 1.4,
            boxSizing: "border-box",
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void handleGenerate();
            }
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || !prompt.trim()}
            style={{
              ...runButtonStyle,
              opacity: busy || !prompt.trim() ? 0.6 : 1,
              cursor: busy || !prompt.trim() ? "default" : "pointer",
            }}
          >
            {busy ? "Building…" : "Build"}
          </button>
          {html ? (
            <button
              type="button"
              onClick={() => setHtml("")}
              disabled={busy}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: FIELD_OUTLINE,
                background: WHITE,
                color: MONUMENT,
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: busy ? "default" : "pointer",
              }}
            >
              Clear display
            </button>
          ) : null}
          <span style={{ fontSize: "0.8rem", color: UI.textMuted }}>
            Ctrl+Enter to build · click the display for arrow keys
          </span>
        </div>
        {error ? (
          <div style={{ color: "#b42318", fontSize: "0.9rem", fontWeight: 500 }}>{error}</div>
        ) : null}
      </div>

      <div
        role="presentation"
        onMouseDown={focusPlayArea}
        onClick={focusPlayArea}
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: "12px",
          border: FIELD_OUTLINE,
          background: WHITE,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {html ? (
          <iframe
            ref={iframeRef}
            title="Sandpit result"
            srcDoc={html}
            tabIndex={0}
            onLoad={focusPlayArea}
            sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              background: WHITE,
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: UI.textMuted,
              fontSize: "0.95rem",
              fontWeight: 400,
              padding: "24px",
              textAlign: "center",
            }}
          >
            {busy ? "Building your sandpit…" : "Result appears here"}
          </div>
        )}
      </div>
    </div>
  );
}
