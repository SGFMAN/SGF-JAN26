import React, { useState, useEffect, useRef } from "react";
import { PROJECT_STATUS_OPTIONS as STATUS_OPTIONS } from "../utils/projectStatus";
import { CLASSIFICATION_OPTIONS } from "../utils/classifications";

import { UI, MENU, INDICATOR } from "../utils/uiThemeTokens.js";
import { streamColorHover } from "../utils/streamColors.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const API_URL = "";
const SPECS_OPTIONS = ["Affordable", "Superior"];

const RENOVATION_DUPLICATE_BUTTON_ID = 4;
const PROPOSAL_BUTTON_ID = 3;

/** Align action buttons with sidebar Back to Main (same as Drawings page). */
const PROJECT_PANEL_HEIGHT_PX = 758;
const SIDEBAR_BELOW_GREEN_MENU_PX = 101;
const PROJECT_INFO_HEADER_OFFSET_PX = 74;
const PROJECT_INFO_BODY_MAX_HEIGHT_PX =
  PROJECT_PANEL_HEIGHT_PX - SIDEBAR_BELOW_GREEN_MENU_PX - PROJECT_INFO_HEADER_OFFSET_PX;
const PROJECT_INFO_ACTION_ZONE_HEIGHT_PX = SIDEBAR_BELOW_GREEN_MENU_PX - 24;
const PROJECT_INFO_COL1_WIDTH_PX = 380;

function mergeProjectInfoButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved, lineHeight: "1.2" } : fallback;
}

function getLongestText(arr, include = "") {
  return arr.concat(include ? [include] : []).reduce(
    (longest, curr) => (curr.length > longest.length ? curr : longest),
    ""
  );
}

function isQldState(value) {
  const s = (value || "").trim().toUpperCase();
  if (s === "QLD") return true;
  if (s.includes("QLD")) return true;
  if (s.includes("QUEENSLAND")) return true;
  return false;
}

