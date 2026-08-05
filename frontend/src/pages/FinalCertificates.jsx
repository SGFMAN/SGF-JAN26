import React, { useRef, useState } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { resolveActiveClientContactToEmails } from "../utils/emailGeneralSettings";
import { resolveLoggedInUserEmailTokens } from "../utils/emailUserTokens";
import { UI, outlineBorder } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const SECTION_GREY = UI.panelBg;
const API_URL = "";

function projectAddressLabel(project) {
  if (project?.street && project?.suburb) {
    return `${project.street}, ${project.suburb}`.trim();
  }
  return project?.name || (project?.id != null ? `Project #${project.id}` : "Project");
}

function defaultSubject(project) {
  return `Final Handover Documents — ${projectAddressLabel(project)}`;
}

function defaultBody(project) {
  return (
    `Hi,\n\n` +
    `Please find attached the final handover documents for ${projectAddressLabel(project)}.\n\n` +
    `Kind regards`
  );
}

function plainTextToEmailHtml(text) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return paragraphs || "<p></p>";
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedAttachment(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return true;
  if (
    type === "application/zip" ||
    type === "application/x-zip-compressed" ||
    type === "application/x-zip" ||
    name.endsWith(".zip")
  ) {
    return true;
  }
  return false;
}

/**
 * Construction → Final Certificates.
 * Drag-drop PDF or ZIP from the job folder (memory only) → Email opens a preview modal.
 */
