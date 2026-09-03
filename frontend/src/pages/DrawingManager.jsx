import React, { useState, useEffect, useRef } from "react";
import {
  DESIGN_PHASE,
  isDesignPhaseStatus,
  isDesignPipelineStatus,
  isExcludedFromProjectLists,
  isCancelledStatus,
  isCompleteStatus,
  isConstructionPhaseStatus,
  isOnHoldFlag,
  isPermitPhaseStatus,
  isPreEngagementPhaseStatus,
} from "../utils/projectStatus";
import { Link } from "react-router-dom";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { getStateFilter } from "../utils/stateFilter";
import { projectPath } from "../utils/projectUrl";
import {
  getProjectClientEmailsForDrawings,
  getStreamExtraDrawingEmails,
  isStreamSendDrawingsToClientsEnabled,
  mergeUniqueEmails,
  stripProjectClientEmailsWhenDisabled,
} from "../utils/streamDrawingsSettings";
import {
  resolveSalespersonToClientFrom,
  resolveSalespersonToClientToEmails,
} from "../utils/drawingNotifyFrom";
import {
  DRAFTSPERSON_UNASSIGNED,
  normalizeDraftspersonField,
  isDraftspersonAssigned,
} from "../utils/draftspersonSentinel";
import { getUserPrimaryPositionName } from "../utils/userPosition";
import { resolveLoggedInUserEmailTokens } from "../utils/emailUserTokens";
import { emailLinkBaseForApiBody } from "../utils/emailLinkBaseForApi";
import { isLatestRevisionWorkingDrawingsApproved } from "../utils/drawingsStatusRules";
import { normalizeBodyHtmlForEditor } from "../components/EmailBodyEditor.jsx";
import useAppLogo from "../hooks/useAppLogo.js";
import { useManagersAccess } from "../hooks/useManagersAccess";

import StateFilterButtons from "../components/StateFilterButtons";
import { UI, BANNER, INDICATOR, STREAM, MENU, outlineBorder } from "../utils/uiThemeTokens.js";
import { getApiHeaders, isUserAdmin } from "../utils/auth";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const DRAWING_MANAGER_STATUS_SECTIONS = [
  "Pre-Engagement",
  "Concept Stage",
  "Working Drawing Stage",
  "Permit Phase",
];

/** Short tab labels for the section switcher. */
const DRAWING_MANAGER_TAB_LABELS = {
  "Pre-Engagement": "Pre-Engagement",
  "Concept Stage": "Concept",
  "Working Drawing Stage": "WD",
  "Permit Phase": "Permit",
};

/** Equal-width tab fills: VIC blue light, QLD red light, menu purple light, stream green. */
const DRAWING_MANAGER_TAB_COLORS = {
  "Pre-Engagement": { fill: STREAM.vicBlueLight, border: STREAM.vicBlue },
  "Concept Stage": { fill: STREAM.qldRedLight, border: STREAM.qldRed },
  "Working Drawing Stage": { fill: MENU.purpleLight, border: MENU.purple },
  "Permit Phase": { fill: STREAM.streamGreen, border: STREAM.streamGreen },
};

const DRAFTING_STATS_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** Month from projects.year (YYYY-MM-DD / ISO / slash date). Year-only values have no month. */
function parseProjectStartYearMonth(yearValue) {
  if (yearValue == null || yearValue === "") return null;
  const raw = String(yearValue).trim();
  if (!raw) return null;
  if (/^\d{4}$/.test(raw)) {
    return { year: parseInt(raw, 10), monthIndex: null };
  }
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    if (month >= 1 && month <= 12) return { year, monthIndex: month - 1 };
    return { year, monthIndex: null };
  }
  if (raw.includes("/")) {
    const parts = raw.split("/").map((p) => p.trim());
    if (parts.length === 3 && /^\d{4}$/.test(parts[2])) {
      const n0 = parseInt(parts[0], 10);
      const n1 = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      const month = n0 > 12 ? n1 : n0;
      if (Number.isFinite(year) && month >= 1 && month <= 12) {
        return { year, monthIndex: month - 1 };
      }
    }
  }
  return null;
}

