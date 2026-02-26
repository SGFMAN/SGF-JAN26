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
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesForRevision, setNotesForRevision] = useState(null); // { index, revision, name, isNewDrawing, isCurrentRevision }
  const [notesText, setNotesText] = useState("");
  const [resendDrawings, setResendDrawings] = useState(false);
  const [showEmailClientModal, setShowEmailClientModal] = useState(false);
  const [emailClientNotes, setEmailClientNotes] = useState("");
  const [attachDrawings, setAttachDrawings] = useState(true);
  const [markupFile, setMarkupFile] = useState(null);
  const [isDraggingMarkup, setIsDraggingMarkup] = useState(false);
  const markupInputRef = useRef(null);
  
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
    if (!project?.id) return;
    
    // Get current drawings history
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
    }

    if (drawingsHistory.length === 0) {
      alert("No drawings have been uploaded yet.");
      return;
    }

    // Mark the last entry as concept approved
    const lastIndex = drawingsHistory.length - 1;
    drawingsHistory[lastIndex] = {
      ...drawingsHistory[lastIndex],
      conceptApproved: true
    };

    // Save updated history and status
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";

    try {
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
          drawings_status: "Concept Approved",
          drawings_pdf_location: project?.drawings_pdf_location || null,
          drawings_history: JSON.stringify(drawingsHistory),
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update drawings status");
      }

      setDrawingsStatus("Concept Approved");
      valuesRef.current.drawingsStatus = "Concept Approved";
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error approving concept:", error);
      alert("Failed to approve concept");
    }
  }

  async function handleMarkWorkingDrawingsConfirmed() {
    if (!project?.id) return;
    
    // Get current drawings history
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
    }

    if (drawingsHistory.length === 0) {
      alert("No drawings have been uploaded yet.");
      return;
    }

    // Check if there are new drawings after concept approval
    const conceptApprovedIndex = drawingsHistory.findIndex((entry, index) => {
      // Find the last entry that was concept approved
      return entry.conceptApproved === true;
    });

    if (conceptApprovedIndex === -1) {
      alert("Please approve concept drawings first.");
      return;
    }

    // Check if there are new drawings after the concept approved entry
    if (conceptApprovedIndex >= drawingsHistory.length - 1) {
      alert("Please upload new drawings before approving working drawings.");
      return;
    }

    // Mark the last entry as working drawings approved
    const lastIndex = drawingsHistory.length - 1;
    drawingsHistory[lastIndex] = {
      ...drawingsHistory[lastIndex],
      workingDrawingsApproved: true
    };

    // Save updated history and status
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";

    try {
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
          drawings_status: "Working Drawings Approved",
          drawings_pdf_location: project?.drawings_pdf_location || null,
          drawings_history: JSON.stringify(drawingsHistory),
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update drawings status");
      }

      setDrawingsStatus("Working Drawings Approved");
      valuesRef.current.drawingsStatus = "Working Drawings Approved";
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error approving working drawings:", error);
      alert("Failed to approve working drawings");
    }
  }

  async function handleClearDrawingData() {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    if (!confirm("Are you sure you want to clear all drawing data? This will reset the status, clear history, and clear the file location.")) {
      return;
    }

    try {
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
          drawings_status: "In Progress",
          drawings_pdf_location: null,
          drawings_history: "[]", // Empty JSON array string to clear history
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to clear drawing data: ${errorText}`);
      }

      // Update local state
      setDrawingsStatus("In Progress");
      valuesRef.current.drawingsStatus = "In Progress";
      setSelectedFile(null);

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      alert("Drawing data cleared successfully!");
    } catch (error) {
      console.error("Error clearing drawing data:", error);
      alert(`Error clearing drawing data: ${error.message}`);
    }
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
      // Extract year from year field (could be "2026-01-15" or just "2026")
      let projectYear = "";
      if (project.year) {
        const yearStr = project.year.toString();
        if (yearStr.includes("-")) {
          // Extract year from date format (YYYY-MM-DD)
          projectYear = yearStr.split("-")[0];
        } else {
          // Already just a year
          projectYear = yearStr;
        }
      } else {
        // Fallback to current year if no year set
        projectYear = new Date().getFullYear().toString();
      }
      
      // Get state (uppercase) - required for path construction
      const state = (project.state || "").toUpperCase();
      if (!state) {
        alert("Error: Project state is required to save drawings path. Please set the state in Project Info.");
        return;
      }
      
      const suburb = (project.suburb || "").toUpperCase();
      const street = project.street || "";
      
      // Construct the file path with "2. PUBLISHED PLANS" subfolder
      // Format: root_directory\year\state\suburb - street\2. PUBLISHED PLANS\filename
      // NOTE: This function ONLY saves the path to the database - it does NOT create folders or copy files
      const fileName = file.name;
      const projectFolderName = `${suburb} - ${street}`.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = `${rootDirectory}\\${projectYear}\\${state}\\${projectFolderName}\\2. PUBLISHED PLANS\\${fileName}`;

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
        revision: revisionNumber,
        notes: "", // Initialize with empty notes
        markup_pdf_location: null // Initialize with no markup
      };
      drawingsHistory.push(newEntry);

      // Add project log entry for drawings added
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const revisionText = revisionNumber !== null ? ` Rev ${revisionNumber}` : "";
      const logEntry = project?.project_log 
        ? `${project.project_log}\n${dateTimeStr} - Drawings Added${revisionText} - ${date}`
        : `${dateTimeStr} - Drawings Added${revisionText} - ${date}`;

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
          drawings_viewed_date: project?.drawings_viewed_date || null, // Preserve existing viewed date
          project_log: logEntry,
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

      // Get the updated project from the server response
      const updatedProject = await response.json();
      
      // Refresh project data immediately so red dots appear right away
      // The drawings_viewed_date should remain unchanged, so the comparison will show unviewed drawings
      if (onUpdate) {
        onUpdate(true); // Immediate update
      }

      // Clear selected file after save
      setSelectedFile(null);
      
      // Show notes modal for the newly added revision
      setNotesForRevision({
        index: drawingsHistory.length - 1,
        revision: revisionNumber,
        name: fileName,
        isNewDrawing: true,
        isCurrentRevision: true
      });
      setNotesText("");
      setResendDrawings(false);
      setMarkupFile(null);
      setShowNotesModal(true);
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

  async function saveNotesForRevision(revisionIndex, notes) {
    if (!project?.id) {
      console.error("Cannot save notes: no project ID");
      return;
    }

    try {
      // Get current drawings history
      let drawingsHistory = [];
      try {
        const historyValue = project?.drawings_history;
        if (historyValue) {
          drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
        }
      } catch (e) {
        console.error("Error parsing drawings_history:", e);
        return;
      }

      if (revisionIndex < 0 || revisionIndex >= drawingsHistory.length) {
        console.error("Invalid revision index");
        return;
      }

      // Update notes for the specific revision
      drawingsHistory[revisionIndex] = {
        ...drawingsHistory[revisionIndex],
        notes: notes || ""
      };

      // Save updated history
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
          drawings_pdf_location: project?.drawings_pdf_location || null,
          drawings_history: JSON.stringify(drawingsHistory),
          drawings_viewed_date: project?.drawings_viewed_date || null,
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save notes");
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error saving notes:", error);
      alert("Failed to save notes");
    }
  }

  function handleOpenNotesModal(index, revision, name) {
    // Get current notes for this revision
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
    }

    const currentNotes = drawingsHistory[index]?.notes || "";
    // Check if this is the current (last) revision
    const isCurrentRevision = index === drawingsHistory.length - 1;
    setNotesForRevision({ 
      index, 
      revision, 
      name, 
      isNewDrawing: false,
      isCurrentRevision 
    });
    setNotesText(currentNotes);
    setResendDrawings(false);
    setMarkupFile(null);
    setShowNotesModal(true);
  }

  async function handleSaveNotes() {
    if (notesForRevision === null) return;
    
    await saveNotesForRevision(notesForRevision.index, notesText);
    setShowNotesModal(false);
    setNotesForRevision(null);
    setNotesText("");
  }

  async function handleSendDrawingsWithNotes() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    // Determine if we should attach drawings
    // For new drawings, always attach. For current revision, only if checkbox is checked
    const shouldAttachDrawings = notesForRevision?.isNewDrawing || resendDrawings;
    
    // For new drawings, show the path instead of trying to send
    if (notesForRevision?.isNewDrawing && shouldAttachDrawings) {
      const drawingsPath = project.drawings_pdf_location || "Path not yet saved";
      alert(`Generated Drawings PDF Path:\n\n${drawingsPath}\n\nPlease verify this path is correct.`);
      return;
    }
    
    if (shouldAttachDrawings && !project.drawings_pdf_location) {
      alert("No drawings PDF available to attach.");
      return;
    }

    // If this is a new drawing or current revision, save notes first
    if (notesForRevision && (notesForRevision.isNewDrawing || notesForRevision.isCurrentRevision)) {
      await saveNotesForRevision(notesForRevision.index, notesText);
      
      // If there's a markup file, save it
      if (markupFile && notesForRevision.isNewDrawing) {
        await saveMarkupPath(markupFile, notesForRevision.index);
      }
    }

    // Build email body with notes
    let emailBody = "";
    
    // For current revision (not new), add the edited notes message
    if (notesForRevision?.isCurrentRevision && !notesForRevision?.isNewDrawing) {
      emailBody = "Edited notes from previous submission";
      if (notesText && notesText.trim()) {
        emailBody += "\n\n" + notesText;
      }
    } else if (notesText && notesText.trim()) {
      // For new drawings, just include the notes
      emailBody = notesText;
    }

    try {
      const response = await fetch(`${API_URL}/api/emails/send-drawings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          notes: emailBody,
          attachDrawings: shouldAttachDrawings,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to send drawings email");
      }

      const result = await response.json();
      alert("Drawings email sent successfully!");
      
      // Close modal after sending
      setShowNotesModal(false);
      setNotesForRevision(null);
      setNotesText("");
      setResendDrawings(false);
    } catch (error) {
      console.error("Error sending drawings email:", error);
      alert(`Failed to send drawings email: ${error.message}`);
    }
  }

  function handleCloseNotesModal() {
    setShowNotesModal(false);
    setNotesForRevision(null);
    setNotesText("");
    setResendDrawings(false);
    setMarkupFile(null);
    setIsDraggingMarkup(false);
  }

  // Markup PDF handlers
  function handleMarkupDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMarkup(true);
  }

  function handleMarkupDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMarkup(false);
  }

  function handleMarkupDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleMarkupDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMarkup(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setMarkupFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleMarkupFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setMarkupFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleMarkupBrowseClick() {
    markupInputRef.current?.click();
  }

  async function saveMarkupPath(file, revisionIndex) {
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

      // Get project year
      let projectYear = "";
      if (project.year) {
        const yearStr = project.year.toString();
        if (yearStr.includes("-")) {
          projectYear = yearStr.split("-")[0];
        } else {
          projectYear = yearStr;
        }
      } else {
        projectYear = new Date().getFullYear().toString();
      }
      
      // Get state (uppercase) - required for path construction
      const state = (project.state || "").toUpperCase();
      if (!state) {
        alert("Error: Project state is required to save markup path. Please set the state in Project Info.");
        return;
      }
      
      const suburb = (project.suburb || "").toUpperCase();
      const street = project.street || "";
      
      // Construct the file path: root_directory\year\state\suburb - street\1. DRAFTING\DESIGN NOTES\filename
      const fileName = file.name;
      const projectFolderName = `${suburb} - ${street}`.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = `${rootDirectory}\\${projectYear}\\${state}\\${projectFolderName}\\1. DRAFTING\\DESIGN NOTES\\${fileName}`;

      // Get current drawings history
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

      // Update the markup_pdf_location for the specific revision
      if (revisionIndex >= 0 && revisionIndex < drawingsHistory.length) {
        drawingsHistory[revisionIndex] = {
          ...drawingsHistory[revisionIndex],
          markup_pdf_location: filePath
        };
      } else {
        console.error("Invalid revision index for markup");
        return;
      }

      // Save updated history
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
          drawings_pdf_location: project?.drawings_pdf_location || null,
          drawings_history: JSON.stringify(drawingsHistory),
          drawings_viewed_date: project?.drawings_viewed_date || null,
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save markup path");
      }

      if (onUpdate) {
        onUpdate();
      }

      // Clear markup file after save
      setMarkupFile(null);
    } catch (error) {
      console.error("Error saving markup path:", error);
      alert(`Error saving markup path: ${error.message}`);
    }
  }

  async function handleSaveMarkup() {
    if (!markupFile || !notesForRevision) return;
    await saveMarkupPath(markupFile, notesForRevision.index);
  }

  async function handleSendDrawings() {
    if (!project || !project.drawings_pdf_location) {
      alert("No drawings PDF available to send.");
      return;
    }

    if (!project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/emails/send-drawings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to send drawings email");
      }

      const result = await response.json();
      alert("Drawings email sent successfully!");
    } catch (error) {
      console.error("Error sending drawings email:", error);
      alert(`Failed to send drawings email: ${error.message}`);
    }
  }

  function handleEmailClient() {
    // Get all active client emails
    const activeEmails = [];
    
    // Primary client email (always included if exists)
    if (project?.email && project.email.trim()) {
      activeEmails.push(project.email);
    }
    
    // Client1 if active
    if (project?.client1_active === 'true' && project?.client1_email && project.client1_email.trim()) {
      activeEmails.push(project.client1_email);
    }
    
    // Client2 if active
    if (project?.client2_active === 'true' && project?.client2_email && project.client2_email.trim()) {
      activeEmails.push(project.client2_email);
    }
    
    // Client3 if active
    if (project?.client3_active === 'true' && project?.client3_email && project.client3_email.trim()) {
      activeEmails.push(project.client3_email);
    }
    
    if (activeEmails.length === 0) {
      alert("No active client email addresses found for this project.");
      return;
    }

    // Reset modal state
    setEmailClientNotes("");
    setAttachDrawings(true);
    setShowEmailClientModal(true);
  }

  function handleCloseEmailClientModal() {
    setShowEmailClientModal(false);
    setEmailClientNotes("");
    setAttachDrawings(true);
  }

  async function handleSendEmailToClient() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    // Get all active client emails
    const activeEmails = [];
    
    // Primary client email (always included if exists)
    if (project?.email && project.email.trim()) {
      activeEmails.push(project.email);
    }
    
    // Client1 if active
    if (project?.client1_active === 'true' && project?.client1_email && project.client1_email.trim()) {
      activeEmails.push(project.client1_email);
    }
    
    // Client2 if active
    if (project?.client2_active === 'true' && project?.client2_email && project.client2_email.trim()) {
      activeEmails.push(project.client2_email);
    }
    
    // Client3 if active
    if (project?.client3_active === 'true' && project?.client3_email && project.client3_email.trim()) {
      activeEmails.push(project.client3_email);
    }
    
    if (activeEmails.length === 0) {
      alert("No active client email addresses found for this project.");
      return;
    }

    if (attachDrawings && !project.drawings_pdf_location) {
      alert("No drawings PDF available to attach.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/emails/send-drawings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          toEmails: activeEmails, // Send array of emails
          notes: emailClientNotes,
          attachDrawings: attachDrawings,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to send email");
      }

      const result = await response.json();
      const emailList = activeEmails.join(", ");
      alert(`Email sent successfully to ${emailList}!`);
      handleCloseEmailClientModal();
    } catch (error) {
      console.error("Error sending email:", error);
      alert(`Failed to send email: ${error.message}`);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Drawings
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "stretch" }}>
          {/* Columns 1, 2, 3 - Drawings History */}
          <div style={{ flex: "3", minWidth: "200px", display: "flex", flexDirection: "column" }}>
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
                  flex: 1,
                  minHeight: "550px",
                  overflowY: "auto",
                  overflowX: "hidden",
                  display: "flex",
                  flexDirection: "column",
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

                  return drawingsHistory.map((drawing, index) => {
                    // Determine background color based on approval status
                    let backgroundColor = WHITE;
                    if (drawing.workingDrawingsApproved) {
                      backgroundColor = "#e3f2fd"; // Light blue
                    } else if (drawing.conceptApproved) {
                      backgroundColor = "#e8f5e9"; // Light green
                    }

                    return (
                      <div
                        key={index}
                        style={{
                          padding: "12px",
                          marginBottom: index < drawingsHistory.length - 1 ? "12px" : "0",
                          borderBottom: index < drawingsHistory.length - 1 ? `1px solid ${SECTION_GREY}` : "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          flexWrap: "wrap",
                          backgroundColor: backgroundColor,
                          borderRadius: "4px",
                        }}
                      >
                        <div style={{ fontWeight: "500", color: MONUMENT, minWidth: "150px" }}>
                          {drawing.name}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                          Date: {drawing.date}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                          Time: {drawing.time}
                        </div>
                        {drawing.revision !== null && (
                          <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                            Revision: {drawing.revision}
                          </div>
                        )}
                        {drawing.markup_pdf_location && (
                          <button
                            onClick={() => {
                              // Open markup PDF in new tab
                              const markupUrl = `${API_URL}/api/files/markup/${project.id}/${index}`;
                              window.open(markupUrl, "_blank");
                            }}
                            style={{
                              background: WHITE,
                              color: MONUMENT,
                              border: `1px solid ${SECTION_GREY}`,
                              borderRadius: "6px",
                              padding: "4px 12px",
                              fontSize: "0.85rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.18s, color 0.15s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f0f0f0";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = WHITE;
                            }}
                          >
                            View Markup
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenNotesModal(index, drawing.revision, drawing.name)}
                          style={{
                            background: WHITE,
                            color: MONUMENT,
                            border: `1px solid ${SECTION_GREY}`,
                            borderRadius: "6px",
                            padding: "4px 12px",
                            fontSize: "0.85rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "background 0.18s, color 0.15s",
                            marginLeft: "auto",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#f0f0f0";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = WHITE;
                          }}
                        >
                          Drafting Notes
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Column 4 - Status, Buttons, and Drop Zone */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column" }}>
            {/* Status and Approval Buttons */}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "18px", alignItems: "flex-start", width: "fit-content", marginBottom: "24px" }}>
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
              {(() => {
                // Get drawings history to check if there are any drawings
                let drawingsHistory = [];
                try {
                  const historyValue = project?.drawings_history;
                  if (historyValue) {
                    drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
                  }
                } catch (e) {
                  console.error("Error parsing drawings_history:", e);
                }

                const hasDrawings = drawingsHistory && drawingsHistory.length > 0;
                
                // Check if concept has been approved
                const conceptApprovedIndex = drawingsHistory.findIndex(entry => entry.conceptApproved === true);
                const hasConceptApproved = conceptApprovedIndex !== -1;
                
                // Check if there are new drawings after concept approval
                // If concept is approved, we need new drawings after that entry to approve working drawings
                const hasNewDrawingsAfterConcept = hasConceptApproved && conceptApprovedIndex < drawingsHistory.length - 1;
                
                // Can approve working drawings if:
                // 1. There are drawings, AND
                // 2. Either concept hasn't been approved yet (can approve first time), OR
                // 3. Concept has been approved AND there are new drawings after the concept-approved entry
                const canApproveWorkingDrawings = hasDrawings && (!hasConceptApproved || hasNewDrawingsAfterConcept);

                return (
                  <>
                    <button
                      onClick={handleMarkConceptConfirmed}
                      disabled={!hasDrawings}
                      style={{
                        background: !hasDrawings ? "#e0e0e0" : WHITE,
                        color: !hasDrawings ? "#999" : MONUMENT,
                        border: `1px solid ${SECTION_GREY}`,
                        borderRadius: "10px",
                        padding: "8px 8px",
                        fontSize: "0.95rem",
                        fontWeight: 500,
                        textAlign: "center",
                        letterSpacing: "0.5px",
                        cursor: !hasDrawings ? "not-allowed" : "pointer",
                        transition: "background 0.18s, color 0.15s",
                        display: "block",
                        width: "100%",
                        opacity: !hasDrawings ? 0.6 : 1,
                      }}
                    >
                      Approve Concept
                    </button>
                    <button
                      onClick={handleMarkWorkingDrawingsConfirmed}
                      disabled={!canApproveWorkingDrawings}
                      style={{
                        background: !canApproveWorkingDrawings ? "#e0e0e0" : WHITE,
                        color: !canApproveWorkingDrawings ? "#999" : MONUMENT,
                        border: `1px solid ${SECTION_GREY}`,
                        borderRadius: "10px",
                        padding: "8px 8px",
                        fontSize: "0.95rem",
                        fontWeight: 500,
                        textAlign: "center",
                        letterSpacing: "0.5px",
                        cursor: !canApproveWorkingDrawings ? "not-allowed" : "pointer",
                        transition: "background 0.18s, color 0.15s",
                        display: "block",
                        width: "100%",
                        opacity: !canApproveWorkingDrawings ? 0.6 : 1,
                      }}
                    >
                      Approve Working Dwgs
                    </button>
                  </>
                );
              })()}
              <button
                onClick={handleClearDrawingData}
                style={{
                  background: "#ff6b6b",
                  color: WHITE,
                  border: `1px solid #ff6b6b`,
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
                  marginTop: "8px",
                }}
              >
                Clear Drawing Data
              </button>
              <button
                onClick={handleEmailClient}
                style={{
                  background: "#4D93D9",
                  color: WHITE,
                  border: `1px solid #4D93D9`,
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
                  marginTop: "8px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#3d7bc9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#4D93D9")}
              >
                Email Client
              </button>
            </div>

            {/* Drawings PDF Upload Drop Zone */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "24px" }}>
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
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
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
            </div>
          </div>
        </div>
      )}

      {/* Email Client Modal */}
      {showEmailClientModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseEmailClientModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
              Email Client
            </h3>
            {(() => {
              // Get all active client emails for display
              const activeEmails = [];
              const activeNames = [];
              
              // Primary client
              if (project?.email && project.email.trim()) {
                activeEmails.push(project.email);
                activeNames.push(project?.client_name || "Primary Client");
              }
              
              // Client1 if active
              if (project?.client1_active === 'true' && project?.client1_email && project.client1_email.trim()) {
                activeEmails.push(project.client1_email);
                activeNames.push(project?.client1_name || "Contact 1");
              }
              
              // Client2 if active
              if (project?.client2_active === 'true' && project?.client2_email && project.client2_email.trim()) {
                activeEmails.push(project.client2_email);
                activeNames.push(project?.client2_name || "Contact 2");
              }
              
              // Client3 if active
              if (project?.client3_active === 'true' && project?.client3_email && project.client3_email.trim()) {
                activeEmails.push(project.client3_email);
                activeNames.push(project?.client3_name || "Contact 3");
              }
              
              return (
                <div style={{ marginBottom: "16px", padding: "12px", background: "#f5f5f5", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: "500" }}>
                    Sending to:
                  </div>
                  {activeEmails.map((email, index) => (
                    <div key={index} style={{ fontSize: "0.85rem", color: MONUMENT, marginBottom: "4px" }}>
                      {activeNames[index]}: {email}
                    </div>
                  ))}
                </div>
              );
            })()}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500" }}>
                Notes (optional)
              </div>
              <textarea
                value={emailClientNotes}
                onChange={(e) => setEmailClientNotes(e.target.value)}
                placeholder="Enter any notes to include in the email..."
                style={{
                  width: "100%",
                  minHeight: "150px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "0.9rem",
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="checkbox"
                id="attachDrawings"
                checked={attachDrawings}
                onChange={(e) => setAttachDrawings(e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                }}
              />
              <label
                htmlFor="attachDrawings"
                style={{
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  cursor: "pointer",
                }}
              >
                Attach drawings PDF
              </label>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCloseEmailClientModal}
                style={{
                  background: SECTION_GREY,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#8a8a8c")}
                onMouseLeave={(e) => (e.currentTarget.style.background = SECTION_GREY)}
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmailToClient}
                style={{
                  background: "#4D93D9",
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#3d7bc9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#4D93D9")}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && notesForRevision && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleCloseNotesModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
              Drafting Notes for {notesForRevision.name}
              {notesForRevision.revision !== null ? ` - Rev ${notesForRevision.revision}` : " (Initial)"}
            </h3>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Enter notes for this drawing revision..."
              readOnly={!notesForRevision.isNewDrawing && !notesForRevision.isCurrentRevision}
              style={{
                width: "100%",
                minHeight: "200px",
                padding: "12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "0.9rem",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
                marginBottom: "16px",
                backgroundColor: (!notesForRevision.isNewDrawing && !notesForRevision.isCurrentRevision) ? "#f5f5f5" : WHITE,
                cursor: (!notesForRevision.isNewDrawing && !notesForRevision.isCurrentRevision) ? "not-allowed" : "text",
              }}
            />
            {/* Show Markup PDF drop zone only for new drawings */}
            {notesForRevision.isNewDrawing && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500" }}>
                  Markup PDF (optional)
                </div>
                <div
                  onDragEnter={handleMarkupDragEnter}
                  onDragOver={handleMarkupDragOver}
                  onDragLeave={handleMarkupDragLeave}
                  onDrop={handleMarkupDrop}
                  onClick={handleMarkupBrowseClick}
                  style={{
                    border: `2px dashed ${isDraggingMarkup ? "#4D93D9" : SECTION_GREY}`,
                    borderRadius: "8px",
                    padding: "20px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: isDraggingMarkup ? "#f0f7ff" : WHITE,
                    transition: "background 0.2s, border-color 0.2s",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: "80px",
                  }}
                >
                  {markupFile ? (
                    <div>
                      <div style={{ color: MONUMENT, fontWeight: "500", marginBottom: "4px" }}>
                        {markupFile.name}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                        Click to select a different file
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ color: MONUMENT, fontWeight: "500", marginBottom: "4px" }}>
                        Drag and drop markup PDF here
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                        or click to browse
                      </div>
                    </div>
                  )}
                  <input
                    ref={markupInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleMarkupFileSelect}
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            )}
            {/* Show Resend Drawings checkbox only for current revision (not new drawings) */}
            {notesForRevision.isCurrentRevision && !notesForRevision.isNewDrawing && (
              <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
                <input
                  type="checkbox"
                  id="resendDrawings"
                  checked={resendDrawings}
                  onChange={(e) => setResendDrawings(e.target.checked)}
                  style={{ width: "18px", height: "18px", cursor: "pointer", marginRight: "8px" }}
                />
                <label htmlFor="resendDrawings" style={{ fontSize: "0.9rem", color: MONUMENT, fontWeight: 500, cursor: "pointer" }}>
                  Resend Drawings
                </label>
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              {/* Show Send Drawings and Cancel for new drawings or current revision */}
              {(notesForRevision.isNewDrawing || notesForRevision.isCurrentRevision) && (
                <>
                  <button
                    onClick={handleSendDrawingsWithNotes}
                    style={{
                      background: "#4D93D9",
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#3d7bc9")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#4D93D9")}
                  >
                    Send Drawings
                  </button>
                  <button
                    onClick={handleCloseNotesModal}
                    style={{
                      background: SECTION_GREY,
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#8a8a8c")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = SECTION_GREY)}
                  >
                    Cancel
                  </button>
                </>
              )}
              {/* Show only Close for previous revisions */}
              {!notesForRevision.isNewDrawing && !notesForRevision.isCurrentRevision && (
                <button
                  onClick={handleCloseNotesModal}
                  style={{
                    background: SECTION_GREY,
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#8a8a8c")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = SECTION_GREY)}
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
