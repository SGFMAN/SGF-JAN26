import React, { useState, useEffect, useMemo, useRef } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import TracePlanModal from "../components/TracePlanModal";
import Building3DModal from "../components/Building3DModal.jsx";
import BuildingElevations from "../components/BuildingElevations.jsx";
import { resolveNewProjectClientFrom, findSalespersonUserInList } from "../utils/streamNewProjectEmail";
import { buildJobFolderNameSegment } from "../utils/projectFolderPath";
import { parsePlanTracePolygon, serializePlanTracePolygon } from "../utils/planTracePolygon";

import { UI, MENU } from "../utils/uiThemeTokens.js";
import { streamColorHover } from "../utils/streamColors.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
import { isUserAdmin } from "../utils/auth";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const EMAIL_CLIENT_BUTTON_ID = 3;
const TRACE_PLAN_BUTTON_ID = 4;
const VISUALISER_3D_BUTTON_ID = 5;
const API_URL = "";

function mergeColoursButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved } : fallback;
}

const COLOURS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];
const COLOUR_OPTIONS = ["Select", ...COLORBOND_COLOURS.map((c) => c.name)];
const ROOF_STYLE_OPTIONS = ["Select", "Affordable", "Superior", "Skillion"];
const COLOUR_PAGE_CATEGORIES = ["External", "Flooring", "Kitchen", "Bathroom", "Bedrooms"];
const COLOURS_CATEGORY_FIT_WIDTH = `calc(${Math.max(...COLOUR_PAGE_CATEGORIES.map((s) => s.length))}ch + 28px)`;
const COLOURS_ROOF_STYLE_FIT_WIDTH = `calc(${Math.max(...ROOF_STYLE_OPTIONS.map((s) => s.length))}ch + 28px)`;
const COLOURS_LEFT_COLUMN_WIDTH = "200px";
const COLOURS_FIELD_SELECT_STYLE = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: FIELD_OUTLINE,
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
  minHeight: "42px",
};

function colourOrSelect(value) {
  return value && String(value).trim() ? String(value).trim() : "Select";
}

function colourForSave(value) {
  return value === "Select" || value == null || value === "" ? null : value;
}

