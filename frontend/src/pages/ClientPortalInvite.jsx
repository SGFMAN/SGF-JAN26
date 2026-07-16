import React, { useState, useEffect, useCallback } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import { getApiHeaders } from "../utils/auth";

const API_URL = "";
const PAGE_TEXT = UI.pageText;
const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;

/**
 * Staff: invite clients to the Client Portal for this project.
 */
export default function ClientPortalInvite({ project }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

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
    loadMembers();
  }, [loadMembers]);

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "20px 24px",
        color: PAGE_TEXT,
        maxWidth: "640px",
      }}
    >
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.35rem", fontWeight: 600 }}>Client Portal</h2>
        <p style={{ margin: 0, opacity: 0.9, lineHeight: 1.45 }}>
          Invite a client to view a read-only overview of this project. They will receive a secure
          one-time login link by email.
        </p>
      </div>

      <form
        onSubmit={handleInvite}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          background: UI.panelBg,
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
              border: "none",
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
              border: "none",
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={sending || !email.trim()}
          style={{
            alignSelf: "flex-start",
            padding: "12px 20px",
            fontSize: "1rem",
            fontWeight: 500,
            color: UI.buttonPrimaryText,
            background: sending || !email.trim() ? "#666" : UI.buttonPrimary,
            border: "none",
            borderRadius: "8px",
            cursor: sending || !email.trim() ? "not-allowed" : "pointer",
          }}
        >
          {sending ? "Sending…" : "Invite Client"}
        </button>
        {statusMessage ? (
          <div style={{ color: "#8f8", fontSize: "0.95rem" }}>{statusMessage}</div>
        ) : null}
        {statusError ? (
          <div style={{ color: "#f88", fontSize: "0.95rem" }}>{statusError}</div>
        ) : null}
      </form>

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem", fontWeight: 600 }}>
          Invited clients
        </h3>
        {loadingMembers ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No clients invited yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {members.map((m) => (
              <li
                key={m.membershipId}
                style={{
                  padding: "10px 12px",
                  background: UI.panelBg,
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
                <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                  {m.active ? "Active" : "Inactive"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
