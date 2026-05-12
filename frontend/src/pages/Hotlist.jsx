import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import NewProject from "./NewProject_1_Address";
import NewProject2 from "./NewProject_2_ClientDetails";
import NewProject_3_ProjectCost from "./NewProject_3_ProjectCost";
import NewProject_4_FoldersOption from "./NewProject_4_FoldersOption";
import NewProject_5_PDFUpload from "./NewProject_5_PDFUpload";
import NewProject_6_EmailInternal from "./NewProject_6_EmailInternal";
import NewProject_7_EmailClient from "./NewProject_7_EmailClient";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { isUserAdmin } from "../utils/auth";
import {
  generalEmailStateCode,
  resolveHotlistSoldFromEmail,
  resolveHotlistSoldToEmail,
} from "../utils/emailGeneralSettings";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const PURPLE = "#7c3aed";
const PURPLE_HOVER = "#6d28d9";

const API_URL = "";

/** Same values as `NewProject_3_ProjectCost` — stored on `projects.stream`. */
const HOTLIST_PROJECT_STREAM_OPTIONS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Henderson",
  "Creat Cash Flow",
  "Fresh Start Advisory",
];

function normalizeHotlistProjectStream(s) {
  const t = (s || "").trim();
  if (!t) return "";
  if (t === "Pumped on Property" || t === "Pumped On Property") return "Pumped On Property";
  if (t === "Creat Cash Flow" || t === "Create Cash Flow") return "Create Cash Flow";
  return t;
}

function isGreenStreamHotlistItem(item) {
  const t = normalizeHotlistProjectStream(item?.stream).toLowerCase();
  if (!t) return false;
  const greens = new Set([
    "dual dwelling",
    "ata",
    "pumped on property",
    "henderson",
    "create cash flow",
    "creat cash flow",
    "fresh start advisory",
  ]);
  return greens.has(t);
}

/** Buckets for list layout; unknown stream values go to `unassigned` so they stay visible. */
function hotlistStreamGroup(item) {
  const st = (item?.stream || "").trim();
  if (!st) return "unassigned";
  if (st === "SGF - VIC") return "sgf_vic";
  if (st === "SGF - QLD") return "sgf_qld";
  if (isGreenStreamHotlistItem(item)) return "green";
  return "unassigned";
}

