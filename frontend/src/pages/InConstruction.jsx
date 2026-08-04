import React, { useState, useEffect, Fragment, useMemo } from "react";
import {
  isConstructionPhaseStatus,
  isHotlistStatus,
  isCancelledStatus,
} from "../utils/projectStatus";
import { Link, useLocation } from "react-router-dom";
import HotlistSidebarSection from "../components/HotlistSidebarSection";
import ProjectStatusSidebarSection from "../components/ProjectStatusSidebarSection";
import AdminToolsSidebarSection from "../components/AdminToolsSidebarSection";
import ManagersSalesMenuGroup from "../components/ManagersSalesMenuGroup";
import ProjectListToolbar from "../components/ProjectListToolbar";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter } from "../utils/stateFilter";
import { useProjectListSearch } from "../utils/projectListSearch";
import {
  applyProjectListFilters,
  buildProjectListHeadingCount,
  getAvailableFieldValues,
} from "../utils/projectListFilters";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import ProjectListGroupHeader from "../components/ProjectListGroupHeader";
import { getProjectListGroupKey } from "../utils/projectListGrouping";
import useAppLogo from "../hooks/useAppLogo.js";

// COLORBOND® Classic Monument (very dark, almost black-grey)
import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
// A bit lighter version for sections
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const API_URL = "";

export default function InConstruction() {
  const logo = useAppLogo();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useProjectListSearch();
  const [selectedField, setSelectedField] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [sortMode, setSortMode] = useState("suburb");
  useEffect(() => {
    // Check admin status first so buttons show up quickly
    checkAdminStatus();
    fetchProjects();
  }, []);

  // Refetch projects when navigating back to this page or when window gains focus
  useEffect(() => {
    let isMounted = true;
    
    const handleFocus = () => {
      if (isMounted && location.pathname === "/construction-phase") {
        console.log("Window focused, refetching projects...");
        fetchProjects();
      }
    };
    
    const handleVisibilityChange = () => {
      if (isMounted && !document.hidden && location.pathname === "/construction-phase") {
        console.log("Page visible, refetching projects...");
        fetchProjects();
      }
    };
    
    // Refetch when navigating to this page
    if (location.pathname === "/construction-phase") {
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

  useEffect(() => {
    setSelectedValue("");
  }, [selectedField]);

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

  const scopeFilter = (project) => {
    if (isHotlistStatus(project.status) || isCancelledStatus(project.status)) return false;
    return isConstructionPhaseStatus(project.status);
  };

  const scopeProjects = useMemo(
    () => projects.filter(scopeFilter),
    [projects]
  );

  const availableValues = useMemo(
    () => getAvailableFieldValues(projects, selectedField, scopeFilter),
    [projects, selectedField]
  );

  const constructionFilteredProjects = useMemo(
    () =>
      applyProjectListFilters(projects, {
        scopeFilter,
        stateFilter,
        selectedField,
        selectedValue,
        searchQuery,
        sortMode,
      }),
    [projects, stateFilter, selectedField, selectedValue, searchQuery, sortMode]
  );

  const headingCount = buildProjectListHeadingCount({
    totalCount: scopeProjects.length,
    filteredCount: constructionFilteredProjects.length,
    searchQuery,
    selectedField,
    selectedValue,
    stateFilter,
  });

  const hasConstructionProjects = scopeProjects.length > 0;

  return (
    <div
      className="page-container project-list-page"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
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
          justifyContent: "center",
          padding: "0 32px",
          boxSizing: "border-box",
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
            Construction Phase{headingCount ? ` ${headingCount}` : ""}
          </h1>
        </div>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          marginLeft: "auto",
          marginRight: "auto",
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
          
          <ProjectStatusSidebarSection activePath={location.pathname} stateFilter={stateFilter} />
          
          <ManagersSalesMenuGroup />

          {isAdmin && (
            <AdminToolsSidebarSection activePath={location.pathname} visible={isAdmin} />
          )}
          <div style={{ flex: 1 }} />
        </div>
        {/* Section 3: Projects */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ProjectListToolbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedField={selectedField}
            setSelectedField={setSelectedField}
            selectedValue={selectedValue}
            setSelectedValue={setSelectedValue}
            stateFilter={stateFilter}
            setStateFilter={setStateFilter}
            sortMode={sortMode}
            setSortMode={setSortMode}
            availableValues={availableValues}
            onClearFilters={() => {
              setSelectedField("");
              setSelectedValue("");
              setSearchQuery("");
            }}
          />

          <div className="project-list-scroll">
          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}
          {!loading && !error && constructionFilteredProjects.length === 0 && (
            <p style={{ color: UI.textMuted }}>
              {selectedField && selectedValue
                ? "No projects match the selected filter."
                : searchQuery.trim()
                  ? "No projects match your search."
                  : hasConstructionProjects
                    ? "No projects match your filters."
                    : "No construction phase projects found."}
            </p>
          )}
          {!loading && !error && constructionFilteredProjects.length > 0 && (
            <div
              className="projects-grid"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                alignItems: "flex-start",
              }}
            >
              {constructionFilteredProjects.map((project, index) => {
                const prevProject = index > 0 ? constructionFilteredProjects[index - 1] : null;
                const groupKey = getProjectListGroupKey(project, sortMode);
                const prevGroupKey = getProjectListGroupKey(prevProject, sortMode);
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
    </div>
  );
}
