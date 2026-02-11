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
  "Maple Group",
];

export default function SalesAnalytics() {
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
            ← Back to Totals
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
              <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "32px" }}>
                Total Value Breakdown for {selectedYear}
              </h2>
              
              {/* Pie Chart */}
              <div style={{ display: "flex", alignItems: "center", gap: "48px", flexWrap: "wrap", justifyContent: "center" }}>
                <svg width="400" height="400" viewBox="0 0 400 400" style={{ flexShrink: 0 }}>
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
                        <div style={{ fontSize: "0.8rem", color: "#32323399" }}>
                          {formatCurrency(slice.value)} ({slice.percentage.toFixed(1)}%)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
