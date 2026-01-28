import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
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

export default function SiteVisitPlanner() {
  const navigate = useNavigate();
  const location = useLocation();
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

  useEffect(() => {
    if (location.state && location.state.group) {
      setGroup(location.state.group);
    } else {
      navigate("/site-visit-manager");
      return;
    }
    fetchProjects();
    checkAdminStatus();
  }, [location, navigate]);

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

  async function fetchProjects() {
    try {
      setLoading(true);
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
      setLoading(false);
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
      const position =
        user.positions && Array.isArray(user.positions) && user.positions.length > 0
          ? user.positions[0].name
          : "";
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

  // Get projects in the selected group
  const groupProjects = group
    ? projects.filter((project) => group.projectIds.includes(project.id))
    : [];

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
              color: "#32323399",
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
          background: SECTION_GREY,
          borderRadius: "18px",
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          height: "100px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            textAlign: "center",
            width: "100%",
            color: MONUMENT,
            letterSpacing: "1px",
          }}
        >
          SGF Central
        </h1>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto",
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
            height: "700px",
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
            to="/projects"
            style={{
              background: "transparent",
              color: "#404049",
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
              marginBottom: "2px",
              display: "block",
            }}
          >
            Current Projects
          </Link>
          <Link
            to="/finished-projects"
            style={{
              background: "transparent",
              color: "#404049",
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
              marginBottom: "2px",
              display: "block",
            }}
          >
            Finished Projects
          </Link>
          <Link
            to="/site-visit-manager"
            style={{
              background: WHITE,
              color: MONUMENT,
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
              marginBottom: "2px",
              outline: `2px solid ${MONUMENT}`,
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
                color: "#404049",
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
                marginBottom: "2px",
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
                color: "#404049",
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
                marginBottom: "2px",
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
            minHeight: "700px",
            height: "700px",
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
                onClick={() => navigate("/site-visit-manager")}
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
              <button
                onClick={async () => {
                  if (!groupDate) {
                    alert("Please select a date first");
                    return;
                  }

                  // Collect all project IDs with their AM/PM selections
                  const projectUpdates = groupProjects.map(project => ({
                    projectId: project.id,
                    date: groupDate,
                    period: projectTimePeriods[project.id] !== false ? "AM" : "PM" // Default to AM if not set
                  }));

                  try {
                    // First, save the schedule
                    const response = await fetch(`${API_URL}/api/projects/update-site-visit-scheduled`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        projects: projectUpdates
                      }),
                    });

                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}));
                      throw new Error(errorData.error || "Failed to save site visit schedule");
                    }

                    // Now fetch the "SITE VISIT BOOKING" template
                    const templatesResponse = await fetch(`${API_URL}/api/email-templates`);
                    if (!templatesResponse.ok) {
                      throw new Error("Failed to fetch email templates");
                    }
                    const templates = await templatesResponse.json();
                    const template = templates.find(t => t.name === "SITE VISIT BOOKING");
                    
                    if (!template) {
                      alert("Email template 'SITE VISIT BOOKING' not found. Please create it in Settings → Email Settings.");
                      return;
                    }

                    // Refresh projects to get updated scheduled dates
                    await fetchProjects();

                    // Get updated projects with scheduled dates
                    let updatedProjects = projects.filter(p => groupProjects.some(gp => gp.id === p.id));
                    
                    if (updatedProjects.length === 0) {
                      alert("No projects found in group");
                      return;
                    }

                    // Update each project with the schedule data we just saved
                    // This ensures we use the latest date and period, not stale data
                    updatedProjects = updatedProjects.map(project => {
                      const update = projectUpdates.find(u => u.projectId === project.id);
                      if (update) {
                        return {
                          ...project,
                          site_visit_scheduled_date: update.date,
                          site_visit_scheduled_period: update.period
                        };
                      }
                      return project;
                    });

                    // Process each project separately and open mailto for each
                    for (const project of updatedProjects) {
                      // Collect active client emails and names for this specific project
                      const projectToEmails = new Set();
                      const projectActiveClientNames = [];
                      
                      if (project.client1_email && project.client1_active === 'true') {
                        projectToEmails.add(project.client1_email);
                        if (project.client1_name) {
                          projectActiveClientNames.push(project.client1_name);
                        }
                      }
                      if (project.client2_email && project.client2_active === 'true') {
                        projectToEmails.add(project.client2_email);
                        if (project.client2_name) {
                          projectActiveClientNames.push(project.client2_name);
                        }
                      }
                      if (project.client3_email && project.client3_active === 'true') {
                        projectToEmails.add(project.client3_email);
                        if (project.client3_name) {
                          projectActiveClientNames.push(project.client3_name);
                        }
                      }
                      // Also include main client email if exists
                      if (project.email) {
                        projectToEmails.add(project.email);
                      }

                      if (projectToEmails.size === 0) {
                        console.warn(`No active client email addresses found for project: ${project.name || project.id}`);
                        continue; // Skip this project if no emails
                      }

                      // Extract first names and format them for this project
                      const firstNames = projectActiveClientNames
                        .map(name => name.trim().split(/\s+/)[0]) // Get first name only
                        .filter(name => name.length > 0); // Remove empty names
                      
                      let formattedClientNames = "";
                      if (firstNames.length === 1) {
                        formattedClientNames = `${firstNames[0]},`;
                      } else if (firstNames.length === 2) {
                        formattedClientNames = `${firstNames[0]} and ${firstNames[1]},`;
                      } else if (firstNames.length > 2) {
                        const last = firstNames.pop();
                        formattedClientNames = `${firstNames.join(", ")} and ${last},`;
                      }

                      // Create a modified project object with formatted client names for this project
                      const projectForTokens = {
                        ...project,
                        client_name: formattedClientNames || project.client_name || ""
                      };

                      // Replace tokens in template using the helper function for this specific project
                      const subject = await replaceTokens(template.subject || "", projectForTokens);
                      const body = await replaceTokens(template.body || "", projectForTokens);

                      // Create mailto link for this project
                      const toAddresses = Array.from(projectToEmails).join(",");
                      const mailtoLink = `mailto:${toAddresses}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                      
                      // Open mailto link (with a delay between each to allow email client to open)
                      // Use setTimeout to space out the mailto links so each one opens properly
                      setTimeout(() => {
                        const link = document.createElement('a');
                        link.href = mailtoLink;
                        link.click();
                      }, updatedProjects.indexOf(project) * 500);
                    }
                    
                  } catch (error) {
                    console.error("Error processing email:", error);
                    alert(error.message || "Failed to process email");
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
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
              >
                Send Email to Clients
              </button>
            </div>
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}
          {!loading && !error && groupProjects.length === 0 && (
            <p style={{ color: "#32323399" }}>No projects in this group.</p>
          )}
          {!loading && !error && groupProjects.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: "12px", flex: 1, overflow: "hidden", minWidth: 0 }}>
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
                {groupProjects.map((project) => {
                  const suburb = project.suburb || "Unknown Suburb";
                  const street = project.street || "No address";
                  const notes = project.site_visit_notes?.trim();
                  // Use group color (green) for background
                  const cardBackground = group ? group.color : MONUMENT;
                  // Use white text since background is green
                  const textColor = WHITE;
                  const secondaryTextColor = "#ffffffcc";

                  return (
                    <div
                      key={project.id}
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "100px",
                      }}
                    >
                      <Link
                        to={`/project/${project.id}`}
                        style={{
                          textDecoration: "none",
                          display: "block",
                          height: "100%",
                        }}
                      >
                        <div
                          style={{
                            background: cardBackground,
                            borderRadius: "8px",
                            width: "100%",
                            height: "100%",
                            color: textColor,
                            cursor: "pointer",
                            transition: "opacity 0.2s",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            position: "relative",
                            overflow: "hidden",
                            boxSizing: "border-box",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                        >
                          {/* On Hold Diagonal Band */}
                          {project.status === "On Hold" && (
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%) rotate(-45deg)",
                                width: "280px",
                                height: "40px",
                                background: "#0066cc",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 10,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                              }}
                            >
                              <span
                                style={{
                                  color: WHITE,
                                  fontWeight: 700,
                                  fontSize: "1.1rem",
                                  letterSpacing: "2px",
                                  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                                }}
                              >
                                ON HOLD
                              </span>
                            </div>
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
                              zIndex: project.status === "On Hold" ? 1 : "auto",
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
                      </Link>
                    </div>
                  );
                })}
              </div>

              {/* Column 2: AM/PM Selectors for each project */}
              <div
                style={{
                  gridColumn: "2",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  overflowY: "auto",
                  alignContent: "flex-start",
                  minWidth: 0,
                }}
              >
                {groupProjects.map((project) => {
                  const isAM = projectTimePeriods[project.id] !== false; // Default to AM (true) if not set
                  
                  return (
                    <div
                      key={project.id}
                      style={{
                        height: "100px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          background: WHITE,
                          padding: "4px",
                          borderRadius: "8px",
                          border: `2px solid ${MONUMENT}`,
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectTimePeriods(prev => ({
                              ...prev,
                              [project.id]: true
                            }));
                          }}
                          style={{
                            padding: "6px 12px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            color: isAM ? WHITE : MONUMENT,
                            background: isAM ? MONUMENT : "transparent",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          AM
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectTimePeriods(prev => ({
                              ...prev,
                              [project.id]: false
                            }));
                          }}
                          style={{
                            padding: "6px 12px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            color: !isAM ? WHITE : MONUMENT,
                            background: !isAM ? MONUMENT : "transparent",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                        >
                          PM
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Column 3: Single Date Selector for the group */}
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
                  <input
                    type="date"
                    value={groupDate}
                    onChange={(e) => {
                      setGroupDate(e.target.value);
                    }}
                    style={{
                      padding: "8px 12px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      background: WHITE,
                      border: `2px solid ${MONUMENT}`,
                      borderRadius: "8px",
                      cursor: "pointer",
                      width: "100%",
                      maxWidth: "200px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Columns 4-7: Empty (reserved for future use) */}
              <div style={{ gridColumn: "4 / 8" }}></div>

              {/* Column 8: Empty (reserved for future use) */}
              <div
                style={{
                  gridColumn: "8",
                }}
              ></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