export default function ProjectInfo({ project, onUpdate, onRequestRenovationDuplicate, onRequestLinkRenovationDuplicate }) {
  const [status, setStatus] = useState(project?.status || "");
  const [street, setStreet] = useState(project?.street || "");
  const [suburb, setSuburb] = useState(project?.suburb || "");
  const [state, setState] = useState(project?.state || "");
  const [specs, setSpecs] = useState(project?.specs || "");
  const [classification, setClassification] = useState(project?.classification || "");
  const [projectInfoNotes, setProjectInfoNotes] = useState(project?.project_info_notes || "");
  const [onHold, setOnHold] = useState(project?.on_hold === 'true' || project?.on_hold === true);
  const [qpNumber, setQpNumber] = useState(project?.qp_number || "");
  const [, setUiButtonStyleRevision] = useState(0);

  // Use ref to track latest values for saving
  const valuesRef = useRef({ status, street, suburb, state, specs, classification, projectInfoNotes, onHold, qpNumber });

  // Update ref whenever state changes
  useEffect(() => {
    valuesRef.current = { status, street, suburb, state, specs, classification, projectInfoNotes, onHold, qpNumber };
  }, [status, street, suburb, state, specs, classification, projectInfoNotes, onHold, qpNumber]);
  
  // For autosizing selects (now fixed at 300px)
  const statusSelectRef = useRef(null);
  const fileInputRef = useRef(null);
  /** Debounced PUT for street / suburb / state / QP (same payload as notes blur save). */
  const projectInfoSaveTimerRef = useRef(null);

  useEffect(() => {
    if (projectInfoSaveTimerRef.current) {
      clearTimeout(projectInfoSaveTimerRef.current);
      projectInfoSaveTimerRef.current = null;
    }
    setStatus(project?.status || "");
    setStreet(project?.street || "");
    setSuburb(project?.suburb || "");
    setState(project?.state || "");
    setSpecs(project?.specs || "");
    setClassification(project?.classification || "");
    setProjectInfoNotes(project?.project_info_notes || "");
    setOnHold(project?.on_hold === "true" || project?.on_hold === true);
    setQpNumber(project?.qp_number || "");
  }, [project?.id]);

  useEffect(() => {
    return () => {
      if (projectInfoSaveTimerRef.current) {
        clearTimeout(projectInfoSaveTimerRef.current);
        projectInfoSaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  function scheduleProjectInfoAutosave() {
    if (projectInfoSaveTimerRef.current) {
      clearTimeout(projectInfoSaveTimerRef.current);
    }
    projectInfoSaveTimerRef.current = setTimeout(() => {
      projectInfoSaveTimerRef.current = null;
      void saveAllFields();
    }, 550);
  }

  async function saveAllFields() {
    if (!project?.id) return;
    const currentValues = valuesRef.current;
    // Derive name from street + suburb
    const projectName = `${currentValues.street}, ${currentValues.suburb}`.trim() || "";
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: currentValues.status,
          street: currentValues.street,
          suburb: currentValues.suburb,
          state: currentValues.state,
          specs: currentValues.specs || null,
          classification: currentValues.classification || null,
          project_info_notes: currentValues.projectInfoNotes || null,
          on_hold: currentValues.onHold || null,
          project_cost: project?.project_cost || null,
          deposit: project?.deposit || null,
          ...(isQldState(currentValues.state)
            ? { qp_number: (currentValues.qpNumber || "").trim() || null }
            : {}),
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving fields - Status:", response.status, "Error:", errorText);
        return;
      }
      
      // Parse response but don't block on it
      const savedData = await response.json().catch(() => null);
      console.log("Successfully saved all fields:", savedData);
      
      // CRITICAL: ALWAYS call onUpdate after successful save - this refreshes the project data
      if (onUpdate) {
        console.log("Calling onUpdate to refresh project data...");
        onUpdate();
      } else {
        console.warn("onUpdate is not defined! Autosave will not refresh data.");
      }
    } catch (error) {
      console.error("Error saving fields:", error);
    }
  }

  async function saveField(fieldName, value) {
    if (!project?.id) {
      console.error("Cannot save: no project ID");
      return;
    }
    const currentValues = valuesRef.current;
    // Derive name from street + suburb
    const projectName = `${currentValues.street}, ${currentValues.suburb}`.trim() || "";
    try {
      const updateData = {
        name: projectName,
        status: currentValues.status,
        street: currentValues.street,
        suburb: currentValues.suburb,
        state: currentValues.state,
        project_cost: project?.project_cost || null,
        deposit: project?.deposit || null,
        [fieldName]: value,
      };
      console.log("Saving field:", fieldName, "=", value, "Update data:", updateData);
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved:", savedData);
        console.log("on_hold value in saved data:", savedData?.on_hold, "type:", typeof savedData?.on_hold);
        // Silently update parent state with saved data (no flash)
        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    valuesRef.current.status = newStatus;
    console.log("Saving status:", newStatus);
    await saveField("status", newStatus);
  }

  async function handleOnHoldChange(e) {
    const newValue = e.target.checked;
    setOnHold(newValue);
    valuesRef.current.onHold = newValue;
    console.log("Saving on_hold:", newValue);
    await saveField("on_hold", newValue);
  }

  function handleStreetChange(e) {
    const newValue = e.target.value;
    setStreet(newValue);
    valuesRef.current.street = newValue;
    scheduleProjectInfoAutosave();
  }

  function handleSuburbChange(e) {
    const newValue = e.target.value;
    setSuburb(newValue);
    valuesRef.current.suburb = newValue;
    scheduleProjectInfoAutosave();
  }

  function handleStateChange(e) {
    const newValue = e.target.value;
    setState(newValue);
    valuesRef.current.state = newValue;
    scheduleProjectInfoAutosave();
  }

  function handleQpNumberChange(e) {
    const newValue = e.target.value;
    setQpNumber(newValue);
    valuesRef.current.qpNumber = newValue;
    scheduleProjectInfoAutosave();
  }

  async function handleSpecsChange(e) {
    const newValue = e.target.value;
    setSpecs(newValue);
    valuesRef.current.specs = newValue;
    console.log("Saving specs:", newValue);
    await saveField("specs", newValue);
  }

  async function handleClassificationChange(e) {
    const newValue = e.target.value;
    setClassification(newValue);
    valuesRef.current.classification = newValue;
    console.log("Saving classification:", newValue);
    await saveField("classification", newValue);
  }

  function handleProjectInfoNotesChange(e) {
    const newValue = e.target.value;
    setProjectInfoNotes(newValue);
    valuesRef.current.projectInfoNotes = newValue;
  }

  const renovationDuplicateButtonStyle = mergeProjectInfoButtonStyle(RENOVATION_DUPLICATE_BUTTON_ID, {
    padding: "10px 12px",
    borderRadius: "8px",
    border: FIELD_OUTLINE,
    fontSize: "0.9rem",
    fontWeight: 500,
    color: MONUMENT,
    background: INDICATOR.orange,
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "background 0.17s",
    flexShrink: 0,
  });
  const proposalButtonStyle = mergeProjectInfoButtonStyle(PROPOSAL_BUTTON_ID, {
    background: MENU.purple,
    color: MENU.activeText,
    border: FIELD_OUTLINE,
    borderRadius: "10px",
    padding: "10px 20px",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.17s, border-color 0.17s",
  });
  const renovationUsesSavedStyle = Boolean(buildSavedButtonStyle(RENOVATION_DUPLICATE_BUTTON_ID, true));
  const proposalUsesSavedStyle = Boolean(buildSavedButtonStyle(PROPOSAL_BUTTON_ID, true));

  const showLinkRenovationButton =
    (project?.classification || "").trim() !== "Renovation" &&
    typeof onRequestLinkRenovationDuplicate === "function" &&
    !(
      Array.isArray(project?.duplicate_linked_project_ids) &&
      project.duplicate_linked_project_ids.length > 0
    ) &&
    (project?.duplicate_source_project_id == null ||
      String(project.duplicate_source_project_id).trim() === "");

  const projectInfoFieldBoxStyle = {
    border: FIELD_OUTLINE,
    borderRadius: "8px",
    padding: "12px",
    background: WHITE,
    boxSizing: "border-box",
  };

  const projectInfoLabelStyle = {
    fontSize: "0.9rem",
    color: UI.textMuted,
    marginBottom: "6px",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, flexShrink: 0 }}>
        Project Info
      </h2>
      {project && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div
            style={{
              marginTop: "24px",
              display: "flex",
              gap: "20px",
              flexWrap: "nowrap",
              alignItems: "stretch",
              flex: "1 1 auto",
              minHeight: 0,
              maxHeight: `${PROJECT_INFO_BODY_MAX_HEIGHT_PX}px`,
              overflow: "hidden",
            }}
          >
          {/* Column 1 */}
          <div
            style={{
              flex: `0 0 ${PROJECT_INFO_COL1_WIDTH_PX}px`,
              width: `${PROJECT_INFO_COL1_WIDTH_PX}px`,
              maxWidth: `${PROJECT_INFO_COL1_WIDTH_PX}px`,
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }}
          >
            <div
              style={{
                ...projectInfoFieldBoxStyle,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflowY: "auto",
              }}
            >
            <div style={{ marginBottom: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
              <div style={{ ...projectInfoLabelStyle, marginBottom: 0, whiteSpace: "nowrap" }}>Status</div>
              <select
                ref={statusSelectRef}
                name="status"
                data-field="status"
                value={status}
                onChange={handleStatusChange}
                style={{
                  width: `${getLongestText(STATUS_OPTIONS, status).length + 2.5}ch`,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: FIELD_OUTLINE,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={onHold}
                  onChange={handleOnHoldChange}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                  }}
                />
                <span style={{ fontSize: "0.9rem", color: UI.textMuted, whiteSpace: "nowrap" }}>On Hold</span>
              </label>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Street
              </div>
              <input
                type="text"
                name="street"
                data-field="street"
                value={street}
                onChange={handleStreetChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: FIELD_OUTLINE,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px", width: "100%" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                    Suburb
                  </div>
                  <input
                    type="text"
                    name="suburb"
                    data-field="suburb"
                    value={suburb}
                    onChange={handleSuburbChange}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: FIELD_OUTLINE,
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                    State
                  </div>
                  <input
                    type="text"
                    name="state"
                    data-field="state"
                    value={state}
                    onChange={handleStateChange}
                    style={{
                      width: `${getLongestText(["VIC", "QLD", "NSW", "SA", "WA", "TAS", "NT", "ACT"], state).length + 2.5}ch`,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: FIELD_OUTLINE,
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                marginBottom: "16px",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "flex-end",
              }}
            >
              <div style={{ flexShrink: 0, width: "max-content" }}>
                <div style={projectInfoLabelStyle}>Specs</div>
                <select
                  name="specs"
                  value={specs}
                  onChange={handleSpecsChange}
                  style={{
                    width: `${getLongestText([...SPECS_OPTIONS, "Select specs..."], specs).length + 2.5}ch`,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: FIELD_OUTLINE,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select specs...</option>
                  {SPECS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flexShrink: 0, width: "max-content" }}>
                <div style={projectInfoLabelStyle}>Classification</div>
                <select
                  name="classification"
                  value={classification}
                  onChange={handleClassificationChange}
                  style={{
                    width: `${getLongestText([...CLASSIFICATION_OPTIONS, "Select classification..."], classification).length + 2.5}ch`,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: FIELD_OUTLINE,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select classification...</option>
                  {CLASSIFICATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {(project?.classification || "").trim() === "Renovation" &&
              typeof onRequestRenovationDuplicate === "function" &&
              !(
                Array.isArray(project?.duplicate_linked_project_ids) &&
                project.duplicate_linked_project_ids.length > 0
              ) &&
              (project?.duplicate_source_project_id == null ||
                String(project.duplicate_source_project_id).trim() === "") && (
              <div style={{ marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => onRequestRenovationDuplicate()}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${MONUMENT}`,
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: WHITE,
                    background: MONUMENT,
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  Duplicate & Link SSD
                </button>
                <div style={{ fontSize: "0.75rem", color: UI.textMuted, marginTop: "6px", lineHeight: 1.35 }}>
                  New job number and sales entry; re-use the same Windows job folder (no new folder).
                </div>
              </div>
            )}
            {isQldState(state) && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  QP Number
                </div>
                <input
                  type="text"
                  name="qp_number"
                  data-field="qp_number"
                  value={qpNumber}
                  onChange={handleQpNumberChange}
                  placeholder="Queensland project number"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: FIELD_OUTLINE,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
            </div>
          </div>

          {/* Column 2 - Notes */}
          <div
            style={{
              flex: "0 0 300px",
              width: "300px",
              maxWidth: "300px",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }}
          >
            <div
              style={{
                ...projectInfoFieldBoxStyle,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={projectInfoLabelStyle}>Notes</div>
              <textarea
                name="project_info_notes"
                value={projectInfoNotes}
                onChange={handleProjectInfoNotesChange}
                onBlur={() => void saveAllFields()}
                placeholder="Add project notes..."
                style={{
                  width: "100%",
                  flex: 1,
                  padding: 0,
                  border: "none",
                  outline: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: "transparent",
                  boxSizing: "border-box",
                  resize: "none",
                  fontFamily: "inherit",
                  overflowY: "auto",
                  minHeight: 0,
                }}
              />
            </div>
          </div>

          {/* Column 3 - Project Log */}
          <div
            style={{
              flex: "1 1 0",
              minWidth: "120px",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
            }}
          >
            <div
              style={{
                ...projectInfoFieldBoxStyle,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={projectInfoLabelStyle}>Project Log</div>
              <div
                style={{
                  width: "100%",
                  flex: 1,
                  padding: 0,
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  background: "transparent",
                  boxSizing: "border-box",
                  overflowY: "auto",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  minHeight: 0,
                }}
              >
                {project?.project_log || "No log entries yet."}
              </div>
            </div>
          </div>

          </div>

          <div
            style={{
              flexShrink: 0,
              minHeight: `${PROJECT_INFO_ACTION_ZONE_HEIGHT_PX}px`,
              marginTop: "auto",
              display: "flex",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: "12px",
              paddingBottom: "12px",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !project?.id) return;

                if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                  alert("Please select a PDF file.");
                  e.target.value = "";
                  return;
                }

                const formData = new FormData();
                formData.append("file", file);
                formData.append("projectId", project.id.toString());

                try {
                  const response = await fetch(`${API_URL}/api/files/locate-proposal`, {
                    method: "POST",
                    body: formData,
                  });

                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || "Failed to save proposal location");
                  }

                  if (onUpdate) {
                    onUpdate();
                  }
                } catch (error) {
                  console.error("Error saving proposal:", error);
                  alert(error.message || "Failed to save proposal location");
                }

                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={async () => {
                if (project?.proposal_pdf_location) {
                  try {
                    const pdfUrl = `${API_URL}/api/files/proposal/${project.id}`;
                    const response = await fetch(pdfUrl);
                    if (!response.ok) {
                      fileInputRef.current?.click();
                    } else {
                      window.open(pdfUrl, "_blank");
                    }
                  } catch (error) {
                    console.error("Error checking proposal PDF:", error);
                    fileInputRef.current?.click();
                  }
                } else {
                  fileInputRef.current?.click();
                }
              }}
              style={proposalButtonStyle}
              onMouseEnter={
                proposalUsesSavedStyle
                  ? undefined
                  : (e) => {
                      e.currentTarget.style.background = streamColorHover(MENU.purple);
                    }
              }
              onMouseLeave={
                proposalUsesSavedStyle
                  ? undefined
                  : (e) => {
                      e.currentTarget.style.background = MENU.purple;
                    }
              }
            >
              {project?.proposal_pdf_location ? "Show Proposal" : "Locate Proposal"}
            </button>
            {showLinkRenovationButton && (
              <button
                type="button"
                onClick={() => onRequestLinkRenovationDuplicate()}
                style={renovationDuplicateButtonStyle}
                onMouseEnter={
                  renovationUsesSavedStyle
                    ? undefined
                    : (e) => {
                        e.currentTarget.style.background = streamColorHover(INDICATOR.orange);
                      }
                }
                onMouseLeave={
                  renovationUsesSavedStyle
                    ? undefined
                    : (e) => {
                        e.currentTarget.style.background = INDICATOR.orange;
                      }
                }
              >
                Link Renovation
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
