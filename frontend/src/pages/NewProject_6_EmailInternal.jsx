import React, { useState, useEffect, useRef } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { getNewJobInternalTemplateName } from "../utils/newJobInternalTemplate";
import {
  findSalespersonUserInList,
  resolveNewProjectTeamFrom,
  resolveNewProjectTeamToEmailsFromStream,
} from "../utils/streamNewProjectEmail";
import { getUserPrimaryPositionName } from "../utils/userPosition";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function NewProject_6_EmailInternal({
  isOpen,
  onClose,
  createdProjectForEmail,
  onSendSuccess,
  transparentBackdrop = false,
}) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const emailBodyRef = useRef(null);
  const [isPreparing, setIsPreparing] = useState(false);

  // Update emailBody when contentEditable changes
  useEffect(() => {
    if (isOpen && emailBodyRef.current && emailBody) {
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [isOpen, emailBody]);

  // When createdProjectForEmail is set, prepare and show email
  useEffect(() => {
    if (createdProjectForEmail && isOpen) {
      prepareNewJobEmail(createdProjectForEmail);
    }
  }, [createdProjectForEmail, isOpen]);

  // Helper function to get salesperson details
  async function getSalespersonDetails(salespersonName) {
    if (!salespersonName) return { position: "", phone: "", email: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { position: "", phone: "", email: "" };
      const users = await response.json();
      const user = users.find((u) => u.name === salespersonName);
      if (!user) return { position: "", phone: "", email: "" };
      const position = getUserPrimaryPositionName(user);
      return {
        position,
        phone: user.phone || "",
        email: user.email || "",
      };
    } catch (error) {
      console.error("Error fetching salesperson details:", error);
      return { position: "", phone: "", email: "" };
    }
  }

  // Helper function to replace tokens in email template
  async function replaceTokens(text, project, opts = {}) {
    if (!text || !project) return text;
    const html = !!opts.html;

    let replaced = text;

    replaced = replaced.replace(/{ProjectName}/g, project.name || "");
    replaced = replaced.replace(/{ClientName}/g, project.client_name || "");
    // Project cost: support both number and string (e.g. "$500,000" from form)
    let projectCostDisplay = "";
    if (project.project_cost != null && project.project_cost !== "") {
      const costNum = typeof project.project_cost === "string"
        ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
        : Number(project.project_cost);
      if (!isNaN(costNum)) {
        projectCostDisplay = `$${costNum.toLocaleString()}`;
      }
    }
    replaced = replaced.replace(/{ProjectCost}/g, projectCostDisplay);
    replaced = replaced.replace(/{Street}/g, project.street || "");
    replaced = replaced.replace(/{Suburb}/g, project.suburb || "");

    let depositPaid = "$0";
    let depositNum = 0;
    if (project.deposit != null && project.deposit !== "") {
      if (typeof project.deposit === "string") {
        const cleaned = project.deposit.replace(/[$,\s]/g, "");
        depositNum = parseFloat(cleaned);
      } else {
        depositNum = Number(project.deposit);
      }
      if (!isNaN(depositNum) && depositNum > 0) {
        depositPaid = `$${depositNum.toLocaleString()}`;
      }
    }
    replaced = replaced.replace(/{DepositPaid}/g, depositPaid);

    let depositStatus = "$0 only";
    if (depositNum > 0) {
      const projectCostNum =
        typeof project.project_cost === "string"
          ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
          : Number(project.project_cost || 0);
      if (!isNaN(projectCostNum) && projectCostNum > 0) {
        const fullDepositAmount = Math.floor(projectCostNum / 20);
        depositStatus = depositNum === fullDepositAmount ? "Full Deposit Paid" : `${depositPaid} only`;
      } else {
        depositStatus = `${depositPaid} only`;
      }
    }
    replaced = replaced.replace(/{DepositStatus}/g, depositStatus);

    replaced = replaced.replace(/{Contact1}/g, project.client1_email && project.client1_active ? project.client1_email : "");
    replaced = replaced.replace(/{Contact2}/g, project.client2_email && project.client2_active ? project.client2_email : "");
    replaced = replaced.replace(/{Contact3}/g, project.client3_email && project.client3_active ? project.client3_email : "");
    replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");

    const needsDetails =
      replaced.includes("{SalespersonPosition}") ||
      replaced.includes("{SalespersonPhone}") ||
      replaced.includes("{SalespersonEmail}");
    if (needsDetails) {
      const { position, phone, email } = await getSalespersonDetails(project.salesperson);
      const formattedPosition = position
        ? html
          ? `<br>${position}`
          : `\n${position}`
        : "";
      replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
      replaced = replaced.replace(/{SalespersonPhone}/g, phone);
      replaced = replaced.replace(/{SalespersonEmail}/g, email);
    }

    // Match POST /api/emails/send: plain newlines become <br> so preview matches the sent HTML.
    if (html) {
      replaced = replaced
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n/g, "<br>");
    }

    return replaced;
  }

  // Prepare and show email modal for new job
  async function prepareNewJobEmail(project) {
    setIsPreparing(true);
    try {
      console.log("Preparing new job email for project:", project);
      const [templatesResponse, settingsResponse, usersResponse] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/users`),
      ]);
      if (!templatesResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templatesResponse.json();
      const settings = settingsResponse.ok ? await settingsResponse.json() : {};
      const users = usersResponse.ok ? await usersResponse.json() : [];
      const salespersonUser = findSalespersonUserInList(users, project?.salesperson);
      console.log("Fetched templates:", templates);

      const templateName = getNewJobInternalTemplateName(project);
      const template = templates.find(
        (t) => t.name && t.name.toLowerCase().trim() === templateName.toLowerCase()
      );

      if (!template) {
        console.warn(`Template "${templateName}" not found. Available templates:`, templates.map((t) => t.name));
        alert(`Template "${templateName}" not found. Please create it in Settings → Email Templates.`);
        setIsPreparing(false);
        return;
      }

      console.log("Found template:", template);

      const teamFrom = resolveNewProjectTeamFrom(settings, project, salespersonUser);
      if (!teamFrom || !String(teamFrom).trim()) {
        alert(
          "No From address for the new job email. Under Settings → Email Settings → General → New Project → Email to Team, set From for Sales Manager and/or Other for this project's state (VIC or QLD column), or the legacy Team Email — From."
        );
        setIsPreparing(false);
        return;
      }

      const toAddresses = resolveNewProjectTeamToEmailsFromStream(settings, project);

      console.log("To addresses (stream settings or template):", toAddresses);

      if (toAddresses.length === 0) {
        console.warn("No valid email addresses found after replacing tokens");
        alert(
          "No valid Team Email — To addresses. Configure Settings → Email Settings → General → New Project."
        );
        setIsPreparing(false);
        return;
      }

      const subject = await replaceTokens(template.subject || "", project);
      const htmlBody = await replaceTokens(template.body || "", project, { html: true });

      console.log("Setting email modal state");
      // Set email modal state
      setEmailTo(toAddresses.join(", "));
      setEmailFrom(teamFrom);
      setEmailSubject(subject);
      setEmailBody(htmlBody);
      console.log("Email modal should now be visible");
    } catch (error) {
      console.error("Error preparing email:", error);
      alert(`Failed to prepare email: ${error.message}`);
    } finally {
      setIsPreparing(false);
    }
  }

  // Send email from modal
  async function handleSendEmail() {
    const toAddresses = emailTo.split(",").map(a => a.trim()).filter(a => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!emailFrom || !emailFrom.trim()) {
      alert("From address is required");
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
        const requestBody = {
          to: toAddresses,
          from: emailFrom,
          subject: emailSubject,
          htmlBody: emailBody,
        };

        if (createdProjectForEmail && createdProjectForEmail.id) {
          requestBody.projectId = createdProjectForEmail.id;
        }

        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Send failed (${res.status})`);
        }
        alert(data.message || "Email sent successfully!");
      });
      if (onSendSuccess) {
        onSendSuccess(createdProjectForEmail);
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Send email error:", err);
      alert(err.message || "Failed to send email.");
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: transparentBackdrop ? "transparent" : "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          background: WHITE,
          borderRadius: "12px",
          padding: "24px",
          width: "90%",
          maxWidth: "800px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
          <button
            onClick={() => {
              // Close button: Close modal without sending email
              // Project is already saved in the database at this point
              onClose();
            }}
            style={{
              background: "transparent",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
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

        {isPreparing ? (
          <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>
            Preparing email...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                To (comma-separated)
              </label>
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                From
              </label>
              <input
                type="text"
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Subject
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Body
              </label>
              <div
                ref={emailBodyRef}
                contentEditable
                onInput={(e) => {
                  setEmailBody(e.currentTarget.innerHTML);
                }}
                onBlur={(e) => {
                  setEmailBody(e.currentTarget.innerHTML);
                }}
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
                onClick={() => {
                  // Cancel: Close modal without sending email
                  // Project is already saved in the database at this point
                  onClose();
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Send Email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
