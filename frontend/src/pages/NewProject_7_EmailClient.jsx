import React, { useState, useEffect, useRef } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function NewProject_7_EmailClient({ isOpen, onClose, createdProjectForEmail }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const emailBodyRef = useRef(null);
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    if (isOpen && emailBodyRef.current && emailBody) {
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [isOpen, emailBody]);

  useEffect(() => {
    if (createdProjectForEmail && isOpen) {
      prepareClientEmail(createdProjectForEmail);
    }
  }, [createdProjectForEmail, isOpen]);

  async function getSalespersonDetails(salespersonName) {
    if (!salespersonName) return { position: "", phone: "", email: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { position: "", phone: "", email: "" };
      const users = await response.json();
      const user = users.find((u) => u.name === salespersonName);
      if (!user) return { position: "", phone: "", email: "" };
      const position =
        user.positions && Array.isArray(user.positions) && user.positions.length > 0
          ? user.positions[0].name
          : "";
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

  /** Replace tokens: Contact1, ProjectName, ClientName, Salesperson, SalespersonPosition, DepositPaid, DepositStatus, ProjectCost */
  async function replaceTokens(text, project, opts = {}) {
    if (!text || !project) return text;
    const html = !!opts.html;

    let replaced = text;
    const contact1 = (project.client1_email && project.client1_active) ? project.client1_email : (project.email || "");
    replaced = replaced.replace(/{Contact1}/g, contact1);
    replaced = replaced.replace(/{ProjectName}/g, project.name || "");
    const clientFullName = project.client_name || "";
    const clientFirstName = clientFullName.trim().split(/\s+/)[0] || clientFullName;
    replaced = replaced.replace(/{ClientName}/g, clientFirstName);
    replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");

    // Project cost
    let projectCostDisplay = "";
    if (project.project_cost != null && project.project_cost !== "") {
      const costNum = typeof project.project_cost === "string"
        ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
        : Number(project.project_cost);
      if (!isNaN(costNum)) projectCostDisplay = `$${costNum.toLocaleString()}`;
    }
    replaced = replaced.replace(/{ProjectCost}/g, projectCostDisplay);

    // Deposit
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

    const hasPosition = replaced.includes("{SalespersonPosition}");
    if (hasPosition) {
      const { position } = await getSalespersonDetails(project.salesperson);
      const formattedPosition = position ? (html ? `<br>${position}` : `\n${position}`) : "";
      replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
    }

    return replaced;
  }

  /** True if project has full 5% deposit (so use Full Deposit template). */
  function isFullDeposit(project) {
    let depositNum = 0;
    if (project.deposit != null && project.deposit !== "") {
      if (typeof project.deposit === "string") {
        const cleaned = project.deposit.replace(/[$,\s]/g, "");
        depositNum = parseFloat(cleaned);
      } else {
        depositNum = Number(project.deposit);
      }
    }
    if (depositNum <= 0) return false;
    const projectCostNum =
      typeof project.project_cost === "string"
        ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
        : Number(project.project_cost || 0);
    if (!projectCostNum || isNaN(projectCostNum)) return false;
    const fullDepositAmount = Math.floor(projectCostNum / 20);
    return depositNum === fullDepositAmount;
  }

  async function prepareClientEmail(project) {
    setIsPreparing(true);
    try {
      const templatesResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templatesResponse.ok) throw new Error("Failed to fetch email templates");
      const templates = await templatesResponse.json();

      const fullDeposit = isFullDeposit(project);
      const templateName = fullDeposit ? "NEW JOB - Client Full Deposit" : "NEW JOB - Client Part Deposit";
      const template = templates.find(
        (t) => t.name && t.name.toLowerCase().trim() === templateName.toLowerCase()
      );

      if (!template) {
        alert(`Template "${templateName}" not found. Please create it in Settings → Email Settings.`);
        setIsPreparing(false);
        return;
      }

      if (!template.from_address || !template.from_address.trim()) {
        alert("Template has no From address. Edit the template in Settings → Email Settings.");
        setIsPreparing(false);
        return;
      }

      // To = {Contact1} → client email
      const contact1 = (project.client1_email && project.client1_active) ? project.client1_email : (project.email || "");
      const toAddresses = contact1 ? [contact1] : [];

      if (toAddresses.length === 0) {
        alert("No client email (Contact1) available for this project.");
        setIsPreparing(false);
        return;
      }

      const subject = await replaceTokens(template.subject || "", project);
      const htmlBody = await replaceTokens(template.body || "", project, { html: true });

      setEmailTo(toAddresses.join(", "));
      setEmailFrom(template.from_address || "");
      setEmailSubject(subject);
      setEmailBody(htmlBody);
    } catch (error) {
      console.error("Error preparing client email:", error);
      alert(`Failed to prepare email: ${error.message}`);
    } finally {
      setIsPreparing(false);
    }
  }

  async function handleSendEmail() {
    const toAddresses = emailTo.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
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
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
        alert(data.message || "Email sent successfully!");
      });
      onClose();
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
        background: "rgba(0, 0, 0, 0.5)",
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
          <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email (Client)</h2>
          <button
            onClick={onClose}
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
          <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>Preparing email...</div>
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
                onClick={onClose}
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
