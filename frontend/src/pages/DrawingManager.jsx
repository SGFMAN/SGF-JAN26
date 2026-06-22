import React, { useState, useEffect, useRef } from "react";
import {
  isDesignPhaseStatus,
  isHotlistStatus,
  isCancelledStatus,
  isOnHoldFlag,
} from "../utils/projectStatus";
import { Link } from "react-router-dom";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { getStateFilter } from "../utils/stateFilter";
import { projectPath } from "../utils/projectUrl";
import {
  resolveNewProjectClientFrom,
  resolveNewProjectClientToEmails,
  findSalespersonUserInList,
} from "../utils/streamNewProjectEmail";
import {
  DRAFTSPERSON_UNASSIGNED,
  normalizeDraftspersonField,
  isDraftspersonAssigned,
} from "../utils/draftspersonSentinel";
import { getUserPrimaryPositionName } from "../utils/userPosition";
import { emailLinkBaseForApiBody } from "../utils/emailLinkBaseForApi";
import { isLatestRevisionWorkingDrawingsApproved } from "../utils/drawingsStatusRules";
import useAppLogo from "../hooks/useAppLogo.js";

import StateFilterButtons from "../components/StateFilterButtons";
import { UI, BANNER, INDICATOR } from "../utils/uiThemeTokens.js";
import { getThemeBannerColors, readStoredUiThemeId } from "../themes/applyUiTheme";
import { getLoggedInUserId } from "../utils/auth";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const DRAWING_MANAGER_STATUS_SECTIONS = [
  "Not Assigned",
  "Concept Stage",
  "Working Drawing Stage",
];

function sortProjectsAlphabetically(projectsList) {
  return [...projectsList].sort((a, b) => {
    const suburbA = (a.suburb || "").toLowerCase();
    const suburbB = (b.suburb || "").toLowerCase();
    if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
    return (a.street || "").toLowerCase().localeCompare((b.street || "").toLowerCase());
  });
}

function getDrawingManagerStatusBucket(project) {
  const status = (project?.drawings_status || "").trim();
  if (status === "Concept Stage") return "Concept Stage";
  if (status === "Working Drawing Stage") return "Working Drawing Stage";
  return "Not Assigned";
}

function groupProjectsByDrawingStatus(projectsList) {
  const groups = Object.fromEntries(
    DRAWING_MANAGER_STATUS_SECTIONS.map((title) => [title, []])
  );
  for (const project of projectsList) {
    groups[getDrawingManagerStatusBucket(project)].push(project);
  }
  for (const title of DRAWING_MANAGER_STATUS_SECTIONS) {
    groups[title] = sortProjectsAlphabetically(groups[title]);
  }
  return groups;
}

