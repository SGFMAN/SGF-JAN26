import React, { useState, useEffect, useRef } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
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

const DEPOSIT_OPTIONS = ["Full 5%", "$5k only", "Other"];

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
  const [depositEmailTo, setDepositEmailTo] = useState("");
  const [depositEmailFrom, setDepositEmailFrom] = useState("");
  const [depositEmailSubject, setDepositEmailSubject] = useState("");
  const [depositEmailBody, setDepositEmailBody] = useState("");
  const [depositEmailPreparing, setDepositEmailPreparing] = useState(false);
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

  // Calculate full 5% deposit from project cost
  function calculateFullDeposit() {
    const costValue = projectCost.replace(/[^0-9]/g, "");
    const numeric = parseInt(costValue) || 0;
    if (numeric === 0) return "$0";
    const fullDeposit = Math.floor(numeric / 20); // 5% = divide by 20
    return `$${fullDeposit.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }

  // Check if deposit paid equals full 5% deposit
  function isDepositFullyPaid() {
    const costValue = projectCost.replace(/[^0-9]/g, "");
    const costNumeric = parseInt(costValue) || 0;
    if (costNumeric === 0) return false;
    
    const fullDepositAmount = Math.floor(costNumeric / 20); // 5% = divide by 20
    const depositPaidValue = customDeposit.replace(/[^0-9]/g, "");
    const depositPaidNumeric = parseInt(depositPaidValue) || 0;
    
    return depositPaidNumeric === fullDepositAmount && fullDepositAmount > 0;
  }

  async function handleFullDepositPaid() {
    const costValue = projectCost.replace(/[^0-9]/g, "");
    const numeric = parseInt(costValue) || 0;
    if (numeric === 0) {
      alert("Please enter a Project Cost first.");
      return;
    }
    const fullDepositAmount = Math.floor(numeric / 20); // 5% = divide by 20
    const formattedDeposit = `$${fullDepositAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    setCustomDeposit(formattedDeposit);
    valuesRef.current.deposit = formattedDeposit;
    await saveField("deposit", formattedDeposit);
    setShowDepositBalanceEmailModal(true);
    prepareDepositBalanceEmail();
  }

  async function prepareDepositBalanceEmail() {
    setDepositEmailPreparing(true);
    try {
      const res = await fetch(`${API_URL}/api/email-templates`);
      if (!res.ok) throw new Error("Failed to fetch templates");
      const templates = await res.json();
      const template = templates.find(
        (t) => t.name && t.name.trim().toLowerCase() === "deposit balance paid"
      );
      if (!template) {
        alert('Template "Deposit Balance Paid" not found. Create it in Settings → Email Templates.');
        setShowDepositBalanceEmailModal(false);
        setDepositEmailPreparing(false);
        return;
      }
      const projectName = project?.name || "";
      const replaceProjectName = (text) =>
        text != null ? String(text).replace(/{ProjectName}/g, projectName) : "";
      let toAddresses = template.to_addresses;
      if (Array.isArray(toAddresses)) {
        toAddresses = toAddresses.map(replaceProjectName).filter((a) => a.trim()).join(", ");
      } else if (toAddresses) {
        toAddresses = replaceProjectName(toAddresses).split(",").map((a) => a.trim()).filter((a) => a).join(", ");
      } else {
        toAddresses = "";
      }
      setDepositEmailTo(toAddresses);
      setDepositEmailFrom(template.from_address || "");
      setDepositEmailSubject(replaceProjectName(template.subject || ""));
      setDepositEmailBody(replaceProjectName(template.body || ""));
    } catch (err) {
      console.error("Error preparing deposit balance email:", err);
      alert("Failed to prepare email: " + (err.message || err));
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
  }, [showDepositBalanceEmailModal, depositEmailBody]);

  async function handleSendDepositBalanceEmail() {
    const toAddresses = depositEmailTo.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!depositEmailFrom || !depositEmailFrom.trim()) {
      alert("From address is required");
      return;
    }
    try {
      await runWithEmailOverlay(async () => {
        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toAddresses,
            from: depositEmailFrom,
            subject: depositEmailSubject,
            htmlBody: depositEmailBody,
            projectId: project?.id || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Send failed");
        alert(data.message || "Email sent successfully!");
      });
      setShowDepositBalanceEmailModal(false);
    } catch (err) {
      console.error("Send deposit balance email error:", err);
      alert(err.message || "Failed to send email.");
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", display: "flex", gap: "12px", alignItems: "baseline" }}>
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email (Deposit Balance Paid)</h2>
              <button
                type="button"
                onClick={() => setShowDepositBalanceEmailModal(false)}
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>To (comma-separated)</label>
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>From</label>
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>Subject</label>
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
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>Body</label>
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
                    onClick={() => setShowDepositBalanceEmailModal(false)}
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
                    type="button"
                    onClick={handleSendDepositBalanceEmail}
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
      )}
    </div>
  );
}
