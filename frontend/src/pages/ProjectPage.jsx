import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import Overview from "./Overview";
import ProjectInfo from "./ProjectInfo";
import ClientInfo from "./ClientInfo";
import Drawings from "./Drawings";
import Colours from "./Colours";
import Windows from "./Windows";
import SiteVisit from "./SiteVisit";
import Contract from "./Contract";
import PlanningOld from "./Planning";
import Planning from "./PlanningNew";
import Admin from "./Admin";
import Robes from "./Robes";
import Variations from "./Variations";
import { isUserAdmin } from "../utils/auth";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";

const API_URL = "";

// Menu options for this page plus back to main
const MENU_OPTIONS = [
  { label: "Overview", key: "overview" },
  { label: "Project Info", key: "project-info" },
  { label: "Client Info", key: "client-info" },
  { label: "Drawings", key: "drawings" },
    { label: "Colours", key: "colours" },
    { label: "Windows", key: "windows" },
  { label: "Site Visit", key: "site-visit" },
  { label: "Contract", key: "contract" },
  { label: "Planning - OLD", key: "planning-old", hidden: true },
  { label: "Planning", key: "planning" },
  { label: "Variations", key: "variations" },
  { label: "Admin", key: "admin" },
];

// Construction menu options (simplified)
const CONSTRUCTION_MENU_OPTIONS = [
  { label: "Overview", key: "overview" },
  { label: "Project Info", key: "project-info" },
  { label: "Client Info", key: "client-info" },
  { label: "Robes", key: "robes" },
  { label: "Variations", key: "variations" },
];

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  /** Client portal project URL: same full UI as internal /project/:id, but read-only and portal API */
  const isPortalProjectPath = /^\/portal\/projects\/[^/]+$/.test(location.pathname);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allProjects, setAllProjects] = useState([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const updateTimeoutRef = useRef(null);

  useEffect(() => {
    if (id) {
      fetchProject();
      fetchAllProjects();
    }
    checkAdminStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location.pathname]);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  // Check for view parameter in URL to preserve active view
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const viewParam = urlParams.get('view');
    const allKeys = [...MENU_OPTIONS, ...CONSTRUCTION_MENU_OPTIONS];
    if (viewParam && allKeys.some((opt) => opt.key === viewParam)) {
      if (isPortalProjectPath && viewParam === "admin") {
        setActiveView("overview");
      } else {
        setActiveView(viewParam);
      }
    } else if (!viewParam) {
      // If no view parameter, default to overview
      setActiveView("overview");
    }
  }, [id, location.search, isPortalProjectPath]);

  // Set default menu view for Construction Phase projects
  useEffect(() => {
    if (project && project.status === "Construction Phase") {
      setShowProjectMenu(true);
    } else {
      setShowProjectMenu(false);
    }
  }, [project]);

  async function fetchAllProjects() {
    if (isPortalProjectPath) {
      setAllProjects([]);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      // Filter to only current projects (not Complete or Cancelled) and sort alphabetically
      // Exclude Hotlist status
      const currentProjects = data
        .filter((p) => p.status !== "Complete" && p.status !== "Cancelled" && p.status !== "Construction Phase" && p.status !== "Hotlist")
        .sort((a, b) => {
          const suburbA = (a.suburb || "").toLowerCase();
          const suburbB = (b.suburb || "").toLowerCase();
          if (suburbA !== suburbB) {
            return suburbA.localeCompare(suburbB);
          }
          const streetA = (a.street || "").toLowerCase();
          const streetB = (b.street || "").toLowerCase();
          return streetA.localeCompare(streetB);
        });
      setAllProjects(currentProjects);
    } catch (err) {
      console.error("Error fetching all projects:", err);
    }
  }

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  async function fetchProject(skipLoading = false) {
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      setError(null);
      const url = isPortalProjectPath
        ? `${API_URL}/api/portal/projects/${id}/full`
        : `${API_URL}/api/projects/${id}`;
      console.log("Fetching project from:", url);
      const response = await fetch(url);
      console.log("Response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        if (response.status === 404) {
          throw new Error(`Project not found (ID: ${id})`);
        }
        throw new Error(errorData.error || `Failed to fetch project: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Project data:", data);
      console.log("on_hold value in fetched project:", data?.on_hold, "type:", typeof data?.on_hold);
      setProject(data);
    } catch (err) {
      console.error("Error fetching project:", err);
      setError(err.message || "Failed to load project");
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }

  // Debounced update function to prevent flash
  function updateProject(immediate = false) {
    if (immediate) {
      // Clear any pending timeout and fetch immediately
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      fetchProject(true); // Skip loading state to prevent flash
    } else {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = setTimeout(() => {
        fetchProject(true); // Skip loading state to prevent flash
      }, 300);
    }
  }

  useEffect(() => {
    if (!isPortalProjectPath) return undefined;
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const method = (init.method || "GET").toUpperCase();
      let urlStr = "";
      if (typeof input === "string") {
        urlStr = input;
      } else if (input && typeof input.url === "string") {
        urlStr = input.url;
      }
      let pathAndSearch = urlStr;
      if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
        try {
          const u = new URL(urlStr);
          pathAndSearch = u.pathname + u.search;
        } catch {
          /* keep */
        }
      }
      const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      const allowedPortalMutation =
        pathAndSearch.startsWith("/api/portal/") ||
        pathAndSearch.startsWith("/api/sitevisit/");
      if (isMutation && pathAndSearch.startsWith("/api/") && !allowedPortalMutation) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Read-only in client portal" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return origFetch(input, init);
    };
    return () => {
      window.fetch = origFetch;
    };
  }, [isPortalProjectPath]);

  async function handleDeleteProject() {
    if (!id) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to delete project");
      }
      // Navigate back to home page after successful delete
      navigate("/projects");
    } catch (err) {
      console.error("Error deleting project:", err);
      setError(err.message || "Failed to delete project");
      setIsDeleting(false);
      setShowDeleteModal(false);
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
        <Link to={isPortalProjectPath ? "/portal" : "/projects"} style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
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
          {(() => {
            const currentProjectId = parseInt(id);
            const currentIndex = allProjects.findIndex(p => p.id === currentProjectId);
            const hasPrevious = currentIndex > 0;
            const hasNext = currentIndex >= 0 && currentIndex < allProjects.length - 1;
            const previousProject = hasPrevious ? allProjects[currentIndex - 1] : null;
            const nextProject = hasNext ? allProjects[currentIndex + 1] : null;

            return (
              <>
                {hasPrevious && (
                  <button
                    onClick={() => {
                      if (previousProject) {
                        const base = isPortalProjectPath ? "/portal/projects" : "/project";
                        navigate(`${base}/${previousProject.id}?view=${activeView}`, { replace: true });
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      minWidth: "100px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                  >
                    ← Previous
                  </button>
                )}
                
                <h1
                  style={{
                    margin: 0,
                    fontSize: "2.4rem",
                    fontWeight: 700,
                    color: WHITE,
                    letterSpacing: "1px",
                  }}
                >
                  {loading ? "Loading..." : error ? "Error" : project?.name || "Project"}
                </h1>

                {hasNext && (
                  <button
                    onClick={() => {
                      if (nextProject) {
                        const base = isPortalProjectPath ? "/portal/projects" : "/project";
                        navigate(`${base}/${nextProject.id}?view=${activeView}`, { replace: true });
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      minWidth: "100px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                  >
                    Next →
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    style={{
                      padding: "8px 16px",
                      fontSize: "1rem",
                      fontWeight: 500,
                      color: WHITE,
                      background: "#dc3545",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      minWidth: "100px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#b02a37")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#dc3545")}
                    type="button"
                  >
                    Delete Project
                  </button>
                )}
              </>
            );
          })()}
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
          {/* Toggle Switch - Only show for Construction Phase projects */}
          {project && project.status === "Construction Phase" && (
            <div style={{ marginBottom: "12px", width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: SECTION_GREY,
                  borderRadius: "8px",
                  padding: "4px",
                  position: "relative",
                  cursor: "pointer",
                }}
                onClick={() => setShowProjectMenu(!showProjectMenu)}
              >
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 4px",
                    fontSize: "0.85rem",
                    fontWeight: showProjectMenu ? 400 : 600,
                    color: showProjectMenu ? "#666" : MONUMENT,
                    transition: "all 0.2s",
                    zIndex: 2,
                    position: "relative",
                  }}
                >
                  Design
                </div>
                <div
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 4px",
                    fontSize: "0.85rem",
                    fontWeight: showProjectMenu ? 600 : 400,
                    color: showProjectMenu ? MONUMENT : "#666",
                    transition: "all 0.2s",
                    zIndex: 2,
                    position: "relative",
                  }}
                >
                  Construction
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: "4px",
                    left: showProjectMenu ? "50%" : "4px",
                    width: "calc(50% - 4px)",
                    height: "calc(100% - 8px)",
                    background: WHITE,
                    borderRadius: "6px",
                    transition: "left 0.2s ease",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    zIndex: 1,
                  }}
                />
              </div>
            </div>
          )}

          {/* Menu Buttons */}
          {(project && project.status === "Construction Phase" && showProjectMenu
            ? CONSTRUCTION_MENU_OPTIONS
            : MENU_OPTIONS
          )
            .filter((item) => !item.hidden && !(isPortalProjectPath && item.key === "admin"))
            .map((item) => {
            return (
              <button
                key={item.key}
                style={{
                  background: activeView === item.key ? WHITE : "transparent",
                  color: activeView === item.key ? MONUMENT : "#404049",
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
                  outline: activeView === item.key ? `2px solid ${MONUMENT}` : "none",
                  boxShadow: activeView === item.key ? "0 2px 4px rgba(50,50,51,.04)" : "none",
                  display: "block",
                  width: "100%",
                  position: "relative",
                }}
                onClick={() => setActiveView(item.key)}
                type="button"
              >
                {item.label}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <Link
            to={isPortalProjectPath ? "/portal" : "/projects"}
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.17s",
              marginBottom: "4px",
              display: "block",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            ← Back to Main
          </Link>
        </div>
        {/* Section 3: Project Content */}
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
          {loading && <p style={{ color: "#32323399" }}>Loading project...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && project && (
            <>
              {activeView === "overview" && <Overview project={project} />}
              {activeView === "project-info" && (
                <ProjectInfo project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />
              )}
              {activeView === "client-info" && (
                <ClientInfo project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />
              )}
              {activeView === "robes" && <Robes project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />}
              {activeView === "drawings" && (
                <Drawings
                  project={project}
                  onUpdate={isPortalProjectPath ? () => {} : updateProject}
                  drawingsPdfSrcOverride={
                    isPortalProjectPath ? `${API_URL}/api/portal/projects/${id}/drawing` : undefined
                  }
                />
              )}
              {activeView === "colours" && <Colours project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />}
              {activeView === "windows" && <Windows project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />}
              {activeView === "site-visit" && (
                <SiteVisit project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />
              )}
              {activeView === "contract" && (
                <Contract project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />
              )}
              {activeView === "planning-old" && (
                <PlanningOld project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />
              )}
              {activeView === "planning" && (
                <Planning project={project} onUpdate={isPortalProjectPath ? () => {} : updateProject} />
              )}
              {activeView === "admin" && <Admin project={project} onUpdate={updateProject} />}
              {activeView === "variations" && <Variations project={project} />}
            </>
          )}
        </div>
      </div>
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                color: MONUMENT,
                marginTop: 0,
                marginBottom: "16px",
                fontWeight: 600,
              }}
            >
              Delete Project
            </h2>
            <p
              style={{
                fontSize: "1rem",
                color: "#666",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              Are you sure you want to delete this project? This action cannot be undone and all project data will be permanently removed.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                style={{
                  background: SECTION_GREY,
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isDeleting ? 0.6 : 1,
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={isDeleting}
                style={{
                  background: "#dc3545",
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isDeleting ? 0.6 : 1,
                }}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
