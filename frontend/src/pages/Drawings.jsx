import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import {
  getProjectClientEmailsForDrawings,
  getStreamExtraDrawingEmails,
  isStreamSendDrawingsToClientsEnabled,
  mergeUniqueEmails,
  stripProjectClientEmailsWhenDisabled,
} from "../utils/streamDrawingsSettings";
import {
  DRAFTSPERSON_UNASSIGNED,
  normalizeDraftspersonField,
  isDraftspersonAssigned,
} from "../utils/draftspersonSentinel";
import {
  resolveConceptApprovedFrom,
  resolveConceptApprovedToEmails,
  resolveWdsApprovedFrom,
  resolveWdsApprovedToEmails,
  resolveDesignNotesFrom,
  resolveDesignNotesToEmails,
  resolveDesignToSalespersonFrom,
  resolveDesignToSalespersonToEmails,
  resolveSalesToDesignFrom,
  resolveSalesToDesignToEmails,
  resolveSalespersonToClientFrom,
  resolveSalespersonToClientToEmails,
  parseEmailTemplateToAddressList,
  resolveRegionalSalespersonName,
} from "../utils/drawingNotifyFrom";
import { buildJobFolderNameSegment, folderYearFromProjectYear } from "../utils/projectFolderPath";
import { emailLinkBaseForApiBody } from "../utils/emailLinkBaseForApi";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";
/** Above `EmailSendOverlay` (2147483000) so folder / upload errors are never hidden behind it. */
const DRAWINGS_ALERT_MODAL_Z = 2147483646;

