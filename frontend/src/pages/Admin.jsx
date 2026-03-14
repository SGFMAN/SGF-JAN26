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
  const [projectDate, setProjectDate] = useState("");
  const [salesperson, setSalesperson] = useState(project?.salesperson || "");
  const [salesTeamUsers, setSalesTeamUsers] = useState([]);
  const [loadingSalesUsers, setLoadingSalesUsers] = useState(false);
  const [variationsFiles, setVariationsFiles] = useState([]);
  const [loadingVariations, setLoadingVariations] = useState(false);
  const [variationsPath, setVariationsPath] = useState("");
  
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

    // Fetch variations files
    if (project?.id) {
      fetchVariationsFiles();
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

  const fetchVariationsFiles = async () => {
    if (!project?.id) return;

    setLoadingVariations(true);
    try {
      const response = await fetch(`${API_URL}/api/files/variations/${project.id}`);
      if (response.ok) {
        const data = await response.json();
        setVariationsFiles(data.files || []);
        setVariationsPath(data.path || "");
      } else {
        console.error("Failed to fetch variations files");
        setVariationsFiles([]);
        setVariationsPath("");
      }
    } catch (error) {
      console.error("Error fetching variations files:", error);
      setVariationsFiles([]);
      setVariationsPath("");
    } finally {
      setLoadingVariations(false);
    }
  };

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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", display: "flex", gap: "12px" }}>
                <div style={{ flex: "1" }}>Start Date</div>
                <div style={{ flex: "1" }}>Project Days</div>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <input
                  type="date"
                  value={projectDate}
                  onChange={handleProjectDateChange}
                  style={{
                    flex: "1",
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
                    flex: "1",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "default",
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

          {/* Column 3 - Variations */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "8px", color: MONUMENT }}>
                Variations
              </h3>
              {variationsPath && (
                <div style={{ 
                  color: "#666", 
                  fontSize: "0.75rem", 
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  marginBottom: "8px"
                }}>
                  {variationsPath}
                </div>
              )}
            </div>
            {loadingVariations ? (
              <div style={{ color: "#32323399", fontSize: "0.9rem" }}>Loading files...</div>
            ) : variationsFiles.length === 0 ? (
              <div style={{ color: "#32323399", fontSize: "0.9rem" }}>No files found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {variationsFiles.map((file, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "8px 12px",
                      background: WHITE,
                      borderRadius: "6px",
                      fontSize: "0.9rem",
                      color: MONUMENT,
                    }}
                  >
                    {file.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 4 - Empty for now */}
          <div style={{ flex: "1", minWidth: "200px" }}>
          </div>
        </div>
      )}
    </div>
  );
}
