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

function isPdfFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

function isZipFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return (
    type === "application/zip" ||
    type === "application/x-zip-compressed" ||
    type === "application/x-zip" ||
    name.endsWith(".zip")
  );
}

function makeAttachmentItem(file, fallbackName) {
  return {
    id: `${Date.now()}-${file.name || fallbackName}`,
    file,
    name: file.name || fallbackName,
    size: file.size || 0,
  };
}

/**
 * Construction → Final Certificates.
 * Separate PDF + ZIP drop zones (memory only) → Email preview attaches both.
 */
export default function FinalCertificates({ project }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const pdfInputRef = useRef(null);
  const zipInputRef = useRef(null);

  const [pdfAttachment, setPdfAttachment] = useState(null);
  const [zipAttachment, setZipAttachment] = useState(null);
  const [pdfDragging, setPdfDragging] = useState(false);
  const [zipDragging, setZipDragging] = useState(false);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [preparingModal, setPreparingModal] = useState(false);

  const attachmentList = [pdfAttachment, zipAttachment].filter(Boolean);
  const hasAnyAttachment = attachmentList.length > 0;

  function setPdfFile(file) {
    if (!file) return;
    if (!isPdfFile(file)) {
      alert("Please drop or select a PDF file in the PDF zone.");
      return;
    }
    setPdfAttachment(makeAttachmentItem(file, "Final-Handover.pdf"));
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  function setZipFile(file) {
    if (!file) return;
    if (!isZipFile(file)) {
      alert("Please drop or select a ZIP file in the ZIP zone.");
      return;
    }
    setZipAttachment(makeAttachmentItem(file, "Final-Handover.zip"));
    if (zipInputRef.current) zipInputRef.current.value = "";
  }

  function clearAllAttachments() {
    setPdfAttachment(null);
    setZipAttachment(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (zipInputRef.current) zipInputRef.current.value = "";
  }

  function makeDropHandlers(kind) {
    const setDragging = kind === "pdf" ? setPdfDragging : setZipDragging;
    const applyFile = kind === "pdf" ? setPdfFile : setZipFile;
    return {
      onDragEnter: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      },
      onDragOver: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      },
      onDragLeave: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
      },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) applyFile(files[0]);
      },
    };
  }

  async function openEmailModal() {
    if (!hasAnyAttachment) {
      alert("Add the PDF and/or ZIP attachment first.");
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
    if (!hasAnyAttachment) {
      alert("Add the PDF and/or ZIP attachment first.");
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
        // Memory-only — omit projectId so proposal PDF is not auto-attached.
        for (const item of attachmentList) {
          form.append("attachments", item.file, item.name);
        }

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

  function renderDropZone({
    title,
    hint,
    dragging,
    handlers,
    inputRef,
    accept,
    onSelect,
    current,
    onClear,
  }) {
    return (
      <div>
        <div style={{ fontSize: "0.9rem", fontWeight: 600, color: MONUMENT, marginBottom: "8px" }}>
          {title}
        </div>
        <div
          {...handlers}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? MONUMENT : UI.outline}`,
            borderRadius: "12px",
            padding: "28px 18px",
            background: dragging ? "rgba(50,50,51,0.05)" : WHITE,
            textAlign: "center",
            cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
            minHeight: "110px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: "0.92rem", fontWeight: 600, color: MONUMENT, marginBottom: "6px" }}>
            {current ? current.name : `Drop ${title} here`}
          </div>
          <div style={{ fontSize: "0.82rem", color: UI.textMuted }}>
            {current ? "Click to replace" : hint}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => onSelect(e.target.files?.[0])}
          />
        </div>
        {current ? (
          <div style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              style={{
                padding: "6px 10px",
                borderRadius: "6px",
                border: outlineBorder,
                background: WHITE,
                color: MONUMENT,
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>
    );
  }

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
            Drag the PDF and ZIP from the project folder. Files are not saved here — they are only
            attached when you send, then cleared.
          </p>
        </div>
        <button
          type="button"
          onClick={openEmailModal}
          disabled={!hasAnyAttachment}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#4D93D9",
            color: PAGE_TEXT,
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: !hasAnyAttachment ? "not-allowed" : "pointer",
            opacity: !hasAnyAttachment ? 0.6 : 1,
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
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {renderDropZone({
            title: "PDF",
            hint: "or click to browse — PDF only",
            dragging: pdfDragging,
            handlers: makeDropHandlers("pdf"),
            inputRef: pdfInputRef,
            accept: ".pdf,application/pdf",
            onSelect: setPdfFile,
            current: pdfAttachment,
            onClear: () => {
              setPdfAttachment(null);
              if (pdfInputRef.current) pdfInputRef.current.value = "";
            },
          })}
          {renderDropZone({
            title: "ZIP",
            hint: "or click to browse — ZIP only",
            dragging: zipDragging,
            handlers: makeDropHandlers("zip"),
            inputRef: zipInputRef,
            accept: ".zip,application/zip,application/x-zip-compressed",
            onSelect: setZipFile,
            current: zipAttachment,
            onClear: () => {
              setZipAttachment(null);
              if (zipInputRef.current) zipInputRef.current.value = "";
            },
          })}
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
          {attachmentList.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.88rem", color: UI.textMuted }}>
              No files attached yet.
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {pdfAttachment ? (
                <li
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
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: UI.textMuted }}>
                      PDF
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={pdfAttachment.name}
                    >
                      {pdfAttachment.name}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: UI.textMuted, marginTop: "2px" }}>
                      {formatFileSize(pdfAttachment.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPdfAttachment(null);
                      if (pdfInputRef.current) pdfInputRef.current.value = "";
                    }}
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
              ) : null}
              {zipAttachment ? (
                <li
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
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: UI.textMuted }}>
                      ZIP
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={zipAttachment.name}
                    >
                      {zipAttachment.name}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: UI.textMuted, marginTop: "2px" }}>
                      {formatFileSize(zipAttachment.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setZipAttachment(null);
                      if (zipInputRef.current) zipInputRef.current.value = "";
                    }}
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
              ) : null}
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
              To: checked Client Info contacts. Attachments:{" "}
              {attachmentList.map((a) => a.name).join(", ") || "—"}
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
                disabled={sending || preparingModal || !hasAnyAttachment}
                style={{
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: PAGE_TEXT,
                  background: "#4D93D9",
                  border: "none",
                  borderRadius: "8px",
                  cursor:
                    sending || preparingModal || !hasAnyAttachment ? "not-allowed" : "pointer",
                  opacity: sending || preparingModal || !hasAnyAttachment ? 0.7 : 1,
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
