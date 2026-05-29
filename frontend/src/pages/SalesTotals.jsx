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
  "Fresh Start Advisory",
];

// Green streams (for total calculation)
const GREEN_STREAMS = [
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
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
  "Fresh Start Advisory": { darker: "#92D050", lighter: "#CEEAB0" },
  "Home Office / Studio": { darker: "#FF8C42", lighter: "#FFD4B3" },
};

export default function SalesTotals() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
  });

  // Modal shown when user clicks the VIC/QLD total rectangles.
  // "VIC" | "QLD" | null
  const [stateJobsModalState, setStateJobsModalState] = useState(null);
  const todayISO = React.useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    if (!stateJobsModalState) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [stateJobsModalState]);

  useEffect(() => {
    if (!stateJobsModalState) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setStateJobsModalState(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stateJobsModalState]);

  function openStateJobsModal(state) {
    setStateJobsModalState(state);
  }

  function closeStateJobsModal() {
    setStateJobsModalState(null);
  }

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
      // Exclude Hotlist status projects
      const filteredData = data.filter((project) => project.status !== "Hotlist");
      setProjects(filteredData);
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

  // Calculate green streams VIC/QLD breakdown
  const greenStreamsStateBreakdown = React.useMemo(() => {
    const greenStreamProjects = yearFilteredProjects.filter((project) => {
      // Exclude Home Office / Studio projects
      if (project.classification === "Home Office / Studio") {
        return false;
      }
      
      const projectStream = (project.stream || "").trim();
      return GREEN_STREAMS.some((stream) => {
        const streamNormalized = stream.trim();
        // Handle stream name variations
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
    });
    
    const vicCount = greenStreamProjects.filter((project) => {
      const state = (project.state || "").trim().toUpperCase();
      return state === "VIC" || state === "VICTORIA";
    }).length;
    
    const qldCount = greenStreamProjects.filter((project) => {
      const state = (project.state || "").trim().toUpperCase();
      return state === "QLD" || state === "QUEENSLAND";
    }).length;
    
    return { vic: vicCount, qld: qldCount };
  }, [yearFilteredProjects]);

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

  const MS_PER_DAY = 86400000;

  /**
   * How far through the selected calendar year we are (Jan 1 .. today, inclusive of today),
   * as a fraction and percentage. Uses actual days in year (365/366).
   */
  function getCalendarYearProgressMeta(yearStr) {
    const yearNum = parseInt(String(yearStr).trim(), 10);
    if (!Number.isFinite(yearNum)) return null;

    const now = new Date();
    const nowY = now.getFullYear();
    const jan1 = new Date(yearNum, 0, 1);
    jan1.setHours(0, 0, 0, 0);
    const jan1NextYear = new Date(yearNum + 1, 0, 1);
    jan1NextYear.setHours(0, 0, 0, 0);
    const daysInYear = Math.round((jan1NextYear.getTime() - jan1.getTime()) / MS_PER_DAY);

    if (yearNum < nowY) {
      return {
        daysInYear,
        daysElapsed: daysInYear,
        fraction: 1,
        percentThrough: 100,
        mode: "complete",
      };
    }
    if (yearNum > nowY) {
      return {
        daysInYear,
        daysElapsed: 0,
        fraction: 0,
        percentThrough: 0,
        mode: "future",
      };
    }

    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysSinceJan1 = Math.floor((today0.getTime() - jan1.getTime()) / MS_PER_DAY);
    const daysElapsed = Math.min(daysInYear, Math.max(1, daysSinceJan1 + 1));
    const fraction = daysElapsed / daysInYear;
    const percentThrough = Math.min(100, Math.round(fraction * 1000) / 10);
    return {
      daysInYear,
      daysElapsed,
      fraction,
      percentThrough,
      mode: "ytd",
    };
  }

  const calendarYearMeta = getCalendarYearProgressMeta(selectedYear);
  const yearProgressFraction = calendarYearMeta
    ? Math.max(calendarYearMeta.fraction, 1 / calendarYearMeta.daysInYear)
    : 0;

  function projectedEndOfYearForCost(totalCost) {
    if (!calendarYearMeta || calendarYearMeta.mode === "future" || !(yearProgressFraction > 0)) {
      return null;
    }
    const n = Number(totalCost) || 0;
    return Math.round(n / yearProgressFraction);
  }

  function projectedEndOfYearForCount(count) {
    if (!calendarYearMeta || calendarYearMeta.mode === "future" || !(yearProgressFraction > 0)) {
      return null;
    }
    const n = Number(count) || 0;
    return Math.round(n / yearProgressFraction);
  }

  const projectedYearEndValue = projectedEndOfYearForCost(grandTotal.totalCost);
  const projectedYearEndSales = projectedEndOfYearForCount(grandTotal.totalSales);

  const projectedSgfVicValue = projectedEndOfYearForCost((streamTotals["SGF - VIC"] || { totalCost: 0 }).totalCost);
  const projectedSgfQldValue = projectedEndOfYearForCost((streamTotals["SGF - QLD"] || { totalCost: 0 }).totalCost);
  const projectedGreenStreamsValue = projectedEndOfYearForCost(greenStreamsTotal.totalCost);
  const projectedVicStateValue = projectedEndOfYearForCost(stateTotals.VIC.totalCost);
  const projectedQldStateValue = projectedEndOfYearForCost(stateTotals.QLD.totalCost);

  const RANGE_START_ISO = "2026-01-01";

  function normalizeProjectYearToISO(yearValue) {
    if (!yearValue) return null;
    const v = yearValue.toString().trim();
    if (!v) return null;

    // Already in YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

    // Legacy: YYYY only -> interpret as Jan 1st
    if (/^\d{4}$/.test(v)) return `${v}-01-01`;

    // Legacy: MM/DD/YYYY or DD/MM/YYYY
    if (v.includes("/")) {
      const parts = v.split("/").map((p) => p.trim());
      if (parts.length === 3) {
        const part1 = parts[0];
        const part2 = parts[1];
        const part3 = parts[2];

        if (!/^\d{4}$/.test(part3)) return null;

        // If part1 > 12 assume DD/MM/YYYY, else MM/DD/YYYY
        const day = parseInt(part1, 10) > 12 ? part1 : part2;
        const month = parseInt(part1, 10) > 12 ? part2 : part1;
        const year = part3;

        const dd = String(parseInt(day, 10)).padStart(2, "0");
        const mm = String(parseInt(month, 10)).padStart(2, "0");
        return `${year}-${mm}-${dd}`;
      }
    }

    return null;
  }

  function isHomeOfficeStudio(project) {
    return (project?.classification || "").trim() === "Home Office / Studio";
  }

  function isVICProject(project) {
    const state = (project.state || "").trim().toUpperCase();
    return state === "VIC" || state === "VICTORIA";
  }

  function isQLDProject(project) {
    const state = (project.state || "").trim().toUpperCase();
    return state === "QLD" || state === "QUEENSLAND";
  }

  function getProjectCostDisplay(project) {
    if (!project?.project_cost) return "";
    const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || "0", 10);
    if (!cost) return "";
    return `$${cost.toLocaleString()}`;
  }

  const vicJobs2026ToDate = React.useMemo(() => {
    return projects
      .map((project) => ({ project, isoStart: normalizeProjectYearToISO(project.year) }))
      .filter(({ project, isoStart }) => {
        if (!isoStart) return false;
        if (isoStart < RANGE_START_ISO || isoStart > todayISO) return false;
        if (isHomeOfficeStudio(project)) return false;
        return isVICProject(project);
      })
      .sort((a, b) => b.isoStart.localeCompare(a.isoStart))
      .map(({ project, isoStart }) => ({ project, isoStart }));
  }, [projects, todayISO]);

  const qldJobs2026ToDate = React.useMemo(() => {
    return projects
      .map((project) => ({ project, isoStart: normalizeProjectYearToISO(project.year) }))
      .filter(({ project, isoStart }) => {
        if (!isoStart) return false;
        if (isoStart < RANGE_START_ISO || isoStart > todayISO) return false;
        if (isHomeOfficeStudio(project)) return false;
        return isQLDProject(project);
      })
      .sort((a, b) => b.isoStart.localeCompare(a.isoStart))
      .map(({ project, isoStart }) => ({ project, isoStart }));
  }, [projects, todayISO]);

  const stateJobsModalProjects =
    stateJobsModalState === "VIC"
      ? vicJobs2026ToDate
      : stateJobsModalState === "QLD"
        ? qldJobs2026ToDate
        : [];

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
      case "Fresh Start Advisory":
        return { line1: "FRESH START", line2: "ADVISORY" };
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
            gap: "18px",
            color: MONUMENT,
          }}
        >
          {/* Analytics - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
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
          
          <div style={{ flex: 1 }} />
          
          {/* Back to Sales - Light Red */}
          <div style={{ background: "#F79198", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
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
            overflowX: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            justifyContent: "space-between",
          }}
        >

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {/* Stream Totals Grid - 4 columns, 1 row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: "16px",
                }}
              >
                {/* Column 1: SGF - VIC */}
                {(() => {
                  const stream = "SGF - VIC";
                  const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
                  const colors = STREAM_COLORS[stream];
                  const projected = projectedSgfVicValue;
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
                          fontSize: "1.5rem",
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
                          gap: "8px",
                          flex: 1,
                          marginBottom: "12px",
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
                      </div>
                      <div style={{ marginTop: "auto", borderTop: `1px solid ${colors.darker}`, paddingTop: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-end",
                            gap: "10px",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                              Total Value
                            </div>
                            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                              {formatCurrency(totals.totalCost)}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                              Projected
                            </div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}>
                              {projected != null ? formatCurrency(projected) : "—"}
                            </div>
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
                  const projected = projectedSgfQldValue;
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
                          fontSize: "1.5rem",
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
                          gap: "8px",
                          flex: 1,
                          marginBottom: "12px",
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
                      </div>
                      <div style={{ marginTop: "auto", borderTop: `1px solid ${colors.darker}`, paddingTop: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-end",
                            gap: "10px",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                              Total Value
                            </div>
                            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                              {formatCurrency(totals.totalCost)}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                              Projected
                            </div>
                            <div style={{ fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}>
                              {projected != null ? formatCurrency(projected) : "—"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {/* Column 3: Green Streams Combined */}
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
                      fontSize: "1.5rem",
                      letterSpacing: "0.5px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      minHeight: "40px",
                      lineHeight: "1.2",
                    }}
                  >
                    <div>GREEN STREAMS</div>
                    <div> </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      flex: 1,
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px", display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ flex: "1 1 auto", minWidth: 0 }}>Sales Count</span>
                        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: "30px" }}>Sales</span>
                        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: "80px" }}>VIC / QLD</span>
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT, display: "flex", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ flex: "1 1 auto", minWidth: 0 }}>{greenStreamsTotal.salesCount}</span>
                        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: "30px" }}></span>
                        <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: "80px", fontSize: "1rem" }}>{greenStreamsStateBreakdown.vic} / {greenStreamsStateBreakdown.qld}</span>
                      </div>
                    </div>
                    {GREEN_STREAMS.map((stream) => {
                      const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
                      return (
                        <div
                          key={stream}
                          style={{
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            padding: "3px 0",
                            lineHeight: "1.3",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <span style={{ flex: "1 1 auto", minWidth: 0 }}>{stream}</span>
                          <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: "30px" }}>{totals.salesCount}</span>
                          <span style={{ flex: "0 0 auto", textAlign: "right", minWidth: "80px" }}>{formatCurrency(totals.totalCost)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: "auto", borderTop: `1px solid #92D050`, paddingTop: "12px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: "10px",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                          Total Value
                        </div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                          {formatCurrency(greenStreamsTotal.totalCost)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                          Projected
                        </div>
                        <div style={{ fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}>
                          {projectedGreenStreamsValue != null ? formatCurrency(projectedGreenStreamsValue) : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Column 4: Home Office / Studio */}
                <div
                  style={{
                    background: "#FFD4B3",
                    borderRadius: "12px",
                    padding: "16px",
                    border: `2px solid #FF8C42`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      background: "#FF8C42",
                      color: WHITE,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      marginBottom: "12px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "1.5rem",
                      letterSpacing: "0.5px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      minHeight: "40px",
                      lineHeight: "1.2",
                    }}
                  >
                    <div>HOME OFFICE</div>
                    <div> </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      flex: 1,
                      marginBottom: "12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                        Sales Count
                      </div>
                      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                        {homeOfficeStudioTotal.salesCount}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "auto", borderTop: `1px solid #FF8C42`, paddingTop: "12px" }}>
                    <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>
                      Total Value
                    </div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                      {formatCurrency(homeOfficeStudioTotal.totalCost)}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Grand Total Section - 3 Columns */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "16px",
                  minWidth: 0,
                }}
              >
                {/* Column 1: VIC Total */}
                <div
                  style={{
                    background: MONUMENT,
                    borderRadius: "12px",
                    padding: "20px",
                    border: `2px solid ${MONUMENT}`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    cursor: "pointer",
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openStateJobsModal("VIC")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openStateJobsModal("VIC");
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      columnGap: "16px",
                      rowGap: "12px",
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Total Sales
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {stateTotals.VIC.salesCount}
                      </div>
                    </div>
                    <div
                      style={{
                        borderLeft: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>Average price</div>
                      <div style={{ fontSize: "1.15rem", fontWeight: 600, color: WHITE, lineHeight: 1.35 }}>
                        {formatCurrency(stateTotals.VIC.averagePrice)}
                      </div>
                      <span
                        aria-hidden
                        style={{
                          display: "block",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          color: "#a1a1a3",
                          marginTop: "3px",
                          lineHeight: 1.35,
                          visibility: "hidden",
                        }}
                      >
                        Day 000 of 000
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Total Value
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {formatCurrency(stateTotals.VIC.totalCost)}
                      </div>
                    </div>
                    <div
                      style={{
                        borderLeft: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Projected year-end value
                      </div>
                      {!calendarYearMeta ? (
                        <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>—</div>
                      ) : calendarYearMeta.mode === "future" ? (
                        <div style={{ fontSize: "1rem", fontWeight: 600, color: WHITE, opacity: 0.85 }}>—</div>
                      ) : (
                        <>
                          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>
                            {projectedVicStateValue != null ? formatCurrency(projectedVicStateValue) : "—"}
                          </div>
                        </>
                      )}
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
                    cursor: "pointer",
                  }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openStateJobsModal("QLD")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openStateJobsModal("QLD");
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      columnGap: "16px",
                      rowGap: "12px",
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Total Sales
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {stateTotals.QLD.salesCount}
                      </div>
                    </div>
                    <div
                      style={{
                        borderLeft: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>Average price</div>
                      <div style={{ fontSize: "1.15rem", fontWeight: 600, color: WHITE, lineHeight: 1.35 }}>
                        {formatCurrency(stateTotals.QLD.averagePrice)}
                      </div>
                      <span
                        aria-hidden
                        style={{
                          display: "block",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          color: "#a1a1a3",
                          marginTop: "3px",
                          lineHeight: 1.35,
                          visibility: "hidden",
                        }}
                      >
                        Day 000 of 000
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Total Value
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {formatCurrency(stateTotals.QLD.totalCost)}
                      </div>
                    </div>
                    <div
                      style={{
                        borderLeft: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Projected year-end value
                      </div>
                      {!calendarYearMeta ? (
                        <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>—</div>
                      ) : calendarYearMeta.mode === "future" ? (
                        <div style={{ fontSize: "1rem", fontWeight: 600, color: WHITE, opacity: 0.85 }}>—</div>
                      ) : (
                        <>
                          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>
                            {projectedQldStateValue != null ? formatCurrency(projectedQldStateValue) : "—"}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Column 3: Grand Total */}
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
                      background:
                        "linear-gradient(90deg, #4D93D9 0%, #2ca84a 28%, #e6c619 56%, #e85d04 100%)",
                      color: WHITE,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      marginBottom: "16px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      letterSpacing: "0.5px",
                      textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                    }}
                  >
                    GRAND TOTAL
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                      columnGap: "16px",
                      rowGap: "12px",
                      alignItems: "start",
                    }}
                  >
                    <div
                      style={{
                        paddingBottom: "4px",
                        borderBottom: "1px solid #4a4d55",
                        gridColumn: "1",
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>Year</div>
                      <div style={{ fontSize: "1.15rem", fontWeight: 600, color: WHITE, lineHeight: 1.35 }}>
                        {selectedYear}
                      </div>
                    </div>
                    <div
                      style={{
                        paddingBottom: "4px",
                        borderBottom: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        borderLeft: "1px solid #4a4d55",
                        gridColumn: "2",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>Progress</div>
                      {!calendarYearMeta ? (
                        <div style={{ fontSize: "1.15rem", fontWeight: 600, color: WHITE, opacity: 0.85 }}>—</div>
                      ) : calendarYearMeta.mode === "future" ? (
                        <div style={{ fontSize: "1rem", fontWeight: 600, color: WHITE, opacity: 0.85 }}>Not started</div>
                      ) : (
                        <div style={{ fontSize: "1.15rem", fontWeight: 600, color: WHITE, lineHeight: 1.35 }}>
                          {calendarYearMeta.percentThrough}%
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.72rem",
                              fontWeight: 500,
                              color: "#a1a1a3",
                              marginTop: "3px",
                            }}
                          >
                            Day {calendarYearMeta.daysElapsed} of {calendarYearMeta.daysInYear}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>Total Sales</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>{grandTotal.totalSales}</div>
                    </div>
                    <div
                      style={{
                        borderLeft: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Projected Sales
                      </div>
                      {!calendarYearMeta || calendarYearMeta.mode === "future" ? (
                        <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2, opacity: 0.85 }}>
                          —
                        </div>
                      ) : (
                        <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>
                          {projectedYearEndSales != null ? projectedYearEndSales : "—"}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>Total Value</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: WHITE }}>
                        {formatCurrency(grandTotal.totalCost)}
                      </div>
                    </div>
                    <div
                      style={{
                        borderLeft: "1px solid #4a4d55",
                        paddingLeft: "14px",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" }}>
                        Projected Value
                      </div>
                      {!calendarYearMeta || calendarYearMeta.mode === "future" ? (
                        <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2, opacity: 0.85 }}>
                          —
                        </div>
                      ) : (
                        <div style={{ fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 }}>
                          {projectedYearEndValue != null ? formatCurrency(projectedYearEndValue) : "—"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* State jobs modal (2026 to date) */}
      {stateJobsModalState && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            overflow: "hidden",
            padding: "16px",
          }}
          onClick={closeStateJobsModal}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div
            style={{
              backgroundColor: WHITE,
              padding: "24px",
              borderRadius: "8px",
              minWidth: "760px",
              maxWidth: "95%",
              maxHeight: "80vh",
              overflow: "hidden",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.25rem", color: MONUMENT }}>
                  {stateJobsModalState} jobs
                </h2>
                <div style={{ fontSize: "0.95rem", color: MONUMENT, marginTop: "6px", opacity: 0.85 }}>
                  {RANGE_START_ISO} to {todayISO}
                </div>
                <div style={{ fontSize: "0.85rem", color: MONUMENT, marginTop: "4px", opacity: 0.85 }}>
                  Total: {stateJobsModalProjects.length}
                </div>
              </div>
              <button
                onClick={closeStateJobsModal}
                style={{
                  padding: "8px 12px",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  cursor: "pointer",
                  height: "fit-content",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: "16px", overflowY: "auto", flex: 1 }}>
              {stateJobsModalProjects.length === 0 ? (
                <div style={{ color: MONUMENT, opacity: 0.85, padding: "12px 4px" }}>
                  No jobs found for this range.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.92rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f3f3f3" }}>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Start</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Project</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Stream</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Cost</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Client</th>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateJobsModalProjects.map(({ project, isoStart }) => {
                      const projectLabel =
                        project?.suburb && project?.street
                          ? `${project.suburb.toUpperCase()} - ${project.street}`
                          : project?.name || "Unknown Project";
                      const clientLabel = project?.client_name || project?.client1_name || "";
                      return (
                        <tr key={project.id} style={{ borderTop: "1px solid #eee" }}>
                          <td style={{ padding: "10px", whiteSpace: "nowrap", color: MONUMENT, opacity: 0.9 }}>
                            {isoStart}
                          </td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.95 }}>
                            {projectLabel}
                          </td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.9 }}>{project?.stream || ""}</td>
                          <td style={{ padding: "10px", whiteSpace: "nowrap", color: MONUMENT, opacity: 0.95 }}>
                            {getProjectCostDisplay(project)}
                          </td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.9 }}>{clientLabel}</td>
                          <td style={{ padding: "10px", color: MONUMENT, opacity: 0.9 }}>{project?.status || ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
