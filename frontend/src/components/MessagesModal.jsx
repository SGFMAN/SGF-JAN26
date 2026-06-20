import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getApiHeaders, getLoggedInUserId } from "../utils/auth";
import { UI, MENU } from "../utils/uiThemeTokens";

const API_URL = "";

function formatMessageDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const actionButtonStyle = {
  border: "none",
  borderRadius: "10px",
  padding: "10px 16px",
  fontSize: "0.95rem",
  fontWeight: 500,
  cursor: "pointer",
};

export default function MessagesModal({ open, onClose, onInboxChange }) {
  const loggedInUserId = getLoggedInUserId();
  const [view, setView] = useState("inbox");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [composeError, setComposeError] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [toUserId, setToUserId] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const recipientOptions = useMemo(
    () =>
      users
        .filter((user) => String(user.id) !== String(loggedInUserId))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })),
    [users, loggedInUserId]
  );

  const resetCompose = useCallback(() => {
    setToUserId("");
    setComposeBody("");
    setComposeError("");
  }, []);

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    setInboxError("");
    try {
      const response = await fetch(`${API_URL}/api/messages/inbox`, {
        headers: getApiHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to load inbox");
      }
      setMessages(Array.isArray(data) ? data : []);
      onInboxChange?.();
    } catch (err) {
      setInboxError(err.message || "Failed to load inbox");
      setMessages([]);
    } finally {
      setLoadingInbox(false);
    }
  }, [onInboxChange]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch(`${API_URL}/api/users/names`);
      if (!response.ok) throw new Error("Failed to load users");
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setView("inbox");
      setSelectedMessage(null);
      resetCompose();
      return;
    }

    loadInbox();
    loadUsers();
  }, [open, loadInbox, loadUsers, resetCompose]);

  async function openMessage(message) {
    setDeleteError("");
    setSelectedMessage(message);
    setView("read");

    if (message.read_at) {
      return;
    }

    const optimisticReadAt = new Date().toISOString();
    setSelectedMessage({ ...message, read_at: optimisticReadAt });

    try {
      const response = await fetch(`${API_URL}/api/messages/${message.id}/read`, {
        method: "PATCH",
        headers: getApiHeaders(),
      });
      if (!response.ok) return;
      const updated = await response.json();
      setMessages((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? { ...item, ...updated, from_user_name: message.from_user_name }
            : item
        )
      );
      setSelectedMessage((prev) =>
        prev?.id === updated.id ? { ...prev, ...updated } : prev
      );
      onInboxChange?.();
    } catch {
      // ignore — message still readable
    }
  }

  function handleOk() {
    setSelectedMessage(null);
    setView("inbox");
  }

  function backToInbox() {
    setSelectedMessage(null);
    setView("inbox");
  }

  async function handleDelete() {
    if (!selectedMessage?.read_at) {
      return;
    }

    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`${API_URL}/api/messages/${selectedMessage.id}`, {
        method: "DELETE",
        headers: getApiHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete message");
      }
      setSelectedMessage(null);
      setView("inbox");
      await loadInbox();
    } catch (err) {
      setDeleteError(err.message || "Failed to delete message");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSend() {
    setComposeError("");
    if (!toUserId) {
      setComposeError("Select a recipient");
      return;
    }
    if (!composeBody.trim()) {
      setComposeError("Enter a message");
      return;
    }

    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/messages`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({
          toUserId: Number(toUserId),
          body: composeBody.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Failed to send message");
      }
      resetCompose();
      setView("inbox");
      await loadInbox();
    } catch (err) {
      setComposeError(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function handleCancelCompose() {
    resetCompose();
    setView("inbox");
  }

  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10006,
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="messages-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.cardBg,
          borderRadius: "16px",
          padding: "28px 32px",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "min(85vh, 720px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          color: UI.textPrimary,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "20px",
            flexShrink: 0,
          }}
        >
          <h2
            id="messages-modal-title"
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 600,
              color: UI.textPrimary,
            }}
          >
            Messages
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {view === "inbox" && (
              <button
                type="button"
                onClick={() => {
                  resetCompose();
                  setView("compose");
                }}
                style={{
                  ...actionButtonStyle,
                  background: MENU.blueActive,
                  color: MENU.activeText,
                }}
              >
                New
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                border: "none",
                background: "transparent",
                fontSize: "1.5rem",
                lineHeight: 1,
                cursor: "pointer",
                color: UI.textPrimary,
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {view === "compose" && (
            <>
              <div>
                <label
                  htmlFor="message-recipient"
                  style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "0.95rem" }}
                >
                  To
                </label>
                <select
                  id="message-recipient"
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  disabled={loadingUsers || sending}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${UI.outline}`,
                    fontSize: "0.95rem",
                    color: UI.textPrimary,
                    background: UI.inputBg,
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">{loadingUsers ? "Loading users…" : "Select a user"}</option>
                  {recipientOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minHeight: "160px", display: "flex", flexDirection: "column" }}>
                <label
                  htmlFor="message-body"
                  style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "0.95rem" }}
                >
                  Message
                </label>
                <textarea
                  id="message-body"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  disabled={sending}
                  placeholder="Type your message…"
                  style={{
                    flex: 1,
                    minHeight: "160px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${UI.outline}`,
                    fontSize: "0.95rem",
                    color: UI.textPrimary,
                    background: UI.inputBg,
                    resize: "vertical",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {composeError && (
                <p style={{ margin: 0, color: "#cc3333", fontSize: "0.9rem" }}>{composeError}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleCancelCompose}
                  disabled={sending}
                  style={{
                    ...actionButtonStyle,
                    background: UI.panelBg,
                    color: UI.textPrimary,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  style={{
                    ...actionButtonStyle,
                    background: MENU.greenActive,
                    color: MENU.activeText,
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}

          {view === "read" && selectedMessage && (
            <>
              <button
                type="button"
                onClick={backToInbox}
                style={{
                  alignSelf: "flex-start",
                  border: "none",
                  background: "transparent",
                  color: UI.textSecondary,
                  cursor: "pointer",
                  padding: 0,
                  fontSize: "0.9rem",
                }}
              >
                ← Back to inbox
              </button>
              <div
                style={{
                  background: UI.inputBg,
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <div style={{ marginBottom: "8px", fontWeight: 600, fontSize: "1rem" }}>
                  From: {selectedMessage.from_user_name || "Unknown user"}
                </div>
                <div style={{ marginBottom: "16px", fontSize: "0.85rem", color: UI.textMuted }}>
                  {formatMessageDate(selectedMessage.created_at)}
                </div>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                    fontSize: "0.95rem",
                    color: UI.textPrimary,
                  }}
                >
                  {selectedMessage.body}
                </div>
              </div>

              {deleteError && (
                <p style={{ margin: 0, color: "#cc3333", fontSize: "0.9rem" }}>{deleteError}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={handleOk}
                  disabled={deleting}
                  style={{
                    ...actionButtonStyle,
                    background: MENU.greenActive,
                    color: MENU.activeText,
                  }}
                >
                  OK
                </button>
                {selectedMessage.read_at && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      ...actionButtonStyle,
                      background: "#cc3333",
                      color: "var(--sgf-page-text)",
                      opacity: deleting ? 0.7 : 1,
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            </>
          )}

          {view === "inbox" && (
            <>
              <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>Inbox</h3>

              {loadingInbox && (
                <p style={{ margin: 0, color: UI.textMuted }}>Loading messages…</p>
              )}

              {inboxError && !loadingInbox && (
                <p style={{ margin: 0, color: "#cc3333" }}>{inboxError}</p>
              )}

              {!loadingInbox && !inboxError && messages.length === 0 && (
                <p style={{ margin: 0, color: UI.textMuted }}>No messages yet.</p>
              )}

              {!loadingInbox && messages.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {messages.map((message) => {
                    const unread = !message.read_at;
                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => openMessage(message)}
                        style={{
                          textAlign: "left",
                          border: `1px solid ${UI.outline}`,
                          borderRadius: "10px",
                          padding: "12px 14px",
                          background: unread ? UI.inputBg : UI.cardBg,
                          cursor: "pointer",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "center",
                          }}
                        >
                          <span style={{ fontWeight: unread ? 700 : 600, color: UI.textPrimary }}>
                            {message.from_user_name || "Unknown user"}
                          </span>
                          <span style={{ fontSize: "0.8rem", color: UI.textMuted, flexShrink: 0 }}>
                            {formatMessageDate(message.created_at)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
