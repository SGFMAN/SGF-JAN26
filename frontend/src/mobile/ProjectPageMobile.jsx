import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Overview from "../pages/Overview";
import ProjectInfo from "../pages/ProjectInfo";
import Drawings from "../pages/Drawings";
import "./mobile.css";

const API_URL = "";

const MOBILE_TABS = [
  { key: "overview", label: "Overview" },
  { key: "project-info", label: "Project Info" },
  { key: "drawings", label: "Drawings" },
];

const MOBILE_VIEW_KEYS = new Set(MOBILE_TABS.map((t) => t.key));

function getProjectTitle(project) {
  if (!project) return "Project";
  if (project.street && project.suburb) {
    return `${project.street}, ${project.suburb}`;
  }
  return project.name || "Project";
}

export default function ProjectPageMobile({
  project,
  loading,
  error,
  activeView,
  setActiveView,
  onUpdate,
  isPortalProjectPath,
  token,
  isAdmin,
}) {
  const navigate = useNavigate();
  const backTo = isPortalProjectPath ? "/portal" : "/projects";

  useEffect(() => {
    if (!MOBILE_VIEW_KEYS.has(activeView)) {
      setActiveView("overview");
    }
  }, [activeView, setActiveView]);

  function selectTab(viewKey) {
    setActiveView(viewKey);
    const params = new URLSearchParams(window.location.search);
    params.set("view", viewKey);
    navigate(
      {
        pathname: window.location.pathname,
        search: `?${params.toString()}`,
      },
      { replace: true }
    );
  }

  return (
    <div className="mobile-shell sgf-mobile-only">
      <header className="mobile-shell__header">
        <Link to={backTo} className="mobile-shell__header-back" aria-label="Back to projects">
          ←
        </Link>
        <h1 className="mobile-shell__header-title">
          {loading ? "Loading…" : error ? "Error" : getProjectTitle(project)}
        </h1>
      </header>

      <div
        className={`project-page-mobile__content${
          activeView === "overview" ? " project-page-mobile__content--overview" : ""
        }`}
      >
        {loading && <p style={{ color: "#32323399", margin: 0 }}>Loading project…</p>}
        {error && <p style={{ color: "#cc3333", margin: 0 }}>Error: {error}</p>}
        {!loading && !error && project && (
          <>
            {activeView === "overview" && <Overview project={project} />}
            {activeView === "project-info" && (
              <ProjectInfo project={project} onUpdate={onUpdate} />
            )}
            {activeView === "drawings" && (
              <Drawings
                project={project}
                onUpdate={onUpdate}
                drawingsPdfSrcOverride={
                  isPortalProjectPath
                    ? `${API_URL}/api/portal/projects/${token}/drawing`
                    : undefined
                }
                showClearDrawingData={isAdmin && !isPortalProjectPath}
              />
            )}
          </>
        )}
      </div>

      <nav className="project-page-mobile__tabs" aria-label="Project sections">
        {MOBILE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`project-page-mobile__tab${
              activeView === tab.key ? " project-page-mobile__tab--active" : ""
            }`}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
