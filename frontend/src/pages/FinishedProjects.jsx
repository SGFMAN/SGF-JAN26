import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const WHITE = "#fff";

const API_URL = "";

export default function FinishedProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
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
      console.log("Projects from API:", data);
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
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
            Finished Projects
          </Link>
          <Link
            to="/site-visit-manager"
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
        {/* Section 3: Projects */}
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
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "16px" }}>
            Finished Projects {(() => {
              const finishedProjects = projects.filter((project) => project.status === "Complete");
              return finishedProjects.length > 0 ? `(${finishedProjects.length} total)` : "";
            })()}
          </h2>
          
          {/* Search Bar */}
          <div style={{ marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "400px",
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
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (() => {
            const finishedProjects = projects.filter((project) => project.status === "Complete");
            if (finishedProjects.length === 0) {
              return <p style={{ color: "#32323399" }}>No finished projects found.</p>;
            }
            return null;
          })()}
          {!loading && !error && projects.length > 0 && (() => {
            // Filter to only show projects with "Complete" status
            const finishedProjects = projects.filter((project) => project.status === "Complete");
            
            // Filter projects based on search query
            let filteredProjects = searchQuery.trim()
              ? finishedProjects.filter((project) => {
                  const query = searchQuery.toLowerCase();
                  const suburb = (project.suburb || "").toLowerCase();
                  const street = (project.street || "").toLowerCase();
                  const name = (project.name || "").toLowerCase();
                  return suburb.includes(query) || street.includes(query) || name.includes(query);
                })
              : finishedProjects;

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
                {filteredProjects.map((project) => (
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
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                    >
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
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                          {project.suburb || "Unknown Suburb"}
                        </div>
                        <div style={{ fontSize: "0.95rem", color: "#a1a1a3", fontWeight: 400 }}>
                          {project.street || "No address"}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.9rem", color: "#323233cc", textAlign: "center" }}>
                        Status: {project.status}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
