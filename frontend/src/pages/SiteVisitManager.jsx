import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter } from "../utils/stateFilter";
import { CLASSIFICATION_BADGE_MAP } from "../utils/classifications";
import logo from "../images/logo.png";

import StateFilterButtons from "../components/StateFilterButtons";
import { UI, BANNER, PROJECT_CARD } from "../utils/uiThemeTokens.js";
import { getProjectStreamBadge } from "../utils/streamBadges";
import { OnHoldSash, CancelledSash } from "../components/ProjectStatusSash";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

// Predefined colors for groups
/** `year` on project = start date (usually YYYY-MM-DD). */
function formatProjectStartDateForCard(yearVal) {
  if (yearVal == null || yearVal === "") return "";
  const s = String(yearVal).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const y = parseInt(s.slice(0, 4), 10);
    const mo = parseInt(s.slice(5, 7), 10) - 1;
    const d = parseInt(s.slice(8, 10), 10);
    const dt = new Date(y, mo, d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }
  if (/^\d{4}$/.test(s)) return s;
  return s;
}

const GROUP_COLORS = [
  "#52BE80", // Green (first group)
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#FFA07A", // Light Salmon
  "#98D8C8", // Mint
  "#F7DC6F", // Yellow
  "#BB8FCE", // Purple
  "#85C1E2", // Sky Blue
  "#F8B739", // Orange
  "#FF6B6B", // Red
];

