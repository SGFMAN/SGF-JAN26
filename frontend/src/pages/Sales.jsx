import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

const STREAMS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

export default function Sales() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Default to current month (0-indexed, so add 1 for display)
    return MONTHS[new Date().getMonth()];
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    // Default to current year
    return new Date().getFullYear().toString();
  });
  const [editingProject, setEditingProject] = useState(null);
  const [projectCostInput, setProjectCostInput] = useState("");
  const [dateInput, setDateInput] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (editingProject) {
      // Disable body scroll
      document.body.style.overflow = "hidden";
      return () => {
        // Re-enable body scroll when modal closes
        document.body.style.overflow = "";
      };
    }
  }, [editingProject]);

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

  function handleProjectClick(project) {
    // Format existing project cost for input
    const existingCost = project.project_cost 
      ? project.project_cost.toString().replace(/[^0-9]/g, "")
      : "";
    const formattedCost = existingCost 
      ? `$${parseInt(existingCost).toLocaleString()}`
      : "";
    setProjectCostInput(formattedCost);
    
    // Extract day from date (YYYY-MM-DD format)
    let day = "";
    if (project.year) {
      const dateStr = project.year.toString();
      if (dateStr.includes("-")) {
        const parts = dateStr.split("-");
        if (parts.length >= 3) {
          day = parts[2].trim();
        }
      }
    }
    setDateInput(day);
    setEditingProject(project);
  }

  function handleProjectCostChange(e) {
    // Format project cost: remove all non-numeric characters, add $ prefix and commas
    const numericValue = e.target.value.replace(/[^0-9]/g, "");
    const numeric = parseInt(numericValue) || 0;
    const formattedValue = numeric > 0 ? `$${numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` : "";
    setProjectCostInput(formattedValue);
  }

  async function handleSaveProjectCost() {
    if (!editingProject) return;
    
    try {
      const numericValue = projectCostInput.replace(/[^0-9]/g, "");
      const costToSave = numericValue ? `$${parseInt(numericValue).toLocaleString()}` : "";
      
      // Build date from day input (1-31) using current selected month and year
      let dateToSave = null;
      if (dateInput && dateInput.trim() !== "") {
        const day = parseInt(dateInput.trim());
        if (day >= 1 && day <= 31) {
          // Use selected year and month, with the entered day
          dateToSave = `${selectedYear}-${monthNumber}-${String(day).padStart(2, "0")}`;
        }
      }
      
      const updateData = {
        project_cost: costToSave,
      };
      
      // Only include year if date input is provided
      if (dateToSave) {
        updateData.year = dateToSave;
      }
      
      const response = await fetch(`${API_URL}/api/projects/${editingProject.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update project");
      }

      // Update local state
      const updatedProjects = projects.map(p => 
        p.id === editingProject.id 
          ? { ...p, project_cost: costToSave, year: dateToSave || p.year }
          : p
      );
      setProjects(updatedProjects);
      
      // Close modal
      setEditingProject(null);
      setProjectCostInput("");
      setDateInput("");
    } catch (err) {
      console.error("Error saving project:", err);
      alert(`Failed to save: ${err.message}`);
    }
  }

  function handleCloseModal() {
    setEditingProject(null);
    setProjectCostInput("");
    setDateInput("");
  }

  // Get month index (0-11) from selected month name
  const selectedMonthIndex = MONTHS.indexOf(selectedMonth);
  const monthNumber = String(selectedMonthIndex + 1).padStart(2, "0"); // 01-12
  
  // Debug: Log filtering parameters
  React.useEffect(() => {
    if (projects.length > 0) {
      const projectsWithDates = projects.filter(p => p.year);
      const matchingProjects = projectsWithDates.filter(p => {
        const projectYear = p.year.toString().trim();
        if (projectYear.includes("-")) {
          const parts = projectYear.split("-");
          if (parts.length >= 2) {
            const year = parts[0].trim();
            const month = parts[1].trim().padStart(2, "0");
            return year === selectedYear && month === monthNumber;
          }
        }
        return false;
      });
      
      console.log("Filter Debug:", {
        selectedYear,
        selectedMonth,
        selectedMonthIndex,
        monthNumber,
        totalProjects: projects.length,
        projectsWithDates: projectsWithDates.length,
        matchingProjects: matchingProjects.length,
        sampleDates: projectsWithDates.slice(0, 5).map(p => ({ 
          id: p.id, 
          name: p.name,
          year: p.year,
          matches: (() => {
            const py = p.year.toString().trim();
            if (py.includes("-")) {
              const parts = py.split("-");
              if (parts.length >= 2) {
                return parts[0].trim() === selectedYear && parts[1].trim().padStart(2, "0") === monthNumber;
              }
            }
            return false;
          })()
        }))
      });
    }
  }, [selectedYear, selectedMonth, projects.length]);

  // Get available years from projects
  const availableYears = React.useMemo(() => {
    const years = new Set();
    projects.forEach((project) => {
      if (project.year) {
        const projectYear = project.year.toString().trim();
        // Extract year from YYYY-MM-DD format (stored in database)
        if (projectYear.includes("-")) {
          const parts = projectYear.split("-");
          if (parts.length >= 1) {
            const year = parts[0].trim();
            if (/^\d{4}$/.test(year)) {
              years.add(year);
            }
          }
        }
        // Extract year from MM/DD/YYYY format (legacy or display format)
        else if (projectYear.includes("/")) {
          const parts = projectYear.split("/");
          if (parts.length === 3) {
            const year = parts[2].trim(); // Year is in parts[2] for MM/DD/YYYY
            if (/^\d{4}$/.test(year)) {
              years.add(year);
            }
          }
        } 
        // If it's just YYYY
        else if (/^\d{4}$/.test(projectYear)) {
          years.add(projectYear);
        }
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
  }, [projects]);

  // Filter projects by selected year and selected month
  // Shows ALL projects regardless of status (Complete, Construction Phase, Cancelled, etc.)
  // The year field stores dates in YYYY-MM-DD format
  const monthFilteredProjects = React.useMemo(() => {
    return projects.filter((project) => {
      // Exclude Hotlist status
      if (project.status === "Hotlist") {
        return false;
      }
      // Exclude projects with classification "Home Office / Studio"
      if (project.classification === "Home Office / Studio") {
        return false;
      }
      
      if (!project.year) return false;
      const projectYear = project.year.toString().trim();
      
      // Check if it's YYYY-MM-DD format (stored in database)
      if (projectYear.includes("-")) {
        const parts = projectYear.split("-");
        if (parts.length >= 2) {
          const year = parts[0].trim();
          const month = parts[1].trim().padStart(2, "0"); // Ensure month is 2 digits (01-12)
          
          // Match year and month
          const matches = year === selectedYear && month === monthNumber;
          if (matches) {
            console.log("Project matches filter:", { id: project.id, name: project.name, year: projectYear, selectedYear, month, monthNumber });
          }
          return matches;
        }
      }
      // Check if it's MM/DD/YYYY format (legacy format)
      else if (projectYear.includes("/")) {
        const parts = projectYear.split("/");
        if (parts.length === 3) {
          const month = parts[0].trim().padStart(2, "0"); // Ensure month is 2 digits (01-12)
          const day = parts[1].trim();
          const year = parts[2].trim();
          
          // Match year and month
          return year === selectedYear && month === monthNumber;
        }
      }
      
      // If it's just YYYY (no date), exclude it from month filtering
      return false;
    });
  }, [projects, selectedYear, monthNumber]);
  
  // Debug logging
  React.useEffect(() => {
    console.log("Sales Filter Debug:", {
      selectedYear,
      selectedMonth,
      monthNumber,
      totalProjects: projects.length,
      filteredCount: monthFilteredProjects.length,
      sampleProjectDates: projects.slice(0, 5).map(p => ({ id: p.id, year: p.year }))
    });
  }, [selectedYear, selectedMonth, projects, monthFilteredProjects.length]);

  // Helper function to get projects for a stream
  function getStreamProjects(stream) {
    const streamProjects = monthFilteredProjects.filter((project) => {
      const projectStream = project.stream || "";
      // Handle stream name variations
      if (stream === "Pumped On Property") {
        return projectStream === "Pumped On Property" || projectStream === "Pumped on Property";
      }
      if (stream === "Create Cash Flow") {
        return projectStream === "Create Cash Flow" || projectStream === "Creat Cash Flow";
      }
      return projectStream === stream;
    });
    
    // Sort by day of month (position 1 = 1st, position 2 = 2nd, etc.)
    return streamProjects.sort((a, b) => {
      const dateA = a.year ? a.year.toString() : "";
      const dateB = b.year ? b.year.toString() : "";
      if (dateA.includes("-") && dateB.includes("-")) {
        // Extract day from YYYY-MM-DD format
        const dayA = parseInt(dateA.split("-")[2] || "0");
        const dayB = parseInt(dateB.split("-")[2] || "0");
        return dayA - dayB;
      }
      // If dates don't match format, keep original order
      return 0;
    });
  }

  // Helper function to render a project cell
  function renderProjectCell(project, stream, currentCellColor, hoverColor, suburb, street, projectCost) {
    return (
      <div
        key={project.id}
        onClick={() => handleProjectClick(project)}
        style={{
          cursor: "pointer",
          color: MONUMENT,
          fontSize: "0.65rem",
          fontWeight: 400,
          lineHeight: "18px",
          padding: "0 4px",
          transition: "background 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "1px solid #000000",
          backgroundColor: currentCellColor,
          height: "18px",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
        onMouseLeave={(e) => (e.currentTarget.style.background = currentCellColor)}
      >
        <span style={{ textAlign: "left", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {suburb} - {street}
        </span>
        {projectCost && <span style={{ flexShrink: 0, textAlign: "right" }}>{projectCost}</span>}
      </div>
    );
  }

  // Debug: Log projects without streams
  React.useEffect(() => {
    const projectsWithoutStream = monthFilteredProjects.filter(p => !p.stream || p.stream === "");
    if (projectsWithoutStream.length > 0) {
      console.log("Projects without stream (won't appear in sales list):", projectsWithoutStream.map(p => ({ 
        id: p.id, 
        name: p.name, 
        stream: p.stream,
        year: p.year 
      })));
    }
  }, [monthFilteredProjects]);

  // Define column structure
  const column1Stream = "SGF - VIC";
  const column2Stream = "SGF - QLD";
  const column3Streams = ["Dual Dwelling", "ATA", "Pumped On Property"];
  const column4Streams = ["Henderson", "Create Cash Flow", "Fresh Start Advisory"];

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
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Sales - {selectedMonth}
          </h1>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "1rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
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
            gap: "12px",
            color: MONUMENT,
          }}
        >
          {/* TOTALS - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <Link
              to="/sales-totals"
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
              TOTALS
            </Link>
          </div>
          
          {/* Months - Light Green */}
          <div style={{ background: "#CEEAB0", borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: "2px solid #000" }}>
            {MONTHS.map((month) => (
              <button
                key={month}
                onClick={() => setSelectedMonth(month)}
                style={{
                  background: selectedMonth === month ? "#92D050" : "transparent",
                  color: selectedMonth === month ? WHITE : "#404049",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 8px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  textAlign: "center",
                  letterSpacing: "0.5px",
                  cursor: "pointer",
                  transition: "background 0.18s, color 0.15s",
                  marginBottom: "0px",
                  lineHeight: "1.4",
                  display: "block",
                }}
              >
                {month}
              </button>
            ))}
          </div>
          
          <div style={{ flex: 1 }} />
          
          {/* Back to Main - Light Red */}
          <div style={{ background: "#F79198", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
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

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "12px",
                alignItems: "flex-start",
              }}
            >
              {/* Column 1: SGF - VIC */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                {(() => {
                  const streamProjects = getStreamProjects(column1Stream);
                  const gridSize = 35; // 35 cells: row 1 = heading, rows 2-34 = projects, row 35 = total
                  const cellColorLight = "#C5DDF5"; // Light blue for cells
                  const cellColorExtraLight = "#E3F2FC"; // Extra light blue for alternating rows
                  const darkerColor = "#4D93D9"; // Darker blue for heading and total
                  const hoverColor = "#4D93D9"; // Hover color
                  
                  // Calculate total cost
                  const totalCost = streamProjects.reduce((sum, project) => {
                    if (project?.project_cost) {
                      const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
                      return sum + cost;
                    }
                    return sum;
                  }, 0);
                  const totalCostFormatted = `$${totalCost.toLocaleString()}`; // Always show, even if $0
                  
                  // Create array of all cells - first is HEADING, last is TOTAL
                  const allCells = Array.from({ length: gridSize }, (_, i) => {
                    if (i === 0) {
                      // First cell is HEADING
                      return "HEADING";
                    }
                    if (i === gridSize - 1) {
                      // Last cell is TOTAL
                      return "TOTAL";
                    }
                    // Other cells are projects (or null if no project)
                    return streamProjects[i - 1] || null; // i - 1 because first cell is heading
                  });
                  
                  return (
                    <div
                      style={{
                        display: "flex",
                        width: "100%",
                        border: "2px solid #000000",
                      }}
                    >
                      {/* Left side band */}
                      <div
                        style={{
                          width: "6px",
                          backgroundColor: darkerColor,
                        }}
                      />
                      {/* Inner grid */}
                      <div
                        style={{
                          flex: 1,
                          display: "grid",
                          gridTemplateRows: "repeat(35, 18px)",
                          gap: "1px",
                          minWidth: 0,
                          position: "relative",
                        }}
                      >
                        {/* Border wrapper for middle cells only (rows 2-34) */}
                        <div
                          style={{
                            position: "absolute",
                            top: "19px", // After heading (18px + 1px gap)
                            left: 0,
                            right: 0,
                            height: "626px", // 33 rows * 18px + 32 gaps * 1px = 594px + 32px = 626px
                            border: "1px solid #000000",
                            pointerEvents: "none",
                          }}
                        />
                        {allCells.map((cell, index) => {
                          if (cell === "HEADING") {
                            return (
                              <div
                                key={`heading-${index}`}
                                style={{
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "0 4px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  color: WHITE,
                                }}
                              >
                                <span>{column1Stream.toUpperCase()} SALES: {streamProjects.length}</span>
                              </div>
                            );
                          }
                          if (cell === "TOTAL") {
                            return (
                              <div
                                key={`total-${index}`}
                                style={{
                                  borderBottom: "1px solid #000000",
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 4px",
                                  fontWeight: 700,
                                  fontSize: "0.75rem",
                                  color: WHITE,
                                }}
                              >
                                <span style={{ textAlign: "left" }}>TOTAL</span>
                                <span style={{ flexShrink: 0, textAlign: "right" }}>{totalCostFormatted}</span>
                              </div>
                            );
                          }
                          // Determine cell color based on row index (alternate between light and extra light)
                          // Row 0 is heading, rows 1-33 are middle cells, row 34 is total
                          // For middle cells (index 1-33), alternate starting with light
                          const isEvenRow = (index - 1) % 2 === 0; // -1 because index 0 is heading
                          const currentCellColor = isEvenRow ? cellColorLight : cellColorExtraLight;
                          
                          if (!cell) {
                            return (
                              <div
                                key={`empty-${index}`}
                                style={{
                                  border: "1px solid #000000",
                                  backgroundColor: currentCellColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "0 4px",
                                }}
                              />
                            );
                          }
                          const project = cell;
                          const suburb = (project.suburb || "Unknown Suburb").toUpperCase();
                          const street = project.street || "No address";
                          const projectCost = project.project_cost 
                            ? `$${parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0).toLocaleString()}`
                            : "";
                          
                          return renderProjectCell(project, column1Stream, currentCellColor, hoverColor, suburb, street, projectCost);
                        })}
                      </div>
                      {/* Right side band */}
                      <div
                        style={{
                          width: "6px",
                          backgroundColor: darkerColor,
                        }}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Column 2: SGF - QLD */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                {(() => {
                  const streamProjects = getStreamProjects(column2Stream);
                  const gridSize = 35; // 35 cells: row 1 = heading, rows 2-34 = projects, row 35 = total
                  const cellColorLight = "#F9B5C0"; // Light pink for cells (lightened)
                  const cellColorExtraLight = "#FCD4DC"; // Extra light pink for alternating rows
                  const darkerColor = "#D54358"; // Darker pink for heading and total
                  const hoverColor = "#D54358"; // Hover color
                  
                  // Calculate total cost
                  const totalCost = streamProjects.reduce((sum, project) => {
                    if (project?.project_cost) {
                      const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
                      return sum + cost;
                    }
                    return sum;
                  }, 0);
                  const totalCostFormatted = `$${totalCost.toLocaleString()}`; // Always show, even if $0
                  
                  // Create array of all cells - first is HEADING, last is TOTAL
                  const allCells = Array.from({ length: gridSize }, (_, i) => {
                    if (i === 0) {
                      // First cell is HEADING
                      return "HEADING";
                    }
                    if (i === gridSize - 1) {
                      // Last cell is TOTAL
                      return "TOTAL";
                    }
                    // Other cells are projects (or null if no project)
                    return streamProjects[i - 1] || null; // i - 1 because first cell is heading
                  });
                  
                  return (
                    <div
                      style={{
                        display: "flex",
                        width: "100%",
                        border: "2px solid #000000",
                      }}
                    >
                      {/* Left side band */}
                      <div
                        style={{
                          width: "6px",
                          backgroundColor: darkerColor,
                        }}
                      />
                      {/* Inner grid */}
                      <div
                        style={{
                          flex: 1,
                          display: "grid",
                          gridTemplateRows: "repeat(35, 18px)",
                          gap: "1px",
                          minWidth: 0,
                          position: "relative",
                        }}
                      >
                        {/* Border wrapper for middle cells only (rows 2-34) */}
                        <div
                          style={{
                            position: "absolute",
                            top: "19px", // After heading (18px + 1px gap)
                            left: 0,
                            right: 0,
                            height: "626px", // 33 rows * 18px + 32 gaps * 1px = 594px + 32px = 626px
                            border: "1px solid #000000",
                            pointerEvents: "none",
                          }}
                        />
                        {allCells.map((cell, index) => {
                          // Determine cell color based on row index (alternate between light and extra light)
                          const isEvenRow = (index - 1) % 2 === 0; // -1 because index 0 is heading
                          const currentCellColor = isEvenRow ? cellColorLight : cellColorExtraLight;
                          
                          if (cell === "HEADING") {
                            return (
                              <div
                                key={`heading-${index}`}
                                style={{
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "0 4px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  color: WHITE,
                                }}
                              >
                                <span>{column2Stream.toUpperCase()} SALES: {streamProjects.length}</span>
                              </div>
                            );
                          }
                          if (cell === "TOTAL") {
                            return (
                              <div
                                key={`total-${index}`}
                                style={{
                                  borderBottom: "1px solid #000000",
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 4px",
                                  fontWeight: 700,
                                  fontSize: "0.75rem",
                                  color: WHITE,
                                }}
                              >
                                <span style={{ textAlign: "left" }}>TOTAL</span>
                                <span style={{ flexShrink: 0, textAlign: "right" }}>{totalCostFormatted}</span>
                              </div>
                            );
                          }
                          if (!cell) {
                            return (
                              <div
                                key={`empty-${index}`}
                                style={{
                                  border: "1px solid #000000",
                                  backgroundColor: currentCellColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "0 4px",
                                }}
                              />
                            );
                          }
                          const project = cell;
                          const suburb = (project.suburb || "Unknown Suburb").toUpperCase();
                          const street = project.street || "No address";
                          const projectCost = project.project_cost 
                            ? `$${parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0).toLocaleString()}`
                            : "";
                          
                          return renderProjectCell(project, column2Stream, currentCellColor, hoverColor, suburb, street, projectCost);
                        })}
                      </div>
                      {/* Right side band */}
                      <div
                        style={{
                          width: "6px",
                          backgroundColor: darkerColor,
                        }}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Column 3: Dual Dwelling, ATA, Pumped On Property */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  height: "100%",
                  gap: "2px",
                }}
              >
                {column3Streams.map((stream, index) => {
                  const streamProjects = getStreamProjects(stream);
                  const gridSize = 11; // 11 cells: row 1 = heading, rows 2-10 = projects, row 11 = total
                  
                  // Calculate total cost
                  const totalCost = streamProjects.reduce((sum, project) => {
                    if (project?.project_cost) {
                      const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
                      return sum + cost;
                    }
                    return sum;
                  }, 0);
                  const totalCostFormatted = `$${totalCost.toLocaleString()}`; // Always show, even if $0
                  
                  // Assign colors to each stream section in column 3
                  const cellColorLight = "#D9F0C1"; // Light green (lightened)
                  const cellColorExtraLight = "#E8F7D8"; // Extra light green for alternating rows
                  const darkerColor = "#92D050"; // Darker green
                  const hoverColor = "#92D050"; // Hover color
                  
                  // Create array of all cells - first is HEADING, last is TOTAL
                  const allCells = Array.from({ length: gridSize }, (_, i) => {
                    if (i === 0) {
                      // First cell is HEADING
                      return "HEADING";
                    }
                    if (i === gridSize - 1) {
                      // Last cell is TOTAL
                      return "TOTAL";
                    }
                    // Other cells are projects (or null if no project)
                    return streamProjects[i - 1] || null; // i - 1 because first cell is heading
                  });
                  
                  return (
                    <div
                      key={stream}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        marginTop: index > 0 ? "13px" : "0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          width: "100%",
                          border: "2px solid #000000",
                        }}
                      >
                        {/* Left side band */}
                        <div
                          style={{
                            width: "6px",
                            backgroundColor: darkerColor,
                          }}
                        />
                        {/* Inner grid */}
                        <div
                          style={{
                            flex: 1,
                            display: "grid",
                            gridTemplateRows: "repeat(11, 18px)",
                            gap: "1px",
                            minWidth: 0,
                            position: "relative",
                          }}
                        >
                          {/* Border wrapper for middle cells only (rows 2-10) */}
                          <div
                            style={{
                              position: "absolute",
                              top: "19px", // After heading (18px + 1px gap)
                              left: 0,
                              right: 0,
                              height: "170px", // 9 rows * 18px + 8 gaps * 1px = 162px + 8px = 170px
                              border: "1px solid #000000",
                              pointerEvents: "none",
                            }}
                          />
                          {allCells.map((cell, cellIndex) => {
                            // Determine cell color based on row index (alternate between light and extra light)
                            const isEvenRow = (cellIndex - 1) % 2 === 0; // -1 because index 0 is heading
                            const currentCellColor = isEvenRow ? cellColorLight : cellColorExtraLight;
                            
                            if (cell === "HEADING") {
                              return (
                                <div
                                  key={`heading-${index}-${cellIndex}`}
                                  style={{
                                    backgroundColor: darkerColor,
                                    height: "18px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "0 4px",
                                    fontWeight: 600,
                                    fontSize: "0.85rem",
                                    color: WHITE,
                                  }}
                                >
                                  <span>{stream.toUpperCase()} SALES: {streamProjects.length}</span>
                                </div>
                              );
                            }
                            if (cell === "TOTAL") {
                              return (
                                <div
                                  key={`total-${index}-${cellIndex}`}
                                  style={{
                                    borderBottom: "1px solid #000000",
                                    backgroundColor: darkerColor,
                                    height: "18px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "0 4px",
                                    fontWeight: 700,
                                    fontSize: "0.75rem",
                                    color: WHITE,
                                  }}
                                >
                                  <span>TOTAL</span>
                                  <span style={{ flexShrink: 0 }}>{totalCostFormatted}</span>
                                </div>
                              );
                            }
                            if (!cell) {
                              return (
                                <div
                                  key={`empty-${index}-${cellIndex}`}
                                  style={{
                                    border: "1px solid #000000",
                                    backgroundColor: currentCellColor,
                                    height: "18px",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0 4px",
                                    overflow: "hidden",
                                  }}
                                />
                              );
                            }
                            const project = cell;
                            const suburb = (project.suburb || "Unknown Suburb").toUpperCase();
                            const street = project.street || "No address";
                            const projectCost = project.project_cost 
                              ? `$${parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0).toLocaleString()}`
                              : "";
                            
                            return renderProjectCell(project, stream, currentCellColor, hoverColor, suburb, street, projectCost);
                          })}
                        </div>
                        {/* Right side band */}
                        <div
                          style={{
                            width: "6px",
                            backgroundColor: darkerColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Column 4: Henderson, Create Cash Flow, Fresh Start Advisory */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  height: "100%",
                  gap: "2px",
                }}
              >
                {column4Streams.map((stream, index) => {
                  const streamProjects = getStreamProjects(stream);
                  const gridSize = 11; // 11 cells: row 1 = heading, rows 2-10 = projects, row 11 = total
                  
                  // Calculate total cost
                  const totalCost = streamProjects.reduce((sum, project) => {
                    if (project?.project_cost) {
                      const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
                      return sum + cost;
                    }
                    return sum;
                  }, 0);
                  const totalCostFormatted = `$${totalCost.toLocaleString()}`; // Always show, even if $0
                  
                  // Assign colors to each stream section
                  const cellColorLight = "#D9F0C1"; // Light green (lightened)
                  const cellColorExtraLight = "#E8F7D8"; // Extra light green for alternating rows
                  const darkerColor = "#92D050"; // Darker green
                  const hoverColor = "#92D050"; // Hover color
                  
                  // Create array of all cells - first is HEADING, last is TOTAL
                  const allCells = Array.from({ length: gridSize }, (_, i) => {
                    if (i === 0) {
                      // First cell is HEADING
                      return "HEADING";
                    }
                    if (i === gridSize - 1) {
                      // Last cell is TOTAL
                      return "TOTAL";
                    }
                    // Other cells are projects (or null if no project)
                    return streamProjects[i - 1] || null; // i - 1 because first cell is heading
                  });
                  
                  return (
                    <div
                      key={stream}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        marginTop: index > 0 ? "13px" : "0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          width: "100%",
                          border: "2px solid #000000",
                        }}
                      >
                        {/* Left side band */}
                        <div
                          style={{
                            width: "6px",
                            backgroundColor: darkerColor,
                          }}
                        />
                        {/* Inner grid */}
                        <div
                          style={{
                            flex: 1,
                            display: "grid",
                            gridTemplateRows: "repeat(11, 18px)",
                            gap: "1px",
                            minWidth: 0,
                            position: "relative",
                          }}
                        >
                          {/* Border wrapper for middle cells only (rows 2-10) */}
                          <div
                            style={{
                              position: "absolute",
                              top: "19px", // After heading (18px + 1px gap)
                              left: 0,
                              right: 0,
                              height: "170px", // 9 rows * 18px + 8 gaps * 1px = 162px + 8px = 170px
                              border: "1px solid #000000",
                              pointerEvents: "none",
                            }}
                          />
                          {allCells.map((cell, cellIndex) => {
                            // Determine cell color based on row index (alternate between light and extra light)
                            const isEvenRow = (cellIndex - 1) % 2 === 0; // -1 because index 0 is heading
                            const currentCellColor = isEvenRow ? cellColorLight : cellColorExtraLight;
                            
                            if (cell === "HEADING") {
                              return (
                                <div
                                  key={`heading-${index}-${cellIndex}`}
                                  style={{
                                    backgroundColor: darkerColor,
                                    height: "18px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: "0 4px",
                                    fontWeight: 600,
                                    fontSize: "0.85rem",
                                    color: WHITE,
                                  }}
                                >
                                  <span>{stream.toUpperCase()} SALES: {streamProjects.length}</span>
                                </div>
                              );
                            }
                            if (cell === "TOTAL") {
                              return (
                                <div
                                  key={`total-${index}-${cellIndex}`}
                                  style={{
                                    borderBottom: "1px solid #000000",
                                    backgroundColor: darkerColor,
                                    height: "18px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "0 4px",
                                    fontWeight: 700,
                                    fontSize: "0.75rem",
                                    color: WHITE,
                                  }}
                                >
                                  <span>TOTAL</span>
                                  <span style={{ flexShrink: 0 }}>{totalCostFormatted}</span>
                                </div>
                              );
                            }
                            if (!cell) {
                              return (
                                <div
                                  key={`empty-${index}-${cellIndex}`}
                                  style={{
                                    border: "1px solid #000000",
                                    backgroundColor: currentCellColor,
                                    height: "18px",
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "0 4px",
                                    overflow: "hidden",
                                  }}
                                />
                              );
                            }
                            const project = cell;
                            const suburb = (project.suburb || "Unknown Suburb").toUpperCase();
                            const street = project.street || "No address";
                            const projectCost = project.project_cost 
                              ? `$${parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0).toLocaleString()}`
                              : "";
                            return renderProjectCell(project, stream, currentCellColor, hoverColor, suburb, street, projectCost);
                          })}
                        </div>
                        {/* Right side band */}
                        <div
                          style={{
                            width: "6px",
                            backgroundColor: darkerColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project Cost Edit Modal */}
      {editingProject && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            overflow: "hidden",
          }}
          onClick={handleCloseModal}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            style={{
              backgroundColor: WHITE,
              padding: "24px",
              borderRadius: "8px",
              minWidth: "400px",
              maxWidth: "90%",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 16px 0", fontSize: "1.25rem", color: MONUMENT }}>
              Edit Project
            </h2>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: MONUMENT, marginBottom: "8px" }}>
                <strong>{editingProject.suburb && editingProject.street 
                  ? `${editingProject.suburb.toUpperCase()} - ${editingProject.street}`
                  : editingProject.name || "Unknown Project"}</strong>
              </div>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: MONUMENT }}>
                Project Cost
              </label>
              <input
                type="text"
                value={projectCostInput}
                onChange={handleProjectCostChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveProjectCost();
                  } else if (e.key === "Escape") {
                    handleCloseModal();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "1rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  boxSizing: "border-box",
                }}
                placeholder="$0"
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: MONUMENT }}>
                Date (Day of Month: 1-31)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={dateInput}
                onChange={(e) => {
                  const value = e.target.value;
                  // Only allow numbers 1-31
                  if (value === "" || (parseInt(value) >= 1 && parseInt(value) <= 31)) {
                    setDateInput(value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveProjectCost();
                  } else if (e.key === "Escape") {
                    handleCloseModal();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  fontSize: "1rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  boxSizing: "border-box",
                }}
                placeholder="Day (1-31)"
              />
              <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "4px" }}>
                Using: {selectedMonth} {selectedYear}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProjectCost}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.9rem",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: MONUMENT,
                  color: WHITE,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
