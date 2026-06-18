import React, { useState, useEffect, useRef } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import {
  generalEmailStateCode,
  resolveActiveClientContactToEmails,
  resolveDepositBalanceClientFrom,
  resolveDepositBalanceTeamFrom,
  resolveDepositBalanceTeamTo,
} from "../utils/emailGeneralSettings";
import { fullFivePercentDeposit, isFullFivePercentDepositPaid } from "../utils/projectDeposit";

const DEPOSIT_EMAIL_STEP_CLIENT = 1;
const DEPOSIT_EMAIL_STEP_INTERNAL = 2;
const DEPOSIT_TEMPLATE_CLIENT = "Deposit Balance Paid - Client";
const DEPOSIT_TEMPLATE_INTERNAL = "Deposit Balance Paid - Internal";

function findEmailTemplateByName(templates, name) {
  const key = String(name || "").trim().toLowerCase();
  return templates.find((t) => t.name && String(t.name).trim().toLowerCase() === key) || null;
}

function replaceDepositBalanceTokens(text, project) {
  if (text == null || !project) return text == null ? "" : String(text);
  let replaced = String(text);
  const projectName = project.name || "";
  replaced = replaced.replace(/{ProjectName}/g, projectName);

  const contact1 =
    project.client1_active === "true" && project.client1_email
      ? String(project.client1_email).trim()
      : "";
  const contact2 =
    project.client2_active === "true" && project.client2_email
      ? String(project.client2_email).trim()
      : "";
  const contact3 =
    project.client3_active === "true" && project.client3_email
      ? String(project.client3_email).trim()
      : "";
  replaced = replaced.replace(/{Contact1}/g, contact1);
  replaced = replaced.replace(/{Contact2}/g, contact2);
  replaced = replaced.replace(/{Contact3}/g, contact3);

  const clientFullName = project.client_name || "";
  const clientFirstName = clientFullName.trim().split(/\s+/)[0] || clientFullName;
  replaced = replaced.replace(/{ClientName}/g, clientFirstName);
  replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");

  let projectCostDisplay = "";
  if (project.project_cost != null && project.project_cost !== "") {
    const costNum =
      typeof project.project_cost === "string"
        ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
        : Number(project.project_cost);
    if (!isNaN(costNum)) projectCostDisplay = `$${costNum.toLocaleString()}`;
  }
  replaced = replaced.replace(/{ProjectCost}/g, projectCostDisplay);

  let depositPaid = "$0";
  let depositNum = 0;
  if (project.deposit != null && project.deposit !== "") {
    depositNum =
      typeof project.deposit === "string"
        ? parseFloat(project.deposit.replace(/[$,\s]/g, ""))
        : Number(project.deposit);
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
      depositStatus =
        depositNum === fullDepositAmount ? "Full Deposit Paid" : `${depositPaid} only`;
    } else {
      depositStatus = `${depositPaid} only`;
    }
  }
  replaced = replaced.replace(/{DepositStatus}/g, depositStatus);

  return replaced;
}

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const STREAM_OPTIONS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Henderson",
  "Creat Cash Flow",
  "Fresh Start Advisory",
];

function getLongestText(arr, include = "") {
  return arr.concat(include ? [include] : []).reduce(
    (longest, curr) => (curr.length > longest.length ? curr : longest),
    ""
  );
}

const DEPOSIT_OPTIONS = ["Full 5%", "$7.5k only", "Other"];

