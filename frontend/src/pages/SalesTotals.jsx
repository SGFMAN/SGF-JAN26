import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

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

// Green streams (for total calculation)
const GREEN_STREAMS = [
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Maple Group",
];

// Stream color mapping (same as Sales page)
const STREAM_COLORS = {
  "SGF - VIC": { darker: "#4D93D9", lighter: "#A6C9EC" },
  "SGF - QLD": { darker: "#D54358", lighter: "#F79198" },
  "Dual Dwelling": { darker: "#92D050", lighter: "#CEEAB0" },
  "ATA": { darker: "#92D050", lighter: "#CEEAB0" },
  "Pumped On Property": { darker: "#92D050", lighter: "#CEEAB0" },
  "Henderson": { darker: "#92D050", lighter: "#CEEAB0" },
  "Create Cash Flow": { darker: "#92D050", lighter: "#CEEAB0" },
  "Maple Group": { darker: "#92D050", lighter: "#CEEAB0" },
};

export default function SalesTotals() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
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

  // Get available years from projects
  const availableYears = React.useMemo(() => {
    const years = new Set();
    projects.forEach((project) => {
      if (project.year) {
        const projectYear = project.year.toString().trim();
        // Extract year from YYYY-MM-DD format
        if (projectYear.includes("-")) {
          const parts = projectYear.split("-");
          if (parts.length >= 1) {
            const year = parts[0].trim();
            if (/^\d{4}$/.test(year)) {
              years.add(year);
            }
          }
        }
        // Extract year from MM/DD/YYYY format
        else if (projectYear.includes("/")) {
          const parts = projectYear.split("/");
          if (parts.length === 3) {
            const year = parts[2].trim();
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
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  // Filter projects by selected year (all months)
  const yearFilteredProjects = React.useMemo(() => {
    return projects.filter((project) => {
      if (!project.year) return false;
      const projectYear = project.year.toString().trim();
      
      // Check if it's YYYY-MM-DD format
      if (projectYear.includes("-")) {
        const parts = projectYear.split("-");
        if (parts.length >= 1) {
          const year = parts[0].trim();
          return year === selectedYear;
        }
      }
      // Check if it's MM/DD/YYYY format
      else if (projectYear.includes("/")) {
        const parts = projectYear.split("/");
        if (parts.length === 3) {
          const year = parts[2].trim();
          return year === selectedYear;
        }
      }
      // If it's just YYYY
      else if (/^\d{4}$/.test(projectYear)) {
        return projectYear === selectedYear;
      }
      
      return false;
    });
  }, [projects, selectedYear]);

  // Calculate totals for each stream - excluding Home Office / Studio
  const streamTotals = React.useMemo(() => {
    const totals = {};
    
    STREAMS.forEach((stream) => {
      const streamProjects = yearFilteredProjects.filter((project) => {
        // Exclude Home Office / Studio projects
        if (project.classification === "Home Office / Studio") {
          return false;
        }
        
        const projectStream = (project.stream || "").trim();
        const streamNormalized = stream.trim();
        
        // Handle stream name variations (same as Sales page)
        if (streamNormalized === "Pumped On Property") {
          return projectStream === "Pumped On Property" || 
                 projectStream === "Pumped on Property" ||
                 projectStream.toLowerCase() === "pumped on property";
        }
        if (streamNormalized === "Create Cash Flow") {
          return projectStream === "Create Cash Flow" || 
                 projectStream === "Creat Cash Flow" ||
                 projectStream.toLowerCase() === "create cash flow";
        }
        // Exact match first
        if (projectStream === streamNormalized) {
          return true;
        }
        // Case-insensitive match as fallback
        return projectStream.toLowerCase() === streamNormalized.toLowerCase();
      });
      
      const salesCount = streamProjects.length;
      const totalCost = streamProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      totals[stream] = {
        salesCount,
        totalCost,
      };
    });
    
    return totals;
  }, [yearFilteredProjects]);

  // Calculate green streams total
  const greenStreamsTotal = React.useMemo(() => {
    let totalSales = 0;
    let totalCost = 0;
    
    GREEN_STREAMS.forEach((stream) => {
      const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
      totalSales += totals.salesCount;
      totalCost += totals.totalCost;
    });
    
    return { salesCount: totalSales, totalCost };
  }, [streamTotals]);

  // Calculate Home Office / Studio total
  const homeOfficeStudioTotal = React.useMemo(() => {
    const homeOfficeProjects = yearFilteredProjects.filter((project) => {
      const classification = (project.classification || "").trim();
      return classification === "Home Office / Studio";
    });
    
    const salesCount = homeOfficeProjects.length;
    const totalCost = homeOfficeProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);
    
    return { salesCount, totalCost };
  }, [yearFilteredProjects]);

  // Debug: Log stream matching
  React.useEffect(() => {
    const allStreams = new Set();
    yearFilteredProjects.forEach((project) => {
      if (project.stream) {
        allStreams.add(project.stream);
      }
    });
    console.log("All unique streams in filtered projects:", Array.from(allStreams));
    console.log("Stream totals:", streamTotals);
  }, [yearFilteredProjects, streamTotals]);

  // Calculate state-based totals (VIC and QLD) - excluding Home Office / Studio
  const stateTotals = React.useMemo(() => {
    const vicProjects = yearFilteredProjects.filter((project) => {
      // Exclude Home Office / Studio projects
      if (project.classification === "Home Office / Studio") {
        return false;
      }
      const state = (project.state || "").trim().toUpperCase();
      return state === "VIC" || state === "VICTORIA";
    });
    
    const qldProjects = yearFilteredProjects.filter((project) => {
      // Exclude Home Office / Studio projects
      if (project.classification === "Home Office / Studio") {
        return false;
      }
      const state = (project.state || "").trim().toUpperCase();
      return state === "QLD" || state === "QUEENSLAND";
    });
    
    const vicSales = vicProjects.length;
    const vicCost = vicProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);
    const vicAverage = vicSales > 0 ? Math.round(vicCost / vicSales) : 0;
    
    const qldSales = qldProjects.length;
    const qldCost = qldProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);
    const qldAverage = qldSales > 0 ? Math.round(qldCost / qldSales) : 0;
    
    return {
      VIC: { salesCount: vicSales, totalCost: vicCost, averagePrice: vicAverage },
      QLD: { salesCount: qldSales, totalCost: qldCost, averagePrice: qldAverage },
    };
  }, [yearFilteredProjects]);

  // Calculate grand totals
  const grandTotal = React.useMemo(() => {
    const totalSales = Object.values(streamTotals).reduce((sum, stream) => sum + stream.salesCount, 0);
    const totalCost = Object.values(streamTotals).reduce((sum, stream) => sum + stream.totalCost, 0);
    return { totalSales, totalCost };
  }, [streamTotals]);

  // Format number with commas
  function formatCurrency(amount) {
    if (!amount || amount === 0) return "$0";
    return `$${amount.toLocaleString()}`;
  }

  // Format stream name into 2 lines for consistent height
  function formatStreamName(stream) {
    const streamUpper = stream.toUpperCase();
    switch (stream) {
      case "SGF - VIC":
        return { line1: "SGF - VIC", line2: " " };
      case "SGF - QLD":
        return { line1: "SGF - QLD", line2: " " };
      case "Dual Dwelling":
        return { line1: "DUAL", line2: "DWELLING" };
      case "ATA":
        return { line1: "ATA", line2: " " };
      case "Pumped On Property":
        return { line1: "PUMPED ON", line2: "PROPERTY" };
      case "Henderson":
        return { line1: "HENDERSON", line2: " " };
      case "Create Cash Flow":
        return { line1: "CREATE CASH", line2: "FLOW" };
      case "Maple Group":
        return { line1: "MAPLE", line2: "GROUP" };
      default:
        // Fallback: split by space or use first part
        const parts = streamUpper.split(" ");
        if (parts.length >= 2) {
          const mid = Math.ceil(parts.length / 2);
          return { line1: parts.slice(0, mid).join(" "), line2: parts.slice(mid).join(" ") };
        }
        return { line1: streamUpper, line2: " " };
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
            Sales Totals
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
            gap: "8px",
            color: MONUMENT,
          }}
        >
          <Link
            to="/sales"
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
            ← Back to Sales
          </Link>
          <Link
            to="/sales-analytics"
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
            Analytics
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
            overflowX: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "24px" }}>
            Year Totals for {selectedYear}
          </h2>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {/* Stream Totals Grid - 9 columns, 1 row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(9, 1fr)",
                  gap: "16px",
                  marginBottom: "24px",
                }}
              >
                {/* Column 1: SGF - VIC */}
                {(() => {
                  const stream = "SGF - VIC";
                  const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
                  const colors = STREAM_COLORS[stream];
                  return (
                    <div
                      key={stream}
                      style={{
                        background: colors.lighter,
                        borderRadius: "12px",
                        padding: "16px",
                        border: `2px solid ${colors.darker}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          background: colors.darker,
                          color: WHITE,
                          padding: "10px 12px",
                          borderRadius: "8px",
                          marginBottom: "12px",
                          textAlign: "center",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          letterSpacing: "0.5px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          minHeight: "40px",
                          lineHeight: "1.2",
                        }}
                      >
                        <div>{formatStreamName(stream).line1}</div>
                        <div>{formatStreamName(stream).line2}</div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          flex: 1,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                            Sales Count
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                            {totals.salesCount}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                            Total Value
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                            {formatCurrency(totals.totalCost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Column 2: SGF - QLD */}
                {(() => {
                  const stream = "SGF - QLD";
                  const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
                  const colors = STREAM_COLORS[stream];
                  return (
                    <div
                      key={stream}
                      style={{
                        background: colors.lighter,
                        borderRadius: "12px",
                        padding: "16px",
                        border: `2px solid ${colors.darker}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          background: colors.darker,
                          color: WHITE,
                          padding: "10px 12px",
                          borderRadius: "8px",
                          marginBottom: "12px",
                          textAlign: "center",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          letterSpacing: "0.5px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          minHeight: "40px",
                          lineHeight: "1.2",
                        }}
                      >
                        <div>{formatStreamName(stream).line1}</div>
                        <div>{formatStreamName(stream).line2}</div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          flex: 1,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                            Sales Count
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                            {totals.salesCount}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                            Total Value
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                            {formatCurrency(totals.totalCost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Columns 3-8: Green Streams */}
                {GREEN_STREAMS.map((stream) => {
                  const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
                  const colors = STREAM_COLORS[stream];
                  
                  return (
                    <div
                      key={stream}
                      style={{
                        background: colors.lighter,
                        borderRadius: "12px",
                        padding: "16px",
                        border: `2px solid ${colors.darker}`,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          background: colors.darker,
                          color: WHITE,
                          padding: "10px 12px",
                          borderRadius: "8px",
                          marginBottom: "12px",
                          textAlign: "center",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          letterSpacing: "0.5px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          minHeight: "40px",
                          lineHeight: "1.2",
                        }}
                      >
                        <div>{formatStreamName(stream).line1}</div>
                        <div>{formatStreamName(stream).line2}</div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          flex: 1,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                            Sales Count
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                            {totals.salesCount}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                            Total Value
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                            {formatCurrency(totals.totalCost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Column 9: Green Streams TOTAL */}
                <div
                  style={{
                    background: "#CEEAB0",
                    borderRadius: "12px",
                    padding: "16px",
                    border: `2px solid #92D050`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      background: "#92D050",
                      color: WHITE,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      marginBottom: "12px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      letterSpacing: "0.5px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      minHeight: "40px",
                      lineHeight: "1.2",
                    }}
                  >
                    <div>TOTAL</div>
                    <div> </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      flex: 1,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                        Sales Count
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                        {greenStreamsTotal.salesCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                        Total Value
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                        {formatCurrency(greenStreamsTotal.totalCost)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Grand Total Section - 4 Columns */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "16px",
                  minWidth: 0,
                }}
              >
                {/* Column 1: VIC Total and Home Office / Studio */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  {/* VIC Total */}
                  <div
                    style={{
                      background: MONUMENT,
                      borderRadius: "12px",
                      padding: "20px",
                      border: `2px solid ${MONUMENT}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div
                      style={{
                        background: "#4D93D9",
                        color: WHITE,
                        padding: "10px 12px",
                        borderRadius: "8px",
                        marginBottom: "16px",
                        textAlign: "center",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        letterSpacing: "0.5px",
                      }}
                    >
                      VIC TOTAL
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div>
                        <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                          Sales
                        </div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                          {stateTotals.VIC.salesCount}
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
                          <div style={{ fontSize: "0.8rem", color: "#a1a1a3" }}>
                            Value
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#a1a1a3" }}>
                            Average Price
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                            {formatCurrency(stateTotals.VIC.totalCost)}
                          </div>
                          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                            {formatCurrency(stateTotals.VIC.averagePrice)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Home Office Total */}
                  <div
                    style={{
                      background: MONUMENT,
                      borderRadius: "12px",
                      padding: "12px",
                      border: `2px solid ${MONUMENT}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div
                      style={{
                        background: "#FFD54F",
                        color: MONUMENT,
                        padding: "6px 8px",
                        borderRadius: "6px",
                        marginBottom: "8px",
                        textAlign: "center",
                        fontWeight: 600,
                        fontSize: "0.7rem",
                        letterSpacing: "0.5px",
                      }}
                    >
                      HOME OFFICE
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "#a1a1a3", marginBottom: "2px" }}>
                          Sales
                        </div>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: WHITE }}>
                          {homeOfficeStudioTotal.salesCount}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "#a1a1a3", marginBottom: "2px" }}>
                          Value
                        </div>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: WHITE }}>
                          {formatCurrency(homeOfficeStudioTotal.totalCost)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Column 2: QLD Total */}
                <div
                  style={{
                    background: MONUMENT,
                    borderRadius: "12px",
                    padding: "20px",
                    border: `2px solid ${MONUMENT}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    alignSelf: "flex-start",
                  }}
                >
                  <div
                    style={{
                      background: "#D54358",
                      color: WHITE,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      marginBottom: "16px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      letterSpacing: "0.5px",
                    }}
                  >
                    QLD TOTAL
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Sales
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {stateTotals.QLD.salesCount}
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "4px" }}>
                        <div style={{ fontSize: "0.8rem", color: "#a1a1a3" }}>
                          Value
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#a1a1a3" }}>
                          Average Price
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                          {formatCurrency(stateTotals.QLD.totalCost)}
                        </div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                          {formatCurrency(stateTotals.QLD.averagePrice)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Column 3: Empty */}
                <div></div>
                
                {/* Column 4: Grand Total */}
                <div
                  style={{
                    background: MONUMENT,
                    borderRadius: "12px",
                    padding: "20px",
                    border: `2px solid ${MONUMENT}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    alignSelf: "flex-start",
                  }}
                >
                  <div
                    style={{
                      color: WHITE,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      marginBottom: "16px",
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      letterSpacing: "0.5px",
                      background: MONUMENT,
                    }}
                  >
                    GRAND TOTAL
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Total Sales
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {grandTotal.totalSales}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Total Value
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {formatCurrency(grandTotal.totalCost)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
