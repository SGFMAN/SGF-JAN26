import React, { useState, useEffect, useCallback } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import { getApiHeaders } from "../utils/auth";
import "../pages/Overview.css";

const API_URL = "";
const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;

/**
 * Staff modal: invite clients to the Client Portal for this project.
 */
export default function ClientPortalInvite({ project, open, onClose }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const projectId = project?.id;

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/client-portal/members`, {
        headers: getApiHeaders(),
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Failed to load members");
      const data = await res.json();
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (e) {
      console.error(e);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setStatusMessage("");
    setStatusError("");
    loadMembers();
  }, [open, loadMembers]);

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
    setStatusMessage("");
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
      setStatusMessage(`Invitation sent to ${trimmed}`);
      setEmail("");
      setName("");
      await loadMembers();
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
                Client email
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
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Name (optional)
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
            {statusMessage ? (
              <div style={{ color: UI.textPrimary, fontSize: "0.95rem" }}>{statusMessage}</div>
            ) : null}
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

          <div>
            <h3 style={{ margin: "0 0 12px", fontSize: "1.05rem", fontWeight: 600 }}>
              Invited clients
            </h3>
            {loadingMembers ? (
              <div style={{ color: UI.textMuted }}>Loading…</div>
            ) : members.length === 0 ? (
              <div style={{ color: UI.textMuted }}>No clients invited yet.</div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {members.map((m) => (
                  <li
                    key={m.membershipId}
                    style={{
                      padding: "10px 12px",
                      background: UI.inputBg,
                      borderRadius: "8px",
                      marginBottom: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      <strong>{m.email}</strong>
                      {m.name ? ` — ${m.name}` : ""}
                    </span>
                    <span style={{ color: UI.textMuted, fontSize: "0.85rem" }}>
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