export default function Hotlist() {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const location = useLocation();
  const [hotlistItems, setHotlistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSoldFlowOpen, setIsSoldFlowOpen] = useState(false);
  const [soldItemId, setSoldItemId] = useState(null);
  const [soldPreviewOpen, setSoldPreviewOpen] = useState(false);
  const [soldPreviewPreparing, setSoldPreviewPreparing] = useState(false);
  const [soldPreviewItem, setSoldPreviewItem] = useState(null);
  const [soldAttachmentModalOpen, setSoldAttachmentModalOpen] = useState(false);
  const [soldAttachmentDragging, setSoldAttachmentDragging] = useState(false);
  const [soldAttachmentFile, setSoldAttachmentFile] = useState(null);
  const [soldEmailTo, setSoldEmailTo] = useState("");
  const [soldEmailFrom, setSoldEmailFrom] = useState("");
  const [soldEmailSubject, setSoldEmailSubject] = useState("");
  const [soldEmailBody, setSoldEmailBody] = useState("");
  const [currentModal, setCurrentModal] = useState(1); // New: 1–3 (address, client, stream). Edit: 1–2. Sold: 3–7 (ProjectCost→…)
  const [createdProjectId, setCreatedProjectId] = useState(null);
  const [createdProjectForEmail, setCreatedProjectForEmail] = useState(null);
  const [agreementSentItems, setAgreementSentItems] = useState(new Set());
  const [formData, setFormData] = useState({
    street: "",
    suburb: "",
    state: "",
    clientName: "",
    email: "",
    phone: "",
    projectCost: "",
    deposit: "",
    stream: "",
    salesperson: "",
    specs: "",
    classification: "",
    proposalFile: null,
    customDeposit: "",
  });

  useEffect(() => {
    checkAdminStatus();
    fetchHotlist();
  }, []);

  // Re-check admin status when navigating back to this page
  useEffect(() => {
    let isMounted = true;
    
    const handleFocus = () => {
      if (isMounted && location.pathname === "/hotlist") {
        checkAdminStatus();
      }
    };
    
    const handleVisibilityChange = () => {
      if (isMounted && !document.hidden && location.pathname === "/hotlist") {
        checkAdminStatus();
      }
    };
    
    // Check when navigating to this page
    if (location.pathname === "/hotlist") {
      checkAdminStatus();
    }
    
    // Also check when window gains focus
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname]);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  async function fetchHotlist() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/hotlist`);
      if (!response.ok) {
        throw new Error(`Failed to fetch hotlist: ${response.statusText}`);
      }
      const data = await response.json();
      setHotlistItems(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching hotlist:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleNewItemClick() {
    setFormData({
      street: "",
      suburb: "",
      state: "",
      clientName: "",
      email: "",
      phone: "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      specs: "",
      classification: "",
      proposalFile: null,
      customDeposit: "",
    });
    setCurrentModal(1);
    setIsNewItemOpen(true);
  }

  function handleEditItemClick(item) {
    setEditingItem(item);
    setFormData({
      street: item.street || "",
      suburb: item.suburb || "",
      state: item.state || "",
      clientName: item.client_name || "",
      email: item.email || "",
      phone: item.phone || "",
      projectCost: "",
      deposit: "",
      stream: item.stream || "",
      salesperson: "",
      specs: "",
      classification: "",
      proposalFile: null,
      customDeposit: "",
    });
    setCurrentModal(1);
    setIsEditItemOpen(true);
  }

  function handleFormDataChange(newData) {
    setFormData(newData);
  }

  function handleModalNext() {
    if (currentModal === 1) {
      setCurrentModal(2);
    } else if (currentModal === 2) {
      if (isNewItemOpen) {
        setCurrentModal(3);
      } else if (isEditItemOpen) {
        handleUpdateHotlistItem();
      } else if (isSoldFlowOpen) {
        setCurrentModal(3);
      }
    } else if (currentModal === 3) {
      if (isNewItemOpen) {
        if (!formData.stream || !String(formData.stream).trim()) {
          alert("Please select a stream for this hotlist entry.");
          return;
        }
        void handleCreateHotlistItem();
      } else {
        setCurrentModal(4);
      }
    } else if (currentModal === 4) {
      // This is handled by NewProject4's handleCreateProject
    }
  }

  function handleModalBack() {
    if (currentModal === 2) {
      setCurrentModal(1);
    } else if (currentModal === 3) {
      setCurrentModal(2);
    } else if (currentModal === 4) {
      setCurrentModal(3);
    }
  }

  function handleModalClose() {
    const wasSoldFlow = isSoldFlowOpen;
    const projectId = createdProjectId;
    
    setIsNewItemOpen(false);
    setIsEditItemOpen(false);
    setIsSoldFlowOpen(false);
    setEditingItem(null);
    setSoldItemId(null);
    setCurrentModal(1);
    setFormData({
      street: "",
      suburb: "",
      state: "",
      clientName: "",
      email: "",
      phone: "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      specs: "",
      classification: "",
      proposalFile: null,
      customDeposit: "",
    });
    
    // Navigate to project if we just completed a sold flow
    if (wasSoldFlow && projectId) {
      setTimeout(() => {
        window.location.href = `/project/${projectId}`;
      }, 100);
    }
    
    setCreatedProjectId(null);
    setCreatedProjectForEmail(null);
  }

  async function handleCreateHotlistItem() {
    try {
      const response = await fetch(`${API_URL}/api/hotlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          street: formData.street || null,
          suburb: formData.suburb || null,
          state: formData.state || null,
          stream: formData.stream ? String(formData.stream).trim() : null,
          client_name: formData.clientName || null,
          email: formData.email || null,
          phone: formData.phone || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      await fetchHotlist();
      handleModalClose();
    } catch (err) {
      console.error("Error creating hotlist item:", err);
      alert("Error creating hotlist item: " + err.message);
    }
  }

  async function handleUpdateHotlistItem() {
    if (!editingItem?.id) return;

    try {
      const response = await fetch(`${API_URL}/api/hotlist/${editingItem.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          street: formData.street || null,
          suburb: formData.suburb || null,
          state: formData.state || null,
          stream: (() => {
            const fromForm = formData.stream != null ? String(formData.stream).trim() : "";
            if (fromForm) return fromForm;
            const fromItem = editingItem?.stream != null ? String(editingItem.stream).trim() : "";
            return fromItem || null;
          })(),
          client_name: formData.clientName || null,
          email: formData.email || null,
          phone: formData.phone || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      await fetchHotlist();
      handleModalClose();
    } catch (err) {
      console.error("Error updating hotlist item:", err);
      alert("Error updating hotlist item: " + err.message);
    }
  }

  async function handleDeleteItem(id) {
    if (!confirm("Are you sure you want to delete this hotlist item?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/hotlist/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      await fetchHotlist();
    } catch (err) {
      console.error("Error deleting hotlist item:", err);
      alert("Error deleting hotlist item: " + err.message);
    }
  }

  async function handleHotlistStreamChange(item, nextStream) {
    const streamVal = nextStream != null && String(nextStream).trim() ? String(nextStream).trim() : null;
    try {
      const response = await fetch(`${API_URL}/api/hotlist/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          street: item.street || null,
          suburb: item.suburb || null,
          state: item.state || null,
          stream: streamVal,
          client_name: item.client_name || null,
          email: item.email || null,
          phone: item.phone || null,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }
      await fetchHotlist();
    } catch (err) {
      console.error("Error updating hotlist stream:", err);
      alert("Error updating stream: " + err.message);
    }
  }

  async function handleAgreementSentClick(item) {
    try {
      const response = await fetch(`${API_URL}/api/hotlist/${item.id}/agreement-sent`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      // Refresh the hotlist to get updated data
      await fetchHotlist();
    } catch (err) {
      console.error("Error marking agreement as sent:", err);
      alert("Error marking agreement as sent: " + err.message);
    }
  }

  function handleEmailClick(item) {
    if (!item.email) {
      alert("No email address available for this client.");
      return;
    }

    const projectAddress = `${item.street || ""}, ${item.suburb || ""}`.trim() || "Project";
    const clientName = item.client_name || "Client";
    const firstName = clientName.trim().split(/\s+/)[0] || clientName;
    const subject = encodeURIComponent(projectAddress);
    const body = encodeURIComponent(`Hi ${firstName},\n\n`);
    
    const mailtoLink = `mailto:${item.email}?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
  }

  function replaceSoldTokens(text, item) {
    if (!text) return "";
    const address = `${item?.street || ""}, ${item?.suburb || ""}`.trim();
    const map = {
      "{ProjectName}": address,
      "{Address}": address,
      "{Street}": item?.street || "",
      "{Suburb}": item?.suburb || "",
      "{State}": item?.state || "",
      "{ClientName}": item?.client_name || "",
      "{Contact1}": item?.email || "",
      "{Email}": item?.email || "",
      "{Phone}": item?.phone || "",
    };
    let out = String(text);
    Object.entries(map).forEach(([k, v]) => {
      out = out.split(k).join(v || "");
    });
    return out;
  }

  function handleSoldClick(item) {
    setSoldPreviewItem(item);
    setSoldAttachmentFile(null);
    setSoldAttachmentDragging(false);
    setSoldAttachmentModalOpen(true);
  }

  function handleSoldAttachmentSelect(file) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      alert("Please select a PDF file.");
      return;
    }
    setSoldAttachmentFile(file);
  }

  function handleSoldAttachmentDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setSoldAttachmentDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleSoldAttachmentSelect(files[0]);
    }
  }

  async function openSoldEmailPreview(item) {
    if (!item) return;
    setSoldPreviewItem(item);
    setSoldPreviewOpen(true);
    setSoldPreviewPreparing(true);
    try {
      const [templatesResponse, settingsResponse] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (!templatesResponse.ok) throw new Error("Failed to fetch email templates");
      const templates = await templatesResponse.json();
      const settings = settingsResponse.ok ? await settingsResponse.json() : {};
      const template = templates.find(
        (t) => t.name && t.name.toLowerCase().trim() === "hotlist sold"
      );
      if (!template) {
        alert('Template "Hotlist Sold" not found. Please create it in Settings -> Email Templates.');
        setSoldPreviewOpen(false);
        return;
      }

      const stateCode = generalEmailStateCode(item);
      if (!stateCode) {
        alert(
          "Set State to VIC or QLD on this Hot List entry. General → Hot List Sold email uses that state (not the stream) to pick addresses."
        );
        setSoldPreviewOpen(false);
        return;
      }

      const fromAddress = resolveHotlistSoldFromEmail(settings, item).trim();
      const resolvedTo = resolveHotlistSoldToEmail(settings, item).trim();
      if (!resolvedTo) {
        alert(
          `Set To for ${stateCode} under Settings → Email Settings → General → Hot List → Sold email (${stateCode} column).`
        );
        setSoldPreviewOpen(false);
        return;
      }
      if (!fromAddress) {
        alert(
          `Set From for ${stateCode} under Settings → Email Settings → General → Hot List → Sold email (${stateCode} column).`
        );
        setSoldPreviewOpen(false);
        return;
      }

      setSoldEmailTo(resolvedTo);
      setSoldEmailFrom(fromAddress);
      setSoldEmailSubject(replaceSoldTokens(template.subject || "", item));
      setSoldEmailBody(replaceSoldTokens(template.body || "", item));
    } catch (err) {
      console.error("Error preparing sold email:", err);
      alert(`Failed to prepare sold email: ${err.message || "Unknown error"}`);
      setSoldPreviewOpen(false);
    } finally {
      setSoldPreviewPreparing(false);
    }
  }

  async function handleSoldAttachmentNext() {
    if (!soldAttachmentFile) {
      alert("Please drag in a PDF first.");
      return;
    }
    const item = soldPreviewItem;
    setSoldAttachmentModalOpen(false);
    await openSoldEmailPreview(item);
  }

  async function handleSendSoldEmail() {
    const toAddresses = soldEmailTo
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address.");
      return;
    }
    if (!soldEmailFrom.trim()) {
      alert("From address is required.");
      return;
    }
    try {
      await runWithEmailOverlay(async () => {
        let attachmentPayload = null;
        if (soldAttachmentFile) {
          const fileBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || "");
              const b64 = result.includes(",") ? result.split(",")[1] : result;
              resolve(b64);
            };
            reader.onerror = () => reject(new Error("Could not read attachment file."));
            reader.readAsDataURL(soldAttachmentFile);
          });
          attachmentPayload = {
            filename: soldAttachmentFile.name || "SoldAttachment.pdf",
            contentType: soldAttachmentFile.type || "application/pdf",
            contentBase64: fileBase64,
          };
        }

        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toAddresses,
            from: soldEmailFrom.trim(),
            subject: soldEmailSubject || "",
            htmlBody: soldEmailBody || "",
            attachments: attachmentPayload ? [attachmentPayload] : [],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      });
      setSoldPreviewOpen(false);
      setSoldPreviewItem(null);
      setSoldAttachmentFile(null);
      alert("Hotlist sold email sent.");
    } catch (err) {
      console.error("Error sending sold email:", err);
      alert(err.message || "Failed to send sold email.");
    }
  }

  function handleMakeJobFileClick(item) {
    setSoldItemId(item.id);
    setFormData({
      street: item.street || "",
      suburb: item.suburb || "",
      state: item.state || "",
      clientName: item.client_name || "",
      email: item.email || "",
      phone: item.phone || "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      specs: "",
      classification: "",
      proposalFile: null,
      customDeposit: "",
    });
    setCreatedProjectForEmail(null);
    setCurrentModal(3); // Sold flow: start at step 3 (Project Cost), then 4=Folders, 5=PDF, 6=Email
    setIsSoldFlowOpen(true);
  }

  async function handleCreateProjectFromSold(formData) {
    if (!soldItemId) return;

    try {
      // First upgrade the hotlist item to a project
      const upgradeResponse = await fetch(`${API_URL}/api/hotlist/${soldItemId}/sold`, {
        method: "POST",
      });

      if (!upgradeResponse.ok) {
        const errorText = await upgradeResponse.text().catch(() => upgradeResponse.statusText);
        throw new Error(errorText);
      }

      const upgradeResult = await upgradeResponse.json();
      const newProject = upgradeResult.project;

      // Now update the project with the additional data from modals 3 and 4
      const projectName = `${formData.street || ""}, ${formData.suburb || ""}`.trim() || "New Project";
      
      const updateData = {
        name: projectName,
        project_cost: formData.projectCost || null,
        deposit: formData.deposit || null,
        stream: formData.stream || null,
        salesperson: formData.salesperson || null,
        specs: formData.specs || null,
        classification: formData.classification || null,
      };

      const updateResponse = await fetch(`${API_URL}/api/projects/${newProject.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!updateResponse.ok) {
        console.error("Failed to update project with additional data");
      }

      await fetchHotlist();
      setCreatedProjectId(newProject.id);

      // Merge form data into project so email modal (step 6) has deposit, project_cost, etc.
      const projectForEmail = {
        ...newProject,
        project_cost: formData.projectCost || newProject.project_cost,
        deposit: formData.deposit || newProject.deposit,
        stream: formData.stream || newProject.stream,
        salesperson: formData.salesperson || newProject.salesperson,
        specs: formData.specs || newProject.specs,
        classification: formData.classification || newProject.classification,
      };
      return projectForEmail;
    } catch (err) {
      console.error("Error creating project from sold item:", err);
      alert("Error creating project: " + err.message);
      throw err;
    }
  }

  const isAgreementSent = (item) => {
    return item.agreement_sent === "true" || item.agreement_sent === true || agreementSentItems.has(item.id);
  };

  function getAgreementRowBackground(item) {
    if (!isAgreementSent(item)) return WHITE;
    const st = (item.stream || "").trim();
    if (st === "SGF - VIC") return "#4D93D9";
    if (st === "SGF - QLD") return "#D54358";
    if (isGreenStreamHotlistItem(item)) return "#92D050";
    return "#6b7280";
  }

  function sortHotlistItems(items) {
    return [...items].sort((a, b) => {
      const aSent = isAgreementSent(a);
      const bSent = isAgreementSent(b);
      if (aSent !== bSent) return aSent ? -1 : 1;
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();
      return streetA.localeCompare(streetB);
    });
  }

  const unassignedItems = React.useMemo(
    () => sortHotlistItems(hotlistItems.filter((item) => hotlistStreamGroup(item) === "unassigned")),
    [hotlistItems, agreementSentItems]
  );

  const sgfVicItems = React.useMemo(
    () => sortHotlistItems(hotlistItems.filter((item) => hotlistStreamGroup(item) === "sgf_vic")),
    [hotlistItems, agreementSentItems]
  );

  const sgfQldItems = React.useMemo(
    () => sortHotlistItems(hotlistItems.filter((item) => hotlistStreamGroup(item) === "sgf_qld")),
    [hotlistItems, agreementSentItems]
  );

  const greenStreamItems = React.useMemo(
    () => sortHotlistItems(hotlistItems.filter((item) => hotlistStreamGroup(item) === "green")),
    [hotlistItems, agreementSentItems]
  );

  function renderHotlistRow(item, columnAccent) {
    const displayName = `${item.street || ""}, ${item.suburb || ""}`.trim() || "Unnamed Address";
    const itemIsAgreementSent = isAgreementSent(item);
    const rowBg = getAgreementRowBackground(item);
    const useLightText = itemIsAgreementSent;
    const accent =
      columnAccent === "qld"
        ? { agreementBg: "#D54358", agreementHover: "#c4364b" }
        : columnAccent === "green"
          ? { agreementBg: "#92D050", agreementHover: "#7ab842" }
          : columnAccent === "neutral"
            ? { agreementBg: MONUMENT, agreementHover: "#1a1a1a" }
            : { agreementBg: "#4D93D9", agreementHover: "#3d7bc9" };

    const streamVal = item.stream || "";
    const streamKnown = HOTLIST_PROJECT_STREAM_OPTIONS.includes(streamVal);

    return (
      <div
        key={item.id}
        style={{
          background: rowBg,
          borderRadius: "10px",
          padding: "8px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", minWidth: 0 }}>
          <span
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: useLightText ? WHITE : MONUMENT,
            }}
          >
            {displayName}
          </span>
          {item.state ? (
            <>
              <span style={{ color: useLightText ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
              <span style={{ fontSize: "0.9rem", color: useLightText ? "rgba(255,255,255,0.9)" : "#666" }}>
                {item.state}
              </span>
            </>
          ) : null}
          {item.client_name ? (
            <>
              <span style={{ color: useLightText ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
              <span style={{ fontSize: "0.9rem", color: useLightText ? "rgba(255,255,255,0.9)" : "#666" }}>
                {item.client_name}
              </span>
            </>
          ) : null}
          {item.email ? (
            <>
              <span style={{ color: useLightText ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
              <span style={{ fontSize: "0.9rem", color: useLightText ? "rgba(255,255,255,0.8)" : "#888" }}>
                {item.email}
              </span>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            aria-label="Project stream"
            value={streamVal || ""}
            onChange={(e) => handleHotlistStreamChange(item, e.target.value)}
            style={{
              padding: "6px 8px",
              borderRadius: "8px",
              border: `1px solid ${MONUMENT}55`,
              fontSize: "0.82rem",
              color: MONUMENT,
              backgroundColor: WHITE,
              minWidth: "160px",
              maxWidth: "220px",
              cursor: "pointer",
            }}
          >
            <option value="" style={{ color: MONUMENT, backgroundColor: WHITE }}>
              — Stream —
            </option>
            {HOTLIST_PROJECT_STREAM_OPTIONS.map((opt) => (
              <option key={opt} value={opt} style={{ color: MONUMENT, backgroundColor: WHITE }}>
                {opt}
              </option>
            ))}
            {!streamKnown && streamVal ? (
              <option value={streamVal} style={{ color: MONUMENT, backgroundColor: WHITE }}>
                {streamVal} (current)
              </option>
            ) : null}
          </select>
          {!itemIsAgreementSent ? (
            <button
              type="button"
              onClick={() => handleAgreementSentClick(item)}
              style={{
                background: accent.agreementBg,
                color: WHITE,
                border: `1px solid ${accent.agreementBg}`,
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = accent.agreementHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = accent.agreementBg)}
            >
              Agreement Sent
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleSoldClick(item)}
            style={{
              background: "#33cc33",
              color: WHITE,
              border: "1px solid #33cc33",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
          >
            Sold
          </button>
          <button
            type="button"
            onClick={() => handleMakeJobFileClick(item)}
            style={{
              background: PURPLE,
              color: WHITE,
              border: `1px solid ${PURPLE}`,
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = PURPLE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = PURPLE)}
          >
            Make Job File
          </button>
          <button
            type="button"
            onClick={() => handleEmailClick(item)}
            style={{
              background: "#FFA500",
              color: WHITE,
              border: "1px solid #FFA500",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#FF8C42")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFA500")}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => handleEditItemClick(item)}
            style={{
              background: MONUMENT,
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
            onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDeleteItem(item.id)}
            style={{
              background: "#cc3333",
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#b71c1c")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#cc3333")}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes flame-flicker {
            0% {
              transform: scale(0.8) rotate(0deg) scaleX(1);
            }
            11.11% {
              transform: scale(1.0) rotate(-8deg) scaleX(-1);
            }
            22.22% {
              transform: scale(1.2) rotate(8deg) scaleX(1);
            }
            33.33% {
              transform: scale(0.85) rotate(-6deg) scaleX(-1);
            }
            44.44% {
              transform: scale(1.05) rotate(0deg) scaleX(1);
            }
            55.55% {
              transform: scale(1.15) rotate(6deg) scaleX(-1);
            }
            66.66% {
              transform: scale(0.9) rotate(-4deg) scaleX(1);
            }
            77.77% {
              transform: scale(1.1) rotate(4deg) scaleX(-1);
            }
            88.88% {
              transform: scale(0.95) rotate(-2deg) scaleX(1);
            }
            100% {
              transform: scale(1.0) rotate(2deg) scaleX(-1);
            }
          }
          @keyframes flame-background {
            0% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            25% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            25.01% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
            50% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
            50.01% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            75% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            75.01% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
            100% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
          }
        `}
      </style>
      <div
        className="page-container"
        style={{
          position: "fixed",
          inset: 0,
          background: LIGHT_MONUMENT,
          minHeight: "100vh",
          width: "100vw",
          overflowY: "auto",
        }}
      >
      {/* Section 1: Heading */}
      <div
        style={{
          margin: "32px auto 14px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          boxSizing: "border-box",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img
            src={logo}
            alt="SGF Logo"
            style={{
              width: "120px",
              height: "auto",
            }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: "2.2rem",
                display: "inline-block",
                animation: "flame-background 1.2s ease-in-out infinite",
                position: "absolute",
                zIndex: 0,
              }}
            >
              🔥
            </span>
            <span
              style={{
                fontSize: "1.8rem",
                display: "inline-block",
                animation: "flame-flicker 2.4s ease-in-out infinite",
                position: "relative",
                zIndex: 1,
              }}
            >
              🔥
            </span>
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Hot List
          </h1>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: "2.2rem",
                display: "inline-block",
                animation: "flame-background 1.2s ease-in-out infinite",
                animationDelay: "0.6s",
                position: "absolute",
                zIndex: 0,
              }}
            >
              🔥
            </span>
            <span
              style={{
                fontSize: "1.8rem",
                display: "inline-block",
                animation: "flame-flicker 2.4s ease-in-out infinite",
                animationDelay: "1.2s",
                position: "relative",
                zIndex: 1,
              }}
            >
              🔥
            </span>
          </span>
        </div>
        <button
          onClick={handleNewItemClick}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            background: "#33cc33",
            color: WHITE,
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "1rem",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
        >
          + New Address
        </button>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        {/* Section 2: Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
          }}
        >
          {/* Menu Buttons */}
          {/* Hot List - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <Link
              to="/hotlist"
              style={{
                background: "#4D93D9",
                color: WHITE,
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Hot List
            </Link>
          </div>
          
          {/* All Projects, Design Phase, Construction Phase, Finished Projects, Cancelled, On Hold - Light Green */}
          <div style={{ background: "#CEEAB0", borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: "2px solid #000" }}>
            <Link
              to="/all-projects"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              All Projects
            </Link>
            <Link
              to="/projects"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Design Phase
            </Link>
            <Link
              to="/construction-phase"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Construction Phase
            </Link>
            <Link
              to="/finished-projects"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Finished Projects
            </Link>
            <Link
              to="/cancelled"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Cancelled
            </Link>
            <Link
              to="/on-hold"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              On Hold
            </Link>
          </div>
          
          {/* Managers and Sales - Light Red */}
          <div style={{ background: "#F79198", borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: "2px solid #000" }}>
            <Link
              to="/managers"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Managers
            </Link>
            <Link
              to="/sales"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Sales
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Link
              to="/settings"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Settings
            </Link>
          )}
        </div>

        {/* Section 3: Project List */}
        <div
          className="project-list"
          style={{
            flex: 1,
            background: SECTION_GREY,
            borderRadius: "16px",
            padding: "32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            minHeight: "758px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {loading ? (
            <div style={{ color: MONUMENT, fontSize: "1rem" }}>Loading...</div>
          ) : error ? (
            <div style={{ color: "#cc3333", fontSize: "1rem" }}>Error: {error}</div>
          ) : hotlistItems.length === 0 ? (
            <div style={{ color: MONUMENT, fontSize: "1rem" }}>No hotlist items yet. Click "+ New Address" to add one.</div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "32px",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                <h2 style={{ color: MONUMENT, fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>SGF - VIC</h2>
                {sgfVicItems.length === 0 ? (
                  <div style={{ color: MONUMENT, fontSize: "0.9rem", fontStyle: "italic" }}>No items</div>
                ) : (
                  sgfVicItems.map((item) => renderHotlistRow(item, "vic"))
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                <h2 style={{ color: MONUMENT, fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>SGF - QLD</h2>
                {sgfQldItems.length === 0 ? (
                  <div style={{ color: MONUMENT, fontSize: "0.9rem", fontStyle: "italic" }}>No items</div>
                ) : (
                  sgfQldItems.map((item) => renderHotlistRow(item, "qld"))
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
                <h2 style={{ color: MONUMENT, fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Green Streams</h2>
                {unassignedItems.length === 0 && greenStreamItems.length === 0 ? (
                  <div style={{ color: MONUMENT, fontSize: "0.9rem", fontStyle: "italic" }}>No items</div>
                ) : (
                  <>
                    {unassignedItems.map((item) => renderHotlistRow(item, "neutral"))}
                    {greenStreamItems.map((item) => renderHotlistRow(item, "green"))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isNewItemOpen && (
        <>
          {currentModal === 1 && (
            <NewProject
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onNext={handleModalNext}
            />
          )}
          {currentModal === 2 && (
            <NewProject2
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalBack}
              onNext={handleModalNext}
            />
          )}
          {currentModal === 3 && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 99990,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
              }}
              onClick={handleModalClose}
            >
              <div
                style={{
                  background: WHITE,
                  borderRadius: "12px",
                  padding: "24px",
                  maxWidth: "480px",
                  width: "100%",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ margin: "0 0 8px 0", fontSize: "1.25rem", color: MONUMENT, fontWeight: 700 }}>
                  Project stream
                </h2>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.95rem", color: "#555", lineHeight: 1.45 }}>
                  Choose the stream for this hotlist entry. This is the same <strong>stream</strong> field used on projects.
                </p>
                <label style={{ display: "block", fontSize: "0.88rem", color: MONUMENT, fontWeight: 600, marginBottom: "8px" }}>
                  Stream
                </label>
                <select
                  value={formData.stream || ""}
                  onChange={(e) =>
                    handleFormDataChange({ ...formData, stream: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    backgroundColor: WHITE,
                    boxSizing: "border-box",
                    marginBottom: "20px",
                  }}
                >
                  <option value="" style={{ color: MONUMENT, backgroundColor: WHITE }}>
                    Select stream…
                  </option>
                  {HOTLIST_PROJECT_STREAM_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} style={{ color: MONUMENT, backgroundColor: WHITE }}>
                      {opt}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={handleModalBack}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      background: SECTION_GREY,
                      color: MONUMENT,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleModalNext}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: MONUMENT,
                      color: WHITE,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Save entry
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isEditItemOpen && (
        <>
          {currentModal === 1 && (
            <NewProject
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onNext={handleModalNext}
            />
          )}
          {currentModal === 2 && (
            <NewProject2
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalBack}
              onNext={handleModalNext}
            />
          )}
        </>
      )}

      {isSoldFlowOpen && (
        <>
          {currentModal === 3 && (
            <NewProject_3_ProjectCost
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalClose}
              onNext={() => setCurrentModal(4)}
            />
          )}
          {currentModal === 4 && (
            <NewProject_4_FoldersOption
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={() => setCurrentModal(3)}
              onYes={() => setCurrentModal(5)}
              onNo={async () => {
                try {
                  const project = await handleCreateProjectFromSold(formData);
                  if (project) setCreatedProjectForEmail(project);
                  setCurrentModal(6);
                } catch (e) {
                  // Error already shown in handleCreateProjectFromSold
                }
              }}
            />
          )}
          {currentModal === 5 && (
            <NewProject_5_PDFUpload
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={() => setCurrentModal(4)}
              onNext={(project) => {
                if (project) setCreatedProjectForEmail(project);
                setCurrentModal(6);
              }}
              onCreate={handleCreateProjectFromSold}
            />
          )}
          {currentModal === 6 && (
            <NewProject_6_EmailInternal
              isOpen={true}
              onClose={handleModalClose}
              createdProjectForEmail={createdProjectForEmail}
              onSendSuccess={() => setCurrentModal(7)}
            />
          )}
          {currentModal === 7 && (
            <NewProject_7_EmailClient
              isOpen={true}
              onClose={handleModalClose}
              createdProjectForEmail={createdProjectForEmail}
            />
          )}
        </>
      )}

      {soldPreviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "800px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                onClick={() => {
                  setSoldPreviewOpen(false);
                  setSoldPreviewItem(null);
                }}
                style={{ background: "transparent", border: "none", fontSize: "1.5rem", cursor: "pointer", color: MONUMENT }}
              >
                ×
              </button>
            </div>

            {soldPreviewPreparing ? (
              <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>Preparing email...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "0.9rem", color: "#666" }}>
                  Template: <strong>Hotlist Sold</strong>
                  {soldPreviewItem ? ` | ${soldPreviewItem.street || ""}, ${soldPreviewItem.suburb || ""}` : ""}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>To</label>
                  <input value={soldEmailTo} onChange={(e) => setSoldEmailTo(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${SECTION_GREY}`, fontSize: "1rem", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>From</label>
                  <input value={soldEmailFrom} onChange={(e) => setSoldEmailFrom(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${SECTION_GREY}`, fontSize: "1rem", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>Subject</label>
                  <input value={soldEmailSubject} onChange={(e) => setSoldEmailSubject(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${SECTION_GREY}`, fontSize: "1rem", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>Email Preview</label>
                  <div contentEditable suppressContentEditableWarning onInput={(e) => setSoldEmailBody(e.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: soldEmailBody || "" }} style={{ width: "100%", minHeight: "220px", maxHeight: "42vh", overflowY: "auto", padding: "12px", borderRadius: "8px", border: `1px solid ${SECTION_GREY}`, background: WHITE, fontSize: "1rem", color: MONUMENT, boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "4px" }}>
                  <button type="button" onClick={() => { setSoldPreviewOpen(false); setSoldPreviewItem(null); }} style={{ background: SECTION_GREY, color: MONUMENT, border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "0.95rem", fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                  <button type="button" onClick={handleSendSoldEmail} style={{ background: MONUMENT, color: WHITE, border: "none", borderRadius: "8px", padding: "10px 20px", fontSize: "0.95rem", fontWeight: 500, cursor: "pointer" }}>Send</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {soldAttachmentModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99998,
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "560px",
              width: "100%",
              boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 10px 0", fontSize: "1.35rem", color: MONUMENT, fontWeight: 600 }}>
              Sold Email Attachment
            </h2>
            <p style={{ margin: "0 0 14px 0", fontSize: "0.95rem", color: LIGHT_MONUMENT }}>
              Drag in the PDF to attach to the Sold email.
            </p>
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSoldAttachmentDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSoldAttachmentDragging(false);
              }}
              onDrop={handleSoldAttachmentDrop}
              onClick={() => document.getElementById("hotlist-sold-pdf-input")?.click()}
              style={{
                border: `2px dashed ${soldAttachmentDragging ? MONUMENT : "#ccc"}`,
                borderRadius: "12px",
                padding: "34px 16px",
                textAlign: "center",
                cursor: "pointer",
                background: soldAttachmentDragging ? "rgba(50,50,51,0.05)" : WHITE,
                marginBottom: "14px",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📄</div>
              <div style={{ color: MONUMENT, fontWeight: 600 }}>
                {soldAttachmentFile ? soldAttachmentFile.name : "Drop PDF here or click to browse"}
              </div>
              <div style={{ color: "#666", fontSize: "0.9rem", marginTop: "6px" }}>PDF only</div>
              <input
                id="hotlist-sold-pdf-input"
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: "none" }}
                onChange={(e) => handleSoldAttachmentSelect(e.target.files?.[0])}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  setSoldAttachmentModalOpen(false);
                  setSoldPreviewItem(null);
                  setSoldAttachmentFile(null);
                }}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSoldAttachmentNext}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