export default function FinalCertificates({ project }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const fileInputRef = useRef(null);

  /** In-memory attachments only — not saved to the project. Ready for multiple later. */
  const [attachments, setAttachments] = useState([]);
  const [dragging, setDragging] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [preparingModal, setPreparingModal] = useState(false);

  function clearFileInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addAttachmentFile(file) {
    if (!file) return;
    if (!isAllowedAttachment(file)) {
      alert("Please drop or select a PDF or ZIP file.");
      return;
    }
    // Single file for now — replace any existing attachment.
    setAttachments([
      {
        id: `${Date.now()}-${file.name || "file"}`,
        file,
        name: file.name || "Final-Handover-Documents.pdf",
        size: file.size || 0,
      },
    ]);
    clearFileInput();
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    clearFileInput();
  }

  function clearAllAttachments() {
    setAttachments([]);
    clearFileInput();
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addAttachmentFile(files[0]);
    }
  }

  async function openEmailModal() {
    if (attachments.length === 0) {
      alert("Drop or select the final handover PDF or ZIP first.");
      return;
    }
    setPreparingModal(true);
    setShowEmailModal(true);
    try {
      const toEmails = resolveActiveClientContactToEmails(project);
      const userTokens = await resolveLoggedInUserEmailTokens();
      const fromEmail = String(userTokens.UserEmail || "").trim();
      setEmailTo(toEmails.join(", "));
      setEmailFrom(fromEmail);
      setEmailSubject(defaultSubject(project));
      setEmailBody(defaultBody(project));
    } catch (err) {
      console.error("Final Certificates: failed to prepare email preview", err);
      alert(err.message || "Failed to prepare email preview.");
      setShowEmailModal(false);
    } finally {
      setPreparingModal(false);
    }
  }

  function closeEmailModal() {
    if (sending) return;
    setShowEmailModal(false);
  }

  async function handleSend() {
    const toAddresses = emailTo
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert(
        "No client email addresses. Check at least one contact under Client Info, or enter an address in To."
      );
      return;
    }
    if (!emailFrom.trim()) {
      alert(
        "From address is required. Add your email under Settings → Users so emails can send From your address."
      );
      return;
    }
    if (attachments.length === 0) {
      alert("Drop or select the final handover PDF or ZIP first.");
      return;
    }

    setSending(true);
    try {
      await runWithEmailOverlay(async () => {
        const form = new FormData();
        form.append("to", toAddresses.join(","));
        form.append("from", emailFrom.trim());
        form.append("subject", emailSubject || "");
        form.append("htmlBody", plainTextToEmailHtml(emailBody));
        // Memory-only attach — omit projectId so proposal PDF is not auto-attached.
        const first = attachments[0];
        form.append("attachment", first.file, first.name);

        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      });

      clearAllAttachments();
      setShowEmailModal(false);
      alert("Final handover email sent.");
    } catch (err) {
      console.error("Final Certificates send error:", err);
      alert(err.message || "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: outlineBorder,
    fontSize: "0.95rem",
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.9rem",
    color: UI.textMuted,
    marginBottom: "6px",
    fontWeight: 500,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        gap: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "6px", color: MONUMENT }}>
            Final Certificates
          </h2>
          <p style={{ margin: 0, color: UI.textMuted, fontSize: "0.9rem", lineHeight: 1.45 }}>
            Drag the final handover PDF or ZIP from the project folder. It is not saved here — only
            attached when you send the email, then cleared.
          </p>
        </div>
        <button
          type="button"
          onClick={openEmailModal}
          disabled={attachments.length === 0}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#4D93D9",
            color: PAGE_TEXT,
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: attachments.length === 0 ? "not-allowed" : "pointer",
            opacity: attachments.length === 0 ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          Email Client
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "24px",
          alignItems: "start",
          maxWidth: "900px",
        }}
      >
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
          }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? MONUMENT : UI.outline}`,
            borderRadius: "12px",
            padding: "36px 20px",
            background: dragging ? "rgba(50,50,51,0.05)" : WHITE,
            textAlign: "center",
            cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
            minHeight: "160px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: MONUMENT, marginBottom: "8px" }}>
            Drop final handover PDF or ZIP here
          </div>
          <div style={{ fontSize: "0.85rem", color: UI.textMuted }}>
            or click to browse — PDF or ZIP only, not stored on this page
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed"
            style={{ display: "none" }}
            onChange={(e) => addAttachmentFile(e.target.files?.[0])}
          />
        </div>

        <div
          style={{
            background: WHITE,
            borderRadius: "10px",
            padding: "14px 16px",
            border: outlineBorder,
            minHeight: "160px",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: MONUMENT, marginBottom: "12px" }}>
            Attachments
          </div>
          {attachments.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.88rem", color: UI.textMuted }}>
              No file attached yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {attachments.map((item) => (
                <li
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: SECTION_GREY,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={item.name}
                    >
                      {item.name}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: UI.textMuted, marginTop: "2px" }}>
                      {formatFileSize(item.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(item.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "6px",
                      border: outlineBorder,
                      background: WHITE,
                      color: MONUMENT,
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showEmailModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeEmailModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "720px",
              width: "92%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "8px", color: MONUMENT }}>
              Final Handover Email
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: UI.textMuted }}>
              To: checked Client Info contacts. Attachment:{" "}
              {attachments.map((a) => a.name).join(", ") || "—"}
            </p>

            {preparingModal ? (
              <p style={{ color: UI.textMuted }}>Preparing…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "18px" }}>
                <div>
                  <label style={labelStyle}>To (comma-separated)</label>
                  <input
                    type="text"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    disabled={sending}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>From</label>
                  <input
                    type="text"
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    disabled={sending}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    disabled={sending}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Body</label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    disabled={sending}
                    rows={10}
                    style={{
                      ...inputStyle,
                      resize: "vertical",
                      fontFamily: "inherit",
                      lineHeight: 1.45,
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={closeEmailModal}
                disabled={sending}
                style={{
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: outlineBorder,
                  borderRadius: "8px",
                  cursor: sending ? "not-allowed" : "pointer",
                  opacity: sending ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || preparingModal || attachments.length === 0}
                style={{
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: PAGE_TEXT,
                  background: "#4D93D9",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    sending || preparingModal || attachments.length === 0
                      ? "not-allowed"
                      : "pointer",
                  opacity: sending || preparingModal || attachments.length === 0 ? 0.7 : 1,
                }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