/** Escape text for inclusion in HTML email fragments. */
function escapeHtmlForEmailList(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function DrawingManager() {
  const logo = useAppLogo();
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [draftspersonUsers, setDraftspersonUsers] = useState([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedProjectForReminder, setSelectedProjectForReminder] = useState(null);
  const [reminderEmailTo, setReminderEmailTo] = useState("");
  const [reminderEmailFrom, setReminderEmailFrom] = useState("");
  const [reminderEmailSubject, setReminderEmailSubject] = useState("");
  const [reminderEmailBody, setReminderEmailBody] = useState("");
  const [reminderSending, setReminderSending] = useState(false);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("ben@superiorgrannyflats.com.au");
  const [emailFrom, setEmailFrom] = useState("info@superiorgrannyflats.com.au");
  const [emailSubject, setEmailSubject] = useState("Drawing Manager Projects List");
  /** Styled HTML body for the list email (matches preview; sent as htmlBody). */
  const [emailListHtml, setEmailListHtml] = useState("");
  const [notesModalProjectId, setNotesModalProjectId] = useState(null);
  const [notesModalLabel, setNotesModalLabel] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  /** Snapshot when the modal opened — Cancel restores this (nothing is saved until OK). */
  const notesSnapshotRef = useRef("");

  useEffect(() => {
    fetchProjects();
    fetchDraftspersons();
  }, []);

  function openNotesModalForProject(project) {
    const suburb = project.suburb || "";
    const street = project.street || "";
    const label =
      suburb && street ? `${suburb} - ${street}` : suburb || street || project.name || `Project #${project.id}`;
    const saved = project.drawing_manager_notes != null ? String(project.drawing_manager_notes) : "";
    setNotesModalProjectId(project.id);
    setNotesModalLabel(label);
    notesSnapshotRef.current = saved;
    setNotesDraft(saved);
  }

  async function saveProjectDrawingManagerNotes(projectId, text) {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/drawing-manager-notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Save failed");
    }
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, drawing_manager_notes: text } : p))
    );
  }

  async function handleNotesModalOk() {
    if (notesModalProjectId == null) return;
    try {
      setNotesSaving(true);
      await saveProjectDrawingManagerNotes(notesModalProjectId, notesDraft);
      setNotesModalProjectId(null);
      setNotesModalLabel("");
    } catch (e) {
      alert(e.message || "Could not save notes.");
    } finally {
      setNotesSaving(false);
    }
  }

  function handleNotesModalCancel() {
    setNotesDraft(notesSnapshotRef.current);
    setNotesModalProjectId(null);
    setNotesModalLabel("");
  }

  function getDraftspersonDetailsByProject(project) {
    const stored = normalizeDraftspersonField(project?.draftsperson);
    if (!isDraftspersonAssigned(stored)) return { name: "", position: "" };
    const lower = stored.toLowerCase();
    const user = draftspersonUsers.find(
      (u) => (u.name || "").trim().toLowerCase() === lower
    );
    if (!user) return { name: stored, position: "" };
    const position = getUserPrimaryPositionName(user);
    return { name: user.name || "", position };
  }

  function applyTemplateTokens(templateText, tokenMap) {
    const source = templateText || "";
    return source.replace(/\{([^}]+)\}/g, (_m, tokenRaw) => {
      const key = String(tokenRaw || "").trim();
      if (!key) return "";
      if (Object.prototype.hasOwnProperty.call(tokenMap, key)) {
        return tokenMap[key] ?? "";
      }
      const lower = key.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(tokenMap, lower)) {
        return tokenMap[lower] ?? "";
      }
      return "";
    });
  }

  function buildClientFirstNames(project) {
    const entries = [
      { active: project?.client1_active, name: project?.client1_name },
      { active: project?.client2_active, name: project?.client2_name },
      { active: project?.client3_active, name: project?.client3_name },
    ];
    const names = entries
      .filter((e) => e.active === "true" && e.name && String(e.name).trim())
      .map((e) => String(e.name).trim().split(/\s+/)[0])
      .filter(Boolean);
    if (names.length === 0) {
      return (project?.client_name || "").trim();
    }
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  }

  async function openReminderEmailModal(project) {
    const mainEmail = (getMainEmailContact(project) || "").trim();
    try {
      const [templateResponse, settingsResponse, usersResponse] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
        fetch(`${API_URL}/api/users`),
      ]);
      if (!templateResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templateResponse.json();
      const settings = settingsResponse.ok ? await settingsResponse.json() : {};
      const users = usersResponse.ok ? await usersResponse.json() : [];
      const salespersonUser = findSalespersonUserInList(users, project?.salesperson);
      const template = templates.find((t) => t.name === "DRAWINGS - Reminder");
      if (!template) {
        alert('Email template "DRAWINGS - Reminder" not found. Please create it in Settings → Email Templates.');
        return;
      }

      const projectName =
        project?.street && project?.suburb
          ? `${project.street}, ${project.suburb}`.trim()
          : project?.name || "";
      const clientName = buildClientFirstNames(project);
      const { name: draftspersonName, position: draftspersonPosition } = getDraftspersonDetailsByProject(project);
      const contact1 = project?.client1_active === "true" && project?.client1_email ? project.client1_email : "";
      const contact2 = project?.client2_active === "true" && project?.client2_email ? project.client2_email : "";
      const contact3 = project?.client3_active === "true" && project?.client3_email ? project.client3_email : "";

      const tokenMap = {
        ProjectName: projectName,
        projectname: projectName,
        ClientName: clientName,
        clientname: clientName,
        Draftsperson: draftspersonName,
        draftsperson: draftspersonName,
        Position: draftspersonPosition,
        position: draftspersonPosition,
        Contact1: contact1,
        contact1: contact1,
        Contact2: contact2,
        contact2: contact2,
        Contact3: contact3,
        contact3: contact3,
        MainEmail: mainEmail,
        mainemail: mainEmail,
        Street: project?.street || "",
        street: project?.street || "",
        Suburb: project?.suburb || "",
        suburb: project?.suburb || "",
        State: project?.state || "",
        state: project?.state || "",
      };

      setSelectedProjectForReminder(project);
      const streamTo = resolveNewProjectClientToEmails(settings, project);
      setReminderEmailTo(streamTo.join(", ") || mainEmail || "");
      setReminderEmailFrom(resolveNewProjectClientFrom(settings, project, salespersonUser));
      setReminderEmailSubject(applyTemplateTokens(template.subject || "", tokenMap));
      setReminderEmailBody(applyTemplateTokens(template.body || "", tokenMap));
      setShowReminderModal(true);
    } catch (error) {
      console.error("Error opening reminder email modal:", error);
      alert(error.message || "Failed to prepare reminder email");
    }
  }

  function closeReminderModal() {
    setShowReminderModal(false);
    setSelectedProjectForReminder(null);
    setReminderEmailTo("");
    setReminderEmailFrom("");
    setReminderEmailSubject("");
    setReminderEmailBody("");
    setReminderSending(false);
  }

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

  function getDraftspersonName(raw) {
    const { name } = getDraftspersonDetailsByProject({ draftsperson: raw });
    return name || null;
  }

  // Check if deposit is partial (not fully paid)
  function isPartialDeposit(project) {
    if (!project?.deposit || !project?.project_cost) return true; // No deposit or no cost = partial
    
    // Extract numeric values (remove $ and commas)
    const depositStr = project.deposit.toString().replace(/[^0-9]/g, "");
    const depositNum = parseInt(depositStr) || 0;
    
    const costStr = project.project_cost.toString().replace(/[^0-9]/g, "");
    const costNum = parseInt(costStr) || 0;
    
    if (costNum === 0) return true; // Can't calculate if no cost
    
    // Calculate 5% of project cost
    const fullDepositAmount = Math.floor(costNum / 20); // 5% = divide by 20
    
    // If deposit is less than full deposit, it's partial
    return depositNum < fullDepositAmount || fullDepositAmount === 0;
  }

  function shouldShowInDrawingManagerList(project) {
    const status = (project?.drawings_status || "").trim();
    if (status === "Drawings Complete") return false;
    return !isLatestRevisionWorkingDrawingsApproved(project);
  }

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      // Design pipeline by status. Exclude Home Office/Studio, Drawings Complete, and working-drawings-approved (see shouldShowInDrawingManagerList).
      const designPhaseProjects = data.filter((project) => {
        if (isHotlistStatus(project.status) || isCancelledStatus(project.status)) return false;
        if (!isDesignPhaseStatus(project.status)) return false;
        if (project.classification === "Home Office / Studio") return false;
        return true;
      });
      const visibleProjects = designPhaseProjects.filter(shouldShowInDrawingManagerList);
      setProjects(sortProjectsAlphabetically(visibleProjects));
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  /** Same filter + sort order as the on-screen lists (for Email List). */
  function getDrawingManagerListProjectsForEmail() {
    let filteredProjects =
      stateFilter !== "All"
        ? projects.filter((project) => {
            const projectState = (project.state || "").toUpperCase();
            return projectState === stateFilter.toUpperCase();
          })
        : projects;
    const grouped = groupProjectsByDrawingStatus(filteredProjects);
    if (sortColumn) {
      return DRAWING_MANAGER_STATUS_SECTIONS.flatMap((title) =>
        sortProjects(grouped[title], sortColumn, sortDirection)
      );
    }
    return DRAWING_MANAGER_STATUS_SECTIONS.flatMap((title) => grouped[title]);
  }

  function getHolderDisplayForEmailList(project) {
    const holder = project.drawings_holder || "design team";
    let displayText = "Design Team";
    if (holder === "sales team") displayText = "Sales Team";
    if (holder === "client") displayText = "Client";
    let daysText = "";
    if (project.drawings_holder_date) {
      const holderDate = new Date(project.drawings_holder_date);
      const today = new Date();
      const diffTime = Math.abs(today - holderDate);
      const daysNum = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      daysText = `${daysNum} day${daysNum !== 1 ? "s" : ""}`;
    }
    return { text: displayText, days: daysText };
  }

  /**
   * HTML table matching the Drawing Manager grid: columns, greens/reds, deposit badge, etc.
   * Many clients support tables + inline CSS; Outlook may simplify some styles.
   */
  function buildEmailListHtml(projectRows) {
    const DEPOSIT_ORANGE = INDICATOR.orange;
    const banner = getThemeBannerColors(readStoredUiThemeId(getLoggedInUserId()));
    const EMAIL_W = 960;
    const PROJECT_W = 320;
    const OTHER_W = 128;
    const ROW_H = 46;
    const BORDER = "#d0d4d8";
    const parts = [];
    parts.push(
      `<div style="width:${EMAIL_W}px;max-width:100%;margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.25;color:${MONUMENT};-webkit-text-size-adjust:100%;">`
    );
    parts.push(
      `<div style="font-weight:700;font-size:15px;line-height:1.2;margin:0 0 6px 0;">Drawing Manager Projects List</div>`
    );
    parts.push(
      `<div style="color:#666;font-size:11px;line-height:1.2;margin:0 0 10px 0;">Total: ${projectRows.length} projects</div>`
    );

    const grouped = groupProjectsByDrawingStatus(projectRows);
    const th = (label, widthPx, align = "center") =>
      `<td width="${widthPx}" style="width:${widthPx}px;min-width:${widthPx}px;max-width:${widthPx}px;border:1px solid ${BORDER};padding:5px 4px;background:${MONUMENT};color:${WHITE};font-weight:600;font-size:10px;line-height:1.2;text-align:${align};vertical-align:middle;mso-line-height-rule:exactly;white-space:nowrap;">${label}</td>`;
    const tdBase = `border:1px solid ${BORDER};height:${ROW_H}px;padding:4px 5px;vertical-align:middle;font-size:11px;line-height:1.25;mso-line-height-rule:exactly;`;

    const renderSectionTable = (sectionTitle, sectionProjects) => {
      parts.push(
        `<div style="font-weight:700;font-size:13px;line-height:1.2;margin:16px 0 8px 0;">${escapeHtmlForEmailList(sectionTitle)} (${sectionProjects.length})</div>`
      );
      if (sectionProjects.length === 0) {
        parts.push(`<div style="color:#666;font-size:11px;margin:0 0 8px 0;">No projects</div>`);
        return;
      }
      parts.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" width="${EMAIL_W}" style="width:100%;max-width:${EMAIL_W}px;border-collapse:collapse;table-layout:fixed;border:1px solid ${BORDER};background:${WHITE};margin-bottom:8px;">`
      );
      parts.push("<tr>");
      parts.push(
        `<td width="${PROJECT_W}" style="width:${PROJECT_W}px;min-width:${PROJECT_W}px;max-width:${PROJECT_W}px;border:1px solid ${BORDER};padding:5px 6px;background:${MONUMENT};color:${WHITE};font-weight:600;font-size:10px;line-height:1.2;text-align:left;vertical-align:middle;">Project</td>`
      );
      parts.push(th("Draftsperson", OTHER_W));
      parts.push(th("Drawings With", OTHER_W));
      parts.push(th("Windows", OTHER_W));
      parts.push(th("Energy", OTHER_W));
      parts.push(th("Building Permit", OTHER_W));
      parts.push("</tr>");

      sectionProjects.forEach((project) => {
        const suburb = project.suburb || "";
        const street = project.street || "";
        const projectName =
          suburb && street ? `${suburb} - ${street}` : suburb || street || "Unknown Project";
        const draftspersonName = getDraftspersonName(project.draftsperson) || "None";
        const holder = getHolderDisplayForEmailList(project);
        const needsDeposit = isPartialDeposit(project);
        const onHold = isOnHoldFlag(project);
        const windowsStatus =
          project.window_status && String(project.window_status).trim()
            ? String(project.window_status)
            : "Not Ordered";
        const energyStatus =
          project.energy_report_status && String(project.energy_report_status).trim()
            ? String(project.energy_report_status)
            : "Not Submitted";
        const buildingPermitStatus =
          project.building_permit_status && String(project.building_permit_status).trim()
            ? String(project.building_permit_status)
            : "Not Submitted";

        parts.push("<tr>");
        parts.push(
          `<td style="${tdBase}text-align:left;background:${WHITE};">` +
            `<span style="word-break:break-word;">${escapeHtmlForEmailList(projectName)}</span>` +
            (onHold
              ? `<br/><span style="display:inline-block;margin-top:2px;padding:2px 5px;background:${banner.onHold};color:${banner.onHoldText};border-radius:2px;font-size:9px;font-weight:700;line-height:1.1;">ON HOLD</span>`
              : "") +
            (needsDeposit
              ? `<br/><span style="display:inline-block;margin-top:2px;padding:2px 5px;background:${DEPOSIT_ORANGE};color:${WHITE};border-radius:2px;font-size:9px;font-weight:700;line-height:1.1;">NEEDS DEPOSIT</span>`
              : "") +
            `</td>`
        );
        parts.push(
          `<td style="${tdBase}text-align:center;background:${WHITE};word-break:break-word;">${escapeHtmlForEmailList(
            draftspersonName
          )}</td>`
        );
        const holderDaysHtml = holder.days
          ? ` <span style="color:#666;font-size:10px;">- ${escapeHtmlForEmailList(holder.days)}</span>`
          : "";
        parts.push(
          `<td style="${tdBase}text-align:center;background:${WHITE};">${escapeHtmlForEmailList(
            holder.text
          )}${holderDaysHtml}</td>`
        );
        parts.push(
          `<td style="${tdBase}text-align:center;background:${WHITE};font-size:9px;line-height:1.15;white-space:nowrap;">${escapeHtmlForEmailList(
            windowsStatus
          )}</td>`
        );
        parts.push(
          `<td style="${tdBase}text-align:center;background:${WHITE};font-size:9px;line-height:1.15;white-space:nowrap;">${escapeHtmlForEmailList(
            energyStatus
          )}</td>`
        );
        parts.push(
          `<td style="${tdBase}text-align:center;background:${WHITE};font-size:9px;line-height:1.15;white-space:nowrap;">${escapeHtmlForEmailList(
            buildingPermitStatus
          )}</td>`
        );
        parts.push("</tr>");
      });

      parts.push("</table>");
    };

    for (const sectionTitle of DRAWING_MANAGER_STATUS_SECTIONS) {
      renderSectionTable(sectionTitle, grouped[sectionTitle]);
    }

    parts.push("</div>");
    return parts.join("");
  }

  // Toggle who has the project
  async function handleToggleHolder(project) {
    if (!project.id) return;
    
    const currentHolder = project.drawings_holder || "design team";
    let newHolder;
    
    // Cycle through: design team -> sales team -> client -> design team
    if (currentHolder === "design team") {
      newHolder = "sales team";
    } else if (currentHolder === "sales team") {
      newHolder = "client";
    } else {
      newHolder = "design team";
    }

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";

    // Optimistically update local state immediately
    setProjects(prevProjects =>
      prevProjects.map(p =>
        p.id === project.id
          ? {
              ...p,
              drawings_holder: newHolder,
              drawings_holder_date: new Date().toISOString().split('T')[0], // Update date when holder changes
            }
          : p
      )
    );

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project.status || null,
          drawings_holder: newHolder,
          drawings_holder_date: new Date().toISOString().split('T')[0], // Update date when holder changes
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update drawings holder");
      }

      // Success - local state already updated, no need to refetch
      console.log("Drawings holder updated successfully");
    } catch (error) {
      console.error("Error toggling drawings holder:", error);
      alert("Failed to update who has the project");
      // Revert on error by refetching
      await fetchProjects();
    }
  }

  // Handle draftsperson change (stores display name or sentinel in `draftsperson`)
  async function handleDraftspersonChange(project, selectedValue) {
    if (!project.id) return;

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
    const newDraftsperson = normalizeDraftspersonField(selectedValue);

    // Optimistically update local state immediately
    setProjects(prevProjects =>
      prevProjects.map(p =>
        p.id === project.id
          ? {
              ...p,
              draftsperson: newDraftsperson,
            }
          : p
      )
    );

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project.status || null,
          draftsperson: newDraftsperson,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update draftsperson");
      }

      // Success - local state already updated, no need to refetch
      console.log("Draftsperson updated successfully");
    } catch (error) {
      console.error("Error updating draftsperson:", error);
      alert("Failed to update draftsperson");
      // Revert on error by refetching
      await fetchProjects();
    }
  }

  // Get main email contact for a project
  function getMainEmailContact(project) {
    // Priority: client1_email (if active) > client2_email (if active) > client3_email (if active) > email field
    if (project.client1_email && project.client1_active) {
      return project.client1_email;
    }
    if (project.client2_email && project.client2_active) {
      return project.client2_email;
    }
    if (project.client3_email && project.client3_active) {
      return project.client3_email;
    }
    // Fallback to main email field
    return project.email || "";
  }

  // Copy email to clipboard
  async function handleCopyEmail(email) {
    if (!email || !email.trim()) {
      alert("No email address to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(email.trim());
      // Optional: Show a brief confirmation (you could add a toast notification here)
    } catch (error) {
      console.error("Failed to copy email:", error);
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = email.trim();
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        alert("Failed to copy email. Please copy manually: " + email);
      }
      document.body.removeChild(textArea);
    }
  }

  // Helper function to get draftsperson first name
  function getDraftspersonFirstName(project) {
    const draftspersonName = getDraftspersonName(project.draftsperson);
    if (!draftspersonName) return "";
    const firstName = draftspersonName.split(" ")[0];
    return firstName.toLowerCase();
  }

  // Helper function to get holder display with days
  function getHolderDisplayForSort(project) {
    const holder = project.drawings_holder || "design team";
    let daysNum = 0;
    if (project.drawings_holder_date) {
      const holderDate = new Date(project.drawings_holder_date);
      const today = new Date();
      const diffTime = Math.abs(today - holderDate);
      daysNum = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }
    return { holder: holder, daysNum: daysNum };
  }

  // Sort function
  function sortProjects(projectsToSort, column, direction) {
    const sorted = [...projectsToSort];
    
    sorted.sort((a, b) => {
      let compareA, compareB;
      
      switch(column) {
        case "project":
          compareA = (a.suburb || "").toLowerCase();
          compareB = (b.suburb || "").toLowerCase();
          break;
        case "draftsperson":
          compareA = getDraftspersonFirstName(a);
          compareB = getDraftspersonFirstName(b);
          break;
        case "drawingsWith":
          const holderA = getHolderDisplayForSort(a);
          const holderB = getHolderDisplayForSort(b);
          // Sort by department first (Design=1, Client=2, Sales=3)
          const deptOrder = { "design team": 1, "client": 2, "sales team": 3 };
          const deptA = deptOrder[holderA.holder] || 0;
          const deptB = deptOrder[holderB.holder] || 0;
          if (deptA !== deptB) {
            return direction === "asc" ? (deptA - deptB) : (deptB - deptA);
          }
          // Then by days
          compareA = holderA.daysNum;
          compareB = holderB.daysNum;
          break;
        default:
          return 0;
      }
      
      if (compareA < compareB) return direction === "asc" ? -1 : 1;
      if (compareA > compareB) return direction === "asc" ? 1 : -1;
      return 0;
    });
    
    return sorted;
  }

  // Handle column header click
  function handleSort(column) {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New column, start with ascending
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function getHolderDisplay(project) {
    const holder = project.drawings_holder || "design team";
    let displayText = "Design Team";
    if (holder === "sales team") displayText = "Sales Team";
    if (holder === "client") displayText = "Client";

    let daysText = "";
    if (project.drawings_holder_date) {
      const holderDate = new Date(project.drawings_holder_date);
      const today = new Date();
      const diffTime = Math.abs(today - holderDate);
      const daysNum = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      daysText = `${daysNum} day${daysNum !== 1 ? "s" : ""}`;
    }

    return { text: displayText, days: daysText, holder };
  }

  function getGroupedProjectsForDisplay() {
    const filtered =
      stateFilter !== "All"
        ? projects.filter((project) => {
            const projectState = (project.state || "").toUpperCase();
            return projectState === stateFilter.toUpperCase();
          })
        : projects;
    const grouped = groupProjectsByDrawingStatus(filtered);
    if (!sortColumn) return grouped;
    return Object.fromEntries(
      DRAWING_MANAGER_STATUS_SECTIONS.map((title) => [
        title,
        sortProjects(grouped[title], sortColumn, sortDirection),
      ])
    );
  }

  const columnHeaderStyle = {
    padding: "8px 12px",
    background: MONUMENT,
    color: PAGE_TEXT,
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "0.85rem",
    position: "sticky",
    top: "0",
    zIndex: 10,
    userSelect: "none",
    transition: "opacity 0.2s",
  };

  function renderSortableColumnHeader(column, label, textAlign = "left") {
    return (
      <div
        onClick={() => handleSort(column)}
        style={{
          ...columnHeaderStyle,
          textAlign,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "0.8";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
      >
        {label} {sortColumn === column && (sortDirection === "asc" ? "↑" : "↓")}
      </div>
    );
  }

  function renderDrawingManagerProjectRow(project) {
    const suburb = project.suburb || "";
    const street = project.street || "";
    const projectName =
      suburb && street ? `${suburb} - ${street}` : suburb || street || "Unknown Project";
    const holderDisplay = getHolderDisplay(project);

    return (
      <React.Fragment key={project.id}>
        <Link
          to={projectPath(project)}
          style={{
            padding: "8px 12px",
            background: WHITE,
            borderRadius: "8px",
            textDecoration: "none",
            color: MONUMENT,
            fontSize: "0.85rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            transition: "box-shadow 0.2s",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {projectName}
          </span>
          {(isOnHoldFlag(project) || isPartialDeposit(project)) && (
            <span style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
              {isOnHoldFlag(project) && (
                <span
                  style={{
                    padding: "4px 8px",
                    background: BANNER.onHold,
                    color: BANNER.onHoldText,
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  ON HOLD
                </span>
              )}
              {isPartialDeposit(project) && (
                <span
                  style={{
                    padding: "4px 8px",
                    background: INDICATOR.orange,
                    color: WHITE,
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  NEEDS DEPOSIT
                </span>
              )}
            </span>
          )}
        </Link>

        <select
          value={normalizeDraftspersonField(project.draftsperson)}
          onChange={(e) => handleDraftspersonChange(project, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            padding: "8px 12px",
            background: WHITE,
            color: MONUMENT,
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
            boxSizing: "border-box",
          }}
        >
          <option value={DRAFTSPERSON_UNASSIGNED}>None</option>
          {draftspersonUsers.map((dp) => (
            <option key={dp.id} value={dp.name || ""}>
              {dp.name}
            </option>
          ))}
        </select>

        <div
          onClick={() => handleToggleHolder(project)}
          style={{
            padding: "8px 12px",
            background: WHITE,
            color: MONUMENT,
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 500,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            cursor: "pointer",
            transition: "background 0.2s",
            gap: "4px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = UI.inputBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = WHITE;
          }}
        >
          <span>{holderDisplay.text}</span>
          {holderDisplay.days && <span style={{ color: "#666" }}>- {holderDisplay.days}</span>}
        </div>

        <div
          style={{
            padding: "8px 12px",
            background: WHITE,
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
          }}
        >
          <button
            type="button"
            onClick={() => openNotesModalForProject(project)}
            style={{
              padding: "6px 12px",
              fontSize: "0.78rem",
              fontWeight: 600,
              color: MONUMENT,
              background: UI.inputBg,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
              lineHeight: 1.2,
              width: "100%",
              maxWidth: "100px",
            }}
            title="Notes for this job"
          >
            {project.drawing_manager_notes && String(project.drawing_manager_notes).trim()
              ? "Notes ✓"
              : "Notes"}
          </button>
        </div>

        <div
          style={{
            padding: "8px 12px",
            background: WHITE,
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <button
            type="button"
            onClick={() => openReminderEmailModal(project)}
            style={{
              width: "100%",
              maxWidth: "96px",
              padding: "6px 10px",
              background: "#4D93D9",
              color: PAGE_TEXT,
              border: "none",
              borderRadius: "6px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#3d7bc9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#4D93D9";
            }}
          >
            Email
          </button>
        </div>
      </React.Fragment>
    );
  }

  return (
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
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
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
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Drawing Manager
          </h1>
        </div>
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <StateFilterButtons stateFilter={stateFilter} setStateFilter={setStateFilter} />
        </div>
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
            overflowY: "auto",
          }}
        >
          {/* Menu Buttons */}
          <Link
            to="/managers/site-visit-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            Site Visit Manager
          </Link>
          <Link
            to="/managers/contract-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            Contract Manager
          </Link>
          <Link
            to="/managers/colour-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            Colour Manager
          </Link>
          <Link
            to="/managers/status-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            Status Manager
          </Link>
          <Link
            to="/managers/drawing-manager"
            style={{
              background: WHITE,
              color: MONUMENT,
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
              outline: `1px solid ${UI.outline}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            Drawing Manager
          </Link>
          <div style={{ flex: 1 }} />
          <Link
            to="/projects"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            ← Back to Main
          </Link>
        </div>

        {/* Section 3: Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {(() => {
            // Calculate filtered projects count for the header
            const filteredProjectsForCount = stateFilter !== "All" 
              ? projects.filter(project => {
                  const projectState = (project.state || "").toUpperCase();
                  return projectState === stateFilter.toUpperCase();
                })
              : projects;
            
            return (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", position: "sticky", top: "-24px", background: SECTION_GREY, zIndex: 9, paddingTop: "24px", marginTop: "-24px", paddingBottom: "8px" }}>
                <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
                  Design Phase Projects {filteredProjectsForCount.length > 0 && `(${filteredProjectsForCount.length})`}
                </h2>
                <button
                  onClick={() => {
                    setEmailListHtml(buildEmailListHtml(getDrawingManagerListProjectsForEmail()));
                    setShowEmailModal(true);
                  }}
                  style={{
                    padding: "10px 20px",
                    background: "#4D93D9",
                    color: PAGE_TEXT,
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#3d7bc9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#4D93D9";
                  }}
                >
                  Email List
                </button>
              </div>
            );
          })()}

          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: INDICATOR.red }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {(() => {
                const groupedProjects = getGroupedProjectsForDisplay();
                const totalCount = DRAWING_MANAGER_STATUS_SECTIONS.reduce(
                  (sum, title) => sum + groupedProjects[title].length,
                  0
                );

                if (totalCount === 0) {
                  return <p style={{ color: UI.textMuted }}>No Design Phase projects found.</p>;
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                    {DRAWING_MANAGER_STATUS_SECTIONS.map((sectionTitle) => {
                      const sectionProjects = groupedProjects[sectionTitle];
                      return (
                        <section key={sectionTitle}>
                          <h3
                            style={{
                              margin: "0 0 12px 0",
                              fontSize: "1rem",
                              fontWeight: 700,
                              color: MONUMENT,
                            }}
                          >
                            {sectionTitle} ({sectionProjects.length})
                          </h3>
                          {sectionProjects.length === 0 ? (
                            <p style={{ color: UI.textMuted, margin: 0, fontSize: "0.9rem" }}>
                              No projects
                            </p>
                          ) : (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "2fr 1.5fr 1fr 0.65fr 0.8fr",
                                gap: "12px",
                              }}
                            >
                              {renderSortableColumnHeader("project", "Project", "left")}
                              {renderSortableColumnHeader("draftsperson", "Draftsperson", "center")}
                              {renderSortableColumnHeader("drawingsWith", "Drawings With", "center")}
                              <div style={{ ...columnHeaderStyle, textAlign: "center" }}>Notes</div>
                              <div style={{ ...columnHeaderStyle, textAlign: "center" }}>Email</div>
                              {sectionProjects.map((project) => renderDrawingManagerProjectRow(project))}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Email List Modal */}
      {showEmailModal && (
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
              maxWidth: "900px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "20px", color: MONUMENT }}>
              Email Projects List
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
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
            </div>
            
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                Preview (960px wide — same grid as the sent email)
              </label>
              <div
                style={{
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  padding: "10px",
                  background: UI.inputBg,
                  maxHeight: "420px",
                  overflow: "auto",
                  lineHeight: 1.25,
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    width: "960px",
                    maxWidth: "100%",
                    margin: "0 auto",
                    boxSizing: "border-box",
                  }}
                  dangerouslySetInnerHTML={{ __html: emailListHtml }}
                />
              </div>
            </div>
            
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailTo("ben@superiorgrannyflats.com.au");
                  setEmailFrom("info@superiorgrannyflats.com.au");
                  setEmailSubject("Drawing Manager Projects List");
                  setEmailListHtml("");
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
                onClick={async () => {
                  const toAddresses = emailTo.split(",").map(a => a.trim()).filter(a => a.length > 0);
                  if (toAddresses.length === 0) {
                    alert("Please enter at least one email address");
                    return;
                  }
                  if (!emailFrom || !emailFrom.trim()) {
                    alert("From address is required");
                    return;
                  }

                  try {
                    await runWithEmailOverlay(async () => {
                      const res = await fetch(`${API_URL}/api/emails/send`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: toAddresses,
                          from: emailFrom,
                          subject: emailSubject,
                          htmlBody: emailListHtml,
                        }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        throw new Error(data.error || `Send failed (${res.status})`);
                      }
                      alert(data.message || "Email sent successfully!");
                    });
                    setShowEmailModal(false);
                    setEmailTo("ben@superiorgrannyflats.com.au");
                    setEmailFrom("info@superiorgrannyflats.com.au");
                    setEmailSubject("Drawing Manager Projects List");
                    setEmailListHtml("");
                  } catch (err) {
                    console.error("Send email error:", err);
                    alert(err.message || "Failed to send email.");
                  }
                }}
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
      )}

      {/* Per-job Drawing Manager notes (saved only when you click OK) */}
      {notesModalProjectId != null && (
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
          onClick={handleNotesModalCancel}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "560px",
              width: "92%",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem", color: MONUMENT, lineHeight: 1.3 }}>
                Notes — {notesModalLabel}
              </h2>
              {notesSaving && (
                <span style={{ fontSize: "0.8rem", color: SECTION_GREY, flexShrink: 0 }}>Saving…</span>
              )}
            </div>
            <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#666" }}>
              Click OK to save and close. Cancel closes without saving your edits (restores notes from when you opened this window).
            </p>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              disabled={notesSaving}
              placeholder="Notes for this job…"
              style={{
                width: "100%",
                flex: 1,
                minHeight: "220px",
                padding: "12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "0.95rem",
                color: MONUMENT,
                fontFamily: "inherit",
                lineHeight: 1.5,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
              <button
                type="button"
                onClick={handleNotesModalCancel}
                disabled={notesSaving}
                style={{
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  cursor: notesSaving ? "not-allowed" : "pointer",
                  opacity: notesSaving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNotesModalOk}
                disabled={notesSaving}
                style={{
                  padding: "10px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: notesSaving ? "not-allowed" : "pointer",
                  opacity: notesSaving ? 0.85 : 1,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {showReminderModal && (
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
              maxWidth: "760px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
              Drawings Reminder Email
              {selectedProjectForReminder
                ? ` — ${(selectedProjectForReminder.suburb && selectedProjectForReminder.street)
                    ? `${selectedProjectForReminder.suburb} - ${selectedProjectForReminder.street}`
                    : selectedProjectForReminder.name || `Project #${selectedProjectForReminder.id}`}`
                : ""}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "18px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={reminderEmailTo}
                  onChange={(e) => setReminderEmailTo(e.target.value)}
                  disabled={reminderSending}
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
                  value={reminderEmailFrom}
                  onChange={(e) => setReminderEmailFrom(e.target.value)}
                  disabled={reminderSending}
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
                  value={reminderEmailSubject}
                  onChange={(e) => setReminderEmailSubject(e.target.value)}
                  disabled={reminderSending}
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
                <textarea
                  value={reminderEmailBody}
                  onChange={(e) => setReminderEmailBody(e.target.value)}
                  disabled={reminderSending}
                  style={{
                    width: "100%",
                    minHeight: "240px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.95rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    lineHeight: 1.5,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                onClick={closeReminderModal}
                disabled={reminderSending}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  cursor: reminderSending ? "not-allowed" : "pointer",
                  opacity: reminderSending ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                disabled={reminderSending}
                onClick={async () => {
                  if (!selectedProjectForReminder?.id) {
                    alert("Project is missing.");
                    return;
                  }
                  const toAddresses = reminderEmailTo
                    .split(",")
                    .map((a) => a.trim())
                    .filter((a) => a.length > 0);
                  if (toAddresses.length === 0) {
                    alert("Please enter at least one email address.");
                    return;
                  }
                  if (!reminderEmailFrom || !reminderEmailFrom.trim()) {
                    alert("From address is required.");
                    return;
                  }

                  try {
                    setReminderSending(true);
                    await runWithEmailOverlay(async () => {
                      const res = await fetch(`${API_URL}/api/emails/send-drawings`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          ...emailLinkBaseForApiBody(),
                          projectId: selectedProjectForReminder.id,
                          toEmails: toAddresses,
                          from: reminderEmailFrom.trim(),
                          subject: reminderEmailSubject || "",
                          customBody: reminderEmailBody || "",
                          attachDrawings: true,
                        }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        throw new Error(data.error || "Failed to send reminder email");
                      }

                      // Reset "days with holder" counter after sending reminder:
                      // keep same holder, but set holder date to today.
                      const todayStr = new Date().toISOString().split("T")[0];
                      try {
                        const holderProjectName =
                          selectedProjectForReminder?.name ||
                          `${selectedProjectForReminder?.street || ""}, ${selectedProjectForReminder?.suburb || ""}`.trim() ||
                          "";
                        const holderRes = await fetch(`${API_URL}/api/projects/${selectedProjectForReminder.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: holderProjectName,
                            status: selectedProjectForReminder?.status || null,
                            drawings_holder: selectedProjectForReminder?.drawings_holder || "design team",
                            drawings_holder_date: todayStr,
                          }),
                        });
                        if (holderRes.ok) {
                          setProjects((prev) =>
                            prev.map((p) =>
                              p.id === selectedProjectForReminder.id
                                ? { ...p, drawings_holder_date: todayStr }
                                : p
                            )
                          );
                        } else {
                          console.warn("Reminder email sent, but failed to reset holder days counter.");
                        }
                      } catch (holderErr) {
                        console.warn("Reminder email sent, but error resetting holder days:", holderErr);
                      }

                      alert(data.message || "Reminder email sent successfully!");
                    });
                    closeReminderModal();
                  } catch (err) {
                    console.error("Error sending reminder email:", err);
                    alert(err.message || "Failed to send reminder email.");
                  } finally {
                    setReminderSending(false);
                  }
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: reminderSending ? "not-allowed" : "pointer",
                  opacity: reminderSending ? 0.85 : 1,
                }}
              >
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
