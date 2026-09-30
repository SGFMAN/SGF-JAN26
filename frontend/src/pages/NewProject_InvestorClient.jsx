import React, { useState } from "react";
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
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  async function handleYes() {
    if (sending) return;
    if (!project?.id) {
      alert("The project is not ready yet. Go back and finish the previous step.");
      return;
    }
    setSending(true);
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
        return;
      }
      if (toAddresses.length === 0) {
        alert("Set Investor Lead — To under Settings → Email Settings → General → D&J.");
        return;
      }
      if (!template) {
        alert("Choose an Investor Lead template under Settings → Email Settings → General → D&J.");
        return;
      }

      const subject = await replaceTokens(template.subject || "", project, { settings });
      const htmlBody = await replaceTokens(template.body || "", project, { html: true, settings });

      await runWithEmailOverlay(async () => {
        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: getApiHeaders(),
          body: JSON.stringify({
            to: toAddresses,
            from,
            subject,
            htmlBody,
            projectId: project.id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      });
      onContinue?.();
    } catch (err) {
      console.error("Investor lead email:", err);
      alert(err.message || "Failed to send the investor email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalBackdrop>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="investor-client-title"
        style={{
          background: SECTION_GREY,
          borderRadius: "18px",
          padding: "32px",
          width: "90%",
          maxWidth: "480px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            disabled={sending}
            onClick={onBack}
            style={{
              ...BTN,
              background: UI.inputBg,
              color: MONUMENT,
              cursor: sending ? "wait" : "pointer",
            }}
          >
            Back
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={onContinue}
            style={{
              ...BTN,
              background: UI.inputBg,
              color: MONUMENT,
              cursor: sending ? "wait" : "pointer",
            }}
          >
            No
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={handleYes}
            style={{
              ...BTN,
              background: MONUMENT,
              color: PAGE_TEXT,
              cursor: sending ? "wait" : "pointer",
            }}
          >
            {sending ? "Sending..." : "Yes"}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
