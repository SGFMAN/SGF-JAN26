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

export default function Admin({ project }) {
  const [stream, setStream] = useState(project?.stream || "");
  const [deposit, setDeposit] = useState("");
  const [customDeposit, setCustomDeposit] = useState("");
  
  // Determine if deposit is one of the preset options or custom
  useEffect(() => {
    const depositValue = project?.deposit || "";
    if (depositValue === "Full 5%" || depositValue === "$5k only") {
      setDeposit(depositValue);
      setCustomDeposit("");
    } else if (depositValue) {
      setDeposit("Other");
      setCustomDeposit(depositValue);
    } else {
      setDeposit("");
      setCustomDeposit("");
    }
  }, [project]);
  
  // Use ref to track latest values for saving
  const valuesRef = useRef({ stream, deposit: deposit === "Other" ? customDeposit : deposit });
  
  // Update ref whenever state changes
  useEffect(() => {
    valuesRef.current = { stream, deposit: deposit === "Other" ? customDeposit : deposit };
  }, [stream, deposit, customDeposit]);

  // For autosizing select
  const streamSelectRef = useRef(null);
  const [streamSelectWidth, setStreamSelectWidth] = useState(undefined);

  // Compute the longest option
  const LONGEST_STREAM = getLongestText(STREAM_OPTIONS, "Select Stream");

  // Calculate width for <select> when component mounts
  useEffect(() => {
    function getTextWidth(text, font) {
      const canvas =
        getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
      const context = canvas.getContext("2d");
      context.font = font;
      return context.measureText(text).width + 40;
    }
    const font = "1rem system-ui, Segoe UI, Arial, sans-serif";

    setStreamSelectWidth(Math.ceil(getTextWidth(LONGEST_STREAM, font)));
  }, []);

  useEffect(() => {
    setStream(project?.stream || "");
  }, [project]);

  async function saveField(fieldName, value) {
    if (!project?.id) return;
    const currentValues = valuesRef.current;
    // Build update data with all existing project fields, similar to ProjectInfo
    // Derive name from street + suburb if needed (for consistency)
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
        [fieldName]: value === "" ? null : value,
      };
      
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
      }
      // Don't call onUpdate() to prevent screen flash - state is already correct
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

  async function handleDepositChange(e) {
    const newDeposit = e.target.value;
    setDeposit(newDeposit);
    if (newDeposit !== "Other") {
      setCustomDeposit("");
      valuesRef.current.deposit = newDeposit;
      await saveField("deposit", newDeposit);
    } else {
      valuesRef.current.deposit = customDeposit;
    }
  }

  function handleCustomDepositChange(e) {
    const newAmount = e.target.value;
    setCustomDeposit(newAmount);
    valuesRef.current.deposit = newAmount;
  }

  async function handleCustomDepositBlur() {
    if (deposit === "Other") {
      await saveField("deposit", customDeposit);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Admin
      </h2>
      {project && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
              Stream
            </div>
            <select
              ref={streamSelectRef}
              name="stream"
              value={stream}
              onChange={handleStreamChange}
              style={{
                minWidth: streamSelectWidth ? `${streamSelectWidth}px` : undefined,
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
              <option value="">Select Stream</option>
              {STREAM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: "16px", display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Deposit Amount
              </div>
              <select
                name="deposit"
                value={deposit}
                onChange={handleDepositChange}
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
            {deposit === "Other" && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                  Custom Amount
                </div>
                <input
                  type="text"
                  name="customDeposit"
                  value={customDeposit}
                  onChange={handleCustomDepositChange}
                  onBlur={handleCustomDepositBlur}
                  placeholder="Enter custom amount"
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
            )}
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
              }}
            >
              {project.year || "Not set"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
