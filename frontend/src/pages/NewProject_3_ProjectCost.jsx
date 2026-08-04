import React, { useState, useEffect } from "react";
import { CLASSIFICATION_OPTIONS, CLASSIFICATION_ABBREV_MAP as CLASSIFICATION_MAP } from "../utils/classifications";
import { buildJobFolderNameSegment } from "../utils/projectFolderPath";
import { FALLBACK_STREAMS, fetchStreams, projectStreamOptions } from "../utils/streamsCatalog";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

/** Stable deposit-type keys for the new-project modal (labels include amounts from settings). */
const DEPOSIT_TYPE_PRE_ENGAGEMENT = "pre_engagement";
const DEPOSIT_TYPE_HOLDING = "holding";
const DEPOSIT_TYPE_OTHER = "other";

const SPECS_OPTIONS = ["Affordable", "Superior"];

function formatWithCommas(num) {
  if (!num || num === 0) return "0";
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseFormattedNumber(formattedStr) {
  if (!formattedStr) return 0;
  return parseInt(String(formattedStr).replace(/[^0-9]/g, ""), 10) || 0;
}

function formatMoneyDisplay(raw) {
  const n = parseFormattedNumber(raw);
  return n > 0 ? `$${formatWithCommas(n)}` : "";
}

function normalizeDepositType(raw) {
  const value = String(raw || "").trim();
  if (
    value === DEPOSIT_TYPE_PRE_ENGAGEMENT ||
    value === DEPOSIT_TYPE_HOLDING ||
    value === DEPOSIT_TYPE_OTHER
  ) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.includes("pre-engagement") || lower.includes("pre engagement")) {
    return DEPOSIT_TYPE_PRE_ENGAGEMENT;
  }
  if (lower.includes("holding")) {
    return DEPOSIT_TYPE_HOLDING;
  }
  if (lower === "other") {
    return DEPOSIT_TYPE_OTHER;
  }
  return "";
}

