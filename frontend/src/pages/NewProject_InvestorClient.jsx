import React, { useEffect, useRef, useState } from "react";
import ModalBackdrop from "../components/ModalBackdrop";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { parseEmailGeneralJson } from "../utils/emailGeneralSettings";
import { getUserPrimaryPositionName } from "../utils/userPosition";
import {
  formatDepositPaidToken,
  formatDepositStatusToken,
  replaceDepositBalanceToken,
} from "../utils/projectDeposit";
import { replaceLoggedInUserEmailTokens, replaceStreamEmailToken } from "../utils/emailUserTokens";
import { replaceClientContactTokens } from "../utils/emailClientTokens";
import { convertEmailBodyNewlinesToBr } from "../utils/emailBodyNewlines";
import { getApiHeaders } from "../utils/auth";

import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const BTN = {
  border: "none",
  borderRadius: "10px",
  padding: "10px 20px",
  fontSize: "1rem",
  fontWeight: 500,
  transition: "background 0.17s",
};

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: `1px solid ${SECTION_GREY}`,
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

async function salespersonDetails(salespersonName) {
  if (!salespersonName) return { position: "", phone: "", email: "" };
  const response = await fetch(`${API_URL}/api/users`, { headers: getApiHeaders() });
  if (!response.ok) return { position: "", phone: "", email: "" };
  const users = await response.json();
  const user = (users || []).find((u) => u.name === salespersonName);
  if (!user) return { position: "", phone: "", email: "" };
  return {
    position: getUserPrimaryPositionName(user),
    phone: user.phone || "",
    email: user.email || "",
  };
}

async function replaceTokens(text, project, opts = {}) {
  if (!text || !project) return text || "";
  const html = !!opts.html;
  let replaced = String(text);
  replaced = replaced.replace(/{ProjectName}/g, project.name || "");
  replaced = replaceStreamEmailToken(replaced, project);
  replaced = replaced.replace(/{ClientName}/g, project.client_name || project.client1_name || "");
  replaced = replaceClientContactTokens(replaced, project);
  let projectCostDisplay = "";
  if (project.project_cost != null && project.project_cost !== "") {
    const costNum =
      typeof project.project_cost === "string"
        ? parseFloat(String(project.project_cost).replace(/[$,\s]/g, ""))
        : Number(project.project_cost);
    if (!isNaN(costNum)) projectCostDisplay = `$${costNum.toLocaleString()}`;
  }
  replaced = replaced.replace(/{ProjectCost}/g, projectCostDisplay);
  replaced = replaced.replace(/{Street}/g, project.street || "");
  replaced = replaced.replace(/{Suburb}/g, project.suburb || "");
  replaced = replaced.replace(/{DepositPaid}/g, formatDepositPaidToken(project));
  replaced = replaced.replace(/{DepositStatus}/g, formatDepositStatusToken(project));
  replaced = await replaceDepositBalanceToken(replaced, project, opts.settings, API_URL);
  replaced = replaced.replace(
    /{Contact1}/g,
    project.client1_email && project.client1_active ? project.client1_email : ""
  );
  replaced = replaced.replace(
    /{Contact2}/g,
    project.client2_email && project.client2_active ? project.client2_email : ""
  );
  replaced = replaced.replace(
    /{Contact3}/g,
    project.client3_email && project.client3_active ? project.client3_email : ""
  );
  replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");
  const needsDetails =
    replaced.includes("{SalespersonPosition}") ||
    replaced.includes("{SalespersonPhone}") ||
    replaced.includes("{SalespersonEmail}");
  if (needsDetails) {
    const { position, phone, email } = await salespersonDetails(project.salesperson);
    const formattedPosition = position ? (html ? `<br>${position}` : `\n${position}`) : "";
    replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
    replaced = replaced.replace(/{SalespersonPhone}/g, phone);
    replaced = replaced.replace(/{SalespersonEmail}/g, email);
  }
  if (html) replaced = convertEmailBodyNewlinesToBr(replaced);
  return replaceLoggedInUserEmailTokens(replaced);
}

