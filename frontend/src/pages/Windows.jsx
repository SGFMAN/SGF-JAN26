import React, { useState, useRef, useEffect } from "react";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import {
  generalEmailStateCode,
  parseEmailGeneralJson,
} from "../utils/emailGeneralSettings";
import { getApiHeaders } from "../utils/auth";

import { UI, INDICATOR } from "../utils/uiThemeTokens.js";
import { streamColorHover } from "../utils/streamColors.js";
import {
  buildSavedButtonStyle,
  mergeDestructiveButtonStyle,
  destructiveButtonUsesSavedStyle,
} from "../utils/uiButtonStyles.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const FIELD_OUTLINE = `1px solid ${UI.outline}`;
const API_URL = "";

const ORDER_WINDOWS_BUTTON_ID = 4;
const RED_DANGER = "#c62828";

const RESET_WINDOW_DATA_BUTTON_FALLBACK = {
  padding: "10px 20px",
  fontSize: "1rem",
  fontWeight: 500,
  color: WHITE,
  background: RED_DANGER,
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background 0.2s",
};

function mergeWindowsButtonStyle(styleId, fallback) {
  const saved = buildSavedButtonStyle(styleId, true);
  return saved ? { ...saved } : fallback;
}

const WINDOW_COLOUR_OPTIONS = [
  "Monument",
  "Paperbark",
  "Woodland Grey",
  "Surfmist",
  "Black",
  "White",
  "Primrose",
];

const REVEAL_OPTIONS = ["95mm", "Other"];

const GLAZING_OPTIONS = ["Double", "Single"];

const BAL_RATING_OPTIONS = [
  "None",
  "BAL - Low",
  "BAL - 12.5",
  "BAL - 19",
  "BAL - 29",
  "BAL - 40",
  "BAL - FZ",
];

const DATE_REQUIRED_OPTIONS = ["Normal", "Urgent"];

function resolveWindowsOrderingEmails(settings, project) {
  const code = generalEmailStateCode(project);
  const windows = parseEmailGeneralJson(settings?.email_general_json).windows || {};

  if (code === "QLD") {
    const from = (windows.qldFromEmail || "").trim();
    const to = [windows.qldToEmail1, windows.qldToEmail2, windows.qldToEmail3]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return { code, from, to };
  }

  if (code === "VIC") {
    const from = (windows.vicFromEmail || "").trim();
    const to = [windows.vicToEmail1, windows.vicToEmail2, windows.vicToEmail3]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return { code, from, to };
  }

  return { code: "", from: "", to: [] };
}

