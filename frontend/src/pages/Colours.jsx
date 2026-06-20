import React, { useState, useEffect, useRef } from "react";
import ThreeDVis from "./ThreeDVis";
import ElevationPickerModal from "../components/ElevationPickerModal";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { emailLinkBaseForApiBody } from "../utils/emailLinkBaseForApi";
import { resolveNewProjectClientFrom, findSalespersonUserInList } from "../utils/streamNewProjectEmail";
import { buildJobFolderNameSegment } from "../utils/projectFolderPath";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const COLOURS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];
const COLOUR_OPTIONS = ["Select", "Monument", "Paperbark", "Wallaby"];

export default function Colours({ project, onUpdate }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [show3DVis, setShow3DVis] = useState(false);
  const [coloursStatus, setColoursStatus] = useState(project?.colours_status || "Not Sent");
  const [notes, setNotes] = useState(project?.colours_notes || "");
  const [roofColour, setRoofColour] = useState(project?.roof_colour || "Select");
  const [claddingColour, setCladdingColour] = useState(project?.cladding_colour || "Select");
  const [baseboardsColour, setBaseboardsColour] = useState(project?.baseboards_colour || "Select");
  const [roofStyle, setRoofStyle] = useState(project?.roof_style || "Select");
  const [fasciaGutterColour, setFasciaGutterColour] = useState(project?.fascia_gutter_colour || "Select");
  const [balustradeColour, setBalustradeColour] = useState(project?.balustrade_colour || "Select");
  const [frontDoorColour, setFrontDoorColour] = useState(project?.front_door_colour || "Select");
  const [windowFramesColour, setWindowFramesColour] = useState(project?.window_frames_colour || "Select");
  const [windowSurroundsColour, setWindowSurroundsColour] = useState(project?.window_surrounds_colour || "Select");
  const [showSendModal, setShowSendModal] = useState(false);
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
  const [showPortalEmailModal, setShowPortalEmailModal] = useState(false);
  const [portalEmailTo, setPortalEmailTo] = useState("");
  const [portalEmailFrom, setPortalEmailFrom] = useState("");
  const [portalEmailSubject, setPortalEmailSubject] = useState("");
  const [portalEmailBody, setPortalEmailBody] = useState("");
  const portalEmailBodyRef = useRef(null);
  const [showElevationPicker, setShowElevationPicker] = useState(false);
  const [showAiRenderModal, setShowAiRenderModal] = useState(false);
  const [aiRenderBusy, setAiRenderBusy] = useState(false);
  const [aiRenderError, setAiRenderError] = useState(null);
  const [aiRenderPreviewUrl, setAiRenderPreviewUrl] = useState(null);

  const valuesRef = useRef({ coloursStatus, notes, roofColour, claddingColour, baseboardsColour, roofStyle, fasciaGutterColour, balustradeColour, frontDoorColour, windowFramesColour, windowSurroundsColour });
  
  useEffect(() => {
    valuesRef.current = { coloursStatus, notes, roofColour, claddingColour, baseboardsColour, roofStyle, fasciaGutterColour, balustradeColour, frontDoorColour, windowFramesColour, windowSurroundsColour };
  }, [coloursStatus, notes, roofColour, claddingColour, baseboardsColour, roofStyle, fasciaGutterColour, balustradeColour, frontDoorColour, windowFramesColour, windowSurroundsColour]);

  useEffect(() => {
    if (!project) return;
    setColoursStatus(project.colours_status || "Not Sent");
    setNotes(project.colours_notes || "");
    setRoofColour(project.roof_colour || "Select");
    setCladdingColour(project.cladding_colour || "Select");
    setBaseboardsColour(project.baseboards_colour || "Select");
    setRoofStyle(project.roof_style || "Select");
    setFasciaGutterColour(project.fascia_gutter_colour || "Select");
    setBalustradeColour(project.balustrade_colour || "Select");
    setFrontDoorColour(project.front_door_colour || "Select");
    setWindowFramesColour(project.window_frames_colour || "Select");
    setWindowSurroundsColour(project.window_surrounds_colour || "Select");
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

  useEffect(() => {
    setShowElevationPicker(false);
    setShowAiRenderModal(false);
    setAiRenderBusy(false);
    setAiRenderError(null);
    setAiRenderPreviewUrl(null);
  }, [project?.id]);

  // Update contentEditable when emailBody changes and modal is open
  useEffect(() => {
    if (showSendModal && emailBodyRef.current && emailBody) {
      // Only update if content is different to avoid cursor jumping
      if (emailBodyRef.current.innerHTML !== emailBody) {
        emailBodyRef.current.innerHTML = emailBody;
      }
    }
  }, [showSendModal, emailBody]);

  // Update portal email body contentEditable
  useEffect(() => {
    if (showPortalEmailModal && portalEmailBodyRef.current && portalEmailBody) {
      if (portalEmailBodyRef.current.innerHTML !== portalEmailBody) {
        portalEmailBodyRef.current.innerHTML = portalEmailBody;
      }
    }
  }, [showPortalEmailModal, portalEmailBody]);

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
        roof_colour: fieldName === "roof_colour" ? (value === "Select" ? null : value) : (currentValues.roofColour === "Select" ? null : currentValues.roofColour),
        cladding_colour: fieldName === "cladding_colour" ? (value === "Select" ? null : value) : (currentValues.claddingColour === "Select" ? null : currentValues.claddingColour),
        baseboards_colour: fieldName === "baseboards_colour" ? (value === "Select" ? null : value) : (currentValues.baseboardsColour === "Select" ? null : currentValues.baseboardsColour),
        roof_style: fieldName === "roof_style" ? (value === "Select" ? null : value) : (currentValues.roofStyle === "Select" ? null : currentValues.roofStyle),
        fascia_gutter_colour: fieldName === "fascia_gutter_colour" ? (value === "Select" ? null : value) : (currentValues.fasciaGutterColour === "Select" ? null : currentValues.fasciaGutterColour),
        balustrade_colour: fieldName === "balustrade_colour" ? (value === "Select" ? null : value) : (currentValues.balustradeColour === "Select" ? null : currentValues.balustradeColour),
        front_door_colour: fieldName === "front_door_colour" ? (value === "Select" ? null : value) : (currentValues.frontDoorColour === "Select" ? null : currentValues.frontDoorColour),
        window_frames_colour: fieldName === "window_frames_colour" ? (value === "Select" ? null : value) : (currentValues.windowFramesColour === "Select" ? null : currentValues.windowFramesColour),
        window_surrounds_colour: fieldName === "window_surrounds_colour" ? (value === "Select" ? null : value) : (currentValues.windowSurroundsColour === "Select" ? null : currentValues.windowSurroundsColour),
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

  async function saveColoursFromProjectPage(nextRoof, nextCladding, nextBaseboards) {
    if (!project?.id) {
      console.error("Cannot save colours: no project ID");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/update-colours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roof_colour: nextRoof === "Select" ? null : nextRoof,
          cladding_colour: nextCladding === "Select" ? null : nextCladding,
          baseboards_colour: nextBaseboards === "Select" ? null : nextBaseboards,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save colours");
      }

      const result = await response.json().catch(() => null);
      console.log("Colours saved from project page:", result);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error saving colours from project page:", error);
      alert(`Failed to save colours: ${error.message}`);
    }
  }

  async function handleRoofColourChange(e) {
    const newValue = e.target.value;
    setRoofColour(newValue);
    valuesRef.current.roofColour = newValue;
    await saveColoursFromProjectPage(newValue, claddingColour, baseboardsColour);
  }

  async function handleCladdingColourChange(e) {
    const newValue = e.target.value;
    setCladdingColour(newValue);
    valuesRef.current.claddingColour = newValue;
    await saveColoursFromProjectPage(roofColour, newValue, baseboardsColour);
  }

  async function handleBaseboardsColourChange(e) {
    const newValue = e.target.value;
    setBaseboardsColour(newValue);
    valuesRef.current.baseboardsColour = newValue;
    await saveColoursFromProjectPage(roofColour, claddingColour, newValue);
  }

  async function handleRoofStyleChange(e) {
    const newValue = e.target.value;
    setRoofStyle(newValue);
    valuesRef.current.roofStyle = newValue;
    await saveField("roof_style", newValue);
  }

  async function handleFasciaGutterColourChange(e) {
    const newValue = e.target.value;
    setFasciaGutterColour(newValue);
    valuesRef.current.fasciaGutterColour = newValue;
    await saveField("fascia_gutter_colour", newValue);
  }

  async function handleBalustradeColourChange(e) {
    const newValue = e.target.value;
    setBalustradeColour(newValue);
    valuesRef.current.balustradeColour = newValue;
    await saveField("balustrade_colour", newValue);
  }

  async function handleFrontDoorColourChange(e) {
    const newValue = e.target.value;
    setFrontDoorColour(newValue);
    valuesRef.current.frontDoorColour = newValue;
    await saveField("front_door_colour", newValue);
  }

  async function handleWindowFramesColourChange(e) {
    const newValue = e.target.value;
    setWindowFramesColour(newValue);
    valuesRef.current.windowFramesColour = newValue;
    await saveField("window_frames_colour", newValue);
  }

  async function handleWindowSurroundsColourChange(e) {
    const newValue = e.target.value;
    setWindowSurroundsColour(newValue);
    valuesRef.current.windowSurroundsColour = newValue;
    await saveField("window_surrounds_colour", newValue);
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

  async function handleOpenPortalEmailModal() {
    // Load "COLOURS - Portal" template
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
        const template = templates.find(t => t.name === "COLOURS - Portal");
        if (template) {
          // Get active client emails for "To" field
          const activeClients = getActiveClients();
          const activeClientEmails = activeClients
            .map(client => client.email)
            .filter(email => email && email.trim());
          const toAddresses = activeClientEmails.join(", ");
          
          // Set To, From, Subject from template
          setPortalEmailTo(toAddresses);
          setPortalEmailFrom(resolveNewProjectClientFrom(settings, project, salespersonUser));
          
          // Replace tokens in subject
          let subject = template.subject || "";
          const suburb = (project?.suburb || "").toUpperCase();
          const street = project?.street || "";
          
          // Get active client names (first names only)
          const activeClientFirstNames = activeClients
            .map(client => {
              if (client.name && client.name.trim()) {
                return client.name.trim().split(/\s+/)[0];
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
          
          // Format project name
          const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
          
          // Get colour consultant names
          let colourConsultantName = "";
          try {
            const usersResponse = await fetch(`${API_URL}/api/users`);
            if (usersResponse.ok) {
              const allUsers = await usersResponse.json();
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
          setPortalEmailSubject(subject);
          
          // Replace tokens in body
          if (template.body) {
            let body = template.body;
            body = body.replace(/\{SUBURB\}/g, suburb)
                       .replace(/\{STREET\}/g, street)
                       .replace(/\{ClientName\}/g, clientName)
                       .replace(/\{ProjectName\}/g, projectName)
                       .replace(/\{ColourConsultant\}/g, colourConsultantName);
            setPortalEmailBody(body);
          } else {
            setPortalEmailBody("");
          }
          
          setShowPortalEmailModal(true);
        } else {
          alert('Email template "COLOURS - Portal" not found. Please create it in Settings → Email Templates.');
        }
      }
    } catch (error) {
      console.error("Error loading portal email template:", error);
      alert("Failed to load email template");
    }
  }

  async function handleSendPortalEmail() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    const toAddresses = portalEmailTo.split(",").map(a => a.trim()).filter(a => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!portalEmailFrom || !portalEmailFrom.trim()) {
      alert("From address is required");
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
        const response = await fetch(`${API_URL}/api/emails/send-colours-portal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...emailLinkBaseForApiBody(),
            projectId: project.id,
            toEmails: toAddresses,
            from: portalEmailFrom,
            subject: portalEmailSubject,
            htmlBody: portalEmailBody,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || "Failed to send email");
        }

        await response.json();
        alert("Portal email sent successfully!");
      });
      setShowPortalEmailModal(false);
    } catch (error) {
      console.error("Error sending portal email:", error);
      alert(`Failed to send email: ${error.message}`);
    }
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

  const canGenerateAiRender =
    !!(project?.id && project?.drawings_pdf_location && project?.colours_pdf_location);

  function openElevationPickerForRender() {
    if (!project?.id || !canGenerateAiRender || aiRenderBusy) return;
    setShowElevationPicker(true);
  }

  /** Runs after elevation rectangle is chosen; file is saved on disk as AI Render.png in the project folder. */
  async function runAiRenderGeneration({ planPage, elevationCrop }) {
    if (!project?.id) return;
    setShowElevationPicker(false);
    setShowAiRenderModal(true);
    setAiRenderBusy(true);
    setAiRenderError(null);
    setAiRenderPreviewUrl(null);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/generate-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planPage,
          elevationCrop,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || response.statusText || "Generation failed");
      }
      if (data?.renderUrl) {
        setAiRenderPreviewUrl(`${API_URL}${data.renderUrl}?t=${Date.now()}`);
      } else {
        throw new Error("Server did not return an image URL.");
      }
    } catch (e) {
      setAiRenderError(e?.message || "Failed to generate render");
    } finally {
      setAiRenderBusy(false);
    }
  }

  function openAiRenderModalViewLast() {
    if (!project?.id) return;
    setShowAiRenderModal(true);
    setAiRenderBusy(false);
    setAiRenderError(null);
    setAiRenderPreviewUrl(`${API_URL}/api/files/ai-render/${project.id}?t=${Date.now()}`);
  }

  function closeAiRenderModal() {
    setShowAiRenderModal(false);
  }

  function handleOpenAiRenderInNewTab() {
    if (!project?.id) return;
    window.open(`${API_URL}/api/files/ai-render/${project.id}`, "_blank");
  }

  if (show3DVis) {
    return (
      <ThreeDVis 
        project={project} 
        onBack={() => setShow3DVis(false)}
        onUpdate={onUpdate}
        roofColour={roofColour}
        claddingColour={claddingColour}
        baseboardsColour={baseboardsColour}
        setRoofColour={setRoofColour}
        setCladdingColour={setCladdingColour}
        setBaseboardsColour={setBaseboardsColour}
        saveColoursFromProjectPage={saveColoursFromProjectPage}
        roofStyle={roofStyle}
        setRoofStyle={setRoofStyle}
        handleRoofStyleChange={handleRoofStyleChange}
        fasciaGutterColour={fasciaGutterColour}
        setFasciaGutterColour={setFasciaGutterColour}
        handleFasciaGutterColourChange={handleFasciaGutterColourChange}
        balustradeColour={balustradeColour}
        setBalustradeColour={setBalustradeColour}
        handleBalustradeColourChange={handleBalustradeColourChange}
        frontDoorColour={frontDoorColour}
        setFrontDoorColour={setFrontDoorColour}
        handleFrontDoorColourChange={handleFrontDoorColourChange}
        windowFramesColour={windowFramesColour}
        setWindowFramesColour={setWindowFramesColour}
        handleWindowFramesColourChange={handleWindowFramesColourChange}
        windowSurroundsColour={windowSurroundsColour}
        setWindowSurroundsColour={setWindowSurroundsColour}
        handleWindowSurroundsColourChange={handleWindowSurroundsColourChange}
      />
    );
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
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
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
                    color: PAGE_TEXT,
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
                  <span>{project?.colours_sent_date ? formatDateTime(project.colours_sent_date) : (coloursStatus === "Sent" ? "Sent (refreshing...)" : "Not sent")}</span>
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

              {/* Email Online Colours Button */}
              <div style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={handleOpenPortalEmailModal}
                  style={{
                    width: "100%",
                    background: MONUMENT,
                    color: PAGE_TEXT,
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1b")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                >
                  Email Online Colours
                </button>
              </div>

              {/* 3D Visualiser Button */}
              <div style={{ marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShow3DVis(true)}
                  style={{
                    width: "100%",
                    background: MONUMENT,
                    color: PAGE_TEXT,
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1b")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                >
                  3D Visualiser
                </button>
              </div>
            </div>
          </div>

          {/* Column 2 */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: "500" }}>
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
                <div style={{ fontSize: "0.85rem", color: UI.textMuted }}>
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
                    color: PAGE_TEXT,
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

          {/* Column 3 - AI exterior render */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: "500" }}>
              AI exterior render
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: SECTION_GREY, lineHeight: 1.45 }}>
              Draw a red box on the <strong style={{ color: MONUMENT }}>drawings PDF</strong> around the elevation. The
              server uses that crop as the only shape, then applies your project{" "}
              <strong style={{ color: MONUMENT }}>roof / cladding / baseboard</strong> colours (saved on this page) with
              OpenAI high input-fidelity. Output is saved next to your colours PDF as{" "}
              <strong style={{ color: MONUMENT }}>AI Render.png</strong>.
            </p>
            <button
              type="button"
              onClick={openElevationPickerForRender}
              disabled={!canGenerateAiRender || aiRenderBusy}
              title={
                canGenerateAiRender
                  ? "Cropped drawings elevation + project roof/cladding/baseboard colours (OpenAI, preserve geometry)"
                  : "Set drawings PDF and colours PDF paths first"
              }
              style={{
                width: "100%",
                background: !canGenerateAiRender || aiRenderBusy ? SECTION_GREY : MONUMENT,
                color: WHITE,
                border: "none",
                borderRadius: "8px",
                padding: "12px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: !canGenerateAiRender || aiRenderBusy ? "not-allowed" : "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => {
                if (canGenerateAiRender && !aiRenderBusy) e.currentTarget.style.background = "#1a1a1b";
              }}
              onMouseLeave={(e) => {
                if (canGenerateAiRender && !aiRenderBusy) e.currentTarget.style.background = MONUMENT;
              }}
            >
              Generate AI Render
            </button>
            <button
              type="button"
              onClick={openAiRenderModalViewLast}
              disabled={!project?.id}
              style={{
                width: "100%",
                background: WHITE,
                color: MONUMENT,
                border: `1px solid ${SECTION_GREY}`,
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: project?.id ? "pointer" : "not-allowed",
                opacity: project?.id ? 1 : 0.65,
              }}
            >
              View last render
            </button>
          </div>

          {/* Column 4 - Notes */}
          <div style={{ flex: "1", minWidth: "200px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", flexShrink: 0 }}>
              Notes
            </div>
            <textarea
              name="colours_notes"
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

      {/* Drawings PDF: navigate + define elevation rectangle before generate */}
      {project?.id ? (
        <ElevationPickerModal
          open={showElevationPicker}
          onClose={() => setShowElevationPicker(false)}
          drawingsPdfUrl={`${API_URL}/api/files/drawings/${project.id}`}
          onConfirm={(sel) => void runAiRenderGeneration(sel)}
        />
      ) : null}

      {/* AI exterior render modal — opens immediately on Generate; image saved on server as AI Render.png */}
      {showAiRenderModal && (
        <div
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAiRenderModal();
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
            pointerEvents: "auto",
            padding: "16px",
            boxSizing: "border-box",
          }}
        >
          <div
            role="dialog"
            aria-labelledby="ai-render-modal-title"
            aria-busy={aiRenderBusy}
            style={{
              background: WHITE,
              borderRadius: "14px",
              padding: "22px",
              width: "100%",
              maxWidth: "920px",
              maxHeight: "92vh",
              overflowY: "auto",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px" }}>
              <h2 id="ai-render-modal-title" style={{ margin: 0, fontSize: "1.35rem", color: MONUMENT }}>
                AI exterior render
              </h2>
              <button
                type="button"
                onClick={closeAiRenderModal}
                title="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.6rem",
                  lineHeight: 1,
                  cursor: "pointer",
                  color: SECTION_GREY,
                  padding: "4px 8px",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: "0 0 16px 0", fontSize: "0.88rem", color: SECTION_GREY, lineHeight: 1.45 }}>
              Shape from your cropped elevation; colours from this project’s roof, cladding, and baseboards (saved on
              Colours). File on disk: <strong style={{ color: MONUMENT }}>AI Render.png</strong> next to your colours
              file.
            </p>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px", minHeight: "120px" }}>
              {aiRenderBusy ? (
                <>
                  <div
                    aria-hidden
                    style={{
                      width: "46px",
                      height: "46px",
                      border: `4px solid ${SECTION_GREY}`,
                      borderTopColor: MONUMENT,
                      borderRadius: "50%",
                      animation: "spin 0.88s linear infinite",
                    }}
                  />
                  <div style={{ fontSize: "1rem", color: MONUMENT, fontWeight: 600, textAlign: "center" }}>
                    Generating render…
                  </div>
                  <div style={{ fontSize: "0.88rem", color: SECTION_GREY, textAlign: "center", maxWidth: "420px" }}>
                    Rasterizing drawings and colours PDFs, then requesting the image from AI. This often takes a minute.
                  </div>
                </>
              ) : null}

              {!aiRenderBusy && aiRenderError ? (
                <div
                  role="alert"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    fontSize: "0.9rem",
                    background: "#fdecea",
                    border: "1px solid #f5c2c0",
                    color: "#842029",
                  }}
                >
                  {aiRenderError}
                </div>
              ) : null}

              {!aiRenderBusy && aiRenderPreviewUrl ? (
                <img
                  src={aiRenderPreviewUrl}
                  alt="AI-generated exterior render"
                  onError={() => {
                    setAiRenderError((prev) =>
                      prev || "Could not load this image. If you have not generated a render yet, use Generate AI Render."
                    );
                    setAiRenderPreviewUrl(null);
                  }}
                  style={{
                    maxWidth: "100%",
                    height: "auto",
                    maxHeight: "min(68vh, 720px)",
                    objectFit: "contain",
                    borderRadius: "10px",
                    border: `1px solid ${SECTION_GREY}`,
                    display: "block",
                  }}
                />
              ) : null}

              {!aiRenderBusy && !aiRenderError && !aiRenderPreviewUrl ? (
                <div style={{ fontSize: "0.9rem", color: SECTION_GREY, textAlign: "center" }}>
                  No preview yet.
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "22px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleOpenAiRenderInNewTab}
                disabled={!project?.id || !aiRenderPreviewUrl}
                style={{
                  padding: "10px 18px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  background: WHITE,
                  color: MONUMENT,
                  cursor: project?.id && aiRenderPreviewUrl ? "pointer" : "not-allowed",
                  opacity: project?.id && aiRenderPreviewUrl ? 1 : 0.55,
                }}
              >
                Open in new tab
              </button>
              <button
                type="button"
                onClick={closeAiRenderModal}
                style={{
                  padding: "10px 22px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  borderRadius: "8px",
                  border: "none",
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
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

      {/* Portal Email Preview Modal */}
      {showPortalEmailModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
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
                onClick={() => setShowPortalEmailModal(false)}
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
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.9rem", color: UI.textMuted, fontWeight: 500 }}>
                  To
                </label>
                <input
                  type="text"
                  value={portalEmailTo}
                  onChange={(e) => setPortalEmailTo(e.target.value)}
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
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.9rem", color: UI.textMuted, fontWeight: 500 }}>
                  From
                </label>
                <input
                  type="text"
                  value={portalEmailFrom}
                  onChange={(e) => setPortalEmailFrom(e.target.value)}
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
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.9rem", color: UI.textMuted, fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={portalEmailSubject}
                  onChange={(e) => setPortalEmailSubject(e.target.value)}
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
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.9rem", color: UI.textMuted, fontWeight: 500 }}>
                  Body
                </label>
                <div
                  ref={portalEmailBodyRef}
                  contentEditable
                  onInput={(e) => setPortalEmailBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setPortalEmailBody(e.currentTarget.innerHTML)}
                  dangerouslySetInnerHTML={{ __html: portalEmailBody }}
                  style={{
                    width: "100%",
                    minHeight: "300px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    overflowY: "auto",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                <button
                  onClick={() => setShowPortalEmailModal(false)}
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
                  onClick={handleSendPortalEmail}
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
