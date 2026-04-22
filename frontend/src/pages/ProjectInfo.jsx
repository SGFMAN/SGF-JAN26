import React, { useState, useEffect, useRef } from "react";
import { PROJECT_STATUS_OPTIONS as STATUS_OPTIONS } from "../utils/projectStatus";
import { CLASSIFICATION_OPTIONS } from "../utils/classifications";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";
const SPECS_OPTIONS = ["Affordable", "Superior"];

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

  // Use ref to track latest values for saving
  const valuesRef = useRef({ status, street, suburb, state, specs, classification, projectInfoNotes, onHold, qpNumber });

  // Update ref whenever state changes
  useEffect(() => {
    valuesRef.current = { status, street, suburb, state, specs, classification, projectInfoNotes, onHold, qpNumber };
  }, [status, street, suburb, state, specs, classification, projectInfoNotes, onHold, qpNumber]);
  
  // For autosizing selects (now fixed at 300px)
  const statusSelectRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
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
  }

  function handleSuburbChange(e) {
    const newValue = e.target.value;
    setSuburb(newValue);
    valuesRef.current.suburb = newValue;
  }

  function handleStateChange(e) {
    const newValue = e.target.value;
    setState(newValue);
    valuesRef.current.state = newValue;
  }

  function handleQpNumberChange(e) {
    const newValue = e.target.value;
    setQpNumber(newValue);
    valuesRef.current.qpNumber = newValue;
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

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, flexShrink: 0 }}>
        Project Info
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "stretch", flex: 1, minHeight: 0 }}>
          {/* Column 1 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Status
              </div>
              <select
                ref={statusSelectRef}
                name="status"
                data-field="status"
                value={status}
                onChange={handleStatusChange}
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "block",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
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
                <div style={{ fontSize: "0.9rem", color: "#32323399" }}>
                  On Hold
                </div>
              </label>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
                  maxWidth: "300px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
                  maxWidth: "300px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                State
              </div>
              <input
                type="text"
                name="state"
                data-field="state"
                value={state}
                onChange={handleStateChange}
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>
            {isQldState(state) && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
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
                    maxWidth: "300px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}
            <div style={{ marginTop: "24px" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !project?.id) return;

                  // Check if it's a PDF
                  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                    alert("Please select a PDF file.");
                    e.target.value = ""; // Reset input
                    return;
                  }

                  // Create FormData to upload the file
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

                    // Refresh project data
                    if (onUpdate) {
                      onUpdate();
                    }
                  } catch (error) {
                    console.error("Error saving proposal:", error);
                    alert(error.message || "Failed to save proposal location");
                  }

                  // Reset input
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
                {project?.proposal_pdf_location ? "Show Proposal" : "Locate Proposal"}
              </button>
            </div>
          </div>

          {/* Column 2 - Specs and Classification */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Specs
              </div>
              <select
                name="specs"
                value={specs}
                onChange={handleSpecsChange}
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "block",
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
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Classification
              </div>
              <select
                name="classification"
                value={classification}
                onChange={handleClassificationChange}
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  display: "block",
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
            {(project?.classification || "").trim() === "Renovation" &&
              typeof onRequestRenovationDuplicate === "function" &&
              !(
                Array.isArray(project?.duplicate_linked_project_ids) &&
                project.duplicate_linked_project_ids.length > 0
              ) &&
              (project?.duplicate_source_project_id == null ||
                String(project.duplicate_source_project_id).trim() === "") && (
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => onRequestRenovationDuplicate()}
                  style={{
                    width: "100%",
                    maxWidth: "300px",
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
                <div style={{ fontSize: "0.75rem", color: "#32323399", marginTop: "6px", maxWidth: "300px", lineHeight: 1.35 }}>
                  New job number and sales entry; re-use the same Windows job folder (no new folder).
                </div>
              </div>
            )}
            {(project?.classification || "").trim() !== "Renovation" &&
              typeof onRequestLinkRenovationDuplicate === "function" &&
              !(
                Array.isArray(project?.duplicate_linked_project_ids) &&
                project.duplicate_linked_project_ids.length > 0
              ) &&
              (project?.duplicate_source_project_id == null ||
                String(project.duplicate_source_project_id).trim() === "") && (
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => onRequestLinkRenovationDuplicate()}
                  style={{
                    width: "100%",
                    maxWidth: "300px",
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
                  Duplicate & Link Renovation
                </button>
                <div style={{ fontSize: "0.75rem", color: "#32323399", marginTop: "6px", maxWidth: "300px", lineHeight: 1.35 }}>
                  New renovation job linked to this folder; renovation proposal PDF goes in 12. RENOVATION only.
                </div>
              </div>
            )}
          </div>

          {/* Column 3 - Project Log */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
              Project Log
            </div>
            <div
              style={{
                width: "100%",
                maxWidth: "300px",
                flex: 1,
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.9rem",
                color: MONUMENT,
                background: WHITE,
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

          {/* Column 4 - Notes */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", flexShrink: 0 }}>
              Notes
            </div>
            <textarea
              name="project_info_notes"
              value={projectInfoNotes}
              onChange={handleProjectInfoNotesChange}
              onBlur={() => void saveAllFields()}
              placeholder="Add project notes..."
              style={{
                width: "100%",
                maxWidth: "300px",
                flex: 1,
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                resize: "none",
                fontFamily: "inherit",
                overflowY: "auto",
                minHeight: 0,
                height: "100%",
              }}
            />
          </div>

        </div>
      )}
    </div>
    </>
  );
}