export default function Windows({ project, onUpdate, showResetWindowData = false }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [windowColour, setWindowColour] = useState(project?.window_colour || "");
  const [reveal, setReveal] = useState(project?.window_reveal || "95mm");
  const [revealOther, setRevealOther] = useState(project?.window_reveal_other || "");
  const [glazing, setGlazing] = useState(project?.window_glazing || "Double");
  const [balRating, setBalRating] = useState(project?.window_bal_rating || "None");
  const [dateRequired, setDateRequired] = useState(project?.window_date_required || "Normal");
  const [isOrdering, setIsOrdering] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [requireOrderNumberOpen, setRequireOrderNumberOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const fileInputRef = useRef(null);
  /** Pick PDF to register path when missing or file not on disk (like Project Info proposal). */
  const windowOrderLocateFileRef = useRef(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [windowOrderEmailFrom, setWindowOrderEmailFrom] = useState("");
  const [windowOrderEmailTo, setWindowOrderEmailTo] = useState("");
  const [showWindowOrderModal, setShowWindowOrderModal] = useState(false);
  /** Bust iframe cache after locate/upload refresh. */
  const [windowOrderIframeNonce, setWindowOrderIframeNonce] = useState(0);
  const [, setUiButtonStyleRevision] = useState(0);

  // Get window status or default to "Not Ordered"
  const windowStatus = project?.window_status || "Not Ordered";
  
  const WINDOW_STATUS_OPTIONS = ["Not Ordered", "Ordered", "Complete"];

  useEffect(() => {
    if (!project?.id) return;
    if (windowStatus !== "Ordered") return;
    setOrderNumber(project?.window_order_number || "");
    setSelectedFile(null);
    setIsDragging(false);
  }, [project?.id, project?.window_order_number, windowStatus]);

  useEffect(() => {
    if (!requireOrderNumberOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [requireOrderNumberOpen]);

  useEffect(() => {
    if (!showWindowOrderModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showWindowOrderModal]);

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  function closeWindowOrderModal() {
    setShowWindowOrderModal(false);
  }

  function openWindowOrderModal() {
    setShowWindowOrderModal(true);
    setWindowOrderIframeNonce((n) => n + 1);
  }

  async function handleResetWindowData() {
    if (!showResetWindowData || !project?.id) return;
    if (
      !confirm(
        "Reset all window data for this project? This clears status, colours, order details, order number, dates, and the window order PDF path."
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/reset-window-data`, {
        method: "POST",
        headers: getApiHeaders(),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || response.statusText);
      }
      setWindowColour("");
      setReveal("95mm");
      setRevealOther("");
      setGlazing("Double");
      setBalRating("None");
      setDateRequired("Normal");
      setOrderNumber("");
      setShowWindowOrderModal(false);
      setWindowOrderIframeNonce((n) => n + 1);
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to reset window data");
    }
  }

  async function handleWindowOrderLocateFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !project?.id) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please select a PDF file.");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", project.id.toString());
    try {
      const response = await fetch(`${API_URL}/api/files/locate-window-order`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save window order location");
      }
      if (onUpdate) onUpdate();
      setWindowOrderIframeNonce((n) => n + 1);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save window order location");
    }
  }

  async function handleOrderWindows() {
    // Validate required fields
    if (!windowColour) {
      alert("Please select a window colour");
      return;
    }
    if (!reveal) {
      alert("Please select a reveal");
      return;
    }
    if (reveal === "Other" && !revealOther.trim()) {
      alert("Please enter a reveal value");
      return;
    }
    if (!glazing) {
      alert("Please select glazing");
      return;
    }
    if (!balRating) {
      alert("Please select a BAL rating");
      return;
    }
    if (!dateRequired) {
      alert("Please select a date required");
      return;
    }

    // Save the window details first
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    setIsOrdering(true);
    try {
      // Calculate date required: if "Normal", use 3 weeks from today; if "Urgent", just use "Urgent"
      let dateRequiredValue = dateRequired;
      if (dateRequired === "Normal") {
        const threeWeeksFromNow = new Date();
        threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21); // 3 weeks = 21 days
        dateRequiredValue = threeWeeksFromNow.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
      
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...project,
          window_colour: windowColour,
          window_reveal: reveal,
          window_reveal_other: reveal === "Other" ? revealOther : null,
          window_glazing: glazing,
          window_bal_rating: balRating,
          window_date_required: dateRequiredValue,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save window details");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      // Close order modal and open email modal
      setShowOrderModal(false);
      const emailReady = await loadEmailTemplate();
      if (!emailReady) {
        return;
      }
      setShowEmailModal(true);
    } catch (error) {
      console.error("Error saving window details:", error);
      alert(`Error saving window details: ${error.message}`);
    } finally {
      setIsOrdering(false);
    }
  }

  /** Loads template body and state-based From/To from General → Windows. Returns false if routing cannot be resolved. */
  async function loadEmailTemplate() {
    if (!project?.id) return false;

    try {
      const [templatesRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const route = resolveWindowsOrderingEmails(settings, project);
      if (!route.code) {
        alert(
          "Project state must be VIC or QLD to send Window Order emails."
        );
        setWindowOrderEmailFrom("");
        setWindowOrderEmailTo("");
        setEmailBody("");
        return false;
      }
      if (!route.from) {
        alert(
          `No From address for the window order email. Set it under Settings → Email Settings → General → Windows → Ordering Windows (${route.code}).`
        );
        setWindowOrderEmailFrom("");
        setWindowOrderEmailTo("");
        setEmailBody("");
        return false;
      }
      if (!route.to.length) {
        alert(
          `No To addresses for the window order email. Set at least one To field under Settings → Email Settings → General → Windows → Ordering Windows (${route.code}).`
        );
        setWindowOrderEmailFrom("");
        setWindowOrderEmailTo("");
        setEmailBody("");
        return false;
      }
      setWindowOrderEmailFrom(route.from);
      setWindowOrderEmailTo(route.to.join(", "));

      if (!templatesRes.ok) {
        setEmailBody("");
        return true;
      }
      const templates = await templatesRes.json();
      const template = templates.find((t) => t.name === "WINDOWS - Order");
      if (template && template.body) {
        const windowInfo = buildWindowOrderingInfo();

        let body = template.body;
        const scopePattern = /<b>Scope<\/b>/i;
        const match = body.match(scopePattern);
        if (match) {
          const insertIndex = match.index + match[0].length;
          body = body.slice(0, insertIndex) + "\n\n" + windowInfo + body.slice(insertIndex);
        } else {
          body = body + "\n\n" + windowInfo;
        }

        const suburb = (project?.suburb || "").toUpperCase();
        const street = project?.street || "";
        const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");

        body = body
          .replace(/\{SUBURB\}/g, suburb)
          .replace(/\{STREET\}/g, street)
          .replace(/\{ProjectName\}/g, projectName);

        setEmailBody(body);
      } else {
        setEmailBody("");
      }
      return true;
    } catch (error) {
      console.error("Error fetching email template:", error);
      setEmailBody("");
      setWindowOrderEmailFrom("");
      setWindowOrderEmailTo("");
      return false;
    }
  }

  function buildWindowOrderingInfo() {
    const revealText = reveal === "Other" ? revealOther : reveal;
    // Calculate date required: if "Normal", use 3 weeks from today; if "Urgent", just use "Urgent"
    let dateRequiredText = dateRequired;
    if (dateRequired === "Normal") {
      const threeWeeksFromNow = new Date();
      threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21); // 3 weeks = 21 days
      dateRequiredText = threeWeeksFromNow.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    
    return `Window Colour: ${windowColour}
Reveal: ${revealText}
Glazing: ${glazing}
BAL Rating: ${balRating}
Date Required: ${dateRequiredText}`;
  }

  function getActiveClients() {
    const clients = [];
    if (project?.client1_active === true || project?.client1_active === 'true') {
      clients.push({
        name: project.client1_name || "",
        email: project.client1_email || "",
      });
    }
    if (project?.client2_active === true || project?.client2_active === 'true') {
      clients.push({
        name: project.client2_name || "",
        email: project.client2_email || "",
      });
    }
    if (project?.client3_active === true || project?.client3_active === 'true') {
      clients.push({
        name: project.client3_name || "",
        email: project.client3_email || "",
      });
    }
    return clients;
  }

  async function handleSendEmail() {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    const toList = windowOrderEmailTo
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    if (toList.length === 0) {
      alert("No recipient addresses. Reload the email preview after configuring Settings → Email Settings → General → Windows.");
      return;
    }
    if (!windowOrderEmailFrom || !windowOrderEmailFrom.trim()) {
      alert("No From address. Reload the email preview after configuring Settings → Email Settings → General → Windows.");
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
        const response = await fetch(`${API_URL}/api/emails/send-windows-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: project.id,
            from: windowOrderEmailFrom.trim(),
            toEmails: toList,
            customBody: emailBody,
            windowColour: windowColour,
            windowReveal: reveal === "Other" ? revealOther : reveal,
            windowGlazing: glazing,
            windowBalRating: balRating,
            windowDateRequired: dateRequired === "Normal"
              ? new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toLocaleDateString("en-AU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : dateRequired,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: response.statusText }));
          const errorMessage = data.error || `Failed to send email: ${response.statusText}`;
          throw new Error(errorMessage);
        }

        await response.json().catch(() => ({}));
        alert("Window order email sent successfully!");
      });
      setShowEmailModal(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error sending email:", error);
      alert(`Error sending email: ${error.message}`);
    }
  }

  function handleCloseEmailModal() {
    setShowEmailModal(false);
    setEmailBody("");
    setWindowOrderEmailFrom("");
    setWindowOrderEmailTo("");
  }

  function handleOpenOrderModal() {
    // Reset form to project values or defaults
    setWindowColour(project?.window_colour || "");
    setReveal(project?.window_reveal || "95mm");
    setRevealOther(project?.window_reveal_other || "");
    setGlazing(project?.window_glazing || "Double");
    setBalRating(project?.window_bal_rating || "None");
    setDateRequired(project?.window_date_required || "Normal");
    setShowOrderModal(true);
  }

  function handleCloseOrderModal() {
    setShowOrderModal(false);
  }

  // Windows Received modal handlers
  function handleDragEnterReceived(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeaveReceived(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDragOverReceived(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function openOrderNumberModalForFile(file) {
    setPendingFile(file);
    setPendingOrderNumber("");
    setRequireOrderNumberOpen(true);
  }

  function closeOrderNumberModal() {
    setRequireOrderNumberOpen(false);
    setPendingFile(null);
    setPendingOrderNumber("");
  }

  async function uploadReceived(file, orderNo) {
    if (!file) {
      alert("Please select a PDF file");
      return false;
    }
    const n = String(orderNo || "").trim();
    if (!n) {
      alert("Please enter an order number");
      return false;
    }
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return false;
    }

    setIsReceiving(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("projectId", project.id.toString());
      uploadFormData.append("orderNumber", n);

      const uploadResponse = await fetch(`${API_URL}/api/files/upload-window-order`, {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: uploadResponse.statusText }));
        throw new Error(errorData.error || "Failed to upload window order PDF");
      }

      await uploadResponse.json().catch(() => ({}));

      // Update window status to "Complete"
      try {
        const updateResponse = await fetch(`${API_URL}/api/projects/${project.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: project.name || "",
            status: project.status || "",
            stream: project.stream || null,
            suburb: project.suburb || null,
            street: project.street || null,
            state: project.state || null,
            deposit: project.deposit || null,
            project_cost: project.project_cost || null,
            client_name: project.client_name || null,
            email: project.email || null,
            phone: project.phone || null,
            client1_name: project.client1_name || null,
            client1_email: project.client1_email || null,
            client1_phone: project.client1_phone || null,
            client1_active: project.client1_active || null,
            client2_name: project.client2_name || null,
            client2_email: project.client2_email || null,
            client2_phone: project.client2_phone || null,
            client2_active: project.client2_active || null,
            client3_name: project.client3_name || null,
            client3_email: project.client3_email || null,
            client3_phone: project.client3_phone || null,
            client3_active: project.client3_active || null,
            site_visit_status: project.site_visit_status || null,
            site_visit_date: project.site_visit_date || null,
            site_visit_time: project.site_visit_time || null,
            contract_status: project.contract_status || null,
            contract_sent_date: project.contract_sent_date || null,
            contract_complete_date: project.contract_complete_date || null,
            supporting_documents_status: project.supporting_documents_status || null,
            supporting_documents_sent_date: project.supporting_documents_sent_date || null,
            supporting_documents_complete_date: project.supporting_documents_complete_date || null,
            water_declaration_status: project.water_declaration_status || null,
            water_declaration_sent_date: project.water_declaration_sent_date || null,
            water_declaration_complete_date: project.water_declaration_complete_date || null,
            notes: project.notes || null,
            window_status: "Complete",
            window_colour: project.window_colour || null,
            window_reveal: project.window_reveal || null,
            window_reveal_other: project.window_reveal_other || null,
            window_glazing: project.window_glazing || null,
            window_bal_rating: project.window_bal_rating || null,
            window_date_required: project.window_date_required || null,
            window_ordered_date: project.window_ordered_date || null,
          }),
        });

        if (!updateResponse.ok) {
          console.error("Failed to update window status to Complete");
        }
      } catch (updateError) {
        console.error("Error updating window status:", updateError);
      }

      if (onUpdate) onUpdate();
      setSelectedFile(null);
      setIsDragging(false);
      setWindowOrderIframeNonce((x) => x + 1);
      return true;
    } catch (error) {
      console.error("Error uploading window order:", error);
      alert(`Error uploading window order: ${error.message}`);
      return false;
    } finally {
      setIsReceiving(false);
    }
  }

  async function confirmOrderNumber() {
    const n = (pendingOrderNumber || "").trim();
    if (!n) {
      alert("Please enter an order number");
      return;
    }
    if (!pendingFile) {
      alert("No file selected");
      return;
    }
    const file = pendingFile;
    setOrderNumber(n);
    setSelectedFile(file);
    setRequireOrderNumberOpen(false);
    setPendingFile(null);
    setPendingOrderNumber("");

    // Auto-upload immediately after order number is provided
    void uploadReceived(file, n);
  }

  function handleDropReceived(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        openOrderNumberModalForFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleFileSelectReceived(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        openOrderNumberModalForFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleBrowseClickReceived() {
    fileInputRef.current?.click();
  }

  // Upload now happens automatically after the order number modal is confirmed.

  const orderWindowsButtonStyle = mergeWindowsButtonStyle(ORDER_WINDOWS_BUTTON_ID, {
    padding: "10px 20px",
    fontSize: "1rem",
    fontWeight: 500,
    color: MONUMENT,
    background: INDICATOR.orange,
    border: FIELD_OUTLINE,
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.17s",
  });
  const resetWindowDataButtonStyle = mergeDestructiveButtonStyle(RESET_WINDOW_DATA_BUTTON_FALLBACK);
  const orderWindowsUsesSavedStyle = Boolean(buildSavedButtonStyle(ORDER_WINDOWS_BUTTON_ID, true));
  const resetWindowDataUsesSavedStyle = destructiveButtonUsesSavedStyle();

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Windows
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {/* Column 1 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            {/* Window Status */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                Window Status
              </div>
              <select
                value={windowStatus}
                onChange={async (e) => {
                  const newStatus = e.target.value;
                  if (!project?.id) return;
                  
                  try {
                    const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        ...project,
                        window_status: newStatus,
                      }),
                    });
                    
                    if (response.ok && onUpdate) {
                      onUpdate();
                    }
                  } catch (error) {
                    console.error("Error updating window status:", error);
                    alert(`Error updating window status: ${error.message}`);
                  }
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  maxWidth: "300px",
                  cursor: "pointer",
                }}
              >
                {WINDOW_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Order / reset actions */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "8px",
                marginBottom: "24px",
              }}
            >
              {windowStatus !== "Complete" && (
                <button
                  onClick={handleOpenOrderModal}
                  style={orderWindowsButtonStyle}
                  onMouseEnter={
                    orderWindowsUsesSavedStyle
                      ? undefined
                      : (e) => {
                          e.currentTarget.style.background = streamColorHover(INDICATOR.orange);
                        }
                  }
                  onMouseLeave={
                    orderWindowsUsesSavedStyle
                      ? undefined
                      : (e) => {
                          e.currentTarget.style.background = INDICATOR.orange;
                        }
                  }
                >
                  {windowStatus === "Ordered" ? "Reorder Windows" : "Order Windows"}
                </button>
              )}

              {showResetWindowData && (
                <button
                  type="button"
                  onClick={() => void handleResetWindowData()}
                  style={resetWindowDataButtonStyle}
                  onMouseEnter={
                    resetWindowDataUsesSavedStyle
                      ? undefined
                      : (e) => {
                          e.currentTarget.style.background = streamColorHover(RED_DANGER);
                        }
                  }
                  onMouseLeave={
                    resetWindowDataUsesSavedStyle
                      ? undefined
                      : (e) => {
                          e.currentTarget.style.background = RED_DANGER;
                        }
                  }
                >
                  Reset Window Data
                </button>
              )}
            </div>
          </div>

          {/* Column 2 - Order Details */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            {(windowStatus === "Ordered" || windowStatus === "Complete") && (
              <div>
                <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
                  Order Details
                </h3>
                
                {project.window_colour && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                      Window Colour
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_colour}
                    </div>
                  </div>
                )}

                {project.window_reveal && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                      Reveal
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_reveal === "Other" && project.window_reveal_other
                        ? project.window_reveal_other
                        : project.window_reveal}
                    </div>
                  </div>
                )}

                {project.window_glazing && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                      Glazing
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_glazing}
                    </div>
                  </div>
                )}

                {project.window_bal_rating && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                      BAL Rating
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_bal_rating}
                    </div>
                  </div>
                )}

                {project.window_date_required && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                      Date Required
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_date_required}
                    </div>
                  </div>
                )}

                {project.window_ordered_date && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
                      Date Ordered
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {new Date(project.window_ordered_date).toLocaleDateString()} {new Date(project.window_ordered_date).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column 3 - Windows Received / View Order */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            <input
              ref={windowOrderLocateFileRef}
              type="file"
              accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => void handleWindowOrderLocateFileChange(e)}
            />

            {windowStatus === "Ordered" ? (
              <div>
                <h3 style={{ fontSize: "1.05rem", marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
                  Windows Received
                </h3>

                {(String(project?.window_order_number || "").trim() || (orderNumber || "").trim()) && (
                  <div style={{ marginBottom: "20px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.9rem",
                        color: UI.textMuted,
                        marginBottom: "6px",
                        fontWeight: "500",
                      }}
                    >
                      Order Number
                    </label>
                    <div
                      style={{
                        width: "100%",
                        maxWidth: "300px",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {(orderNumber || project?.window_order_number || "").toString()}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "18px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Window Order PDF *
                  </label>
                  <div
                    onDragEnter={handleDragEnterReceived}
                    onDragOver={handleDragOverReceived}
                    onDragLeave={handleDragLeaveReceived}
                    onDrop={handleDropReceived}
                    onClick={handleBrowseClickReceived}
                    style={{
                      border: `2px dashed ${isDragging ? MONUMENT : "#ddd"}`,
                      borderRadius: "8px",
                      padding: "32px 16px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: isDragging ? UI.inputBg : WHITE,
                      transition: "background 0.2s, border-color 0.2s",
                      maxWidth: "300px",
                      boxSizing: "border-box",
                    }}
                  >
                    {selectedFile ? (
                      <div>
                        <div style={{ color: MONUMENT, fontWeight: "500", marginBottom: "8px" }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: "0.9rem", color: UI.textMuted }}>
                          Click to select a different file
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ color: MONUMENT, fontWeight: "500", marginBottom: "8px" }}>
                          Drag and drop PDF file here
                        </div>
                        <div style={{ fontSize: "0.9rem", color: UI.textMuted }}>
                          or click to browse
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileSelectReceived}
                      style={{ display: "none" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  {project?.window_order_pdf_location?.trim() ? (
                    <button
                      type="button"
                      onClick={openWindowOrderModal}
                      disabled={isReceiving}
                      style={{
                        padding: "10px 16px",
                        fontSize: "1rem",
                        fontWeight: "500",
                        color: WHITE,
                        background: MONUMENT,
                        border: "none",
                        borderRadius: "8px",
                        cursor: isReceiving ? "not-allowed" : "pointer",
                        opacity: isReceiving ? 0.6 : 1,
                      }}
                    >
                      Show Order
                    </button>
                  ) : null}
                  {isReceiving ? (
                    <div style={{ fontSize: "0.9rem", color: UI.textMuted }}>Uploading…</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
                {windowStatus !== "Not Ordered" && (
                  <button
                    type="button"
                    onClick={openWindowOrderModal}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: "500",
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    {project?.window_order_pdf_location ? "View Order" : "Locate Order"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Column 4 - Empty for now */}
          <div style={{ flex: "1", minWidth: "200px" }}>
          </div>
        </div>
      )}

      {/* Order Windows Modal */}
      {showOrderModal && (
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
              }}
              onClick={handleCloseOrderModal}
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
                  Order Windows
                </h3>

                {/* Window Colour */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Window Colour *
                  </label>
                  <select
                    value={windowColour}
                    onChange={(e) => setWindowColour(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Select a colour</option>
                    {WINDOW_COLOUR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reveal */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Reveal *
                  </label>
                  <select
                    value={reveal}
                    onChange={(e) => setReveal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                      marginBottom: reveal === "Other" ? "10px" : "0",
                    }}
                  >
                    {REVEAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {reveal === "Other" && (
                    <input
                      type="text"
                      value={revealOther}
                      onChange={(e) => setRevealOther(e.target.value)}
                      placeholder="Enter reveal value"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                        marginTop: "10px",
                      }}
                    />
                  )}
                </div>

                {/* Glazing */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Glazing *
                  </label>
                  <select
                    value={glazing}
                    onChange={(e) => setGlazing(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {GLAZING_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* BAL Rating */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    BAL Rating *
                  </label>
                  <select
                    value={balRating}
                    onChange={(e) => setBalRating(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {BAL_RATING_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Required */}
                <div style={{ marginBottom: "24px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Date Required *
                  </label>
                  <select
                    value={dateRequired}
                    onChange={(e) => setDateRequired(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {DATE_REQUIRED_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Modal Buttons */}
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={handleCloseOrderModal}
                    disabled={isOrdering}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: "500",
                      color: MONUMENT,
                      background: WHITE,
                      border: `1px solid ${MONUMENT}`,
                      borderRadius: "8px",
                      cursor: isOrdering ? "not-allowed" : "pointer",
                      opacity: isOrdering ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOrderWindows}
                    disabled={isOrdering}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: "500",
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: isOrdering ? "not-allowed" : "pointer",
                      opacity: isOrdering ? 0.6 : 1,
                    }}
                  >
                    {isOrdering ? "Ordering..." : "Order Windows"}
                  </button>
                </div>
              </div>
            </div>
          )}

      {showWindowOrderModal && project?.id && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "16px",
          }}
          onClick={closeWindowOrderModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "min(960px, 100%)",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="window-order-modal-title"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
                flexShrink: 0,
                gap: "12px",
              }}
            >
              <h2 id="window-order-modal-title" style={{ margin: 0, fontSize: "1.35rem", color: MONUMENT }}>
                Window order PDF
              </h2>
              <button
                type="button"
                onClick={closeWindowOrderModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {project?.window_order_pdf_location?.trim() ? (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", marginBottom: "16px" }}>
                <iframe
                  key={windowOrderIframeNonce}
                  src={`${API_URL}/api/files/window-order/${project.id}?t=${windowOrderIframeNonce}`}
                  style={{
                    width: "100%",
                    flex: 1,
                    border: "none",
                    borderRadius: "8px",
                    minHeight: "420px",
                    background: "#eee",
                  }}
                  title="Window order PDF"
                />
              </div>
            ) : (
              <p style={{ margin: "0 0 20px", color: MONUMENT, fontSize: "0.95rem", lineHeight: 1.5 }}>
                No window order PDF is registered yet. Use Choose PDF… to set the file path.
              </p>
            )}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
                justifyContent: "flex-end",
                flexShrink: 0,
                paddingTop: "4px",
                borderTop: `1px solid ${SECTION_GREY}`,
              }}
            >
              <button
                type="button"
                onClick={() => windowOrderLocateFileRef.current?.click()}
                style={{
                  padding: "10px 16px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${MONUMENT}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Choose PDF…
              </button>
              <button
                type="button"
                onClick={closeWindowOrderModal}
                style={{
                  padding: "10px 16px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Preview/Send Modal */}
      {showEmailModal && (
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
            zIndex: 2000,
            pointerEvents: "auto",
          }}
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
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Preview & Send Window Order Email
            </h3>

            <div style={{ marginBottom: "20px", fontSize: "0.9rem", color: MONUMENT, lineHeight: 1.5 }}>
              <div>
                <span style={{ color: UI.textMuted, fontWeight: 500 }}>From</span>{" "}
                {windowOrderEmailFrom || "—"}
              </div>
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "0.85rem", color: UI.textMuted, fontWeight: 500, marginBottom: "6px" }}>
                  To
                </div>
                <input
                  type="text"
                  value={windowOrderEmailTo}
                  onChange={(e) => setWindowOrderEmailTo(e.target.value)}
                  placeholder="name@example.com, other@example.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.95rem",
                    fontFamily: "inherit",
                    color: MONUMENT,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ marginTop: "8px", fontSize: "0.82rem", color: UI.textMuted, lineHeight: 1.4 }}>
                  Tip: separate multiple emails with commas.
                </div>
              </div>
            </div>

            {/* Email Body Section */}
            <div style={{ marginBottom: "24px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "12px", fontWeight: 500 }}>
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

            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleCloseEmailModal}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${MONUMENT}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: "500",
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
      )}

      {requireOrderNumberOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1300,
            padding: "16px",
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "min(520px, 100%)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="windows-order-number-title"
          >
            <h3 id="windows-order-number-title" style={{ margin: "0 0 12px 0", color: MONUMENT, fontSize: "1.2rem" }}>
              Enter order number
            </h3>
            <p style={{ margin: "0 0 16px 0", color: UI.textMuted, fontSize: "0.9rem", lineHeight: 1.45 }}>
              An order number is required before uploading the window order PDF.
            </p>
            <input
              type="text"
              autoComplete="off"
              value={pendingOrderNumber}
              onChange={(e) => setPendingOrderNumber(e.target.value)}
              placeholder="Order number"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                marginBottom: "16px",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmOrderNumber();
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeOrderNumberModal}
                style={{
                  padding: "10px 16px",
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${MONUMENT}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmOrderNumber}
                style={{
                  padding: "10px 16px",
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
