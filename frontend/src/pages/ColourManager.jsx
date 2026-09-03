import React, { useState, useEffect } from "react";
import {
  isDesignPipelineStatus,
  isExcludedFromProjectLists,
  isCancelledStatus,
} from "../utils/projectStatus";
import { Link } from "react-router-dom";
import { getStateFilter } from "../utils/stateFilter";
import { projectPath } from "../utils/projectUrl";
import { isUserAdmin } from "../utils/auth";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import useAppLogo from "../hooks/useAppLogo.js";
import { FIELD_DEFINITIONS, STREAM_SORT_ORDER } from "../utils/projectListFilters";

import StateFilterButtons from "../components/StateFilterButtons";
import { UI, STREAM, TEXT, outlineBorder } from "../utils/uiThemeTokens.js";
import { getStreamColorGroup, getStreamGroupColors } from "../utils/streamColors.js";
import { INDICATOR } from "../utils/managerStatusColors.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const COLOURS_FILTER_OPTIONS = FIELD_DEFINITIONS.colours_status.values;
const COLOURS_FILTER_DEFAULT = FIELD_DEFINITIONS.colours_status.defaultValue;
const DRAWINGS_FILTER_OPTIONS = FIELD_DEFINITIONS.drawings_status.values;
const DRAWINGS_FILTER_DEFAULT = FIELD_DEFINITIONS.drawings_status.defaultValue;
// Same 6-column grid as Contract Manager so the colour-status pill matches Drawings Status width.
const GRID_COLUMNS = "2fr 1fr 1fr 1fr 1fr 1fr";
const GRID_LAYOUT = {
  display: "grid",
  gridTemplateColumns: GRID_COLUMNS,
  gap: "10px",
  padding: "4px 10px",
  boxSizing: "border-box",
};

const headingFilterSelectStyle = {
  height: "36px",
  padding: "0 8px",
  fontSize: "0.9rem",
  fontWeight: 500,
  color: MONUMENT,
  background: WHITE,
  border: outlineBorder,
  borderRadius: "8px",
  cursor: "pointer",
  outline: "none",
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
};

