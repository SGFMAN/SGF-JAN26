import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  isExcludedFromProjectLists,
} from "../utils/projectStatus";
import { getStateFilter } from "../utils/stateFilter";
import { projectPath } from "../utils/projectUrl";
import { isUserAdmin } from "../utils/auth";
import { useDrawingAccess } from "../hooks/useDrawingAccess";
import useAppLogo from "../hooks/useAppLogo.js";
import { FIELD_DEFINITIONS } from "../utils/projectListFilters";
import {
  headingsFromOverviewKeys,
  normalizeManagerSettings,
  projectMatchesNextOutsIncludedPhase,
} from "../utils/managerSettings";
import {
  SEWER_STATUS_FILTER_OPTIONS,
  BUILDING_PERMIT_STATUS_OPTIONS,
  MANDATORY_PLANNING_SELECT_OPTIONS,
} from "../constants/planningStatusFields";
import {
  buildDesignPhaseStatusTiles,
} from "../utils/designPhaseStatusTiles.js";

import StateFilterButtons from "../components/StateFilterButtons";
import { UI, TEXT, outlineBorder } from "../utils/uiThemeTokens.js";
import { getStreamColorGroup, getStreamGroupColors } from "../utils/streamColors.js";
import { INDICATOR } from "../utils/managerStatusColors.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const TOWN_PLANNING_COMPLETE_FILTER = "Not Required / Complete";
const TOWN_PLANNING_COMPLETE_GROUP = new Set(["Not Required", "Complete"]);
const PLANNING_REQUIREMENT_FILTER_OPTIONS = ["Not Selected", "Incomplete", TOWN_PLANNING_COMPLETE_FILTER];
const DRAWINGS_FILTER_OPTIONS = ["Incomplete", "In Progress", "Complete"];
const DEPOSIT_FILTER_OPTIONS = ["Full Deposit", "Partial Deposit", "No Deposit"];
const CONTRACT_OVERVIEW_FILTER_OPTIONS = ["Documents Missing", "All Documents Complete"];
const SURVEY_SOILS_FILTER_OPTIONS = ["Not Booked", "In Progress", "Complete"];
const SEWER_FILTER_OPTIONS = ["Not Selected", ...SEWER_STATUS_FILTER_OPTIONS];

function getGridLayout(headingCount) {
  const gridTemplateColumns =
    headingCount > 0
      ? `minmax(200px, 1fr) repeat(${headingCount}, 100px)`
      : "minmax(200px, 1fr)";
  return {
    display: "grid",
    gridTemplateColumns,
    gap: "4px",
    padding: "4px 8px",
    boxSizing: "border-box",
    minWidth: `${200 + headingCount * 104}px`,
  };
}

function getOverviewFilterOptions(key) {
  switch (key) {
    case "deposit":
      return DEPOSIT_FILTER_OPTIONS;
    case "concept-drawings":
    case "working-drawings":
      return DRAWINGS_FILTER_OPTIONS;
    case "site-visit":
      return FIELD_DEFINITIONS.site_visit_status.values;
    case "colours":
      return FIELD_DEFINITIONS.colours_status.values;
    case "windows":
      return FIELD_DEFINITIONS.window_status.values;
    case "contract":
      return CONTRACT_OVERVIEW_FILTER_OPTIONS;
    case "survey-soils":
      return SURVEY_SOILS_FILTER_OPTIONS;
    case "town-planning":
    case "bal":
      return PLANNING_REQUIREMENT_FILTER_OPTIONS;
    case "energy":
    case "footing":
      return MANDATORY_PLANNING_SELECT_OPTIONS;
    case "building-permit":
      return BUILDING_PERMIT_STATUS_OPTIONS;
    case "sewer-connection":
      return SEWER_FILTER_OPTIONS;
    default:
      return [];
  }
}

function tileMatchesFilter(tile, selected, key) {
  if (!selected) return true;
  if ((key === "town-planning" || key === "bal") && selected === TOWN_PLANNING_COMPLETE_FILTER) {
    return TOWN_PLANNING_COMPLETE_GROUP.has(tile?.value);
  }
  return tile?.value === selected;
}

function tilesByKey(project) {
  return Object.fromEntries(buildDesignPhaseStatusTiles(project).map((tile) => [tile.key, tile]));
}

function projectDisplayName(project) {
  return (
    project?.name ||
    `${project?.street || ""}, ${project?.suburb || ""}`.trim() ||
    "Unknown Project"
  );
}

