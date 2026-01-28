import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const DRAWINGS_STATUS_OPTIONS = ["In Progress", "Concept Approved", "Working Drawings Approved"];

export default function Drawings({ project, onUpdate }) {
  const [drawingsStatus, setDrawingsStatus] = useState(project?.drawings_status || "In Progress");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  
  const valuesRef = useRef({ drawingsStatus });
  
  useEffect(() => {
    valuesRef.current = { drawingsStatus };
  }, [drawingsStatus]);

  useEffect(() => {
    if (project) {
      setDrawingsStatus(project.drawings_status || "In Progress");
    }
  }, [project]);

  async function saveField(fieldName, value) {
    if (!project?.id) {
      console.error("Cannot save: no project ID");
      return;
    }
    const currentValues = valuesRef.current;
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";
    try {
      const updateData = {
        name: projectName,
        status: project?.status || "",
        stream: project?.stream || null,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: project?.deposit || null,
        project_cost: project?.project_cost || null,
        client_name: project?.client_name || null,
        email: project?.email || null,
        phone: project?.phone || null,
        client1_name: project?.client1_name || null,
        client1_email: project?.client1_email || null,
        client1_phone: project?.client1_phone || null,
        client1_active: project?.client1_active || null,
        client2_name: project?.client2_name || null,
        client2_email: project?.client2_email || null,
        client2_phone: project?.client2_phone || null,
        client2_active: project?.client2_active || null,
        client3_name: project?.client3_name || null,
        client3_email: project?.client3_email || null,
        client3_phone: project?.client3_phone || null,
        client3_active: project?.client3_active || null,
        site_visit_status: project?.site_visit_status || null,
        site_visit_date: project?.site_visit_date || null,
        site_visit_time: project?.site_visit_time || null,
        contract_status: project?.contract_status || null,
        contract_sent_date: project?.contract_sent_date || null,
        contract_complete_date: project?.contract_complete_date || null,
        supporting_documents_status: project?.supporting_documents_status || null,
        supporting_documents_sent_date: project?.supporting_documents_sent_date || null,
        supporting_documents_complete_date: project?.supporting_documents_complete_date || null,
        water_declaration_status: project?.water_declaration_status || null,
        water_declaration_sent_date: project?.water_declaration_sent_date || null,
        water_declaration_complete_date: project?.water_declaration_complete_date || null,
        notes: project?.notes || null,
        window_status: project?.window_status || null,
        window_colour: project?.window_colour || null,
        window_reveal: project?.window_reveal || null,
        window_reveal_other: project?.window_reveal_other || null,
        window_glazing: project?.window_glazing || null,
        window_bal_rating: project?.window_bal_rating || null,
        window_date_required: project?.window_date_required || null,
        window_ordered_date: project?.window_ordered_date || null,
          window_order_pdf_location: project?.window_order_pdf_location || null,
          window_order_number: project?.window_order_number || null,
          drawings_status: fieldName === "drawings_status" ? (value === "" ? null : value) : currentValues.drawingsStatus,
          drawings_pdf_location: project?.drawings_pdf_location || null,
          drawings_history: project?.drawings_history || null,
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        };
      
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
        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  async function handleDrawingsStatusChange(e) {
    const newStatus = e.target.value;
    setDrawingsStatus(newStatus);
    valuesRef.current.drawingsStatus = newStatus;
    await saveField("drawings_status", newStatus);
  }

  async function handleMarkConceptConfirmed() {
    setDrawingsStatus("Concept Approved");
    valuesRef.current.drawingsStatus = "Concept Approved";
    await saveField("drawings_status", "Concept Approved");
  }

  async function handleMarkWorkingDrawingsConfirmed() {
    setDrawingsStatus("Working Drawings Approved");
    valuesRef.current.drawingsStatus = "Working Drawings Approved";
    await saveField("drawings_status", "Working Drawings Approved");
  }

  // Drag and drop handlers
  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function saveDrawingsPath(file) {
    if (!file) return;
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    try {
      // Get project folder path from settings
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const rootDirectory = settings.root_directory || "";
      
      if (!rootDirectory) {
        alert("Error: Root directory is not set. Please configure it in File Settings.");
        return;
      }

      // Get project year (from project or current year)
      const projectYear = project.year || new Date().getFullYear().toString();
      const suburb = (project.suburb || "").toUpperCase();
      const street = project.street || "";
      const projectPath = `${rootDirectory}\\${projectYear}\\${suburb} - ${street}`;
      
      // Construct the file path (using the selected file's name)
      const fileName = file.name;
      const filePath = `${projectPath}\\${fileName}`;

      // Get current drawings history or initialize empty array
      let drawingsHistory = [];
      try {
        const historyValue = project?.drawings_history;
        if (historyValue) {
          drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
        }
      } catch (e) {
        console.error("Error parsing drawings_history:", e);
        drawingsHistory = [];
      }

      // Calculate revision number
      // Drawing 1 = no revision, Drawing 2 = Revision 1, etc.
      const revisionNumber = drawingsHistory.length === 0 ? null : drawingsHistory.length;

      // Get current date and time
      const now = new Date();
      const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const time = now.toTimeString().split(' ')[0]; // HH:MM:SS

      // Add new drawing entry to history
      const newEntry = {
        name: fileName,
        date: date,
        time: time,
        revision: revisionNumber
      };
      drawingsHistory.push(newEntry);

      // Store the file path in the database
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project?.status || null,
          stream: project?.stream || null,
          suburb: project?.suburb || null,
          street: project?.street || null,
          state: project?.state || null,
          deposit: project?.deposit || null,
          project_cost: project?.project_cost || null,
          client_name: project?.client_name || null,
          email: project?.email || null,
          phone: project?.phone || null,
          client1_name: project?.client1_name || null,
          client1_email: project?.client1_email || null,
          client1_phone: project?.client1_phone || null,
          client1_active: project?.client1_active || null,
          client2_name: project?.client2_name || null,
          client2_email: project?.client2_email || null,
          client2_phone: project?.client2_phone || null,
          client2_active: project?.client2_active || null,
          client3_name: project?.client3_name || null,
          client3_email: project?.client3_email || null,
          client3_phone: project?.client3_phone || null,
          client3_active: project?.client3_active || null,
          site_visit_status: project?.site_visit_status || null,
          site_visit_date: project?.site_visit_date || null,
          site_visit_time: project?.site_visit_time || null,
          contract_status: project?.contract_status || null,
          contract_sent_date: project?.contract_sent_date || null,
          contract_complete_date: project?.contract_complete_date || null,
          supporting_documents_status: project?.supporting_documents_status || null,
          supporting_documents_sent_date: project?.supporting_documents_sent_date || null,
          supporting_documents_complete_date: project?.supporting_documents_complete_date || null,
          water_declaration_status: project?.water_declaration_status || null,
          water_declaration_sent_date: project?.water_declaration_sent_date || null,
          water_declaration_complete_date: project?.water_declaration_complete_date || null,
          notes: project?.notes || null,
          window_status: project?.window_status || null,
          window_colour: project?.window_colour || null,
          window_reveal: project?.window_reveal || null,
          window_reveal_other: project?.window_reveal_other || null,
          window_glazing: project?.window_glazing || null,
          window_bal_rating: project?.window_bal_rating || null,
          window_date_required: project?.window_date_required || null,
          window_ordered_date: project?.window_ordered_date || null,
          window_order_pdf_location: project?.window_order_pdf_location || null,
          window_order_number: project?.window_order_number || null,
          drawings_status: project?.drawings_status || null,
          drawings_pdf_location: filePath,
          drawings_history: JSON.stringify(drawingsHistory),
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save drawings path");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      // Clear selected file after save
      setSelectedFile(null);
    } catch (error) {
      console.error("Error saving drawings path:", error);
      alert(`Error saving drawings path: ${error.message}`);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
        await saveDrawingsPath(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  async function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
        await saveDrawingsPath(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Drawings
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {/* Column 1 - Status */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Status
              </div>
              <select
                name="drawingsStatus"
                value={drawingsStatus}
                onChange={handleDrawingsStatusChange}
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
              >
                {DRAWINGS_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 2 - Drawings History */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500" }}>
                Drawings History
              </div>
              <div
                style={{
                  background: WHITE,
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  padding: "16px",
                  minHeight: "300px",
                  maxHeight: "500px",
                  overflowY: "auto",
                }}
              >
                {(() => {
                  let drawingsHistory = [];
                  try {
                    const historyValue = project?.drawings_history;
                    if (historyValue) {
                      drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
                    }
                  } catch (e) {
                    console.error("Error parsing drawings_history:", e);
                  }

                  if (!drawingsHistory || drawingsHistory.length === 0) {
                    return (
                      <div style={{ color: "#32323399", fontSize: "0.9rem", fontStyle: "italic" }}>
                        No drawings uploaded yet
                      </div>
                    );
                  }

                  return drawingsHistory.map((drawing, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "12px",
                        marginBottom: index < drawingsHistory.length - 1 ? "12px" : "0",
                        borderBottom: index < drawingsHistory.length - 1 ? `1px solid ${SECTION_GREY}` : "none",
                      }}
                    >
                      <div style={{ fontWeight: "500", color: MONUMENT, marginBottom: "6px" }}>
                        {drawing.name}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "4px" }}>
                        Date: {drawing.date}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "4px" }}>
                        Time: {drawing.time}
                      </div>
                      {drawing.revision !== null && (
                        <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                          Revision: {drawing.revision}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Column 3 - Empty for now */}
          <div style={{ flex: "1", minWidth: "200px" }}>
          </div>

          {/* Column 4 - Drawings PDF Upload */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500" }}>
                Drawings PDF
              </div>
              <div
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleBrowseClick}
                style={{
                  border: `2px dashed ${WHITE}`,
                  borderRadius: "8px",
                  padding: "40px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: MONUMENT,
                  transition: "background 0.2s, border-color 0.2s",
                  marginBottom: project.drawings_pdf_location ? "12px" : "0",
                }}
              >
                {selectedFile ? (
                  <div>
                    <div style={{ color: WHITE, fontWeight: "500", marginBottom: "8px" }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "#ffffff99" }}>
                      Click to select a different file
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: WHITE, fontWeight: "500", marginBottom: "8px" }}>
                      Drag and drop PDF file here
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "#ffffff99" }}>
                      or click to browse
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: project.drawings_pdf_location ? "12px" : "0", alignItems: "flex-start", width: "fit-content" }}>
                {project.drawings_pdf_location && (
                  <button
                    onClick={() => {
                      if (project?.drawings_pdf_location) {
                        const pdfUrl = `${API_URL}/api/files/drawings/${project.id}`;
                        window.open(pdfUrl, "_blank");
                      } else {
                        alert("No drawings PDF has been set for this project yet.");
                      }
                    }}
                    style={{
                      background: WHITE,
                      color: MONUMENT,
                      border: `1px solid ${SECTION_GREY}`,
                      borderRadius: "10px",
                      padding: "8px 8px",
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      textAlign: "center",
                      letterSpacing: "0.5px",
                      cursor: "pointer",
                      transition: "background 0.18s, color 0.15s",
                      display: "block",
                      width: "100%",
                    }}
                  >
                    Show Drawings
                  </button>
                )}
                <button
                  onClick={handleMarkConceptConfirmed}
                  style={{
                    background: WHITE,
                    color: MONUMENT,
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "10px",
                    padding: "8px 8px",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    textAlign: "center",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    transition: "background 0.18s, color 0.15s",
                    display: "block",
                    width: "100%",
                  }}
                >
                  Approve Concept
                </button>
                <button
                  onClick={handleMarkWorkingDrawingsConfirmed}
                  style={{
                    background: WHITE,
                    color: MONUMENT,
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "10px",
                    padding: "8px 8px",
                    fontSize: "0.95rem",
                    fontWeight: 500,
                    textAlign: "center",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    transition: "background 0.18s, color 0.15s",
                    display: "block",
                    width: "100%",
                  }}
                >
                  Approve Working Dwgs
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
