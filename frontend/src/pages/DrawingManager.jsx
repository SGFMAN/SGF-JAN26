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
      // Filter for "Design Phase" projects only, excluding "Home Office / Studio" classification and on_hold projects
      // Match the exact logic from HomePage.jsx
      const designPhaseProjects = data.filter((project) => {
        // Only accept "Design Phase" status
        if (project.status !== "Design Phase") {
          return false;
        }
        
        // Exclude "Home Office / Studio" classification
        if (project.classification === "Home Office / Studio") {
          return false;
        }
        
        // Exclude if on_hold is explicitly true
        // Accept: true (boolean), 'true' (string), 1 (number), '1' (string)
        // Include everything else: false, 'false', null, undefined, 0, '0', etc.
        const onHoldValue = project.on_hold;
        const isOnHold = onHoldValue === true || 
                         onHoldValue === 'true' || 
                         onHoldValue === 1 || 
                         onHoldValue === '1';
        
        return !isOnHold;
      });
      // Sort alphabetically by suburb, then street
      const sortedProjects = designPhaseProjects.sort((a, b) => {
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

      // Refresh projects list
      await fetchProjects();
    } catch (error) {
      console.error("Error toggling concept approval:", error);
      alert("Failed to update concept approval");
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

      // Refresh projects list
      await fetchProjects();
    } catch (error) {
      console.error("Error toggling working drawings approval:", error);
      alert("Failed to update working drawings approval");
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
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update drawings holder");
      }

      // Refresh projects list
      await fetchProjects();
    } catch (error) {
      console.error("Error toggling drawings holder:", error);
      alert("Failed to update who has the project");
    }
  }

  // Handle draftsperson change
  async function handleDraftspersonChange(project, newDraftspersonId) {
    if (!project.id) return;

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
    const newDraftsperson = newDraftspersonId === "" ? null : newDraftspersonId;

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

      // Refresh projects list
      await fetchProjects();
    } catch (error) {
      console.error("Error updating draftsperson:", error);
      alert("Failed to update draftsperson");
    }
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
        <img
          src={logo}
          alt="SGF Logo"
          style={{
            width: "120px",
            height: "auto",
            position: "absolute",
            left: "40px",
          }}
        />
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
                const filteredProjects = stateFilter !== "All" 
                  ? projects.filter(project => {
                      const projectState = (project.state || "").toUpperCase();
                      return projectState === stateFilter.toUpperCase();
                    })
                  : projects;
                
                if (filteredProjects.length === 0) {
                  return (
                    <p style={{ color: "#32323399" }}>No Design Phase projects found.</p>
                  );
                }
                
                // Helper function to get holder display text
                function getHolderDisplay(project) {
                  const holder = project.drawings_holder || "design team";
                  if (holder === "sales team") return "Sales Team";
                  if (holder === "client") return "Client";
                  return "Design Team";
                }
                
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.5fr 1.5fr", gap: "16px" }}>
                    {/* Header Row */}
                    <div
                      style={{
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Project
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Concept
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Working Drawings
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Who Has Project
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Draftsperson
                    </div>
                    <div
                      style={{
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        textAlign: "center",
                        position: "sticky",
                        top: "0",
                        zIndex: 10,
                      }}
                    >
                      Contact 1 Email
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
                              padding: "12px 16px",
                              background: WHITE,
                              borderRadius: "8px",
                              textDecoration: "none",
                              color: MONUMENT,
                              fontSize: "0.9rem",
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
                              padding: "12px 16px",
                              background: conceptApproved ? "#33cc33" : "#cc3333",
                              color: WHITE,
                              borderRadius: "8px",
                              fontSize: "0.9rem",
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
                              padding: "12px 16px",
                              background: workingDrawingsApproved ? "#33cc33" : "#cc3333",
                              color: WHITE,
                              borderRadius: "8px",
                              fontSize: "0.9rem",
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
                          
                          {/* Column 4: Who Has Project */}
                          <div
                            key={`${project.id}-holder`}
                            onClick={() => handleToggleHolder(project)}
                            style={{
                              padding: "12px 16px",
                              background: WHITE,
                              color: MONUMENT,
                              borderRadius: "8px",
                              fontSize: "0.9rem",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f0f0f0";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = WHITE;
                            }}
                          >
                            {holderDisplay}
                          </div>
                          
                          {/* Column 5: Draftsperson */}
                          <select
                            key={`${project.id}-draftsperson`}
                            value={project.draftsperson || ""}
                            onChange={(e) => handleDraftspersonChange(project, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: "12px 16px",
                              background: WHITE,
                              color: MONUMENT,
                              borderRadius: "8px",
                              fontSize: "0.9rem",
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
                          
                          {/* Column 6: Contact 1 Email */}
                          <div
                            key={`${project.id}-email`}
                            style={{
                              padding: "12px 16px",
                              background: WHITE,
                              color: MONUMENT,
                              borderRadius: "8px",
                              fontSize: "0.9rem",
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {project.client1_email || "No email"}
                            </span>
                            {project.client1_email && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyEmail(project.client1_email);
                                }}
                                style={{
                                  padding: "4px 8px",
                                  background: MONUMENT,
                                  color: WHITE,
                                  border: "none",
                                  borderRadius: "4px",
                                  fontSize: "0.75rem",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "#1a1a1a";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = MONUMENT;
                                }}
                              >
                                Copy
                              </button>
                            )}
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
    </div>
  );
}