function buildDraftingStatsGroups(projects, { year, getName, monthCount = 12 }) {
  const visibleMonths = Math.min(12, Math.max(0, monthCount));
  const counts = new Map();
  for (const project of projects) {
    if (isExcludedFromProjectLists(project?.status)) continue;
    if (isCancelledStatus(project?.status)) continue;
    if (project?.classification === "Home Office / Studio") continue;
    if (!isDraftspersonAssigned(project?.draftsperson)) continue;
    const parsed = parseProjectStartYearMonth(project.year);
    if (!parsed || parsed.year !== year || parsed.monthIndex == null) continue;
    if (parsed.monthIndex >= visibleMonths) continue;
    const name = getName(project.draftsperson);
    if (!name) continue;
    if (!counts.has(name)) counts.set(name, Array(visibleMonths).fill(0));
    counts.get(name)[parsed.monthIndex] += 1;
  }

  return [...counts.keys()]
    .map((name) => {
      const months = counts.get(name);
      const total = months.reduce((sum, n) => sum + n, 0);
      return { name, months, total };
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => {
      const denom = visibleMonths || 1;
      const avgA = a.total / denom;
      const avgB = b.total / denom;
      if (avgB !== avgA) return avgB - avgA;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function draftingStatsTotals(groups, monthCount = 12) {
  const monthTotals = Array(monthCount).fill(0);
  for (const group of groups) {
    for (let i = 0; i < monthCount; i += 1) {
      monthTotals[i] += group.months[i] || 0;
    }
  }
  const grandTotal = monthTotals.reduce((sum, n) => sum + n, 0);
  return { monthTotals, grandTotal };
}

function filterDraftingStatsBySelectedMonths(groups, selectedMonths) {
  const includedIndexes = (selectedMonths || [])
    .map((on, index) => (on ? index : -1))
    .filter((index) => index >= 0);
  const monthCount = includedIndexes.length;
  const viewed = groups
    .map((group) => {
      const months = includedIndexes.map((index) => group.months[index] || 0);
      const total = months.reduce((sum, n) => sum + n, 0);
      return { name: group.name, months, total };
    })
    .filter((group) => group.total > 0)
    .sort((a, b) => {
      const denom = monthCount || 1;
      const avgDiff = b.total / denom - a.total / denom;
      if (avgDiff !== 0) return avgDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  const { monthTotals, grandTotal } = draftingStatsTotals(viewed, monthCount);
  return { viewed, includedIndexes, monthCount, monthTotals, grandTotal };
}

function formatDraftingStatsAverage(total, monthCount) {
  if (!monthCount) return "0.0";
  return (Math.round((total / monthCount) * 10) / 10).toFixed(1);
}

function draftingStatsPrintExact() {
  return {
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  };
}

function draftingStatsMaxMonthCount(groups) {
  let max = 0;
  for (const group of groups) {
    for (const n of group.months || []) {
      if (n > max) max = n;
    }
  }
  return max;
}

/** Green heat for higher counts so fills read in screen and print. */
function draftingStatsHeatFill(count, maxCount) {
  const printExact = draftingStatsPrintExact();
  const text = "#323233";
  if (!count || maxCount <= 0) {
    return { background: "#d98a8a", color: text, ...printExact };
  }
  const t = Math.min(1, count / maxCount);
  let background;
  if (t < 0.34) {
    background = "#e0a15c";
  } else if (t < 0.67) {
    background = "#dcc65a";
  } else {
    background = "#7cb87f";
  }
  return { background, color: text, ...printExact };
}

function draftingStatsPrintThemeCss() {
  const cs = getComputedStyle(document.documentElement);
  const parts = [];
  for (let i = 0; i < cs.length; i += 1) {
    const name = cs.item(i);
    if (name.startsWith("--")) {
      parts.push(`${name}:${cs.getPropertyValue(name)};`);
    }
  }
  return `:root{${parts.join("")}}
html,body,table,th,td{
  -webkit-print-color-adjust:exact!important;
  print-color-adjust:exact!important;
  color-adjust:exact!important;
}`;
}

function shouldCountHolderDays(project) {
  if (!project?.drawings_holder_date) return false;
  // Stop counting once the job is in Construction Phase.
  return !isConstructionPhaseStatus(project?.status);
}

function getHolderDaysNum(project) {
  if (!shouldCountHolderDays(project)) return 0;
  const holderDate = new Date(project.drawings_holder_date);
  if (Number.isNaN(holderDate.getTime())) return 0;
  const today = new Date();
  const diffTime = Math.abs(today - holderDate);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/** Highest holder-days first; suburb/street as tiebreaker. */
function sortProjectsByDaysDescending(projectsList) {
  return [...projectsList].sort((a, b) => {
    const daysDiff = getHolderDaysNum(b) - getHolderDaysNum(a);
    if (daysDiff !== 0) return daysDiff;
    const suburbA = (a.suburb || "").toLowerCase();
    const suburbB = (b.suburb || "").toLowerCase();
    if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
    return (a.street || "").toLowerCase().localeCompare((b.street || "").toLowerCase());
  });
}

/**
 * Tab membership:
 * Pre-Engagement — project status is Pre-Engagement Phase
 * Concept — Design Phase and drawings status Concept Stage
 * WD — Design Phase and drawings status Working Drawing Stage
 * Permit — project status is Permit Phase
 * Design Phase with neither Concept nor WD stays on Pre-Engagement (Not Assigned).
 */
function getDrawingManagerStatusBucket(project) {
  if (isPermitPhaseStatus(project?.status)) return "Permit Phase";
  if (isPreEngagementPhaseStatus(project?.status)) return "Pre-Engagement";
  if (isDesignPhaseStatus(project?.status)) {
    const drawingsStatus = (project?.drawings_status || "").trim();
    if (drawingsStatus === "Concept Stage") return "Concept Stage";
    if (drawingsStatus === "Working Drawing Stage") return "Working Drawing Stage";
  }
  return "Pre-Engagement";
}

function groupProjectsByDrawingStatus(projectsList) {
  const groups = Object.fromEntries(
    DRAWING_MANAGER_STATUS_SECTIONS.map((title) => [title, []])
  );
  for (const project of projectsList) {
    groups[getDrawingManagerStatusBucket(project)].push(project);
  }
  for (const title of DRAWING_MANAGER_STATUS_SECTIONS) {
    groups[title] = sortProjectsByDaysDescending(groups[title]);
  }
  return groups;
}

export default function DrawingManager() {
  const logo = useAppLogo();
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const { hasManagers } = useManagersAccess();
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [activeSectionTab, setActiveSectionTab] = useState(DRAWING_MANAGER_STATUS_SECTIONS[0]);
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
  const [notesModalProjectId, setNotesModalProjectId] = useState(null);
  const [notesModalLabel, setNotesModalLabel] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  /** Snapshot when the modal opened — Cancel restores this (nothing is saved until OK). */
  const notesSnapshotRef = useRef("");
  const reminderBodyRef = useRef(null);
  const reminderSendToClientsEnabledRef = useRef(true);
  const [showDraftingStatsModal, setShowDraftingStatsModal] = useState(false);
  const [draftingStatsLoading, setDraftingStatsLoading] = useState(false);
  const [draftingStatsError, setDraftingStatsError] = useState(null);
  const [draftingStatsGroups, setDraftingStatsGroups] = useState([]);
  const [draftingStatsYear, setDraftingStatsYear] = useState(() => new Date().getFullYear());
  const [draftingStatsMonthCount, setDraftingStatsMonthCount] = useState(() => new Date().getMonth() + 1);
  const [draftingStatsSelectedMonths, setDraftingStatsSelectedMonths] = useState(() =>
    Array(new Date().getMonth() + 1).fill(true)
  );

  useEffect(() => {
    fetchProjects();
    fetchDraftspersons();
    isUserAdmin().then(setIsAdmin).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (showReminderModal && reminderBodyRef.current && reminderEmailBody) {
      if (reminderBodyRef.current.innerHTML !== reminderEmailBody) {
        reminderBodyRef.current.innerHTML = reminderEmailBody;
      }
    }
  }, [showReminderModal, reminderEmailBody]);

  const managerNavLinkStyle = {
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
  };

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
      const [templateResponse, settingsResponse] = await Promise.all([
        fetch(`${API_URL}/api/email-templates`),
        fetch(`${API_URL}/api/settings`),
      ]);
      if (!templateResponse.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const templates = await templateResponse.json();
      const settings = settingsResponse.ok ? await settingsResponse.json() : {};
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

      const userTokens = await resolveLoggedInUserEmailTokens();
      const streamSettingsJson = settings?.stream_settings_json || {};
      const sendToClients = isStreamSendDrawingsToClientsEnabled(
        project?.stream,
        streamSettingsJson,
        project
      );
      reminderSendToClientsEnabledRef.current = sendToClients;
      const clientTo = sendToClients ? getProjectClientEmailsForDrawings(project) : [];
      const extraTo = getStreamExtraDrawingEmails(project?.stream, streamSettingsJson, project);
      const fromEmail = resolveSalespersonToClientFrom(settings, project, "");
      const toEmails = resolveSalespersonToClientToEmails(
        settings,
        project,
        [],
        mergeUniqueEmails(clientTo, extraTo)
      );

      if (!fromEmail || !String(fromEmail).trim()) {
        alert(
          "No sender email in Stream Settings for this stream (Send Drawings to Client — From [DESIGN] / [PERMIT]). Configure Settings → Email Settings → By Stream."
        );
        return;
      }
      if (!toEmails.length) {
        alert(
          "No recipient addresses for this send. Add stream extra emails in Settings → Email Settings → By Stream, enable Send to Clients, and/or add active client emails on the project."
        );
        return;
      }

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
        Stream: String(project?.stream || "").trim(),
        stream: String(project?.stream || "").trim(),
        UserName: userTokens.UserName,
        username: userTokens.UserName,
        UserPosition: userTokens.UserPosition,
        userposition: userTokens.UserPosition,
        UserEmail: userTokens.UserEmail,
        useremail: userTokens.UserEmail,
      };

      setSelectedProjectForReminder(project);
      setReminderEmailTo(toEmails.join(", "));
      setReminderEmailFrom(fromEmail);
      setReminderEmailSubject(applyTemplateTokens(template.subject || "", tokenMap));
      setReminderEmailBody(normalizeBodyHtmlForEditor(applyTemplateTokens(template.body || "", tokenMap)));
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

  async function openDraftingStats() {
    if (!isAdmin) return;
    const year = new Date().getFullYear();
    const monthCount = new Date().getMonth() + 1;
    setDraftingStatsYear(year);
    setDraftingStatsMonthCount(monthCount);
    setDraftingStatsSelectedMonths(Array(monthCount).fill(true));
    setShowDraftingStatsModal(true);
    setDraftingStatsLoading(true);
    setDraftingStatsError(null);
    try {
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setDraftingStatsGroups(
        buildDraftingStatsGroups(list, {
          year,
          monthCount,
          getName: (raw) => getDraftspersonName(raw),
        })
      );
    } catch (err) {
      setDraftingStatsError(err.message || "Failed to load drafting stats");
      setDraftingStatsGroups([]);
    } finally {
      setDraftingStatsLoading(false);
    }
  }

  function printDraftingStats() {
    const area = document.getElementById("drafting-stats-print-area");
    if (!area) return;
    const printWindow = window.open("", "drafting-stats-print");
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Drafting Stats ${draftingStatsYear}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color: #323233; margin: 16px; }
      h2 { font-size: 20px; margin: 0 0 6px 0; }
      p { font-size: 12px; margin: 0 0 12px 0; color: #666; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      .drafting-stats-month-toggles { display: none !important; }
      @page { size: landscape; margin: 10mm; }
      ${draftingStatsPrintThemeCss()}
    </style>
  </head>
  <body>${area.innerHTML}</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
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
    // Permit Phase stays on the Permit tab after WD approval / Drawings Complete.
    if (isPermitPhaseStatus(project?.status)) return true;
    const status = (project?.drawings_status || "").trim();
    if (status === "Drawings Complete") return false;
    return !isLatestRevisionWorkingDrawingsApproved(project);
  }

  /** Drawing Manager: Pre-Engagement / Design / Permit — never construction / complete / cancelled / hotlist. */
  function isDrawingManagerEligibleProject(project) {
    if (isExcludedFromProjectLists(project?.status)) return false;
    if (isCancelledStatus(project?.status)) return false;
    if (isCompleteStatus(project?.status)) return false;
    if (isConstructionPhaseStatus(project?.status)) return false;
    if (!isDesignPipelineStatus(project?.status)) return false;
    if (project?.classification === "Home Office / Studio") return false;
    return shouldShowInDrawingManagerList(project);
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
      const visibleProjects = (Array.isArray(data) ? data : []).filter(
        isDrawingManagerEligibleProject
      );
      setProjects(visibleProjects);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
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
        headers: getApiHeaders(),
        credentials: "include",
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
    const nextStatus =
      isDraftspersonAssigned(newDraftsperson) && isPreEngagementPhaseStatus(project.status)
        ? DESIGN_PHASE
        : project.status || null;

    // Optimistically update local state immediately
    setProjects(prevProjects =>
      prevProjects.map(p =>
        p.id === project.id
          ? {
              ...p,
              draftsperson: newDraftsperson,
              ...(nextStatus ? { status: nextStatus } : {}),
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
          status: nextStatus,
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
    return { holder: holder, daysNum: getHolderDaysNum(project) };
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
    if (shouldCountHolderDays(project)) {
      const daysNum = getHolderDaysNum(project);
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

  /** Width for draftsperson / drawings-with columns from longest visible text. */
  function fitColumnWidthFromLabels(labels, { paddingPx = 28, extraCh = 2 } = {}) {
    const maxLen = Math.max(
      1,
      ...labels.map((label) => String(label || "").length)
    );
    return `calc(${maxLen + extraCh}ch + ${paddingPx}px)`;
  }

  function getDraftspersonDrawingsWithColumnWidths(projectsList) {
    const draftspersonLabels = [
      "Draftsperson ↑",
      "None",
      ...draftspersonUsers.map((dp) => dp.name || ""),
      ...projectsList.map((p) => getDraftspersonName(p.draftsperson) || "None"),
    ];
    const drawingsWithLabels = [
      "Drawings With ↑",
      ...projectsList.map((p) => {
        const holder = getHolderDisplay(p);
        return holder.days ? `${holder.text} - ${holder.days}` : holder.text;
      }),
    ];
    return {
      draftsperson: fitColumnWidthFromLabels(draftspersonLabels, { paddingPx: 36, extraCh: 2 }),
      drawingsWith: fitColumnWidthFromLabels(drawingsWithLabels, { paddingPx: 28, extraCh: 1 }),
    };
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
            width: "100%",
            minWidth: 0,
            whiteSpace: "nowrap",
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
            width: "100%",
            boxSizing: "border-box",
            whiteSpace: "nowrap",
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
              maxWidth: "120px",
              padding: "6px 10px",
              background: "#4D93D9",
              color: PAGE_TEXT,
              border: "none",
              borderRadius: "6px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#3d7bc9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#4D93D9";
            }}
          >
            Email Client
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
          {/* Other Managers pages — Managers permission only */}
          {hasManagers ? (
            <>
              <Link to="/managers/site-visit-manager" style={managerNavLinkStyle}>
                Site Visit Manager
              </Link>
              <Link to="/managers/contract-manager" style={managerNavLinkStyle}>
                Contract Manager
              </Link>
              <Link to="/managers/colour-manager" style={managerNavLinkStyle}>
                Colour Manager
              </Link>
              <Link to="/managers/status-manager" style={managerNavLinkStyle}>
                Status Manager
              </Link>
              {isAdmin ? (
                <>
                  <Link to="/managers/next-outs" style={managerNavLinkStyle}>
                    Next Outs
                  </Link>
                  <Link to="/managers/planning-manager" style={managerNavLinkStyle}>
                    Planning Manager
                  </Link>
                </>
              ) : null}
            </>
          ) : null}
          <Link
            to="/managers/drawing-manager"
            style={{
              ...managerNavLinkStyle,
              background: WHITE,
              color: MONUMENT,
              outline: `1px solid ${UI.outline}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
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
            const groupedProjects = getGroupedProjectsForDisplay();
            const activeSection =
              DRAWING_MANAGER_STATUS_SECTIONS.includes(activeSectionTab)
                ? activeSectionTab
                : DRAWING_MANAGER_STATUS_SECTIONS[0];
            const activeProjects = groupedProjects[activeSection] || [];
            const activeLabel = DRAWING_MANAGER_TAB_LABELS[activeSection] || activeSection;

            return (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                    marginBottom: "12px",
                    position: "sticky",
                    top: "-24px",
                    background: SECTION_GREY,
                    zIndex: 9,
                    paddingTop: "24px",
                    marginTop: "-24px",
                    paddingBottom: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
                    {activeLabel} {`(${activeProjects.length})`}
                  </h2>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        void openDraftingStats();
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
                      Drafting Stats
                    </button>
                    ) : null}
                  </div>
                </div>

                <div
                  role="tablist"
                  aria-label="Drawing stage"
                  style={{
                    display: "inline-grid",
                    gridAutoFlow: "column",
                    gridAutoColumns: "1fr",
                    gap: "8px",
                    marginBottom: "16px",
                    position: "sticky",
                    top: "36px",
                    background: SECTION_GREY,
                    zIndex: 8,
                    paddingBottom: "8px",
                    width: "max-content",
                    maxWidth: "100%",
                  }}
                >
                  {DRAWING_MANAGER_STATUS_SECTIONS.map((sectionTitle) => {
                    const selected = sectionTitle === activeSection;
                    const count = (groupedProjects[sectionTitle] || []).length;
                    const label = DRAWING_MANAGER_TAB_LABELS[sectionTitle] || sectionTitle;
                    const colors = DRAWING_MANAGER_TAB_COLORS[sectionTitle] || {
                      fill: WHITE,
                      border: UI.outline,
                    };
                    return (
                      <button
                        key={sectionTitle}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setActiveSectionTab(sectionTitle)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: selected
                            ? `2px solid ${colors.border}`
                            : outlineBorder,
                          background: colors.fill,
                          color: MONUMENT,
                          fontSize: "0.9rem",
                          fontWeight: selected ? 700 : 500,
                          cursor: "pointer",
                          lineHeight: 1.2,
                          textAlign: "center",
                          width: "100%",
                          boxSizing: "border-box",
                          whiteSpace: "nowrap",
                          opacity: selected ? 1 : 0.85,
                        }}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>

                {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
                {error && (
                  <p style={{ color: INDICATOR.red }}>
                    Error: {error}
                  </p>
                )}
                {!loading && !error && (() => {
                  if (
                    DRAWING_MANAGER_STATUS_SECTIONS.every(
                      (title) => (groupedProjects[title] || []).length === 0
                    )
                  ) {
                    return <p style={{ color: UI.textMuted }}>No projects found.</p>;
                  }

                  const { draftsperson: draftspersonColWidth, drawingsWith: drawingsWithColWidth } =
                    getDraftspersonDrawingsWithColumnWidths(activeProjects);
                  const gridTemplateColumns = `minmax(0, 1fr) ${draftspersonColWidth} ${drawingsWithColWidth} max-content max-content`;

                  if (activeProjects.length === 0) {
                    return (
                      <p style={{ color: UI.textMuted, margin: 0, fontSize: "0.9rem" }}>
                        No projects in {activeLabel}.
                      </p>
                    );
                  }

                  return (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns,
                        gap: "12px",
                      }}
                    >
                      {renderSortableColumnHeader("project", "Project", "left")}
                      {renderSortableColumnHeader("draftsperson", "Draftsperson", "center")}
                      {renderSortableColumnHeader("drawingsWith", "Drawings With", "center")}
                      <div style={{ ...columnHeaderStyle, textAlign: "center" }}>Notes</div>
                      <div style={{ ...columnHeaderStyle, textAlign: "center" }}>Email</div>
                      {activeProjects.map((project) => renderDrawingManagerProjectRow(project))}
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </div>
      </div>

      {isAdmin && showDraftingStatsModal ? (
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
          onClick={() => setShowDraftingStatsModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="drafting-stats-title"
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "1100px",
              width: "95%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div id="drafting-stats-print-area">
            <h2
              id="drafting-stats-title"
              style={{ marginTop: 0, marginBottom: "8px", color: MONUMENT }}
            >
              Drafting Stats
            </h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: UI.textMuted }}>
              Assigned projects in {draftingStatsYear} (VIC and QLD)
            </p>
            <div
              className="drafting-stats-month-toggles"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px 14px",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              {DRAFTING_STATS_MONTHS.slice(0, draftingStatsMonthCount).map((month, index) => (
                <label
                  key={month}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: MONUMENT,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(draftingStatsSelectedMonths[index])}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setDraftingStatsSelectedMonths((prev) => {
                        const next = Array.from({ length: draftingStatsMonthCount }, (_, i) =>
                          Boolean(prev[i])
                        );
                        next[index] = checked;
                        return next;
                      });
                    }}
                  />
                  {month}
                </label>
              ))}
            </div>
            {draftingStatsLoading ? (
              <div style={{ fontSize: "0.95rem", color: MONUMENT }}>Loading…</div>
            ) : draftingStatsError ? (
              <div style={{ color: "#cc3333", fontSize: "0.95rem" }}>{draftingStatsError}</div>
            ) : draftingStatsGroups.length === 0 ? (
              <div style={{ fontSize: "0.95rem", color: UI.textMuted }}>
                No assigned projects for this year.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                {(() => {
                  const {
                    viewed,
                    includedIndexes,
                    monthCount: selectedMonthCount,
                    monthTotals,
                    grandTotal,
                  } = filterDraftingStatsBySelectedMonths(
                    draftingStatsGroups,
                    draftingStatsSelectedMonths
                  );
                  const visibleMonths = includedIndexes.map(
                    (index) => DRAFTING_STATS_MONTHS[index]
                  );
                  if (!selectedMonthCount) {
                    return (
                      <div style={{ fontSize: "0.95rem", color: UI.textMuted }}>
                        Select at least one month.
                      </div>
                    );
                  }
                  if (!viewed.length) {
                    return (
                      <div style={{ fontSize: "0.95rem", color: UI.textMuted }}>
                        No assigned projects in the selected months.
                      </div>
                    );
                  }
                  const maxMonthCount = draftingStatsMaxMonthCount(viewed);
                  const maxRowTotal = Math.max(0, ...viewed.map((g) => g.total));
                  const maxMonthTotal = Math.max(0, ...monthTotals);
                  const printExact = draftingStatsPrintExact();
                  const headerFill = { background: "#d9dde3", color: "#323233", ...printExact };
                  const nameFill = { background: "#ffffff", color: "#323233", ...printExact };
                  const spacerCell = {
                    width: "16px",
                    minWidth: "16px",
                    padding: 0,
                    border: "none",
                    background: "#ffffff",
                    ...printExact,
                  };
                  const totalCellBase = {
                    textAlign: "center",
                    padding: "8px 6px",
                    border: "1px solid #c5c9ce",
                    fontWeight: 700,
                    ...printExact,
                  };
                  return (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                    color: "#323233",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "1px solid #c5c9ce",
                          position: "sticky",
                          left: 0,
                          zIndex: 1,
                          whiteSpace: "nowrap",
                          ...headerFill,
                        }}
                      >
                        Draftsperson
                      </th>
                      {visibleMonths.map((month) => (
                        <th
                          key={month}
                          style={{
                            textAlign: "center",
                            padding: "8px 6px",
                            border: "1px solid #c5c9ce",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            ...headerFill,
                          }}
                        >
                          {month}
                        </th>
                      ))}
                      <th
                        style={{
                          textAlign: "center",
                          padding: "8px 8px",
                          border: "1px solid #c5c9ce",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          ...headerFill,
                        }}
                      >
                        Total
                      </th>
                      <th aria-hidden="true" style={spacerCell} />
                      <th
                        style={{
                          textAlign: "center",
                          padding: "8px 8px",
                          border: "1px solid #c5c9ce",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          ...headerFill,
                        }}
                      >
                        Avg
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewed.map((group) => {
                      const avgValue = selectedMonthCount
                        ? group.total / selectedMonthCount
                        : 0;
                      const maxAvg = selectedMonthCount
                        ? maxRowTotal / selectedMonthCount
                        : 0;
                      return (
                      <tr key={group.name}>
                        <td
                          style={{
                            textAlign: "left",
                            padding: "8px 10px",
                            border: "1px solid #c5c9ce",
                            position: "sticky",
                            left: 0,
                            whiteSpace: "nowrap",
                            fontWeight: 600,
                            ...nameFill,
                          }}
                        >
                          {group.name}
                        </td>
                        {group.months.map((count, monthIndex) => {
                          const heat = draftingStatsHeatFill(count, maxMonthCount);
                          return (
                          <td
                            key={visibleMonths[monthIndex]}
                            style={{
                              textAlign: "center",
                              padding: "8px 6px",
                              border: "1px solid #c5c9ce",
                              fontWeight: count ? 700 : 400,
                              ...heat,
                            }}
                          >
                            {count}
                          </td>
                          );
                        })}
                        <td
                          style={{
                            ...totalCellBase,
                            ...draftingStatsHeatFill(group.total, maxRowTotal),
                          }}
                        >
                          {group.total}
                        </td>
                        <td aria-hidden="true" style={spacerCell} />
                        <td
                          style={{
                            ...totalCellBase,
                            ...draftingStatsHeatFill(avgValue, maxAvg),
                          }}
                        >
                          {formatDraftingStatsAverage(group.total, selectedMonthCount)}
                        </td>
                      </tr>
                      );
                    })}
                    <tr>
                      <td
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "1px solid #c5c9ce",
                          position: "sticky",
                          left: 0,
                          whiteSpace: "nowrap",
                          fontWeight: 700,
                          ...headerFill,
                        }}
                      >
                        Total
                      </td>
                      {monthTotals.map((count, monthIndex) => (
                        <td
                          key={`total-${visibleMonths[monthIndex]}`}
                          style={{
                            ...totalCellBase,
                            ...draftingStatsHeatFill(count, maxMonthTotal),
                          }}
                        >
                          {count}
                        </td>
                      ))}
                      <td
                        style={{
                          ...totalCellBase,
                          ...draftingStatsHeatFill(grandTotal, grandTotal),
                        }}
                      >
                        {grandTotal}
                      </td>
                      <td aria-hidden="true" style={spacerCell} />
                      <td
                        style={{
                          ...totalCellBase,
                          ...draftingStatsHeatFill(grandTotal, grandTotal),
                        }}
                      >
                        {formatDraftingStatsAverage(grandTotal, selectedMonthCount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                  );
                })()}
              </div>
            )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
              <button
                type="button"
                onClick={printDraftingStats}
                disabled={
                  draftingStatsLoading ||
                  draftingStatsGroups.length === 0 ||
                  !draftingStatsSelectedMonths.some(Boolean)
                }
                style={{
                  padding: "10px 20px",
                  background: "#4D93D9",
                  color: PAGE_TEXT,
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor:
                    draftingStatsLoading ||
                    draftingStatsGroups.length === 0 ||
                    !draftingStatsSelectedMonths.some(Boolean)
                      ? "default"
                      : "pointer",
                  opacity:
                    draftingStatsLoading ||
                    draftingStatsGroups.length === 0 ||
                    !draftingStatsSelectedMonths.some(Boolean)
                      ? 0.6
                      : 1,
                }}
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setShowDraftingStatsModal(false)}
                style={{
                  padding: "10px 20px",
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                <div
                  ref={reminderBodyRef}
                  contentEditable={!reminderSending}
                  onInput={(e) => setReminderEmailBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setReminderEmailBody(e.currentTarget.innerHTML)}
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
                    outline: "none",
                    fontFamily: "inherit",
                    opacity: reminderSending ? 0.7 : 1,
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
                  const toAddresses = stripProjectClientEmailsWhenDisabled(
                    reminderEmailTo
                      .split(",")
                      .map((a) => a.trim())
                      .filter((a) => a.length > 0),
                    selectedProjectForReminder,
                    reminderSendToClientsEnabledRef.current
                  );
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
                        headers: { "Content-Type": "application/json", ...getApiHeaders() },
                        credentials: "include",
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
