import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  isDesignPipelineStatus,
  isExcludedFromProjectLists,
  isCancelledStatus,
} from "../utils/projectStatus";
import { getStateFilter } from "../utils/stateFilter";
import { projectPath } from "../utils/projectUrl";
import { isUserAdmin } from "../utils/auth";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import useAppLogo from "../hooks/useAppLogo.js";
import { FIELD_DEFINITIONS, STREAM_SORT_ORDER } from "../utils/projectListFilters";
import {
  MANDATORY_PLANNING_SELECT_OPTIONS,
  normalizeMandatoryPlanningStatus,
} from "../constants/planningStatusFields";

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
const WINDOWS_FILTER_OPTIONS = FIELD_DEFINITIONS.window_status.values;
const WINDOWS_FILTER_DEFAULT = FIELD_DEFINITIONS.window_status.defaultValue;
const ENERGY_FILTER_OPTIONS = MANDATORY_PLANNING_SELECT_OPTIONS;

const GRID_COLUMNS = "2fr 1fr 1fr 1fr";
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

const inactiveLinkStyle = {
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
};

const activeLinkStyle = {
  ...inactiveLinkStyle,
  background: WHITE,
  color: MONUMENT,
  outline: `1px solid ${UI.outline}`,
  boxShadow: "0 2px 4px rgba(50,50,51,.04)",
};

const statusPillStyle = {
  width: "100%",
  padding: "4px 8px",
  borderRadius: "6px",
  fontSize: "0.85rem",
  color: TEXT.dark,
  fontWeight: 500,
  boxSizing: "border-box",
  textAlign: "center",
};

