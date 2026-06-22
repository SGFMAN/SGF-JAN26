import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { DayPicker } from "react-day-picker";
import { enAU } from "date-fns/locale";
import "react-day-picker/style.css";
import { isUserAdmin } from "../utils/auth";
import { getUserPrimaryPositionName } from "../utils/userPosition";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import useAppLogo from "../hooks/useAppLogo.js";

import { UI, BANNER } from "../utils/uiThemeTokens.js";
import { OnHoldSash, CancelledSash } from "../components/ProjectStatusSash";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const HOURS = [
  { label: "7am", hour: 7, minutes: 0 },
  { label: "8am", hour: 8, minutes: 0 },
  { label: "9am", hour: 9, minutes: 0 },
  { label: "10am", hour: 10, minutes: 0 },
  { label: "11am", hour: 11, minutes: 0 },
  { label: "12pm", hour: 12, minutes: 0 },
  { label: "1pm", hour: 13, minutes: 0 },
  { label: "2pm", hour: 14, minutes: 0 },
  { label: "3pm", hour: 15, minutes: 0 },
  { label: "4pm", hour: 16, minutes: 0 },
];

const PLANNER_START_HOUR = 7;
const PLANNER_END_HOUR = 16;
const PLANNER_TOTAL_MINUTES = (PLANNER_END_HOUR - PLANNER_START_HOUR) * 60; // 540 minutes
const PROJECT_DURATION_MINUTES = 120; // 2 hours
const PROJECT_WIDTH = 400;
const PROJECT_HEIGHT = 100;

