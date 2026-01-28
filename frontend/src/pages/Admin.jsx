import React, { useState, useEffect, useRef } from "react";

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
  "Maple Group",
];

function getLongestText(arr, include = "") {
  return arr.concat(include ? [include] : []).reduce(
    (longest, curr) => (curr.length > longest.length ? curr : longest),
    ""
  );
}

const DEPOSIT_OPTIONS = ["Full 5%", "$5k only", "Other"];

export default function Admin({ project, onUpdate }) {
  const [stream, setStream] = useState(project?.stream || "");
  const [customDeposit, setCustomDeposit] = useState("");
  const [projectCost, setProjectCost] = useState("");
  
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
  }, [project]);
  
  const valuesRef = useRef({ stream, deposit: customDeposit, projectCost });
  
  useEffect(() => {
    valuesRef.current = { stream, deposit: customDeposit, projectCost };
  }, [stream, customDeposit, projectCost]);

  // NO AUTOSIZING ANYMORE, always 300px
  
  useEffect(() => {
    setStream(project?.stream || "");
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

  async function handleStreamChange(e) {
    const newStream = e.target.value;
    setStream(newStream);
    valuesRef.current.stream = newStream;
    await saveField("stream", newStream);
  }

  function handleCustomDepositChange(e) {
    // Format with commas as user types
    const numericValue = e.target.value.replace(/[^0-9]/g, "");
    const numeric = parseInt(numericValue) || 0;
    const formattedValue = numeric > 0 ? `$${numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : "";
    setCustomDeposit(formattedValue);
    valuesRef.current.deposit = formattedValue;
  }

  async function handleCustomDepositBlur() {
    await saveField("deposit", valuesRef.current.deposit);
  }

  function handleProjectCostChange(e) {
    // Format project cost: remove all non-numeric characters, add $ prefix and commas
    const numericValue = e.target.value.replace(/[^0-9]/g, "");
    const numeric = parseInt(numericValue) || 0;
    const formattedValue = numeric > 0 ? `$${numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : "";
    setProjectCost(formattedValue);
    valuesRef.current.projectCost = formattedValue;
  }

  async function handleProjectCostBlur() {
    await saveField("project_cost", valuesRef.current.projectCost);
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Year
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
                {project.year || "Not set"}
              </div>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Salesperson
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
                {project.salesperson || "Not set"}
              </div>
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
                onBlur={handleProjectCostBlur}
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
                    onBlur={handleCustomDepositBlur}
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

          {/* Column 3 - Empty for now */}
          <div style={{ flex: "1", minWidth: "200px" }}>
          </div>

          {/* Column 4 - Empty for now */}
          <div style={{ flex: "1", minWidth: "200px" }}>
          </div>
        </div>
      )}
    </div>
  );
}
