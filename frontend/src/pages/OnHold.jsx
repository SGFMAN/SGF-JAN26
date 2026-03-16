import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";

const API_URL = "";

export default function OnHold() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    fetchProjects();
  }, []);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_URL}/api/projects`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Filter projects based on search query and state filter
  function getFilteredProjects() {
    // Only show projects that are on hold, exclude Hotlist
    let filtered = projects.filter((project) => 
      (project.on_hold === 'true' || project.on_hold === true) && project.status !== "Hotlist"
    );

    // Filter by state if specified
    if (stateFilter !== "All") {
      filtered = filtered.filter(project => {
        const projectState = (project.state || "").toUpperCase();
        return projectState === stateFilter.toUpperCase();
      });
    }

    // Filter by search query if specified
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(project => {
        const suburb = (project.suburb || "").toLowerCase();
        const street = (project.street || "").toLowerCase();
        const name = (project.name || "").toLowerCase();
        return suburb.includes(query) || street.includes(query) || name.includes(query);
      });
    }

    // Sort alphabetically by suburb, then by street
    filtered.sort((a, b) => {
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      if (suburbA !== suburbB) {
        return suburbA.localeCompare(suburbB);
      }
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();
      return streetA.localeCompare(streetB);
    });

    return filtered;
  }

  const filteredProjects = getFilteredProjects();

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
          margin: "32px auto 14px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          boxSizing: "border-box",
          justifyContent: "center",
          position: "relative",
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
            On Hold
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
            All Projects
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
          }}
        >
          {/* Menu Buttons */}
          {/* Hot List - Light Blue */}
          <div style={{ background: "#A6C9EC", borderRadius: "10px", padding: "4px", border: "2px solid #000" }}>
            <Link
              to="/hotlist"
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
              Hot List
            </Link>
          </div>
          
          {/* All Projects, In Design, In Construction, Finished Projects, Cancelled, On Hold - Light Green */}
          <div style={{ background: "#CEEAB0", borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: "2px solid #000" }}>
            <Link
              to="/all-projects"
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
              All Projects
            </Link>
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
              In Design
            </Link>
            <Link
              to="/in-construction"
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
              In Construction
            </Link>
            <Link
              to="/finished-projects"
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
              Finished Projects
            </Link>
            <Link
              to="/cancelled"
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
              Cancelled
            </Link>
            <Link
              to="/on-hold"
              style={{
                background: "#92D050",
                color: WHITE,
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
              On Hold
            </Link>
          </div>
          
          {/* Managers and Sales - Light Red */}
          <div style={{ background: "#F79198", borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: "2px solid #000" }}>
            <Link
              to="/managers"
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
              Managers
            </Link>
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
              Sales
            </Link>
          </div>
          
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Link
              to="/settings"
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
              Settings
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/apply-fields"
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
              Apply Fields
            </Link>
          )}
        </div>

        {/* Section 3: Projects */}
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
            On Hold {(() => {
              const totalCount = projects.filter((project) => project.on_hold === 'true' || project.on_hold === true).length;
              if (searchQuery.trim()) {
                return `(${filteredProjects.length} found)`;
              } else if (stateFilter !== "All") {
                return `(${filteredProjects.length} total)`;
              }
              return totalCount > 0 ? `(${totalCount} total)` : "";
            })()}
          </h2>
          
          {/* Search Bar - All on one line */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "nowrap", alignItems: "flex-start", marginTop: 0, position: "relative" }}>
            {/* Search Bar */}
            <div style={{ flex: "0 0 auto" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  marginTop: 0,
                  fontWeight: 500,
                }}
              >
                Search
              </label>
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "420px",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `2px solid ${MONUMENT}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Clear Filters Button */}
            {searchQuery.trim() && (
              <div style={{ flex: "0 0 auto", marginLeft: "10px", marginTop: "28px" }}>
                <button
                  onClick={() => {
                    setSearchQuery("");
                  }}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: WHITE,
                    border: `2px solid ${MONUMENT}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    height: "42px",
                    width: "200px",
                    boxSizing: "border-box",
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && filteredProjects.length === 0 && (
            <p style={{ color: "#32323399" }}>
              {searchQuery.trim()
                ? "No projects match your search."
                : "No on hold projects found."}
            </p>
          )}
          {!loading && !error && filteredProjects.length > 0 && (
            <div
              className="projects-grid"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                alignItems: "flex-start",
              }}
            >
              {filteredProjects.map((project) => {
                // Classification mapping - all grey
                const classificationMap = {
                  "Small Second Dwelling": { acronym: "SSD", color: "#a1a1a3" }, // Grey
                  "Dependant Persons Unit": { acronym: "DPU", color: "#a1a1a3" }, // Grey
                  "Detached Extension": { acronym: "DEX", color: "#a1a1a3" }, // Grey
                  "Dwelling": { acronym: "DWE", color: "#a1a1a3" }, // Grey
                  "Home Office / Studio": { acronym: "STU", color: "#a1a1a3" }, // Grey
                  "Dwelling & DPU": { acronym: "D&DPU", color: "#a1a1a3" }, // Grey
                  "Dwelling & SSD": { acronym: "D&SSD", color: "#a1a1a3" }, // Grey
                  "SSD & DPU": { acronym: "SSD&DPU", color: "#a1a1a3" }, // Grey
                  "Dual Occ": { acronym: "DOC", color: "#a1a1a3" }, // Grey
                };
                const classificationInfo = project.classification ? classificationMap[project.classification] : null;

                // Stream mapping - colored by stream type
                const streamMap = {
                  "SGF - VIC": { acronym: "VIC", color: "#4D93D9" }, // Blue
                  "SGF - QLD": { acronym: "QLD", color: "#D54358" }, // Red
                  "Dual Dwelling": { acronym: "DD", color: "#92D050" }, // Green
                  "ATA": { acronym: "ATA", color: "#92D050" }, // Green
                  "Pumped on Property": { acronym: "POP", color: "#92D050" }, // Green
                  "Pumped On Property": { acronym: "POP", color: "#92D050" }, // Green (handle both variations)
                  "Henderson": { acronym: "HEN", color: "#92D050" }, // Green
                  "Creat Cash Flow": { acronym: "CCF", color: "#92D050" }, // Green
                  "Create Cash Flow": { acronym: "CCF", color: "#92D050" }, // Green (handle both variations)
                  "Maple Group": { acronym: "MAP", color: "#92D050" }, // Green
                };
                const streamInfo = project.stream ? streamMap[project.stream] : null;

                return (
                  <Link
                    key={project.id}
                    to={`/project/${project.id}`}
                    style={{
                      textDecoration: "none",
                      display: "block",
                    }}
                  >
                    <div
                      style={{
                        background: MONUMENT,
                        borderRadius: "8px",
                        width: "200px",
                        height: "100px",
                        color: SECTION_GREY,
                        cursor: "pointer",
                        transition: "opacity 0.2s",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        position: "relative",
                        overflow: "hidden",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    >
                      {/* On Hold Diagonal Band */}
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%) rotate(-45deg)",
                          width: "280px",
                          height: "40px",
                          background: "#0066cc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          zIndex: 10,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        }}
                      >
                        <span
                          style={{
                            color: WHITE,
                            fontWeight: 700,
                            fontSize: "1.1rem",
                            letterSpacing: "2px",
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          ON HOLD
                        </span>
                      </div>
                      {/* Cancelled Diagonal Band */}
                      {project.status === "Cancelled" && (
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%) rotate(-45deg)",
                            width: "280px",
                            height: "40px",
                            background: "#cc0000",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 10,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                          }}
                        >
                          <span
                            style={{
                              color: WHITE,
                              fontWeight: 700,
                              fontSize: "1.1rem",
                              letterSpacing: "2px",
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            CANCELLED
                          </span>
                        </div>
                      )}
                      {/* Stream Acronym - Left Bottom */}
                      {streamInfo && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            left: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: streamInfo.color,
                            zIndex: 11,
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          {streamInfo.acronym}
                        </div>
                      )}
                      {/* Classification Acronym - Right Bottom */}
                      {classificationInfo && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            right: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: classificationInfo.color,
                            zIndex: 11,
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          {classificationInfo.acronym}
                        </div>
                      )}
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "1.1rem",
                          textAlign: "center",
                          marginBottom: "4px",
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          flex: 1,
                          flexDirection: "column",
                          gap: "4px",
                          position: "relative",
                          zIndex: 1,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: WHITE }}>
                          {(project.suburb || "Unknown Suburb").toUpperCase()}
                        </div>
                        <div style={{ fontSize: "0.95rem", color: WHITE, fontWeight: 400 }}>
                          {project.street || "No address"}
                        </div>
                      </div>
                      <div 
                        style={{ 
                          fontSize: "0.9rem", 
                          color: "#323233cc", 
                          textAlign: "center",
                          position: "relative",
                          zIndex: 1,
                        }}
                      >
                        Status: {project.status}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
