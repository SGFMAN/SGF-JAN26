import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const COLOURS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];

export default function Colours({ project, onUpdate }) {
  const [coloursStatus, setColoursStatus] = useState(project?.colours_status || "Not Sent");
  const [notes, setNotes] = useState(project?.colours_notes || "");
  const [showSendModal, setShowSendModal] = useState(false);
  const [attachAffordable, setAttachAffordable] = useState(false);
  const [attachSuperior, setAttachSuperior] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendAbortController, setSendAbortController] = useState(null);
  const [sendProgress, setSendProgress] = useState(0);
  const progressIntervalRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [emailBody, setEmailBody] = useState("");
  const [emailTemplateType, setEmailTemplateType] = useState("Send");
  
  const valuesRef = useRef({ coloursStatus, notes });
  
  useEffect(() => {
    valuesRef.current = { coloursStatus, notes };
  }, [coloursStatus, notes]);

  useEffect(() => {
    if (project) {
      setColoursStatus(project.colours_status || "Not Sent");
      setNotes(project.colours_notes || "");
      
      // Set default checkboxes based on specs
      const specs = project.specs || "";
      if (specs.toLowerCase().includes("affordable")) {
        setAttachAffordable(true);
        setAttachSuperior(false);
      } else if (specs.toLowerCase().includes("superior")) {
        setAttachAffordable(false);
        setAttachSuperior(true);
      } else {
        // Default to both unchecked if specs don't match
        setAttachAffordable(false);
        setAttachSuperior(false);
      }
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
        drawings_status: project?.drawings_status || null,
        colours_status: fieldName === "colours_status" ? (value === "" ? null : value) : currentValues.coloursStatus,
        colours_notes: fieldName === "colours_notes" ? (value === "" ? null : value) : currentValues.notes,
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

  async function handleColoursStatusChange(e) {
    const newStatus = e.target.value;
    setColoursStatus(newStatus);
    valuesRef.current.coloursStatus = newStatus;
    await saveField("colours_status", newStatus);
  }

  function handleNotesChange(e) {
    const newNotes = e.target.value;
    setNotes(newNotes);
    valuesRef.current.notes = newNotes;
  }

  async function handleNotesBlur() {
    await saveField("colours_notes", valuesRef.current.notes);
  }

  async function loadEmailTemplate(templateType) {
    // Fetch template and replace tokens
    try {
      const response = await fetch(`${API_URL}/api/email-templates`);
      if (response.ok) {
        const templates = await response.json();
        let templateName = "";
        if (templateType === "Send") {
          templateName = "COLOURS - Send";
        } else if (templateType === "Remind") {
          templateName = "COLOURS - Remind";
        } else if (templateType === "WindowsRoof") {
          templateName = "COLORS - Windows&Roof";
        }
        const template = templates.find(t => t.name === templateName);
        if (template && template.body) {
          // Replace tokens in body
          let body = template.body;
          const suburb = (project?.suburb || "").toUpperCase();
          const street = project?.street || "";
          
          // Get active client names (first names only)
          const activeClients = getActiveClients();
          const activeClientFirstNames = activeClients
            .map(client => {
              if (client.name && client.name.trim()) {
                return client.name.trim().split(/\s+/)[0]; // Get first word
              }
              return null;
            })
            .filter(name => name);
          
          // Format client first names with commas and "&"
          let clientName = "";
          if (activeClientFirstNames.length === 0) {
            clientName = "";
          } else if (activeClientFirstNames.length === 1) {
            clientName = activeClientFirstNames[0];
          } else if (activeClientFirstNames.length === 2) {
            clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
          } else {
            const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
            const last = activeClientFirstNames[activeClientFirstNames.length - 1];
            clientName = `${allButLast} & ${last}`;
          }
          
          // Format project name: "<Street>, <Suburb>"
          const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
          
          // Replace tokens
          body = body.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName);
          
          setEmailBody(body);
        } else {
          setEmailBody("");
        }
      }
    } catch (error) {
      console.error("Error fetching email template:", error);
      setEmailBody("");
    }
  }

  async function handleOpenSendModal() {
    setShowSendModal(true);
    setEmailTemplateType("Send");
    await loadEmailTemplate("Send");
  }

  function handleCloseSendModal() {
    setShowSendModal(false);
    setEmailBody("");
  }

  async function handleTemplateTypeChange(e) {
    const newType = e.target.value;
    setEmailTemplateType(newType);
    await loadEmailTemplate(newType);
  }

  // Format date and time for display
  function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return "Not sent";
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

  // Calculate days since sent
  function getDaysSinceSent(dateTimeStr) {
    if (!dateTimeStr) return null;
    try {
      const sentDate = new Date(dateTimeStr);
      const now = new Date();
      const diffTime = now - sentDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch (e) {
      return null;
    }
  }

  async function handleSendReminderToClient() {
    if (!project?.id) {
      alert("Error: No project selected");
      return;
    }

    const activeClients = getActiveClients();
    if (activeClients.length === 0) {
      alert("No active clients selected. Please select at least one client in Client Info.");
      return;
    }

    if (!attachAffordable && !attachSuperior) {
      alert("Please select at least one attachment (Affordable or Superior).");
      return;
    }

    // Get active client emails
    const toEmails = activeClients
      .map(client => client.email)
      .filter(email => email && email.trim());

    if (toEmails.length === 0) {
      alert("No valid email addresses found for active clients.");
      return;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    setSendAbortController(abortController);
    setIsSending(true);
    setSendProgress(0);

    // Simulate progress (since we can't get actual upload progress from fetch)
    progressIntervalRef.current = setInterval(() => {
      setSendProgress((prev) => {
        if (prev >= 90) return 90; // Cap at 90% until response
        return prev + Math.random() * 10; // Increment by 0-10%
      });
    }, 200); // Update every 200ms

    try {
      const response = await fetch(`${API_URL}/api/emails/send-colours-reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          attachAffordable: attachAffordable,
          attachSuperior: attachSuperior,
          toEmails: toEmails,
        }),
        signal: abortController.signal,
      });

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setSendProgress(100);

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        const errorText = await response.text().catch(() => response.statusText);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        alert(`Error sending email: ${errorText || response.statusText}`);
        console.error("Error response:", errorText);
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        return;
      }

      if (!response.ok) {
        const errorMessage = data.error || data.message || response.statusText;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        alert(`Error sending email: ${errorMessage}`);
        console.error("Error details:", data);
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        return;
      }

      // Small delay to show 100% before closing
      setTimeout(() => {
        alert("Colours reminder email sent successfully!");
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        handleCloseSendReminderModal();
        
        // Refresh project data to get updated colours_reminder_sent_date
        setTimeout(() => {
          if (onUpdate) {
            onUpdate();
          }
        }, 500);
      }, 300);
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (error.name === 'AbortError') {
        console.log("Email send cancelled by user");
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        return;
      }
      console.error("Error sending colours reminder email:", error);
      alert(`Failed to send email: ${error.message}`);
      setIsSending(false);
      setSendProgress(0);
      setSendAbortController(null);
    }
  }

  async function handleSendToClient() {
    if (!project?.id) {
      alert("Error: No project selected");
      return;
    }

    const activeClients = getActiveClients();
    if (activeClients.length === 0) {
      alert("No active clients selected. Please select at least one client in Client Info.");
      return;
    }

    if (!attachAffordable && !attachSuperior) {
      alert("Please select at least one attachment (Affordable or Superior).");
      return;
    }

    // Get active client emails
    const toEmails = activeClients
      .map(client => client.email)
      .filter(email => email && email.trim());

    if (toEmails.length === 0) {
      alert("No valid email addresses found for active clients.");
      return;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    setSendAbortController(abortController);
    setIsSending(true);
    setSendProgress(0);

    // Simulate progress (since we can't get actual upload progress from fetch)
    progressIntervalRef.current = setInterval(() => {
      setSendProgress((prev) => {
        if (prev >= 90) return 90; // Cap at 90% until response
        return prev + Math.random() * 10; // Increment by 0-10%
      });
    }, 200); // Update every 200ms

    try {
      // Use the appropriate endpoint based on template type
      let endpoint = "";
      if (emailTemplateType === "Send") {
        endpoint = `${API_URL}/api/emails/send-colours`;
      } else if (emailTemplateType === "Remind") {
        endpoint = `${API_URL}/api/emails/send-colours-reminder`;
      } else if (emailTemplateType === "WindowsRoof") {
        endpoint = `${API_URL}/api/emails/send-colours-windows-roof`;
      }
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: project.id,
          attachAffordable: attachAffordable,
          attachSuperior: attachSuperior,
          toEmails: toEmails,
          customBody: emailBody || null,
        }),
        signal: abortController.signal,
      });

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setSendProgress(100);

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        const errorText = await response.text().catch(() => response.statusText);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        alert(`Error sending email: ${errorText || response.statusText}`);
        console.error("Error response:", errorText);
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        return;
      }

      if (!response.ok) {
        const errorMessage = data.error || data.message || response.statusText;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        alert(`Error sending email: ${errorMessage}`);
        console.error("Error details:", data);
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        return;
      }

      // Small delay to show 100% before closing
      setTimeout(() => {
        let message = "";
        if (emailTemplateType === "Send") {
          message = "Colours email sent successfully!";
        } else if (emailTemplateType === "Remind") {
          message = "Colours reminder email sent successfully!";
        } else if (emailTemplateType === "WindowsRoof") {
          message = "Windows & Roof email sent successfully!";
        }
        alert(message);
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        handleCloseSendModal();
        
        // Update the colours status to "Sent" only for Send type
        if (emailTemplateType === "Send" && coloursStatus === "Not Sent") {
          saveField("colours_status", "Sent");
        }
        
        // Refresh project data to get updated colours_sent_date or colours_reminder_sent_date
        setTimeout(() => {
          if (onUpdate) {
            onUpdate();
          }
        }, 500);
      }, 300);
    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (error.name === 'AbortError') {
        console.log("Email send cancelled by user");
        setIsSending(false);
        setSendProgress(0);
        setSendAbortController(null);
        return;
      }
      console.error("Error sending colours email:", error);
      alert(`Failed to send email: ${error.message}`);
      setIsSending(false);
      setSendProgress(0);
      setSendAbortController(null);
    }
  }

  function handleCancelSend() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (sendAbortController) {
      sendAbortController.abort();
      setSendAbortController(null);
      setIsSending(false);
      setSendProgress(0);
    }
  }

  function getActiveClients() {
    const activeClients = [];
    
    if (project?.client1_active === true || project?.client1_active === 'true') {
      if (project?.client1_name || project?.client1_email) {
        activeClients.push({
          name: project.client1_name || "",
          email: project.client1_email || "",
        });
      }
    }
    
    if (project?.client2_active === true || project?.client2_active === 'true') {
      if (project?.client2_name || project?.client2_email) {
        activeClients.push({
          name: project.client2_name || "",
          email: project.client2_email || "",
        });
      }
    }
    
    if (project?.client3_active === true || project?.client3_active === 'true') {
      if (project?.client3_name || project?.client3_email) {
        activeClients.push({
          name: project.client3_name || "",
          email: project.client3_email || "",
        });
      }
    }
    
    return activeClients;
  }

  async function saveColoursPath(file) {
    if (!project?.id) {
      alert("Error: No project selected");
      return;
    }

    try {
      // Get project folder path from settings
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const rootDirectory = project.state === "VIC" ? (settings.root_directory || "") : (settings.root_directory_qld || "");
      
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
        alert("Error: Project state is required to save colours path. Please set the state in Project Info.");
        return;
      }
      
      const suburb = (project.suburb || "").toUpperCase();
      const street = project.street || "";
      
      // Construct the file path with "8. COLOURS & WINDOWS" subfolder
      // Format: root_directory\year\state\suburb - street\8. COLOURS & WINDOWS\filename
      // NOTE: This function ONLY saves the path to the database - it does NOT create folders or copy files
      const fileName = file.name;
      const projectFolderName = `${suburb} - ${street}`.replace(/[<>:"/\\|?*]/g, '_');
      const filePath = `${rootDirectory}\\${projectYear}\\${state}\\${projectFolderName}\\8. COLOURS & WINDOWS\\${fileName}`;

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
          drawings_pdf_location: project?.drawings_pdf_location || null,
          drawings_history: project?.drawings_history || null,
          drawings_viewed_date: project?.drawings_viewed_date || null,
          colours_status: project?.colours_status || null,
          colours_notes: project?.colours_notes || null,
          colours_pdf_location: filePath,
          colours_sent_date: project?.colours_sent_date || null,
          colours_reminder_sent_date: project?.colours_reminder_sent_date || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save colours path");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      // Clear selected file after save
      setSelectedFile(null);
      
      alert(`Colours PDF path saved:\n\n${filePath}`);
    } catch (error) {
      console.error("Error saving colours path:", error);
      alert(`Error saving colours path: ${error.message}`);
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
        await saveColoursPath(file);
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
        await saveColoursPath(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

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

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  function handleShowColours() {
    if (!project?.id || !project?.colours_pdf_location) {
      alert("No colours PDF available");
      return;
    }
    const pdfUrl = `${API_URL}/api/files/colours/${project.id}`;
    window.open(pdfUrl, "_blank");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Colours
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap", flex: 1, minHeight: 0 }}>
          {/* Column 1 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Status
              </div>
              <select
                name="coloursStatus"
                value={coloursStatus}
                onChange={handleColoursStatusChange}
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
                {COLOURS_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <button
                  type="button"
                  onClick={handleOpenSendModal}
                  style={{
                    background: MONUMENT,
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1b")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                >
                  Email Client
                </button>
                <div style={{ flex: 1, padding: "10px 12px", fontSize: "0.9rem", color: MONUMENT, display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>{project?.colours_sent_date ? formatDateTime(project.colours_sent_date) : "Not sent"}</span>
                  {project?.colours_sent_date && (() => {
                    const daysSince = getDaysSinceSent(project.colours_sent_date);
                    return daysSince !== null ? (
                      <span style={{ color: SECTION_GREY, fontSize: "0.85rem" }}>
                        ({daysSince} {daysSince === 1 ? "day" : "days"} ago)
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Column 2 */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500" }}>
                Colours PDF
              </div>
              
              {/* Drop Zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={handleBrowseClick}
                style={{
                  border: `2px dashed ${isDragging ? "#4D93D9" : SECTION_GREY}`,
                  borderRadius: "8px",
                  padding: "40px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragging ? "#f0f7ff" : WHITE,
                  transition: "background 0.2s, border-color 0.2s",
                  minHeight: "150px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                }}
              >
                <div style={{ fontSize: "1rem", color: MONUMENT, fontWeight: 500 }}>
                  Drag and drop PDF file here
                </div>
                <div style={{ fontSize: "0.85rem", color: "#32323399" }}>
                  or click to browse
                </div>
                {selectedFile && (
                  <div style={{ fontSize: "0.9rem", color: MONUMENT, marginTop: "8px" }}>
                    Selected: {selectedFile.name}
                  </div>
                )}
              </div>

              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />

              {/* Show Colours button */}
              {project?.colours_pdf_location && (
                <button
                  type="button"
                  onClick={handleShowColours}
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    background: MONUMENT,
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1b")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                >
                  Show Colours
                </button>
              )}
            </div>
          </div>

          {/* Column 3 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            {/* Placeholder for future content */}
          </div>

          {/* Column 4 - Notes */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", flexShrink: 0 }}>
              Notes
            </div>
            <textarea
              name="colours_notes"
              value={notes}
              onChange={handleNotesChange}
              onBlur={handleNotesBlur}
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

      {/* Send Colours Modal */}
      {showSendModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: isSending ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            pointerEvents: "auto",
          }}
          onClick={isSending ? undefined : handleCloseSendModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "95vh",
              height: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
              pointerEvents: isSending ? "none" : "auto",
              opacity: isSending ? 0.6 : 1,
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Email Client
            </h3>

            {/* Recipients and Attachments Side by Side */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
              {/* Recipients Section */}
              <div style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>
                  Recipients
                </div>
                {getActiveClients().length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {getActiveClients().map((client, index) => (
                      <div
                        key={index}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          background: SECTION_GREY,
                          fontSize: "0.85rem",
                          color: MONUMENT,
                        }}
                      >
                        <div style={{ fontWeight: 500, marginBottom: "2px", fontSize: "0.85rem" }}>
                          {client.name || "No name"}
                        </div>
                        <div style={{ color: "#32323399", fontSize: "0.8rem" }}>
                          {client.email || "No email"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#32323399", fontSize: "0.85rem", fontStyle: "italic" }}>
                    No active clients selected in Client Info
                  </div>
                )}
              </div>

              {/* Attachments Section */}
              <div style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>
                  Attachments
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "1rem",
                      color: MONUMENT,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={attachAffordable}
                      onChange={(e) => setAttachAffordable(e.target.checked)}
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    Attach Affordable
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "1rem",
                      color: MONUMENT,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={attachSuperior}
                      onChange={(e) => setAttachSuperior(e.target.checked)}
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    Attach Superior
                  </label>
                </div>
              </div>
            </div>

            {/* Email Template Type Dropdown */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>
                Email Type
              </div>
              <select
                value={emailTemplateType}
                onChange={handleTemplateTypeChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  color: MONUMENT,
                  background: WHITE,
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <option value="Send">Send Colours</option>
                <option value="Remind">Send Reminder</option>
                <option value="WindowsRoof">Windows & Roof</option>
              </select>
            </div>

            {/* Email Body Section */}
            <div style={{ marginBottom: "24px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "12px", fontWeight: 500 }}>
                Email Body
              </div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                style={{
                  width: "100%",
                  flex: 1,
                  minHeight: "300px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  color: MONUMENT,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
                placeholder="Email body will be loaded from template..."
              />
            </div>

            {/* Progress Bar Overlay - Only shown when sending */}
            {isSending && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(255, 255, 255, 0.9)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "12px",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                <div style={{ width: "80%", maxWidth: "400px" }}>
                  <div
                    style={{
                      fontSize: "1rem",
                      color: MONUMENT,
                      marginBottom: "16px",
                      textAlign: "center",
                      fontWeight: 500,
                    }}
                  >
                    Sending email... {Math.round(sendProgress)}%
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "24px",
                      background: SECTION_GREY,
                      borderRadius: "12px",
                      overflow: "hidden",
                      marginBottom: "24px",
                    }}
                  >
                    <div
                      style={{
                        width: `${sendProgress}%`,
                        height: "100%",
                        background: MONUMENT,
                        transition: "width 0.2s ease-out",
                        borderRadius: "12px",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px", position: "relative", zIndex: 20 }}>
              {isSending ? (
                <button
                  type="button"
                  onClick={handleCancelSend}
                  style={{
                    background: SECTION_GREY,
                    color: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                    pointerEvents: "auto",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#8a8a8c")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = SECTION_GREY)}
                >
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCloseSendModal}
                    style={{
                      background: SECTION_GREY,
                      color: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "1rem",
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
                    type="button"
                    onClick={handleSendToClient}
                    disabled={isSending}
                    style={{
                      background: MONUMENT,
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      cursor: isSending ? "not-allowed" : "pointer",
                      opacity: isSending ? 0.6 : 1,
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSending) e.currentTarget.style.background = "#1a1a1b";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSending) e.currentTarget.style.background = MONUMENT;
                    }}
                  >
                    Send to Client
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Removed Send Reminder Modal - now combined with Send Colours Modal */}
      {false && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: isSending ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            pointerEvents: "auto",
          }}
          onClick={isSending ? undefined : handleCloseSendReminderModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
              pointerEvents: isSending ? "none" : "auto",
              opacity: isSending ? 0.6 : 1,
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Send Reminder
            </h3>

            {/* Recipients and Attachments Side by Side */}
            <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
              {/* Recipients Section */}
              <div style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>
                  Recipients
                </div>
                {getActiveClients().length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {getActiveClients().map((client, index) => (
                      <div
                        key={index}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          background: SECTION_GREY,
                          fontSize: "0.85rem",
                          color: MONUMENT,
                        }}
                      >
                        <div style={{ fontWeight: 500, marginBottom: "2px", fontSize: "0.85rem" }}>
                          {client.name || "No name"}
                        </div>
                        <div style={{ color: "#32323399", fontSize: "0.8rem" }}>
                          {client.email || "No email"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#32323399", fontSize: "0.85rem", fontStyle: "italic" }}>
                    No active clients selected in Client Info
                  </div>
                )}
              </div>

              {/* Attachments Section */}
              <div style={{ flex: 1, marginBottom: 0 }}>
                <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>
                  Attachments
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "1rem",
                      color: MONUMENT,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={attachAffordable}
                      onChange={(e) => setAttachAffordable(e.target.checked)}
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    Attach Affordable
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "1rem",
                      color: MONUMENT,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={attachSuperior}
                      onChange={(e) => setAttachSuperior(e.target.checked)}
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                    />
                    Attach Superior
                  </label>
                </div>
              </div>
            </div>

            {/* Email Body Section */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "12px", fontWeight: 500 }}>
                Email Body
              </div>
              <textarea
                value={reminderEmailBody}
                onChange={(e) => setReminderEmailBody(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "200px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "0.95rem",
                  fontFamily: "inherit",
                  color: MONUMENT,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
                placeholder="Email body will be loaded from template..."
              />
            </div>

            {/* Progress Bar Overlay - Only shown when sending */}
            {isSending && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(255, 255, 255, 0.9)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "12px",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                <div style={{ width: "80%", maxWidth: "400px" }}>
                  <div
                    style={{
                      fontSize: "1rem",
                      color: MONUMENT,
                      marginBottom: "16px",
                      textAlign: "center",
                      fontWeight: 500,
                    }}
                  >
                    Sending email... {Math.round(sendProgress)}%
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: "24px",
                      background: SECTION_GREY,
                      borderRadius: "12px",
                      overflow: "hidden",
                      marginBottom: "24px",
                    }}
                  >
                    <div
                      style={{
                        width: `${sendProgress}%`,
                        height: "100%",
                        background: MONUMENT,
                        transition: "width 0.2s ease-out",
                        borderRadius: "12px",
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelSend}
                    style={{
                      background: MONUMENT,
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      width: "100%",
                      pointerEvents: "auto",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px" }}>
              <button
                type="button"
                onClick={handleCloseSendReminderModal}
                disabled={isSending}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSending ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                  opacity: isSending ? 0.6 : 1,
                }}
                onMouseEnter={(e) => !isSending && (e.currentTarget.style.background = "#8a8a8c")}
                onMouseLeave={(e) => !isSending && (e.currentTarget.style.background = SECTION_GREY)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReminderToClient}
                disabled={isSending}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isSending ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                  opacity: isSending ? 0.6 : 1,
                }}
                onMouseEnter={(e) => !isSending && (e.currentTarget.style.background = "#1a1a1b")}
                onMouseLeave={(e) => !isSending && (e.currentTarget.style.background = MONUMENT)}
              >
                Send to Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
