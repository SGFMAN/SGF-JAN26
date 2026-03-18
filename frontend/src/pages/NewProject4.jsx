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

const DEPOSIT_OPTIONS = ["Full 5%", "$5k only", "Other"];

const SPECS_OPTIONS = ["Affordable", "Superior"];

const CLASSIFICATION_OPTIONS = [
  "Small Second Dwelling",
  "Dependant Persons Unit",
  "Detached Extension",
  "Dwelling",
  "Home Office / Studio",
  "Dwelling & DPU",
  "Dwelling & SSD",
  "SSD & DPU",
  "Dual Occ"
];

// Classification mapping for abbreviations (same as HomePage.jsx)
const CLASSIFICATION_MAP = {
  "Small Second Dwelling": "SSD",
  "Dependant Persons Unit": "DPU",
  "Detached Extension": "DEX",
  "Dwelling": "DWE",
  "Home Office / Studio": "OFFICE",
  "Dwelling & DPU": "D&DPU",
  "Dwelling & SSD": "D&SSD",
  "SSD & DPU": "SSD&DPU",
  "Dual Occ": "DOC",
};

export default function NewProject4({ isOpen, onClose, formData, onFormDataChange, onBack, onCreate, onNext, createdProjectForEmail }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const emailBodyRef = useRef(null);
  const [createdProject, setCreatedProject] = useState(null);
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
  // Update emailBody when contentEditable changes
  useEffect(() => {
    if (showEmailModal && emailBodyRef.current && emailBody) {
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [showEmailModal, emailBody]);

  // When createdProjectForEmail is set, prepare and show email modal
  // Only trigger when component is actually open and visible
  useEffect(() => {
    if (createdProjectForEmail && isOpen) {
      // Only prepare email if we're not currently showing the form (i.e., we're showing email modal)
      // This prevents triggering when NewProject3 (PDF upload) is open
      prepareNewJobEmail(createdProjectForEmail);
    }
  }, [createdProjectForEmail, isOpen]);

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

  // If createdProjectForEmail is set, we should only show the email modal, not the form
  // Don't render the form if we have a project ready for email
  const shouldShowForm = !createdProjectForEmail;

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

  // Helper function to get salesperson details
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

  // Helper function to replace tokens in email template
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

    return replaced;
  }

  // Prepare and show email modal for new job
  async function prepareNewJobEmail(project) {
    try {
      console.log("Preparing new job email for project:", project);
      // Fetch email templates
      const templatesResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templatesResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templatesResponse.json();
      console.log("Fetched templates:", templates);
      
      // Find "NEW JOB - Internal" template (case-insensitive search)
      const template = templates.find(t => 
        t.name && t.name.toLowerCase().trim() === "new job - internal".toLowerCase()
      );
      
      if (!template) {
        console.warn("Template 'NEW JOB - Internal' not found. Available templates:", templates.map(t => t.name));
        alert("Template 'NEW JOB - Internal' not found. Please create it in Settings → Email Settings.");
        // Don't close modal, just return
        return;
      }

      console.log("Found template:", template);

      if (!template.from_address || !template.from_address.trim()) {
        alert("Template has no From address. Edit the template in Settings → Email Settings.");
        // Don't close modal, just return
        return;
      }

      // Replace tokens in to addresses
      let toAddresses = template.to_addresses || [];
      if (Array.isArray(toAddresses)) {
        const replacedAddresses = await Promise.all(
          toAddresses.map(addr => replaceTokens(addr, project))
        );
        toAddresses = replacedAddresses.filter(addr => addr.trim().length > 0);
      } else if (toAddresses) {
        const replaced = await replaceTokens(toAddresses, project);
        toAddresses = replaced.split(",").map(a => a.trim()).filter(a => a.length > 0);
      } else {
        toAddresses = [];
      }

      console.log("To addresses after replacement:", toAddresses);

      if (toAddresses.length === 0) {
        console.warn("No valid email addresses found after replacing tokens");
        alert("No valid email addresses found in template. Please check the template's 'To' addresses.");
        // Don't close modal, just return
        return;
      }

      const subject = await replaceTokens(template.subject || "", project);
      const htmlBody = await replaceTokens(template.body || "", project, { html: true });

      console.log("Setting email modal state");
      // Set email modal state
      setEmailTo(toAddresses.join(", "));
      setEmailFrom(template.from_address || "");
      setEmailSubject(subject);
      setEmailBody(htmlBody);
      setShowEmailModal(true);
      console.log("Email modal should now be visible");
    } catch (error) {
      console.error("Error preparing email:", error);
      alert(`Failed to prepare email: ${error.message}`);
      // Don't close modal on error, let user see what happened
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
      const res = await fetch(`${API_URL}/api/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toAddresses,
          from: emailFrom,
          subject: emailSubject,
          htmlBody: emailBody,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      alert(data.message || "Email sent successfully!");
      setShowEmailModal(false);
      // Clear createdProjectForEmail if it was set
      if (createdProjectForEmail) {
        // onClose will handle clearing it in HomePage
      }
      onClose();
    } catch (err) {
      console.error("Send email error:", err);
      alert(err.message || "Failed to send email.");
    }
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
      const state = (formData.state || "").toUpperCase();
      
      // Check the appropriate setting based on state (VIC or QLD) for root directory
      let rootDirectory = "";
      if (state === "VIC") {
        rootDirectory = settings.root_directory || "";
      } else if (state === "QLD") {
        rootDirectory = settings.root_directory_qld || "";
      } else {
        // Default to VIC settings if state is not specified
        rootDirectory = settings.root_directory || "";
      }
      
      // Use createFolders from formData (set by confirmation modal)
      const createFolders = formData.createFolders === true || formData.createFolders === "true" || formData.createFolders === 1 || formData.createFolders === "1";

      // Only create folders if the setting is enabled AND proposal file exists
      if (createFolders && formData.proposalFile) {
        if (!rootDirectory) {
          alert("Error: Root directory is not set. Please configure it in File Settings.");
          setIsSubmitting(false);
          return;
        }

        // Get current year (same as backend uses)
        const currentYear = new Date().getFullYear().toString();
        
        // Construct folder path: root_directory\YEAR\STATE\SUBURB - STREET
        // NOTE: Do NOT include classification abbreviation in folder name
        const suburb = (formData.suburb || "").toUpperCase();
        const street = formData.street || "";
        const state = (formData.state || "").toUpperCase();
        
        if (!state) {
          alert("Error: State is required to create project folder. Please enter the state.");
          setIsSubmitting(false);
          return;
        }
        
        // Construct folder path without classification abbreviation
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
            rootDirectory: rootDirectory, // Use the appropriate root directory (VIC or QLD)
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
      }

      // Then create the project
      const newProject = await onCreate(formData);
      
      // Upload proposal if createFolders is enabled, proposal file exists, and folderPath exists
      if (createFolders && formData.proposalFile && newProject && newProject.id && folderPath) {
        try {
          const uploadFormData = new FormData();
          uploadFormData.append("file", formData.proposalFile);
          uploadFormData.append("projectId", newProject.id.toString());
          uploadFormData.append("projectPath", folderPath);

          console.log("Uploading proposal to:", folderPath);
          const uploadResponse = await fetch(`${API_URL}/api/files/upload-proposal`, {
            method: "POST",
            body: uploadFormData,
          });

          if (!uploadResponse.ok) {
            let errorMessage = "Unknown error";
            try {
              const errorData = await uploadResponse.json();
              errorMessage = errorData.error || errorData.message || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
              console.error("Failed to upload proposal - server response:", errorData);
            } catch (parseError) {
              // Response is not JSON, try to get text
              try {
                const errorText = await uploadResponse.text();
                errorMessage = errorText || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
                console.error("Failed to upload proposal - server response (text):", errorText);
              } catch (textError) {
                errorMessage = `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`;
                console.error("Failed to upload proposal - status:", uploadResponse.status, uploadResponse.statusText);
              }
            }
            alert(`Warning: Project created but proposal upload failed: ${errorMessage}`);
          } else {
            const result = await uploadResponse.json().catch(() => null);
            console.log("Proposal uploaded successfully:", result);
          }
        } catch (uploadError) {
          console.error("Error uploading proposal after project creation:", uploadError);
          alert(`Warning: Project created but proposal upload failed: ${uploadError.message || "Unknown error"}`);
        }
      }
      
      // Reset submitting state immediately so button doesn't stay on "Creating..."
      setIsSubmitting(false);
      
      // Store the created project for email
      setCreatedProject(newProject);
      
      // Fetch and show email modal
      await prepareNewJobEmail(newProject);
    } catch (error) {
      console.error("Error creating project:", error);
      alert(error.message || "Failed to create project");
      // On error, keep modal open so user can retry
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {shouldShowForm && (
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
          </div>
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
          </div>
          <div style={{ marginBottom: "24px", display: "flex", gap: "12px" }}>
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
                Specs
              </label>
              <select
                name="specs"
                value={formData.specs || ""}
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
                <option value="">Select Specs</option>
                {SPECS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
                Classification
              </label>
              <select
                name="classification"
                value={formData.classification || ""}
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
                <option value="">Select Classification</option>
                {CLASSIFICATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
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
              onClick={onNext}
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
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}
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

      {/* Email Modal */}
      {showEmailModal && (
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
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                onClick={() => {
                  setShowEmailModal(false);
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
                    setShowEmailModal(false);
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
          </div>
        </div>
      )}
    </>
  );
}