export default function Colours({ project, onUpdate }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [coloursStatus, setColoursStatus] = useState(project?.colours_status || "Not Sent");
  const [activeColourCategory, setActiveColourCategory] = useState("External");
  const [notes, setNotes] = useState(project?.colours_notes || "");
  const [roofColour, setRoofColour] = useState(colourOrSelect(project?.roof_colour));
  const [claddingColour, setCladdingColour] = useState(colourOrSelect(project?.cladding_colour));
  const [baseboardsColour, setBaseboardsColour] = useState(colourOrSelect(project?.baseboards_colour));
  const [roofStyle, setRoofStyle] = useState(colourOrSelect(project?.roof_style));
  const [windowFramesColour, setWindowFramesColour] = useState(
    colourOrSelect(project?.windowframes_colour ?? project?.window_frames_colour)
  );
  const [windowSurroundsColour, setWindowSurroundsColour] = useState(
    colourOrSelect(project?.windowsurrounds_colour ?? project?.window_surrounds_colour)
  );
  const [doorColour, setDoorColour] = useState(
    colourOrSelect(project?.door_colour ?? project?.front_door_colour)
  );
  const [colourSaveStatus, setColourSaveStatus] = useState(""); // "", "saving", "saved", "error"
  const colourSaveStatusTimerRef = useRef(null);
  const colourEditGenRef = useRef(0);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTracePlanModal, setShowTracePlanModal] = useState(false);
  const [showBuilding3DModal, setShowBuilding3DModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const planTrace = useMemo(
    () => parsePlanTracePolygon(project?.colours_plan_trace_polygon),
    [project?.colours_plan_trace_polygon]
  );
  const planTraceFootprintPoints = planTrace.points;
  const planTraceRoofPoints = planTrace.roofPoints;
  const planTraceDeckPoints = planTrace.deckPoints;
  const planTraceWindows = planTrace.windows;
  const planTraceDoors = planTrace.doors;
  const planTraceSlidingDoors = planTrace.slidingDoors;
  const planTraceCalibration = planTrace.calibration;
  const [attachAffordable, setAttachAffordable] = useState(false);
  const [attachSuperior, setAttachSuperior] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [emailBody, setEmailBody] = useState("");
  const [emailTemplateType, setEmailTemplateType] = useState("Send");
  const [emailTo, setEmailTo] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const emailBodyRef = useRef(null);
  const [, setUiButtonStyleRevision] = useState(0);

  const valuesRef = useRef({
    coloursStatus,
    notes,
    roofColour,
    claddingColour,
    baseboardsColour,
    roofStyle,
    windowFramesColour,
    windowSurroundsColour,
    doorColour,
  });
  
  useEffect(() => {
    valuesRef.current = {
      coloursStatus,
      notes,
      roofColour,
      claddingColour,
      baseboardsColour,
      roofStyle,
      windowFramesColour,
      windowSurroundsColour,
      doorColour,
    };
  }, [
    coloursStatus,
    notes,
    roofColour,
    claddingColour,
    baseboardsColour,
    roofStyle,
    windowFramesColour,
    windowSurroundsColour,
    doorColour,
  ]);

  useEffect(() => {
    if (!project) return;
    setColoursStatus(project.colours_status || "Not Sent");
    setNotes(project.colours_notes || "");
    setRoofColour(colourOrSelect(project.roof_colour));
    setCladdingColour(colourOrSelect(project.cladding_colour));
    setBaseboardsColour(colourOrSelect(project.baseboards_colour));
    setRoofStyle(colourOrSelect(project.roof_style));
    setWindowFramesColour(
      colourOrSelect(project.windowframes_colour ?? project.window_frames_colour)
    );
    setWindowSurroundsColour(
      colourOrSelect(project.windowsurrounds_colour ?? project.window_surrounds_colour)
    );
    setDoorColour(colourOrSelect(project.door_colour ?? project.front_door_colour));
    const specs = project.specs || "";
    if (specs.toLowerCase().includes("affordable")) {
      setAttachAffordable(true);
      setAttachSuperior(false);
    } else if (specs.toLowerCase().includes("superior")) {
      setAttachAffordable(false);
      setAttachSuperior(true);
    } else {
      setAttachAffordable(false);
      setAttachSuperior(false);
    }
  }, [project?.id]);

  // Always reload colours from the API when this tab mounts so leave/return
  // is not stuck with a stale parent `project` object.
  useEffect(() => {
    const key = project?.access_token || project?.id;
    if (!key) return undefined;
    let cancelled = false;
    const genAtStart = colourEditGenRef.current;

    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/projects/${key}`);
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled || colourEditGenRef.current !== genAtStart) return;
        setRoofColour(colourOrSelect(data.roof_colour));
        setCladdingColour(colourOrSelect(data.cladding_colour));
        setBaseboardsColour(colourOrSelect(data.baseboards_colour));
        setRoofStyle(colourOrSelect(data.roof_style));
        setWindowFramesColour(
          colourOrSelect(data.windowframes_colour ?? data.window_frames_colour)
        );
        setWindowSurroundsColour(
          colourOrSelect(data.windowsurrounds_colour ?? data.window_surrounds_colour)
        );
        setDoorColour(colourOrSelect(data.door_colour ?? data.front_door_colour));
      } catch (error) {
        console.error("Failed to load saved colours:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.id, project?.access_token]);

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  useEffect(() => {
    return () => {
      if (colourSaveStatusTimerRef.current) {
        clearTimeout(colourSaveStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  // Update contentEditable when emailBody changes and modal is open
  useEffect(() => {
    if (showSendModal && emailBodyRef.current && emailBody) {
      // Only update if content is different to avoid cursor jumping
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [showSendModal, emailBody]);

  async function saveField(fieldName, value, shouldUpdate = true) {
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
        if (onUpdate && shouldUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  async function saveAllFields() {
    await saveField("colours_notes", valuesRef.current.notes);
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

  async function saveExternalColourField(fieldName, value) {
    const projectKey = project?.access_token || project?.id;
    if (!projectKey) {
      console.error("Cannot save colours: no project ID");
      return;
    }

    if (colourSaveStatusTimerRef.current) {
      clearTimeout(colourSaveStatusTimerRef.current);
      colourSaveStatusTimerRef.current = null;
    }
    setColourSaveStatus("saving");

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectKey}/update-colours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [fieldName]: colourForSave(value),
        }),
        keepalive: true,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save colours");
      }

      // Do not call onUpdate here: a parent refetch mid-edit can wipe other fields.
      // ProjectPage refetches when re-opening the Colours tab.

      setColourSaveStatus("saved");
      colourSaveStatusTimerRef.current = setTimeout(() => {
        setColourSaveStatus("");
        colourSaveStatusTimerRef.current = null;
      }, 1500);
    } catch (error) {
      console.error("Error saving colours:", error);
      setColourSaveStatus("error");
      colourSaveStatusTimerRef.current = setTimeout(() => {
        setColourSaveStatus("");
        colourSaveStatusTimerRef.current = null;
      }, 4000);
    }
  }

  async function handleRoofColourChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setRoofColour(newValue);
    valuesRef.current.roofColour = newValue;
    await saveExternalColourField("roof_colour", newValue);
  }

  async function handleCladdingColourChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setCladdingColour(newValue);
    valuesRef.current.claddingColour = newValue;
    await saveExternalColourField("cladding_colour", newValue);
  }

  async function handleBaseboardsColourChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setBaseboardsColour(newValue);
    valuesRef.current.baseboardsColour = newValue;
    await saveExternalColourField("baseboards_colour", newValue);
  }

  async function handleRoofStyleChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setRoofStyle(newValue);
    valuesRef.current.roofStyle = newValue;
    await saveExternalColourField("roof_style", newValue);
  }

  async function handleWindowFramesColourChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setWindowFramesColour(newValue);
    valuesRef.current.windowFramesColour = newValue;
    await saveExternalColourField("windowframes_colour", newValue);
  }

  async function handleWindowSurroundsColourChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setWindowSurroundsColour(newValue);
    valuesRef.current.windowSurroundsColour = newValue;
    await saveExternalColourField("windowsurrounds_colour", newValue);
  }

  async function handleDoorColourChange(e) {
    const newValue = e.target.value;
    colourEditGenRef.current += 1;
    setDoorColour(newValue);
    valuesRef.current.doorColour = newValue;
    await saveExternalColourField("door_colour", newValue);
  }

  async function loadEmailTemplate(templateType) {
    // Fetch template and replace tokens
    try {
      const [response, settingsResponse, usersResponse] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/users`),
      ]);
      if (response.ok) {
        const templates = await response.json();
        const settings = settingsResponse.ok ? await settingsResponse.json() : {};
        const users = usersResponse.ok ? await usersResponse.json() : [];
        const salespersonUser = findSalespersonUserInList(users, project?.salesperson);
        let templateName = "";
        if (templateType === "Send") {
          templateName = "COLOURS - Send";
        } else if (templateType === "Remind") {
          templateName = "COLOURS - Remind";
        } else if (templateType === "WindowsRoof") {
          templateName = "COLORS - Windows&Roof";
        }
        const template = templates.find(t => t.name === templateName);
        if (template) {
          // Get active client emails for "To" field
          const activeClients = getActiveClients();
          const activeClientEmails = activeClients
            .map(client => client.email)
            .filter(email => email && email.trim());
          const toAddresses = activeClientEmails.join(", ");
          
          // Set To, From, Subject from template
          setEmailTo(toAddresses);
          setEmailFrom(resolveNewProjectClientFrom(settings, project, salespersonUser));
          
          // Replace tokens in subject
          let subject = template.subject || "";
          const suburb = (project?.suburb || "").toUpperCase();
          const street = project?.street || "";
          
          // Get active client names (first names only)
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
          
          // Get colour consultant names
          let colourConsultantName = "";
          try {
            const usersResponse = await fetch(`${API_URL}/api/users`);
            if (usersResponse.ok) {
              const allUsers = await usersResponse.json();
              // Find users with "Colour Consultant" position
              const colourConsultants = allUsers.filter((user) => {
                if (!user.positions || !Array.isArray(user.positions)) return false;
                return user.positions.some((position) => {
                  const positionName = position.name ? position.name.toLowerCase() : "";
                  return positionName === "colour consultant";
                });
              });
              
              if (colourConsultants.length > 0) {
                const consultantNames = colourConsultants.map(c => c.name || "").filter(n => n);
                if (consultantNames.length === 1) {
                  colourConsultantName = consultantNames[0];
                } else if (consultantNames.length === 2) {
                  colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
                } else if (consultantNames.length >= 3) {
                  const allButLast = consultantNames.slice(0, -1).join(", ");
                  const last = consultantNames[consultantNames.length - 1];
                  colourConsultantName = `${allButLast} & ${last}`;
                }
              }
            }
          } catch (error) {
            console.error("Error fetching colour consultants:", error);
          }
          
          // Replace tokens in subject
          subject = subject.replace(/\{SUBURB\}/g, suburb)
                           .replace(/\{STREET\}/g, street)
                           .replace(/\{ClientName\}/g, clientName)
                           .replace(/\{ProjectName\}/g, projectName)
                           .replace(/\{ColourConsultant\}/g, colourConsultantName);
          setEmailSubject(subject);
          
          // Replace tokens in body
          if (template.body) {
            let body = template.body;
            body = body.replace(/\{SUBURB\}/g, suburb)
                       .replace(/\{STREET\}/g, street)
                       .replace(/\{ClientName\}/g, clientName)
                       .replace(/\{ProjectName\}/g, projectName)
                       .replace(/\{ColourConsultant\}/g, colourConsultantName);
            setEmailBody(body);
          } else {
            setEmailBody("");
          }
        } else {
          setEmailTo("");
          setEmailFrom("");
          setEmailSubject("");
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
    setEmailTo("");
    setEmailFrom("");
    setEmailSubject("");
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

  async function handleSendToClient() {
    if (!project?.id) {
      alert("Error: No project selected");
      return;
    }

    if (!attachAffordable && !attachSuperior) {
      alert("Please select at least one attachment (Affordable or Superior).");
      return;
    }

    // Get email addresses from the To field (comma-separated)
    const toEmails = emailTo.split(",").map(a => a.trim()).filter(a => a.length > 0);
    if (toEmails.length === 0) {
      alert("Please enter at least one email address in the To field.");
      return;
    }

    if (!emailFrom || !emailFrom.trim()) {
      alert("From address is required");
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
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
            from: emailFrom,
            subject: emailSubject || null,
          }),
        });

        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(errorText || response.statusText);
        }

        if (!response.ok) {
          const errorMessage = data.error || data.message || response.statusText;
          throw new Error(errorMessage);
        }

        let message = "";
        if (emailTemplateType === "Send") {
          message = "Colours email sent successfully!";
        } else if (emailTemplateType === "Remind") {
          message = "Colours reminder email sent successfully!";
        } else if (emailTemplateType === "WindowsRoof") {
          message = "Windows & Roof email sent successfully!";
        }
        alert(message);
      });

      if (emailTemplateType === "Send" && coloursStatus === "Not Sent") {
        saveField("colours_status", "Sent");
      }

      handleCloseSendModal();
      setTimeout(() => {
        if (onUpdate) {
          onUpdate();
        }
      }, 1000);
    } catch (error) {
      console.error("Error sending colours email:", error);
      alert(`Failed to send email: ${error.message}`);
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
      
      // Construct the file path with "8. COLOURS & WINDOWS" subfolder
      // Format: root_directory\year\state\suburb - street\8. COLOURS & WINDOWS\filename
      // NOTE: This function ONLY saves the path to the database - it does NOT create folders or copy files
      const fileName = file.name;
      const projectFolderName = buildJobFolderNameSegment(project.suburb, project.street);
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

  function handleOpenTracePlan() {
    if (!isAdmin) return;
    if (!project?.drawings_pdf_location) {
      alert("No drawings plan PDF is available for this project yet.");
      return;
    }
    setShowTracePlanModal(true);
  }

  function handleOpen3DVisualiser() {
    if (!isAdmin) return;
    setShowBuilding3DModal(true);
  }

  async function savePlanTracePolygon(
    normalizedPoints,
    page,
    internalWallSegments = [],
    crop = null,
    windows = [],
    calibration = null,
    doors = [],
    slidingDoors = [],
    roofPoints = [],
    deckPoints = []
  ) {
    if (!project?.id) {
      throw new Error("No project selected");
    }
    const projectName =
      project?.street && project?.suburb
        ? `${project.street}, ${project.suburb}`.trim()
        : project?.name || "";
    const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        colours_plan_trace_polygon: serializePlanTracePolygon(
          page,
          normalizedPoints,
          internalWallSegments,
          crop,
          windows,
          calibration,
          doors,
          slidingDoors,
          roofPoints,
          deckPoints
        ),
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save plan trace");
    }
    if (onUpdate) onUpdate();
  }

  const emailClientButtonStyle = mergeColoursButtonStyle(EMAIL_CLIENT_BUTTON_ID, {
    background: MENU.purple,
    color: MENU.activeText,
    border: FIELD_OUTLINE,
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
  });
  const emailClientUsesSavedStyle = Boolean(buildSavedButtonStyle(EMAIL_CLIENT_BUTTON_ID, true));

  const tracePlanButtonStyle = mergeColoursButtonStyle(TRACE_PLAN_BUTTON_ID, {
    background: MENU.purple,
    color: MENU.activeText,
    border: FIELD_OUTLINE,
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
    minWidth: "100px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  });
  const tracePlanUsesSavedStyle = Boolean(buildSavedButtonStyle(TRACE_PLAN_BUTTON_ID, true));

  const visualiser3DButtonStyle = mergeColoursButtonStyle(VISUALISER_3D_BUTTON_ID, {
    background: MENU.purple,
    color: MENU.activeText,
    border: FIELD_OUTLINE,
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s",
    flexShrink: 0,
    minWidth: "100px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  });
  const visualiser3DUsesSavedStyle = Boolean(buildSavedButtonStyle(VISUALISER_3D_BUTTON_ID, true));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT }}>
        Colours
      </h2>
      {project && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginTop: "8px", gap: "12px" }}>
          {/* Status (left, aligned with colour fields) + category tabs (aligned with elevations) */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "24px",
              flexShrink: 0,
              alignItems: "flex-end",
            }}
          >
            <label
              style={{
                width: COLOURS_LEFT_COLUMN_WIDTH,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "0.9rem", color: UI.textMuted }}>Status</span>
              <select
                name="coloursStatus"
                value={coloursStatus}
                onChange={handleColoursStatusChange}
                style={COLOURS_FIELD_SELECT_STYLE}
              >
                {COLOURS_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "flex-end",
                gap: "10px",
              }}
            >
              {COLOUR_PAGE_CATEGORIES.map((category) => {
                const selected = activeColourCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveColourCategory(category)}
                    style={{
                      width: COLOURS_CATEGORY_FIT_WIDTH,
                      minHeight: "42px",
                      padding: "10px 14px",
                      border: FIELD_OUTLINE,
                      borderRadius: "8px",
                      background: selected ? MENU.purple : WHITE,
                      color: selected ? MENU.activeText : MONUMENT,
                      fontSize: "1rem",
                      fontWeight: 500,
                      textAlign: "center",
                      cursor: "pointer",
                      transition: "background 0.17s, color 0.17s",
                      boxSizing: "border-box",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {category}
                  </button>
                );
              })}

              {activeColourCategory === "External" && colourSaveStatus ? (
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    alignSelf: "center",
                    color:
                      colourSaveStatus === "error"
                        ? "#842029"
                        : colourSaveStatus === "saved"
                          ? "#0f5132"
                          : UI.textMuted,
                  }}
                >
                  {colourSaveStatus === "saving"
                    ? "Saving…"
                    : colourSaveStatus === "saved"
                      ? "Saved"
                      : "Save failed"}
                </span>
              ) : null}

              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  width: COLOURS_ROOF_STYLE_FIT_WIDTH,
                  flexShrink: 0,
                  marginLeft: "auto",
                }}
              >
                <span style={{ fontSize: "0.9rem", color: UI.textMuted }}>Roof style</span>
                <select
                  value={roofStyle}
                  onChange={handleRoofStyleChange}
                  style={COLOURS_FIELD_SELECT_STYLE}
                >
                  {ROOF_STYLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Left colour fields + right elevation / category panel */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "24px",
              flex: 1,
              minHeight: 0,
              alignItems: "stretch",
            }}
          >
            {activeColourCategory === "External" ? (
              <div
                style={{
                  width: COLOURS_LEFT_COLUMN_WIDTH,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  overflow: "visible",
                  paddingRight: "4px",
                }}
              >
                {[
                  {
                    label: "Cladding",
                    value: claddingColour,
                    onChange: handleCladdingColourChange,
                    options: COLOUR_OPTIONS,
                  },
                  {
                    label: "Baseboards",
                    value: baseboardsColour,
                    onChange: handleBaseboardsColourChange,
                    options: COLOUR_OPTIONS,
                  },
                  {
                    label: "Roof colour",
                    value: roofColour,
                    onChange: handleRoofColourChange,
                    options: COLOUR_OPTIONS,
                  },
                  {
                    label: "Window frames",
                    value: windowFramesColour,
                    onChange: handleWindowFramesColourChange,
                    options: COLOUR_OPTIONS,
                  },
                  {
                    label: "Window surrounds",
                    value: windowSurroundsColour,
                    onChange: handleWindowSurroundsColourChange,
                    options: COLOUR_OPTIONS,
                  },
                  {
                    label: "Door",
                    value: doorColour,
                    onChange: handleDoorColourChange,
                    options: COLOUR_OPTIONS,
                  },
                ].map((field) => (
                  <label key={field.label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "0.9rem", color: UI.textMuted }}>{field.label}</span>
                    <select value={field.value} onChange={field.onChange} style={COLOURS_FIELD_SELECT_STYLE}>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ width: COLOURS_LEFT_COLUMN_WIDTH, flexShrink: 0 }} aria-hidden />
            )}

            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                background: WHITE,
                border: FIELD_OUTLINE,
                borderRadius: "12px",
                padding: "16px",
                boxSizing: "border-box",
              }}
            >
              {activeColourCategory === "External" ? (
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  <BuildingElevations
                    widthM={11.3}
                    depthM={5.0}
                    footprintPoints={planTraceFootprintPoints}
                    roofPoints={planTraceRoofPoints}
                    windows={planTraceWindows}
                    doors={planTraceDoors}
                    slidingDoors={planTraceSlidingDoors}
                    calibration={planTraceCalibration}
                    finishes={{
                      claddingColour,
                      baseboardsColour,
                      roofColour,
                      windowFramesColour,
                      windowSurroundsColour,
                      doorColour,
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: UI.textMuted,
                    fontSize: "1rem",
                    textAlign: "center",
                  }}
                >
                  {activeColourCategory} colour selections will appear here.
                </div>
              )}
            </div>
          </div>

        <div
          style={{
            flexShrink: 0,
            marginTop: "auto",
            display: "flex",
            alignItems: "flex-end",
            gap: "12px",
            paddingTop: "16px",
            paddingBottom: "4px",
          }}
        >
          {isAdmin && project?.drawings_pdf_location && (
            <button
              type="button"
              onClick={handleOpenTracePlan}
              style={tracePlanButtonStyle}
              onMouseEnter={
                tracePlanUsesSavedStyle
                  ? undefined
                  : (e) => {
                      e.currentTarget.style.background = streamColorHover(MENU.purple);
                    }
              }
              onMouseLeave={
                tracePlanUsesSavedStyle
                  ? undefined
                  : (e) => {
                      e.currentTarget.style.background = MENU.purple;
                    }
              }
            >
              Trace<br />Plan
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleOpen3DVisualiser}
              style={visualiser3DButtonStyle}
            onMouseEnter={
              visualiser3DUsesSavedStyle
                ? undefined
                : (e) => {
                    e.currentTarget.style.background = streamColorHover(MENU.purple);
                  }
            }
            onMouseLeave={
              visualiser3DUsesSavedStyle
                ? undefined
                : (e) => {
                    e.currentTarget.style.background = MENU.purple;
                  }
            }
          >
            3D<br />Visualiser
          </button>
          )}
          <button
            type="button"
            onClick={handleOpenSendModal}
            style={emailClientButtonStyle}
            onMouseEnter={
              emailClientUsesSavedStyle
                ? undefined
                : (e) => {
                    e.currentTarget.style.background = streamColorHover(MENU.purple);
                  }
            }
            onMouseLeave={
              emailClientUsesSavedStyle
                ? undefined
                : (e) => {
                    e.currentTarget.style.background = MENU.purple;
                  }
            }
          >
            Email Client
          </button>
        </div>
        </div>
      )}

      {isAdmin && showTracePlanModal && project?.drawings_pdf_location && (
        <TracePlanModal
          pdfUrl={`${API_URL}/api/files/drawings/${project.id}?t=${Date.now()}`}
          savedPolygon={project.colours_plan_trace_polygon}
          onSave={savePlanTracePolygon}
          onClose={() => setShowTracePlanModal(false)}
        />
      )}

      {isAdmin && showBuilding3DModal && (
        <Building3DModal
          title="3D Unit"
          widthM={11.3}
          depthM={5.0}
          subfloorHeightM={0.65}
          footprintPoints={planTraceFootprintPoints}
          roofPoints={planTraceRoofPoints}
          deckPoints={planTraceDeckPoints}
          windows={planTraceWindows}
          doors={planTraceDoors}
          slidingDoors={planTraceSlidingDoors}
          calibration={planTraceCalibration}
          projectId={project?.id ?? null}
          finishes={{
            roofColour,
            claddingColour,
            baseboardsColour,
            roofStyle,
            windowFramesColour,
            windowSurroundsColour,
            frontDoorColour: doorColour,
          }}
          onClose={() => setShowBuilding3DModal(false)}
        />
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
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                onClick={handleCloseSendModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Email Template Type Dropdown */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Email Type
                </label>
                <select
                  value={emailTemplateType}
                  onChange={handleTemplateTypeChange}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
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

              {/* Attachments Section */}
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Attachments
                </label>
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

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  From
                </label>
                <input
                  type="text"
                  value={emailFrom}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Body
                </label>
                <div
                  ref={emailBodyRef}
                  contentEditable
                  onInput={(e) => {
                    setEmailBody(e.currentTarget.innerHTML);
                  }}
                  onBlur={(e) => {
                    setEmailBody(e.currentTarget.innerHTML);
                  }}
                  style={{
                    width: "100%",
                    minHeight: "300px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    lineHeight: "1.6",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  onClick={handleCloseSendModal}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: "transparent",
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendToClient}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: WHITE,
                    background: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
