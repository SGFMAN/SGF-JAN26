import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import NewProject from "./NewProject";
import NewProject2 from "./NewProject2";
import NewProject3 from "./NewProject3";
import NewProject4 from "./NewProject4";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter, setStateFilter } from "../utils/stateFilter";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";

const API_URL = "";

export default function InConstruction() {
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectStep, setNewProjectStep] = useState(1);
  const [newProjectFormData, setNewProjectFormData] = useState({
    suburb: "",
    street: "",
    state: "",
    stream: "",
    deposit: "",
    customDeposit: "",
    projectCost: "",
    salesperson: "",
    clientName: "",
    email: "",
    phone: "",
  });
  useEffect(() => {
    // Check admin status first so buttons show up quickly
    checkAdminStatus();
    fetchProjects();
  }, []);

  // Refetch projects when navigating back to this page or when window gains focus
  useEffect(() => {
    let isMounted = true;
    
    const handleFocus = () => {
      if (isMounted && location.pathname === "/in-construction") {
        console.log("Window focused, refetching projects...");
        fetchProjects();
      }
    };
    
    const handleVisibilityChange = () => {
      if (isMounted && !document.hidden && location.pathname === "/in-construction") {
        console.log("Page visible, refetching projects...");
        fetchProjects();
      }
    };
    
    // Refetch when navigating to this page
    if (location.pathname === "/in-construction") {
      fetchProjects();
    }
    
    // Also refetch when window gains focus (user returns to tab/window)
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname]);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
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
      console.log("Projects from API:", data);
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Classification mapping for acronyms
  const getClassificationInfo = (classification) => {
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
    return classification ? classificationMap[classification] : null;
  }

  // Stream mapping for acronyms - colored by stream type
  const getStreamInfo = (stream) => {
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
    return stream ? streamMap[stream] : null;
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
          padding: "0 32px",
          boxSizing: "border-box",
          position: "relative",
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
            In Construction
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
          {isAdmin && (
            <button
              onClick={() => setIsNewProjectOpen(true)}
              style={{
                background: "#33cc33",
                color: WHITE,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
          >
            + New Project
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
            In Construction {(() => {
              const constructionProjects = projects.filter((project) => {
                if (project.status !== "Construction Phase") {
                  return false;
                }
                // Exclude if on_hold is explicitly true (boolean or string)
                // Handle all possible values: true, 'true', false, 'false', null, undefined, 1, '1', 0, '0'
                const onHoldValue = project.on_hold;
                const isOnHold = onHoldValue === true || onHoldValue === 'true' || onHoldValue === 1 || onHoldValue === '1';
                return !isOnHold;
              });
              return constructionProjects.length > 0 ? `(${constructionProjects.length} total)` : "";
            })()}
          </h2>
          
          {/* Search Bar */}
          <div style={{ marginBottom: "20px", marginTop: 0 }}>
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
                width: "100%",
                maxWidth: "420px",
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

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}
          {!loading && !error && projects.length > 0 && (() => {
            // Filter to only show projects with "Construction Phase" status, excluding those that are on hold
            // Note: We don't handle legacy "On Hold" status here since Construction Phase is different
            let constructionProjects = projects.filter((project) => {
              if (project.status !== "Construction Phase") {
                return false;
              }
              // Exclude if on_hold is explicitly true (boolean or string)
              // Handle all possible values: true, 'true', false, 'false', null, undefined, 1, '1', 0, '0'
              const onHoldValue = project.on_hold;
              const isOnHold = onHoldValue === true || onHoldValue === 'true' || onHoldValue === 1 || onHoldValue === '1';
              return !isOnHold;
            });
            
            // Filter by state if specified
            if (stateFilter !== "All") {
              constructionProjects = constructionProjects.filter(project => {
                const projectState = (project.state || "").toUpperCase();
                return projectState === stateFilter.toUpperCase();
              });
            }
            
            // Filter projects based on search query
            let filteredProjects = searchQuery.trim()
              ? constructionProjects.filter((project) => {
                  const query = searchQuery.toLowerCase();
                  const suburb = (project.suburb || "").toLowerCase();
                  const street = (project.street || "").toLowerCase();
                  const clientName = (project.client_name || "").toLowerCase();
                  return suburb.includes(query) || street.includes(query) || clientName.includes(query);
                })
              : constructionProjects;

            // Sort alphabetically by suburb, then by street
            filteredProjects.sort((a, b) => {
              const suburbA = (a.suburb || "").toLowerCase();
              const suburbB = (b.suburb || "").toLowerCase();
              if (suburbA !== suburbB) {
                return suburbA.localeCompare(suburbB);
              }
              const streetA = (a.street || "").toLowerCase();
              const streetB = (b.street || "").toLowerCase();
              return streetA.localeCompare(streetB);
            });

            if (filteredProjects.length === 0) {
              return <p style={{ color: "#32323399" }}>No projects match your search.</p>;
            }

            return (
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
                  const suburb = project.suburb || "Unknown Suburb";
                  const street = project.street || "No address";
                  const classificationInfo = getClassificationInfo(project.classification);
                  const streamInfo = getStreamInfo(project.stream);

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
                            zIndex: project.status === "Cancelled" ? 1 : "auto",
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#ffffff" }}>
                            {suburb.toUpperCase()}
                          </div>
                          <div style={{ fontSize: "0.95rem", color: "#ffffff", fontWeight: 400 }}>
                            {street}
                          </div>
                        </div>
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
                              zIndex: (project.status === "Cancelled") ? 11 : 5,
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
                              zIndex: (project.status === "Cancelled") ? 11 : 5,
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            {classificationInfo.acronym}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* New Project Modals */}
      <NewProject
        isOpen={isNewProjectOpen && newProjectStep === 1}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onNext={() => setNewProjectStep(2)}
      />
      <NewProject2
        isOpen={isNewProjectOpen && newProjectStep === 2}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(1)}
        onNext={() => setNewProjectStep(3)}
      />
      <NewProject3
        isOpen={isNewProjectOpen && newProjectStep === 3}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(2)}
        onNext={() => setNewProjectStep(4)}
      />
      <NewProject4
        isOpen={isNewProjectOpen && newProjectStep === 4}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
          // Refresh the projects list after creating a new project
          fetchProjects();
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(3)}
      />
    </div>
  );
}
