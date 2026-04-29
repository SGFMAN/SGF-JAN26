import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import Overview from "./Overview";
import ProjectInfo from "./ProjectInfo";
import NewProject_3_ProjectCost from "./NewProject_3_ProjectCost";
import NewProject_5_PDFUpload from "./NewProject_5_PDFUpload";
import NewProject_6_EmailInternal from "./NewProject_6_EmailInternal";
import NewProject_7_EmailClient from "./NewProject_7_EmailClient";
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
import { computeProjectFolderPathFromRecord } from "../utils/projectFolderPath";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";

const API_URL = "";

/**
 * Portal mode blocks most mutations; allow the same drawings email endpoint as the
 * main app, but only when the body targets the project currently open in the portal.
 */
function isPortalAllowedSendDrawingsPost(pathAndSearch, method, init, portalProjectId) {
  if (method !== "POST") return false;
  const path = pathAndSearch.split("?")[0];
  if (path !== "/api/emails/send-drawings") return false;
  const pid = Number(portalProjectId);
  if (!Number.isFinite(pid)) return false;
  try {
    const raw = init.body;
    if (typeof raw !== "string") return false;
    const body = JSON.parse(raw);
    return Number(body.projectId) === pid;
  } catch {
    return false;
  }
}

const RENOVATION_DUP_FORM_EMPTY = {
  suburb: "",
  street: "",
  state: "",
  stream: "",
  deposit: "",
  customDeposit: "",
  projectCost: "",
  salesperson: "",
  specs: "",
  classification: "Renovation",
  clientName: "",
  email: "",
  phone: "",
  createFolders: true,
  folderPath: "",
  createdProject: null,
  renovationDuplicateSourceId: null,
  duplicateSourceProjectYear: null,
};

function buildRenovationDupForm(project, folderPath) {
  return {
    ...RENOVATION_DUP_FORM_EMPTY,
    suburb: project.suburb || "",
    street: project.street || "",
    state: project.state || "",
    stream: project.stream || "",
    salesperson: project.salesperson || "",
    specs: project.specs || "",
    deposit: project.deposit || "",
    projectCost: project.project_cost || "",
    classification: "Renovation",
    clientName: project.client1_name || project.client_name || "",
    email: project.client1_email || project.email || "",
    phone: project.client1_phone || project.phone || "",
    folderPath: folderPath || "",
    renovationDuplicateSourceId: project.id,
    duplicateSourceProjectYear: project.year ?? null,
  };
}

