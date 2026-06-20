import React, { useState, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import HotlistSidebarSection from "../components/HotlistSidebarSection";
import ManagersSalesMenuGroup from "../components/ManagersSalesMenuGroup";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter } from "../utils/stateFilter";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import ProjectListGroupHeader from "../components/ProjectListGroupHeader";
import { getProjectListGroupKey } from "../utils/projectListGrouping";
import { isOnHoldFlag, isHotlistStatus } from "../utils/projectStatus";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
import StateFilterButtons from "../components/StateFilterButtons";
import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
// A bit lighter version for sections
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

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
    // On Hold page: projects with the on_hold flag (not a status). Exclude Hotlist workflow only.
    let filtered = projects.filter(
      (project) => isOnHoldFlag(project) && !isHotlistStatus(project.status)
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
              color: PAGE_TEXT,
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
          }}
        >
          {/* Menu Buttons */}
          <HotlistSidebarSection />
          
          {/* All Projects, Design Phase, Construction Phase, Finished Projects, Cancelled, On Hold - Light Green */}
          <div style={{ background: MENU.green, borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: `2px solid ${UI.outline}` }}>
            <Link
              to="/all-projects"
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
              All Projects
            </Link>
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
              Design Phase
            </Link>
            <Link
              to="/construction-phase"
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
              Construction Phase
            </Link>
            <Link
              to="/finished-projects"
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
              Finished Projects
            </Link>
            <Link
              to="/cancelled"
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
              Cancelled
            </Link>
            <Link
              to="/on-hold"
              style={{
                background: MENU.greenActive,
                color: MENU.activeText,
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
          
          <ManagersSalesMenuGroup />

          {/* Email Generator, Maps — Purple (Admin Only) */}
          {isAdmin && (
            <div
              style={{
                background: MENU.purpleLight,
                borderRadius: "10px",
                padding: "4px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                border: `2px solid ${UI.outline}`,
              }}
            >
              <Link
                to="/email-generator"
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
                Email Generator
              </Link>
              <Link
                to="/maps"
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
                Maps
              </Link>
            </div>
          )}
          
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Link
              to="/settings"
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
              Settings
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/apply-fields"
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
              const totalCount = projects.filter(
                (project) => isOnHoldFlag(project) && !isHotlistStatus(project.status)
              ).length;
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
                  color: UI.textMuted,
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
                  border: `2px solid ${UI.outline}`,
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
                    border: `2px solid ${UI.outline}`,
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

          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && filteredProjects.length === 0 && (
            <p style={{ color: UI.textMuted }}>
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
              {filteredProjects.map((project, index) => {
                const prevProject = index > 0 ? filteredProjects[index - 1] : null;
                const groupKey = getProjectListGroupKey(project, "suburb");
                const prevGroupKey = getProjectListGroupKey(prevProject, "suburb");
                const showGroupHeader = groupKey && groupKey !== prevGroupKey;

                return (
                  <Fragment key={project.id}>
                    {showGroupHeader && (
                      <ProjectListGroupHeader label={groupKey} isFirst={index === 0} />
                    )}
                    <ProjectRectangleCard project={project} />
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
