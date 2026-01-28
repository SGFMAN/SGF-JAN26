import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

// Predefined colors for groups
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
  const [isTaggingMode, setIsTaggingMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());
  const [groups, setGroups] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

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

  // Filter projects with site visit status "Not Complete"
  const incompleteSiteVisits = projects.filter(
    (project) => (project.site_visit_status || "Not Complete") === "Not Complete"
  );

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

  // Handle Create Group button
  function handleCreateGroup() {
    setIsTaggingMode(true);
    setSelectedProjectIds(new Set());
  }

  // Handle Set as Group button
  function handleSetAsGroup() {
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

    setGroups(prev => [...prev, newGroup]);
    setIsTaggingMode(false);
    setSelectedProjectIds(new Set());
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
        background: MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      {/* Section 1: Heading */}
      <div
        style={{
          background: SECTION_GREY,
          borderRadius: "18px",
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          height: "100px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            textAlign: "center",
            width: "100%",
            color: MONUMENT,
            letterSpacing: "1px",
          }}
        >
          SGF Central
        </h1>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto",
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
            height: "700px",
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
            to="/projects"
            style={{
              background: "transparent",
              color: "#404049",
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "2px",
              display: "block",
            }}
          >
            Current Projects
          </Link>
          <Link
            to="/finished-projects"
            style={{
              background: "transparent",
              color: "#404049",
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "2px",
              display: "block",
            }}
          >
            Finished Projects
          </Link>
          <Link
            to="/site-visit-manager"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "2px",
              outline: `2px solid ${MONUMENT}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            Site Visit Manager
          </Link>
          {isAdmin && (
            <Link
              to="/settings"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "2px",
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
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "2px",
                display: "block",
              }}
            >
              Apply Fields
            </Link>
          )}
        </div>

        {/* Section 3: Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "700px",
            height: "700px",
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
              Projects Needing Site Visit {incompleteSiteVisits.length > 0 && `(${incompleteSiteVisits.length} total)`}
            </h2>
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && incompleteSiteVisits.length === 0 && (
            <p style={{ color: "#32323399" }}>No projects need site visits.</p>
          )}
          {!loading && !error && incompleteSiteVisits.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "16px", flex: 1, overflow: "hidden", minWidth: 0 }}>
              {/* Columns 1-6: Projects */}
              <div
                className="projects-list"
                style={{
                  gridColumn: "span 6",
                  display: "grid",
                  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                  gap: "12px",
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
                    const suburb = project.suburb || "Unknown Suburb";
                    const street = project.street || "No address";
                    const notes = project.site_visit_notes?.trim();
                    const isSelected = selectedProjectIds.has(project.id);
                    const isAlreadyGrouped = group !== null;
                    const canBeSelected = !isAlreadyGrouped;
                    // Use group color if project is in a group, otherwise use MONUMENT
                    const cardBackground = group ? group.color : MONUMENT;
                    // Use white text if project is in a group, otherwise use SECTION_GREY
                    const textColor = group ? WHITE : SECTION_GREY;
                    const secondaryTextColor = group ? "#ffffffcc" : "#a1a1a3";
                    
                    return (
                      <div
                        key={project.id}
                        style={{
                          position: "relative",
                        }}
                      >
                        {!isTaggingMode ? (
                          <Link
                            to={`/project/${project.id}`}
                            style={{
                              textDecoration: "none",
                              display: "block",
                            }}
                          >
                            <div
                              style={{
                                background: cardBackground,
                                borderRadius: "8px",
                                width: "100%",
                                height: "100px",
                                color: textColor,
                                cursor: "pointer",
                                transition: "opacity 0.2s",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                alignItems: "center",
                                position: "relative",
                                overflow: "hidden",
                                boxSizing: "border-box",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                            >
                              {/* On Hold Diagonal Band */}
                              {project.status === "On Hold" && (
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
                                  zIndex: project.status === "On Hold" ? 1 : "auto",
                                }}
                              >
                                <div style={{ fontWeight: 600, fontSize: "1.1rem", color: textColor }}>
                                  {suburb}
                                </div>
                                <div style={{ fontSize: "0.95rem", color: secondaryTextColor, fontWeight: 400 }}>
                                  {street}
                                </div>
                                {notes && (
                                  <div style={{ fontSize: "0.8rem", color: secondaryTextColor, fontWeight: 400, marginTop: "2px" }}>
                                    {notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div
                            style={{
                              background: cardBackground,
                              borderRadius: "8px",
                              width: "100%",
                              height: "100px",
                              color: textColor,
                              cursor: canBeSelected ? "pointer" : "default",
                              transition: "opacity 0.2s",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              alignItems: "center",
                              position: "relative",
                              overflow: "hidden",
                              opacity: isAlreadyGrouped ? 0.5 : 1,
                              boxSizing: "border-box",
                            }}
                          >
                            {/* On Hold Diagonal Band */}
                            {project.status === "On Hold" && (
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
                            )}
                            {canBeSelected && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleToggleProject(project.id);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  position: "absolute",
                                  top: "8px",
                                  right: "8px",
                                  width: "20px",
                                  height: "20px",
                                  cursor: "pointer",
                                  zIndex: 20,
                                  accentColor: MONUMENT,
                                }}
                              />
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
                                zIndex: project.status === "On Hold" ? 1 : "auto",
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: "1.1rem", color: textColor }}>
                                {suburb}
                              </div>
                              <div style={{ fontSize: "0.95rem", color: secondaryTextColor, fontWeight: 400 }}>
                                {street}
                              </div>
                              {notes && (
                                <div style={{ fontSize: "0.8rem", color: secondaryTextColor, fontWeight: 400, marginTop: "2px" }}>
                                  {notes}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
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
                  disabled={isTaggingMode || groups.length > 0}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: WHITE,
                    background: (isTaggingMode || groups.length > 0) ? "#ccc" : MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor: (isTaggingMode || groups.length > 0) ? "not-allowed" : "pointer",
                    transition: "background 0.2s",
                    opacity: (isTaggingMode || groups.length > 0) ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isTaggingMode && groups.length === 0) {
                      e.currentTarget.style.background = "#1a1a1a";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isTaggingMode && groups.length === 0) {
                      e.currentTarget.style.background = MONUMENT;
                    }
                  }}
                >
                  Create Group
                </button>
                {isTaggingMode && (
                  <button
                    onClick={handleSetAsGroup}
                    disabled={selectedProjectIds.size === 0}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: selectedProjectIds.size > 0 ? MONUMENT : "#999",
                      border: "none",
                      borderRadius: "8px",
                      cursor: selectedProjectIds.size > 0 ? "pointer" : "not-allowed",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedProjectIds.size > 0) {
                        e.currentTarget.style.background = "#1a1a1a";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedProjectIds.size > 0) {
                        e.currentTarget.style.background = MONUMENT;
                      }
                    }}
                  >
                    Set as Group
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