/** Linked renovation copy from a non-Renovation job: same shared folder; no “use root template” on proposal step. */
function buildLinkRenovationFromSourceForm(project, folderPath) {
  return {
    ...buildRenovationDupForm(project, folderPath),
    createFolders: false,
  };
}

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
  const [renovationDupOpen, setRenovationDupOpen] = useState(false);
  const [renovationDupStep, setRenovationDupStep] = useState(3);
  const [renovationDupFormData, setRenovationDupFormData] = useState(() => ({ ...RENOVATION_DUP_FORM_EMPTY }));
  const [renovationDupCreatedForEmail, setRenovationDupCreatedForEmail] = useState(null);
  const [linkRenoDupOpen, setLinkRenoDupOpen] = useState(false);
  const [linkRenoDupStep, setLinkRenoDupStep] = useState("cost");
  const [linkRenoDupFormData, setLinkRenoDupFormData] = useState(() => ({ ...RENOVATION_DUP_FORM_EMPTY }));
  const [linkRenoDupCreatedForEmail, setLinkRenoDupCreatedForEmail] = useState(null);

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

  // Reload project when opening Drawings so `draftsperson` and other fields match the DB
  // (e.g. assigned via Project Claim while this page had an older in-memory `project`).
  useEffect(() => {
    if (!id) return;
    if (activeView !== "drawings") return;
    void fetchProject(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only when tab or id changes
  }, [activeView, id]);

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
        pathAndSearch.startsWith("/api/sitevisit/") ||
        isPortalAllowedSendDrawingsPost(pathAndSearch, method, init, id);
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
  }, [isPortalProjectPath, id]);

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

  function resetRenovationDupWizard() {
    setRenovationDupOpen(false);
    setRenovationDupStep(3);
    setRenovationDupFormData(() => ({ ...RENOVATION_DUP_FORM_EMPTY }));
    setRenovationDupCreatedForEmail(null);
  }

  function resetLinkRenoDupWizard() {
    setLinkRenoDupOpen(false);
    setLinkRenoDupStep("cost");
    setLinkRenoDupFormData(() => ({ ...RENOVATION_DUP_FORM_EMPTY }));
    setLinkRenoDupCreatedForEmail(null);
  }

  async function beginRenovationDuplicateWizard() {
    if (!project || isPortalProjectPath) return;
    if ((project.classification || "").trim() !== "Renovation") return;
    if (
      Array.isArray(project.duplicate_linked_project_ids) &&
      project.duplicate_linked_project_ids.length > 0
    ) {
      alert("This project already has a linked copy. Only one copy is allowed.");
      return;
    }
    if (
      project.duplicate_source_project_id != null &&
      String(project.duplicate_source_project_id).trim() !== ""
    ) {
      alert("This job is already a copy. Open the original renovation project if you need to change the pair.");
      return;
    }
    const folderPath = await computeProjectFolderPathFromRecord(project);
    if (!folderPath) {
      alert(
        "Could not resolve the job folder path from this project. Check address, state, year, and File Settings (root directory)."
      );
      return;
    }
    setRenovationDupFormData(buildRenovationDupForm(project, folderPath));
    setRenovationDupCreatedForEmail(null);
    setRenovationDupStep(3);
    setRenovationDupOpen(true);
  }

  async function beginLinkRenovationDuplicateWizard() {
    if (!project || isPortalProjectPath) return;
    if ((project.classification || "").trim() === "Renovation") return;
    if (
      Array.isArray(project.duplicate_linked_project_ids) &&
      project.duplicate_linked_project_ids.length > 0
    ) {
      alert("This project already has a linked copy. Only one copy is allowed.");
      return;
    }
    if (
      project.duplicate_source_project_id != null &&
      String(project.duplicate_source_project_id).trim() !== ""
    ) {
      alert("This job is already a copy. Open the original project if you need to change the pair.");
      return;
    }
    const folderPath = await computeProjectFolderPathFromRecord(project);
    if (!folderPath) {
      alert(
        "Could not resolve the job folder path from this project. Check address, state, year, and File Settings (root directory)."
      );
      return;
    }
    setLinkRenoDupFormData(buildLinkRenovationFromSourceForm(project, folderPath));
    setLinkRenoDupCreatedForEmail(null);
    setLinkRenoDupStep("cost");
    setLinkRenoDupOpen(true);
  }

  async function handleRenovationDupCreate(formData) {
    const projectName = `${formData.street}, ${formData.suburb}`.trim() || "New Project";
    const response = await fetch(`${API_URL}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        status: "Design Phase",
        suburb: formData.suburb || null,
        street: formData.street || null,
        state: formData.state || null,
        stream: formData.stream || null,
        deposit: formData.deposit || null,
        project_cost: formData.projectCost || null,
        salesperson: formData.salesperson || null,
        specs: formData.specs || null,
        classification: formData.classification || null,
        client_name: formData.clientName || null,
        email: formData.email || null,
        phone: formData.phone || null,
        client1_name: formData.clientName || null,
        client1_email: formData.email || null,
        client1_phone: formData.phone || null,
        year:
          formData.duplicateSourceProjectYear != null &&
          String(formData.duplicateSourceProjectYear).trim() !== ""
            ? String(formData.duplicateSourceProjectYear).trim()
            : new Date().toISOString().split("T")[0],
        duplicate_source_project_id:
          formData.renovationDuplicateSourceId != null &&
          Number.isFinite(Number(formData.renovationDuplicateSourceId))
            ? Number(formData.renovationDuplicateSourceId)
            : null,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || "Failed to create project");
    }
    const newProject = await response.json();
    await fetchProject(true);
    await fetchAllProjects();
    return newProject;
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
            overflow: "hidden",
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
                <ProjectInfo
                  project={project}
                  onUpdate={isPortalProjectPath ? () => {} : updateProject}
                  onRequestRenovationDuplicate={isPortalProjectPath ? undefined : beginRenovationDuplicateWizard}
                  onRequestLinkRenovationDuplicate={isPortalProjectPath ? undefined : beginLinkRenovationDuplicateWizard}
                />
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
                  showClearDrawingData={isAdmin && !isPortalProjectPath}
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
      <NewProject_3_ProjectCost
        isOpen={renovationDupOpen && renovationDupStep === 3}
        onClose={resetRenovationDupWizard}
        formData={renovationDupFormData}
        onFormDataChange={setRenovationDupFormData}
        onBack={resetRenovationDupWizard}
        onNext={() => setRenovationDupStep(5)}
        onCreate={handleRenovationDupCreate}
        transparentBackdrop
      />
      <NewProject_5_PDFUpload
        isOpen={renovationDupOpen && renovationDupStep === 5}
        onClose={resetRenovationDupWizard}
        formData={renovationDupFormData}
        onFormDataChange={setRenovationDupFormData}
        onBack={() => {
          setRenovationDupFormData((prev) => ({ ...prev, createdProject: null }));
          setRenovationDupStep(3);
        }}
        onNext={async (created) => {
          const p = created || renovationDupFormData.createdProject;
          if (p) {
            setRenovationDupCreatedForEmail(p);
            setRenovationDupStep(6);
          }
        }}
        onCreate={handleRenovationDupCreate}
        introExtra="This new job uses the same Windows folder as the renovation you started from. Uploading replaces Proposal.PDF on disk (renovation: inside 12. RENOVATION). Or use Next to keep the existing Proposal.PDF on disk."
        transparentBackdrop
      />
      <NewProject_6_EmailInternal
        isOpen={renovationDupOpen && renovationDupStep === 6}
        onClose={resetRenovationDupWizard}
        createdProjectForEmail={renovationDupCreatedForEmail}
        onSendSuccess={() => setRenovationDupStep(7)}
        transparentBackdrop
      />
      <NewProject_7_EmailClient
        isOpen={renovationDupOpen && renovationDupStep === 7}
        onClose={() => {
          const newId = renovationDupCreatedForEmail?.id;
          resetRenovationDupWizard();
          if (newId) {
            navigate(`/project/${newId}?view=project-info`);
          }
        }}
        createdProjectForEmail={renovationDupCreatedForEmail}
        transparentBackdrop
      />
      {linkRenoDupOpen && linkRenoDupStep === "cost" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              background: SECTION_GREY,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "440px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.35rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "8px",
                color: MONUMENT,
              }}
            >
              Duplicate & Link Renovation
            </h2>
            <p style={{ margin: "0 0 20px 0", fontSize: "0.9rem", color: "#555", lineHeight: 1.45 }}>
              New renovation job number with the same Windows folder. Enter the renovation contract price (you can
              change deposit later on the new job if needed).
            </p>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Project cost
            </label>
            <input
              type="text"
              value={linkRenoDupFormData.projectCost || ""}
              onChange={(e) =>
                setLinkRenoDupFormData((prev) => ({ ...prev, projectCost: e.target.value }))
              }
              placeholder="e.g. $450,000"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                marginBottom: "24px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={resetLinkRenoDupWizard}
                style={{
                  background: "#e0e0e0",
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const raw = (linkRenoDupFormData.projectCost || "").trim();
                  if (!raw) {
                    alert("Please enter the project cost.");
                    return;
                  }
                  setLinkRenoDupStep("pdf");
                }}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
      <NewProject_5_PDFUpload
        isOpen={linkRenoDupOpen && linkRenoDupStep === "pdf"}
        onClose={resetLinkRenoDupWizard}
        formData={linkRenoDupFormData}
        onFormDataChange={setLinkRenoDupFormData}
        onBack={() => {
          setLinkRenoDupFormData((prev) => ({ ...prev, createdProject: null }));
          setLinkRenoDupStep("cost");
        }}
        onNext={async (created) => {
          const p = created || linkRenoDupFormData.createdProject;
          if (p) {
            setLinkRenoDupCreatedForEmail(p);
            setLinkRenoDupStep("emailint");
          }
        }}
        onCreate={handleRenovationDupCreate}
        introExtra='The new job is Renovation: your PDF is saved as Proposal.PDF inside the existing "12. RENOVATION" folder only, so the original job’s Proposal.PDF in the folder root is not replaced. Upload a renovation proposal, or cancel.'
        transparentBackdrop
      />
      <NewProject_6_EmailInternal
        isOpen={linkRenoDupOpen && linkRenoDupStep === "emailint"}
        onClose={resetLinkRenoDupWizard}
        createdProjectForEmail={linkRenoDupCreatedForEmail}
        onSendSuccess={() => setLinkRenoDupStep("emailclient")}
        transparentBackdrop
      />
      <NewProject_7_EmailClient
        isOpen={linkRenoDupOpen && linkRenoDupStep === "emailclient"}
        onClose={() => {
          const newId = linkRenoDupCreatedForEmail?.id;
          resetLinkRenoDupWizard();
          if (newId) {
            navigate(`/project/${newId}?view=project-info`);
          }
        }}
        createdProjectForEmail={linkRenoDupCreatedForEmail}
        transparentBackdrop
      />
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
