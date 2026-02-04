import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

export default function ContractManager() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" or "desc"

  useEffect(() => {
    fetchProjects();
  }, []);

  // Parse date from year field
  function parseDate(project) {
    if (!project.year) return null;
    // Check if it's a date format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(project.year)) {
      return new Date(project.year);
    }
    // If it's just a year, use January 1st of that year
    if (/^\d{4}$/.test(project.year)) {
      return new Date(`${project.year}-01-01`);
    }
    return null;
  }

  // Sort projects by date
  function sortProjectsByDate(projectsList, order) {
    return [...projectsList].sort((a, b) => {
      const dateA = parseDate(a);
      const dateB = parseDate(b);
      
      // Projects without dates go to the end
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      
      // Compare dates
      const comparison = dateA - dateB;
      return order === "asc" ? comparison : -comparison;
    });
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
      // Filter for Design Phase projects (exclude Hotlist)
      const designPhaseProjects = data.filter((project) => project.status === "Design Phase" && project.status !== "Hotlist");
      // Sort by date
      const sortedProjects = sortProjectsByDate(designPhaseProjects, sortOrder);
      setProjects(sortedProjects);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Re-sort when sort order changes
  useEffect(() => {
    if (projects.length > 0) {
      const sortedProjects = sortProjectsByDate(projects, sortOrder);
      setProjects(sortedProjects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  // Status options
  const CONTRACT_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];
  const SUPPORTING_DOCUMENTS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];
  const WATER_AUTHORITY_OPTIONS = ["Not Required", "Barwon Water", "Greater Western Water", "South East Water"];
  const WATER_DECLARATION_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];

  // Get status color
  function getStatusColor(status, fieldName = "") {
    if (status === "Not Required") {
      return "#999999"; // Grey
    } else if (status === "Complete") {
      return "#33cc33"; // Green
    } else if (status === "Sent") {
      return "#ff9900"; // Orange
    } else if (fieldName === "water_authority" && (status === "Barwon Water" || status === "Greater Western Water" || status === "South East Water")) {
      // For water authority, show specific authorities in blue
      return "#0066cc"; // Blue
    } else if (fieldName === "water_authority" && status !== "Not Required" && status !== "Not Sent") {
      // For other water authority values, use a neutral color
      return WHITE;
    } else {
      return "#cc3333"; // Red (for "Not Sent" or other)
    }
  }

  // Get effective value with default
  function getEffectiveValue(project, fieldName, defaultValue) {
    const value = project[fieldName];
    if (!value || value === null || value === undefined || value === "") {
      return defaultValue || "";
    }
    return value;
  }

  // Save field update
  async function saveField(projectId, fieldName, value) {
    try {
      // Get the project to preserve other fields
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
      
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project.status || null,
          [fieldName]: value === "" ? null : value,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save field:", errorData.error || response.statusText);
        return;
      }

      // Refresh projects list
      await fetchProjects();
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  // Handle status change
  async function handleStatusChange(projectId, fieldName, newValue) {
    await saveField(projectId, fieldName, newValue);
    
    // Special handling: if water authority changes to "Not Required", set water declaration to "Not Sent" (it will display as "Not Required")
    if (fieldName === "water_authority") {
      if (newValue === "Not Required") {
        await saveField(projectId, "water_declaration_status", "Not Sent");
      }
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
            Contract Manager
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
            Contract Manager
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", position: "sticky", top: "-24px", background: SECTION_GREY, zIndex: 9, paddingTop: "24px", marginTop: "-24px", paddingBottom: "8px" }}>
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
              Design Phase Projects ({projects.length})
            </h2>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              style={{
                padding: "8px 16px",
                fontSize: "0.9rem",
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
              Sort: {sortOrder === "asc" ? "Oldest First" : "Newest First"}
            </button>
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && projects.length === 0 && (
            <p style={{ color: "#32323399" }}>No Design Phase projects found.</p>
          )}
          {!loading && !error && projects.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {/* Header Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
                  gap: "16px",
                  padding: "12px 16px",
                  background: MONUMENT,
                  color: WHITE,
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  position: "sticky",
                  top: "0",
                  zIndex: 10,
                  marginBottom: "8px",
                }}
              >
                <div>Project</div>
                <div>Contract</div>
                <div>Supporting Docs</div>
                <div>Water Authority</div>
                <div>Water Declaration</div>
                <div>Date</div>
              </div>

              {/* Project Rows */}
              {projects.map((project) => {
                const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "Unknown Project";
                const contractStatus = getEffectiveValue(project, "contract_status", "Not Sent");
                const supportingDocsStatus = getEffectiveValue(project, "supporting_documents_status", "Not Sent");
                const waterAuthority = getEffectiveValue(project, "water_authority", "Not Required");
                // For water declaration, if water authority is "Not Required", treat it as "Not Required" for display/color
                const waterDeclarationStatusRaw = getEffectiveValue(project, "water_declaration_status", "Not Sent");
                const waterDeclarationStatus = waterAuthority === "Not Required" ? "Not Required" : waterDeclarationStatusRaw;
                // Format date for display (year field now stores full date YYYY-MM-DD)
                let displayDate = "";
                if (project.year) {
                  // Check if it's a date format (YYYY-MM-DD) or just a year
                  if (/^\d{4}-\d{2}-\d{2}$/.test(project.year)) {
                    // Format as DD/MM/YYYY
                    const [year, month, day] = project.year.split('-');
                    displayDate = `${day}/${month}/${year}`;
                  } else if (/^\d{4}$/.test(project.year)) {
                    // It's just a year, show as "Year: YYYY"
                    displayDate = `Year: ${project.year}`;
                  } else {
                    displayDate = "Not set";
                  }
                } else {
                  displayDate = "Not set";
                }

                return (
                  <div
                    key={project.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
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
                      value={contractStatus}
                      onChange={(e) => handleStatusChange(project.id, "contract_status", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "0.9rem",
                        color: WHITE,
                        background: getStatusColor(contractStatus),
                        cursor: "pointer",
                        fontWeight: 500,
                        boxSizing: "border-box",
                        textAlign: "center",
                      }}
                    >
                      {CONTRACT_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={supportingDocsStatus}
                      onChange={(e) => handleStatusChange(project.id, "supporting_documents_status", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "0.9rem",
                        color: WHITE,
                        background: getStatusColor(supportingDocsStatus),
                        cursor: "pointer",
                        fontWeight: 500,
                        boxSizing: "border-box",
                        textAlign: "center",
                      }}
                    >
                      {SUPPORTING_DOCUMENTS_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={waterAuthority}
                      onChange={(e) => handleStatusChange(project.id, "water_authority", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "0.9rem",
                        color: getStatusColor(waterAuthority, "water_authority") === WHITE ? MONUMENT : WHITE,
                        background: getStatusColor(waterAuthority, "water_authority"),
                        cursor: "pointer",
                        fontWeight: 500,
                        boxSizing: "border-box",
                        textAlign: "center",
                      }}
                    >
                      {WATER_AUTHORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {waterAuthority === "Not Required" ? (
                      <div
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          fontSize: "0.9rem",
                          color: WHITE,
                          background: getStatusColor("Not Required"),
                          fontWeight: 500,
                          boxSizing: "border-box",
                          textAlign: "center",
                        }}
                      >
                        Not Required
                      </div>
                    ) : (
                      <select
                        value={waterDeclarationStatusRaw}
                        onChange={(e) => handleStatusChange(project.id, "water_declaration_status", e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "0.9rem",
                          color: WHITE,
                          background: getStatusColor(waterDeclarationStatusRaw),
                          cursor: "pointer",
                          fontWeight: 500,
                          boxSizing: "border-box",
                          textAlign: "center",
                        }}
                      >
                        {WATER_DECLARATION_STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    <div>{displayDate}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
