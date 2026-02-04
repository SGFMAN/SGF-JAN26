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
  "Maple Group",
];

export default function Sales() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Default to current month (0-indexed, so add 1 for display)
    return MONTHS[new Date().getMonth()];
  });

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
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Get current year
  const currentYear = new Date().getFullYear().toString();
  
  // Get month index (0-11) from selected month name
  const selectedMonthIndex = MONTHS.indexOf(selectedMonth);
  const monthNumber = String(selectedMonthIndex + 1).padStart(2, "0"); // 01-12

  // Filter projects by current year and selected month
  // The year field can be in YYYY-MM-DD format or just YYYY
  const monthFilteredProjects = projects.filter((project) => {
    if (!project.year) return false;
    const projectYear = project.year.toString();
    
    // If it's a date format (YYYY-MM-DD), check both year and month
    if (projectYear.includes("-")) {
      const [year, month] = projectYear.split("-");
      return year === currentYear && month === monthNumber;
    }
    
    // If it's just YYYY (no date), exclude it from month filtering
    return false;
  });

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
    
    // Sort chronologically (earliest first)
    return streamProjects.sort((a, b) => {
      const dateA = a.year ? a.year.toString() : "";
      const dateB = b.year ? b.year.toString() : "";
      if (dateA.includes("-") && dateB.includes("-")) {
        return dateA.localeCompare(dateB);
      }
      return 0;
    });
  }

  // Define column structure
  const column1Stream = "SGF - VIC";
  const column2Stream = "SGF - QLD";
  const column3Streams = ["Dual Dwelling", "ATA", "Pumped On Property"];
  const column4Streams = ["Henderson", "Create Cash Flow", "Maple Group"];

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
            Sales
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
          {MONTHS.map((month) => (
            <button
              key={month}
              onClick={() => setSelectedMonth(month)}
              style={{
                background: selectedMonth === month ? WHITE : "transparent",
                color: selectedMonth === month ? MONUMENT : "#404049",
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
                outline: selectedMonth === month ? `2px solid ${MONUMENT}` : "none",
                boxShadow: selectedMonth === month ? "0 2px 4px rgba(50,50,51,.04)" : "none",
              }}
            >
              {month}
            </button>
          ))}
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
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "16px" }}>
            Projects Sold in {selectedMonth} {currentYear}
          </h2>

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
                  const cellColor = "#e6f2ff"; // Light blue
                  const darkerColor = "#cce5ff"; // Darker blue for heading and total
                  const hoverColor = "#cce5ff"; // Hover color
                  
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
                        display: "grid",
                        gridTemplateRows: "repeat(35, 18px)",
                        gap: "1px",
                        border: "1px solid #d0d0d0",
                      }}
                    >
                      {allCells.map((cell, index) => {
                        if (cell === "HEADING") {
                          return (
                            <div
                              key={`heading-${index}`}
                              style={{
                                border: "1px solid #d0d0d0",
                                backgroundColor: darkerColor,
                                height: "18px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 4px",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                              }}
                            >
                              <span>{column1Stream}</span>
                              <span>({streamProjects.length})</span>
                            </div>
                          );
                        }
                        if (cell === "TOTAL") {
                          return (
                            <div
                              key={`total-${index}`}
                              style={{
                                border: "1px solid #d0d0d0",
                                backgroundColor: darkerColor,
                                height: "18px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 4px",
                                fontWeight: 600,
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
                              key={`empty-${index}`}
                              style={{
                                border: "1px solid #d0d0d0",
                                backgroundColor: cellColor,
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
                        return (
                          <Link
                            key={project.id}
                            to={`/project/${project.id}`}
                            style={{
                              textDecoration: "none",
                              color: MONUMENT,
                              fontSize: "0.65rem",
                              lineHeight: "18px",
                              padding: "0 4px",
                              transition: "background 0.15s",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              border: "1px solid #d0d0d0",
                              backgroundColor: cellColor,
                              height: "18px",
                              overflow: "hidden",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = cellColor)}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "4px" }}>
                              {suburb} - {street}
                            </span>
                            {projectCost && <span style={{ flexShrink: 0 }}>{projectCost}</span>}
                          </Link>
                        );
                      })}
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
                  const cellColor = "#ffe6f5"; // Light pink
                  const darkerColor = "#ffccf0"; // Darker pink for heading and total
                  const hoverColor = "#ffccf0"; // Hover color
                  
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
                        display: "grid",
                        gridTemplateRows: "repeat(35, 18px)",
                        gap: "1px",
                        border: "1px solid #d0d0d0",
                      }}
                    >
                      {allCells.map((cell, index) => {
                        if (cell === "HEADING") {
                          return (
                            <div
                              key={`heading-${index}`}
                              style={{
                                border: "1px solid #d0d0d0",
                                backgroundColor: darkerColor,
                                height: "18px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 4px",
                                fontWeight: 600,
                                fontSize: "0.85rem",
                              }}
                            >
                              <span>{column2Stream}</span>
                              <span>({streamProjects.length})</span>
                            </div>
                          );
                        }
                        if (cell === "TOTAL") {
                          return (
                            <div
                              key={`total-${index}`}
                              style={{
                                border: "1px solid #d0d0d0",
                                backgroundColor: darkerColor,
                                height: "18px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0 4px",
                                fontWeight: 600,
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
                              key={`empty-${index}`}
                              style={{
                                border: "1px solid #d0d0d0",
                                backgroundColor: cellColor,
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
                        return (
                          <Link
                            key={project.id}
                            to={`/project/${project.id}`}
                            style={{
                              textDecoration: "none",
                              color: MONUMENT,
                              fontSize: "0.65rem",
                              lineHeight: "18px",
                              padding: "0 4px",
                              transition: "background 0.15s",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              border: "1px solid #d0d0d0",
                              backgroundColor: cellColor,
                              height: "18px",
                              overflow: "hidden",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = cellColor)}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "4px" }}>
                              {suburb} - {street}
                            </span>
                            {projectCost && <span style={{ flexShrink: 0 }}>{projectCost}</span>}
                          </Link>
                        );
                      })}
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
                  const streamColors = [
                    "#e6ffe6", // Light green for Dual Dwelling
                    "#fff4e6", // Light peach for ATA
                    "#f5e6e6", // Light maroon for Pumped On Property
                  ];
                  const streamDarkerColors = [
                    "#ccffcc", // Darker green
                    "#ffe0cc", // Darker peach
                    "#e8d0d0", // Darker maroon
                  ];
                  const streamHoverColors = [
                    "#ccffcc", // Darker green
                    "#ffe0cc", // Darker peach
                    "#e8d0d0", // Darker maroon
                  ];
                  const cellColor = streamColors[index];
                  const darkerColor = streamDarkerColors[index];
                  const hoverColor = streamHoverColors[index];
                  
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
                        marginTop: index > 0 ? "18px" : "0",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateRows: "repeat(11, 18px)",
                          gap: "1px",
                          border: "1px solid #d0d0d0",
                        }}
                      >
                        {allCells.map((cell, cellIndex) => {
                          if (cell === "HEADING") {
                            return (
                              <div
                                key={`heading-${index}-${cellIndex}`}
                                style={{
                                  border: "1px solid #d0d0d0",
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 4px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                }}
                              >
                                <span>{stream}</span>
                                <span>({streamProjects.length})</span>
                              </div>
                            );
                          }
                          if (cell === "TOTAL") {
                            return (
                              <div
                                key={`total-${index}-${cellIndex}`}
                                style={{
                                  border: "1px solid #d0d0d0",
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 4px",
                                  fontWeight: 600,
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
                                  border: "1px solid #d0d0d0",
                                  backgroundColor: cellColor,
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
                          return (
                            <Link
                              key={project.id}
                              to={`/project/${project.id}`}
                              style={{
                                textDecoration: "none",
                                color: MONUMENT,
                                fontSize: "0.65rem",
                                lineHeight: "18px",
                                padding: "0 4px",
                                transition: "background 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                border: "1px solid #d0d0d0",
                                backgroundColor: cellColor,
                                height: "18px",
                                overflow: "hidden",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = cellColor)}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "4px" }}>
                                {suburb} - {street}
                              </span>
                              {projectCost && <span style={{ flexShrink: 0 }}>{projectCost}</span>}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Column 4: Henderson, Create Cash Flow, Maple Group */}
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
                  const streamColors = [
                    "#e6f0ff", // Light blue for Henderson
                    "#f0e6ff", // Light lavender for Create Cash Flow
                    "#ffe6e6", // Light coral for Maple Group
                  ];
                  const streamDarkerColors = [
                    "#cce0ff", // Darker blue
                    "#e0ccff", // Darker lavender
                    "#ffcccc", // Darker coral
                  ];
                  const streamHoverColors = [
                    "#cce0ff", // Darker blue
                    "#e0ccff", // Darker lavender
                    "#ffcccc", // Darker coral
                  ];
                  const cellColor = streamColors[index];
                  const darkerColor = streamDarkerColors[index];
                  const hoverColor = streamHoverColors[index];
                  
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
                        marginTop: index > 0 ? "18px" : "0",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateRows: "repeat(11, 18px)",
                          gap: "1px",
                          border: "1px solid #d0d0d0",
                        }}
                      >
                        {allCells.map((cell, cellIndex) => {
                          if (cell === "HEADING") {
                            return (
                              <div
                                key={`heading-${index}-${cellIndex}`}
                                style={{
                                  border: "1px solid #d0d0d0",
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 4px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                }}
                              >
                                <span>{stream}</span>
                                <span>({streamProjects.length})</span>
                              </div>
                            );
                          }
                          if (cell === "TOTAL") {
                            return (
                              <div
                                key={`total-${index}-${cellIndex}`}
                                style={{
                                  border: "1px solid #d0d0d0",
                                  backgroundColor: darkerColor,
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0 4px",
                                  fontWeight: 600,
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
                                  border: "1px solid #d0d0d0",
                                  backgroundColor: cellColor,
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
                          return (
                            <Link
                              key={project.id}
                              to={`/project/${project.id}`}
                              style={{
                                textDecoration: "none",
                                color: MONUMENT,
                                fontSize: "0.65rem",
                                lineHeight: "18px",
                                padding: "0 4px",
                                transition: "background 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                border: "1px solid #d0d0d0",
                                backgroundColor: cellColor,
                                height: "18px",
                                overflow: "hidden",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = hoverColor)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = cellColor)}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "4px" }}>
                                {suburb} - {street}
                              </span>
                              {projectCost && <span style={{ flexShrink: 0 }}>{projectCost}</span>}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
