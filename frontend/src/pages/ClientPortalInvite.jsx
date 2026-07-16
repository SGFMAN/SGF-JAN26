import React, { useState, useEffect } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import { getApiHeaders } from "../utils/auth";
import "../pages/Overview.css";

const API_URL = "";
const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;

/**
 * Staff modal: invite a client to the Client Portal for this project.
 * Name/email default from the selected contact but remain editable.
 */
export default function ClientPortalInvite({ project, open, onClose, defaultName = "", defaultEmail = "" }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [statusError, setStatusError] = useState("");

  const projectId = project?.id;

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail || "");
    setName(defaultName || "");
    setStatusError("");
  }, [open, defaultEmail, defaultName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!projectId) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setStatusError("Enter a client email address");
      return;
    }

    setSending(true);
    setStatusError("");
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/client-portal/invite`, {
        method: "POST",
        headers: {
          ...getApiHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          email: trimmed,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }
      onClose?.();
    } catch (err) {
      setStatusError(err.message || "Failed to send invitation");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="overview-modal-backdrop"
      onClick={() => onClose?.()}
      role="presentation"
    >
      <div
        className="overview-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-portal-invite-title"
        style={{ maxWidth: "480px" }}
      >
        <button
          type="button"
          onClick={() => onClose?.()}
          className="overview-modal-close"
          aria-label="Close"
        >
          ×
        </button>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            color: MONUMENT,
          }}
        >
          <div>
            <h2
              id="client-portal-invite-title"
              style={{ margin: "0 0 8px", fontSize: "1.35rem", fontWeight: 600 }}
            >
              Invite Client
            </h2>
            <p style={{ margin: 0, color: UI.textMuted, lineHeight: 1.45 }}>
              Send a secure one-time login link so the client can view a read-only overview of this
              project.
            </p>
          </div>

          <form
            onSubmit={handleInvite}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              background: UI.inputBg,
              padding: "18px",
              borderRadius: "10px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client name"
                disabled={sending}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${UI.outline}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                disabled={sending}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${UI.outline}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                required
              />
            </div>
            {statusError ? (
              <div style={{ color: "#b33", fontSize: "0.95rem" }}>{statusError}</div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => onClose?.()}
                style={{
                  padding: "10px 18px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${UI.outline}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="submit"
                disabled={sending || !email.trim()}
                style={{
                  padding: "10px 18px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: UI.buttonPrimaryText,
                  background: sending || !email.trim() ? "#999" : UI.buttonPrimary,
                  border: "none",
                  borderRadius: "8px",
                  cursor: sending || !email.trim() ? "not-allowed" : "pointer",
                }}
              >
                {sending ? "Sending…" : "Invite Client"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
