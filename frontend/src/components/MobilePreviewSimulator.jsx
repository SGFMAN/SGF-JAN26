import React, { useCallback, useEffect, useState } from "react";
import { isUserAdmin } from "../utils/auth";
import MobileProjectsHome from "../mobile/MobileProjectsHome";
import ProjectPageMobile from "../mobile/ProjectPageMobile";
import MobilePreviewFrame from "./MobilePreviewFrame";

const API_URL = "";

function getProjectTitle(project) {
  if (!project) return "Project";
  if (project.street && project.suburb) {
    return `${project.street}, ${project.suburb}`;
  }
  return project.name || "Project";
}

export default function MobilePreviewSimulator() {
  const [screen, setScreen] = useState("main");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void isUserAdmin().then(setIsAdmin);
  }, []);

  const fetchProject = useCallback(async (token) => {
    const response = await fetch(`${API_URL}/api/projects/${token}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to fetch project: ${response.statusText}`);
    }
    return response.json();
  }, []);

  const handleSelectProject = useCallback(
    async (summary) => {
      const token = summary?.access_token;
      if (!token) return;

      setScreen("project");
      setActiveView("overview");
      setProject(null);
      setLoading(true);
      setError(null);

      try {
        const data = await fetchProject(token);
        setProject(data);
      } catch (err) {
        console.error("Mobile preview: failed to load project", err);
        setError(err.message || "Failed to load project");
      } finally {
        setLoading(false);
      }
    },
    [fetchProject]
  );

  const handleBackToMain = useCallback(() => {
    setScreen("main");
    setError(null);
    setLoading(false);
  }, []);

  const handleProjectUpdate = useCallback(async () => {
    const token = project?.access_token;
    if (!token) return;
    try {
      const data = await fetchProject(token);
      setProject(data);
    } catch (err) {
      console.error("Mobile preview: failed to refresh project", err);
    }
  }, [project?.access_token, fetchProject]);

  const screenLabel = screen === "main" ? "Main" : getProjectTitle(project) || "Project";

  return (
    <div className="mobile-preview-simulator">
      <p className="mobile-preview-simulator__screen-label" aria-live="polite">
        {screenLabel}
      </p>
      <MobilePreviewFrame>
        <div
          className="mobile-preview-simulator__pane"
          hidden={screen !== "main"}
          aria-hidden={screen !== "main"}
        >
          <MobileProjectsHome preview onSelectProject={handleSelectProject} />
        </div>
        {screen === "project" ? (
          <div className="mobile-preview-simulator__pane">
            <ProjectPageMobile
              preview
              project={project}
              loading={loading}
              error={error}
              activeView={activeView}
              setActiveView={setActiveView}
              onUpdate={handleProjectUpdate}
              isPortalProjectPath={false}
              token={project?.access_token}
              isAdmin={isAdmin}
              onBack={handleBackToMain}
            />
          </div>
        ) : null}
      </MobilePreviewFrame>
    </div>
  );
}