export default function NewProject_InvestorClient({ isOpen, project, onBack, onContinue }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [phase, setPhase] = useState("ask");
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const emailBodyRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setPhase("ask");
      setPreparing(false);
      setSending(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (phase === "preview" && emailBodyRef.current && emailBody) {
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [phase, emailBody]);

  if (!isOpen) return null;

  function clearPreview() {
    setEmailTo("");
    setEmailFrom("");
    setEmailSubject("");
    setEmailBody("");
  }

  function handlePreviewCancel() {
    if (sending) return;
    clearPreview();
    setPhase("ask");
  }

  async function handleYes() {
    if (preparing || sending) return;
    if (!project?.id) {
      alert("The project is not ready yet. Go back and finish the previous step.");
      return;
    }
    setPhase("preview");
    setPreparing(true);
    clearPreview();
    try {
      const [settingsRes, templatesRes] = await Promise.all([
        fetch(`${API_URL}/api/settings`, { headers: getApiHeaders() }),
        fetch(`${API_URL}/api/email-templates`, { headers: getApiHeaders() }),
      ]);
      if (!settingsRes.ok) throw new Error("Could not load email settings.");
      if (!templatesRes.ok) throw new Error("Could not load email templates.");
      const settings = await settingsRes.json();
      const templates = await templatesRes.json();
      const lead = parseEmailGeneralJson(settings.email_general_json).investorLead || {};
      const toAddresses = String(lead.toEmail || "")
        .split(/[,;]+/)
        .map((a) => a.trim())
        .filter(Boolean);
      const from = String(lead.fromEmail || "").trim();
      const templateId = String(lead.templateId || "").trim();
      const templateName = String(lead.templateName || "").trim();
      const template =
        (templateId && (templates || []).find((t) => String(t.id) === templateId)) ||
        (templateName &&
          (templates || []).find(
            (t) => String(t.name || "").trim().toLowerCase() === templateName.toLowerCase()
          )) ||
        null;

      if (!from) {
        alert("Set Investor Lead — From under Settings → Email Settings → General → D&J.");
        setPhase("ask");
        return;
      }
      if (toAddresses.length === 0) {
        alert("Set Investor Lead — To under Settings → Email Settings → General → D&J.");
        setPhase("ask");
        return;
      }
      if (!template) {
        alert("Choose an Investor Lead template under Settings → Email Settings → General → D&J.");
        setPhase("ask");
        return;
      }

      const subject = await replaceTokens(template.subject || "", project, { settings });
      const htmlBody = await replaceTokens(template.body || "", project, { html: true, settings });
      setEmailTo(toAddresses.join(", "));
      setEmailFrom(from);
      setEmailSubject(subject);
      setEmailBody(htmlBody);
    } catch (err) {
      console.error("Investor lead email:", err);
      alert(err.message || "Failed to prepare the investor email.");
      setPhase("ask");
    } finally {
      setPreparing(false);
    }
  }

  async function handleSendEmail() {
    if (sending || preparing) return;
    const toAddresses = emailTo
      .split(/[,;]+/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!emailFrom || !emailFrom.trim()) {
      alert("From address is required");
      return;
    }
    setSending(true);
    try {
      await runWithEmailOverlay(async () => {
        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            to: toAddresses,
            from: emailFrom.trim(),
            subject: emailSubject,
            htmlBody: emailBody,
            projectId: project?.id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
        alert(data.message || "Email sent successfully!");
      });
      onContinue?.();
    } catch (err) {
      console.error("Investor lead email:", err);
      alert(err.message || "Failed to send the investor email.");
    } finally {
      setSending(false);
    }
  }

  const preview = phase === "preview";

  return (
    <ModalBackdrop>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="investor-client-title"
        style={{
          background: preview ? WHITE : SECTION_GREY,
          borderRadius: preview ? "12px" : "18px",
          padding: preview ? "24px" : "32px",
          width: "90%",
          maxWidth: preview ? "800px" : "480px",
          maxHeight: preview ? "90vh" : undefined,
          overflowY: preview ? "auto" : undefined,
          boxShadow: preview ? "0 8px 32px rgba(0, 0, 0, 0.2)" : "0 4px 24px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {preview ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 id="investor-client-title" style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>
                Preview & Send Email
              </h2>
              <button
                type="button"
                onClick={handlePreviewCancel}
                disabled={sending}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: sending ? "wait" : "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {preparing ? (
              <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>Preparing email...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    To (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    From
                  </label>
                  <input
                    type="text"
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    Body
                  </label>
                  <div
                    ref={emailBodyRef}
                    contentEditable
                    onInput={(e) => setEmailBody(e.currentTarget.innerHTML)}
                    onBlur={(e) => setEmailBody(e.currentTarget.innerHTML)}
                    style={{
                      width: "100%",
                      minHeight: "300px",
                      padding: "12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "0.9rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                      lineHeight: "1.6",
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={handlePreviewCancel}
                    disabled={sending}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      background: "transparent",
                      border: `1px solid ${SECTION_GREY}`,
                      borderRadius: "8px",
                      cursor: sending ? "wait" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    disabled={sending}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: sending ? "wait" : "pointer",
                    }}
                  >
                    Send Email
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h2
              id="investor-client-title"
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Is this an investor client?
            </h2>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={onBack}
                style={{ ...BTN, background: UI.inputBg, color: MONUMENT, cursor: "pointer" }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={onContinue}
                style={{ ...BTN, background: UI.inputBg, color: MONUMENT, cursor: "pointer" }}
              >
                No
              </button>
              <button
                type="button"
                onClick={handleYes}
                style={{ ...BTN, background: MONUMENT, color: PAGE_TEXT, cursor: "pointer" }}
              >
                Yes
              </button>
            </div>
          </>
        )}
      </div>
    </ModalBackdrop>
  );
}
