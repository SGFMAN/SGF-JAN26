import React, { useState, useEffect, useRef } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import {
  findSalespersonUserInList,
  resolveNewProjectTeamFrom,
  resolveNewProjectTeamToEmailsFromStream,
} from "../utils/streamNewProjectEmail";
import { getUserPrimaryPositionName } from "../utils/userPosition";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const PLANNING_STATUS_OPTIONS = ["Not Selected", "No Planning Required", "Planning Required", "Planning Permit Issued"];
const STATUS_OPTIONS = ["Not Submitted", "Sent", "Complete"];
const SEPTIC_PERMIT_OPTIONS = ["Not Required", "Required", "Permit Complete"];
const PIC_OPTIONS = ["Yes", "No"];

export default function Planning({ project, onUpdate }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [planningStatus, setPlanningStatus] = useState(project?.planning_status || "Not Selected");
  const [energyReportStatus, setEnergyReportStatus] = useState(project?.energy_report_status || "Not Submitted");
  const [footingCertificationStatus, setFootingCertificationStatus] = useState(project?.footing_certification_status || "Not Submitted");
  const [buildingPermitStatus, setBuildingPermitStatus] = useState(project?.building_permit_status || "Not Submitted");
  const [septicPermit, setSepticPermit] = useState(
    project?.septic_permit && project.septic_permit !== "Not Selected"
      ? project.septic_permit
      : "Not Required"
  );
  const [septicNotes, setSepticNotes] = useState(project?.septic_notes || "");
  const [septicEmailSentDate, setSepticEmailSentDate] = useState(project?.septic_email_sent_date || "");
  const [pic, setPic] = useState(project?.pic || "No");
  const [showSepticEmailModal, setShowSepticEmailModal] = useState(false);
  const [isPreparingEmail, setIsPreparingEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const emailBodyRef = useRef(null);
  useEffect(() => {
    if (!project) return;
    setPlanningStatus(project.planning_status || "Not Selected");
    setEnergyReportStatus(project.energy_report_status || "Not Submitted");
    setFootingCertificationStatus(project.footing_certification_status || "Not Submitted");
    setBuildingPermitStatus(project.building_permit_status || "Not Submitted");
    const incoming = project.septic_permit;
    if (incoming === undefined || incoming === null || incoming === "" || incoming === "Not Selected") {
      setSepticPermit("Not Required");
    } else {
      setSepticPermit(incoming);
    }
    setSepticNotes(project.septic_notes || "");
    setSepticEmailSentDate(project.septic_email_sent_date || "");
    setPic(project.pic === "Yes" ? "Yes" : "No");
  }, [project?.id]);

  useEffect(() => {
    if (showSepticEmailModal && emailBodyRef.current && emailBody) {
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [showSepticEmailModal, emailBody]);

  useEffect(() => {
    if (!showSepticEmailModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showSepticEmailModal]);

  async function saveField(fieldName, value) {
    if (!project?.id) return;
    try {
      const updateData = { [fieldName]: value === "" ? null : value };

      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error(`Error saving ${fieldName}:`, error);
      alert(`Error saving ${fieldName}: ${error.message}`);
    }
  }

  function handlePlanningStatusChange(e) {
    const newValue = e.target.value;
    setPlanningStatus(newValue);
    saveField("planning_status", newValue);
  }

  function handleEnergyReportStatusChange(e) {
    const newValue = e.target.value;
    setEnergyReportStatus(newValue);
    saveField("energy_report_status", newValue);
  }

  function handleFootingCertificationStatusChange(e) {
    const newValue = e.target.value;
    setFootingCertificationStatus(newValue);
    saveField("footing_certification_status", newValue);
  }

  function handleBuildingPermitStatusChange(e) {
    const newValue = e.target.value;
    setBuildingPermitStatus(newValue);
    saveField("building_permit_status", newValue);
  }

  function handlePicChange(e) {
    const newValue = e.target.value;
    setPic(newValue);
    saveField("pic", newValue);
  }

  function handleSepticPermitChange(e) {
    const newValue = e.target.value;
    setSepticPermit(newValue);
    saveSepticFields({ septic_permit: newValue });
  }

  function handleSepticNotesChange(e) {
    setSepticNotes(e.target.value);
  }

  async function saveSepticFields(partial) {
    if (!project?.id) return;
    try {
      // Use main project PUT (same as other Planning fields). Partial body is OK: COALESCE keeps
      // unchanged columns. Avoids /septic sub-route 404s on servers that haven't picked up that route.
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save septic fields");
      }
      const updated = await response.json();
      if (updated.septic_permit !== undefined && updated.septic_permit !== null) {
        setSepticPermit(updated.septic_permit);
      }
      setSepticNotes(updated.septic_notes || "");
      setSepticEmailSentDate(updated.septic_email_sent_date || "");
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving septic fields:", error);
      alert(`Error saving septic fields: ${error.message}`);
    }
  }

  async function getSalespersonDetails(salespersonName) {
    if (!salespersonName) return { position: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { position: "" };
      const users = await response.json();
      const user = users.find((u) => u.name === salespersonName);
      if (!user) return { position: "" };
      const position = getUserPrimaryPositionName(user);
      return { position };
    } catch (error) {
      console.error("Error fetching salesperson details:", error);
      return { position: "" };
    }
  }

  async function replaceSepticTokens(text, projectData, opts = {}) {
    if (!text || !projectData) return text;
    const html = !!opts.html;
    let replaced = text;

    const projectName =
      (projectData.street && projectData.suburb)
        ? `${projectData.street}, ${projectData.suburb}`
        : projectData.name || "";

    replaced = replaced.replace(/{ProjectName}/g, projectName || "");
    replaced = replaced.replace(/{ClientName}/g, projectData.client_name || "");
    replaced = replaced.replace(/{ClientEmail}/g, projectData.email || "");
    replaced = replaced.replace(/{ClientPhone}/g, projectData.phone || "");
    replaced = replaced.replace(/{Salesperson}/g, projectData.salesperson || "");

    if (replaced.includes("{SalespersonPosition}")) {
      const { position } = await getSalespersonDetails(projectData.salesperson);
      const formattedPosition = position
        ? html
          ? `<br>${position}`
          : `\n${position}`
        : "";
      replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
    }

    // Preserve carriage returns/line breaks from plain-text templates in preview/send.
    if (html) {
      replaced = replaced
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n/g, "<br>");
    }

    return replaced;
  }

  async function handleOrganiseInspection() {
    if (!project?.id) return;
    setIsPreparingEmail(true);
    try {
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
      const template = templates.find(
        (t) => t.name && t.name.toLowerCase().trim() === "septic - organise inspection"
      );

      if (!template) {
        alert('Template "SEPTIC - Organise Inspection" not found. Please create it in Settings → Email Templates.');
        return;
      }

      const fromAddress = resolveNewProjectTeamFrom(settings, project, salespersonUser);
      const toAddresses = resolveNewProjectTeamToEmailsFromStream(settings, project);
      if (!fromAddress || !String(fromAddress).trim()) {
        alert(
          "No valid From address. Under Settings → Email Settings → General → New Project → Email to Team, set From for Sales Manager and/or Other for this project's state, or the legacy Team Email — From."
        );
        return;
      }
      if (!toAddresses.length) {
        alert("No valid To addresses found. Configure Settings → Email Settings → General → New Project.");
        return;
      }

      const subject = await replaceSepticTokens(template.subject || "", project);
      const body = await replaceSepticTokens(template.body || "", project, { html: true });

      setEmailTo(toAddresses.join(", "));
      setEmailFrom(fromAddress);
      setEmailSubject(subject);
      setEmailBody(body);
      setShowSepticEmailModal(true);
    } catch (error) {
      console.error("Error preparing septic email:", error);
      alert(`Failed to prepare email: ${error.message}`);
    } finally {
      setIsPreparingEmail(false);
    }
  }

  async function handleSendSepticEmail() {
    const toAddresses = emailTo.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!emailFrom || !emailFrom.trim()) {
      alert("From address is required");
      return;
    }

    setIsSendingEmail(true);
    try {
      await runWithEmailOverlay(async () => {
        const response = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toAddresses,
            from: emailFrom,
            subject: emailSubject,
            htmlBody: emailBody,
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Send failed (${response.status})`);
        }

        const sentDate = new Date().toISOString().split("T")[0];
        await saveSepticFields({ septic_email_sent_date: sentDate });
        alert("Email sent successfully.");
      });
      setShowSepticEmailModal(false);
    } catch (error) {
      console.error("Error sending septic email:", error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setIsSendingEmail(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Planning
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "24px" }}>
          {/* Column 1 - Planning Status */}
          <div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Planning Status
              </label>
              <select
                value={planningStatus}
                onChange={handlePlanningStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {PLANNING_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 2 - Energy Report */}
          <div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Energy Report
              </label>
              <select
                value={energyReportStatus}
                onChange={handleEnergyReportStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 3 - Footing Certification */}
          <div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Footing Certification
              </label>
              <select
                value={footingCertificationStatus}
                onChange={handleFootingCertificationStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 4 - Building Permit */}
          <div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Building Permit
              </label>
              <select
                value={buildingPermitStatus}
                onChange={handleBuildingPermitStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 5 - PIC */}
          <div>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                PIC
              </label>
              <select
                value={pic}
                onChange={handlePicChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {PIC_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2, Column 1 - Septic */}
          <div style={{ gridColumn: "1 / 2", marginTop: "8px" }}>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Septic Permit
              </label>
              <select
                value={septicPermit}
                onChange={handleSepticPermitChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {SEPTIC_PERMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Septic Notes
              </label>
              <textarea
                value={septicNotes}
                onChange={handleSepticNotesChange}
                onBlur={() =>
                  void saveSepticFields({
                    septic_notes: septicNotes.trim() === "" ? null : septicNotes,
                  })
                }
                rows={5}
                placeholder="Add septic notes..."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "0.95rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            <button
              onClick={handleOrganiseInspection}
              disabled={isPreparingEmail}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: WHITE,
                background: MONUMENT,
                cursor: isPreparingEmail ? "not-allowed" : "pointer",
                opacity: isPreparingEmail ? 0.7 : 1,
              }}
            >
              {isPreparingEmail ? "Preparing..." : "Organise Inspection"}
            </button>
            {septicEmailSentDate && (
              <div style={{ marginTop: "8px", fontSize: "0.82rem", color: UI.textMuted }}>
                Email sent: {septicEmailSentDate}
              </div>
            )}
          </div>
        </div>
      )}

      {showSepticEmailModal && (
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
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "30px",
              maxWidth: "900px",
              width: "95%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
            <div style={{ marginTop: "18px" }} />

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "8px" }}>To:</label>
              <input
                type="text"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "0.95rem", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "8px" }}>From:</label>
              <input
                type="text"
                value={emailFrom}
                onChange={(e) => setEmailFrom(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "0.95rem", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "8px" }}>Subject:</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "0.95rem", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, color: MONUMENT, marginBottom: "8px" }}>Body:</label>
              <div
                ref={emailBodyRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setEmailBody(e.currentTarget.innerHTML)}
                style={{
                  width: "100%",
                  minHeight: "260px",
                  maxHeight: "420px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "0.95rem",
                  boxSizing: "border-box",
                  overflowY: "auto",
                  background: WHITE,
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setShowSepticEmailModal(false)}
                disabled={isSendingEmail}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  background: WHITE,
                  color: MONUMENT,
                  cursor: isSendingEmail ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendSepticEmail}
                disabled={isSendingEmail}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: MONUMENT,
                  color: WHITE,
                  cursor: isSendingEmail ? "not-allowed" : "pointer",
                  opacity: isSendingEmail ? 0.7 : 1,
                }}
              >
                {isSendingEmail ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