export default function NewProject_3_ProjectCost({
  isOpen,
  onClose,
  formData,
  onFormDataChange,
  onBack,
  onCreate,
  onNext,
  transparentBackdrop = false,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [tempDepositAmount, setTempDepositAmount] = useState("");
  const [previousDepositType, setPreviousDepositType] = useState("");
  const [depositType, setDepositType] = useState("");
  const [salesTeamUsers, setSalesTeamUsers] = useState([]);
  const [loadingSalesUsers, setLoadingSalesUsers] = useState(false);
  const [streamOptions, setStreamOptions] = useState(() => projectStreamOptions(FALLBACK_STREAMS));
  const [preEngagementAmountRaw, setPreEngagementAmountRaw] = useState("");
  const [holdingAmountRaw, setHoldingAmountRaw] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const formDataRef = React.useRef(formData);
  formDataRef.current = formData;
  const ERROR_BORDER = "1px solid #cc3333";
  const ERROR_TEXT = "#cc3333";

  /** Label row — when errored, show red message in the same space (no modal resize). */
  function FieldLabel({ children, error }) {
    return (
      <label
        style={{
          display: "block",
          fontSize: "0.9rem",
          color: error ? ERROR_TEXT : UI.textMuted,
          marginBottom: "6px",
          fontWeight: 500,
          lineHeight: 1.25,
          minHeight: "1.125rem",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {error || children}
      </label>
    );
  }

  const preEngagementFormatted = formatMoneyDisplay(preEngagementAmountRaw);
  const holdingFormatted = formatMoneyDisplay(holdingAmountRaw);
  const preEngagementOptionLabel = preEngagementFormatted
    ? `${preEngagementFormatted} Pre-Engagement`
    : "Pre-Engagement";
  const holdingOptionLabel = holdingFormatted
    ? `${holdingFormatted} Holding Deposit`
    : "Holding Deposit";

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchStreams(API_URL).then((rows) => {
      if (!cancelled) setStreamOptions(projectStreamOptions(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  function depositAmountForType(type, amounts = {}) {
    const pre = formatMoneyDisplay(amounts.preEngagement ?? preEngagementAmountRaw);
    const hold = formatMoneyDisplay(amounts.holding ?? holdingAmountRaw);
    if (type === DEPOSIT_TYPE_PRE_ENGAGEMENT) {
      return pre;
    }
    if (type === DEPOSIT_TYPE_HOLDING) {
      return hold;
    }
    if (type === DEPOSIT_TYPE_OTHER && formData.customDeposit) {
      const customNum = parseFormattedNumber(formData.customDeposit);
      return customNum > 0 ? `$${formatWithCommas(customNum)}` : formData.customDeposit;
    }
    return "";
  }

  const actualDepositAmount = depositAmountForType(depositType);

  // Fetch sales team users + payment amounts when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSalesTeamUsers();
      fetchPaymentSettings();
    }
  }, [isOpen]);

  async function fetchSalesTeamUsers() {
    setLoadingSalesUsers(true);
    try {
      const usersResponse = await fetch(`${API_URL}/api/users`);
      if (!usersResponse.ok) {
        throw new Error("Failed to fetch users");
      }
      const allUsers = await usersResponse.json();

      const salesUsers = allUsers.filter((user) => {
        if (!user.positions || !Array.isArray(user.positions)) return false;
        return user.positions.some(
          (position) => position.name && position.name.toLowerCase() === "sales team"
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

  async function fetchPaymentSettings() {
    try {
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const preRaw = settings.pre_engagement_amount || "";
      const holdRaw = settings.holding_amount || "";
      setPreEngagementAmountRaw(preRaw);
      setHoldingAmountRaw(holdRaw);
      const preFormatted = formatMoneyDisplay(preRaw);
      const holdFormatted = formatMoneyDisplay(holdRaw);
      const latest = formDataRef.current || {};
      const type = normalizeDepositType(latest.depositType);
      const next = {
        ...latest,
        preEngagementRequired: preFormatted || "",
      };
      if (type === DEPOSIT_TYPE_PRE_ENGAGEMENT) {
        next.deposit = preFormatted;
        next.customDeposit = "";
        next.depositType = DEPOSIT_TYPE_PRE_ENGAGEMENT;
      } else if (type === DEPOSIT_TYPE_HOLDING) {
        next.deposit = holdFormatted;
        next.customDeposit = "";
        next.depositType = DEPOSIT_TYPE_HOLDING;
      }
      onFormDataChange(next);
    } catch (error) {
      console.error("Error fetching payment settings:", error);
      setPreEngagementAmountRaw("");
      setHoldingAmountRaw("");
    }
  }

  // Initialize deposit type from formData when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const storedType = normalizeDepositType(formData.depositType);
    if (storedType) {
      setDepositType(storedType);
      return;
    }
    if (formData.deposit || formData.customDeposit) {
      setDepositType(DEPOSIT_TYPE_OTHER);
    } else {
      setDepositType("");
    }
  }, [isOpen, formData.depositType, formData.deposit, formData.customDeposit]);

  if (!isOpen) return null;

  function clearError(name) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    clearError(name);
    if (name === "depositType") {
      clearError("deposit");
      setDepositType(value);
      if (value === DEPOSIT_TYPE_OTHER) {
        setPreviousDepositType(depositType);
        setTempDepositAmount(formData.customDeposit || "");
        setShowDepositModal(true);
        onFormDataChange({
          ...formData,
          depositType: value,
          preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
        });
      } else if (value === DEPOSIT_TYPE_PRE_ENGAGEMENT) {
        onFormDataChange({
          ...formData,
          depositType: value,
          customDeposit: "",
          deposit: preEngagementFormatted,
          preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
        });
      } else if (value === DEPOSIT_TYPE_HOLDING) {
        onFormDataChange({
          ...formData,
          depositType: value,
          customDeposit: "",
          deposit: holdingFormatted,
          preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
        });
      } else {
        onFormDataChange({
          ...formData,
          depositType: "",
          deposit: "",
          customDeposit: "",
          preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
        });
      }
    } else if (name === "projectCost") {
      const numericValue = value.replace(/[^0-9]/g, "");
      const numeric = parseInt(numericValue, 10) || 0;
      const formattedValue = numeric > 0 ? `$${formatWithCommas(numeric)}` : "";
      onFormDataChange({
        ...formData,
        projectCost: formattedValue,
      });
    } else {
      onFormDataChange({
        ...formData,
        [name]: value,
      });
    }
  }

  function applyDepositType(type) {
    if (type === DEPOSIT_TYPE_PRE_ENGAGEMENT) {
      onFormDataChange({
        ...formData,
        depositType: type,
        deposit: preEngagementFormatted,
        customDeposit: "",
        preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
      });
    } else if (type === DEPOSIT_TYPE_HOLDING) {
      onFormDataChange({
        ...formData,
        depositType: type,
        deposit: holdingFormatted,
        customDeposit: "",
        preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
      });
    } else if (type === DEPOSIT_TYPE_OTHER) {
      onFormDataChange({
        ...formData,
        depositType: type,
        deposit: formData.customDeposit || formData.deposit || "",
        preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
      });
    } else {
      onFormDataChange({
        ...formData,
        depositType: "",
        deposit: "",
        customDeposit: "",
        preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
      });
    }
  }

  function handleDepositModalOk() {
    if (tempDepositAmount.trim()) {
      const numericValue = parseFormattedNumber(tempDepositAmount);
      const formattedAmount =
        numericValue > 0 ? `$${formatWithCommas(numericValue)}` : tempDepositAmount.trim();
      onFormDataChange({
        ...formData,
        depositType: DEPOSIT_TYPE_OTHER,
        deposit: formattedAmount,
        customDeposit: formattedAmount,
        preEngagementRequired: preEngagementFormatted || formData.preEngagementRequired || "",
      });
      clearError("depositType");
      clearError("deposit");
    } else {
      setDepositType(previousDepositType);
      applyDepositType(previousDepositType);
    }
    setShowDepositModal(false);
    setTempDepositAmount("");
  }

  function handleNextClick() {
    const projectCostNum = parseFormattedNumber(formData.projectCost);
    const depositNum = parseFormattedNumber(actualDepositAmount);
    const type = normalizeDepositType(depositType || formData.depositType);

    // One field at a time — highlight only the first problem.
    if (!projectCostNum) {
      setFieldErrors({ projectCost: "Please enter project cost" });
      return;
    }
    if (!type) {
      setFieldErrors({ depositType: "Please select deposit type" });
      return;
    }
    if (!depositNum) {
      setFieldErrors({ deposit: "Please enter deposit amount" });
      return;
    }
    if (!String(formData.salesperson || "").trim()) {
      setFieldErrors({ salesperson: "Please select salesperson" });
      return;
    }
    if (!String(formData.specs || "").trim()) {
      setFieldErrors({ specs: "Please select specs" });
      return;
    }
    if (!String(formData.classification || "").trim()) {
      setFieldErrors({ classification: "Please select classification" });
      return;
    }

    setFieldErrors({});
    onNext();
  }

  function handleDepositModalCancel() {
    setDepositType(previousDepositType);
    applyDepositType(previousDepositType);
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

      // Create folders + copy templates for every project when user chose Yes (not tied to having a PDF yet)
      if (createFolders) {
        if (!rootDirectory) {
          alert("Error: Root directory is not set. Please configure it in File Settings.");
          setIsSubmitting(false);
          return;
        }

        const currentYear = new Date().getFullYear().toString();
        const projectFolderName = buildJobFolderNameSegment(formData.suburb, formData.street);
        const stateUpper = (formData.state || "").toUpperCase();

        if (!stateUpper) {
          alert("Error: State is required to create project folder. Please enter the state.");
          setIsSubmitting(false);
          return;
        }

        folderPath = (formData.folderPath || "").trim();
        if (!folderPath) {
          folderPath = `${rootDirectory}\\${currentYear}\\${stateUpper}\\${projectFolderName}`;
        }

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
            state: stateUpper,
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

      // Link Proposal.PDF on disk if it already exists (no automatic template copy)
      if (createFolders && newProject && newProject.id && folderPath && !formData.proposalFile) {
        try {
          const reg = await fetch(`${API_URL}/api/projects/${newProject.id}/register-proposal-from-folder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectPath: folderPath }),
          });
          if (!reg.ok) {
            let msg = "Proposal.PDF was not found in the project folder.";
            try {
              const errJson = await reg.json();
              if (errJson?.error) msg = errJson.error;
            } catch {
              /* ignore */
            }
            alert(msg);
          }
        } catch (regErr) {
          alert(regErr.message || "Could not link Proposal.PDF from the project folder.");
        }
      }
      
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
    } catch (error) {
      console.error("Error creating project:", error);
      alert(error.message || "Failed to create project");
      // On error, keep modal open so user can retry
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {(
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: transparentBackdrop ? "transparent" : "rgba(0, 0, 0, 0.5)",
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
              <FieldLabel error={fieldErrors.projectCost}>Project Cost</FieldLabel>
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
                  border: fieldErrors.projectCost ? ERROR_BORDER : "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel error={fieldErrors.depositType}>Deposit Type</FieldLabel>
              <select
                name="depositType"
                value={depositType}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: fieldErrors.depositType ? ERROR_BORDER : "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                <option value="">Select Deposit</option>
                <option value={DEPOSIT_TYPE_PRE_ENGAGEMENT}>{preEngagementOptionLabel}</option>
                <option value={DEPOSIT_TYPE_HOLDING}>{holdingOptionLabel}</option>
                <option value={DEPOSIT_TYPE_OTHER}>Other</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel error={fieldErrors.deposit}>Deposit Amount</FieldLabel>
              <input
                type="text"
                name="depositAmount"
                value={actualDepositAmount}
                onChange={(e) => {
                  // Allow manual editing of deposit amount
                  const numericValue = e.target.value.replace(/[^0-9]/g, "");
                  const numeric = parseInt(numericValue) || 0;
                  const formattedValue = numeric > 0 ? `$${formatWithCommas(numeric)}` : "";
                  clearError("deposit");
                  clearError("depositType");
                  onFormDataChange({
                    ...formData,
                    deposit: formattedValue,
                    customDeposit: formattedValue,
                    depositType: DEPOSIT_TYPE_OTHER,
                    preEngagementRequired:
                      preEngagementFormatted || formData.preEngagementRequired || "",
                  });
                  if (formattedValue && depositType !== DEPOSIT_TYPE_OTHER) {
                    setDepositType(DEPOSIT_TYPE_OTHER);
                  }
                }}
                placeholder="$0"
                disabled={!depositType}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: fieldErrors.deposit ? ERROR_BORDER : "none",
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
              <FieldLabel error={fieldErrors.salesperson}>Salesperson</FieldLabel>
              <select
                name="salesperson"
                value={formData.salesperson || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: fieldErrors.salesperson ? ERROR_BORDER : "none",
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
              <FieldLabel>Stream</FieldLabel>
              <select
                name="stream"
                value={formData.stream || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: formData.stream ? MONUMENT : UI.textMuted,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                <option value="">Select Stream</option>
                {streamOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {formData.stream && !streamOptions.includes(formData.stream) ? (
                  <option value={formData.stream}>{formData.stream}</option>
                ) : null}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: "24px", display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <FieldLabel error={fieldErrors.specs}>Specs</FieldLabel>
              <select
                name="specs"
                value={formData.specs || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: fieldErrors.specs ? ERROR_BORDER : "none",
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
              <FieldLabel error={fieldErrors.classification}>Classification</FieldLabel>
              <select
                name="classification"
                value={formData.classification || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: fieldErrors.classification ? ERROR_BORDER : "none",
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
                background: UI.inputBg,
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
                background: UI.inputBg,
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
              onClick={handleNextClick}
              style={{
                background: MONUMENT,
                color: PAGE_TEXT,
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
            background: transparentBackdrop ? "transparent" : "rgba(0, 0, 0, 0.5)",
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
                  background: UI.inputBg,
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
                  color: PAGE_TEXT,
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
