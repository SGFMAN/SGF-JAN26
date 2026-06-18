import React, { useState, useEffect, useRef } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const CONTRACT_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];
const SUPPORTING_DOCUMENTS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];
const WATER_AUTHORITY_OPTIONS = ["Not Required", "Barwon Water", "Greater Western Water", "South East Water"];
const WATER_DECLARATION_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];

export default function Contract({ project, onUpdate }) {
  const [contractStatus, setContractStatus] = useState(project?.contract_status || "Not Sent");
  const [supportingDocumentsStatus, setSupportingDocumentsStatus] = useState(project?.supporting_documents_status || "Not Sent");
  const [waterAuthority, setWaterAuthority] = useState(project?.water_authority || "Not Required");
  const [waterDeclarationStatus, setWaterDeclarationStatus] = useState(project?.water_declaration_status || "Not Sent");
  const [notes, setNotes] = useState(project?.notes || "");
  
  const valuesRef = useRef({ contractStatus, supportingDocumentsStatus, waterAuthority, waterDeclarationStatus, notes });

  useEffect(() => {
    valuesRef.current = { contractStatus, supportingDocumentsStatus, waterAuthority, waterDeclarationStatus, notes };
  }, [contractStatus, supportingDocumentsStatus, waterAuthority, waterDeclarationStatus, notes]);

  useEffect(() => {
    if (!project) return;
    setContractStatus(project.contract_status || "Not Sent");
    setSupportingDocumentsStatus(project.supporting_documents_status || "Not Sent");
    setWaterAuthority(project.water_authority || "Not Required");
    setWaterDeclarationStatus(project.water_declaration_status || "Not Sent");
    setNotes(project.notes || "");
  }, [project?.id]);

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
      // Build update data with the current values, but use the new value for the field being changed
      const updateData = {
        name: projectName,
        status: project?.status || null,
        stream: project?.stream || null,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: project?.deposit || null,
        project_cost: project?.project_cost || null,
        contract_status: fieldName === "contract_status" ? (value === "" ? null : value) : currentValues.contractStatus,
        supporting_documents_status: fieldName === "supporting_documents_status" ? (value === "" ? null : value) : currentValues.supportingDocumentsStatus,
        water_authority: fieldName === "water_authority" ? (value === "" ? null : value) : currentValues.waterAuthority,
        water_declaration_status: fieldName === "water_declaration_status" ? (value === "" ? null : value) : currentValues.waterDeclarationStatus,
        notes: fieldName === "notes" ? (value === "" ? null : value) : currentValues.notes,
      };
      
      // If contract status changes to "Sent", always update the sent date/time to current date/time
      if (fieldName === "contract_status" && value === "Sent") {
        updateData.contract_sent_date = new Date().toISOString();
      }
      
      // If contract status changes to "Complete", always update the complete date/time to current date/time
      if (fieldName === "contract_status" && value === "Complete") {
        updateData.contract_complete_date = new Date().toISOString();
      }
      
      // If supporting documents status changes to "Sent", always update the sent date/time to current date/time
      if (fieldName === "supporting_documents_status" && value === "Sent") {
        updateData.supporting_documents_sent_date = new Date().toISOString();
      }
      
      // If supporting documents status changes to "Complete", always update the complete date/time to current date/time
      if (fieldName === "supporting_documents_status" && value === "Complete") {
        updateData.supporting_documents_complete_date = new Date().toISOString();
      }
      
      // If water declaration status changes to "Sent", always update the sent date/time to current date/time
      if (fieldName === "water_declaration_status" && value === "Sent") {
        updateData.water_declaration_sent_date = new Date().toISOString();
      }
      
      // If water declaration status changes to "Complete", always update the complete date/time to current date/time
      if (fieldName === "water_declaration_status" && value === "Complete") {
        updateData.water_declaration_complete_date = new Date().toISOString();
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

  async function saveAllFields() {
    await saveField("notes", valuesRef.current.notes);
  }

  async function handleContractStatusChange(e) {
    const newStatus = e.target.value;
    setContractStatus(newStatus);
    valuesRef.current.contractStatus = newStatus;
    await saveField("contract_status", newStatus);
  }

  async function handleSupportingDocumentsStatusChange(e) {
    const newStatus = e.target.value;
    setSupportingDocumentsStatus(newStatus);
    valuesRef.current.supportingDocumentsStatus = newStatus;
    await saveField("supporting_documents_status", newStatus);
  }

  async function handleWaterAuthorityChange(e) {
    const newAuthority = e.target.value;
    setWaterAuthority(newAuthority);
    valuesRef.current.waterAuthority = newAuthority;
    await saveField("water_authority", newAuthority);
    
    // If set to "Not Required", reset water declaration status
    if (newAuthority === "Not Required") {
      setWaterDeclarationStatus("Not Sent");
      valuesRef.current.waterDeclarationStatus = "Not Sent";
      await saveField("water_declaration_status", "Not Sent");
    }
  }

  async function handleWaterDeclarationStatusChange(e) {
    const newStatus = e.target.value;
    setWaterDeclarationStatus(newStatus);
    valuesRef.current.waterDeclarationStatus = newStatus;
    await saveField("water_declaration_status", newStatus);
  }

  function handleNotesChange(e) {
    const newNotes = e.target.value;
    setNotes(newNotes);
    valuesRef.current.notes = newNotes;
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Contract
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {/* Column 1 - Contract */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Contract Status
              </div>
              <select
                name="contractStatus"
                value={contractStatus}
                onChange={handleContractStatusChange}
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
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                {CONTRACT_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {contractStatus === "Sent" && project?.contract_sent_date && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Sent Date & Time
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
                    maxWidth: "100%",
                  }}
                >
                  {formatDateTime(project.contract_sent_date)}
                </div>
              </div>
            )}

            {contractStatus === "Complete" && project?.contract_complete_date && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Complete Date & Time
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
                    maxWidth: "100%",
                  }}
                >
                  {formatDateTime(project.contract_complete_date)}
                </div>
              </div>
            )}
          </div>

          {/* Column 2 - Supporting Documents */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Supporting Documents Status
              </div>
              <select
                name="supportingDocumentsStatus"
                value={supportingDocumentsStatus}
                onChange={handleSupportingDocumentsStatusChange}
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
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Sent Date & Time
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
                    maxWidth: "100%",
                  }}
                >
                  {formatDateTime(project.supporting_documents_sent_date)}
                </div>
              </div>
            )}

            {supportingDocumentsStatus === "Complete" && project?.supporting_documents_complete_date && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Complete Date & Time
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
                    maxWidth: "100%",
                  }}
                >
                  {formatDateTime(project.supporting_documents_complete_date)}
                </div>
              </div>
            )}
          </div>

          {/* Column 3 - Water Authority & Water Declaration */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Water Authority
              </div>
              <select
                name="waterAuthority"
                value={waterAuthority}
                onChange={handleWaterAuthorityChange}
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
                  display: "inline-block",
                  maxWidth: "100%",
                }}
              >
                {WATER_AUTHORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {waterAuthority !== "Not Required" && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Water Declaration Status
                </div>
                <select
                  name="waterDeclarationStatus"
                  value={waterDeclarationStatus}
                  onChange={handleWaterDeclarationStatusChange}
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
                    display: "inline-block",
                    maxWidth: "100%",
                  }}
                >
                  {WATER_DECLARATION_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {waterDeclarationStatus === "Sent" && project?.water_declaration_sent_date && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Sent Date & Time
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
                    maxWidth: "100%",
                  }}
                >
                  {formatDateTime(project.water_declaration_sent_date)}
                </div>
              </div>
            )}

            {waterDeclarationStatus === "Complete" && project?.water_declaration_complete_date && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                  Complete Date & Time
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
                    maxWidth: "100%",
                  }}
                >
                  {formatDateTime(project.water_declaration_complete_date)}
                </div>
              </div>
            )}
          </div>

          {/* Column 4 - Notes */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
              Notes
            </div>
            <textarea
              name="notes"
              value={notes}
              onChange={handleNotesChange}
              onBlur={() => void saveAllFields()}
              placeholder="Enter notes..."
              style={{
                width: "100%",
                flex: "1",
                minHeight: "400px",
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
      )}
    </div>
  );
}