export default function SiteVisitManager() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stateFilter, setStateFilter] = useState(getStateFilter());

  useEffect(() => {
    fetchProjects();
    checkAdminStatus();
  }, []);

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
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Filter projects with site visit status "Not Complete" (excluding Hotlist projects) and sort alphabetically
  const incompleteSiteVisits = React.useMemo(() => {
    let filtered = projects.filter((project) => 
      (project.site_visit_status || "Not Complete") === "Not Complete" &&
      project.status !== "Hotlist" &&
      project.status !== "Cancelled"
    );
    
    // Filter by state if specified
    if (stateFilter !== "All") {
      filtered = filtered.filter(project => {
        const projectState = (project.state || "").toUpperCase();
        return projectState === stateFilter.toUpperCase();
      });
    }
    
    return filtered.sort((a, b) => {
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      if (suburbA !== suburbB) {
        return suburbA.localeCompare(suburbB);
      }
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();
      return streetA.localeCompare(streetB);
    });
  }, [projects, stateFilter]);

  // Get group for a project
  function getProjectGroup(projectId) {
    return groups.find(group => group.projectIds.includes(projectId));
  }

  // Toggle project selection
  function handleToggleProject(projectId) {
    setSelectedProjectIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  }

  // Handle Create Group button - navigate directly to planner
  function handleCreateGroup() {
    if (selectedProjectIds.size === 0) {
      alert("Please select at least one project to create a group");
      return;
    }

    // Only allow 1 group at a time
    if (groups.length > 0) {
      alert("Only one group can be created at a time. Please delete the existing group first.");
      return;
    }

    const groupNumber = groups.length + 1;
    const color = GROUP_COLORS[(groupNumber - 1) % GROUP_COLORS.length];
    
    const newGroup = {
      id: Date.now(),
      name: `Group ${groupNumber}`,
      color: color,
      projectIds: Array.from(selectedProjectIds),
    };

    // Navigate directly to the planner with the group
    navigate("/site-visit-planner", { state: { group: newGroup } });
  }

  // Sort projects: grouped projects first (by group), then ungrouped
  function getSortedProjects() {
    const grouped = [];
    const ungrouped = [];

    incompleteSiteVisits.forEach(project => {
      const group = getProjectGroup(project.id);
      if (group) {
        grouped.push({ project, group });
      } else {
        ungrouped.push(project);
      }
    });

    // Sort grouped projects by group order
    grouped.sort((a, b) => {
      const groupAIndex = groups.findIndex(g => g.id === a.group.id);
      const groupBIndex = groups.findIndex(g => g.id === b.group.id);
      return groupAIndex - groupBIndex;
    });

    return { grouped, ungrouped };
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
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Site Visit Manager
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
          <StateFilterButtons stateFilter={stateFilter} setStateFilter={setStateFilter} />
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
            overflowY: "auto",
          }}
        >
          {/* Menu Buttons */}
          <Link
            to="/managers/site-visit-manager"
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
              outline: `2px solid ${UI.outline}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            Site Visit Manager
          </Link>
          <Link
            to="/managers/contract-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            to="/managers/colour-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
            Colour Manager
          </Link>
          <Link
            to="/managers/status-manager"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
          {isAdmin && (
            <Link
              to="/managers/drawing-manager"
              style={{
                background: "transparent",
                color: UI.textSecondary,
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
              Drawing Manager
            </Link>
          )}
          <div style={{ flex: 1 }} />
          <Link
            to="/projects"
            style={{
              background: "transparent",
              color: UI.textSecondary,
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
              Projects Needing Site Visit
            </h2>
          </div>

          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && incompleteSiteVisits.length === 0 && (
            <p style={{ color: UI.textMuted }}>No projects need site visits.</p>
          )}
          {!loading && !error && incompleteSiteVisits.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "16px", flex: 1, overflow: "hidden", minWidth: 0 }}>
              {/* Columns 1-6: Projects */}
              <div
                className="projects-list"
                style={{
                  gridColumn: "span 6",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "20px",
                  alignItems: "flex-start",
                  overflowY: "auto",
                  alignContent: "flex-start",
                  minWidth: 0,
                }}
              >
                {(() => {
                  const { grouped, ungrouped } = getSortedProjects();
                  const allProjects = [];
                  
                  // Add grouped projects
                  grouped.forEach(({ project, group }) => {
                    allProjects.push({ project, group });
                  });
                  
                  // Add ungrouped projects
                  ungrouped.forEach(project => {
                    allProjects.push({ project, group: null });
                  });

                  return allProjects.map(({ project, group }) => {
                    const suburb = (project.suburb || "Unknown Suburb").toUpperCase();
                    const street = project.street || "No address";
                    const startDateLabel = formatProjectStartDateForCard(project.year);
                    const isSelected = selectedProjectIds.has(project.id);
                    const isAlreadyGrouped = group !== null;
                    // Use group color if project is in a group, blue if selected, otherwise use MONUMENT
                    const cardBackground = group ? group.color : (isSelected ? BANNER.onHold : PROJECT_CARD.bg);
                    const cardTextColor = !group && !isSelected ? PROJECT_CARD.text : WHITE;
                    
                    const classificationInfo = project.classification
                      ? CLASSIFICATION_BADGE_MAP[project.classification]
                      : null;
                    
                    const streamInfo = getProjectStreamBadge(project);
                    
                    return (
                      <div
                        key={project.id}
                        style={{
                          position: "relative",
                        }}
                      >
                        <div
                          onClick={() => handleToggleProject(project.id)}
                          style={{
                            background: cardBackground,
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
                              {(project.on_hold === 'true' || project.on_hold === true) && (
                                <OnHoldSash />
                              )}
                              {/* Cancelled Diagonal Band */}
                              {project.status === "Cancelled" && (
                                <CancelledSash />
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
                                    zIndex: ((project.on_hold === 'true' || project.on_hold === true) || project.status === "Cancelled") ? 11 : 5,
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
                                    color: PROJECT_CARD.text,
                                    zIndex: ((project.on_hold === 'true' || project.on_hold === true) || project.status === "Cancelled") ? 11 : 5,
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
                                  zIndex: (project.on_hold === 'true' || project.on_hold === true) ? 1 : "auto",
                                }}
                              >
                                <div style={{ fontWeight: 600, fontSize: "1.1rem", color: cardTextColor }}>
                                  {suburb}
                                </div>
                                <div style={{ fontSize: "0.95rem", color: cardTextColor, fontWeight: 400 }}>
                                  {street}
                                </div>
                                {startDateLabel ? (
                                  <div
                                    style={{
                                      fontSize: "0.68rem",
                                      color: "var(--sgf-page-text)",
                                      fontWeight: 500,
                                      letterSpacing: "0.02em",
                                      marginTop: "2px",
                                      textAlign: "center",
                                      maxWidth: "100%",
                                      padding: "0 6px",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    Start {startDateLabel}
                                  </div>
                                ) : null}
                              </div>
                              <div 
                                style={{ 
                                  fontSize: "0.9rem", 
                                  color: "var(--sgf-text-primary)", 
                                  textAlign: "center",
                                  position: "relative",
                                  zIndex: (project.on_hold === 'true' || project.on_hold === true) ? 1 : "auto",
                                }}
                              >
                                Status: {project.status}
                              </div>
                            </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Column 7: Empty (reserved for future use) */}
              <div
                style={{
                  gridColumn: "7",
                }}
              ></div>

              {/* Column 8: Action buttons */}
              <div
                style={{
                  gridColumn: "8",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <button
                  onClick={() => {
                    const projectList = incompleteSiteVisits
                      .map((project) => {
                        const suburb = project.suburb || "Unknown Suburb";
                        const street = project.street || "No address";
                        const notes = project.site_visit_notes?.trim();
                        if (notes) {
                          return `${suburb} - ${street} - ${notes}`;
                        }
                        return `${suburb} - ${street}`;
                      })
                      .join("\n");
                    
                    const body = `Hi Craig,

Please see the following list of jobs that need a Site Visit.

${projectList}

kind regards,`;

                    const mailtoLink = `mailto:craig@superiorgrannyflats.com.au?subject=${encodeURIComponent("Site Visits to be Done")}&body=${encodeURIComponent(body)}`;
                    window.location.href = mailtoLink;
                  }}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
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
                  Email List
                </button>
                {groups.length > 0 && groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      navigate("/site-visit-planner", { state: { group } });
                    }}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: group.color,
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "opacity 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    Book Group
                  </button>
                ))}
                <button
                  onClick={handleCreateGroup}
                  disabled={groups.length > 0}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: WHITE,
                    background: groups.length > 0 ? "#ccc" : MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor: groups.length > 0 ? "not-allowed" : "pointer",
                    transition: "background 0.2s",
                    opacity: groups.length > 0 ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (groups.length === 0) {
                      e.currentTarget.style.background = "#1a1a1a";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (groups.length === 0) {
                      e.currentTarget.style.background = MONUMENT;
                    }
                  }}
                >
                  Create Group
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
