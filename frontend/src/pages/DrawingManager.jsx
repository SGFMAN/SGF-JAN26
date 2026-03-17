import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

export default function DrawingManager() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [draftspersonUsers, setDraftspersonUsers] = useState([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedProjectForReminder, setSelectedProjectForReminder] = useState(null);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("ben@superiorgrannyflats.com.au");
  const [emailFrom, setEmailFrom] = useState("info@superiorgrannyflats.com.au");
  const [emailSubject, setEmailSubject] = useState("Drawing Manager Projects List");
  const [emailHtmlBody, setEmailHtmlBody] = useState("");

  useEffect(() => {
    fetchProjects();
    fetchDraftspersons();
  }, []);

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

  // Get draftsperson name by ID
  function getDraftspersonName(draftspersonId) {
    if (!draftspersonId) return null;
    const draftsperson = draftspersonUsers.find(u => u.id === parseInt(draftspersonId) || u.id === draftspersonId);
    return draftsperson ? draftsperson.name : null;
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

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      // Filter for In Design projects (Design Phase or "In Design"), excluding Home Office/Studio and on_hold
      const isInDesignStatus = (s) => s === "Design Phase" || s === "In Design";
      const designPhaseProjects = data.filter((project) => {
        if (project.status === "Hotlist" || project.status === "Cancelled") return false;
        if (!isInDesignStatus(project.status)) return false;
        if (project.classification === "Home Office / Studio") return false;
        const onHoldValue = project.on_hold;
        const isOnHold = onHoldValue === true || onHoldValue === 'true' || onHoldValue === 1 || onHoldValue === '1';
        return !isOnHold;
      });
      // Sort by concept/working drawings status first, then alphabetically by suburb, then street
      const sortedProjects = designPhaseProjects.sort((a, b) => {
        // Get approval status for both projects
        const conceptA = isConceptApproved(a);
        const workingA = isWorkingDrawingsApproved(a);
        const conceptB = isConceptApproved(b);
        const workingB = isWorkingDrawingsApproved(b);
        
        // Calculate priority: 0 = neither, 1 = concept only, 2 = both
        const priorityA = (!conceptA && !workingA) ? 0 : (conceptA && !workingA) ? 1 : 2;
        const priorityB = (!conceptB && !workingB) ? 0 : (conceptB && !workingB) ? 1 : 2;
        
        // Sort by priority first
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        // If same priority, sort alphabetically by suburb, then street
        const suburbA = (a.suburb || "").toLowerCase();
        const suburbB = (b.suburb || "").toLowerCase();
        if (suburbA !== suburbB) {
          return suburbA.localeCompare(suburbB);
        }
        const streetA = (a.street || "").toLowerCase();
        const streetB = (b.street || "").toLowerCase();
        return streetA.localeCompare(streetB);
      });
      setProjects(sortedProjects);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Helper function to check if concept is approved
  function isConceptApproved(project) {
    if (!project.drawings_history) return false;
    try {
      const history = typeof project.drawings_history === 'string' 
        ? JSON.parse(project.drawings_history) 
        : project.drawings_history;
      return Array.isArray(history) && history.some(entry => entry.conceptApproved === true);
    } catch (e) {
      return false;
    }
  }

  // Helper function to check if working drawings are approved
  function isWorkingDrawingsApproved(project) {
    if (!project.drawings_history) return false;
    try {
      const history = typeof project.drawings_history === 'string' 
        ? JSON.parse(project.drawings_history) 
        : project.drawings_history;
      return Array.isArray(history) && history.some(entry => entry.workingDrawingsApproved === true);
    } catch (e) {
      return false;
    }
  }

  // Toggle concept approval
  async function handleToggleConcept(project) {
    if (!project.id) return;
    
    const currentlyApproved = isConceptApproved(project);
    let drawingsHistory = [];
    
    try {
      const historyValue = project.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' 
          ? JSON.parse(historyValue) 
          : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
      drawingsHistory = [];
    }

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
    let newDrawingsStatus = project.drawings_status || "Not Assigned";

    if (currentlyApproved) {
      // Unapprove: remove conceptApproved flag from all entries
      drawingsHistory = drawingsHistory.map(entry => ({
        ...entry,
        conceptApproved: false
      }));
      newDrawingsStatus = "Concept Stage";
    } else {
      // Approve: mark the last entry as concept approved
      if (drawingsHistory.length > 0) {
        const lastIndex = drawingsHistory.length - 1;
        drawingsHistory[lastIndex] = {
          ...drawingsHistory[lastIndex],
          conceptApproved: true
        };
      } else {
        // If no history, create a new entry
        drawingsHistory.push({
          name: "Concept Drawings",
          date: new Date().toISOString().split('T')[0],
          conceptApproved: true
        });
      }
      newDrawingsStatus = "Working Drawing Stage";
    }

    // Optimistically update local state immediately
    setProjects(prevProjects =>
      prevProjects.map(p =>
        p.id === project.id
          ? {
              ...p,
              drawings_status: newDrawingsStatus,
              drawings_history: JSON.stringify(drawingsHistory),
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
          drawings_status: newDrawingsStatus,
          drawings_history: JSON.stringify(drawingsHistory),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update concept approval");
      }

      // Success - local state already updated, no need to refetch
      console.log("Concept approval updated successfully");
    } catch (error) {
      console.error("Error toggling concept approval:", error);
      alert("Failed to update concept approval");
      // Revert on error by refetching
      await fetchProjects();
    }
  }

  // Toggle working drawings approval
  async function handleToggleWorkingDrawings(project) {
    if (!project.id) return;
    
    const currentlyApproved = isWorkingDrawingsApproved(project);
    let drawingsHistory = [];
    
    try {
      const historyValue = project.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' 
          ? JSON.parse(historyValue) 
          : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
      drawingsHistory = [];
    }

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
    let newDrawingsStatus = project.drawings_status || "Not Assigned";

    if (currentlyApproved) {
      // Unapprove: remove workingDrawingsApproved flag from all entries
      drawingsHistory = drawingsHistory.map(entry => ({
        ...entry,
        workingDrawingsApproved: false
      }));
      newDrawingsStatus = "Working Drawing Stage";
    } else {
      // Approve: mark the last entry as working drawings approved
      if (drawingsHistory.length > 0) {
        const lastIndex = drawingsHistory.length - 1;
        drawingsHistory[lastIndex] = {
          ...drawingsHistory[lastIndex],
          workingDrawingsApproved: true
        };
      } else {
        // If no history, create a new entry
        drawingsHistory.push({
          name: "Working Drawings",
          date: new Date().toISOString().split('T')[0],
          workingDrawingsApproved: true
        });
      }
      newDrawingsStatus = "Drawings Complete";
    }

    // Optimistically update local state immediately
    setProjects(prevProjects =>
      prevProjects.map(p =>
        p.id === project.id
          ? {
              ...p,
              drawings_status: newDrawingsStatus,
              drawings_history: JSON.stringify(drawingsHistory),
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
          drawings_status: newDrawingsStatus,
          drawings_history: JSON.stringify(drawingsHistory),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update working drawings approval");
      }

      // Success - local state already updated, no need to refetch
      console.log("Working drawings approval updated successfully");
    } catch (error) {
      console.error("Error toggling working drawings approval:", error);
      alert("Failed to update working drawings approval");
      // Revert on error by refetching
      await fetchProjects();
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

  // Handle draftsperson change
  async function handleDraftspersonChange(project, newDraftspersonId) {
    if (!project.id) return;

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
    const newDraftsperson = newDraftspersonId === "" ? null : newDraftspersonId;

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
        case "concept":
          compareA = isConceptApproved(a) ? 1 : 0;
          compareB = isConceptApproved(b) ? 1 : 0;
          break;
        case "working":
          compareA = isWorkingDrawingsApproved(a) ? 1 : 0;
          compareB = isWorkingDrawingsApproved(b) ? 1 : 0;
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
              color: WHITE,
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
          {/* State Filter Buttons */}
          <button
            onClick={() => {
              const newFilter = "VIC";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "VIC" ? "#4D93D9" : WHITE,
              color: stateFilter === "VIC" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "VIC" ? "#4D93D9" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = "#f0f0f0";
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            VIC Only
          </button>
          <button
            onClick={() => {
              const newFilter = "QLD";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "QLD" ? "#D54358" : WHITE,
              color: stateFilter === "QLD" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "QLD" ? "#D54358" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = "#f0f0f0";
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            QLD Only
          </button>
          <button
            onClick={() => {
              const newFilter = "All";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "All" ? MONUMENT : WHITE,
              color: stateFilter === "All" ? WHITE : MONUMENT,
              border: `2px solid ${MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = "#f0f0f0";
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            All
          </button>
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
            Site Visit Manager
          </Link>
          <Link
            to="/managers/contract-manager"
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
            Contract Manager
          </Link>
          <Link
            to="/managers/colour-manager"
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
            Colour Manager
          </Link>
          <Link
            to="/managers/status-manager"
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
              outline: `2px solid ${MONUMENT}`,
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
                    // Get the filtered projects (respecting state filter and sorting)
                    let filteredProjectsForEmail = stateFilter !== "All" 
                      ? projects.filter(project => {
                          const projectState = (project.state || "").toUpperCase();
                          return projectState === stateFilter.toUpperCase();
                        })
                      : projects;
                    
                    // Apply sorting if a column is selected
                    if (sortColumn) {
                      filteredProjectsForEmail = sortProjects(filteredProjectsForEmail, sortColumn, sortDirection);
                    }
                    
                    // Color constants
                    const COLOR_RED = "#cc3333";
                    const COLOR_GREEN = "#33cc33";
                    
                    // Helper function to create project row HTML
                    const createProjectRow = (project) => {
                      const suburb = project.suburb || "";
                      const street = project.street || "";
                      // Format project name
                      let projectNameDisplay = "";
                      if (suburb && street) {
                        projectNameDisplay = `${suburb}<br>${street}`;
                      } else if (suburb) {
                        projectNameDisplay = suburb;
                      } else if (street) {
                        projectNameDisplay = street;
                      } else {
                        projectNameDisplay = project.name || "Unknown Project";
                      }
                      
                      // Get approval statuses
                      const conceptApproved = isConceptApproved(project);
                      const workingApproved = isWorkingDrawingsApproved(project);
                      
                      // Get status colors
                      const conceptColor = conceptApproved ? COLOR_GREEN : COLOR_RED;
                      const workingColor = workingApproved ? COLOR_GREEN : COLOR_RED;
                      
                      // Check if deposit is paid (not partial)
                      const needsDeposit = isPartialDeposit(project);
                      const depositColor = needsDeposit ? COLOR_RED : COLOR_GREEN;
                      
                      // Get site visit status
                      const siteVisitRaw = project.site_visit_status || "";
                      const siteVisitStatus = (siteVisitRaw === "Complete" || siteVisitRaw === "") ? (siteVisitRaw || "NOT DONE") : siteVisitRaw;
                      const siteVisitColor = siteVisitStatus === "Complete" ? COLOR_GREEN : COLOR_RED;
                      
                      // Get contract status
                      const contractRaw = project.contract_status || "";
                      const contractStatus = contractRaw || "Not Sent";
                      const contractColor = contractStatus === "Sent" ? COLOR_GREEN : COLOR_RED;
                      
                      // Get building permit status
                      const buildingPermitStatus = project.building_permit_status || "-";
                      const buildingPermitColor = buildingPermitStatus === "Complete" ? COLOR_GREEN : COLOR_RED;
                      
                      // Helper function to create colored rectangle
                      const createStatusRect = (label, color) => {
                        return `<td style="padding: 2px; width: 80px;">
                          <div style="width: 100%; height: 24px; border-radius: 4px; background: ${color}; border: 1px solid white; box-sizing: border-box; text-align: center; color: white; font-size: 10px; font-weight: 500; line-height: 24px; vertical-align: middle;">
                            ${label}
                          </div>
                        </td>`;
                      };
                      
                      return `<tr style="background: white;">
  <td style="padding: 8px 12px; vertical-align: middle; font-weight: 500; color: #323233; font-size: 14px; width: 200px; border-radius: 8px 0 0 8px;">${projectNameDisplay}</td>
  ${createStatusRect("CONCEPT", conceptColor)}
  ${createStatusRect("WD", workingColor)}
  ${createStatusRect("DEPOSIT", depositColor)}
  ${createStatusRect("SITE VISIT", siteVisitColor)}
  ${createStatusRect("CONTRACT", contractColor)}
  ${createStatusRect("BUILDING PERMIT", buildingPermitColor)}
</tr>`;
                    };
                    
                    // Group projects by drawings_holder
                    const groupedProjects = {
                      client: [],
                      "sales team": [],
                      "design team": {}
                    };
                    
                    filteredProjectsForEmail.forEach((project) => {
                      const drawingsHolder = (project.drawings_holder || "design team").toLowerCase();
                      
                      if (drawingsHolder === "client") {
                        groupedProjects.client.push(project);
                      } else if (drawingsHolder === "sales team") {
                        groupedProjects["sales team"].push(project);
                      } else {
                        // Design team - sub-group by draftsperson
                        const draftspersonId = project.draftsperson || "unassigned";
                        if (!groupedProjects["design team"][draftspersonId]) {
                          groupedProjects["design team"][draftspersonId] = [];
                        }
                        groupedProjects["design team"][draftspersonId].push(project);
                      }
                    });
                    
                    // Build HTML sections for each group
                    let htmlSections = [];
                    
                    // 1. With Client
                    if (groupedProjects.client.length > 0) {
                      const clientRows = groupedProjects.client.map(createProjectRow).join("");
                      htmlSections.push(`
                        <div style="margin-bottom: 30px;">
                          <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #323233; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">With Client (${groupedProjects.client.length})</h3>
                          <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
                            <tbody>${clientRows}</tbody>
                          </table>
                        </div>
                      `);
                    }
                    
                    // 2. With Sales Team
                    if (groupedProjects["sales team"].length > 0) {
                      const salesRows = groupedProjects["sales team"].map(createProjectRow).join("");
                      htmlSections.push(`
                        <div style="margin-bottom: 30px;">
                          <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #323233; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">With Sales Team (${groupedProjects["sales team"].length})</h3>
                          <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
                            <tbody>${salesRows}</tbody>
                          </table>
                        </div>
                      `);
                    }
                    
                    // 3. With Design Team (sub-grouped by draftsperson)
                    const designTeamGroups = Object.keys(groupedProjects["design team"]);
                    if (designTeamGroups.length > 0) {
                      let designTeamSections = [];
                      
                      // Sort draftspersons by name (unassigned first, then alphabetically)
                      const sortedDraftspersonIds = designTeamGroups.sort((a, b) => {
                        if (a === "unassigned") return -1;
                        if (b === "unassigned") return 1;
                        const nameA = getDraftspersonName(a) || "";
                        const nameB = getDraftspersonName(b) || "";
                        return nameA.localeCompare(nameB);
                      });
                      
                      sortedDraftspersonIds.forEach((draftspersonId) => {
                        const projects = groupedProjects["design team"][draftspersonId];
                        const draftspersonName = draftspersonId === "unassigned" 
                          ? "Unassigned" 
                          : (getDraftspersonName(draftspersonId) || "Unknown");
                        const projectRows = projects.map(createProjectRow).join("");
                        
                        designTeamSections.push(`
                          <div style="margin-bottom: 20px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #323233; padding: 6px 10px; background: #e8e8e8; border-radius: 4px;">${draftspersonName} (${projects.length})</h4>
                            <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
                              <tbody>${projectRows}</tbody>
                            </table>
                          </div>
                        `);
                      });
                      
                      htmlSections.push(`
                        <div style="margin-bottom: 30px;">
                          <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #323233; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">With Design Team</h3>
                          ${designTeamSections.join("")}
                        </div>
                      `);
                    }
                    
                    const htmlBody = `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: bold; color: #323233;">Drawing Manager Projects List</h2>
  <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px; margin-bottom: 20px;">
    <thead>
      <tr>
        <th style="padding: 8px 12px; text-align: left; background: #323233; color: white; font-weight: 600; font-size: 12px; border-radius: 8px 0 0 0;">Project</th>
        <th style="padding: 2px; text-align: center; background: #323233; color: white; font-weight: 600; font-size: 10px;">CONCEPT</th>
        <th style="padding: 2px; text-align: center; background: #323233; color: white; font-weight: 600; font-size: 10px;">WD</th>
        <th style="padding: 2px; text-align: center; background: #323233; color: white; font-weight: 600; font-size: 10px;">DEPOSIT</th>
        <th style="padding: 2px; text-align: center; background: #323233; color: white; font-weight: 600; font-size: 10px;">SITE VISIT</th>
        <th style="padding: 2px; text-align: center; background: #323233; color: white; font-weight: 600; font-size: 10px;">CONTRACT</th>
        <th style="padding: 2px; text-align: center; background: #323233; color: white; font-weight: 600; font-size: 10px; border-radius: 0 8px 0 0;">BUILDING PERMIT</th>
      </tr>
    </thead>
  </table>
  ${htmlSections.join("")}
  <p style="margin: 20px 0 0 0; font-weight: bold; color: #323233;">Total: ${filteredProjectsForEmail.length} projects</p>
</div>`;
                    
                    setEmailHtmlBody(htmlBody);
                    setShowEmailModal(true);
                  }}
                  style={{
                    padding: "10px 20px",
                    background: "#4D93D9",
                    color: WHITE,
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

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {(() => {
                // Filter projects by state if specified
                let filteredProjects = stateFilter !== "All" 
                  ? projects.filter(project => {
                      const projectState = (project.state || "").toUpperCase();
                      return projectState === stateFilter.toUpperCase();
                    })
                  : projects;
                
                // Apply sorting if a column is selected, otherwise use default concept/working drawings sort
                if (sortColumn) {
                  filteredProjects = sortProjects(filteredProjects, sortColumn, sortDirection);
                } else {
                  // Default sort: by concept/working drawings status, then alphabetically
                  filteredProjects = filteredProjects.sort((a, b) => {
                    // Get approval status for both projects
                    const conceptA = isConceptApproved(a);
                    const workingA = isWorkingDrawingsApproved(a);
                    const conceptB = isConceptApproved(b);
                    const workingB = isWorkingDrawingsApproved(b);
                    
                    // Calculate priority: 0 = neither, 1 = concept only, 2 = both
                    const priorityA = (!conceptA && !workingA) ? 0 : (conceptA && !workingA) ? 1 : 2;
                    const priorityB = (!conceptB && !workingB) ? 0 : (conceptB && !workingB) ? 1 : 2;
                    
                    // Sort by priority first
                    if (priorityA !== priorityB) {
                      return priorityA - priorityB;
                    }
                    
                    // If same priority, sort alphabetically by suburb, then street
                    const suburbA = (a.suburb || "").toLowerCase();
                    const suburbB = (b.suburb || "").toLowerCase();
                    if (suburbA !== suburbB) {
                      return suburbA.localeCompare(suburbB);
                    }
                    const streetA = (a.street || "").toLowerCase();
                    const streetB = (b.street || "").toLowerCase();
                    return streetA.localeCompare(streetB);
                  });
                }
                
                if (filteredProjects.length === 0) {
                  return (
                    <p style={{ color: "#32323399" }}>No Design Phase projects found.</p>
                  );
                }
                
                // Helper function to get holder display text and days
                function getHolderDisplay(project) {
                  const holder = project.drawings_holder || "design team";
                  let displayText = "Design Team";
                  if (holder === "sales team") displayText = "Sales Team";
                  if (holder === "client") displayText = "Client";
                  
                  // Calculate days
                  let daysText = "";
                  let daysNum = 0;
                  if (project.drawings_holder_date) {
                    const holderDate = new Date(project.drawings_holder_date);
                    const today = new Date();
                    const diffTime = Math.abs(today - holderDate);
                    daysNum = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    daysText = `${daysNum} day${daysNum !== 1 ? 's' : ''}`;
                  }
                  
                  return { text: displayText, days: daysText, daysNum: daysNum, holder: holder };
                }
                
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr 1fr 0.8fr", gap: "12px" }}>
                    {/* Header Row */}
                    <div
                      onClick={() => handleSort("project")}
                      style={{
                        padding: "8px 12px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Project {sortColumn === "project" && (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleSort("concept")}
                      style={{
                        padding: "8px 12px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Concept {sortColumn === "concept" && (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleSort("working")}
                      style={{
                        padding: "8px 12px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Working Drawings {sortColumn === "working" && (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleSort("draftsperson")}
                      style={{
                        padding: "8px 12px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Draftsperson {sortColumn === "draftsperson" && (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      onClick={() => handleSort("drawingsWith")}
                      style={{
                        padding: "8px 12px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                    >
                      Drawings With {sortColumn === "drawingsWith" && (sortDirection === "asc" ? "↑" : "↓")}
                    </div>
                    <div
                      style={{
                        padding: "8px 12px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Reminder
                    </div>
                    
                    {/* Project Rows */}
                    {filteredProjects.map((project) => {
                      const suburb = project.suburb || "";
                      const street = project.street || "";
                      const projectName = suburb && street 
                        ? `${suburb} - ${street}`
                        : suburb || street || "Unknown Project";
                      const conceptApproved = isConceptApproved(project);
                      const workingDrawingsApproved = isWorkingDrawingsApproved(project);
                      const holderDisplay = getHolderDisplay(project);
                      const draftspersonName = getDraftspersonName(project.draftsperson);
                      
                      return (
                        <>
                          {/* Column 1: Project Name */}
                          <Link
                            key={`${project.id}-name`}
                            to={`/project/${project.id}`}
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
                            {isPartialDeposit(project) && (
                              <span
                                style={{
                                  padding: "4px 8px",
                                  background: "#ff8800",
                                  color: WHITE,
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  flexShrink: 0,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                NEEDS DEPOSIT
                              </span>
                            )}
                          </Link>
                          
                          {/* Column 2: Concept Rectangle */}
                          <div
                            key={`${project.id}-concept`}
                            onClick={() => handleToggleConcept(project)}
                            style={{
                              padding: "8px 12px",
                              background: conceptApproved ? "#33cc33" : "#cc3333",
                              color: WHITE,
                              borderRadius: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                              cursor: "pointer",
                              transition: "opacity 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = "0.8";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = "1";
                            }}
                          >
                            Concept
                          </div>
                          
                          {/* Column 3: Working Drawings Rectangle */}
                          <div
                            key={`${project.id}-working`}
                            onClick={() => handleToggleWorkingDrawings(project)}
                            style={{
                              padding: "8px 12px",
                              background: workingDrawingsApproved ? "#33cc33" : "#cc3333",
                              color: WHITE,
                              borderRadius: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                              cursor: "pointer",
                              transition: "opacity 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = "0.8";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = "1";
                            }}
                          >
                            Working Drawings
                          </div>
                          
                          {/* Column 4: Draftsperson */}
                          <select
                            key={`${project.id}-draftsperson`}
                            value={project.draftsperson || ""}
                            onChange={(e) => handleDraftspersonChange(project, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
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
                            <option value="">None</option>
                            {draftspersonUsers.map((draftsperson) => (
                              <option key={draftsperson.id} value={draftsperson.id}>
                                {draftsperson.name}
                              </option>
                            ))}
                          </select>
                          
                          {/* Column 5: Drawings With */}
                          <div
                            key={`${project.id}-holder`}
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
                              e.currentTarget.style.background = "#f0f0f0";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = WHITE;
                            }}
                          >
                            <span>{holderDisplay.text}</span>
                            {holderDisplay.days && (
                              <span style={{ color: "#666" }}>
                                - {holderDisplay.days}
                              </span>
                            )}
                          </div>
                          
                          {/* Column 6: Email Contact */}
                          <div
                            key={`${project.id}-email`}
                            style={{
                              padding: "8px 12px",
                              background: WHITE,
                              borderRadius: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                color: MONUMENT,
                              }}
                            >
                              {(() => {
                                const mainEmail = getMainEmailContact(project);
                                return mainEmail || "No email";
                              })()}
                            </span>
                            {(() => {
                              const mainEmail = getMainEmailContact(project);
                              if (!mainEmail) return null;
                              return (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyEmail(mainEmail);
                                  }}
                                  style={{
                                    padding: "4px 8px",
                                    background: "#4D93D9",
                                    color: WHITE,
                                    border: "none",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    transition: "background 0.2s",
                                    flexShrink: 0,
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#3d7bc9";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "#4D93D9";
                                  }}
                                  title="Copy email to clipboard"
                                >
                                  Copy
                                </button>
                              );
                            })()}
                          </div>
                        </>
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
          onClick={() => {
            setShowEmailModal(false);
            setEmailTo("ben@superiorgrannyflats.com.au");
            setEmailFrom("info@superiorgrannyflats.com.au");
            setEmailSubject("Drawing Manager Projects List");
            setEmailHtmlBody("");
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
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: "20px", color: MONUMENT }}>
              Email Projects List
            </h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "20px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
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
              <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Preview
              </label>
              <div
                style={{
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  padding: "16px",
                  background: WHITE,
                  maxHeight: "400px",
                  overflow: "auto",
                }}
                dangerouslySetInnerHTML={{ __html: emailHtmlBody }}
              />
            </div>
            
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowEmailModal(false);
                  setEmailTo("ben@superiorgrannyflats.com.au");
                  setEmailFrom("info@superiorgrannyflats.com.au");
                  setEmailSubject("Drawing Manager Projects List");
                  setEmailHtmlBody("");
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
                    const res = await fetch(`${API_URL}/api/emails/send`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        to: toAddresses,
                        from: emailFrom,
                        subject: emailSubject,
                        htmlBody: emailHtmlBody,
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      throw new Error(data.error || `Send failed (${res.status})`);
                    }
                    alert(data.message || "Email sent successfully!");
                    setShowEmailModal(false);
                    setEmailTo("ben@superiorgrannyflats.com.au");
                    setEmailFrom("info@superiorgrannyflats.com.au");
                    setEmailSubject("Drawing Manager Projects List");
                    setEmailHtmlBody("");
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
          onClick={() => {
            setShowReminderModal(false);
            setSelectedProjectForReminder(null);
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
              Reminder Email
            </h3>
            <p style={{ color: "#666", marginBottom: "24px" }}>
              Placeholder for reminder email functionality
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                onClick={() => {
                  setShowReminderModal(false);
                  setSelectedProjectForReminder(null);
                }}
                style={{
                  padding: "10px 20px",
                  background: "#ccc",
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#bbb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#ccc";
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
