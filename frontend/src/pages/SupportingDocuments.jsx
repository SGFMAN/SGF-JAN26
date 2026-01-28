import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const SUPPORTING_DOCUMENTS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];

export default function SupportingDocuments({ project, onUpdate }) {
  const [supportingDocumentsStatus, setSupportingDocumentsStatus] = useState(project?.supporting_documents_status || "Not Sent");
  
  const valuesRef = useRef({ supportingDocumentsStatus });
  
  useEffect(() => {
    valuesRef.current = { supportingDocumentsStatus };
  }, [supportingDocumentsStatus]);

  useEffect(() => {
    setSupportingDocumentsStatus(project?.supporting_documents_status || "Not Sent");
  }, [project]);

  // Format date and time for display
  function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return "";
    try {
      const date = new Date(dateTimeStr);
      const dateStr = date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const timeStr = date.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${dateStr} at ${timeStr}`;
    } catch (e) {
      return dateTimeStr;
    }
  }

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
        stream: project?.stream || null,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: project?.deposit || null,
        project_cost: project?.project_cost || null,
        supporting_documents_status: currentValues.supportingDocumentsStatus,
        [fieldName]: value === "" ? null : value,
      };
      
      // If status changes to "Sent", always update the sent date/time to current date/time
      if (fieldName === "supporting_documents_status" && value === "Sent") {
        updateData.supporting_documents_sent_date = new Date().toISOString();
      }
      
      // If status changes to "Complete", always update the complete date/time to current date/time
      if (fieldName === "supporting_documents_status" && value === "Complete") {
        updateData.supporting_documents_complete_date = new Date().toISOString();
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
      
      const savedData = await response.json().catch(() => null);
      console.log("Successfully saved field:", savedData);
      
      // CRITICAL: Always call onUpdate after successful save to refresh project data
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

  async function handleSupportingDocumentsStatusChange(e) {
    const newStatus = e.target.value;
    setSupportingDocumentsStatus(newStatus);
    valuesRef.current.supportingDocumentsStatus = newStatus;
    await saveField("supporting_documents_status", newStatus);
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Supporting Documents
      </h2>
      {project && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
              Supporting Documents Status
            </div>
            <select
              name="supportingDocumentsStatus"
              value={supportingDocumentsStatus}
              onChange={handleSupportingDocumentsStatusChange}
              style={{
                width: "300px",
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
              {SUPPORTING_DOCUMENTS_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          {supportingDocumentsStatus === "Sent" && project?.supporting_documents_sent_date && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Sent Date & Time
              </div>
              <div
                style={{
                  width: "300px",
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
                {formatDateTime(project.supporting_documents_sent_date)}
              </div>
            </div>
          )}

          {supportingDocumentsStatus === "Complete" && project?.supporting_documents_complete_date && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Complete Date & Time
              </div>
              <div
                style={{
                  width: "300px",
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
                {formatDateTime(project.supporting_documents_complete_date)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
