import React, { useState, useEffect } from "react";

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

const DEPOSIT_OPTIONS = ["Full 5%", "$5k only", "Other"];

export default function NewProject4({ isOpen, onClose, formData, onFormDataChange, onBack, onCreate, onNext }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [tempDepositAmount, setTempDepositAmount] = useState("");
  const [previousDepositType, setPreviousDepositType] = useState("");
  const [depositType, setDepositType] = useState(""); // "Full 5%", "$5k only", "Other", or ""
  const [salesTeamUsers, setSalesTeamUsers] = useState([]);
  const [loadingSalesUsers, setLoadingSalesUsers] = useState(false);

  // Format number with commas: 1234567 -> "1,234,567"
  function formatWithCommas(num) {
    if (!num || num === 0) return "0";
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Parse formatted string back to number: "$1,234,567" -> 1234567
  function parseFormattedNumber(formattedStr) {
    if (!formattedStr) return 0;
    return parseInt(formattedStr.replace(/[^0-9]/g, "")) || 0;
  }

  // Calculate actual deposit amount based on deposit type and project cost
  function calculateDepositAmount() {
    const projectCostNum = parseFormattedNumber(formData.projectCost);
    
    if (depositType === "Full 5%") {
      const amount = projectCostNum > 0 ? Math.floor(projectCostNum / 20) : 0;
      return amount > 0 ? `$${formatWithCommas(amount)}` : "$0";
    } else if (depositType === "$5k only") {
      return "$5,000";
    } else if (depositType === "Other" && formData.customDeposit) {
      // Format the custom deposit with commas
      const customNum = parseFormattedNumber(formData.customDeposit);
      return customNum > 0 ? `$${formatWithCommas(customNum)}` : formData.customDeposit;
    }
    return "";
  }

  const actualDepositAmount = calculateDepositAmount();

  // Fetch sales team users when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSalesTeamUsers();
    }
  }, [isOpen]);

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

  // Initialize deposit type from formData when modal opens
  useEffect(() => {
    if (isOpen) {
      // Check if formData.deposit is one of the preset values or a custom amount
      const depositValue = formData.deposit || "";
      if (depositValue === "Full 5%" || depositValue === "$5k only") {
        setDepositType(depositValue);
      } else {
        // Check if it's $5,000 or $5000
        const depositNum = parseFormattedNumber(depositValue);
        if (depositNum === 5000) {
          setDepositType("$5k only");
        } else if (depositValue && depositValue !== "") {
          // Check if it's a calculated 5% value
          const projectCostNum = parseFormattedNumber(formData.projectCost);
          const calculated5Percent = projectCostNum > 0 ? Math.floor(projectCostNum / 20) : 0;
          if (depositNum === calculated5Percent && calculated5Percent > 0) {
            setDepositType("Full 5%");
          } else {
            setDepositType("Other");
          }
        } else {
          setDepositType("");
        }
      }
    }
  }, [isOpen, formData.deposit, formData.projectCost]);

  if (!isOpen) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === "depositType") {
      // This is the dropdown selection - don't store it, just use it to calculate
      setDepositType(value);
      if (value === "Other") {
        // Save current deposit type and open modal when "Other" is selected
        setPreviousDepositType(depositType);
        setTempDepositAmount(formData.customDeposit || "");
        setShowDepositModal(true);
      } else if (value === "Full 5%") {
        // Calculate 5% of project cost
        const projectCostNum = parseFormattedNumber(formData.projectCost);
        const calculatedAmount = projectCostNum > 0 ? Math.floor(projectCostNum / 20) : 0;
        const formattedAmount = calculatedAmount > 0 ? `$${formatWithCommas(calculatedAmount)}` : "$0";
        onFormDataChange({
          ...formData,
          customDeposit: "",
          deposit: formattedAmount,
        });
      } else if (value === "$5k only") {
        onFormDataChange({
          ...formData,
          customDeposit: "",
          deposit: "$5,000",
        });
      } else {
        // Empty selection
        onFormDataChange({
          ...formData,
          deposit: "",
          customDeposit: "",
        });
      }
    } else if (name === "projectCost") {
      // Format project cost: remove all non-numeric characters, add $ prefix and commas
      const numericValue = value.replace(/[^0-9]/g, "");
      const numeric = parseInt(numericValue) || 0;
      const formattedValue = numeric > 0 ? `$${formatWithCommas(numeric)}` : "";
      const updatedFormData = {
        ...formData,
        projectCost: formattedValue,
      };
      
      // If deposit type is "Full 5%", recalculate deposit amount
      if (depositType === "Full 5%" && numeric > 0) {
        const calculatedAmount = Math.floor(numeric / 20);
        updatedFormData.deposit = calculatedAmount > 0 ? `$${formatWithCommas(calculatedAmount)}` : "$0";
      }
      
      onFormDataChange(updatedFormData);
    } else {
      onFormDataChange({
        ...formData,
        [name]: value,
      });
    }
  }

  function handleDepositModalOk() {
    if (tempDepositAmount.trim()) {
      // Format the entered amount with commas
      const numericValue = parseFormattedNumber(tempDepositAmount);
      const formattedAmount = numericValue > 0 ? `$${formatWithCommas(numericValue)}` : tempDepositAmount.trim();
      onFormDataChange({
        ...formData,
        deposit: formattedAmount,
        customDeposit: formattedAmount,
      });
    } else {
      // If empty, revert to previous deposit type
      setDepositType(previousDepositType);
      // Recalculate deposit based on previous type
      if (previousDepositType === "Full 5%") {
        const projectCostNum = parseFormattedNumber(formData.projectCost);
        const calculatedAmount = projectCostNum > 0 ? Math.floor(projectCostNum / 20) : 0;
        const formattedAmount = calculatedAmount > 0 ? `$${formatWithCommas(calculatedAmount)}` : "$0";
        onFormDataChange({
          ...formData,
          deposit: formattedAmount,
          customDeposit: "",
        });
      } else if (previousDepositType === "$5k only") {
        onFormDataChange({
          ...formData,
          deposit: "$5,000",
          customDeposit: "",
        });
      } else {
        onFormDataChange({
          ...formData,
          deposit: "",
          customDeposit: "",
        });
      }
    }
    setShowDepositModal(false);
    setTempDepositAmount("");
  }

  function handleDepositModalCancel() {
    // Revert dropdown to previous deposit type
    setDepositType(previousDepositType);
    // Recalculate deposit based on previous type
    if (previousDepositType === "Full 5%") {
      const projectCostNum = parseFormattedNumber(formData.projectCost);
      const calculatedAmount = projectCostNum > 0 ? Math.floor(projectCostNum / 20) : 0;
      const formattedAmount = calculatedAmount > 0 ? `$${formatWithCommas(calculatedAmount)}` : "$0";
      onFormDataChange({
        ...formData,
        deposit: formattedAmount,
        customDeposit: "",
      });
    } else if (previousDepositType === "$5k only") {
      onFormDataChange({
        ...formData,
        deposit: "$5,000",
        customDeposit: "",
      });
    } else {
      onFormDataChange({
        ...formData,
        deposit: "",
        customDeposit: "",
      });
    }
    setShowDepositModal(false);
    setTempDepositAmount("");
  }

  async function handleCreateProject() {
    setIsSubmitting(true);
    let folderPath = "";
    
    try {
      // First, create the project folder
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const rootDirectory = settings.root_directory || "";
      const createFolders = settings.create_folders === 'true' || settings.create_folders === true;

      // Only create folders if the setting is enabled
      if (createFolders) {
        if (!rootDirectory) {
          alert("Error: Root directory is not set. Please configure it in File Settings.");
          setIsSubmitting(false);
          return;
        }

        // Get current year (same as backend uses)
        const currentYear = new Date().getFullYear().toString();
        
        // Construct folder path: root_directory\YEAR\STATE\SUBURB - STREET
        const suburb = (formData.suburb || "").toUpperCase();
        const street = formData.street || "";
        const state = (formData.state || "").toUpperCase();
        
        if (!state) {
          alert("Error: State is required to create project folder. Please enter the state.");
          setIsSubmitting(false);
          return;
        }
        
        folderPath = `${rootDirectory}\\${currentYear}\\${state}\\${suburb} - ${street}`;
        
        // Create folder via backend API (also copies template structure)
        console.log("Creating folder at path:", folderPath);
        const folderResponse = await fetch(`${API_URL}/api/folders/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: folderPath,
            rootDirectory: rootDirectory,
            year: currentYear,
            state: state,
          }),
        });

        if (!folderResponse.ok) {
          const errorData = await folderResponse.json().catch(() => ({ error: "Failed to create folder" }));
          const errorMsg = errorData.error || "Failed to create project folder";
          console.error("Folder creation failed:", errorMsg);
          throw new Error(errorMsg);
        } else {
          const result = await folderResponse.json().catch(() => null);
          console.log("Folder created successfully:", result);
        }
      } else {
        // Even if createFolders is disabled, we still need to construct the path for proposal upload
        if (formData.proposalFile) {
          const rootDirectory = settings.root_directory || "";
          if (rootDirectory) {
            const currentYear = new Date().getFullYear().toString();
            const suburb = (formData.suburb || "").toUpperCase();
            const street = formData.street || "";
            const state = (formData.state || "").toUpperCase();
            
            if (state) {
              folderPath = `${rootDirectory}\\${currentYear}\\${state}\\${suburb} - ${street}`;
            } else {
              // Fallback to old format if state not provided
              folderPath = `${rootDirectory}\\${currentYear}\\${suburb} - ${street}`;
            }
          }
        }
      }

      // Then create the project
      const newProject = await onCreate(formData);
      
      // If there's a proposal file stored in formData, upload it now
      if (formData.proposalFile && newProject && newProject.id && folderPath) {
        try {
          // Ensure folder exists before uploading proposal
          if (!createFolders) {
            // Create folder if it doesn't exist (for proposal upload)
            await fetch(`${API_URL}/api/folders/create`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                path: folderPath,
                rootDirectory: settings.root_directory || "",
                year: new Date().getFullYear().toString(),
              }),
            });
          }
          
          const uploadFormData = new FormData();
          uploadFormData.append("file", formData.proposalFile);
          uploadFormData.append("projectId", newProject.id.toString());
          uploadFormData.append("projectPath", folderPath);

          const uploadResponse = await fetch(`${API_URL}/api/files/upload-proposal`, {
            method: "POST",
            body: uploadFormData,
          });

          if (!uploadResponse.ok) {
            console.error("Failed to upload proposal, but project was created");
          } else {
            console.log("Proposal uploaded successfully after project creation");
          }
        } catch (uploadError) {
          console.error("Error uploading proposal after project creation:", uploadError);
        }
      }
      
      // Reset submitting state immediately so button doesn't stay on "Creating..."
      setIsSubmitting(false);
      // Close modal
      onClose();
    } catch (error) {
      console.error("Error creating project:", error);
      alert(error.message || "Failed to create project");
      // On error, keep modal open so user can retry
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            padding: "32px",
            width: "90%",
            maxWidth: "500px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              marginTop: 0,
              marginBottom: "24px",
              color: MONUMENT,
            }}
          >
            Project Cost
          </h2>
          <div style={{ marginBottom: "16px", display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Project Cost
              </label>
              <input
                type="text"
                name="projectCost"
                value={formData.projectCost}
                onChange={handleChange}
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
                }}
                autoComplete="off"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Deposit Type
              </label>
              <select
                name="depositType"
                value={depositType}
                onChange={handleChange}
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
                }}
              >
                <option value="">Select Deposit</option>
                {DEPOSIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Deposit Amount
            </label>
            <input
              type="text"
              name="depositAmount"
              value={actualDepositAmount}
              onChange={(e) => {
                // Allow manual editing of deposit amount
                const numericValue = e.target.value.replace(/[^0-9]/g, "");
                const numeric = parseInt(numericValue) || 0;
                const formattedValue = numeric > 0 ? `$${formatWithCommas(numeric)}` : "";
                onFormDataChange({
                  ...formData,
                  deposit: formattedValue,
                  customDeposit: formattedValue, // Store as custom deposit when manually edited
                });
                // If manually editing, set deposit type to "Other"
                if (formattedValue && depositType !== "Other") {
                  setDepositType("Other");
                }
              }}
              placeholder="$0"
              disabled={!depositType}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                opacity: depositType ? 1 : 0.6,
                cursor: depositType ? "text" : "not-allowed",
              }}
              autoComplete="off"
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Salesperson
            </label>
            <select
              name="salesperson"
              value={formData.salesperson || ""}
              onChange={handleChange}
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
          <div style={{ marginBottom: "24px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Stream
            </label>
            <select
              name="stream"
              value={formData.stream}
              onChange={handleChange}
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

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                background: "#e0e0e0",
                color: MONUMENT,
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#e0e0e0",
                color: MONUMENT,
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={isSubmitting}
              style={{
                background: MONUMENT,
                color: WHITE,
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
                opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </div>
      </div>
      {/* Deposit Amount Modal */}
      {showDepositModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={handleDepositModalCancel}
        >
          <div
            style={{
              background: SECTION_GREY,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "350px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1.2rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "16px",
                color: MONUMENT,
              }}
            >
              Enter Amount
            </h3>
            <input
              type="text"
              value={tempDepositAmount}
              onChange={(e) => setTempDepositAmount(e.target.value)}
              placeholder="Enter deposit amount"
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                marginBottom: "20px",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleDepositModalOk();
                } else if (e.key === "Escape") {
                  handleDepositModalCancel();
                }
              }}
              autoComplete="off"
            />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleDepositModalCancel}
                style={{
                  background: "#e0e0e0",
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.17s",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDepositModalOk}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.17s",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