export default function ColourManager() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" or "desc"
  const [sortMode, setSortMode] = useState("date"); // "date" or "stream"
  const [coloursFilter, setColoursFilter] = useState("");
  const [drawingsFilter, setDrawingsFilter] = useState("");
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [isAdmin, setIsAdmin] = useState(false);
  const { hasDrawing } = useDrawingAccess();

  useEffect(() => {
    fetchProjects();
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  // Parse date from year field
  function parseDate(project) {
    if (!project.year) return null;
    // Check if it's a date format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(project.year)) {
      return new Date(project.year);
    }
    // If it's just a year, use January 1st of that year
    if (/^\d{4}$/.test(project.year)) {
      return new Date(`${project.year}-01-01`);
    }
    return null;
  }

  // Sort projects by date
  function sortProjectsByDate(projectsList, order) {
    return [...projectsList].sort((a, b) => {
      const dateA = parseDate(a);
      const dateB = parseDate(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      const comparison = dateA - dateB;
      return order === "asc" ? comparison : -comparison;
    });
  }

  function sortProjectsByStream(projectsList) {
    return [...projectsList].sort((a, b) => {
      const streamA = (a.stream || "").trim();
      const streamB = (b.stream || "").trim();
      const idxA = STREAM_SORT_ORDER.indexOf(streamA);
      const idxB = STREAM_SORT_ORDER.indexOf(streamB);
      const safeA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
      const safeB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
      if (safeA !== safeB) return safeA - safeB;
      if (streamA !== streamB) return streamA.localeCompare(streamB);
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      return (a.street || "").toLowerCase().localeCompare((b.street || "").toLowerCase());
    });
  }

  function sortProjects(projectsList) {
    if (sortMode === "stream") return sortProjectsByStream(projectsList);
    return sortProjectsByDate(projectsList, sortOrder);
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
      const designPhaseProjects = data.filter((project) => {
        if (isExcludedFromProjectLists(project.status) || isCancelledStatus(project.status)) return false;
        return isDesignPipelineStatus(project.status);
      });
      const sortedProjects = sortProjects(designPhaseProjects);
      setProjects(sortedProjects);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Re-sort when sort order changes
  useEffect(() => {
    if (projects.length > 0) {
      setProjects(sortProjects(projects));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, sortMode]);

  // Status options
  const COLOURS_STATUS_OPTIONS = ["Not Sent", "Sent", "Complete"];

  function getStatusColor(status) {
    if (status === "Complete") return STREAM.streamGreenLight;
    if (status === "Sent") return INDICATOR.orangeLight;
    return STREAM.qldRedLight;
  }

  function getDrawingsStatusColor(status) {
    const value = status || "Not Assigned";
    if (value === "Drawings Complete") return STREAM.streamGreenLight;
    if (value === "Concept Stage" || value === "Working Drawing Stage") return INDICATOR.orangeLight;
    return STREAM.qldRedLight;
  }

  // Get effective value with default
  function getEffectiveValue(project, fieldName, defaultValue) {
    const value = project[fieldName];
    if (!value || value === null || value === undefined || value === "") {
      return defaultValue || "";
    }
    return value;
  }

  // Save field update
  async function saveField(projectId, fieldName, value) {
    try {
      // Get the project to preserve other fields
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
      
      // Optimistically update the local state immediately (no flash)
      setProjects(prevProjects =>
        prevProjects.map(p =>
          p.id === projectId ? { ...p, [fieldName]: value === "" ? null : value } : p
        )
      );
      
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          status: project.status || null,
          [fieldName]: value === "" ? null : value,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save field:", errorData.error || response.statusText);
        // Revert by refetching (only on error)
        await fetchProjects();
        return;
      }

      // Success - local state already updated, no need to refetch
      console.log("Field saved successfully");
    } catch (error) {
      console.error("Error saving field:", error);
      // Revert optimistic update on error
      await fetchProjects();
    }
  }

  // Handle status change
  async function handleStatusChange(projectId, fieldName, newValue) {
    await saveField(projectId, fieldName, newValue);
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
            Colour Manager
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
              outline: `1px solid ${UI.outline}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
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
            <>
              <Link
                to="/managers/next-outs"
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
                Next Outs
              </Link>
              <Link
                to="/managers/planning-manager"
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
                Planning Manager
              </Link>
            </>
          )}
          {hasDrawing && (
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
            overflow: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              background: SECTION_GREY,
              paddingBottom: "8px",
            }}
          >
          <div
            style={{
              ...GRID_LAYOUT,
              background: MONUMENT,
              color: PAGE_TEXT,
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.9rem",
              marginBottom: "8px",
              alignItems: "center",
            }}
          >
            <div>Project</div>
            <div>Colours Status</div>
            <div>Drawings Status</div>
          </div>

          <div
            style={{
              ...GRID_LAYOUT,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
              <button
                type="button"
                onClick={() => {
                  if (sortMode === "date") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortMode("date");
                  }
                }}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  color: sortMode === "date" ? WHITE : MONUMENT,
                  background: sortMode === "date" ? MONUMENT : WHITE,
                  border: sortMode === "date" ? "none" : outlineBorder,
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  height: "36px",
                  boxSizing: "border-box",
                }}
                onMouseEnter={(e) => {
                  if (sortMode === "date") e.currentTarget.style.background = "#1a1a1a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = sortMode === "date" ? MONUMENT : WHITE;
                }}
              >
                Sort: {sortOrder === "asc" ? "Oldest First" : "Newest First"}
              </button>
              <button
                type="button"
                onClick={() => setSortMode("stream")}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  color: sortMode === "stream" ? WHITE : MONUMENT,
                  background: sortMode === "stream" ? MONUMENT : WHITE,
                  border: sortMode === "stream" ? "none" : outlineBorder,
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  height: "36px",
                  boxSizing: "border-box",
                }}
                onMouseEnter={(e) => {
                  if (sortMode === "stream") e.currentTarget.style.background = "#1a1a1a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = sortMode === "stream" ? MONUMENT : WHITE;
                }}
              >
                Sort by Stream
              </button>
            </div>
            <select
              value={coloursFilter}
              onChange={(e) => setColoursFilter(e.target.value)}
              aria-label="Filter by Colour Status"
              style={headingFilterSelectStyle}
            >
              <option value="">All</option>
              {COLOURS_FILTER_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={drawingsFilter}
              onChange={(e) => setDrawingsFilter(e.target.value)}
              aria-label="Filter by Drawings Status"
              style={headingFilterSelectStyle}
            >
              <option value="">All</option>
              {DRAWINGS_FILTER_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          </div>
          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: INDICATOR.red }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {(() => {
                let filteredProjects = stateFilter !== "All"
                  ? projects.filter(project => {
                      const projectState = (project.state || "").toUpperCase();
                      return projectState === stateFilter.toUpperCase();
                    })
                  : projects;

                if (coloursFilter) {
                  filteredProjects = filteredProjects.filter((project) =>
                    getEffectiveValue(project, "colours_status", COLOURS_FILTER_DEFAULT) === coloursFilter
                  );
                }
                if (drawingsFilter) {
                  filteredProjects = filteredProjects.filter((project) =>
                    getEffectiveValue(project, "drawings_status", DRAWINGS_FILTER_DEFAULT) === drawingsFilter
                  );
                }

                if (filteredProjects.length === 0) {
                  return (
                    <p style={{ color: UI.textMuted }}>No projects found.</p>
                  );
                }

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {filteredProjects.map((project) => {
                const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "Unknown Project";
                const coloursStatus = getEffectiveValue(project, "colours_status", "Not Sent");
                const drawingsStatus = getEffectiveValue(project, "drawings_status", DRAWINGS_FILTER_DEFAULT);
                const streamName = String(project.stream || "").trim();
                const streamFill = streamName
                  ? getStreamGroupColors(getStreamColorGroup(streamName)).lighter
                  : null;
                const canRender =
                  project.drawings_pdf_location &&
                  project.colours_pdf_location &&
                  String(project.drawings_pdf_location).trim() &&
                  String(project.colours_pdf_location).trim();

                return (
                  <div
                    key={project.id}
                    style={{
                      ...GRID_LAYOUT,
                      background: WHITE,
                      borderRadius: "8px",
                      color: MONUMENT,
                      fontSize: "0.9rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <Link
                        to={projectPath(project)}
                        style={{
                          textDecoration: "none",
                          color: MONUMENT,
                          fontWeight: 500,
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: "8px",
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {streamName ? (
                          <span
                            style={{
                              flexShrink: 0,
                              display: "inline-block",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              lineHeight: 1.2,
                              color: MONUMENT,
                              background: streamFill,
                              boxSizing: "border-box",
                            }}
                          >
                            {streamName}
                          </span>
                        ) : null}
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {projectName}
                        </span>
                      </Link>
                      {canRender ? (
                        <Link
                          to={projectPath(project, { view: "colours" })}
                          style={{
                            fontSize: "0.75rem",
                            color: LIGHT_MONUMENT,
                            textDecoration: "underline",
                            fontWeight: 500,
                            flexShrink: 0,
                          }}
                        >
                          Render
                        </Link>
                      ) : null}
                    </div>
                    <select
                      value={coloursStatus}
                      onChange={(e) => handleStatusChange(project.id, "colours_status", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "0.9rem",
                        color: TEXT.dark,
                        background: getStatusColor(coloursStatus),
                        cursor: "pointer",
                        fontWeight: 500,
                        boxSizing: "border-box",
                        textAlign: "center",
                      }}
                    >
                      {COLOURS_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <div
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "0.9rem",
                        color: TEXT.dark,
                        background: getDrawingsStatusColor(drawingsStatus),
                        fontWeight: 500,
                        boxSizing: "border-box",
                        textAlign: "center",
                      }}
                    >
                      {drawingsStatus}
                    </div>
                  </div>
                    );
                  })}
                  </div>
                );
              })()}
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
