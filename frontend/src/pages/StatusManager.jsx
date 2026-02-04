import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

export default function StatusManager() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customSubstatuses, setCustomSubstatuses] = useState([]); // Track custom "Other" values
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customSubstatusInput, setCustomSubstatusInput] = useState("");
  const [pendingProjectId, setPendingProjectId] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      // Filter for Design Phase projects (exclude Hotlist)
      const designPhaseProjects = data.filter((project) => project.status === "Design Phase" && project.status !== "Hotlist");
      setProjects(designPhaseProjects);
      
      // Update custom substatuses from all projects
      const customValues = new Set();
      data.forEach(project => {
        if (project.substatus && 
            project.substatus !== "Town Planning" && 
            project.substatus !== "VicSmart" && 
            project.substatus !== "Waiting" && 
            project.substatus !== "Other" &&
            project.substatus !== "") {
          customValues.add(project.substatus);
        }
      });
      setCustomSubstatuses(Array.from(customValues));
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // SubStatus options - includes custom values
  const getSubstatusOptions = () => {
    const baseOptions = ["Town Planning", "VicSmart", "Waiting", "Other"];
    // Add custom substatuses that aren't already in the base list
    const allCustom = customSubstatuses.filter(custom => !baseOptions.includes(custom));
    return [...baseOptions, ...allCustom];
  };

  // SubStatus Detail options based on SubStatus
  const SUBSTATUS_DETAIL_OPTIONS = {
    "Town Planning": [
      "Further Information Required",
      "Section 50 Advertising",
      "Planning Permit Received – Waiting Flood Consent",
      "Waiting Arborist Report",
      "Planner on Leave",
      "Waiting Hydraulic Engineer Assessment"
    ],
    "VicSmart": [
      "Waiting Hydraulic Engineer Assessment"
    ],
    "Waiting": [
      "Covenant Removal",
      "Deposit Balance",
      "Hydraulic Engineering",
      "Vince Assessment",
      "PIC",
      "Engineering",
      "Approved Working Drawings",
      "Approved Concept Drawings",
      "Signed Contract and Docs",
      "Septic Permit",
      "JCA & Soil"
    ],
    "Other": []
  };

  // Get effective value with default
  function getEffectiveValue(project, fieldName, defaultValue) {
    const value = project[fieldName];
    if (!value || value === null || value === undefined || value === "") {
      return defaultValue || "";
    }
    return value;
  }

  // Get available detail options for a given substatus
  function getDetailOptions(substatus) {
    if (!substatus || substatus === "") return [];
    return SUBSTATUS_DETAIL_OPTIONS[substatus] || [];
  }

  // Save field update
  async function saveField(projectId, fieldName, value, updateLocalState = true) {
    try {
      // Get the project to preserve other fields
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      // Update local state optimistically
      if (updateLocalState) {
        setProjects(prevProjects => 
          prevProjects.map(p => 
            p.id === projectId ? { ...p, [fieldName]: value === "" ? null : value } : p
          )
        );
      }

      const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
      
      // Build update data
      let updateData = {
        name: projectName,
        status: project.status || null,
        [fieldName]: value === "" ? null : value,
      };
      
      // If updating substatus or substatus_detail, always send both so backend can calculate combined field
      if (fieldName === "substatus" || fieldName === "substatus_detail") {
        const currentSubstatus = fieldName === "substatus" ? value : (project.substatus || "");
        const currentDetail = fieldName === "substatus_detail" ? value : (project.substatus_detail || "");
        
        // Always include both fields so backend can calculate combined
        updateData.substatus = currentSubstatus === "" ? null : currentSubstatus;
        updateData.substatus_detail = currentDetail === "" ? null : currentDetail;
        
        // Save substatus to substatuses table if it's a new custom one
        if (fieldName === "substatus" && value && 
            value !== "Town Planning" && 
            value !== "VicSmart" && 
            value !== "Waiting" && 
            value !== "Other") {
          try {
            await fetch(`${API_URL}/api/substatuses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ substatus: value, detail: null }),
            });
          } catch (e) {
            console.error("Error saving substatus to table:", e);
          }
        }
        
        // Save substatus_detail to substatuses table if both exist
        if (currentSubstatus && currentDetail && currentSubstatus !== "Other") {
          try {
            await fetch(`${API_URL}/api/substatuses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ substatus: currentSubstatus, detail: currentDetail }),
            });
          } catch (e) {
            console.error("Error saving substatus detail to table:", e);
          }
        }
      }
      
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save field:", errorData.error || response.statusText);
        // Revert on error by refetching
        await fetchProjects();
        return;
      }

      // Don't refetch on success - we've already updated local state
    } catch (error) {
      console.error("Error saving field:", error);
      // Revert on error by refetching
      await fetchProjects();
    }
  }

  // Handle substatus change
  async function handleSubStatusChange(projectId, newValue) {
    if (newValue === "Other") {
      // Show modal for custom substatus input
      setPendingProjectId(projectId);
      setCustomSubstatusInput("");
      setShowCustomModal(true);
      // Don't save "Other" yet - wait for user to enter custom value or cancel
      return;
    }
    
    await saveField(projectId, "substatus", newValue, true);
    // Clear substatus_detail if the new substatus doesn't support details
    const detailOptions = getDetailOptions(newValue);
    if (detailOptions.length === 0) {
      await saveField(projectId, "substatus_detail", "", true);
    }
    // If it's a custom value (not in standard list), add it to custom list
    if (newValue && 
        newValue !== "Town Planning" && 
        newValue !== "VicSmart" && 
        newValue !== "Waiting" && 
        newValue !== "Other" &&
        !customSubstatuses.includes(newValue)) {
      setCustomSubstatuses(prev => [...prev, newValue]);
    }
  }

  // Handle OK button in custom substatus modal
  async function handleCustomSubstatusOK() {
    const trimmedValue = customSubstatusInput.trim();
    if (trimmedValue && pendingProjectId) {
      // Save custom substatus to substatuses table
      try {
        await fetch(`${API_URL}/api/substatuses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ substatus: trimmedValue, detail: null }),
        });
      } catch (e) {
        console.error("Error saving custom substatus to table:", e);
      }
      
      // Add to custom list FIRST so it appears in the dropdown immediately
      if (!customSubstatuses.includes(trimmedValue)) {
        setCustomSubstatuses(prev => [...prev, trimmedValue]);
      }
      // Update local state immediately so the dropdown shows the new value
      setProjects(prevProjects => 
        prevProjects.map(p => 
          p.id === pendingProjectId ? { ...p, substatus: trimmedValue, substatus_detail: null } : p
        )
      );
      // Save the custom substatus
      await saveField(pendingProjectId, "substatus", trimmedValue, false); // Don't update local state again, we already did
      // Clear substatus_detail since custom values don't have details
      await saveField(pendingProjectId, "substatus_detail", "", false); // Don't update local state again
    }
    // Close modal and reset
    setShowCustomModal(false);
    setCustomSubstatusInput("");
    setPendingProjectId(null);
  }

  // Handle Cancel button in custom substatus modal
  function handleCustomSubstatusCancel() {
    // Reset the dropdown to empty by updating local state
    if (pendingProjectId) {
      setProjects(prevProjects => 
        prevProjects.map(p => 
          p.id === pendingProjectId ? { ...p, substatus: "" } : p
        )
      );
    }
    // Close modal and reset
    setShowCustomModal(false);
    setCustomSubstatusInput("");
    setPendingProjectId(null);
  }

  // Handle substatus detail change
  async function handleSubStatusDetailChange(projectId, newValue) {
    await saveField(projectId, "substatus_detail", newValue, true);
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
            Status Manager
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
            to="/managers/status-manager"
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
            Status Manager
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
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>
              Loading projects...
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#cc3333" }}>
              Error: {error}
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>
              No Design Phase projects found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Header Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr",
                  gap: "16px",
                  padding: "12px 16px",
                  background: MONUMENT,
                  color: WHITE,
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  position: "sticky",
                  top: "0px",
                  zIndex: 10,
                }}
              >
                <div>Project</div>
                <div>SubStatus</div>
                <div>SubStatus Detail</div>
              </div>
              {/* Project Rows */}
              {projects.map((project) => {
                const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "Unnamed Project";
                // Get substatus values
                const substatus = project.substatus || "";
                const substatusDetail = project.substatus_detail || "";
                const detailOptions = getDetailOptions(substatus);
                const showDetailDropdown = detailOptions.length > 0;
                const isOtherSelected = substatus === "Other";
                const isCustomSubstatus = substatus && 
                                          substatus !== "Town Planning" && 
                                          substatus !== "VicSmart" && 
                                          substatus !== "Waiting" && 
                                          substatus !== "Other";

                return (
                  <div
                    key={project.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr",
                      gap: "16px",
                      padding: "12px 16px",
                      background: WHITE,
                      borderRadius: "8px",
                      color: MONUMENT,
                      fontSize: "0.9rem",
                    }}
                  >
                    <Link
                      to={`/project/${project.id}`}
                      style={{
                        textDecoration: "none",
                        color: MONUMENT,
                        fontWeight: 500,
                        display: "block",
                      }}
                    >
                      {projectName}
                    </Link>
                    <select
                      value={substatus}
                      onChange={(e) => handleSubStatusChange(project.id, e.target.value)}
                      onBlur={(e) => {
                        // Auto-save on blur as well for better UX
                        if (e.target.value !== substatus) {
                          handleSubStatusChange(project.id, e.target.value);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        fontSize: "0.9rem",
                        color: MONUMENT,
                        background: WHITE,
                        cursor: "pointer",
                        fontWeight: 500,
                        boxSizing: "border-box",
                        textAlign: "center",
                      }}
                    >
                      <option value="">-- Select --</option>
                      {getSubstatusOptions().map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {showDetailDropdown ? (
                      <select
                        value={substatusDetail}
                        onChange={(e) => handleSubStatusDetailChange(project.id, e.target.value)}
                        onBlur={(e) => {
                          // Auto-save on blur as well
                          if (e.target.value !== substatusDetail) {
                            handleSubStatusDetailChange(project.id, e.target.value);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "1px solid #ddd",
                          fontSize: "0.9rem",
                          color: MONUMENT,
                          background: WHITE,
                          cursor: "pointer",
                          fontWeight: 500,
                          boxSizing: "border-box",
                          textAlign: "center",
                        }}
                      >
                        <option value="">-- Select --</option>
                        {detailOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          fontSize: "0.9rem",
                          color: "#999",
                          textAlign: "center",
                          fontStyle: "italic",
                        }}
                      >
                        {isOtherSelected || isCustomSubstatus || substatus === "" ? "N/A" : "Select SubStatus first"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custom SubStatus Modal */}
      {showCustomModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            pointerEvents: "auto",
          }}
          onClick={handleCustomSubstatusCancel}
        >
          <div
            style={{
              background: SECTION_GREY,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "500px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Add Custom SubStatus
            </h2>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.95rem",
                  marginBottom: "10px",
                  fontWeight: 500,
                  color: MONUMENT,
                }}
              >
                Enter new SubStatus:
              </label>
              <input
                type="text"
                value={customSubstatusInput}
                onChange={(e) => setCustomSubstatusInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCustomSubstatusOK();
                  } else if (e.key === "Escape") {
                    handleCustomSubstatusCancel();
                  }
                }}
                placeholder="Enter custom substatus..."
                autoFocus
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  fontWeight: 500,
                  boxSizing: "border-box",
                }}
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
                onClick={handleCustomSubstatusCancel}
                style={{
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  background: WHITE,
                  color: MONUMENT,
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => (e.target.style.background = "#f5f5f5")}
                onMouseOut={(e) => (e.target.style.background = WHITE)}
              >
                Cancel
              </button>
              <button
                onClick={handleCustomSubstatusOK}
                disabled={!customSubstatusInput.trim()}
                style={{
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "none",
                  background: customSubstatusInput.trim() ? MONUMENT : "#ccc",
                  color: WHITE,
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: customSubstatusInput.trim() ? "pointer" : "not-allowed",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => {
                  if (customSubstatusInput.trim()) {
                    e.target.style.background = "#222";
                  }
                }}
                onMouseOut={(e) => {
                  if (customSubstatusInput.trim()) {
                    e.target.style.background = MONUMENT;
                  }
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
