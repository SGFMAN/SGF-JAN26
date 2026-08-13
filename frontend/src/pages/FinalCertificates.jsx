import React, { useEffect, useRef, useState } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { getApiHeaders } from "../utils/auth";
import {
  generalEmailStateCode,
  resolveFinalCertificatesFromEmail,
  resolveFinalCertificatesToEmails,
} from "../utils/emailGeneralSettings";
import { convertEmailBodyNewlinesToBr } from "../utils/emailBodyNewlines";
import { UI, outlineBorder } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

function projectAddressLabel(project) {
  if (project?.street && project?.suburb) {
    return `${project.street}, ${project.suburb}`.trim();
  }
  return project?.name || (project?.id != null ? `Project #${project.id}` : "Project");
}

const FINAL_CERTIFICATES_TEMPLATE_NAME = "Final Certificates";
const FINAL_CERTIFICATES_TEMPLATE_GROUP = "Hand Over";

/** Active client first names joined like Drawings client emails (A & B / A, B & C). */
function resolveClientNameToken(project) {
  if (!project) return "";
  const firstNames = [];
  const pushActive = (active, name) => {
    if (String(active || "").toLowerCase() !== "true") return;
    const first = String(name || "").trim().split(/\s+/)[0];
    if (first) firstNames.push(first);
  };
  pushActive(project.client1_active, project.client1_name);
  pushActive(project.client2_active, project.client2_name);
  pushActive(project.client3_active, project.client3_name);
  if (firstNames.length === 0) {
    const fallback = String(project.client_name || "").trim().split(/\s+/)[0];
    return fallback || "";
  }
  if (firstNames.length === 1) return firstNames[0];
  if (firstNames.length === 2) return `${firstNames[0]} & ${firstNames[1]}`;
  return `${firstNames.slice(0, -1).join(", ")} & ${firstNames[firstNames.length - 1]}`;
}

function replaceFinalCertificatesTokens(text, project) {
  const projectName = projectAddressLabel(project);
  const clientName = resolveClientNameToken(project);
  return String(text || "")
    .replace(/\{ProjectName\}/g, projectName)
    .replace(/\{ClientName\}/g, clientName);
}

