import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const STATUS_OPTIONS = ["Design Phase", "On Hold", "Construction Phase", "Complete"];
const SPECS_OPTIONS = ["Affordable", "Superior"];
const CLASSIFICATION_OPTIONS = [
  "Small Second Dwelling",
  "Dependant Persons Unit",
  "Detached Extension",
  "Dwelling",
  "Home Office / Studio"
];

function getLongestText(arr, include = "") {
  return arr.concat(include ? [include] : []).reduce(
    (longest, curr) => (curr.length > longest.length ? curr : longest),
    ""
  );
}

export default function ProjectInfo({ project, onUpdate }) {
  const [status, setStatus] = useState(project?.status || "");
  const [street, setStreet] = useState(project?.street || "");
  const [suburb, setSuburb] = useState(project?.suburb || "");
  const [state, setState] = useState(project?.state || "");
  const [specs, setSpecs] = useState(project?.specs || "");
  const [classification, setClassification] = useState(project?.classification || "");
  const [projectInfoNotes, setProjectInfoNotes] = useState(project?.project_info_notes || "");
  
  // Use ref to track latest values for saving
  const valuesRef = useRef({ status, street, suburb, state, specs, classification, projectInfoNotes });
  const saveTimeoutRef = useRef(null);
  
  // Update ref whenever state changes
  useEffect(() => {
    valuesRef.current = { status, street, suburb, state, specs, classification, projectInfoNotes };
  }, [status, street, suburb, state, specs, classification, projectInfoNotes]);
  
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
  }, [project]);

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
          project_cost: project?.project_cost || null,
          deposit: project?.deposit || null,
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
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Auto-save after 1 second of no typing
    saveTimeoutRef.current = setTimeout(async () => {
      if (!project?.id) return;
      const currentValues = valuesRef.current;
      try {
        await fetch(`${API_URL}/api/projects/${project.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            project_info_notes: currentValues.projectInfoNotes || null,
          }),
        });
        if (onUpdate) {
          onUpdate();
        }
      } catch (error) {
        console.error("Error saving project info notes:", error);
      }
    }, 1000);
  }

  async function handleBlur() {
    // Clear any pending timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    // Save all fields - ref should have latest values from change handlers
    console.log("Blur triggered, saving all fields");
    await saveAllFields();
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Project Info
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>
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
                onBlur={handleBlur}
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
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Street
              </div>
              <input
                type="text"
                name="street"
                data-field="street"
                value={street}
                onChange={handleStreetChange}
                onBlur={handleBlur}
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
                onBlur={handleBlur}
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
                onBlur={handleBlur}
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
                    // Check if PDF exists before opening
                    try {
                      const pdfUrl = `${API_URL}/api/files/proposal/${project.id}`;
                      const response = await fetch(pdfUrl);
                      
                      if (!response.ok) {
                        // File doesn't exist, allow user to locate it
                        console.log("Proposal PDF not found, allowing user to locate");
                        fileInputRef.current?.click();
                      } else {
                        // File exists, open it in a new window
                        window.open(pdfUrl, "_blank");
                      }
                    } catch (error) {
                      // Error fetching file, allow user to locate it
                      console.error("Error checking proposal PDF:", error);
                      fileInputRef.current?.click();
                    }
                  } else {
                    // Trigger file input to locate proposal
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
                onBlur={handleBlur}
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
                onBlur={handleBlur}
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
          </div>

          {/* Column 3 - Notes */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Notes
              </div>
              <textarea
                name="project_info_notes"
                value={projectInfoNotes}
                onChange={handleProjectInfoNotesChange}
                onBlur={handleBlur}
                placeholder="Add project notes..."
                style={{
                  width: "100%",
                  maxWidth: "300px",
                  minHeight: "200px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* Column 4 - Project Log */}
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

        </div>
      )}
    </div>
  );
}