export default function Drawings({
  project,
  onUpdate,
  drawingsPdfSrcOverride,
  showClearDrawingData = false,
}) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [drawingsStatus, setDrawingsStatus] = useState(project?.drawings_status || "Not Assigned");
  const [draftsperson, setDraftsperson] = useState(normalizeDraftspersonField(project?.draftsperson));
  const [drawingsHolder, setDrawingsHolder] = useState(project?.drawings_holder || "design team");
  const [draftspersonUsers, setDraftspersonUsers] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesForRevision, setNotesForRevision] = useState(null); // { index, revision, name, isNewDrawing, isCurrentRevision }
  const [notesText, setNotesText] = useState("");
  const [isSendingDraftingEmail, setIsSendingDraftingEmail] = useState(false);
  const [showSalesNotesModal, setShowSalesNotesModal] = useState(false);
  const [salesNotesForRevision, setSalesNotesForRevision] = useState(null); // { index, revision, name, isCurrentRevision }
  const [salesNotesText, setSalesNotesText] = useState("");
  const [showEmailClientModal, setShowEmailClientModal] = useState(false);
  const [emailClientNotes, setEmailClientNotes] = useState("");
  const [attachDrawings, setAttachDrawings] = useState(true);
  const [markupFile, setMarkupFile] = useState(null);
  const [isDraggingMarkup, setIsDraggingMarkup] = useState(false);
  const markupInputRef = useRef(null);
  const emailBodyRef = useRef(null);
  const emailDrawingsToClientBodyRef = useRef(null);
  const [showDrawingsModal, setShowDrawingsModal] = useState(false);
  const [showEmailPreviewModal, setShowEmailPreviewModal] = useState(false);
  const [emailPreviewTo, setEmailPreviewTo] = useState("");
  const [emailPreviewFrom, setEmailPreviewFrom] = useState("");
  const [emailPreviewSubject, setEmailPreviewSubject] = useState("");
  const [emailPreviewBody, setEmailPreviewBody] = useState("");
  const [showEmailDrawingsToClientModal, setShowEmailDrawingsToClientModal] = useState(false);
  const [emailDrawingsToClientTo, setEmailDrawingsToClientTo] = useState("");
  const [emailDrawingsToClientFrom, setEmailDrawingsToClientFrom] = useState("");
  const [emailDrawingsToClientSubject, setEmailDrawingsToClientSubject] = useState("");
  const [emailDrawingsToClientBody, setEmailDrawingsToClientBody] = useState("");
  /** "client" = Send to Client (updates holder / sent date); "sendTo" = Send Drawings to.. template only */
  const [emailDrawingsFlowKind, setEmailDrawingsFlowKind] = useState("client");
  /** VIC SMTP from-address choices for Send Drawings to.. (Primary / Secondary / VIC - SMTP) */
  const [vicSmtpFromOptions, setVicSmtpFromOptions] = useState([]);
  const [emailPreviewType, setEmailPreviewType] = useState(null); // "drafting" | "sales" | "concept_approval" | "working_approval"
  const [showDraftspersonRequiredModal, setShowDraftspersonRequiredModal] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState(null);
  const [draftspersonModalChoice, setDraftspersonModalChoice] = useState(DRAFTSPERSON_UNASSIGNED);
  /** When a new PDF is uploaded, user must pick concept vs working before Save and Send ("", "concept", "working"). */
  const [newDrawingUploadKind, setNewDrawingUploadKind] = useState("");
  const [streamSettingsJson, setStreamSettingsJson] = useState({});
  const drawingUploadPreverifiedPublishedPlansDirRef = useRef(null);
  const [drawingsFolderCheckPending, setDrawingsFolderCheckPending] = useState(false);
  const [showDrawingsFolderMissingModal, setShowDrawingsFolderMissingModal] = useState(false);
  const [showDrawingsPathErrorModal, setShowDrawingsPathErrorModal] = useState(false);
  const [drawingsPathErrorMessage, setDrawingsPathErrorMessage] = useState("");

  const valuesRef = useRef({ drawingsStatus, draftsperson });
  
  useEffect(() => {
    valuesRef.current = { drawingsStatus, draftsperson };
  }, [drawingsStatus, draftsperson]);

  // Sync from server when these fields change — not [project] (new object refs would reset draftsperson mid-save).
  useEffect(() => {
    if (project) {
      setDrawingsStatus(project.drawings_status || "Not Assigned");
      setDraftsperson(normalizeDraftspersonField(project.draftsperson));
      setDrawingsHolder(project.drawings_holder || "design team");
    }
  }, [
    project?.id,
    project?.draftsperson,
    project?.drawings_status,
    project?.drawings_holder,
    project?.updated_at,
  ]);

  useEffect(() => {
    // Fetch in background - don't block rendering
    fetchDraftspersons().catch(console.error);
  }, []);

  async function fetchStreamSettingsForDrawings() {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) return;
      const data = await res.json();
      let raw = data.stream_settings_json;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          raw = {};
        }
      }
      setStreamSettingsJson(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
    } catch (e) {
      console.error("Error loading stream settings:", e);
    }
  }

  useEffect(() => {
    void fetchStreamSettingsForDrawings();
  }, [project?.id]);

  useEffect(() => {
    function onFocus() {
      void fetchStreamSettingsForDrawings();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const sendDrawingsToClientsEnabled = isStreamSendDrawingsToClientsEnabled(
    project?.stream,
    streamSettingsJson,
    project
  );

  // Update contentEditable when emailPreviewBody changes and modal is open
  useEffect(() => {
    if (showEmailPreviewModal && emailBodyRef.current && emailPreviewBody) {
      // Only update if content is different to avoid cursor jumping
      if (emailBodyRef.current.innerHTML !== emailPreviewBody) {
        emailBodyRef.current.innerHTML = emailPreviewBody;
      }
    }
  }, [showEmailPreviewModal, emailPreviewBody]);

  // Update contentEditable when emailDrawingsToClientBody changes and modal is open
  useEffect(() => {
    if (showEmailDrawingsToClientModal && emailDrawingsToClientBodyRef.current && emailDrawingsToClientBody) {
      // Only update if content is different to avoid cursor jumping
      if (emailDrawingsToClientBodyRef.current.innerHTML !== emailDrawingsToClientBody) {
        emailDrawingsToClientBodyRef.current.innerHTML = emailDrawingsToClientBody;
      }
    }
  }, [showEmailDrawingsToClientModal, emailDrawingsToClientBody]);

  async function fetchDraftspersons() {
    try {
      const usersResponse = await fetch(`${API_URL}/api/users`);
      if (!usersResponse.ok) {
        throw new Error("Failed to fetch users");
      }
      const allUsers = await usersResponse.json();
      
      // Filter users who have "Architectural Draftsperson" or "Architectural Graduate" as one of their positions
      const draftspersons = allUsers.filter((user) => {
        if (!user.positions || !Array.isArray(user.positions)) return false;
        return user.positions.some((position) => {
          const positionName = position.name ? position.name.toLowerCase() : "";
          return positionName === "architectural draftsperson" || positionName === "architectural graduate";
        });
      });
      
      setDraftspersonUsers(draftspersons);
    } catch (error) {
      console.error("Error fetching draftspersons:", error);
      setDraftspersonUsers([]);
    }
  }

  /** Resolve position from users list by stored display name (sentinel → empty tokens). */
  async function getDraftspersonDetails(raw) {
    const stored = normalizeDraftspersonField(raw);
    if (!isDraftspersonAssigned(stored)) return { name: "", position: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { name: stored, position: "" };
      const users = await response.json();
      const lower = stored.toLowerCase();
      const user = users.find((u) => (u.name || "").trim().toLowerCase() === lower);
      if (!user) return { name: stored, position: "" };
      const position =
        user.positions && Array.isArray(user.positions) && user.positions.length > 0
          ? user.positions[0].name
          : "";
      return {
        name: user.name || "",
        position: position || "",
      };
    } catch (error) {
      console.error("Error fetching draftsperson details:", error);
      return { name: stored, position: "" };
    }
  }

  async function getSalespersonDetailsByName(salespersonName) {
    if (!salespersonName) return { position: "", phone: "", email: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { position: "", phone: "", email: "" };
      const users = await response.json();
      const user = users.find((u) => u.name === salespersonName);
      if (!user) return { position: "", phone: "", email: "" };
      const position =
        user.positions && Array.isArray(user.positions) && user.positions.length > 0
          ? user.positions[0].name
          : "";
      return {
        position: position || "",
        phone: user.phone || "",
        email: user.email || "",
      };
    } catch (error) {
      console.error("Error fetching salesperson details:", error);
      return { position: "", phone: "", email: "" };
    }
  }

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
          drawings_status: fieldName === "drawings_status" ? (value === "" ? null : String(value)) : currentValues.drawingsStatus,
          draftsperson:
            fieldName === "draftsperson"
              ? normalizeDraftspersonField(value)
              : normalizeDraftspersonField(currentValues.draftsperson),
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
        // Revert on error by calling onUpdate to refresh from server
        if (onUpdate) {
          onUpdate();
        }
      } else {
        console.log("Field saved successfully");
        // Refetch project so parent `project` matches DB (avoids useEffect / stale props undoing draftsperson).
        if (onUpdate && (fieldName === "draftsperson" || fieldName === "drawings_status")) {
          onUpdate(true);
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
      // Revert on error by calling onUpdate to refresh from server
      if (onUpdate) {
        onUpdate();
      }
    }
  }

  async function handleDraftspersonChange(e) {
    const chosen = normalizeDraftspersonField(e.target.value);
    setDraftsperson(chosen);
    valuesRef.current.draftsperson = chosen;

    // If draftsperson is selected and status is "Not Assigned", update to "Concept Stage"
    if (isDraftspersonAssigned(chosen) && drawingsStatus === "Not Assigned") {
      setDrawingsStatus("Concept Stage");
      valuesRef.current.drawingsStatus = "Concept Stage";
      await saveField("drawings_status", "Concept Stage");
    }
    await saveField("draftsperson", chosen);
  }

  async function applyConceptApproval() {
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
          drawings_status: "Working Drawing Stage",
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

      setDrawingsStatus("Working Drawing Stage");
      valuesRef.current.drawingsStatus = "Working Drawing Stage";
      
      // Refresh project so table gets updated drawings_history (green highlight for concept approved)
      if (onUpdate) {
        onUpdate();
      }
      console.log("Concept approved successfully");
      return true;
    } catch (error) {
      console.error("Error approving concept:", error);
      alert("Failed to approve concept");
      // Revert on error by calling onUpdate to refresh from server
      if (onUpdate) {
        onUpdate();
      }
      return false;
    }
  }

  async function applyWorkingDrawingsApproval() {
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
          drawings_status: "Drawings Complete",
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

      setDrawingsStatus("Drawings Complete");
      valuesRef.current.drawingsStatus = "Drawings Complete";

      // Refresh project so the drawings table re-renders (blue highlight)
      if (onUpdate) {
        onUpdate();
      }
      console.log("Working drawings approved successfully");
      return true;
    } catch (error) {
      console.error("Error approving working drawings:", error);
      // Revert on error by calling onUpdate to refresh from server
      if (onUpdate) {
        onUpdate();
      }
      alert("Failed to approve working drawings");
      return false;
    }
  }

  async function openApprovalEmailPreview(kind) {
    if (!project?.id) return;
    let settingsData = {};
    let templates = [];
    try {
      const [settingsRes, templatesRes] = await Promise.all([
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/email-templates`),
      ]);
      if (settingsRes.ok) settingsData = await settingsRes.json();
      if (templatesRes.ok) templates = await templatesRes.json();
    } catch (e) {
      console.warn("Could not load settings for approval email preview:", e);
    }

    const isConcept = kind === "concept";
    let previewFrom = "";
    let previewToList = [];

    if (isConcept) {
      previewFrom = resolveConceptApprovedFrom(settingsData, project, "");
      previewToList = resolveConceptApprovedToEmails(settingsData, project, []);
      if (!previewFrom || !String(previewFrom).trim()) {
        alert(
          "No sender email in Stream Settings → Drawings → Concept Approved — From. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }
      if (!previewToList.length) {
        alert(
          "No recipient addresses in Stream Settings → Drawings → Concept Approved — To. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }
    } else {
      previewFrom = resolveWdsApprovedFrom(settingsData, project, "");
      previewToList = resolveWdsApprovedToEmails(settingsData, project, []);
      if (!previewFrom || !String(previewFrom).trim()) {
        alert(
          "No sender email in Stream Settings → Drawings → WDs Approved — From. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }
      if (!previewToList.length) {
        alert(
          "No recipient addresses in Stream Settings → Drawings → WDs Approved — To. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }
    }

    const templateName = isConcept ? "DRAWINGS - Concept Approved" : "DRAWINGS - WDs Approved";
    const template = Array.isArray(templates) ? templates.find((t) => t?.name === templateName) : null;
    if (!template) {
      alert(`Email template "${templateName}" not found. Please create it in Settings → Email Templates.`);
      return;
    }
    const projectName =
      project?.street && project?.suburb ? `${project.street}, ${project.suburb}`.trim() : project?.name || "";
    let previewSubject = String(template.subject || "").replace(/\{ProjectName\}/g, projectName);
    let previewBody = String(template.body || "").replace(/\{ProjectName\}/g, projectName);
    const salespersonName = resolveRegionalSalespersonName(project);
    previewSubject = previewSubject.replace(/\{Salesperson\}/g, salespersonName);
    previewBody = previewBody.replace(/\{Salesperson\}/g, salespersonName);
    const needsSpDetails =
      /\{SalespersonPosition\}|\{SalespersonPhone\}|\{SalespersonEmail\}/.test(
        `${previewSubject}\n${previewBody}`
      );
    if (needsSpDetails && salespersonName) {
      const { position, phone, email } = await getSalespersonDetailsByName(salespersonName);
      const positionBody = position ? `<br>${position}` : "";
      const positionSubject = position || "";
      previewBody = previewBody
        .replace(/\{SalespersonPosition\}/g, positionBody)
        .replace(/\{SalespersonPhone\}/g, phone || "")
        .replace(/\{SalespersonEmail\}/g, email || "");
      previewSubject = previewSubject
        .replace(/\{SalespersonPosition\}/g, positionSubject)
        .replace(/\{SalespersonPhone\}/g, phone || "")
        .replace(/\{SalespersonEmail\}/g, email || "");
    } else {
      previewBody = previewBody
        .replace(/\{SalespersonPosition\}/g, "")
        .replace(/\{SalespersonPhone\}/g, "")
        .replace(/\{SalespersonEmail\}/g, "");
      previewSubject = previewSubject
        .replace(/\{SalespersonPosition\}/g, "")
        .replace(/\{SalespersonPhone\}/g, "")
        .replace(/\{SalespersonEmail\}/g, "");
    }

    setEmailPreviewTo(previewToList.join(", "));
    setEmailPreviewFrom(previewFrom);
    setEmailPreviewSubject(previewSubject);
    setEmailPreviewBody(previewBody);
    setEmailPreviewType(isConcept ? "concept_approval" : "working_approval");
    setShowEmailPreviewModal(true);
  }

  async function handleMarkConceptConfirmed() {
    if (!project?.id) return;
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === "string" ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
    }
    if (drawingsHistory.length === 0) {
      alert("No drawings have been uploaded yet.");
      return;
    }
    await openApprovalEmailPreview("concept");
  }

  async function handleMarkWorkingDrawingsConfirmed() {
    if (!project?.id) return;
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === "string" ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
    }
    if (drawingsHistory.length === 0) {
      alert("No drawings have been uploaded yet.");
      return;
    }

    await openApprovalEmailPreview("working");
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
          drawings_status: "Not Assigned",
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
      setDrawingsStatus("Not Assigned");
      valuesRef.current.drawingsStatus = "Not Assigned";
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

  function openDrawingsPathErrorModal(message) {
    setDrawingsPathErrorMessage(String(message || "Something went wrong."));
    setShowDrawingsPathErrorModal(true);
  }

  function closeDrawingsFolderMissingModal() {
    setShowDrawingsFolderMissingModal(false);
  }

  function closeDrawingsPathErrorModal() {
    setShowDrawingsPathErrorModal(false);
    setDrawingsPathErrorMessage("");
  }

  /** 409 from verify endpoint, or same semantics if `code` is missing from body. */
  function isVerifyFolderMissingResponse(status, data) {
    if (status !== 409) return false;
    const d = data && typeof data === "object" ? data : {};
    if (d.code === "DRAWINGS_JOB_FOLDER_NOT_FOUND") return true;
    if (typeof d.error === "string" && /folder not found/i.test(d.error)) return true;
    return d.ok === false;
  }

  function showFolderMissingUiFromVerifyBody(_verifyData) {
    setShowDrawingsFolderMissingModal(true);
  }

  async function saveDrawingsPath(file) {
    if (!file) return;
    if (!project?.id) {
      openDrawingsPathErrorModal("Project ID is missing.");
      return;
    }

    try {
      const fileName = file.name;

      let publishedPlansDir = drawingUploadPreverifiedPublishedPlansDirRef.current;
      const hadPreverified = typeof publishedPlansDir === "string" && publishedPlansDir.length > 0;
      if (!hadPreverified) {
        const verifyRes = await fetch(
          `${API_URL}/api/projects/${project.id}/verify-drawings-job-folder`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
        );
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok) {
          if (isVerifyFolderMissingResponse(verifyRes.status, verifyData)) {
            showFolderMissingUiFromVerifyBody(verifyData);
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
          }
          throw new Error(verifyData.error || "Could not verify job folder on disk");
        }
        publishedPlansDir = verifyData.publishedPlansDir;
      }

      if (!publishedPlansDir || typeof publishedPlansDir !== "string") {
        throw new Error("Server did not return the PUBLISHED PLANS folder path");
      }
      const sep = publishedPlansDir.includes("\\") ? "\\" : "/";
      const filePath = `${String(publishedPlansDir).replace(/[/\\]+$/, "")}${sep}${fileName}`;

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
        markup_pdf_location: null, // Initialize with no markup
        sent_to_client_date: null // Set when user clicks Send to Client for this revision
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
          drawings_status: valuesRef.current.drawingsStatus || null,
          draftsperson: normalizeDraftspersonField(valuesRef.current.draftsperson),
          drawings_pdf_location: filePath,
          drawings_history: JSON.stringify(drawingsHistory),
          drawings_viewed_date: project?.drawings_viewed_date || null, // Preserve existing viewed date
          drawings_holder: "sales team", // When drawings are uploaded, sales team has them
          drawings_holder_date: new Date().toISOString().split('T')[0], // Update date when drawings are uploaded
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

      if (hadPreverified) {
        drawingUploadPreverifiedPublishedPlansDirRef.current = null;
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
      setMarkupFile(null);
      setNewDrawingUploadKind("");
      setShowNotesModal(true);
    } catch (error) {
      console.error("Error saving drawings path:", error);
      openDrawingsPathErrorModal(error.message || "Failed to save drawings path");
    }
  }

  function hasDraftspersonAssigned() {
    return isDraftspersonAssigned(draftsperson);
  }

  async function beginDrawingPdfUpload(file) {
    if (!file) return;
    if (drawingsFolderCheckPending) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please select a PDF file");
      return;
    }
    if (!project?.id) {
      openDrawingsPathErrorModal("Project ID is missing.");
      return;
    }

    drawingUploadPreverifiedPublishedPlansDirRef.current = null;
    setDrawingsFolderCheckPending(true);
    try {
      let verifyRes;
      let verifyData;
      try {
        verifyRes = await fetch(
          `${API_URL}/api/projects/${project.id}/verify-drawings-job-folder`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
        );
        verifyData = await verifyRes.json().catch(() => ({}));
      } catch (netErr) {
        console.error("verify-drawings-job-folder fetch failed:", netErr);
        openDrawingsPathErrorModal(
          netErr?.message || "Could not reach the server to verify the job folder. Check your connection and try again."
        );
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      if (isVerifyFolderMissingResponse(verifyRes.status, verifyData)) {
        showFolderMissingUiFromVerifyBody(verifyData);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      if (!verifyRes.ok) {
        openDrawingsPathErrorModal(verifyData.error || "Could not verify job folder on disk");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const publishedPlansDir = verifyData.publishedPlansDir;
      if (!publishedPlansDir || typeof publishedPlansDir !== "string") {
        openDrawingsPathErrorModal("Server did not return the PUBLISHED PLANS folder path.");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      drawingUploadPreverifiedPublishedPlansDirRef.current = publishedPlansDir;
      setSelectedFile(file);

      if (!hasDraftspersonAssigned()) {
        setPendingPdfFile(file);
        setDraftspersonModalChoice(DRAFTSPERSON_UNASSIGNED);
        setShowDraftspersonRequiredModal(true);
        return;
      }
      await saveDrawingsPath(file);
    } catch (e) {
      console.error("beginDrawingPdfUpload:", e);
      openDrawingsPathErrorModal(e?.message || "Something went wrong while starting the upload.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setDrawingsFolderCheckPending(false);
    }
  }

  async function handleConfirmDraftspersonForUpload() {
    const nameToSave = normalizeDraftspersonField(draftspersonModalChoice);
    if (!isDraftspersonAssigned(nameToSave)) {
      alert("Please select a draftsperson before uploading drawings.");
      return;
    }
    setDraftsperson(nameToSave);
    valuesRef.current.draftsperson = nameToSave;
    if (drawingsStatus === "Not Assigned") {
      setDrawingsStatus("Concept Stage");
      valuesRef.current.drawingsStatus = "Concept Stage";
      await saveField("drawings_status", "Concept Stage");
    }
    await saveField("draftsperson", nameToSave);
    const file = pendingPdfFile;
    setShowDraftspersonRequiredModal(false);
    setPendingPdfFile(null);
    setDraftspersonModalChoice(DRAFTSPERSON_UNASSIGNED);
    if (file) {
      await saveDrawingsPath(file);
    }
  }

  function handleCancelDraftspersonRequiredModal() {
    setShowDraftspersonRequiredModal(false);
    setPendingPdfFile(null);
    setDraftspersonModalChoice(DRAFTSPERSON_UNASSIGNED);
    drawingUploadPreverifiedPublishedPlansDirRef.current = null;
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await beginDrawingPdfUpload(files[0]);
    }
  }

  async function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      await beginDrawingPdfUpload(files[0]);
    }
  }

  function handleBrowseClick() {
    if (drawingsFolderCheckPending) return;
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
          drawings_status: valuesRef.current.drawingsStatus || project?.drawings_status || null,
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

  /** Set sent_to_client_date to today for the current (latest) revision and save. */
  async function saveSentToClientDateForCurrentRevision() {
    if (!project?.id) return;
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === "string" ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
      return;
    }
    if (drawingsHistory.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    drawingsHistory[drawingsHistory.length - 1] = {
      ...drawingsHistory[drawingsHistory.length - 1],
      sent_to_client_date: today,
    };
    const projectName = project?.street && project?.suburb ? `${project.street}, ${project.suburb}`.trim() : project?.name || "";
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
      if (!response.ok) throw new Error("Failed to save sent to client date");
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error("Error saving sent_to_client_date:", err);
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
    setMarkupFile(null);
    setNewDrawingUploadKind("");
    setShowNotesModal(true);
  }

  function handleOpenSalesNotesModal(index, revision, name) {
    // Get current sales notes for this revision
    let drawingsHistory = [];
    try {
      const historyValue = project?.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
    }

    const currentSalesNotes = drawingsHistory[index]?.sales_notes || "";
    // Check if this is the current (last) revision
    const isCurrentRevision = index === drawingsHistory.length - 1;
    setSalesNotesForRevision({ 
      index, 
      revision, 
      name, 
      isCurrentRevision 
    });
    setSalesNotesText(currentSalesNotes);
    setShowSalesNotesModal(true);
  }

  async function saveSalesNotesForRevision(revisionIndex, salesNotes) {
    if (!project?.id) return;
    
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

      // Update sales notes for the specific revision
      drawingsHistory[revisionIndex] = {
        ...drawingsHistory[revisionIndex],
        sales_notes: salesNotes || ""
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
        throw new Error("Failed to save sales notes");
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error saving sales notes:", error);
      alert("Failed to save sales notes");
    }
  }

  async function handleSaveNotes() {
    if (notesForRevision === null) return;
    
    await saveNotesForRevision(notesForRevision.index, notesText);
    setShowNotesModal(false);
    setNotesForRevision(null);
    setNotesText("");
    setNewDrawingUploadKind("");
  }

  /**
   * Load a drawings email template and apply project / draftsperson / client tokens.
   * Used for Send to Client and Send Drawings to.. (logo is added server-side on send).
   */
  async function buildDrawingsTemplateEmail(templateName) {
    try {
      const templateResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templateResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templateResponse.json();
      const template = templates.find((t) => t.name === templateName);

      if (!template) {
        return {
          ok: false,
          error: `Email template "${templateName}" not found. Please create it in Settings → Email Templates.`,
        };
      }

      const projectName =
        project?.street && project?.suburb
          ? `${project.street}, ${project.suburb}`.trim()
          : project?.name || "";

      const { name: draftspersonName, position: draftspersonPosition } = await getDraftspersonDetails(
        project.draftsperson
      );

      const activeClientFirstNames = [];
      if (project?.client1_active === "true" && project?.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0];
        if (firstName) activeClientFirstNames.push(firstName);
      }
      if (project?.client2_active === "true" && project?.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0];
        if (firstName) activeClientFirstNames.push(firstName);
      }
      if (project?.client3_active === "true" && project?.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0];
        if (firstName) activeClientFirstNames.push(firstName);
      }

      let clientName = "";
      if (activeClientFirstNames.length === 1) {
        clientName = activeClientFirstNames[0];
      } else if (activeClientFirstNames.length === 2) {
        clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
      } else if (activeClientFirstNames.length >= 3) {
        clientName = `${activeClientFirstNames.slice(0, -1).join(", ")} & ${
          activeClientFirstNames[activeClientFirstNames.length - 1]
        }`;
      }

      const activeClientEmails = [];
      if (project?.email && project.email.trim()) {
        activeClientEmails.push(project.email);
      }
      if (project?.client1_active === "true" && project?.client1_email && project.client1_email.trim()) {
        activeClientEmails.push(project.client1_email);
      }
      if (project?.client2_active === "true" && project?.client2_email && project.client2_email.trim()) {
        activeClientEmails.push(project.client2_email);
      }
      if (project?.client3_active === "true" && project?.client3_email && project.client3_email.trim()) {
        activeClientEmails.push(project.client3_email);
      }

      let body = template.body || "";
      body = body.replace(/{ProjectName}/g, projectName);
      body = body.replace(/{ClientName}/g, clientName);
      body = body.replace(/{Draftsperson}/g, draftspersonName);
      body = body.replace(/{Position}/g, draftspersonPosition);
      body = body.replace(
        /{Contact1}/g,
        project?.client1_active === "true" && project?.client1_email ? project.client1_email : ""
      );
      body = body.replace(
        /{Contact2}/g,
        project?.client2_active === "true" && project?.client2_email ? project.client2_email : ""
      );
      body = body.replace(
        /{Contact3}/g,
        project?.client3_active === "true" && project?.client3_email ? project.client3_email : ""
      );

      if (templateName === "DRAWINGS - Client - CONCEPT") {
        body += "<!-- CONCEPT -->";
      }

      let subject = template.subject || "";
      subject = subject.replace(/{ProjectName}/g, projectName);
      subject = subject.replace(/{ClientName}/g, clientName);
      subject = subject.replace(/{Draftsperson}/g, draftspersonName);
      subject = subject.replace(/{Position}/g, draftspersonPosition);
      subject = subject.replace(
        /{Contact1}/g,
        project?.client1_active === "true" && project?.client1_email ? project.client1_email : ""
      );
      subject = subject.replace(
        /{Contact2}/g,
        project?.client2_active === "true" && project?.client2_email ? project.client2_email : ""
      );
      subject = subject.replace(
        /{Contact3}/g,
        project?.client3_active === "true" && project?.client3_email ? project.client3_email : ""
      );

      const salespersonName = resolveRegionalSalespersonName(project);
      body = body.replace(/{Salesperson}/g, salespersonName);
      subject = subject.replace(/{Salesperson}/g, salespersonName);
      const needsSalespersonDetails =
        (body.includes("{SalespersonPosition}") ||
          body.includes("{SalespersonPhone}") ||
          body.includes("{SalespersonEmail}") ||
          subject.includes("{SalespersonPosition}") ||
          subject.includes("{SalespersonPhone}") ||
          subject.includes("{SalespersonEmail}")) &&
        salespersonName;
      if (needsSalespersonDetails) {
        const { position, phone, email } = await getSalespersonDetailsByName(salespersonName);
        const positionBody = position ? `<br>${position}` : "";
        const positionSubject = position || "";
        body = body.replace(/{SalespersonPosition}/g, positionBody);
        subject = subject.replace(/{SalespersonPosition}/g, positionSubject);
        body = body.replace(/{SalespersonPhone}/g, phone || "");
        subject = subject.replace(/{SalespersonPhone}/g, phone || "");
        body = body.replace(/{SalespersonEmail}/g, email || "");
        subject = subject.replace(/{SalespersonEmail}/g, email || "");
      } else {
        body = body
          .replace(/{SalespersonPosition}/g, "")
          .replace(/{SalespersonPhone}/g, "")
          .replace(/{SalespersonEmail}/g, "");
        subject = subject
          .replace(/{SalespersonPosition}/g, "")
          .replace(/{SalespersonPhone}/g, "")
          .replace(/{SalespersonEmail}/g, "");
      }

      return {
        ok: true,
        template,
        subject,
        body,
        activeClientEmails,
      };
    } catch (error) {
      console.error("Error preparing email:", error);
      return { ok: false, error: error.message || "Failed to prepare email" };
    }
  }

  async function loadVicSmtpFromOptions() {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) return [];
      const s = await res.json();
      const opts = [];
      for (let i = 1; i <= 16; i++) {
        const u = s[`smtp_user_${i}`];
        if (u && String(u).trim()) {
          opts.push({ value: String(u).trim(), label: `SMTP ${i}` });
        }
      }
      return opts;
    } catch (e) {
      console.error("Error loading SMTP settings:", e);
      return [];
    }
  }

  async function handleSendDrawingsMailto() {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }
    if (!project.drawings_pdf_location) {
      alert("No drawings PDF has been set for this project yet.");
      return;
    }

    const built = await buildDrawingsTemplateEmail("DRAWINGS - Send to");
    if (!built.ok) {
      alert(built.error);
      return;
    }

    let settingsData = {};
    try {
      const settingsRes = await fetch(`${API_URL}/api/settings`);
      if (settingsRes.ok) settingsData = await settingsRes.json();
    } catch (e) {
      console.warn("Could not load settings for drawing send:", e);
    }
    const fromVal = resolveDesignToSalespersonFrom(settingsData, project, "");
    if (!fromVal || !String(fromVal).trim()) {
      alert("No sender email found in Stream Settings for this stream/state.");
      return;
    }

    setVicSmtpFromOptions([]);
    setEmailDrawingsFlowKind("sendTo");
    setEmailDrawingsToClientTo("");
    setEmailDrawingsToClientFrom(fromVal);
    setEmailDrawingsToClientSubject(built.subject);
    setEmailDrawingsToClientBody(built.body);
    setShowEmailDrawingsToClientModal(true);
  }

  async function handleEmailDrawingsToClient() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    let templateName = "";
    if (drawingsStatus === "Drawings Complete") {
      templateName = "DRAWINGS - Client - General";
    } else if (drawingsStatus === "Concept Stage") {
      templateName = "DRAWINGS - Client - CONCEPT";
    } else if (drawingsStatus === "Working Drawing Stage") {
      templateName = "DRAWINGS - Client - WD";
    } else {
      alert(
        "Please set the drawings status to Concept Stage, Working Drawing Stage, or Drawings Complete before sending to client."
      );
      return;
    }

    const built = await buildDrawingsTemplateEmail(templateName);
    if (!built.ok) {
      alert(built.error);
      return;
    }

    const clientTo = sendDrawingsToClientsEnabled ? getProjectClientEmailsForDrawings(project) : [];
    const extraTo = getStreamExtraDrawingEmails(project.stream, streamSettingsJson, project);
    const allTo = mergeUniqueEmails(clientTo, extraTo);

    let settingsForFrom = {};
    try {
      const sr = await fetch(`${API_URL}/api/settings`);
      if (sr.ok) settingsForFrom = await sr.json();
    } catch (e) {
      console.warn("Could not load settings for drawing From override:", e);
    }
    const clientFromResolved = resolveSalespersonToClientFrom(settingsForFrom, project, "");
    const templateToList = parseEmailTemplateToAddressList(built.template.to_addresses);
    const clientToResolved = resolveSalespersonToClientToEmails(
      settingsForFrom,
      project,
      templateToList,
      allTo
    );

    if (!clientFromResolved || !String(clientFromResolved).trim()) {
      alert(
        "No sender email in Stream Settings for this stream (Send Drawings to Client — From). Configure Settings → Stream Settings → Drawings."
      );
      return;
    }
    if (!clientToResolved.length) {
      alert(
        "No recipient addresses for this send. Add stream extra emails in Settings → Stream Settings, enable Send to Clients, and/or add active client emails on the project."
      );
      return;
    }

    setVicSmtpFromOptions([]);
    setEmailDrawingsFlowKind("client");
    setEmailDrawingsToClientTo(clientToResolved.join(", "));
    setEmailDrawingsToClientFrom(clientFromResolved);
    setEmailDrawingsToClientSubject(built.subject);
    setEmailDrawingsToClientBody(built.body);
    setShowEmailDrawingsToClientModal(true);
  }

  async function handleSendEmailDrawingsToClient() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    let toAddresses = emailDrawingsToClientTo.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
    if (emailDrawingsFlowKind === "client") {
      toAddresses = stripProjectClientEmailsWhenDisabled(toAddresses, project, sendDrawingsToClientsEnabled);
    }
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!emailDrawingsToClientFrom || !emailDrawingsToClientFrom.trim()) {
      alert("From address is required");
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
        const response = await fetch(`${API_URL}/api/emails/send-drawings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...emailLinkBaseForApiBody(),
            projectId: project.id,
            toEmails: toAddresses,
            customBody: emailDrawingsToClientBody,
            from: emailDrawingsToClientFrom,
            subject: emailDrawingsToClientSubject,
            attachDrawings: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || "Failed to send drawings email");
        }

        await response.json().catch(() => ({}));
        alert("Drawings email sent successfully!");
      });

      if (emailDrawingsFlowKind === "client") {
        await saveDrawingsHolder("client");
        await saveSentToClientDateForCurrentRevision();
      }

      setVicSmtpFromOptions([]);
      setEmailDrawingsFlowKind("client");
      setShowEmailDrawingsToClientModal(false);
    } catch (error) {
      console.error("Error sending drawings email:", error);
      alert(`Failed to send drawings email: ${error.message}`);
    }
  }

  async function handleSendDrawingsWithNotes() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    // Don't attach drawings - just send the email after preview confirms.

    /** New uploads: persist status + notes + markup first, then show preview like other drafts. */
    if (notesForRevision?.isNewDrawing) {
      if (isSendingDraftingEmail) return;

      if (!newDrawingUploadKind) {
        alert("Please select whether these drawings are concept drawings or working drawings.");
        return;
      }

      const nextDrawingsStatus =
        newDrawingUploadKind === "concept" ? "Concept Stage" : "Working Drawing Stage";

      setIsSendingDraftingEmail(true);
      try {
        setDrawingsStatus(nextDrawingsStatus);
        valuesRef.current.drawingsStatus = nextDrawingsStatus;
        await saveField("drawings_status", nextDrawingsStatus);

        await saveNotesForRevision(notesForRevision.index, notesText);

        if (markupFile) {
          await saveMarkupPath(markupFile, notesForRevision.index);
        }
      } catch (error) {
        console.error("Error saving before drafting email preview:", error);
        alert(error.message || "Failed to save notes before preview.");
        return;
      } finally {
        setIsSendingDraftingEmail(false);
      }
      // Fall through to shared template preview below (with isNewDrawing heading)
    }

    // If current revision updates (but not handled above): save notes first
    if (
      notesForRevision &&
      notesForRevision.isCurrentRevision &&
      !notesForRevision.isNewDrawing
    ) {
      await saveNotesForRevision(notesForRevision.index, notesText);
    }

    // Fetch email template
    try {
      const templateResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templateResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templateResponse.json();
      const template = templates.find(t => t.name === "DRAWINGS - Design to Sales");
      
      if (!template) {
        alert('Email template "DRAWINGS - Design to Sales" not found. Please create it in Settings → Email Templates.');
        return;
      }

      // Get project name
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      // Get draftsperson details
      const { name: draftspersonName, position: draftspersonPosition } = await getDraftspersonDetails(project.draftsperson);

      // Build email body - insert notes after {ProjectName}
      let body = template.body || "";
      
      // Insert notes after {ProjectName} if notes exist
      if (notesText && notesText.trim()) {
        // Convert newlines to <br> tags for HTML rendering
        const notesHtml = notesText.trim().replace(/\n/g, "<br>");
        // Use different heading based on whether it's a new drawing or current revision update
        const heading = notesForRevision?.isNewDrawing 
          ? "<b>Drafting Notes</b><br>" 
          : "<b>Ammended Drafting Notes</b><br>";
        
        const notesWithHeading = heading + notesHtml;
        
        // Find {ProjectName} token and insert notes after it
        const projectNameTokenIndex = body.indexOf("{ProjectName}");
        if (projectNameTokenIndex !== -1) {
          const insertIndex = projectNameTokenIndex + "{ProjectName}".length;
          body = body.slice(0, insertIndex) + "<br><br>" + notesWithHeading + body.slice(insertIndex);
        } else {
          // If {ProjectName} not found, try to find the replaced projectName
          const projectNameIndex = body.indexOf(projectName);
          if (projectNameIndex !== -1) {
            const insertIndex = projectNameIndex + projectName.length;
            body = body.slice(0, insertIndex) + "<br><br>" + notesWithHeading + body.slice(insertIndex);
          } else {
            // If neither found, just prepend notes
            body = notesWithHeading + "<br><br>" + body;
          }
        }
      }
      
      // Replace {ProjectName} after inserting notes
      body = body.replace(/{ProjectName}/g, projectName);

      // Replace other tokens
      body = body.replace(/{Draftsperson}/g, draftspersonName);
      body = body.replace(/{Position}/g, draftspersonPosition);

      // Replace subject tokens
      let subject = template.subject || "";
      subject = subject.replace(/{ProjectName}/g, projectName);
      subject = subject.replace(/{Draftsperson}/g, draftspersonName);
      subject = subject.replace(/{Position}/g, draftspersonPosition);

      const templateToList = parseEmailTemplateToAddressList(template.to_addresses);

      let settingsForPreview = {};
      try {
        const settingsRes = await fetch(`${API_URL}/api/settings`);
        if (settingsRes.ok) settingsForPreview = await settingsRes.json();
      } catch (e) {
        console.warn("Could not load settings for drawing From override:", e);
      }
      const previewToResolved = resolveDesignNotesToEmails(
        settingsForPreview,
        project,
        templateToList
      );
      const previewFromResolved = resolveDesignNotesFrom(settingsForPreview, project, "");

      if (!previewToResolved.length) {
        alert(
          "No recipient addresses in Stream Settings → Drawings → Design Notes — To. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }
      if (!previewFromResolved || !String(previewFromResolved).trim()) {
        alert(
          "No sender email in Stream Settings → Drawings → Design Notes — From. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }

      // Open preview modal
      setEmailPreviewTo(previewToResolved.join(", "));
      setEmailPreviewFrom(previewFromResolved);
      setEmailPreviewSubject(subject);
      setEmailPreviewBody(body);
      setEmailPreviewType("drafting"); // Mark as drafting notes email
      setShowEmailPreviewModal(true);
    } catch (error) {
      console.error("Error preparing email:", error);
      alert(`Failed to prepare email: ${error.message}`);
    }
  }

  async function saveDrawingsHolder(holder) {
    if (!project?.id) return;
    
    try {
      // Update the date whenever holder changes
      const holderDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
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
          drawings_holder_date: holderDate,
          draftsperson: normalizeDraftspersonField(project?.draftsperson),
          drawings_holder: holder,
          colours_status: project?.colours_status || null,
          planning_status: project?.planning_status || null,
          energy_report_status: project?.energy_report_status || null,
          footing_certification_status: project?.footing_certification_status || null,
          building_permit_status: project?.building_permit_status || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save drawings holder");
      }

      // Update local state optimistically
      setDrawingsHolder(holder);
      
      // Success - local state already updated, no need to call onUpdate
      console.log("Drawings holder saved successfully");
    } catch (error) {
      console.error("Error saving drawings holder:", error);
      // Revert on error by calling onUpdate to refresh from server
      if (onUpdate) {
        onUpdate();
      }
    }
  }

  function closeEmailPreviewModal() {
    setShowEmailPreviewModal(false);
    setEmailPreviewType(null);
  }

  async function handleSendFromPreview() {
    const isApprovalEmail =
      emailPreviewType === "concept_approval" || emailPreviewType === "working_approval";
    if (isApprovalEmail) {
      const toAddresses = emailPreviewTo.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
      const fromForApproval = (emailPreviewFrom || "").trim();
      if (toAddresses.length === 0) {
        alert("Please enter at least one recipient email address.");
        return;
      }
      if (!fromForApproval) {
        alert("Please enter a From address.");
        return;
      }

      try {
        await runWithEmailOverlay(async () => {
          const response = await fetch(`${API_URL}/api/emails/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: toAddresses,
              from: fromForApproval,
              subject: emailPreviewSubject || "",
              htmlBody: emailPreviewBody || "",
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Failed to send email");
          }
        });

        const approvalOk =
          emailPreviewType === "concept_approval"
            ? await applyConceptApproval()
            : await applyWorkingDrawingsApproval();
        if (!approvalOk) return;

        alert("Approval email sent successfully!");
        closeEmailPreviewModal();
        return;
      } catch (error) {
        console.error("Error sending approval email:", error);
        alert(`Failed to send email: ${error.message}`);
        return;
      }
    }

    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    const toAddresses = emailPreviewTo.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
    const fromForSend = (emailPreviewFrom || "").trim();
    if (toAddresses.length === 0) {
      alert("Please enter at least one recipient email address.");
      return;
    }
    if (!fromForSend) {
      alert("Please enter a From address.");
      return;
    }

    // Don't attach drawings - just send the email
    try {
      await runWithEmailOverlay(async () => {
        const response = await fetch(`${API_URL}/api/emails/send-drawings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...emailLinkBaseForApiBody(),
            projectId: project.id,
            toEmails: toAddresses,
            customBody: emailPreviewBody,
            from: fromForSend,
            subject: emailPreviewSubject,
            attachDrawings: false,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || "Failed to send drawings email");
        }

        await response.json();
        alert("Drawings email sent successfully!");
      });

      // Update drawings holder based on email type
      if (emailPreviewType === "sales") {
        // Sales notes sent - design team now has the drawings
        await saveDrawingsHolder("design team");
        setShowSalesNotesModal(false);
        setSalesNotesForRevision(null);
        setSalesNotesText("");
      }
      // Drafting notes don't change the holder (design team keeps them)

      // Close modals after sending
      closeEmailPreviewModal();
      setShowNotesModal(false);
      setNotesForRevision(null);
      setNotesText("");
      setMarkupFile(null);
      setNewDrawingUploadKind("");
    } catch (error) {
      console.error("Error sending drawings email:", error);
      alert(`Failed to send drawings email: ${error.message}`);
    }
  }

  function handleCloseNotesModal() {
    setShowNotesModal(false);
    setNotesForRevision(null);
    setNotesText("");
    setMarkupFile(null);
    setNewDrawingUploadKind("");
    setIsDraggingMarkup(false);
    setIsSendingDraftingEmail(false);
  }

  async function handleSendSalesNotes() {
    if (!project || !project.id) {
      alert("Error: Project ID is missing");
      return;
    }

    // If this is the current revision, save sales notes first
    if (salesNotesForRevision && salesNotesForRevision.isCurrentRevision) {
      await saveSalesNotesForRevision(salesNotesForRevision.index, salesNotesText);
    }

    // Fetch email template
    try {
      const templateResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templateResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templateResponse.json();
      const template = templates.find(t => t.name === "DRAWINGS - Sales to Design");
      
      if (!template) {
        alert('Email template "DRAWINGS - Sales to Design" not found. Please create it in Settings → Email Templates.');
        return;
      }

      // Get project name
      const projectName = project?.street && project?.suburb 
        ? `${project.street}, ${project.suburb}`.trim() 
        : project?.name || "";

      // Get draftsperson details
      const { name: draftspersonName, position: draftspersonPosition } = await getDraftspersonDetails(project.draftsperson);

      // Build email body - insert sales notes after {ProjectName}
      let body = template.body || "";
      
      // Insert sales notes after {ProjectName} if notes exist
      if (salesNotesText && salesNotesText.trim()) {
        // Convert newlines to <br> tags for HTML rendering
        const notesHtml = salesNotesText.trim().replace(/\n/g, "<br>");
        // Use heading for sales notes
        const heading = "<b>Sales Notes</b><br>";
        
        const notesWithHeading = heading + notesHtml;
        
        // Find {ProjectName} token and insert notes after it
        const projectNameTokenIndex = body.indexOf("{ProjectName}");
        if (projectNameTokenIndex !== -1) {
          const insertIndex = projectNameTokenIndex + "{ProjectName}".length;
          body = body.slice(0, insertIndex) + "<br><br>" + notesWithHeading + body.slice(insertIndex);
        } else {
          // If {ProjectName} not found, try to find the replaced projectName
          const projectNameIndex = body.indexOf(projectName);
          if (projectNameIndex !== -1) {
            const insertIndex = projectNameIndex + projectName.length;
            body = body.slice(0, insertIndex) + "<br><br>" + notesWithHeading + body.slice(insertIndex);
          } else {
            // If neither found, just prepend notes
            body = notesWithHeading + "<br><br>" + body;
          }
        }
      }
      
      // Replace {ProjectName} after inserting notes
      body = body.replace(/{ProjectName}/g, projectName);

      // Replace other tokens
      body = body.replace(/{Draftsperson}/g, draftspersonName);
      body = body.replace(/{Position}/g, draftspersonPosition);

      // Replace subject tokens
      let subject = template.subject || "";
      subject = subject.replace(/{ProjectName}/g, projectName);
      subject = subject.replace(/{Draftsperson}/g, draftspersonName);
      subject = subject.replace(/{Position}/g, draftspersonPosition);

      let settingsForSalesPreview = {};
      try {
        const settingsRes = await fetch(`${API_URL}/api/settings`);
        if (settingsRes.ok) settingsForSalesPreview = await settingsRes.json();
      } catch (e) {
        console.warn("Could not load settings for Sales→Design From/To:", e);
      }
      const previewToResolved = resolveSalesToDesignToEmails(
        settingsForSalesPreview,
        project,
        []
      );
      const previewFromResolved = resolveSalesToDesignFrom(settingsForSalesPreview, project, "");

      if (!previewToResolved.length) {
        alert(
          "No recipient addresses in Stream Settings → Drawings → Sales Notes — To. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }
      if (!previewFromResolved || !String(previewFromResolved).trim()) {
        alert(
          "No sender email in Stream Settings → Drawings → Sales Notes — From. Configure Settings → Stream Settings → Drawings."
        );
        return;
      }

      setEmailPreviewTo(previewToResolved.join(", "));
      setEmailPreviewFrom(previewFromResolved);
      setEmailPreviewSubject(subject);
      setEmailPreviewBody(body);
      setEmailPreviewType("sales"); // Mark as sales notes email
      setShowEmailPreviewModal(true);
    } catch (error) {
      console.error("Error preparing email:", error);
      alert(`Failed to prepare email: ${error.message}`);
    }
  }

  async function handleSaveSalesNotes() {
    if (salesNotesForRevision === null) return;
    
    await saveSalesNotesForRevision(salesNotesForRevision.index, salesNotesText);
    setShowSalesNotesModal(false);
    setSalesNotesForRevision(null);
    setSalesNotesText("");
  }

  function handleCloseSalesNotesModal() {
    setShowSalesNotesModal(false);
    setSalesNotesForRevision(null);
    setSalesNotesText("");
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

      const state = (project.state || "").toUpperCase();
      if (!state) {
        alert("Error: Project state is required to save markup path. Please set the state in Project Info.");
        return;
      }

      let rootDirectory = "";
      if (state === "VIC" || state === "VICTORIA") {
        rootDirectory = settings.root_directory || "";
      } else if (state === "QLD" || state === "QUEENSLAND") {
        rootDirectory = settings.root_directory_qld || settings.root_directory || "";
      } else {
        rootDirectory = settings.root_directory || "";
      }

      if (!rootDirectory) {
        alert("Error: Root directory is not set. Please configure it in File Settings.");
        return;
      }

      const projectYear = folderYearFromProjectYear(project.year);
      
      // Construct the file path: root_directory\year\state\suburb - street\1. DRAFTING\DESIGN NOTES\filename
      const fileName = file.name;
      const projectFolderName = buildJobFolderNameSegment(project.suburb, project.street);
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
          drawings_status: valuesRef.current.drawingsStatus || project?.drawings_status || null,
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

  function getDrawingsClientRecipients() {
    const emails = [];
    const labels = [];

    if (project?.email && project.email.trim()) {
      emails.push(project.email);
      labels.push(project?.client_name || "Primary Client");
    }

    if (project?.client1_active === "true" && project?.client1_email && project.client1_email.trim()) {
      emails.push(project.client1_email);
      labels.push(project?.client1_name || "Contact 1");
    }

    if (project?.client2_active === "true" && project?.client2_email && project.client2_email.trim()) {
      emails.push(project.client2_email);
      labels.push(project?.client2_name || "Contact 2");
    }

    if (project?.client3_active === "true" && project?.client3_email && project.client3_email.trim()) {
      emails.push(project.client3_email);
      labels.push(project?.client3_name || "Contact 3");
    }

    return { emails, labels };
  }

  function handleEmailClient() {
    const { emails: clientEmails } = getDrawingsClientRecipients();
    const extraEmails = getStreamExtraDrawingEmails(project?.stream, streamSettingsJson, project);
    const hasClients = sendDrawingsToClientsEnabled && clientEmails.length > 0;
    if (!hasClients && extraEmails.length === 0) {
      alert(
        "No recipients for this send. Add stream extra emails in Settings → Stream Settings, enable Send to Clients, and/or add active client emails on the project."
      );
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

    const { emails: clientEmails } = getDrawingsClientRecipients();
    const extraEmails = getStreamExtraDrawingEmails(project.stream, streamSettingsJson, project);
    const clientTo = sendDrawingsToClientsEnabled ? clientEmails : [];
    const activeEmails = mergeUniqueEmails(clientTo, extraEmails);
    if (activeEmails.length === 0) {
      alert(
        "No recipients for this send. Add stream extra emails in Settings → Stream Settings, enable Send to Clients, and/or add active client emails on the project."
      );
      return;
    }

    if (attachDrawings && !project.drawings_pdf_location) {
      alert("No drawings PDF available to attach.");
      return;
    }

    let sendFromOverride = "";
    let toEmailsResolved = activeEmails;
    try {
      const settingsRes = await fetch(`${API_URL}/api/settings`);
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      sendFromOverride = resolveSalespersonToClientFrom(settingsData, project, "");
      toEmailsResolved = resolveSalespersonToClientToEmails(
        settingsData,
        project,
        [],
        activeEmails
      );
    } catch (e) {
      console.warn("Could not resolve From/To for client drawings email:", e);
    }

    if (!sendFromOverride || !String(sendFromOverride).trim()) {
      alert(
        "No sender email in Stream Settings (Send Drawings to Client — From). Configure Settings → Stream Settings → Drawings."
      );
      return;
    }

    if (!toEmailsResolved || toEmailsResolved.length === 0) {
      alert(
        "No recipient addresses for this send. Add stream extra emails in Settings → Stream Settings, enable Send to Clients, and/or add active client emails on the project."
      );
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
        const response = await fetch(`${API_URL}/api/emails/send-drawings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...emailLinkBaseForApiBody(),
            projectId: project.id,
            toEmails: toEmailsResolved,
            from: String(sendFromOverride).trim(),
            notes: emailClientNotes,
            attachDrawings: attachDrawings,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || "Failed to send email");
        }

        await response.json();
        const emailList = activeEmails.join(", ");
        alert(`Email sent successfully to ${emailList}!`);
      });
      handleCloseEmailClientModal();
    } catch (error) {
      console.error("Error sending email:", error);
      alert(`Failed to send email: ${error.message}`);
    }
  }

  // Get holder display text and color
  const getHolderDisplay = () => {
    const holder = drawingsHolder || "design team";
    const displayText = holder.charAt(0).toUpperCase() + holder.slice(1);
    let color = "#4D93D9"; // Default blue
    if (holder === "sales team") {
      color = "#FFA500"; // Orange
    } else if (holder === "client") {
      color = "#28a745"; // Green
    }
    return { text: displayText, color };
  };

  const holderDisplay = getHolderDisplay();

  return (
    <div>
      <div style={{ marginBottom: "8px", display: "flex", gap: "24px", alignItems: "flex-start" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flex: "2.5", minWidth: "200px" }}>
          Drawings
        </h2>
        <div style={{ flex: "0.5", minWidth: "200px" }}>
          <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", marginTop: "20px" }}>
            Status
          </div>
        </div>
      </div>
      {project && (
        <div style={{ marginTop: "18px", display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ flex: "2.5", minWidth: "200px" }}>
            <div
              style={{
                background: WHITE,
                border: `1px solid ${SECTION_GREY}`,
                borderRadius: "8px",
                padding: "16px",
                minHeight: "600px",
                height: "600px",
                overflowY: "auto",
                overflowX: "hidden",
                display: "flex",
                flexDirection: "column",
                marginTop: "-18px",
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

              // Check if this is the current (last) revision
              const isCurrentRevision = (index) => index === drawingsHistory.length - 1;

              return (
                <>
                  {/* Column Headers */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr minmax(140px, 260px) minmax(170px, 240px) 70px 90px 100px 100px",
                      gap: "6px",
                      padding: "4px 8px",
                      borderBottom: `1px solid ${SECTION_GREY}`,
                      marginBottom: "4px",
                      fontWeight: 500,
                      fontSize: "0.85rem",
                      color: MONUMENT,
                    }}
                  >
                    <div>Drawing Name</div>
                    <div />
                    <div style={{ textAlign: "center" }}>Sent to Client</div>
                    <div style={{ textAlign: "right" }}>Revision</div>
                    <div style={{ textAlign: "right" }}>Uploaded</div>
                    <div style={{ textAlign: "right" }}>Sales Notes</div>
                    <div style={{ textAlign: "right" }}>Drafting Notes</div>
                  </div>
                  {/* Drawing Rows Container - scrollable, grows to fill space but doesn't overlap buttons */}
                  <div style={{ flex: "1", display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
                  {[...drawingsHistory].reverse().map((drawing, index) => {
                    // Determine background color based on approval status
                    let backgroundColor = WHITE;
                    if (drawing.workingDrawingsApproved) {
                      backgroundColor = "#e3f2fd"; // Light blue
                    } else if (drawing.conceptApproved) {
                      backgroundColor = "#e8f5e9"; // Light green
                    }

                    // Calculate original index for current revision check (since we reversed the array)
                    // In reversed array, index 0 is the last item (most recent)
                    const originalIndex = drawingsHistory.length - 1 - index;
                    const currentRevision = isCurrentRevision(originalIndex);

                    return (
                      <div key={index}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr minmax(140px, 260px) minmax(170px, 240px) 70px 90px 100px 100px",
                            gap: "6px",
                            padding: "4px 8px",
                            marginBottom: currentRevision ? "2px" : (index > 0 ? "4px" : "0"),
                            borderBottom: currentRevision ? "none" : (index > 0 ? `1px solid ${SECTION_GREY}` : "none"),
                            backgroundColor: backgroundColor,
                            borderRadius: currentRevision ? "4px 4px 0 0" : "4px",
                            minHeight: "32px",
                            alignItems: "center",
                          }}
                        >
                        <div style={{ fontWeight: "500", color: MONUMENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
                          {drawing.name}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            minWidth: 0,
                            overflowX: "auto",
                          }}
                        >
                          {drawing.workingDrawingsApproved ? (
                            <span
                              style={{
                                flexShrink: 0,
                                padding: "0 2px",
                                fontSize: "0.72rem",
                                fontWeight: 500,
                                letterSpacing: "0.04em",
                                color: "rgba(30, 86, 140, 0.42)",
                                background: "transparent",
                                border: "none",
                                borderRadius: 0,
                                whiteSpace: "nowrap",
                                lineHeight: 1.25,
                                userSelect: "none",
                              }}
                            >
                              Working Drawings Approved
                            </span>
                          ) : drawing.conceptApproved ? (
                            <span
                              style={{
                                flexShrink: 0,
                                padding: "0 2px",
                                fontSize: "0.72rem",
                                fontWeight: 500,
                                letterSpacing: "0.04em",
                                color: "rgba(28, 95, 42, 0.42)",
                                background: "transparent",
                                border: "none",
                                borderRadius: 0,
                                whiteSpace: "nowrap",
                                lineHeight: 1.25,
                                userSelect: "none",
                              }}
                            >
                              Concept Approved
                            </span>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 0,
                            overflowX: "auto",
                          }}
                        >
                          {drawing.sent_to_client_date ? (
                            <div
                              style={{
                                flexShrink: 0,
                                background: "#33cc33",
                                color: WHITE,
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "0.8rem",
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Sent to Client – {drawing.sent_to_client_date}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#32323399", textAlign: "right" }}>
                          {drawing.revision !== null ? drawing.revision : "-"}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#32323399", textAlign: "right" }}>
                          {drawing.date}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <button
                            onClick={() => handleOpenSalesNotesModal(originalIndex, drawing.revision, drawing.name)}
                            style={{
                              background: WHITE,
                              color: MONUMENT,
                              border: `1px solid ${SECTION_GREY}`,
                              borderRadius: "6px",
                              padding: "4px 6px",
                              fontSize: "0.8rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.18s, color 0.15s",
                              lineHeight: "1.2",
                              width: "100px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f0f0f0";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = WHITE;
                            }}
                          >
                            Sales<br />Notes
                          </button>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <button
                            onClick={() => handleOpenNotesModal(originalIndex, drawing.revision, drawing.name)}
                            style={{
                              background: WHITE,
                              color: MONUMENT,
                              border: `1px solid ${SECTION_GREY}`,
                              borderRadius: "6px",
                              padding: "4px 6px",
                              fontSize: "0.8rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.18s, color 0.15s",
                              lineHeight: "1.2",
                              width: "100px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f0f0f0";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = WHITE;
                            }}
                          >
                            Drafting<br />Notes
                          </button>
                        </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                  {/* Action Buttons - fixed at bottom, no go zone */}
                  {drawingsHistory.length > 0 && (() => {
                    const currentIndex = drawingsHistory.length - 1;
                    const currentDrawing = drawingsHistory[currentIndex];
                    let backgroundColor = WHITE;
                    if (currentDrawing.workingDrawingsApproved) {
                      backgroundColor = "#e3f2fd";
                    } else if (currentDrawing.conceptApproved) {
                      backgroundColor = "#e8f5e9";
                    }
                    return (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "8px",
                          alignItems: "center",
                          padding: "8px 12px",
                          flexShrink: 0,
                          borderTop: `1px solid ${SECTION_GREY}`,
                          background: WHITE,
                        }}
                      >
                        {project?.drawings_pdf_location && (
                          <button
                            onClick={() => {
                              if (project?.drawings_pdf_location) {
                                setShowDrawingsModal(true);
                              } else {
                                alert("No drawings PDF has been set for this project yet.");
                              }
                            }}
                            style={{
                              background: "#28a745",
                              color: WHITE,
                              border: `1px solid #28a745`,
                              borderRadius: "6px",
                              padding: "6px 8px",
                              fontSize: "0.8rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.18s, color 0.15s",
                              lineHeight: "1.2",
                              width: "100px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#218838";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#28a745";
                            }}
                          >
                            View<br />Drawings
                          </button>
                        )}
                        {project?.drawings_pdf_location && (
                          <button
                            type="button"
                            onClick={handleSendDrawingsMailto}
                            style={{
                              background: "#20c997",
                              color: WHITE,
                              border: "1px solid #20c997",
                              borderRadius: "6px",
                              padding: "6px 8px",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.18s, color 0.15s",
                              lineHeight: "1.2",
                              width: "118px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#1aa179";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#20c997";
                            }}
                          >
                            Send Drawings to..
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleEmailDrawingsToClient}
                          style={{
                            background: "#4D93D9",
                            color: WHITE,
                            border: "1px solid #4D93D9",
                            borderRadius: "6px",
                            padding: "6px 8px",
                            fontSize: "0.8rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "background 0.18s, color 0.15s",
                            lineHeight: "1.2",
                            width: "100px",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#3d7bc9";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#4D93D9";
                          }}
                        >
                          Send to<br />Client
                        </button>
                        <div style={{ 
                          fontSize: "0.8rem", 
                          color: WHITE,
                          textAlign: "center",
                          background: "#FFA500",
                          border: `1px solid #FFA500`,
                          borderRadius: "6px",
                          padding: "6px 8px",
                          width: "100px",
                          lineHeight: "1.2",
                          fontWeight: 500,
                        }}>
                          {project?.drawings_holder_date ? (
                            <>
                              {holderDisplay.text}
                              <br />
                              {(() => {
                                const holderDate = new Date(project.drawings_holder_date);
                                const today = new Date();
                                const diffTime = Math.abs(today - holderDate);
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
                              })()}
                            </>
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
            </div>
          </div>

          {/* Column 4 - Status, Buttons, and Drop Zone */}
          <div style={{ flex: "0.5", minWidth: "200px", display: "flex", flexDirection: "column", minHeight: "600px" }}>
            <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
              <div style={{ marginBottom: "24px", marginTop: "-18px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                  Draftsperson
                </div>
                <select
                  name="draftsperson"
                  value={draftsperson}
                  onChange={handleDraftspersonChange}
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
                  <option value={DRAFTSPERSON_UNASSIGNED}>{DRAFTSPERSON_UNASSIGNED}</option>
                  {draftspersonUsers.map((user) => (
                    <option key={user.id} value={user.name || ""}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                  Status
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
                    fontWeight: 500,
                  }}
                >
                  {drawingsStatus || "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start", width: "100%", marginBottom: "24px" }}>
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
                  
                  // Working drawings can be approved any time, as long as at least one drawing exists.
                  const canApproveWorkingDrawings = hasDrawings;

                  return (
                    <>
                      {/* Row 1: Approve Concept | Approve Working Drawings */}
                      <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                        <button
                          onClick={handleMarkConceptConfirmed}
                          disabled={!hasDrawings}
                          style={{
                            flex: 1,
                            background: !hasDrawings ? "#e0e0e0" : "#e8f5e9",
                            color: !hasDrawings ? "#999" : "#1b5e20",
                            border: !hasDrawings ? "1px solid #ccc" : "1px solid rgba(40, 167, 69, 0.55)",
                            borderRadius: "10px",
                            padding: "8px 8px",
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            textAlign: "center",
                            letterSpacing: "0.5px",
                            cursor: !hasDrawings ? "not-allowed" : "pointer",
                            transition: "background 0.18s, color 0.15s, border-color 0.15s",
                            opacity: !hasDrawings ? 0.6 : 1,
                          }}
                        >
                          Approve Concept
                        </button>
                        <button
                          onClick={handleMarkWorkingDrawingsConfirmed}
                          disabled={!canApproveWorkingDrawings}
                          style={{
                            flex: 1,
                            background: !canApproveWorkingDrawings ? "#e0e0e0" : "#e3f2fd",
                            color: !canApproveWorkingDrawings ? "#999" : "#0d47a1",
                            border: !canApproveWorkingDrawings ? "1px solid #ccc" : "1px solid rgba(77, 147, 217, 0.65)",
                            borderRadius: "10px",
                            padding: "8px 8px",
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            textAlign: "center",
                            letterSpacing: "0.5px",
                            cursor: !canApproveWorkingDrawings ? "not-allowed" : "pointer",
                            transition: "background 0.18s, color 0.15s, border-color 0.15s",
                            opacity: !canApproveWorkingDrawings ? 0.6 : 1,
                          }}
                        >
                          Approve Working Drawings
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Drawings PDF Upload Drop Zone */}
            <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500" }}>
                Drawings PDF
              </div>
              <div style={{ position: "relative", width: "100%" }}>
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
                  cursor: drawingsFolderCheckPending ? "wait" : "pointer",
                  background: MONUMENT,
                  transition: "background 0.2s, border-color 0.2s",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  minHeight: "200px",
                  boxSizing: "border-box",
                  position: "relative",
                }}
              >
                {drawingsFolderCheckPending && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "8px",
                      background: "rgba(32, 32, 35, 0.9)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 3,
                      pointerEvents: "all",
                    }}
                  >
                    <div style={{ color: WHITE, fontWeight: 600, fontSize: "1rem", letterSpacing: "0.02em" }}>
                      Checking job folder…
                    </div>
                    <div style={{ color: "#ffffffb3", fontSize: "0.88rem", marginTop: "10px" }}>
                      Verifying path on disk
                    </div>
                  </div>
                )}
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

            {showClearDrawingData && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", width: "100%" }}>
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
                  }}
                >
                  Clear Drawing Data
                </button>
              </div>
            )}
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
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
              Email Client
            </h3>
            {(() => {
              const { emails: clientEmails, labels: clientNames } = getDrawingsClientRecipients();
              const extraEmails = getStreamExtraDrawingEmails(project?.stream, streamSettingsJson, project);
              return (
                <div style={{ marginBottom: "16px", padding: "12px", background: "#f5f5f5", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: "500" }}>
                    Sending to:
                  </div>
                  {sendDrawingsToClientsEnabled &&
                    clientEmails.map((email, index) => (
                      <div key={`c-${index}`} style={{ fontSize: "0.85rem", color: MONUMENT, marginBottom: "4px" }}>
                        {clientNames[index]}: {email}
                      </div>
                    ))}
                  {!sendDrawingsToClientsEnabled && clientEmails.length > 0 && (
                    <div style={{ fontSize: "0.82rem", color: "#32323399", marginBottom: "8px" }}>
                      Project client contacts are skipped (Send to Clients is off for this stream in Stream Settings).
                    </div>
                  )}
                  {extraEmails.map((email, index) => (
                    <div key={`e-${index}`} style={{ fontSize: "0.85rem", color: MONUMENT, marginBottom: "4px" }}>
                      Stream extra {index + 1}: {email}
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

      {typeof document !== "undefined" &&
        showDrawingsFolderMissingModal &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: DRAWINGS_ALERT_MODAL_Z,
            }}
            onClick={closeDrawingsFolderMissingModal}
          >
            <div
              style={{
                background: WHITE,
                borderRadius: "12px",
                padding: "26px 28px",
                maxWidth: "460px",
                width: "90%",
                boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p style={{ margin: "0 0 24px", fontSize: "0.98rem", color: "#444", lineHeight: 1.6 }}>
                Whoops — there was an issue with the upload. Ben has been emailed and he will follow up and let you
                know when it&apos;s OK to re-upload the drawings.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeDrawingsFolderMissingModal}
                  style={{
                    background: "#4D93D9",
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 22px",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {typeof document !== "undefined" &&
        showDrawingsPathErrorModal &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: DRAWINGS_ALERT_MODAL_Z,
            }}
            onClick={closeDrawingsPathErrorModal}
          >
            <div
              style={{
                background: WHITE,
                borderRadius: "12px",
                padding: "26px 28px",
                maxWidth: "440px",
                width: "90%",
                boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginTop: 0, marginBottom: "14px", color: MONUMENT, fontSize: "1.1rem" }}>
                Drawings upload
              </h3>
              <p
                style={{
                  margin: "0 0 22px",
                  fontSize: "0.95rem",
                  color: "#555",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {drawingsPathErrorMessage}
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeDrawingsPathErrorModal}
                  style={{
                    background: "#4D93D9",
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 22px",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Require draftsperson before uploading drawings (before notes / email modals) */}
      {showDraftspersonRequiredModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1020,
          }}
          onClick={handleCancelDraftspersonRequiredModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "480px",
              width: "90%",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "12px", color: MONUMENT }}>
              Select a draftsperson
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "0.95rem", color: "#555", lineHeight: 1.45 }}>
              A draftsperson must be assigned before drawings can be added. Choose one to continue.
            </p>
            <select
              value={draftspersonModalChoice}
              onChange={(e) => setDraftspersonModalChoice(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                cursor: "pointer",
                marginBottom: "20px",
              }}
            >
              <option value={DRAFTSPERSON_UNASSIGNED}>{DRAFTSPERSON_UNASSIGNED}</option>
              {draftspersonUsers.map((user) => (
                <option key={user.id} value={user.name || ""}>
                  {user.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleCancelDraftspersonRequiredModal}
                style={{
                  background: SECTION_GREY,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDraftspersonForUpload()}
                style={{
                  background: "#4D93D9",
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Continue
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
            {notesForRevision.isNewDrawing && (
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    marginBottom: "8px",
                    fontWeight: 600,
                  }}
                >
                  These drawings are
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      color: MONUMENT,
                    }}
                  >
                    <input
                      type="radio"
                      name="newDrawingUploadKind"
                      checked={newDrawingUploadKind === "concept"}
                      onChange={() => setNewDrawingUploadKind("concept")}
                    />
                    Concept drawings
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      color: MONUMENT,
                    }}
                  >
                    <input
                      type="radio"
                      name="newDrawingUploadKind"
                      checked={newDrawingUploadKind === "working"}
                      onChange={() => setNewDrawingUploadKind("working")}
                    />
                    Working drawings
                  </label>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#32323399", marginTop: "8px" }}>
                  Required — status is set to Concept Stage or Working Drawing Stage for this upload.
                </div>
              </div>
            )}
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
                color: "#000",
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
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              {/* Show Send Drawings and Cancel for new drawings or current revision */}
              {(notesForRevision.isNewDrawing || notesForRevision.isCurrentRevision) && (
                <>
                  <button
                    onClick={handleSendDrawingsWithNotes}
                    disabled={
                      notesForRevision.isNewDrawing &&
                      (!newDrawingUploadKind || isSendingDraftingEmail)
                    }
                    style={{
                      background:
                        notesForRevision.isNewDrawing &&
                        (!newDrawingUploadKind || isSendingDraftingEmail)
                          ? "#b9d5f0"
                          : "#4D93D9",
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      cursor:
                        notesForRevision.isNewDrawing &&
                        (!newDrawingUploadKind || isSendingDraftingEmail)
                          ? "not-allowed"
                          : "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (
                        notesForRevision.isNewDrawing &&
                        (!newDrawingUploadKind || isSendingDraftingEmail)
                      ) {
                        return;
                      }
                      e.currentTarget.style.background = "#3d7bc9";
                    }}
                    onMouseLeave={(e) => {
                      if (
                        notesForRevision.isNewDrawing &&
                        (!newDrawingUploadKind || isSendingDraftingEmail)
                      ) {
                        e.currentTarget.style.background = "#b9d5f0";
                        return;
                      }
                      e.currentTarget.style.background = "#4D93D9";
                    }}
                  >
                    {notesForRevision.isNewDrawing ? "Save and Send Drawings" : "Update Notes"}
                  </button>
                  <button
                    onClick={handleCloseNotesModal}
                    disabled={notesForRevision.isNewDrawing && isSendingDraftingEmail}
                    style={{
                      background: SECTION_GREY,
                      color: WHITE,
                      border: "none",
                      borderRadius: "8px",
                      padding: "10px 20px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      cursor: notesForRevision.isNewDrawing && isSendingDraftingEmail ? "not-allowed" : "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (notesForRevision.isNewDrawing && isSendingDraftingEmail) return;
                      e.currentTarget.style.background = "#8a8a8c";
                    }}
                    onMouseLeave={(e) => {
                      if (notesForRevision.isNewDrawing && isSendingDraftingEmail) return;
                      e.currentTarget.style.background = SECTION_GREY;
                    }}
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

      {/* Sales Notes Modal */}
      {showSalesNotesModal && salesNotesForRevision && (
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
              Sales Notes for {salesNotesForRevision.name}
              {salesNotesForRevision.revision !== null ? ` - Rev ${salesNotesForRevision.revision}` : " (Initial)"}
            </h3>
            <textarea
              value={salesNotesText}
              onChange={(e) => setSalesNotesText(e.target.value)}
              placeholder="Enter sales notes for this drawing revision..."
              readOnly={!salesNotesForRevision.isCurrentRevision}
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
                color: "#000",
                backgroundColor: !salesNotesForRevision.isCurrentRevision ? "#f5f5f5" : WHITE,
                cursor: !salesNotesForRevision.isCurrentRevision ? "not-allowed" : "text",
              }}
            />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              {/* Show Send and Cancel for current revision */}
              {salesNotesForRevision.isCurrentRevision && (
                <>
                  <button
                    onClick={handleSendSalesNotes}
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
                    Update Notes
                  </button>
                  <button
                    onClick={handleCloseSalesNotesModal}
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
              {!salesNotesForRevision.isCurrentRevision && (
                <button
                  onClick={handleCloseSalesNotesModal}
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

      {/* Email Preview Modal */}
      {showEmailPreviewModal && (
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
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                onClick={closeEmailPreviewModal}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={emailPreviewTo}
                  onChange={(e) => setEmailPreviewTo(e.target.value)}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  From
                </label>
                <input
                  type="text"
                  value={emailPreviewFrom}
                  onChange={(e) => setEmailPreviewFrom(e.target.value)}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={emailPreviewSubject}
                  onChange={(e) => setEmailPreviewSubject(e.target.value)}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Body
                </label>
                <div
                  ref={emailBodyRef}
                  contentEditable
                  onInput={(e) => {
                    setEmailPreviewBody(e.currentTarget.innerHTML);
                  }}
                  onBlur={(e) => {
                    setEmailPreviewBody(e.currentTarget.innerHTML);
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
                  onClick={closeEmailPreviewModal}
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
                  onClick={handleSendFromPreview}
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

      {/* Email Drawings to Client Modal */}
      {showEmailDrawingsToClientModal && (
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
          onClick={(e) => {
            // Prevent closing when clicking on the modal background
            if (e.target === e.currentTarget) {
              e.stopPropagation();
            }
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
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>
                {emailDrawingsFlowKind === "sendTo" ? "Send Drawings to.." : "Send to Client"}
              </h2>
              <button
                onClick={() => {
                  setVicSmtpFromOptions([]);
                  setEmailDrawingsFlowKind("client");
                  setShowEmailDrawingsToClientModal(false);
                }}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={emailDrawingsToClientTo}
                  onChange={(e) => setEmailDrawingsToClientTo(e.target.value)}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  From
                </label>
                {emailDrawingsFlowKind === "sendTo" && vicSmtpFromOptions.length > 0 ? (
                  <select
                    value={emailDrawingsToClientFrom}
                    onChange={(e) => setEmailDrawingsToClientFrom(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                      cursor: "pointer",
                    }}
                  >
                    {vicSmtpFromOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={emailDrawingsToClientFrom}
                    onChange={(e) => setEmailDrawingsToClientFrom(e.target.value)}
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
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={emailDrawingsToClientSubject}
                  onChange={(e) => setEmailDrawingsToClientSubject(e.target.value)}
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Body
                </label>
                <div
                  ref={emailDrawingsToClientBodyRef}
                  contentEditable
                  onInput={(e) => {
                    setEmailDrawingsToClientBody(e.currentTarget.innerHTML);
                  }}
                  onBlur={(e) => {
                    setEmailDrawingsToClientBody(e.currentTarget.innerHTML);
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
                  onClick={() => {
                    setVicSmtpFromOptions([]);
                    setEmailDrawingsFlowKind("client");
                    setShowEmailDrawingsToClientModal(false);
                  }}
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
                  onClick={handleSendEmailDrawingsToClient}
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

      {/* Drawings PDF Modal */}
      {showDrawingsModal && project?.drawings_pdf_location && (
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
          onClick={() => setShowDrawingsModal(false)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "1200px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Drawings</h2>
              <button
                onClick={() => setShowDrawingsModal(false)}
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

            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <iframe
                src={(() => {
                  const base =
                    drawingsPdfSrcOverride || `${API_URL}/api/files/drawings/${project.id}`;
                  const sep = base.includes("?") ? "&" : "?";
                  return `${base}${sep}t=${new Date().getTime()}`;
                })()}
                style={{
                  width: "100%",
                  flex: 1,
                  border: "none",
                  borderRadius: "8px",
                  minHeight: "600px",
                }}
                title="Drawings PDF"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