function findFinalCertificatesTemplate(templates) {
  const nameWanted = FINAL_CERTIFICATES_TEMPLATE_NAME.toLowerCase();
  const groupWanted = FINAL_CERTIFICATES_TEMPLATE_GROUP.toLowerCase();
  if (!Array.isArray(templates)) return null;
  return (
    templates.find((t) => {
      const name = String(t?.name || "").trim().toLowerCase();
      const group = String(t?.template_group || "").trim().toLowerCase();
      return name === nameWanted && group === groupWanted;
    }) || null
  );
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB — reject before send (mail-server friendly)

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

function rejectIfTooLarge(file, kindLabel) {
  if (!file) return true;
  if ((file.size || 0) > MAX_ATTACHMENT_BYTES) {
    alert(
      `That ${kindLabel} is too large (${formatFileSize(file.size)}). Maximum size is 20 MB.`
    );
    return true;
  }
  return false;
}

/**
 * Construction → Final Certificates.
 * Separate PDF + ZIP drop zones (memory only) → Email preview attaches both.
 */
export default function FinalCertificates({ project, onUpdate }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const pdfInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const emailBodyRef = useRef(null);

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

  // Keep contentEditable in sync when the prepared HTML body is set.
  useEffect(() => {
    if (!showEmailModal || preparingModal || !emailBodyRef.current) return;
    if (emailBodyRef.current.innerHTML !== emailBody) {
      emailBodyRef.current.innerHTML = emailBody || "";
    }
  }, [showEmailModal, preparingModal, emailBody]);

  function setPdfFile(file) {
    if (!file) return;
    if (!isPdfFile(file)) {
      alert("Please drop or select a PDF file in the PDF zone.");
      return;
    }
    if (rejectIfTooLarge(file, "PDF")) {
      if (pdfInputRef.current) pdfInputRef.current.value = "";
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
    if (rejectIfTooLarge(file, "ZIP")) {
      if (zipInputRef.current) zipInputRef.current.value = "";
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
    if (generalEmailStateCode(project) !== "VIC") {
      alert("This feature is not yet set up for states other than VIC.");
      return;
    }
    setPreparingModal(true);
    setShowEmailModal(true);
    try {
      const [templatesResponse, settingsResponse] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (!templatesResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch email settings");
      }
      const templates = await templatesResponse.json();
      const settings = await settingsResponse.json();
      const template = findFinalCertificatesTemplate(templates);
      if (!template) {
        throw new Error(
          `Template "${FINAL_CERTIFICATES_TEMPLATE_NAME}" not found in the ${FINAL_CERTIFICATES_TEMPLATE_GROUP} group. Create it in Settings → Email Templates.`
        );
      }

      const toEmails = resolveFinalCertificatesToEmails(settings, project);
      const fromEmail = resolveFinalCertificatesFromEmail(settings, project);
      if (!fromEmail) {
        throw new Error(
          "No From address for Final Certificates. Set it under Settings → Email Settings → General → Final Certificates (VIC for this project's state)."
        );
      }
      if (toEmails.length === 0) {
        throw new Error(
          "No To addresses for Final Certificates. Enable Client and/or choose SMTP To under Settings → Email Settings → General → Final Certificates (VIC for this project's state)."
        );
      }

      setEmailTo(toEmails.join(", "));
      setEmailFrom(fromEmail);
      setEmailSubject(replaceFinalCertificatesTokens(template.subject || "", project));
      // TipTap templates are already HTML; convertEmailBodyNewlinesToBr still
      // handles any legacy plain-text newlines without escaping tags.
      setEmailBody(
        convertEmailBodyNewlinesToBr(
          replaceFinalCertificatesTokens(template.body || "", project)
        )
      );
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

  async function markProjectComplete() {
    if (!project?.id) {
      throw new Error("Project id is missing; cannot set status to Complete.");
    }
    const projectName =
      project?.street && project?.suburb
        ? `${project.street}, ${project.suburb}`.trim()
        : project?.name || "";
    const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...getApiHeaders(),
      },
      body: JSON.stringify({
        name: projectName,
        status: "Complete",
        street: project.street || null,
        suburb: project.suburb || null,
        state: project.state || null,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(errorText || `Failed to update status (${response.status})`);
    }
  }

  async function handleSend() {
    if (generalEmailStateCode(project) !== "VIC") {
      alert("This feature is not yet set up for states other than VIC.");
      return;
    }
    const toAddresses = emailTo
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert(
        "No recipient addresses. Enable Client and/or choose SMTP To under Settings → Email Settings → General → Final Certificates, or enter addresses in To."
      );
      return;
    }
    if (!emailFrom.trim()) {
      alert(
        "From address is required. Set it under Settings → Email Settings → General → Final Certificates, or enter a From address."
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
        // Body is HTML from the template editor — do not escape tags.
        form.append("htmlBody", emailBody || "<p></p>");
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

      try {
        await markProjectComplete();
        if (typeof onUpdate === "function") {
          onUpdate(true);
        }
        alert("Final handover email sent. Project status set to Complete.");
      } catch (statusErr) {
        console.error("Final Certificates: email sent but status update failed:", statusErr);
        alert(
          "Final handover email sent, but the project status could not be set to Complete. Please update it manually."
        );
      }
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

  /** Windows / Fluent-style PDF document icon. */
  function PdfGlyph({ size = 40 }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
        style={{ display: "block", flexShrink: 0 }}
      >
        <path
          d="M10 4h18l10 10v28a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          fill="#F3F3F3"
          stroke="#1A1A1A"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M28 4v10h10"
          fill="#DEDEDE"
          stroke="#1A1A1A"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <rect x="8" y="28" width="32" height="12" rx="1.5" fill="#E31C23" stroke="#1A1A1A" strokeWidth="1.2" />
        {/* P */}
        <path
          d="M14.2 31.1v7.8h1.55v-2.85h.95c1.35 0 2.2-.7 2.2-1.85s-.85-1.85-2.2-1.85h-2.5zm1.55 1.35h.9c.55 0 .95.28.95.75s-.4.75-.95.75h-.9v-1.5z"
          fill="#FFFFFF"
        />
        {/* D */}
        <path
          d="M22.4 31.1v7.8h2.15c2.05 0 3.35-1.25 3.35-3.9s-1.3-3.9-3.35-3.9H22.4zm1.55 1.35h.55c1.15 0 1.85.75 1.85 2.55s-.7 2.55-1.85 2.55h-.55v-5.1z"
          fill="#FFFFFF"
        />
        {/* F */}
        <path
          d="M30.9 31.1v7.8h1.55v-3.05h2.35v-1.3h-2.35v-1.95h2.7v-1.5H30.9z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  /** Windows / Fluent-style folder icon. */
  function FolderGlyph({ size = 40 }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
        style={{ display: "block", flexShrink: 0 }}
      >
        <path
          d="M5 16.2V12.5A2.5 2.5 0 0 1 7.5 10h9.4l2.8 3.2H40.5A2.5 2.5 0 0 1 43 15.7V18H5v-1.8Z"
          fill="#FFE082"
          stroke="#1A1A1A"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M5 18h38v18.2A3.8 3.8 0 0 1 39.2 40H8.8A3.8 3.8 0 0 1 5 36.2V18Z"
          fill="#FFB300"
          stroke="#1A1A1A"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M7.8 21.2h32.4v14.2c0 .9-.7 1.6-1.6 1.6H9.4c-.9 0-1.6-.7-1.6-1.6V21.2Z"
          fill="#FFCA28"
        />
      </svg>
    );
  }

  function renderDropZone({
    kind,
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
    const isPdf = kind === "pdf";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
        <div style={{ fontSize: "0.95rem", fontWeight: 600, color: MONUMENT }}>{title}</div>
        <div
          {...handlers}
          onClick={() => inputRef.current?.click()}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            maxWidth: "320px",
            minWidth: "260px",
            border: `2px dashed ${dragging ? MONUMENT : UI.outline}`,
            borderRadius: "14px",
            padding: "22px",
            background: dragging ? "rgba(50,50,51,0.05)" : WHITE,
            textAlign: "center",
            cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            boxSizing: "border-box",
          }}
        >
          {isPdf ? <PdfGlyph size={80} /> : <FolderGlyph size={80} />}
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              color: MONUMENT,
              lineHeight: 1.3,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "0 4px",
            }}
            title={current ? current.name : undefined}
          >
            {current ? current.name : `Drop ${title} here`}
          </div>
          <div style={{ fontSize: "0.82rem", color: UI.textMuted, lineHeight: 1.35 }}>
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

        <div
          style={{
            background: WHITE,
            borderRadius: "10px",
            padding: "12px 14px",
            border: outlineBorder,
            boxSizing: "border-box",
            maxWidth: "320px",
            minWidth: "260px",
            width: "100%",
            minHeight: "88px",
          }}
        >
          <div
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: MONUMENT,
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {isPdf ? <PdfGlyph size={20} /> : <FolderGlyph size={20} />}
            Attachments
          </div>
          {current ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: MONUMENT,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={current.name}
                >
                  {current.name}
                </div>
                <div style={{ fontSize: "0.78rem", color: UI.textMuted, marginTop: "2px" }}>
                  {formatFileSize(current.size)}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                style={{
                  padding: "5px 9px",
                  borderRadius: "6px",
                  border: outlineBorder,
                  background: WHITE,
                  color: MONUMENT,
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "0.82rem", color: UI.textMuted }}>
              None yet
            </p>
          )}
        </div>
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
          display: "flex",
          flexWrap: "wrap",
          gap: "28px",
          alignItems: "flex-start",
        }}
      >
        {renderDropZone({
          kind: "pdf",
          title: "PDF",
          hint: "PDF only · max 20 MB",
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
          kind: "zip",
          title: "ZIP",
          hint: "ZIP only · max 20 MB",
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
                  <div
                    ref={emailBodyRef}
                    className="final-certificates-email-body"
                    contentEditable={!sending}
                    suppressContentEditableWarning
                    onInput={(e) => {
                      setEmailBody(e.currentTarget.innerHTML);
                    }}
                    onBlur={(e) => {
                      setEmailBody(e.currentTarget.innerHTML);
                    }}
                    style={{
                      ...inputStyle,
                      minHeight: "220px",
                      lineHeight: 1.6,
                      outline: "none",
                      overflowY: "auto",
                      cursor: sending ? "not-allowed" : "text",
                      opacity: sending ? 0.7 : 1,
                    }}
                  />
                  <style>{`
                    .final-certificates-email-body p {
                      margin: 0 0 0.75em 0;
                    }
                    .final-certificates-email-body p:last-child {
                      margin-bottom: 0;
                    }
                  `}</style>
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
