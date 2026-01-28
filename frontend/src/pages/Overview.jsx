import React, { useState, useEffect } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function Overview({ project }) {
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTo, setPreviewTo] = useState("");
  const [previewFrom, setPreviewFrom] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");

  useEffect(() => {
    fetchEmailTemplates();
  }, []);

  async function fetchEmailTemplates() {
    try {
      const response = await fetch(`${API_URL}/api/email-templates`);
      if (!response.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const data = await response.json();
      setEmailTemplates(data || []);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      setEmailTemplates([]);
    }
  }

  /** Fetch salesperson details (position, phone, email) by name from users API. */
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

  async function replaceTokens(text, project, opts = {}) {
    if (!text || !project) return text;
    const html = !!opts.html;

    let replaced = text;

    replaced = replaced.replace(/{ProjectName}/g, project.name || "");
    replaced = replaced.replace(/{ClientName}/g, project.client_name || "");
    replaced = replaced.replace(/{ProjectCost}/g, project.project_cost ? `$${project.project_cost.toLocaleString()}` : "");
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

    // Site Visit Scheduled Date
    if (project.site_visit_scheduled_date) {
      const formattedDate = new Date(project.site_visit_scheduled_date + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      replaced = replaced.replace(/{SiteVisitScheduledDate}/g, formattedDate);
    } else {
      replaced = replaced.replace(/{SiteVisitScheduledDate}/g, "");
    }

    // Site Visit Scheduled Period (AM/PM)
    replaced = replaced.replace(/{SiteVisitScheduledPeriod}/g, project.site_visit_scheduled_period || "");

    return replaced;
  }

  async function handleSendTest() {
    if (!selectedTemplateId) {
      alert("Please select an email template");
      return;
    }

    const template = emailTemplates.find(t => t.id === parseInt(selectedTemplateId));
    if (!template) {
      alert("Template not found");
      return;
    }

    if (!template.from_address || !template.from_address.trim()) {
      alert("Template has no From address. Edit the template in Settings → Email Settings.");
      return;
    }

    // Replace tokens in to addresses (async for salesperson position lookup)
    let toAddresses = template.to_addresses || [];
    if (Array.isArray(toAddresses)) {
      const replacedAddresses = await Promise.all(
        toAddresses.map(addr => replaceTokens(addr, project))
      );
      toAddresses = replacedAddresses.filter(addr => addr.trim().length > 0);
    } else {
      const replaced = await replaceTokens(toAddresses, project);
      toAddresses = replaced.split(",").map(a => a.trim()).filter(a => a.length > 0);
    }

    if (toAddresses.length === 0) {
      alert("No valid email addresses found after replacing tokens");
      return;
    }

    const subject = await replaceTokens(template.subject || "", project);
    const htmlBody = await replaceTokens(template.body || "", project, { html: true });

    // Open preview modal with pre-filled data
    setPreviewTo(toAddresses.join(", "));
    setPreviewFrom(template.from_address || "");
    setPreviewSubject(subject);
    setPreviewBody(htmlBody);
    setPreviewModalOpen(true);
  }

  async function handleSendFromPreview() {
    const toAddresses = previewTo.split(",").map(a => a.trim()).filter(a => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!previewFrom || !previewFrom.trim()) {
      alert("From address is required");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toAddresses,
          from: previewFrom,
          subject: previewSubject,
          htmlBody: previewBody,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      alert(data.message || "Email sent successfully!");
      setPreviewModalOpen(false);
    } catch (err) {
      console.error("Send email error:", err);
      alert(err.message || "Failed to send email.");
    }
  }
  // Calculate full deposit (5% of project cost)
  function calculateFullDeposit() {
    if (!project?.project_cost) return 0;
    const costStr = project.project_cost.toString().replace(/[^0-9]/g, "");
    const costNum = parseInt(costStr) || 0;
    return Math.floor(costNum / 20);
  }

  // Check if deposit is fully paid
  function isDepositFullyPaid() {
    if (!project?.deposit || !project?.project_cost) return false;
    const depositStr = project.deposit.toString().replace(/[^0-9]/g, "");
    const depositNum = parseInt(depositStr) || 0;
    const fullDeposit = calculateFullDeposit();
    return depositNum >= fullDeposit && fullDeposit > 0;
  }

  // Get deposit status text
  function getDepositStatus() {
    if (!project?.deposit || !project?.project_cost) return "No Deposit";
    return isDepositFullyPaid() ? "Full Deposit" : "Partial Deposit";
  }

  // Color constants
  const COLOR_RED = "#cc3333";    // Default/incomplete
  const COLOR_ORANGE = "#ff8800"; // In progress
  const COLOR_GREEN = "#33cc33";  // Complete

  // Get deposit status color
  function getDepositStatusColor() {
    const status = getDepositStatus();
    if (status === "Full Deposit") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get drawings status color
  function getDrawingsStatusColor() {
    const status = project?.drawings_status || "In Progress";
    if (status === "Concept Approved") return COLOR_ORANGE;
    if (status === "Working Drawings Approved") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get colours status color
  function getColoursStatusColor() {
    const status = project?.colours_status || "Not Sent";
    if (status === "Sent") return COLOR_ORANGE;
    if (status === "Complete") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get window status color
  function getWindowStatusColor() {
    const status = project?.window_status || "Not Ordered";
    if (status === "Ordered") return COLOR_ORANGE;
    if (status === "Complete") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get site visit status color
  function getSiteVisitStatusColor() {
    const status = project?.site_visit_status || "Not Complete";
    if (status === "Booked") return COLOR_ORANGE;
    if (status === "Complete") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get contract status text
  function getContractStatusText() {
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";

    // Check if all required documents are complete
    const isContractComplete = contractStatus === "Complete";
    const isSupportingDocsComplete = supportingDocsStatus === "Complete";
    // Water declaration is complete if it's "Complete" OR "Not Required"
    const isWaterDeclComplete = waterDeclStatus === "Complete" || waterDeclStatus === "Not Required";

    if (isContractComplete && isSupportingDocsComplete && isWaterDeclComplete) {
      return "All Documents Complete";
    }

    return "Documents Missing";
  }

  // Get contract status color (must check all three statuses for green)
  function getContractStatusColor() {
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";

    // For green: all three must be complete
    if (
      contractStatus === "Complete" &&
      supportingDocsStatus === "Complete" &&
      (waterDeclStatus === "Complete" || waterDeclStatus === "Not Required")
    ) {
      return COLOR_GREEN;
    }

    // For orange: contract status must be "Sent"
    if (contractStatus === "Sent") return COLOR_ORANGE;

    // Default: red
    return COLOR_RED;
  }

  // Get planning permit status color
  function getPlanningPermitStatusColor() {
    const status = project?.planning_status || "Not Selected";
    if (status === "No Planning Required" || status === "Planning Permit Issued") {
      return COLOR_GREEN;
    }
    return COLOR_RED;
  }

  // Get energy report status color
  function getEnergyReportStatusColor() {
    const status = project?.energy_report_status || "Not Submitted";
    if (status === "Complete") return COLOR_GREEN;
    if (status === "Sent") return COLOR_ORANGE;
    return COLOR_RED;
  }

  // Get footing certification status color
  function getFootingCertificationStatusColor() {
    const status = project?.footing_certification_status || "Not Submitted";
    if (status === "Complete") return COLOR_GREEN;
    if (status === "Sent") return COLOR_ORANGE;
    return COLOR_RED;
  }

  // Get building permit status color
  function getBuildingPermitStatusColor() {
    const status = project?.building_permit_status || "Not Submitted";
    if (status === "Complete") return COLOR_GREEN;
    if (status === "Sent") return COLOR_ORANGE;
    return COLOR_RED;
  }

  // Check if design phase is complete (all required statuses must be green)
  function isDesignPhaseComplete() {
    // Check drawings status - must be "Working Drawings Approved"
    const drawingsStatus = project?.drawings_status || "In Progress";
    if (drawingsStatus !== "Working Drawings Approved") return false;

    // Check colours status - must be "Complete"
    const coloursStatus = project?.colours_status || "Not Sent";
    if (coloursStatus !== "Complete") return false;

    // Check window status - must be "Complete"
    const windowStatus = project?.window_status || "Not Ordered";
    if (windowStatus !== "Complete") return false;

    // Check site visit status - must be "Complete"
    const siteVisitStatus = project?.site_visit_status || "Not Complete";
    if (siteVisitStatus !== "Complete") return false;

    // Check contract status - all three must be complete
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";
    if (contractStatus !== "Complete" || 
        supportingDocsStatus !== "Complete" || 
        (waterDeclStatus !== "Complete" && waterDeclStatus !== "Not Required")) {
      return false;
    }

    // Check deposit status - must be fully paid
    if (!isDepositFullyPaid()) return false;

    // Check planning permit status - must be "No Planning Required" or "Planning Permit Issued"
    const planningStatus = project?.planning_status || "Not Selected";
    if (planningStatus !== "No Planning Required" && planningStatus !== "Planning Permit Issued") {
      return false;
    }

    // Check energy report status - must be "Complete"
    const energyReportStatus = project?.energy_report_status || "Not Submitted";
    if (energyReportStatus !== "Complete") return false;

    // Check footing certification status - must be "Complete"
    const footingCertificationStatus = project?.footing_certification_status || "Not Submitted";
    if (footingCertificationStatus !== "Complete") return false;

    // Check building permit status - must be "Complete"
    const buildingPermitStatus = project?.building_permit_status || "Not Submitted";
    if (buildingPermitStatus !== "Complete") return false;

    // All checks passed
    return true;
  }

  // Get design phase progress text
  function getDesignPhaseProgress() {
    return isDesignPhaseComplete() ? "Complete" : "Incomplete";
  }

  // Get design phase progress color
  function getDesignPhaseProgressColor() {
    return isDesignPhaseComplete() ? COLOR_GREEN : COLOR_RED;
  }

  // Get construction phase progress text (placeholder - always Incomplete for now)
  function getConstructionPhaseProgress() {
    // TODO: Define logic for Construction Phase completion
    return "Incomplete";
  }

  // Get construction phase progress color
  function getConstructionPhaseProgressColor() {
    // TODO: Define logic for Construction Phase completion
    return COLOR_RED;
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Overview
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {/* Column 1 - Design Phase Progress and Construction Phase Progress */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Design Phase Progress
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getDesignPhaseProgressColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getDesignPhaseProgress()}
              </div>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Construction Phase Progress
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getConstructionPhaseProgressColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getConstructionPhaseProgress()}
              </div>
            </div>
          </div>

          {/* Column 2 - Drawings Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Drawings Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getDrawingsStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.drawings_status || "In Progress"}
              </div>
            </div>
          </div>

          {/* Column 3 - Colour Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Colour Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getColoursStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.colours_status || "Not Sent"}
              </div>
            </div>
          </div>

          {/* Column 4 - Window Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Window Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getWindowStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.window_status || "Not Ordered"}
              </div>
            </div>
          </div>

          {/* Column 5 - Site Visit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Site Visit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getSiteVisitStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.site_visit_status || "Not Complete"}
              </div>
            </div>
          </div>

          {/* Column 6 - Contract Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Contract Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getContractStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getContractStatusText()}
              </div>
            </div>
          </div>

          {/* Column 7 - Deposit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Deposit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getDepositStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getDepositStatus()}
              </div>
            </div>
          </div>

          {/* Column 8 - Planning Permit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Planning Permit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getPlanningPermitStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.planning_status || "Not Selected"}
              </div>
            </div>
          </div>

          {/* Column 9 - Energy Report Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Energy Report Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getEnergyReportStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.energy_report_status || "Not Submitted"}
              </div>
            </div>
          </div>

          {/* Column 10 - Footing Certification Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Footing Certification Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getFootingCertificationStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.footing_certification_status || "Not Submitted"}
              </div>
            </div>
          </div>

          {/* Column 11 - Building Permit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Building Permit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getBuildingPermitStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.building_permit_status || "Not Submitted"}
              </div>
            </div>
          </div>

          {/* Test Email Template Section - at the bottom */}
          <div style={{ flex: "1 1 100%", minWidth: "100%", marginTop: "24px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Test Email Template
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={{
                    minWidth: "200px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select template...</option>
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={!selectedTemplateId}
                  style={{
                    background: selectedTemplateId ? MONUMENT : "#ccc",
                    color: WHITE,
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: selectedTemplateId ? "pointer" : "not-allowed",
                    transition: "background 0.17s",
                    opacity: selectedTemplateId ? 1 : 0.6,
                  }}
                >
                  Send Test
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      {previewModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewModalOpen(false);
            }
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
                onClick={() => setPreviewModalOpen(false)}
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

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={previewTo}
                  onChange={(e) => setPreviewTo(e.target.value)}
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
                  value={previewFrom}
                  onChange={(e) => setPreviewFrom(e.target.value)}
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
                  value={previewSubject}
                  onChange={(e) => setPreviewSubject(e.target.value)}
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
                  Body (HTML)
                </label>
                <textarea
                  value={previewBody}
                  onChange={(e) => setPreviewBody(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: "300px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    resize: "vertical",
                    fontFamily: "monospace",
                  }}
                />
                <div style={{ marginTop: "8px", padding: "12px", background: "#f5f5f5", borderRadius: "8px", border: `1px solid ${SECTION_GREY}` }}>
                  <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>Preview:</div>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: MONUMENT,
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                    }}
                    dangerouslySetInnerHTML={{ __html: previewBody.replace(/\n/g, "<br>") }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  onClick={() => setPreviewModalOpen(false)}
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
                  onClick={handleSendFromPreview}
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
          </div>
        </div>
      )}
    </div>
  );
}
