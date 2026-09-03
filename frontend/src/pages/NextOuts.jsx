import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  PRE_ENGAGEMENT_PHASE,
  DESIGN_PHASE,
  PERMIT_PHASE,
  isDesignPipelineStatus,
  isExcludedFromProjectLists,
  isCancelledStatus,
  isDesignPhaseStatus,
  isPermitPhaseStatus,
} from "../utils/projectStatus";
import { getStateFilter } from "../utils/stateFilter";
import { projectPath } from "../utils/projectUrl";
import { isUserAdmin } from "../utils/auth";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import useAppLogo from "../hooks/useAppLogo.js";
import { FIELD_DEFINITIONS, STREAM_SORT_ORDER } from "../utils/projectListFilters";
import {
  SEWER_STATUS_FILTER_OPTIONS,
  BUILDING_PERMIT_STATUS_OPTIONS,
  getSewerConnectionStatusLabel,
  normalizeBuildingPermitStatus,
  normalizePlanningStatus,
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

const PHASE_FILTER_OPTIONS = [PRE_ENGAGEMENT_PHASE, DESIGN_PHASE, PERMIT_PHASE];
const TOWN_PLANNING_COMPLETE_FILTER = "Not Required / Complete";
const TOWN_PLANNING_COMPLETE_GROUP = new Set(["Not Required", "Complete"]);
const TOWN_PLANNING_FILTER_OPTIONS = ["Not Selected", "Incomplete", TOWN_PLANNING_COMPLETE_FILTER];
const CONTRACT_FILTER_OPTIONS = FIELD_DEFINITIONS.contract_status.values;
const CONTRACT_FILTER_DEFAULT = FIELD_DEFINITIONS.contract_status.defaultValue;
const COLOURS_FILTER_OPTIONS = FIELD_DEFINITIONS.colours_status.values;
const COLOURS_FILTER_DEFAULT = FIELD_DEFINITIONS.colours_status.defaultValue;

const GRID_COLUMNS = "2fr 1fr 1fr 1fr 1fr";
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

export default function NextOuts() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc");
  const [sortMode, setSortMode] = useState("date");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [townPlanningFilter, setTownPlanningFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [coloursFilter, setColoursFilter] = useState("");
  const [sewerStatusFilter, setSewerStatusFilter] = useState("");
  const [buildingPermitFilter, setBuildingPermitFilter] = useState("");
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

  function getTownPlanningValue(project) {
    return normalizePlanningStatus(project.planning_town_planning ?? project.planning_status);
  }

  function getBuildingPermitValue(project) {
    return normalizeBuildingPermitStatus(
      project.building_permit_status ?? project.buildingPermitStatus,
      project.planning_building_permit_received_at ?? project.planningBuildingPermitReceivedAt
    );
  }

  function getPhaseColor(status) {
    if (isPermitPhaseStatus(status)) return STREAM.vicBlueLight;
    if (isDesignPhaseStatus(status)) return STREAM.streamGreenLight;
    return INDICATOR.orangeLight;
  }

  function getTownPlanningColor(status) {
    const value = normalizePlanningStatus(status);
    if (value === "Not Required" || value === "Complete") return STREAM.streamGreenLight;
    if (value === "Incomplete") return INDICATOR.orangeLight;
    return STREAM.qldRedLight;
  }

  function getSentCompleteColor(status) {
    if (status === "Complete") return STREAM.streamGreenLight;
    if (status === "Sent") return INDICATOR.orangeLight;
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
            Next Outs
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
          <Link to="/managers/status-manager" style={inactiveLinkStyle}>
            Status Manager
          </Link>
          {isAdmin ? (
            <>
              <Link to="/managers/next-outs" style={activeLinkStyle}>
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
                <div>Phase</div>
                <div>Town Planning</div>
                <div>Contract</div>
                <div>Colours</div>
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
                  value={phaseFilter}
                  onChange={(e) => setPhaseFilter(e.target.value)}
                  aria-label="Filter by Phase"
                  style={headingFilterSelectStyle}
                >
                  <option value="">All</option>
                  {PHASE_FILTER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  value={townPlanningFilter}
                  onChange={(e) => setTownPlanningFilter(e.target.value)}
                  aria-label="Filter by Town Planning"
                  style={headingFilterSelectStyle}
                >
                  <option value="">All</option>
                  {TOWN_PLANNING_FILTER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  value={contractFilter}
                  onChange={(e) => setContractFilter(e.target.value)}
                  aria-label="Filter by Contract"
                  style={headingFilterSelectStyle}
                >
                  <option value="">All</option>
                  {CONTRACT_FILTER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  value={coloursFilter}
                  onChange={(e) => setColoursFilter(e.target.value)}
                  aria-label="Filter by Colours"
                  style={headingFilterSelectStyle}
                >
                  <option value="">All</option>
                  {COLOURS_FILTER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  ...GRID_LAYOUT,
                  alignItems: "center",
                  marginTop: "8px",
                }}
              >
                <div />
                <select
                  value={sewerStatusFilter}
                  onChange={(e) => setSewerStatusFilter(e.target.value)}
                  aria-label="Filter by Sewer Status"
                  style={headingFilterSelectStyle}
                >
                  <option value="">Sewer Status</option>
                  {SEWER_STATUS_FILTER_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select
                  value={buildingPermitFilter}
                  onChange={(e) => setBuildingPermitFilter(e.target.value)}
                  aria-label="Filter by Building Permit Status"
                  style={headingFilterSelectStyle}
                >
                  <option value="">Building Permit</option>
                  {BUILDING_PERMIT_STATUS_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <div />
                <div />
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

                  if (phaseFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) => (project.status || "") === phaseFilter
                    );
                  }
                  if (townPlanningFilter === TOWN_PLANNING_COMPLETE_FILTER) {
                    filteredProjects = filteredProjects.filter((project) =>
                      TOWN_PLANNING_COMPLETE_GROUP.has(getTownPlanningValue(project))
                    );
                  } else if (townPlanningFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) => getTownPlanningValue(project) === townPlanningFilter
                    );
                  }
                  if (contractFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) =>
                        getEffectiveValue(project, "contract_status", CONTRACT_FILTER_DEFAULT) === contractFilter
                    );
                  }
                  if (coloursFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) =>
                        getEffectiveValue(project, "colours_status", COLOURS_FILTER_DEFAULT) === coloursFilter
                    );
                  }
                  if (sewerStatusFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) => getSewerConnectionStatusLabel(project) === sewerStatusFilter
                    );
                  }
                  if (buildingPermitFilter) {
                    filteredProjects = filteredProjects.filter(
                      (project) => getBuildingPermitValue(project) === buildingPermitFilter
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
                        const phase = project.status || PRE_ENGAGEMENT_PHASE;
                        const townPlanning = getTownPlanningValue(project);
                        const contractStatus = getEffectiveValue(project, "contract_status", CONTRACT_FILTER_DEFAULT);
                        const coloursStatus = getEffectiveValue(project, "colours_status", COLOURS_FILTER_DEFAULT);
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
                            <div style={{ ...statusPillStyle, background: getPhaseColor(phase) }}>
                              {phase}
                            </div>
                            <div style={{ ...statusPillStyle, background: getTownPlanningColor(townPlanning) }}>
                              {townPlanning}
                            </div>
                            <div style={{ ...statusPillStyle, background: getSentCompleteColor(contractStatus) }}>
                              {contractStatus}
                            </div>
                            <div style={{ ...statusPillStyle, background: getSentCompleteColor(coloursStatus) }}>
                              {coloursStatus}
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
