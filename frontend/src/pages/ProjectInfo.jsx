import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "http://localhost:3001";

const STATUS_OPTIONS = ["Design Phase", "Construction Phase", "Complete"];
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

export default function ProjectInfo({ project, onUpdate }) {
  const [status, setStatus] = useState(project?.status || "");
  const [stream, setStream] = useState(project?.stream || "");

  // For autosizing selects
  const statusSelectRef = useRef(null);
  const streamSelectRef = useRef(null);
  const [statusSelectWidth, setStatusSelectWidth] = useState(undefined);
  const [streamSelectWidth, setStreamSelectWidth] = useState(undefined);

  // Compute the longest option
  const LONGEST_STATUS = getLongestText(STATUS_OPTIONS);
  const LONGEST_STREAM = getLongestText(STREAM_OPTIONS, "Select Stream");

  // Calculate width for <select>s when component mounts
  useEffect(() => {
    // Helper to create a hidden span, get width
    function getTextWidth(text, font) {
      // Create a canvas for accurate text measurement
      const canvas =
        getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));
      const context = canvas.getContext("2d");
      context.font = font;
      // Add some extra room for dropdown arrow & padding
      return context.measureText(text).width + 40;
    }
    // Sample styles for the select font
    const font =
      "1rem system-ui, Segoe UI, Arial, sans-serif";

    setStatusSelectWidth(
      Math.ceil(getTextWidth(LONGEST_STATUS, font))
    );
    setStreamSelectWidth(
      Math.ceil(getTextWidth(LONGEST_STREAM, font))
    );
  }, []);

  useEffect(() => {
    setStatus(project?.status || "");
    setStream(project?.stream || "");
  }, [project]);

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    if (project?.id) {
      try {
        const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        });
        if (response.ok && onUpdate) {
          onUpdate();
        }
      } catch (error) {
        console.error("Error updating status:", error);
      }
    }
  }

  async function handleStreamChange(e) {
    const newStream = e.target.value;
    setStream(newStream);
    if (project?.id) {
      try {
        const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stream: newStream }),
        });
        if (response.ok && onUpdate) {
          onUpdate();
        }
      } catch (error) {
        console.error("Error updating stream:", error);
      }
    }
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
              Project Name
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {project.name}
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
              Status
            </div>
            <select
              ref={statusSelectRef}
              value={status}
              onChange={handleStatusChange}
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
            <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {project.street || "-"}
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
              Suburb
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {project.suburb || "-"}
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
              Stream
            </div>
            <select
              ref={streamSelectRef}
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
        </div>
      )}
    </div>
  );
}