function formatDateToIsoLocal(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Default From for Site Visit Booking emails (must match an SMTP slot in Settings to send). */
const DEFAULT_SITE_VISIT_FROM = "craig@superiorgrannyflats.com.au";

/** Same source as Stream Settings / SMTP Settings: non-empty `smtp_user_1`…`smtp_user_16` (deduped, sorted). */
function smtpSlotEmailsFromSettings(data) {
  if (!data || typeof data !== "object") return [];
  const seen = new Set();
  const list = [];
  for (let i = 1; i <= 16; i++) {
    const raw = data[`smtp_user_${i}`];
    const e = raw == null ? "" : String(raw).trim();
    if (!e) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(e);
  }
  list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return list;
}

export default function SiteVisitPlanner() {
  const logo = useAppLogo();
  const navigate = useNavigate();
  const location = useLocation();
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [group, setGroup] = useState(null);
  // State: each project has its own AM/PM selection
  const [projectTimePeriods, setProjectTimePeriods] = useState({}); // { projectId: true/false } where true = AM, false = PM
  // State: single date for the entire group
  const [groupDate, setGroupDate] = useState(""); // "YYYY-MM-DD"
  
  // State: each project has scheduledStartMinutes (minutes from 7am) or null
  const [projectSchedules, setProjectSchedules] = useState({});
  
  // Drag state
  const [dragState, setDragState] = useState({
    draggingId: null,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    cursorX: 0,
    cursorY: 0,
    isOverPlanner: false,
    snappedStartMinutes: null,
    snappedY: null,
  });
  
  const plannerRef = useRef(null);
  const [hourHeight, setHourHeight] = useState(0);
  const draggingIdRef = useRef(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSiteVisitEmailPreview, setShowSiteVisitEmailPreview] = useState(false);
  const [currentEmailProjectIndex, setCurrentEmailProjectIndex] = useState(0);
  const [siteVisitPreviewTo, setSiteVisitPreviewTo] = useState("");
  const [siteVisitPreviewFrom, setSiteVisitPreviewFrom] = useState(DEFAULT_SITE_VISIT_FROM);
  const [siteVisitPreviewSubject, setSiteVisitPreviewSubject] = useState("");
  const [siteVisitPreviewBody, setSiteVisitPreviewBody] = useState("");
  const [siteVisitSmtpFromList, setSiteVisitSmtpFromList] = useState([]);
  const siteVisitEmailBodyRef = useRef(null);
  // Drag state for reordering group project list (green rectangles)
  const [groupDragId, setGroupDragId] = useState(null);
  const [groupDragPosition, setGroupDragPosition] = useState({ x: 0, y: 0 });
  const projectCardRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(200);

  useEffect(() => {
    if (location.state && location.state.group) {
      const savedGroup = location.state.group;
      // Try to load saved order from localStorage
      const savedOrderKey = `siteVisitGroup_${savedGroup.id}_order`;
      const savedOrder = localStorage.getItem(savedOrderKey);
      if (savedOrder) {
        try {
          const savedIds = JSON.parse(savedOrder);
          // If saved order is an 8-position array (with nulls), use it directly
          // Otherwise, convert to 8-position array
          let orderedIds = Array.isArray(savedIds) ? savedIds : [];
          // Pad to 8 positions if needed
          while (orderedIds.length < 8) {
            orderedIds.push(null);
          }
          // Trim to 8 if longer
          orderedIds = orderedIds.slice(0, 8);
          // Verify all saved IDs are still in the group and replace invalid ones with null
          const validIds = orderedIds.map(id => 
            id && savedGroup.projectIds.includes(id) ? id : null
          );
          // Add any missing IDs from the group to empty slots
          const missingIds = savedGroup.projectIds.filter(id => !validIds.includes(id));
          let insertIndex = 0;
          for (let i = 0; i < validIds.length && insertIndex < missingIds.length; i++) {
            if (validIds[i] === null) {
              validIds[i] = missingIds[insertIndex];
              insertIndex++;
            }
          }
          // Ensure exactly 8 positions
          while (validIds.length < 8) {
            validIds.push(null);
          }
          validIds.length = 8; // Trim to 8 if longer
          setGroup({
            ...savedGroup,
            projectIds: validIds,
          });
        } catch (e) {
          console.error("Error loading saved order:", e);
          setGroup(savedGroup);
        }
      } else {
        setGroup(savedGroup);
      }
    } else {
      navigate("/managers/site-visit-manager");
      return;
    }
    fetchProjects();
    checkAdminStatus();
  }, [location, navigate]);

  // Measure card width when projects are loaded
  useEffect(() => {
    if (projectCardRef.current) {
      const width = projectCardRef.current.offsetWidth;
      if (width > 0) {
        setCardWidth(width);
      }
    }
  }, [projects, group]);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  // Calculate hour height based on planner container
  useEffect(() => {
    if (plannerRef.current) {
      const plannerHeight = plannerRef.current.clientHeight;
      const totalHours = HOURS.length;
      const calculatedHeight = plannerHeight / totalHours;
      setHourHeight(calculatedHeight);
    }
  }, [loading, plannerRef]);

  async function fetchProjects(options = {}) {
    const showLoading = options.showLoading !== false;
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  // Helper function to get salesperson details
  async function getSalespersonDetails(salespersonName) {
    if (!salespersonName) return { position: "", phone: "", email: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { position: "", phone: "", email: "" };
      const users = await response.json();
      const user = users.find((u) => u.name === salespersonName);
      if (!user) return { position: "", phone: "", email: "" };
      const position = getUserPrimaryPositionName(user);
      return {
        position,
        phone: user.phone || "",
        email: user.email || "",
      };
    } catch (error) {
      console.error("Error fetching salesperson details:", error);
      return { position: "", phone: "", email: "" };
    }
  }

  // Token replacement function (similar to Overview.jsx)
  async function replaceTokens(text, project, opts = {}) {
    if (!text || !project) return text;
    const html = !!opts.html;

    let replaced = text;

    replaced = replaced.replace(/{ProjectName}/g, project.name || "");
    replaced = replaced.replace(/{ClientName}/g, project.client_name || "");
    replaced = replaced.replace(/{ProjectCost}/g, project.project_cost ? `$${project.project_cost.toLocaleString()}` : "");
    replaced = replaced.replace(/{Street}/g, project.street || "");
    replaced = replaced.replace(/{Suburb}/g, project.suburb || "");

    let depositPaid = "$0";
    let depositNum = 0;
    if (project.deposit != null && project.deposit !== "") {
      if (typeof project.deposit === "string") {
        const cleaned = project.deposit.replace(/[$,\s]/g, "");
        depositNum = parseFloat(cleaned);
      } else {
        depositNum = Number(project.deposit);
      }
      if (!isNaN(depositNum) && depositNum > 0) {
        depositPaid = `$${depositNum.toLocaleString()}`;
      }
    }
    replaced = replaced.replace(/{DepositPaid}/g, depositPaid);

    let depositStatus = "$0 only";
    if (depositNum > 0) {
      const projectCostNum =
        typeof project.project_cost === "string"
          ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
          : Number(project.project_cost || 0);
      if (!isNaN(projectCostNum) && projectCostNum > 0) {
        const fullDepositAmount = Math.floor(projectCostNum / 20);
        depositStatus = depositNum === fullDepositAmount ? "Full Deposit Paid" : `${depositPaid} only`;
      } else {
        depositStatus = `${depositPaid} only`;
      }
    }
    replaced = replaced.replace(/{DepositStatus}/g, depositStatus);

    replaced = replaced.replace(/{Contact1}/g, project.client1_email && project.client1_active === 'true' ? project.client1_email : "");
    replaced = replaced.replace(/{Contact2}/g, project.client2_email && project.client2_active === 'true' ? project.client2_email : "");
    replaced = replaced.replace(/{Contact3}/g, project.client3_email && project.client3_active === 'true' ? project.client3_email : "");
    replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");

    const needsDetails =
      replaced.includes("{SalespersonPosition}") ||
      replaced.includes("{SalespersonPhone}") ||
      replaced.includes("{SalespersonEmail}");
    if (needsDetails) {
      const { position, phone, email } = await getSalespersonDetails(project.salesperson);
      const formattedPosition = position
        ? html
          ? `<br>${position}`
          : `\n${position}`
        : "";
      replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
      replaced = replaced.replace(/{SalespersonPhone}/g, phone);
      replaced = replaced.replace(/{SalespersonEmail}/g, email);
    }

    // Site Visit Scheduled Date
    if (project.site_visit_scheduled_date) {
      const formattedDate = new Date(project.site_visit_scheduled_date + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      replaced = replaced.replace(/{SiteVisitScheduledDate}/g, formattedDate);
    } else {
      replaced = replaced.replace(/{SiteVisitScheduledDate}/g, "");
    }

    // Site Visit Scheduled Period (AM/PM)
    replaced = replaced.replace(/{SiteVisitScheduledPeriod}/g, project.site_visit_scheduled_period || "");

    return replaced;
  }

  // Get projects in the selected group (excluding Hotlist projects), in the order of group.projectIds
  const groupProjects = React.useMemo(() => {
    if (!group || !Array.isArray(group.projectIds)) return [];

    const idOrder = group.projectIds;
    const idSet = new Set(idOrder);
    const idToProject = new Map();

    projects.forEach((project) => {
      if (idSet.has(project.id) && project.status !== "Hotlist" && project.status !== "Cancelled") {
        idToProject.set(project.id, project);
      }
    });

    return idOrder
      .map((id) => idToProject.get(id))
      .filter(Boolean);
  }, [group, projects]);

  const siteVisitCalendarSelected = useMemo(() => {
    if (!groupDate || !/^\d{4}-\d{2}-\d{2}$/.test(groupDate)) return undefined;
    const d = new Date(`${groupDate}T12:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }, [groupDate]);

  const groupProjectsRef = useRef([]);
  useEffect(() => {
    groupProjectsRef.current = groupProjects;
  }, [groupProjects]);

  useEffect(() => {
    if (showSiteVisitEmailPreview && siteVisitEmailBodyRef.current && siteVisitPreviewBody != null) {
      if (siteVisitEmailBodyRef.current.innerHTML !== siteVisitPreviewBody) {
        siteVisitEmailBodyRef.current.innerHTML = siteVisitPreviewBody;
      }
    }
  }, [showSiteVisitEmailPreview, siteVisitPreviewBody]);

  async function loadSiteVisitSmtpFromAddresses() {
    try {
      const res = await fetch(`${API_URL}/api/settings`);
      if (!res.ok) return [DEFAULT_SITE_VISIT_FROM];
      const s = await res.json();
      const slots = smtpSlotEmailsFromSettings(s);
      const seen = new Set();
      const out = [];
      const add = (addr) => {
        const v = addr != null ? String(addr).trim() : "";
        if (!v) return;
        const key = v.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(v);
      };
      add(DEFAULT_SITE_VISIT_FROM);
      for (const e of slots) add(e);
      return out.length ? out : [DEFAULT_SITE_VISIT_FROM];
    } catch (e) {
      console.error("Site visit planner: could not load SMTP from addresses:", e);
      return [DEFAULT_SITE_VISIT_FROM];
    }
  }

  function collectSiteVisitRecipientEmails(project) {
    const projectToEmails = new Set();
    if (project.client1_email && project.client1_active === "true") {
      projectToEmails.add(String(project.client1_email).trim());
    }
    if (project.client2_email && project.client2_active === "true") {
      projectToEmails.add(String(project.client2_email).trim());
    }
    if (project.client3_email && project.client3_active === "true") {
      projectToEmails.add(String(project.client3_email).trim());
    }
    if (project.email) {
      projectToEmails.add(String(project.email).trim());
    }
    return Array.from(projectToEmails).filter(Boolean);
  }

  function formatSiteVisitClientGreeting(project) {
    const names = [];
    if (project.client1_name && project.client1_active === "true") names.push(String(project.client1_name).trim());
    if (project.client2_name && project.client2_active === "true") names.push(String(project.client2_name).trim());
    if (project.client3_name && project.client3_active === "true") names.push(String(project.client3_name).trim());
    const firstNames = names
      .map((name) => name.split(/\s+/)[0])
      .filter((name) => name.length > 0);
    if (firstNames.length === 1) return `${firstNames[0]},`;
    if (firstNames.length === 2) return `${firstNames[0]} and ${firstNames[1]},`;
    if (firstNames.length > 2) {
      const copy = [...firstNames];
      const last = copy.pop();
      return `${copy.join(", ")} and ${last},`;
    }
    return project.client_name || "";
  }

  function closeSiteVisitEmailPreview() {
    setShowSiteVisitEmailPreview(false);
    setCurrentEmailProjectIndex(0);
    setSiteVisitPreviewTo("");
    setSiteVisitPreviewFrom(DEFAULT_SITE_VISIT_FROM);
    setSiteVisitPreviewSubject("");
    setSiteVisitPreviewBody("");
  }

  async function openSiteVisitEmailPreviewAtIndex(index) {
    try {
      const list = groupProjectsRef.current;
      if (!groupDate || !list || index < 0 || index >= list.length) {
        return;
      }
      const currentProject = list[index];
      if (!currentProject) return;

      const smtpList = await loadSiteVisitSmtpFromAddresses();
      setSiteVisitSmtpFromList(smtpList);

      const period = projectTimePeriods[currentProject.id] !== false ? "AM" : "PM";
      const projectForTokens = {
        ...currentProject,
        site_visit_scheduled_date: groupDate,
        site_visit_scheduled_period: period,
        client_name: formatSiteVisitClientGreeting(currentProject) || currentProject.client_name || "",
      };

      const toEmails = collectSiteVisitRecipientEmails(currentProject);
      if (toEmails.length === 0) {
        alert("No active client email addresses found for this project.");
        return;
      }

      const templatesResponse = await fetch(`${API_URL}/api/email-templates`);
      if (!templatesResponse.ok) {
        alert("Failed to fetch email templates.");
        return;
      }
      const templates = await templatesResponse.json();
      const template = templates.find((t) => t.name === "SITE VISIT BOOKING");
      if (!template) {
        alert("Email template 'SITE VISIT BOOKING' not found. Create it in Settings → Email Templates.");
        return;
      }

      const subject = await replaceTokens(template.subject || "", projectForTokens);
      const body = await replaceTokens(template.body || "", projectForTokens);

      setCurrentEmailProjectIndex(index);
      setSiteVisitPreviewTo(toEmails.join(", "));
      setSiteVisitPreviewFrom(DEFAULT_SITE_VISIT_FROM);
      setSiteVisitPreviewSubject(subject);
      setSiteVisitPreviewBody(body);
      setShowSiteVisitEmailPreview(true);
    } catch (e) {
      console.error("Site visit email preview:", e);
      alert(e.message || "Failed to load email preview");
    }
  }

  async function handleSiteVisitEmailClientsClick() {
    if (!groupDate) {
      alert("Please select a date first");
      return;
    }
    const list = groupProjectsRef.current;
    if (!list.length) {
      alert("No projects in this group.");
      return;
    }
    await openSiteVisitEmailPreviewAtIndex(0);
  }

  async function handleSiteVisitPreviewSend() {
    const list = groupProjectsRef.current;
    const idx = currentEmailProjectIndex;
    const currentProject = list[idx];
    if (!currentProject || !groupDate) {
      alert("Missing project or date.");
      return;
    }

    const toAddresses = siteVisitPreviewTo
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    const fromForSend = (siteVisitPreviewFrom || "").trim();
    if (toAddresses.length === 0) {
      alert("Please enter at least one recipient email address.");
      return;
    }
    if (!fromForSend) {
      alert("Please enter a From address.");
      return;
    }

    const period = projectTimePeriods[currentProject.id] !== false ? "AM" : "PM";

    try {
      await runWithEmailOverlay(async () => {
        const scheduleResponse = await fetch(`${API_URL}/api/projects/update-site-visit-scheduled`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projects: [
              {
                projectId: currentProject.id,
                date: groupDate,
                period,
              },
            ],
            updateStatus: true,
          }),
        });
        if (!scheduleResponse.ok) {
          const errorData = await scheduleResponse.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to save site visit schedule");
        }

        const sendRes = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toAddresses,
            from: fromForSend,
            subject: siteVisitPreviewSubject || "",
            htmlBody: siteVisitPreviewBody || "",
          }),
        });
        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          throw new Error(sendData.error || "Failed to send email");
        }
      });

      await fetchProjects({ showLoading: false });
      // Let React apply `projects` so `groupProjectsRef` matches before opening the next preview.
      await new Promise((r) => setTimeout(r, 0));

      if (idx < groupProjectsRef.current.length - 1) {
        await openSiteVisitEmailPreviewAtIndex(idx + 1);
      } else {
        alert("Site visit emails sent for all projects in this group.");
        closeSiteVisitEmailPreview();
      }
    } catch (error) {
      console.error("Site visit email send:", error);
      alert(error.message || "Failed to send email");
    }
  }

  function handleSiteVisitPreviewSkip() {
    const list = groupProjectsRef.current;
    const idx = currentEmailProjectIndex;
    if (idx < list.length - 1) {
      void openSiteVisitEmailPreviewAtIndex(idx + 1);
    } else {
      closeSiteVisitEmailPreview();
    }
  }

  // Helper function to get project at a specific position (0-7)
  const getProjectAtPosition = (position) => {
    if (!group || !Array.isArray(group.projectIds) || position < 0 || position >= 8) {
      return null;
    }
    // Pad array to 8 positions if needed (for backward compatibility)
    let projectIds = [...group.projectIds];
    while (projectIds.length < 8) {
      projectIds.push(null);
    }
    const projectId = projectIds[position];
    if (!projectId) {
      return null;
    }
    return groupProjects.find(p => p.id === projectId) || null;
  };

  // Get unscheduled projects
  const unscheduledProjects = groupProjects.filter(
    (project) => projectSchedules[project.id] === null || projectSchedules[project.id] === undefined
  );

  // Get scheduled projects sorted by start time
  const scheduledProjects = groupProjects
    .filter((project) => projectSchedules[project.id] !== null && projectSchedules[project.id] !== undefined)
    .map((project) => ({
      project,
      startMinutes: projectSchedules[project.id],
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  // Convert minutes from 7am to hour label
  const minutesToHourLabel = (minutes) => {
    const totalMinutes = minutes;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const displayHour = PLANNER_START_HOUR + hours;
    const period = displayHour >= 12 ? "pm" : "am";
    const hour12 = displayHour > 12 ? displayHour - 12 : displayHour === 0 ? 12 : displayHour;
    return `${hour12}:${mins.toString().padStart(2, "0")}${period}`;
  };

  // Convert minutes from 7am to end time label
  const minutesToEndLabel = (startMinutes) => {
    const endMinutes = startMinutes + PROJECT_DURATION_MINUTES;
    return minutesToHourLabel(endMinutes);
  };

  // Convert Y position to minutes from 7am with snapping
  const yToSnappedMinutes = (y) => {
    if (!plannerRef.current || hourHeight === 0) return null;
    
    const plannerRect = plannerRef.current.getBoundingClientRect();
    const relativeY = y - plannerRect.top;
    
    // Convert to minutes from 7am
    const minutes = (relativeY / hourHeight) * 60;
    
    // Snap to nearest 60-minute increment
    const snappedMinutes = Math.round(minutes / 60) * 60;
    
    // Clamp to valid range [0, PLANNER_TOTAL_MINUTES - PROJECT_DURATION_MINUTES]
    const maxStart = PLANNER_TOTAL_MINUTES - PROJECT_DURATION_MINUTES;
    const clamped = Math.max(0, Math.min(snappedMinutes, maxStart));
    
    return clamped;
  };

  // Convert minutes from 7am to Y position
  const minutesToY = (minutes) => {
    if (hourHeight === 0) return 0;
    return (minutes / 60) * hourHeight;
  };

  // Check if a time slot is occupied
  const isTimeSlotOccupied = (startMinutes) => {
    const endMinutes = startMinutes + PROJECT_DURATION_MINUTES;
    return scheduledProjects.some(
      (scheduled) =>
        (scheduled.startMinutes < endMinutes && scheduled.startMinutes + PROJECT_DURATION_MINUTES > startMinutes)
    );
  };

  // ----- Drag & Drop for Group Project List (Green Rectangles) -----
  const handleGroupDragStart = (e, projectId) => {
    setGroupDragId(projectId);
    setGroupDragPosition({ x: e.clientX, y: e.clientY });
    if (e.dataTransfer) {
      // Use a transparent drag image so we can show our own custom drag preview
      const img = new Image();
      img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
      e.dataTransfer.setDragImage(img, 0, 0);
      e.dataTransfer.setData("text/plain", String(projectId));
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleGroupDragOver = (e, targetProjectId) => {
    e.preventDefault();
    e.stopPropagation();
    // Update drag position for visual feedback
    setGroupDragPosition({ x: e.clientX, y: e.clientY });

    if (!group || !group.projectIds || !groupDragId || groupDragId === targetProjectId) {
      return;
    }

    const toIndex = Array.isArray(group.projectIds) ? group.projectIds.indexOf(targetProjectId) : -1;
    if (toIndex === -1) return;
    moveGroupProjectToIndex(toIndex);
  };

  const handleGroupDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setGroupDragId(null);
  };

  const handleGroupDragEnd = () => {
    setGroupDragId(null);
    setGroupDragPosition({ x: 0, y: 0 });
  };

  const normalizeEightPositions = (ids) => {
    const padded = Array.isArray(ids) ? [...ids] : [];
    while (padded.length < 8) padded.push(null);
    return padded.slice(0, 8);
  };

  const moveGroupProjectToIndex = (toIndex) => {
    if (!group || !groupDragId || toIndex < 0 || toIndex > 7) return;

    const currentIds = normalizeEightPositions(group.projectIds);
    const fromIndex = currentIds.indexOf(groupDragId);
    if (fromIndex === -1 || fromIndex === toIndex) return;

    const displacedProjectId = currentIds[toIndex];
    currentIds[toIndex] = groupDragId;
    currentIds[fromIndex] = displacedProjectId && displacedProjectId !== groupDragId ? displacedProjectId : null;

    // Defensive dedupe: never allow duplicate IDs to survive rapid drag-over events.
    const seen = new Set();
    for (let i = 0; i < currentIds.length; i++) {
      const id = currentIds[i];
      if (id == null) continue;
      if (seen.has(id)) {
        currentIds[i] = null;
      } else {
        seen.add(id);
      }
    }

    setGroup({
      ...group,
      projectIds: currentIds,
    });

    setProjectTimePeriods((prev) => {
      const next = {
        ...prev,
        [groupDragId]: toIndex < 4,
      };
      if (displacedProjectId && displacedProjectId !== groupDragId) {
        next[displacedProjectId] = fromIndex < 4;
      }
      return next;
    });

    if (group.id) {
      const savedOrderKey = `siteVisitGroup_${group.id}_order`;
      localStorage.setItem(savedOrderKey, JSON.stringify(currentIds));
    }
  };

  // Handle pointer down on project card
  const handlePointerDown = (e, projectId) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    draggingIdRef.current = projectId;
    setDragState({
      draggingId: projectId,
      pointerOffsetX: offsetX,
      pointerOffsetY: offsetY,
      cursorX: e.clientX,
      cursorY: e.clientY,
      isOverPlanner: false,
      snappedStartMinutes: null,
      snappedY: null,
    });

    // Capture pointer
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // Handle pointer move
  useEffect(() => {
    if (!dragState.draggingId) return;

    const handlePointerMove = (e) => {
      const cursorX = e.clientX;
      const cursorY = e.clientY;

      // Check if over planner
      let isOverPlanner = false;
      let snappedStartMinutes = null;
      let snappedY = null;

      if (plannerRef.current) {
        const plannerRect = plannerRef.current.getBoundingClientRect();
        isOverPlanner =
          cursorX >= plannerRect.left &&
          cursorX <= plannerRect.right &&
          cursorY >= plannerRect.top &&
          cursorY <= plannerRect.bottom;

        if (isOverPlanner) {
          snappedStartMinutes = yToSnappedMinutes(cursorY);
          if (snappedStartMinutes !== null) {
            snappedY = minutesToY(snappedStartMinutes);
          }
        }
      }

      setDragState((prev) => ({
        ...prev,
        cursorX,
        cursorY,
        isOverPlanner,
        snappedStartMinutes,
        snappedY,
      }));
    };

    const handlePointerUp = (e) => {
      const draggingId = draggingIdRef.current;
      if (!draggingId) return;

      const cursorX = e.clientX;
      const cursorY = e.clientY;

      // Check if over planner at release time
      let isOverPlannerAtRelease = false;
      let snappedStartMinutesAtRelease = null;

      if (plannerRef.current) {
        const plannerRect = plannerRef.current.getBoundingClientRect();
        isOverPlannerAtRelease =
          cursorX >= plannerRect.left &&
          cursorX <= plannerRect.right &&
          cursorY >= plannerRect.top &&
          cursorY <= plannerRect.bottom;

        if (isOverPlannerAtRelease) {
          snappedStartMinutesAtRelease = yToSnappedMinutes(cursorY);
        }
      }

      // Update project schedules
      if (isOverPlannerAtRelease && snappedStartMinutesAtRelease !== null) {
        // Check if slot is occupied
        setProjectSchedules((prev) => {
          const currentSchedules = { ...prev };
          // Temporarily remove this project to check for conflicts
          delete currentSchedules[draggingId];
          const scheduledProjects = Object.entries(currentSchedules)
            .filter(([_, minutes]) => minutes !== null && minutes !== undefined)
            .map(([id, minutes]) => ({
              projectId: parseInt(id),
              startMinutes: minutes,
            }));

          const isOccupied = scheduledProjects.some((scheduled) => {
            const scheduledEnd = scheduled.startMinutes + PROJECT_DURATION_MINUTES;
            return (
              scheduled.startMinutes < snappedStartMinutesAtRelease + PROJECT_DURATION_MINUTES &&
              scheduledEnd > snappedStartMinutesAtRelease
            );
          });

          if (isOccupied) {
            alert("This time slot is already occupied. Projects take 2 hours.");
            return prev;
          } else {
            // Schedule the project
            return {
              ...prev,
              [draggingId]: snappedStartMinutesAtRelease,
            };
          }
        });
      } else {
        // Dropped outside planner - remove from schedule
        setProjectSchedules((prev) => {
          const newSchedules = { ...prev };
          delete newSchedules[draggingId];
          return newSchedules;
        });
      }

      // Clear drag state
      draggingIdRef.current = null;
      setDragState({
        draggingId: null,
        pointerOffsetX: 0,
        pointerOffsetY: 0,
        cursorX: 0,
        cursorY: 0,
        isOverPlanner: false,
        snappedStartMinutes: null,
        snappedY: null,
      });
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState.draggingId, hourHeight]);

  // Render project card
  const renderProjectCard = (project, isInPlanner = false, startMinutes = null) => {
    const suburb = project.suburb || "Unknown Suburb";
    const street = project.street || "No address";
    const notes = project.site_visit_notes?.trim();
    const isBeingDragged = dragState.draggingId === project.id;
    const timeRange = startMinutes !== null
      ? `${minutesToHourLabel(startMinutes)} - ${minutesToEndLabel(startMinutes)}`
      : null;

    return (
      <div
        onPointerDown={(e) => !isBeingDragged && handlePointerDown(e, project.id)}
        style={{
          padding: "8px",
          borderRadius: "8px",
          border: `2px solid ${group ? group.color : SECTION_GREY}`,
          background: isInPlanner
            ? group
              ? group.color + "40"
              : "rgba(255, 255, 255, 0.6)"
            : group
            ? group.color + "20"
            : WHITE,
          cursor: isBeingDragged ? "grabbing" : "grab",
          transition: isBeingDragged ? "none" : "box-shadow 0.2s, border-color 0.2s",
          width: `${PROJECT_WIDTH}px`,
          height: `${PROJECT_HEIGHT}px`,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
        }}
        onMouseEnter={(e) => {
          if (!isInPlanner && !isBeingDragged) {
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            e.currentTarget.style.borderColor = MONUMENT;
          }
        }}
        onMouseLeave={(e) => {
          if (!isInPlanner && !isBeingDragged) {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.borderColor = group ? group.color : SECTION_GREY;
          }
        }}
      >
        {timeRange && (
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              color: MONUMENT,
              marginBottom: "4px",
            }}
          >
            {timeRange}
          </div>
        )}
        <div
          style={{
            fontSize: "0.85rem",
            fontWeight: 500,
            marginBottom: notes ? "4px" : "0",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {suburb} - {street}
        </div>
        {notes && (
          <div
            style={{
              fontSize: "0.75rem",
              color: UI.textMuted,
              marginTop: "4px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              flex: 1,
            }}
          >
            {notes}
          </div>
        )}
      </div>
    );
  };

  const draggedProject = dragState.draggingId
    ? groupProjects.find((p) => p.id === dragState.draggingId)
    : null;

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: MONUMENT,
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
            Site Visit Planner
          </h1>
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
          }}
        >
          {/* Menu Buttons */}
          <Link
            to="/all-projects"
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
              display: "block",
            }}
          >
            All Projects
          </Link>
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
              display: "block",
            }}
          >
            Design Phase
          </Link>
          <Link
            to="/construction-phase"
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
              display: "block",
            }}
          >
            Construction Phase
          </Link>
          <Link
            to="/finished-projects"
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
              display: "block",
            }}
          >
            Finished Projects
          </Link>
          <Link
            to="/managers/site-visit-manager"
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
              outline: `2px solid ${UI.outline}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            Site Visit Manager
          </Link>
          {isAdmin && (
            <Link
              to="/settings"
              style={{
                background: "transparent",
                color: UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                display: "block",
              }}
            >
              Settings
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/apply-fields"
              style={{
                background: "transparent",
                color: UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                display: "block",
              }}
            >
              Apply Fields
            </Link>
          )}
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
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
              Site Visit Run
            </h2>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                onClick={() => navigate("/managers/site-visit-manager")}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
              >
                Back to Manager
              </button>
            </div>
          </div>

          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}
          {!loading && !error && groupProjects.length === 0 && (
            <p style={{ color: UI.textMuted }}>No projects in this group.</p>
          )}
          {!loading && !error && groupProjects.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", flex: 1, overflow: "hidden", minWidth: 0 }}>
              {/* Column 1: Projects */}
              <div
                style={{
                  gridColumn: "1",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  overflowY: "auto",
                  alignContent: "flex-start",
                  minWidth: 0,
                }}
              >
                <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 12px 0", textAlign: "center" }}>
                  Drag to move projects
                </p>
                {/* AM Zone */}
                <div
                  style={{
                    border: "3px solid #4D93D9",
                    borderRadius: "8px",
                    padding: "8px",
                    marginBottom: "12px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "-12px",
                      left: "12px",
                      background: WHITE,
                      padding: "2px 8px",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: "#4D93D9",
                    }}
                  >
                    AM
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                    {Array.from({ length: 4 }, (_, index) => {
                      // Get project at this position (AM zone: positions 0-3)
                      const project = getProjectAtPosition(index);
                      if (!project) {
                        // Empty slot placeholder
                        return (
                          <div
                            key={`am-placeholder-${index}`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveGroupProjectToIndex(index);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveGroupProjectToIndex(index);
                              handleGroupDragEnd();
                            }}
                            style={{
                              width: "100%",
                              height: "100px",
                              border: "2px dashed #ccc",
                              borderRadius: "8px",
                              background: "rgba(0,0,0,0.05)",
                            }}
                          />
                        );
                      }
                      const suburb = project.suburb || "Unknown Suburb";
                      const street = project.street || "No address";
                      const notes = project.site_visit_notes?.trim();
                      const cardBackground = "#4D93D9"; // Blue instead of green
                      const textColor = WHITE;
                      const secondaryTextColor = "#ffffffcc";

                      return (
                        <div
                          key={project.id}
                          ref={index === 0 ? projectCardRef : null}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleGroupDragStart(e, project.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleGroupDragOver(e, project.id);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleGroupDrop(e, project.id);
                          }}
                          onDragEnd={(e) => {
                            e.stopPropagation();
                            handleGroupDragEnd();
                          }}
                          style={{
                            position: "relative",
                            width: "100%",
                            height: "100px",
                            cursor: groupDragId === project.id ? "grabbing" : "grab",
                          }}
                        >
                          <div
                            style={{
                              background: cardBackground,
                              borderRadius: "8px",
                              width: "100%",
                              height: "100px",
                              color: textColor,
                              cursor: groupDragId === project.id ? "grabbing" : "grab",
                              transition: groupDragId === project.id ? "none" : "transform 0.2s ease-out",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              alignItems: "center",
                              position: "relative",
                              overflow: "hidden",
                              boxSizing: "border-box",
                              opacity: groupDragId === project.id ? 0.4 : 1,
                            }}
                          >
                            {/* On Hold and Cancelled bands - same as before */}
                            {(project.on_hold === 'true' || project.on_hold === true) && (
                              <OnHoldSash />
                            )}
                            {project.status === "Cancelled" && (
                              <CancelledSash />
                            )}
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "1.1rem",
                                textAlign: "center",
                                marginBottom: "4px",
                                width: "100%",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                flex: 1,
                                flexDirection: "column",
                                gap: "4px",
                                position: "relative",
                                zIndex: ((project.on_hold === 'true' || project.on_hold === true) || project.status === "Cancelled") ? 1 : "auto",
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: "1.1rem", color: textColor }}>
                                {suburb}
                              </div>
                              <div style={{ fontSize: "0.95rem", color: secondaryTextColor, fontWeight: 400 }}>
                                {street}
                              </div>
                              {notes && (
                                <div style={{ fontSize: "0.8rem", color: secondaryTextColor, fontWeight: 400, marginTop: "2px" }}>
                                  {notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* PM Zone */}
                <div
                  style={{
                    border: "3px solid #D54358",
                    borderRadius: "8px",
                    padding: "8px",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "-12px",
                      left: "12px",
                      background: WHITE,
                      padding: "2px 8px",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: "#D54358",
                    }}
                  >
                    PM
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                    {Array.from({ length: 4 }, (_, index) => {
                      // Get project at this position (PM zone: positions 4-7)
                      const positionIndex = index + 4;
                      const project = getProjectAtPosition(positionIndex);
                      if (!project) {
                        // Empty slot placeholder
                        return (
                          <div
                            key={`pm-placeholder-${index}`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveGroupProjectToIndex(positionIndex);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveGroupProjectToIndex(positionIndex);
                              handleGroupDragEnd();
                            }}
                            style={{
                              width: "100%",
                              height: "100px",
                              border: "2px dashed #ccc",
                              borderRadius: "8px",
                              background: "rgba(0,0,0,0.05)",
                            }}
                          />
                        );
                      }
                      const suburb = project.suburb || "Unknown Suburb";
                      const street = project.street || "No address";
                      const notes = project.site_visit_notes?.trim();
                      const cardBackground = "#4D93D9"; // Blue instead of green
                      const textColor = WHITE;
                      const secondaryTextColor = "#ffffffcc";

                      return (
                        <div
                          key={project.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleGroupDragStart(e, project.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleGroupDragOver(e, project.id);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleGroupDrop(e, project.id);
                          }}
                          onDragEnd={(e) => {
                            e.stopPropagation();
                            handleGroupDragEnd();
                          }}
                          style={{
                            position: "relative",
                            width: "100%",
                            height: "100px",
                            cursor: groupDragId === project.id ? "grabbing" : "grab",
                          }}
                        >
                          <div
                            style={{
                              background: cardBackground,
                              borderRadius: "8px",
                              width: "100%",
                              height: "100px",
                              color: textColor,
                              cursor: groupDragId === project.id ? "grabbing" : "grab",
                              transition: groupDragId === project.id ? "none" : "transform 0.2s ease-out",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              alignItems: "center",
                              position: "relative",
                              overflow: "hidden",
                              boxSizing: "border-box",
                              opacity: groupDragId === project.id ? 0.4 : 1,
                            }}
                          >
                            {/* On Hold and Cancelled bands - same as before */}
                            {(project.on_hold === 'true' || project.on_hold === true) && (
                              <OnHoldSash />
                            )}
                            {project.status === "Cancelled" && (
                              <CancelledSash />
                            )}
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "1.1rem",
                                textAlign: "center",
                                marginBottom: "4px",
                                width: "100%",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                flex: 1,
                                flexDirection: "column",
                                gap: "4px",
                                position: "relative",
                                zIndex: ((project.on_hold === 'true' || project.on_hold === true) || project.status === "Cancelled") ? 1 : "auto",
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: "1.1rem", color: textColor }}>
                                {suburb}
                              </div>
                              <div style={{ fontSize: "0.95rem", color: secondaryTextColor, fontWeight: 400 }}>
                                {street}
                              </div>
                              {notes && (
                                <div style={{ fontSize: "0.8rem", color: secondaryTextColor, fontWeight: 400, marginTop: "2px" }}>
                                  {notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Floating dragged card that follows cursor */}
                {groupDragId && groupDragPosition && groupDragPosition.x > 0 && (() => {
                  const draggedProject = groupProjects.find(p => p.id === groupDragId);
                  if (!draggedProject) return null;
                  const draggedIndex = groupProjects.findIndex(p => p.id === groupDragId);
                  const suburb = draggedProject.suburb || "Unknown Suburb";
                  const street = draggedProject.street || "No address";
                  const notes = draggedProject.site_visit_notes?.trim();
                  const cardBackground = "#4D93D9"; // Blue instead of green
                  const textColor = WHITE;
                  const secondaryTextColor = "#ffffffcc";
                  return (
                    <div
                      style={{
                        position: "fixed",
                        left: `${(groupDragPosition.x || 0) - ((cardWidth || 200) / 2)}px`,
                        top: `${(groupDragPosition.y || 0) - 50}px`,
                        width: `${cardWidth || 200}px`,
                        height: "100px",
                        background: cardBackground,
                        borderRadius: "8px",
                        color: textColor,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 10000,
                        pointerEvents: "none",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        border: "2px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      {/* On Hold Diagonal Band */}
                      {(draggedProject.on_hold === 'true' || draggedProject.on_hold === true) && (
                        <OnHoldSash />
                      )}
                      {/* Cancelled Diagonal Band */}
                      {draggedProject.status === "Cancelled" && (
                        <CancelledSash />
                      )}
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "1.1rem",
                          textAlign: "center",
                          marginBottom: "4px",
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          flex: 1,
                          flexDirection: "column",
                          gap: "2px",
                          position: "relative",
                          zIndex: ((draggedProject.on_hold === 'true' || draggedProject.on_hold === true) || draggedProject.status === "Cancelled") ? 1 : "auto",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: textColor }}>
                          {suburb}
                        </div>
                        <div style={{ fontSize: "0.95rem", color: secondaryTextColor, fontWeight: 400 }}>
                          {street}
                        </div>
                        {notes && (
                          <div style={{ fontSize: "0.8rem", color: secondaryTextColor, fontWeight: 400, marginTop: "2px" }}>
                            {notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Column 2: Site visit date — inline calendar (react-day-picker) */}
              <div
                style={{
                  gridColumn: "2",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  alignContent: "flex-start",
                  minWidth: 0,
                }}
              >
                <style>{`
                  .site-visit-planner-rdp.rdp-root {
                    --rdp-accent-color: #4d93d9;
                    --rdp-accent-background-color: #e8f2fc;
                    margin: 0 auto;
                  }
                `}</style>
                <div
                  className="site-visit-planner-rdp"
                  style={{
                    width: "100%",
                    maxWidth: "320px",
                    margin: "0 auto",
                    background: WHITE,
                    borderRadius: "12px",
                    border: `1px solid ${SECTION_GREY}`,
                    padding: "12px 10px",
                    boxSizing: "border-box",
                  }}
                >
                  <DayPicker
                    mode="single"
                    locale={enAU}
                    weekStartsOn={1}
                    selected={siteVisitCalendarSelected}
                    defaultMonth={siteVisitCalendarSelected ?? new Date()}
                    onSelect={(date) => {
                      if (!date) {
                        setGroupDate("");
                        return;
                      }
                      setGroupDate(formatDateToIsoLocal(date));
                    }}
                  />
                </div>
              </div>

              {/* Column 3: Email Clients button */}
              <div
                style={{
                  gridColumn: "3",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  alignContent: "flex-start",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    height: "100px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <button
                    onClick={() => {
                      void (async () => {
                        try {
                          await handleSiteVisitEmailClientsClick();
                        } catch (err) {
                          console.error(err);
                          alert(err.message || "Failed to open email preview");
                        }
                      })();
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
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                  >
                    Email Clients
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Site visit client email — preview & send (SMTP, same pattern as Drawings) */}
      {showSiteVisitEmailPreview && (
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                type="button"
                onClick={closeSiteVisitEmailPreview}
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
            {(() => {
              const currentProject = groupProjects[currentEmailProjectIndex];
              if (!currentProject) return null;
              const suburb = currentProject.suburb || "Unknown Suburb";
              const street = currentProject.street || "No address";
              return (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "1.05rem", fontWeight: 600, color: MONUMENT }}>
                    {suburb} — {street}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "4px" }}>
                    Project {currentEmailProjectIndex + 1} of {groupProjects.length}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={siteVisitPreviewTo}
                  onChange={(e) => setSiteVisitPreviewTo(e.target.value)}
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
                <select
                  value={(() => {
                    const t = (siteVisitPreviewFrom || "").trim().toLowerCase();
                    const hit = siteVisitSmtpFromList.find((a) => a.toLowerCase() === t);
                    return hit || DEFAULT_SITE_VISIT_FROM;
                  })()}
                  onChange={(e) => setSiteVisitPreviewFrom(e.target.value)}
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
                >
                  {siteVisitSmtpFromList.map((addr) => (
                    <option key={addr} value={addr}>
                      {addr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={siteVisitPreviewSubject}
                  onChange={(e) => setSiteVisitPreviewSubject(e.target.value)}
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
                  ref={siteVisitEmailBodyRef}
                  contentEditable
                  onInput={(e) => setSiteVisitPreviewBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setSiteVisitPreviewBody(e.currentTarget.innerHTML)}
                  style={{
                    width: "100%",
                    minHeight: "280px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    lineHeight: 1.6,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", flexWrap: "wrap", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => void handleSiteVisitPreviewSend()}
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
                  Email
                </button>
                <button
                  type="button"
                  onClick={handleSiteVisitPreviewSkip}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: SECTION_GREY,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={closeSiteVisitEmailPreview}
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
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