export default function Admin({ project, onUpdate }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [stream, setStream] = useState(project?.stream || "");
  const [customDeposit, setCustomDeposit] = useState("");
  const [projectCost, setProjectCost] = useState("");
  const [projectDate, setProjectDate] = useState("");
  const [salesperson, setSalesperson] = useState(project?.salesperson || "");
  const [salesTeamUsers, setSalesTeamUsers] = useState([]);
  const [loadingSalesUsers, setLoadingSalesUsers] = useState(false);
  const [showDepositBalanceEmailModal, setShowDepositBalanceEmailModal] = useState(false);
  const [depositEmailStep, setDepositEmailStep] = useState(DEPOSIT_EMAIL_STEP_CLIENT);
  const [depositEmailTo, setDepositEmailTo] = useState("");
  const [depositEmailFrom, setDepositEmailFrom] = useState("");
  const [depositEmailSubject, setDepositEmailSubject] = useState("");
  const [depositEmailBody, setDepositEmailBody] = useState("");
  const [depositEmailPreparing, setDepositEmailPreparing] = useState(false);
  const [depositEmailSending, setDepositEmailSending] = useState(false);
  const depositInternalDraftRef = useRef({ to: "", from: "", subject: "", body: "" });
  const depositEmailBodyRef = useRef(null);
  const saveFieldRef = useRef(() => Promise.resolve());
  
  useEffect(() => {
    // Initialize deposit amount - format with commas
    const depositValue = project?.deposit || "";
    if (depositValue) {
      // Check if it's a formatted string or needs formatting
      const numericValue = parseInt(depositValue.replace(/[^0-9]/g, "")) || 0;
      setCustomDeposit(numericValue > 0 ? `$${numericValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : depositValue);
    } else {
      setCustomDeposit("");
    }
    
    // Initialize project cost - format with commas
    const costValue = project?.project_cost || "";
    if (costValue) {
      const numericValue = parseInt(costValue.replace(/[^0-9]/g, "")) || 0;
      setProjectCost(numericValue > 0 ? `$${numericValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : "");
    } else {
      setProjectCost("");
    }

    // Initialize project date
    // If year field exists and is a date (YYYY-MM-DD format), use it
    // If it's just a year (e.g., "2024"), convert to date
    // Otherwise, leave empty for user to set
    if (project?.year) {
      const yearValue = project.year;
      // Check if it's already a date (YYYY-MM-DD format)
      if (/^\d{4}-\d{2}-\d{2}$/.test(yearValue)) {
        setProjectDate(yearValue);
      } else if (/^\d{4}$/.test(yearValue)) {
        // It's just a year, set to January 1st of that year
        setProjectDate(`${yearValue}-01-01`);
      } else {
        setProjectDate("");
      }
    } else {
      setProjectDate("");
    }
  }, [project]);
  
  const valuesRef = useRef({ stream, deposit: customDeposit, projectCost, projectDate, salesperson });
  
  useEffect(() => {
    valuesRef.current = { stream, deposit: customDeposit, projectCost, projectDate, salesperson };
  }, [stream, customDeposit, projectCost, projectDate, salesperson]);

  // Fetch sales team users on mount
  useEffect(() => {
    fetchSalesTeamUsers();
  }, []);

  async function fetchSalesTeamUsers() {
    setLoadingSalesUsers(true);
    try {
      // Fetch all users
      const usersResponse = await fetch(`${API_URL}/api/users`);
      if (!usersResponse.ok) {
        throw new Error("Failed to fetch users");
      }
      const allUsers = await usersResponse.json();
      
      // Filter users who have "Sales Team" as one of their positions
      const salesUsers = allUsers.filter((user) => {
        if (!user.positions || !Array.isArray(user.positions)) return false;
        return user.positions.some((position) => 
          position.name && position.name.toLowerCase() === "sales team"
        );
      });
      
      setSalesTeamUsers(salesUsers);
    } catch (error) {
      console.error("Error fetching sales team users:", error);
      setSalesTeamUsers([]);
    } finally {
      setLoadingSalesUsers(false);
    }
  }

  // NO AUTOSIZING ANYMORE, always 300px
  
  useEffect(() => {
    setStream(project?.stream || "");
    setSalesperson(project?.salesperson || "");
  }, [project]);

  async function saveField(fieldName, value) {
    if (!project?.id) return;
    const currentValues = valuesRef.current;
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";
    try {
      const updateData = {
        name: projectName,
        status: project?.status || null,
        stream: currentValues.stream,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: currentValues.deposit,
        project_cost: currentValues.projectCost, // Include project_cost in all updates
        [fieldName]: value === "" ? null : value,
      };
      
      // Special handling for project_cost to strip '$' and commas before saving
      if (fieldName === "project_cost" && typeof value === 'string') {
        updateData.project_cost = value.replace(/[^0-9]/g, "") || null;
      }
      
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save field:", errorData.error || response.statusText);
        return;
      }
      
      // Parse response but don't block on it
      const savedData = await response.json().catch(() => null);
      console.log("Successfully saved field:", savedData);
      
      // CRITICAL: ALWAYS call onUpdate after successful save - this refreshes the project data
      if (onUpdate) {
        console.log("Calling onUpdate to refresh project data...");
        onUpdate();
      } else {
        console.warn("onUpdate is not defined! Autosave will not refresh data.");
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  useEffect(() => {
    saveFieldRef.current = saveField;
  });

  useEffect(() => {
    return () => {
      const save = saveFieldRef.current;
      void save("deposit", valuesRef.current.deposit);
      void save("project_cost", valuesRef.current.projectCost);
    };
  }, []);

  async function handleStreamChange(e) {
    const newStream = e.target.value;
    setStream(newStream);
    valuesRef.current.stream = newStream;
    await saveField("stream", newStream);
  }

  async function handleSalespersonChange(e) {
    const newSalesperson = e.target.value;
    setSalesperson(newSalesperson);
    valuesRef.current.salesperson = newSalesperson;
    await saveField("salesperson", newSalesperson);
  }

  async function handleProjectDateChange(e) {
    const newDate = e.target.value;
    setProjectDate(newDate);
    valuesRef.current.projectDate = newDate;
    // Save to the "year" field (keeping same field name for backward compatibility)
    await saveField("year", newDate);
  }

  function handleCustomDepositChange(e) {
    // Format with commas as user types
    const numericValue = e.target.value.replace(/[^0-9]/g, "");
    const numeric = parseInt(numericValue) || 0;
    const formattedValue = numeric > 0 ? `$${numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : "";
    setCustomDeposit(formattedValue);
    valuesRef.current.deposit = formattedValue;
  }

  function handleProjectCostChange(e) {
    // Format project cost: remove all non-numeric characters, add $ prefix and commas
    const numericValue = e.target.value.replace(/[^0-9]/g, "");
    const numeric = parseInt(numericValue) || 0;
    const formattedValue = numeric > 0 ? `$${numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : "";
    setProjectCost(formattedValue);
    valuesRef.current.projectCost = formattedValue;
  }

  // Calculate full 5% deposit from project cost (same rule as Planning / Overview)
  function calculateFullDeposit() {
    const fullDeposit = fullFivePercentDeposit(projectCost);
    if (fullDeposit === 0) return "$0";
    return `$${fullDeposit.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }

  function isDepositFullyPaid() {
    return isFullFivePercentDepositPaid(customDeposit, projectCost);
  }

  async function handleFullDepositPaid() {
    const fullDepositAmount = fullFivePercentDeposit(projectCost);
    if (fullDepositAmount === 0) {
      alert("Please enter a Project Cost first.");
      return;
    }
    const formattedDeposit = `$${fullDepositAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    setCustomDeposit(formattedDeposit);
    valuesRef.current.deposit = formattedDeposit;
    await saveField("deposit", formattedDeposit);
    setDepositEmailStep(DEPOSIT_EMAIL_STEP_CLIENT);
    setShowDepositBalanceEmailModal(true);
    prepareDepositBalanceEmails();
  }

  function closeDepositBalanceEmailModal() {
    setShowDepositBalanceEmailModal(false);
    setDepositEmailStep(DEPOSIT_EMAIL_STEP_CLIENT);
    setDepositEmailTo("");
    setDepositEmailFrom("");
    setDepositEmailSubject("");
    setDepositEmailBody("");
    depositInternalDraftRef.current = { to: "", from: "", subject: "", body: "" };
  }

  function loadDepositEmailStepIntoForm(step, clientDraft, internalDraft) {
    const draft = step === DEPOSIT_EMAIL_STEP_CLIENT ? clientDraft : internalDraft;
    setDepositEmailTo(draft.to);
    setDepositEmailFrom(draft.from);
    setDepositEmailSubject(draft.subject);
    setDepositEmailBody(draft.body);
  }

  async function prepareDepositBalanceEmails() {
    setDepositEmailPreparing(true);
    try {
      const [templatesRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (!templatesRes.ok) throw new Error("Failed to fetch templates");
      const templates = await templatesRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};

      const stateCode = generalEmailStateCode(project);
      if (!stateCode) {
        alert(
          "Set State to VIC or QLD on this project. Deposit Balance email settings use that state (not the stream)."
        );
        closeDepositBalanceEmailModal();
        return;
      }

      const clientTemplate = findEmailTemplateByName(templates, DEPOSIT_TEMPLATE_CLIENT);
      if (!clientTemplate) {
        alert(
          `Template "${DEPOSIT_TEMPLATE_CLIENT}" not found. Create it in Settings → Email Templates.`
        );
        closeDepositBalanceEmailModal();
        return;
      }

      const internalTemplate = findEmailTemplateByName(templates, DEPOSIT_TEMPLATE_INTERNAL);
      if (!internalTemplate) {
        alert(
          `Template "${DEPOSIT_TEMPLATE_INTERNAL}" not found. Create it in Settings → Email Templates.`
        );
        closeDepositBalanceEmailModal();
        return;
      }

      const clientToList = resolveActiveClientContactToEmails(project);
      const clientFrom = resolveDepositBalanceClientFrom(settings, project).trim();
      const teamFrom = resolveDepositBalanceTeamFrom(settings, project).trim();
      const teamTo = resolveDepositBalanceTeamTo(settings, project).trim();

      if (clientToList.length === 0) {
        alert(
          "No client recipients. Tick at least one contact with an email in Client Info."
        );
        closeDepositBalanceEmailModal();
        return;
      }
      if (!clientFrom) {
        alert(
          `Set From for ${stateCode} under Settings → Email Settings → General → Deposit Balance → Email to Client (${stateCode} column).`
        );
        closeDepositBalanceEmailModal();
        return;
      }
      if (!teamTo) {
        alert(
          `Set To for ${stateCode} under Settings → Email Settings → General → Deposit Balance → Email to Team (${stateCode} column).`
        );
        closeDepositBalanceEmailModal();
        return;
      }
      if (!teamFrom) {
        alert(
          `Set From for ${stateCode} under Settings → Email Settings → General → Deposit Balance → Email to Team (${stateCode} column).`
        );
        closeDepositBalanceEmailModal();
        return;
      }

      const projectForTokens = {
        ...project,
        deposit: valuesRef.current.deposit || project?.deposit,
        project_cost: valuesRef.current.projectCost || project?.project_cost,
      };

      const clientDraft = {
        to: clientToList.join(", "),
        from: clientFrom,
        subject: replaceDepositBalanceTokens(clientTemplate.subject || "", projectForTokens),
        body: replaceDepositBalanceTokens(clientTemplate.body || "", projectForTokens),
      };
      const internalDraft = {
        to: teamTo,
        from: teamFrom,
        subject: replaceDepositBalanceTokens(internalTemplate.subject || "", projectForTokens),
        body: replaceDepositBalanceTokens(internalTemplate.body || "", projectForTokens),
      };

      depositInternalDraftRef.current = internalDraft;
      loadDepositEmailStepIntoForm(DEPOSIT_EMAIL_STEP_CLIENT, clientDraft, internalDraft);
    } catch (err) {
      console.error("Error preparing deposit balance emails:", err);
      alert("Failed to prepare emails: " + (err.message || err));
      closeDepositBalanceEmailModal();
    } finally {
      setDepositEmailPreparing(false);
    }
  }

  useEffect(() => {
    if (showDepositBalanceEmailModal && depositEmailBodyRef.current && depositEmailBody) {
      if (depositEmailBodyRef.current.innerHTML !== depositEmailBody) {
        depositEmailBodyRef.current.innerHTML = depositEmailBody;
      }
    }
  }, [showDepositBalanceEmailModal, depositEmailStep, depositEmailBody, depositEmailPreparing]);

  async function sendDepositBalanceEmailDraft({ to, from, subject, body }) {
    const toAddresses = String(to || "")
      .split(/[,;]+/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      throw new Error("Please enter at least one email address");
    }
    if (!from || !String(from).trim()) {
      throw new Error("From address is required");
    }
    await runWithEmailOverlay(async () => {
      const res = await fetch(`${API_URL}/api/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toAddresses,
          from: String(from).trim(),
          subject,
          htmlBody: body,
          projectId: project?.id || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Send failed");
    });
  }

  async function handleSendDepositBalanceEmail() {
    if (depositEmailSending) return;
    setDepositEmailSending(true);
    try {
      await sendDepositBalanceEmailDraft({
        to: depositEmailTo,
        from: depositEmailFrom,
        subject: depositEmailSubject,
        body: depositEmailBody,
      });

      if (depositEmailStep === DEPOSIT_EMAIL_STEP_CLIENT) {
        setDepositEmailStep(DEPOSIT_EMAIL_STEP_INTERNAL);
        loadDepositEmailStepIntoForm(
          DEPOSIT_EMAIL_STEP_INTERNAL,
          null,
          depositInternalDraftRef.current
        );
      } else {
        alert("Both deposit balance emails sent successfully.");
        closeDepositBalanceEmailModal();
      }
    } catch (err) {
      console.error("Send deposit balance email error:", err);
      alert(err.message || "Failed to send email.");
    } finally {
      setDepositEmailSending(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Admin
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {/* Column 1 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Stream
              </div>
              <select
                name="stream"
                value={stream}
                onChange={handleStreamChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                <option value="">Select Stream</option>
                {STREAM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", display: "flex", gap: "12px", alignItems: "baseline" }}>
                <div style={{ flex: "1", minWidth: 0 }}>Start Date</div>
                <div style={{ flex: "0 0 auto", width: "5.5rem", textAlign: "center" }}>Project Days</div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <input
                  type="date"
                  value={projectDate}
                  onChange={handleProjectDateChange}
                  style={{
                    flex: "1",
                    minWidth: 0,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                />
                <input
                  type="text"
                  value={(() => {
                    if (!projectDate) return "";
                    const startDate = new Date(projectDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    startDate.setHours(0, 0, 0, 0);
                    const diffTime = today - startDate;
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    return diffDays >= 0 ? diffDays.toString() : "";
                  })()}
                  readOnly
                  style={{
                    flex: "0 0 auto",
                    width: "5.5rem",
                    minWidth: "5.5rem",
                    padding: "10px 8px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "default",
                    textAlign: "center",
                  }}
                />
              </div>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Salesperson
              </div>
              <select
                name="salesperson"
                value={salesperson}
                onChange={handleSalespersonChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                <option value="">Select Salesperson</option>
                {loadingSalesUsers ? (
                  <option value="">Loading...</option>
                ) : (
                  salesTeamUsers.map((user) => (
                    <option key={user.id} value={user.name}>
                      {user.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Column 2 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Project Cost
              </div>
              <input
                type="text"
                name="projectCost"
                value={projectCost}
                onChange={handleProjectCostChange}
                placeholder="$0"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  maxWidth: "100%",
                }}
                autoComplete="off"
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                {isDepositFullyPaid() ? "Total Deposit - PAID" : "Total Deposit"}
              </div>
              <div
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  maxWidth: "100%",
                }}
              >
                {calculateFullDeposit()}
              </div>
            </div>
            {!isDepositFullyPaid() && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Deposit Paid
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <input
                    type="text"
                    name="customDeposit"
                    value={customDeposit}
                    onChange={handleCustomDepositChange}
                    placeholder="$0"
                    style={{
                      flex: "1",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "none",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleFullDepositPaid}
                    style={{
                      background: MONUMENT,
                      color: WHITE,
                      border: "none",
                      borderRadius: "10px",
                      padding: "10px 20px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background 0.17s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Full Deposit Paid
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Column 3 - reserved (variations moved to Variations tab) */}
          <div style={{ flex: "1", minWidth: "200px" }} />

          {/* Column 4 - reserved */}
          <div style={{ flex: "1", minWidth: "200px" }} />
        </div>
      )}

      {/* Deposit Balance Paid – Email Modal */}
      {showDepositBalanceEmailModal && (
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
              <div>
                <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>
                  {depositEmailStep === DEPOSIT_EMAIL_STEP_CLIENT
                    ? "Deposit Balance Paid — Email 1 of 2 (Client)"
                    : "Deposit Balance Paid — Email 2 of 2 (Internal Team)"}
                </h2>
                {depositEmailStep === DEPOSIT_EMAIL_STEP_INTERNAL ? (
                  <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: UI.textMuted }}>
                    The client email was sent. Review and send the internal team email.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeDepositBalanceEmailModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: 0,
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
            {depositEmailPreparing ? (
              <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>Preparing email...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>To (comma-separated)</label>
                  <input
                    type="text"
                    value={depositEmailTo}
                    onChange={(e) => setDepositEmailTo(e.target.value)}
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>From</label>
                  <input
                    type="text"
                    value={depositEmailFrom}
                    onChange={(e) => setDepositEmailFrom(e.target.value)}
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>Subject</label>
                  <input
                    type="text"
                    value={depositEmailSubject}
                    onChange={(e) => setDepositEmailSubject(e.target.value)}
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>Body</label>
                  <div
                    ref={depositEmailBodyRef}
                    contentEditable
                    onInput={(e) => setDepositEmailBody(e.currentTarget.innerHTML)}
                    onBlur={(e) => setDepositEmailBody(e.currentTarget.innerHTML)}
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
                    onClick={closeDepositBalanceEmailModal}
                    disabled={depositEmailSending}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      background: "transparent",
                      border: `1px solid ${SECTION_GREY}`,
                      borderRadius: "8px",
                      cursor: depositEmailSending ? "wait" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendDepositBalanceEmail}
                    disabled={depositEmailSending}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: depositEmailSending ? "wait" : "pointer",
                    }}
                  >
                    {depositEmailSending
                      ? "Sending…"
                      : depositEmailStep === DEPOSIT_EMAIL_STEP_CLIENT
                        ? "Send & Continue"
                        : "Send Email"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
