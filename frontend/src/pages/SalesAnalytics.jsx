import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

// Stream color mapping
const STREAM_COLORS = {
  "SGF - VIC": { darker: "#4D93D9", lighter: "#A6C9EC" },
  "SGF - QLD": { darker: "#D54358", lighter: "#F79198" },
  "Green Streams": { darker: "#92D050", lighter: "#CEEAB0" },
};

// Green streams (for total calculation)
const GREEN_STREAMS = [
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

export default function SalesAnalytics() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
  });
  const [selectedView, setSelectedView] = useState("pie"); // "pie" or "bar"
  const [showLastYear, setShowLastYear] = useState(false);
  const [showTotals, setShowTotals] = useState(true);

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

  // Filter projects by selected year (all months) - excluding Home Office / Studio
  const yearFilteredProjects = React.useMemo(() => {
    return projects.filter((project) => {
      // Exclude Home Office / Studio projects
      if (project.classification === "Home Office / Studio") {
        return false;
      }
      
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

  // Calculate totals for pie chart
  const pieData = React.useMemo(() => {
    // SGF - VIC total
    const vicProjects = yearFilteredProjects.filter((project) => {
      const projectStream = (project.stream || "").trim();
      return projectStream === "SGF - VIC";
    });
    const vicTotal = vicProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);

    // SGF - QLD total
    const qldProjects = yearFilteredProjects.filter((project) => {
      const projectStream = (project.stream || "").trim();
      return projectStream === "SGF - QLD";
    });
    const qldTotal = qldProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);

    // Green Streams total
    let greenTotal = 0;
    GREEN_STREAMS.forEach((stream) => {
      const streamProjects = yearFilteredProjects.filter((project) => {
        const projectStream = (project.stream || "").trim();
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
        if (projectStream === streamNormalized) {
          return true;
        }
        return projectStream.toLowerCase() === streamNormalized.toLowerCase();
      });
      
      const streamTotal = streamProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      greenTotal += streamTotal;
    });

    const total = vicTotal + qldTotal + greenTotal;
    
    return [
      {
        name: "SGF - VIC",
        value: vicTotal,
        percentage: total > 0 ? (vicTotal / total) * 100 : 0,
        color: STREAM_COLORS["SGF - VIC"].darker,
      },
      {
        name: "SGF - QLD",
        value: qldTotal,
        percentage: total > 0 ? (qldTotal / total) * 100 : 0,
        color: STREAM_COLORS["SGF - QLD"].darker,
      },
      {
        name: "Green Streams",
        value: greenTotal,
        percentage: total > 0 ? (greenTotal / total) * 100 : 0,
        color: STREAM_COLORS["Green Streams"].darker,
      },
    ];
  }, [yearFilteredProjects]);

  // Calculate previous year pie data for comparison
  const previousYearPieData = React.useMemo(() => {
    if (!showLastYear) return null;
    
    const previousYear = (parseInt(selectedYear) - 1).toString();
    const prevYearProjects = projects.filter((project) => {
      // Exclude Home Office / Studio projects
      if (project.classification === "Home Office / Studio") {
        return false;
      }
      
      if (!project.year) return false;
      const projectYear = project.year.toString().trim();
      
      // Check if it's YYYY-MM-DD format
      if (projectYear.includes("-")) {
        const parts = projectYear.split("-");
        if (parts.length >= 1) {
          const year = parts[0].trim();
          return year === previousYear;
        }
      }
      // Check if it's MM/DD/YYYY format
      else if (projectYear.includes("/")) {
        const parts = projectYear.split("/");
        if (parts.length === 3) {
          const year = parts[2].trim();
          return year === previousYear;
        }
      }
      // If it's just YYYY
      else if (/^\d{4}$/.test(projectYear)) {
        return projectYear === previousYear;
      }
      
      return false;
    });
    
    // SGF - VIC total
    const vicProjects = prevYearProjects.filter((project) => {
      const projectStream = (project.stream || "").trim();
      return projectStream === "SGF - VIC";
    });
    const vicTotal = vicProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);

    // SGF - QLD total
    const qldProjects = prevYearProjects.filter((project) => {
      const projectStream = (project.stream || "").trim();
      return projectStream === "SGF - QLD";
    });
    const qldTotal = qldProjects.reduce((sum, project) => {
      if (project?.project_cost) {
        const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
        return sum + cost;
      }
      return sum;
    }, 0);

    // Green Streams total
    let greenTotal = 0;
    GREEN_STREAMS.forEach((stream) => {
      const streamProjects = prevYearProjects.filter((project) => {
        const projectStream = (project.stream || "").trim();
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
        if (projectStream === streamNormalized) {
          return true;
        }
        return projectStream.toLowerCase() === streamNormalized.toLowerCase();
      });
      
      const streamTotal = streamProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      greenTotal += streamTotal;
    });

    const total = vicTotal + qldTotal + greenTotal;
    
    return {
      vic: vicTotal,
      qld: qldTotal,
      green: greenTotal,
      total: total,
    };
  }, [projects, selectedYear, showLastYear]);

  // Calculate monthly totals for bar chart (VIC and QLD breakdown)
  const monthlyData = React.useMemo(() => {
    const months = [];
    
    for (let i = 0; i < 12; i++) {
      const monthNumber = String(i + 1).padStart(2, "0");
      const monthName = MONTHS[i];
      
      const monthProjects = yearFilteredProjects.filter((project) => {
        if (!project.year) return false;
        const projectYear = project.year.toString().trim();
        
        // Check if it's YYYY-MM-DD format
        if (projectYear.includes("-")) {
          const parts = projectYear.split("-");
          if (parts.length >= 2) {
            const year = parts[0].trim();
            const month = parts[1].trim().padStart(2, "0");
            return year === selectedYear && month === monthNumber;
          }
        }
        // Check if it's MM/DD/YYYY format
        else if (projectYear.includes("/")) {
          const parts = projectYear.split("/");
          if (parts.length === 3) {
            const month = parts[0].trim().padStart(2, "0");
            const year = parts[2].trim();
            return year === selectedYear && month === monthNumber;
          }
        }
        return false;
      });
      
      // Helper function to check if a project is a green stream
      const isGreenStream = (project) => {
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
          if (projectStream === streamNormalized) {
            return true;
          }
          return projectStream.toLowerCase() === streamNormalized.toLowerCase();
        });
      };
      
      // Green Streams projects (all green stream types, regardless of state)
      const greenStreamProjects = monthProjects.filter((project) => isGreenStream(project));
      
      // Separate VIC and QLD projects (excluding green streams)
      const vicProjects = monthProjects.filter((project) => {
        // Exclude green stream projects
        if (isGreenStream(project)) return false;
        
        const state = (project.state || "").trim().toUpperCase();
        return state === "VIC" || state === "VICTORIA";
      });
      
      const qldProjects = monthProjects.filter((project) => {
        // Exclude green stream projects
        if (isGreenStream(project)) return false;
        
        const state = (project.state || "").trim().toUpperCase();
        return state === "QLD" || state === "QUEENSLAND";
      });
      
      // Calculate VIC totals
      const vicSalesCount = vicProjects.length;
      const vicTotalValue = vicProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      // Calculate QLD totals
      const qldSalesCount = qldProjects.length;
      const qldTotalValue = qldProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      // Calculate Green Streams totals
      const greenStreamSalesCount = greenStreamProjects.length;
      const greenStreamTotalValue = greenStreamProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      months.push({
        name: monthName,
        vicSalesCount,
        vicTotalValue,
        qldSalesCount,
        qldTotalValue,
        greenStreamSalesCount,
        greenStreamTotalValue,
        totalSalesCount: vicSalesCount + qldSalesCount + greenStreamSalesCount,
        totalValue: vicTotalValue + qldTotalValue + greenStreamTotalValue,
      });
    }
    
    return months;
  }, [yearFilteredProjects, selectedYear]);

  // Calculate monthly totals for previous year (for comparison)
  const previousYearData = React.useMemo(() => {
    if (!showLastYear) return [];
    
    const previousYear = (parseInt(selectedYear) - 1).toString();
    const months = [];
    
    for (let i = 0; i < 12; i++) {
      const monthNumber = String(i + 1).padStart(2, "0");
      const monthName = MONTHS[i];
      
      const monthProjects = projects.filter((project) => {
        // Exclude Home Office / Studio projects
        if (project.classification === "Home Office / Studio") {
          return false;
        }
        
        if (!project.year) return false;
        const projectYear = project.year.toString().trim();
        
        // Check if it's YYYY-MM-DD format
        if (projectYear.includes("-")) {
          const parts = projectYear.split("-");
          if (parts.length >= 2) {
            const year = parts[0].trim();
            const month = parts[1].trim().padStart(2, "0");
            return year === previousYear && month === monthNumber;
          }
        }
        // Check if it's MM/DD/YYYY format
        else if (projectYear.includes("/")) {
          const parts = projectYear.split("/");
          if (parts.length === 3) {
            const month = parts[0].trim().padStart(2, "0");
            const year = parts[2].trim();
            return year === previousYear && month === monthNumber;
          }
        }
        return false;
      });
      
      // Helper function to check if a project is a green stream
      const isGreenStream = (project) => {
        const projectStream = (project.stream || "").trim();
        return GREEN_STREAMS.some((stream) => {
          const streamNormalized = stream.trim();
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
          if (projectStream === streamNormalized) {
            return true;
          }
          return projectStream.toLowerCase() === streamNormalized.toLowerCase();
        });
      };
      
      // Green Streams projects (all green stream types, regardless of state)
      const greenStreamProjects = monthProjects.filter((project) => isGreenStream(project));
      
      // Separate VIC and QLD projects (excluding green streams)
      const vicProjects = monthProjects.filter((project) => {
        if (isGreenStream(project)) return false;
        const state = (project.state || "").trim().toUpperCase();
        return state === "VIC" || state === "VICTORIA";
      });
      
      const qldProjects = monthProjects.filter((project) => {
        if (isGreenStream(project)) return false;
        const state = (project.state || "").trim().toUpperCase();
        return state === "QLD" || state === "QUEENSLAND";
      });
      
      // Calculate totals
      const vicSalesCount = vicProjects.length;
      const vicTotalValue = vicProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      const qldSalesCount = qldProjects.length;
      const qldTotalValue = qldProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      const greenStreamSalesCount = greenStreamProjects.length;
      const greenStreamTotalValue = greenStreamProjects.reduce((sum, project) => {
        if (project?.project_cost) {
          const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0);
          return sum + cost;
        }
        return sum;
      }, 0);
      
      months.push({
        name: monthName,
        vicSalesCount,
        vicTotalValue,
        qldSalesCount,
        qldTotalValue,
        greenStreamSalesCount,
        greenStreamTotalValue,
        totalSalesCount: vicSalesCount + qldSalesCount + greenStreamSalesCount,
        totalValue: vicTotalValue + qldTotalValue + greenStreamTotalValue,
      });
    }
    
    return months;
  }, [projects, selectedYear, showLastYear]);

  // Format number with commas
  function formatCurrency(amount) {
    if (!amount || amount === 0) return "$0";
    return `$${amount.toLocaleString()}`;
  }

  // Calculate pie chart path
  function getPieSlicePath(data, index, total) {
    const centerX = 200;
    const centerY = 200;
    const radius = 150;
    
    let startAngle = 0;
    for (let i = 0; i < index; i++) {
      startAngle += (data[i].percentage / 100) * 360;
    }
    
    const sliceAngle = (data[index].percentage / 100) * 360;
    const endAngle = startAngle + sliceAngle;
    
    const startAngleRad = (startAngle - 90) * (Math.PI / 180);
    const endAngleRad = (endAngle - 90) * (Math.PI / 180);
    
    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);
    
    const largeArcFlag = sliceAngle > 180 ? 1 : 0;
    
    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
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
            Sales Analytics
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
          {selectedView === "bar" && (
            <button
              onClick={() => setShowLastYear(!showLastYear)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "2px solid #FFD54F",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: showLastYear ? MONUMENT : WHITE,
                background: showLastYear ? "#FFD54F" : "transparent",
                cursor: "pointer",
                outline: "none",
                transition: "background 0.2s, color 0.2s",
              }}
            >
              Show Last Year
            </button>
          )}
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
          {/* Bar Graph - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <button
              onClick={() => setSelectedView("bar")}
              style={{
                background: selectedView === "bar" ? "#4D93D9" : "transparent",
                color: selectedView === "bar" ? WHITE : "#404049",
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
                width: "100%",
              }}
            >
              Bar Graph
            </button>
          </div>
          
          {/* Pie Chart - Light Green */}
          <div style={{ background: "#CEEAB0", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <button
              onClick={() => setSelectedView("pie")}
              style={{
                background: selectedView === "pie" ? "#92D050" : "transparent",
                color: selectedView === "pie" ? WHITE : "#404049",
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
                width: "100%",
              }}
            >
              Pie Chart
            </button>
          </div>
          
          {/* Show Last Year - Light Yellow */}
          <div style={{ background: "#FFE082", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <button
              onClick={() => setShowLastYear(!showLastYear)}
              style={{
                background: showLastYear ? "#FFD54F" : "transparent",
                color: showLastYear ? MONUMENT : "#404049",
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
                width: "100%",
              }}
            >
              Show Last Year
            </button>
          </div>
          
          {/* Totals - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <button
              onClick={() => setShowTotals(!showTotals)}
              style={{
                background: showTotals ? "#4D93D9" : "transparent",
                color: showTotals ? WHITE : "#404049",
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
                width: "100%",
              }}
            >
              Totals
            </button>
          </div>
          
          <div style={{ flex: 1 }} />
          
          {/* Back to Sales - Light Red */}
          <div style={{ background: "#F79198", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
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
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
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
              {selectedView === "pie" ? (
                <>
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "32px" }}>
                    Total Value Breakdown for {selectedYear}
                  </h2>
                  
                  {/* Pie Chart */}
                  <div style={{ display: "flex", alignItems: "center", gap: "48px", flexWrap: "wrap", justifyContent: "center", position: "relative" }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <svg width="400" height="400" viewBox="0 0 400 400" style={{ position: "relative", zIndex: 2 }}>
                        {pieData.map((slice, index) => (
                          <path
                            key={slice.name}
                            d={getPieSlicePath(pieData, index, pieData.reduce((sum, s) => sum + s.value, 0))}
                            fill={slice.color}
                            stroke={WHITE}
                            strokeWidth="2"
                          />
                        ))}
                      </svg>
                      
                      {/* Previous year pie chart overlay (ghost) */}
                      {showLastYear && previousYearPieData && (() => {
                        const prevTotal = previousYearPieData.total;
                        const prevPieData = [
                          {
                            name: "SGF - VIC",
                            value: previousYearPieData.vic,
                            percentage: prevTotal > 0 ? (previousYearPieData.vic / prevTotal) * 100 : 0,
                          },
                          {
                            name: "SGF - QLD",
                            value: previousYearPieData.qld,
                            percentage: prevTotal > 0 ? (previousYearPieData.qld / prevTotal) * 100 : 0,
                          },
                          {
                            name: "Green Streams",
                            value: previousYearPieData.green,
                            percentage: prevTotal > 0 ? (previousYearPieData.green / prevTotal) * 100 : 0,
                          },
                        ];
                        
                        return (
                          <svg width="400" height="400" viewBox="0 0 400 400" style={{ position: "absolute", top: 0, left: 0, zIndex: 3, pointerEvents: "none" }}>
                            {prevPieData.map((slice, index) => (
                              <path
                                key={slice.name}
                                d={getPieSlicePath(prevPieData, index, prevTotal)}
                                fill="transparent"
                                stroke="#FFD54F"
                                strokeWidth="3"
                              />
                            ))}
                          </svg>
                        );
                      })()}
                    </div>
                    
                    {/* Legend */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "200px" }}>
                      {pieData.map((slice) => (
                        <div key={slice.name} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              backgroundColor: slice.color,
                              borderRadius: "4px",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: MONUMENT }}>
                              {slice.name}
                            </div>
                            {showTotals && (
                              <div style={{ fontSize: "0.8rem", color: "#32323399" }}>
                                {formatCurrency(slice.value)} ({slice.percentage.toFixed(1)}%)
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "32px" }}>
                    Monthly Sales for {selectedYear}
                  </h2>
                  
                  {/* Bar Chart */}
                  <div style={{ width: "100%", maxWidth: "900px", position: "relative", display: "flex" }}>
                    {/* Y-axis scale */}
                    <div style={{ width: "60px", flexShrink: 0, position: "relative", height: "600px", marginRight: "8px" }}>
                      {(() => {
                        const maxJobsRounded = 50; // Fixed scale: always 0-50 jobs
                        // Number of increments (0, 5, 10, ..., 50)
                        const numIncrements = maxJobsRounded / 5;
                        // Calculate the usable height (550px for bars, same as bar scaling)
                        const barAreaHeight = 550;
                        const chartHeight = 600;
                        const bottomOffset = (chartHeight - barAreaHeight) / 2; // Center the bar area
                        
                        return (
                          <>
                            {Array.from({ length: numIncrements + 1 }, (_, i) => {
                              const jobCount = i * 5;
                              // Position based on bar area, not full chart height
                              const positionFromBottom = (jobCount / maxJobsRounded) * barAreaHeight;
                              const bottomPosition = bottomOffset + positionFromBottom;
                              
                              return (
                                <div
                                  key={i}
                                  style={{
                                    position: "absolute",
                                    bottom: `${bottomPosition}px`,
                                    right: "0",
                                    display: "flex",
                                    alignItems: "flex-end",
                                    transform: "translateY(50%)",
                                  }}
                                >
                                  <div style={{ fontSize: "0.75rem", color: MONUMENT, fontWeight: 600 }}>
                                    {jobCount}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                    
                    {/* Chart area */}
                    <div style={{ flex: 1, position: "relative" }}>
                      {/* Grid lines */}
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "600px", pointerEvents: "none", padding: "0 20px" }}>
                        {(() => {
                          const maxJobsRounded = 50; // Fixed scale: always 0-50 jobs
                          const numIncrements = maxJobsRounded / 5; // 11 lines (0, 5, 10, ..., 50)
                          // Calculate the usable height (550px for bars, same as bar scaling)
                          const barAreaHeight = 550;
                          const chartHeight = 600;
                          const bottomOffset = (chartHeight - barAreaHeight) / 2; // Center the bar area
                          
                          return Array.from({ length: numIncrements + 1 }, (_, i) => {
                            const jobCount = i * 5;
                            // Position based on bar area, not full chart height
                            const positionFromBottom = (jobCount / maxJobsRounded) * barAreaHeight;
                            const bottomPosition = bottomOffset + positionFromBottom;
                            
                            return (
                              <div
                                key={i}
                                style={{
                                  position: "absolute",
                                  bottom: `${bottomPosition}px`,
                                  left: "20px",
                                  right: "20px",
                                  height: "1px",
                                  backgroundColor: "#d0d0d0",
                                  opacity: 0.5,
                                }}
                              />
                            );
                          });
                        })()}
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "8px", height: "600px", padding: "0 20px", position: "relative" }}>
                      {monthlyData.map((month, index) => {
                        const maxJobsRounded = 50; // Fixed scale: always 0-50 jobs
                        
                        // Scale bars based on job count (0-50 jobs scale)
                        const vicBarHeight = (month.vicSalesCount / maxJobsRounded) * 550;
                        const qldBarHeight = (month.qldSalesCount / maxJobsRounded) * 550;
                        const greenStreamBarHeight = (month.greenStreamSalesCount / maxJobsRounded) * 550;
                        const totalBarHeight = vicBarHeight + qldBarHeight + greenStreamBarHeight;
                        
                        // Previous year data for comparison (ghost overlay)
                        const prevMonth = previousYearData[index];
                        const prevTotalBarHeight = prevMonth ? (prevMonth.totalSalesCount / maxJobsRounded) * 550 : 0;
                        
                        return (
                          <div
                            key={month.name}
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              height: "100%",
                              justifyContent: "flex-end",
                              position: "relative",
                            }}
                          >
                            {/* Stacked bars container */}
                            <div
                              style={{
                                width: "100%",
                                height: `${totalBarHeight}px`,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                position: "relative",
                                minHeight: totalBarHeight > 0 ? "80px" : "0",
                                zIndex: 2,
                              }}
                            >
                              {/* DOM order is top → bottom of stack; flex-end anchors stack to baseline, so first = top (green), last = bottom (blue). */}
                              {/* Green streams (green) — top of bar */}
                              {greenStreamBarHeight > 0 && (
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${greenStreamBarHeight}px`,
                                    backgroundColor: "#92D050",
                                    borderRadius: "4px 4px 0 0",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "flex-start",
                                    alignItems: "center",
                                    padding: "4px 2px",
                                    minHeight: "30px",
                                  }}
                                >
                                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: WHITE, marginBottom: "2px" }}>
                                    {month.greenStreamSalesCount}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: WHITE }}>
                                    {formatCurrency(month.greenStreamTotalValue)}
                                  </div>
                                </div>
                              )}

                              {/* QLD (red) — middle */}
                              {qldBarHeight > 0 && (
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${qldBarHeight}px`,
                                    backgroundColor: "#D54358",
                                    borderRadius: qldBarHeight > 0 && greenStreamBarHeight === 0 ? "4px 4px 0 0" : "0",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "flex-start",
                                    alignItems: "center",
                                    padding: "4px 2px",
                                    minHeight: "30px",
                                  }}
                                >
                                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: WHITE, marginBottom: "2px" }}>
                                    {month.qldSalesCount}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: WHITE }}>
                                    {formatCurrency(month.qldTotalValue)}
                                  </div>
                                </div>
                              )}

                              {/* VIC (blue) — bottom on baseline */}
                              {vicBarHeight > 0 && (
                                <div
                                  style={{
                                    width: "100%",
                                    height: `${vicBarHeight}px`,
                                    backgroundColor: "#4D93D9",
                                    borderRadius: vicBarHeight === totalBarHeight ? "4px 4px 0 0" : "0",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "flex-start",
                                    alignItems: "center",
                                    padding: "4px 2px",
                                    minHeight: "30px",
                                  }}
                                >
                                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: WHITE, marginBottom: "2px" }}>
                                    {month.vicSalesCount}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: WHITE }}>
                                    {formatCurrency(month.vicTotalValue)}
                                  </div>
                                </div>
                              )}
                              
                              {/* Total on top of bars */}
                              {showTotals && totalBarHeight > 0 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "-30px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    color: MONUMENT,
                                    whiteSpace: "nowrap",
                                    textAlign: "center",
                                    lineHeight: "1.2",
                                  }}
                                >
                                  <div>{month.totalSalesCount}</div>
                                  <div style={{ fontSize: "0.7rem" }}>{formatCurrency(month.totalValue)}</div>
                                </div>
                              )}
                            </div>
                            
                            {/* Previous year ghost overlay - single total bar (positioned to align with 0 line) */}
                            {showLastYear && prevTotalBarHeight > 0 && (
                              <div
                                style={{
                                  position: "absolute",
                                  bottom: "25px",
                                  left: "1px",
                                  width: "100%",
                                  height: `${prevTotalBarHeight}px`,
                                  border: "2px solid #FFD54F",
                                  borderRadius: "4px 4px 0 0",
                                  backgroundColor: "transparent",
                                  pointerEvents: "none",
                                  zIndex: 3,
                                }}
                              />
                            )}
                            
                            {/* Month label */}
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: MONUMENT,
                                marginTop: "8px",
                                textAlign: "center",
                                fontWeight: 500,
                                transform: "rotate(-45deg)",
                                transformOrigin: "center",
                                whiteSpace: "nowrap",
                                width: "80px",
                                marginLeft: "-40px",
                              }}
                            >
                              {month.name.substring(0, 3)}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