function compareStatusValues(left, right) {
  const a = String(left?.value || "").trim();
  const b = String(right?.value || "").trim();
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function compareProjectsByNextOuts(a, b, sortLevels) {
  const tilesA = tilesByKey(a);
  const tilesB = tilesByKey(b);
  for (const level of sortLevels || []) {
    if (!level?.key) continue;
    const comparison = compareStatusValues(tilesA[level.key], tilesB[level.key]);
    if (comparison !== 0) return level.direction === "desc" ? -comparison : comparison;
  }
  return projectDisplayName(a).localeCompare(projectDisplayName(b), undefined, {
    sensitivity: "base",
  });
}

function sortNextOutsProjects(projectsList, sortLevels) {
  return [...projectsList].sort((a, b) => compareProjectsByNextOuts(a, b, sortLevels));
}

const headingFilterSelectStyle = {
  height: "28px",
  padding: "0 2px",
  fontSize: "0.68rem",
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
  padding: "3px 4px",
  borderRadius: "6px",
  fontSize: "0.65rem",
  color: TEXT.dark,
  fontWeight: 500,
  boxSizing: "border-box",
  textAlign: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  textDecoration: "none",
  display: "block",
};

export default function NextOuts() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tileFilters, setTileFilters] = useState({});
  const [statusHeadings, setStatusHeadings] = useState([]);
  const [sortLevels, setSortLevels] = useState([]);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [isAdmin, setIsAdmin] = useState(false);
  const { hasDrawing } = useDrawingAccess();

  useEffect(() => {
    fetchProjects();
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const [projectsRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`),
        fetch(`${API_URL}/api/manager-settings`),
      ]);
      if (!projectsRes.ok) {
        throw new Error(`Failed to fetch projects: ${projectsRes.statusText}`);
      }
      const data = await projectsRes.json();
      const managerSettings = settingsRes.ok
        ? normalizeManagerSettings((await settingsRes.json().catch(() => ({})))?.settings)
        : { nextOutsIncludedPhases: [], nextOutsOverviewKeys: [], nextOutsSort: [] };
      setStatusHeadings(headingsFromOverviewKeys(managerSettings.nextOutsOverviewKeys));
      setSortLevels(managerSettings.nextOutsSort);
      const visibleProjects = data.filter((project) => {
        if (isExcludedFromProjectLists(project.status)) return false;
        return projectMatchesNextOutsIncludedPhase(project.status, managerSettings.nextOutsIncludedPhases);
      });
      setProjects(visibleProjects);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  function setTileFilter(key, value) {
    setTileFilters((prev) => ({ ...prev, [key]: value }));
  }

  const gridLayout = getGridLayout(statusHeadings.length);

  function renderProjectRow(project) {
    const projectName = projectDisplayName(project);
    const streamName = String(project.stream || "").trim();
    const streamFill = streamName
      ? getStreamGroupColors(getStreamColorGroup(streamName)).lighter
      : null;
    const byKey = tilesByKey(project);
    const tiles = statusHeadings.map((heading) => byKey[heading.key]).filter(Boolean);

    return (
      <div
        key={project.id}
        style={{
          ...gridLayout,
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
            position: "sticky",
            left: 0,
            zIndex: 1,
            background: WHITE,
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
        {tiles.map((tile) => {
          const style = tile?.indicatorStyle || {};
          return (
            <Link
              key={tile.key}
              to={projectPath(project, { view: tile.view })}
              title={`${tile.label}: ${tile.value}`}
              style={{
                ...statusPillStyle,
                background: style.background,
                color: style.color || TEXT.dark,
                border: style.border ?? "none",
              }}
            >
              {tile.value}
            </Link>
          );
        })}
      </div>
    );
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
          <Link to="/managers/windows-manager" style={inactiveLinkStyle}>
            Windows Manager
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
            padding: "24px 16px",
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
                  ...gridLayout,
                  background: MONUMENT,
                  color: PAGE_TEXT,
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  marginBottom: "8px",
                  alignItems: "end",
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 12,
                    background: MONUMENT,
                    padding: "4px 0",
                  }}
                >
                  Project
                </div>
                {statusHeadings.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      textAlign: "center",
                      fontSize: "0.7rem",
                      lineHeight: 1.15,
                      whiteSpace: "normal",
                      padding: "4px 0",
                    }}
                  >
                    {item.label}
                  </div>
                ))}
              </div>

              <div
                style={{
                  ...gridLayout,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 11,
                    background: SECTION_GREY,
                    minWidth: 0,
                  }}
                />
                {statusHeadings.map((item) => (
                  <select
                    key={item.key}
                    value={tileFilters[item.key] || ""}
                    onChange={(e) => setTileFilter(item.key, e.target.value)}
                    aria-label={`Filter by ${item.label}`}
                    style={headingFilterSelectStyle}
                  >
                    <option value="">All</option>
                    {getOverviewFilterOptions(item.key).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ))}
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

                  const activeTileFilters = statusHeadings.filter(
                    (heading) => tileFilters[heading.key]
                  );
                  if (activeTileFilters.length > 0) {
                    filteredProjects = filteredProjects.filter((project) => {
                      const byKey = tilesByKey(project);
                      return activeTileFilters.every((heading) =>
                        tileMatchesFilter(byKey[heading.key], tileFilters[heading.key], heading.key)
                      );
                    });
                  }

                  if (filteredProjects.length === 0) {
                    return (
                      <p style={{ color: UI.textMuted }}>No projects found.</p>
                    );
                  }

                  const sortedProjects = sortNextOutsProjects(filteredProjects, sortLevels);

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {sortedProjects.map((project) => renderProjectRow(project))}
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