export default function WindowsManager() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [sortMode, setSortMode] = useState("date");
  const [coloursFilter, setColoursFilter] = useState("");
  const [energyFilter, setEnergyFilter] = useState("");
  const [windowsFilter, setWindowsFilter] = useState("");
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [isAdmin, setIsAdmin] = useState(false);
  const { hasDrawing } = useDrawingAccess();

  useEffect(() => {
    fetchProjects();
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  function parseDate(project) {
    if (!project.year) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(project.year)) {
      return new Date(project.year);
    }
    if (/^\d{4}$/.test(project.year)) {
      return new Date(`${project.year}-01-01`);
    }
    return null;
  }

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
      const visibleProjects = data.filter((project) => {
        if (isExcludedFromProjectLists(project.status) || isCancelledStatus(project.status)) return false;
        return isDesignPipelineStatus(project.status);
      });
      setProjects(sortProjects(visibleProjects));
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projects.length > 0) {
      setProjects(sortProjects(projects));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, sortMode]);

  function getEffectiveValue(project, fieldName, defaultValue) {
    const value = project[fieldName];
    if (!value || value === null || value === undefined || value === "") {
      return defaultValue || "";
    }
    return value;
  }

  function getEnergyReportStatus(project) {
    return normalizeMandatoryPlanningStatus(
      null,
      project.planning_energy_report_received_at ?? project.planningEnergyReportReceivedAt
    );
  }

  function getColoursStatusColor(status) {
    if (status === "Complete") return STREAM.streamGreenLight;
    if (status === "Sent") return INDICATOR.orangeLight;
    return STREAM.qldRedLight;
  }

  function getEnergyStatusColor(status) {
    if (status === "Complete") return STREAM.streamGreenLight;
    return STREAM.qldRedLight;
  }

  function getWindowsStatusColor(status) {
    if (status === "Complete") return STREAM.streamGreenLight;
    if (status === "Ordered") return INDICATOR.orangeLight;
    return STREAM.qldRedLight;
  }

  const sortButtonStyle = (active) => ({
    padding: "8px 16px",
    fontSize: "0.9rem",
    fontWeight: 500,
    color: active ? WHITE : MONUMENT,
    background: active ? MONUMENT : WHITE,
    border: active ? "none" : outlineBorder,
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background 0.2s",
    height: "36px",
    boxSizing: "border-box",
  });

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
            Windows Manager
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
          <Link to="/managers/site-visit-manager" style={inactiveLinkStyle}>
            Site Visit Manager
          </Link>
          <Link to="/managers/contract-manager" style={inactiveLinkStyle}>
            Contract Manager
          </Link>
          <Link to="/managers/colour-manager" style={inactiveLinkStyle}>
            Colour Manager
          </Link>
          <Link to="/managers/windows-manager" style={activeLinkStyle}>
            Windows Manager
          </Link>
          <Link to="/managers/status-manager" style={inactiveLinkStyle}>
            Status Manager
          </Link>
          {isAdmin ? (
            <>
              <Link to="/managers/next-outs" style={inactiveLinkStyle}>
                Next Outs
              </Link>
              <Link to="/managers/planning-manager" style={inactiveLinkStyle}>
                Planning Manager
              </Link>
            </>
          ) : null}
          {hasDrawing ? (
            <Link to="/managers/drawing-manager" style={inactiveLinkStyle}>
              Drawing Manager
            </Link>
          ) : null}
          <div style={{ flex: 1 }} />
          <Link to="/projects" style={inactiveLinkStyle}>
            ← Back to Main
          </Link>
        </div>

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
                <div>Colour Status</div>
                <div>Energy Report Status</div>
                <div>Window Status</div>
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
                    style={sortButtonStyle(sortMode === "date")}
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
                    style={sortButtonStyle(sortMode === "stream")}
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
                  value={energyFilter}
                  onChange={(e) => setEnergyFilter(e.target.value)}
                  aria-label="Filter by Energy Report Status"
                  style={headingFilterSelectStyle}
                >
                  <option value="">All</option>
                  {ENERGY_FILTER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  value={windowsFilter}
                  onChange={(e) => setWindowsFilter(e.target.value)}
                  aria-label="Filter by Window Status"
                  style={headingFilterSelectStyle}
                >
                  <option value="">All</option>
                  {WINDOWS_FILTER_OPTIONS.map((value) => (
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
                    ? projects.filter((project) => {
                        const projectState = (project.state || "").toUpperCase();
                        return projectState === stateFilter.toUpperCase();
                      })
                    : projects;

                  if (coloursFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) =>
                        getEffectiveValue(project, "colours_status", COLOURS_FILTER_DEFAULT) === coloursFilter
                    );
                  }
                  if (energyFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) => getEnergyReportStatus(project) === energyFilter
                    );
                  }
                  if (windowsFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) =>
                        getEffectiveValue(project, "window_status", WINDOWS_FILTER_DEFAULT) === windowsFilter
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
                        const projectName =
                          project.name ||
                          `${project.street || ""}, ${project.suburb || ""}`.trim() ||
                          "Unknown Project";
                        const coloursStatus = getEffectiveValue(project, "colours_status", COLOURS_FILTER_DEFAULT);
                        const energyStatus = getEnergyReportStatus(project);
                        const windowsStatus = getEffectiveValue(project, "window_status", WINDOWS_FILTER_DEFAULT);
                        const streamName = String(project.stream || "").trim();
                        const streamFill = streamName
                          ? getStreamGroupColors(getStreamColorGroup(streamName)).lighter
                          : null;

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
                            <Link
                              to={projectPath(project, { view: "windows" })}
                              style={{
                                textDecoration: "none",
                                color: MONUMENT,
                                fontWeight: 500,
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                gap: "8px",
                                minWidth: 0,
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
                            <div style={{ ...statusPillStyle, background: getColoursStatusColor(coloursStatus) }}>
                              {coloursStatus}
                            </div>
                            <div style={{ ...statusPillStyle, background: getEnergyStatusColor(energyStatus) }}>
                              {energyStatus}
                            </div>
                            <div style={{ ...statusPillStyle, background: getWindowsStatusColor(windowsStatus) }}>
                              {windowsStatus}
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
