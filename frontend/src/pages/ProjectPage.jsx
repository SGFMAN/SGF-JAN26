import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import ProjectInfo from "./ProjectInfo";
import ClientInfo from "./ClientInfo";
import Drawings from "./Drawings";
import Colours from "./Colours";
import Windows from "./Windows";
import SiteVisit from "./SiteVisit";
import Contract from "./Contract";
import Admin from "./Admin";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const WHITE = "#fff";

const API_URL = "";

// Menu options for this page plus back to main
const MENU_OPTIONS = [
  { label: "Project Info", key: "project-info" },
  { label: "Client Info", key: "client-info" },
  { label: "Drawings", key: "drawings" },
  { label: "Colours", key: "colours" },
  { label: "Windows", key: "windows" },
  { label: "Site Visit", key: "site-visit" },
  { label: "Contract", key: "contract" },
  { label: "Admin", key: "admin" },
];

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState("project-info");

  useEffect(() => {
    if (id) {
      fetchProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchProject() {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_URL}/api/projects/${id}`;
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
      setProject(data);
    } catch (err) {
      console.error("Error fetching project:", err);
      setError(err.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
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
          {loading ? "Loading..." : error ? "Error" : project?.name || "Project"}
        </h1>
      </div>

      {/* Sections 2 & 3 */}
      <div
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
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            width: "200px",
            minWidth: "200px",
            height: "700px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 16px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            color: MONUMENT,
          }}
        >
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
            Menu
          </h2>
          {MENU_OPTIONS.map((item) => (
            <button
              key={item.key}
              style={{
                background: activeView === item.key ? SECTION_GREY : WHITE,
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
                marginBottom: "3px",
                display: "block",
                width: "100%",
              }}
              onClick={() => setActiveView(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <Link
            to="/"
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
              marginTop: "14px",
              marginBottom: "0",
              display: "block",
            }}
          >
            Back to main
          </Link>
        </div>
        {/* Section 3: Project Content */}
        <div
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
          {loading && <p style={{ color: "#32323399" }}>Loading project...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && project && (
            <>
              {activeView === "project-info" && <ProjectInfo project={project} onUpdate={fetchProject} />}
              {activeView === "client-info" && <ClientInfo project={project} onUpdate={fetchProject} />}
              {activeView === "drawings" && <Drawings project={project} />}
              {activeView === "colours" && <Colours project={project} />}
              {activeView === "windows" && <Windows project={project} />}
              {activeView === "site-visit" && <SiteVisit project={project} />}
              {activeView === "contract" && <Contract project={project} />}
              {activeView === "admin" && <Admin project={project} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
