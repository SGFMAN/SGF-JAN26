import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const STATUS_OPTIONS = ["Design Phase", "Construction Phase", "Complete"];

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
  
  // Use ref to track latest values for saving
  const valuesRef = useRef({ status, street, suburb, state });
  
  // Update ref whenever state changes
  useEffect(() => {
    valuesRef.current = { status, street, suburb, state };
  }, [status, street, suburb, state]);
  
  // For autosizing selects
  const statusSelectRef = useRef(null);
  const [statusSelectWidth, setStatusSelectWidth] = useState(undefined);

  // Compute the longest option
  const LONGEST_STATUS = getLongestText(STATUS_OPTIONS);

  // Calculate width for <select>s when component mounts
  useEffect(() => {
    function getTextWidth(text, font) {
      const canvas =
        getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
      const context = canvas.getContext("2d");
      context.font = font;
      return context.measureText(text).width + 40;
    }
    const font = "1rem system-ui, Segoe UI, Arial, sans-serif";

    setStatusSelectWidth(Math.ceil(getTextWidth(LONGEST_STATUS, font)));
  }, []);

  useEffect(() => {
    setStatus(project?.status || "");
    setStreet(project?.street || "");
    setSuburb(project?.suburb || "");
    setState(project?.state || "");
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
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving fields - Status:", response.status, "Error:", errorText);
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved all fields:", savedData);
      }
      // Don't call onUpdate() to prevent screen flash - state is already correct
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
      }
      // Don't call onUpdate() to prevent screen flash - state is already correct
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

  async function handleBlur() {
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
        <div style={{ marginTop: "24px" }}>
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
                minWidth: statusSelectWidth ? `${statusSelectWidth}px` : undefined,
                maxWidth: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                cursor: "pointer",
                display: "inline-block",
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
        </div>
      )}
    </div>
  );
}
