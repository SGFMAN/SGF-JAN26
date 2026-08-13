import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import HotlistSidebarSection from "../components/HotlistSidebarSection";
import ProjectStatusSidebarSection from "../components/ProjectStatusSidebarSection";
import AdminToolsSidebarSection from "../components/AdminToolsSidebarSection";
import ManagersSalesMenuGroup from "../components/ManagersSalesMenuGroup";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter } from "../utils/stateFilter";
import { useProjectListSearch } from "../utils/projectListSearch";
import {
  PROJECT_STATUS_OPTIONS,
  isDesignPhaseStatus,
  isHotlistStatus,
  isCancelledStatus,
} from "../utils/projectStatus";
import { CLASSIFICATION_OPTIONS } from "../utils/classifications";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import useAppLogo from "../hooks/useAppLogo.js";
import useIsMobile from "../hooks/useIsMobile";
import MobileProjectsHome from "../mobile/MobileProjectsHome";

// COLORBOND® Classic Monument (very dark, almost black-grey)
import StateFilterButtons from "../components/StateFilterButtons";
import { UI, MENU, INDICATOR, outlineBorder } from "../utils/uiThemeTokens.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
import { buildDuplicateChainGroups } from "../utils/duplicateProjectLinks";
import { fetchProjectsList } from "../utils/projectsListCache";
import {
  getDepositPaidFilterCategory,
  projectMatchesDepositPaidFilter,
} from "../utils/projectDeposit";
import { matchesSearch } from "../utils/projectListFilters";
const MONUMENT = UI.textPrimary;
// A bit lighter version for sections
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const SORT_BUTTON_STYLE_ID = 4;

const menuOptions = [
  { key: "projects", label: "Projects", route: "/projects" },
  { key: "settings", label: "Settings", route: "/settings" },
];

// Field definitions with their possible values and default values
const FIELD_DEFINITIONS = {
  window_status: {
    label: "Windows",
    values: ["Not Ordered", "Ordered", "Complete"],
    defaultValue: "Not Ordered",
  },
  drawings_status: {
    label: "Drawings",
    values: ["Not Assigned", "Concept Stage", "Working Drawing Stage", "Drawings Complete"],
    defaultValue: "Not Assigned",
  },
  colours_status: {
    label: "Colours",
    values: ["Not Sent", "Sent", "Complete"],
    defaultValue: "Not Sent",
  },
  site_visit_status: {
    label: "Site Visit",
    values: ["Not Complete", "Email Sent", "Booked", "Complete"],
    defaultValue: "Not Complete",
  },
  contract_status: {
    label: "Contract",
    values: ["Not Sent", "Sent", "Complete"],
    defaultValue: "Not Sent",
  },
  supporting_documents_status: {
    label: "Supporting Documents",
    values: ["Not Sent", "Sent", "Complete"],
    defaultValue: "Not Sent",
  },
  water_declaration_status: {
    label: "Water Declaration",
    values: ["Not Required", "Not Sent", "Sent", "Complete"],
    defaultValue: "Not Required",
  },
  planning_status: {
    label: "Planning",
    values: ["Not Selected", "No Planning Required", "Planning Required", "Planning Permit Issued"],
    defaultValue: "Not Selected",
  },
  energy_report_status: {
    label: "Energy Report",
    values: ["Not Submitted", "Sent", "Complete"],
    defaultValue: "Not Submitted",
  },
  footing_certification_status: {
    label: "Footing Certification",
    values: ["Not Submitted", "Sent", "Complete"],
    defaultValue: "Not Submitted",
  },
  building_permit_status: {
    label: "Building Permit",
    values: ["Not Submitted", "Submitted", "Completed"],
    defaultValue: "Not Submitted",
  },
  deposit: {
    label: "Deposit Paid",
    values: ["Full Deposit", "Partial Deposit", "No Deposit Paid", "Deposit Owed"],
    defaultValue: "Partial Deposit",
  },
  status: {
    label: "Project Status",
    values: PROJECT_STATUS_OPTIONS,
    defaultValue: "Design Phase",
  },
  year: {
    label: "Year",
    values: [], // Will be populated dynamically from projects
    defaultValue: new Date().getFullYear().toString(),
  },
  classification: {
    label: "Classification",
    values: CLASSIFICATION_OPTIONS,
    defaultValue: "",
  },
};

const FILTER_SELECT_EXTRA = "3.25rem";

function filterSelectWidth(...labelGroups) {
  const labels = labelGroups.flat().map(String);
  const maxLen = Math.max(0, ...labels.map((label) => label.length));
  return `calc(${maxLen}ch + ${FILTER_SELECT_EXTRA})`;
}

const FILTER_BY_FIELD_LABELS = [
  "All fields",
  ...Object.values(FIELD_DEFINITIONS).map((def) => def.label),
];

const DESIGN_PHASE_ACTION_BUTTON_LABELS = [
  "VIC Only",
  "QLD Only",
  "All Projects",
  "Sort by Suburb",
  "Sort By Class",
  "Sort By Stream",
];

const CLASSIFICATION_SORT_ORDER = FIELD_DEFINITIONS.classification.values;
const STREAM_SORT_ORDER = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Pumped On Property",
  "Henderson",
  "Creat Cash Flow",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

const CHAIN_OUTLINE_GREY = "#7a7a7e";
const CHAIN_GOLD_LIGHT = "#E8C547";
const CHAIN_GOLD_DEEP = "#D4AF37";

/** Five interlocking links along a shallow sag (parabola), gold fill with grey outline. */
function SaggingDuplicateChainIcon() {
  const w = 76;
  const h = 26;
  const cx = w / 2;
  const half = 30;
  const yEdge = 6.5;
  const sag = 12;
  const n = 5;
  const links = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = 11 + t * (w - 22);
    const y = yEdge + sag * (1 - Math.pow((x - cx) / half, 2));
    const dy = (-2 * sag * (x - cx)) / (half * half);
    const angle = (Math.atan(dy) * 180) / Math.PI;
    const gold = i % 2 === 0 ? CHAIN_GOLD_LIGHT : CHAIN_GOLD_DEEP;
    links.push(
      <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
        <rect
          x="-6"
          y="-3"
          width="12"
          height="6"
          rx="3"
          fill="none"
          stroke={CHAIN_OUTLINE_GREY}
          strokeWidth="2.45"
          strokeLinejoin="round"
        />
        <rect
          x="-6"
          y="-3"
          width="12"
          height="6"
          rx="3"
          fill="none"
          stroke={gold}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </g>
    );
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {links}
    </svg>
  );
}

export default function HomePage() {
  const logo = useAppLogo();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useProjectListSearch();
  const [selectedField, setSelectedField] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [sortMode, setSortMode] = useState("suburb"); // default view
  const [, setUiButtonStyleRevision] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    fetchProjects();

    let isMounted = true;

    const handleFocus = () => {
      if (isMounted && location.pathname === "/projects") {
        fetchProjects({ soft: true });
      }
    };

    const handleVisibilityChange = () => {
      if (isMounted && !document.hidden && location.pathname === "/projects") {
        fetchProjects({ soft: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [location.pathname]);

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  useEffect(() => {
    // Reset value dropdown when field changes
    setSelectedValue("");
  }, [selectedField]);

  async function fetchProjects(options = {}) {
    try {
      if (!options.soft) setLoading(true);
      setError(null);
      const data = await fetchProjectsList({
        view: "card",
        force: Boolean(options.force),
        retry503Max: 60,
      });
      setProjects(data || []);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // Get the effective value for a field (handles NULL by using default)
  function getEffectiveValue(project, fieldName) {
    const fieldDef = FIELD_DEFINITIONS[fieldName];
    if (!fieldDef) return project[fieldName] || "";
    
    let value = project[fieldName];
    
    // Deposit Paid filter: pre-engagement complete, else full 5%, else partial / none
    if (fieldName === "deposit") {
      return getDepositPaidFilterCategory(project);
    }
    
    // Special handling for year field: extract year from date
    if (fieldName === "year" && value) {
      // If it's a date (YYYY-MM-DD), extract just the year
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        value = value.substring(0, 4);
      }
      // If it's already just a year (YYYY), use it as is
      // If NULL or empty, return the default value
      if (!value || value === null || value === undefined || value === "") {
        return fieldDef.defaultValue || "";
      }
      return value;
    }
    
    // If NULL or empty, return the default value
    if (!value || value === null || value === undefined || value === "") {
      return fieldDef.defaultValue || "";
    }
    return value;
  }

  // Get available values for selected field (from actual projects + predefined values)
  function getAvailableValues() {
    if (!selectedField) return [];
    
    const fieldDef = FIELD_DEFINITIONS[selectedField];
    if (!fieldDef) return [];

    // For deposit field, only show predefined filter options
    if (selectedField === "deposit") {
      return fieldDef.values;
    }

    // For drawings status, only show the predefined ordered values
    // (Not Assigned, Concept Stage, Working Drawing Stage, Drawings Complete)
    if (selectedField === "drawings_status") {
      return fieldDef.values;
    }

    // Get unique values from projects (using effective values)
    const projectValues = new Set();
    projects.forEach(project => {
      // Design pipeline by status only (on_hold is separate)
      if (isDesignPhaseStatus(project.status)) {
        const effectiveValue = getEffectiveValue(project, selectedField);
        if (effectiveValue) {
          projectValues.add(effectiveValue);
        }
      }
    });

    // For year field, only use values from projects (don't include predefined values)
    // This ensures we only show years that actually exist in projects
    if (selectedField === "year") {
      return Array.from(projectValues).sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
    }

    // Combine predefined values with actual project values
    const allValues = new Set([...fieldDef.values, ...Array.from(projectValues)]);
    return Array.from(allValues).sort();
  }

  // Filter projects based on status, field/value, search query, and state filter
  function getFilteredProjects() {
    // Design Phase list by status only; on_hold is the sash + On Hold page only.
    let filtered = projects.filter((project) => {
      if (isHotlistStatus(project.status)) return false;
      if (isCancelledStatus(project.status)) return false;
      return isDesignPhaseStatus(project.status);
    });

    // Filter by state if specified
    if (stateFilter !== "All") {
      filtered = filtered.filter(project => {
        const projectState = (project.state || "").toUpperCase();
        return projectState === stateFilter.toUpperCase();
      });
    }

    // Then filter by field/value if specified
    if (selectedField && selectedValue) {
      filtered = filtered.filter((project) => {
        if (selectedField === "deposit") {
          return projectMatchesDepositPaidFilter(project, selectedValue);
        }
        const effectiveValue = getEffectiveValue(project, selectedField);
        return effectiveValue === selectedValue;
      });
    }

    // Finally filter by search query if specified (address + client contact emails 1–3)
    if (searchQuery.trim()) {
      filtered = filtered.filter((project) => matchesSearch(project, searchQuery));
    }

    // Sort based on selected sort mode
    filtered.sort((a, b) => {
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();

      if (sortMode === "class") {
        const classA = a.classification || "";
        const classB = b.classification || "";
        const idxA = CLASSIFICATION_SORT_ORDER.indexOf(classA);
        const idxB = CLASSIFICATION_SORT_ORDER.indexOf(classB);
        const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
        const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
        if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
        return streetA.localeCompare(streetB);
      }

      if (sortMode === "stream") {
        const streamA = a.stream || "";
        const streamB = b.stream || "";
        const idxA = STREAM_SORT_ORDER.indexOf(streamA);
        const idxB = STREAM_SORT_ORDER.indexOf(streamB);
        const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
        const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
        if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
        return streetA.localeCompare(streetB);
      }

      // suburb (default) or any fallback:
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      return streetA.localeCompare(streetB);
    });

    return filtered;
  }

  const availableValues = getAvailableValues();
  const filteredProjects = getFilteredProjects();

  const designPhaseHeadingCount = (() => {
    const currentProjects = projects.filter((project) => {
      if (isHotlistStatus(project.status) || isCancelledStatus(project.status)) return false;
      return isDesignPhaseStatus(project.status);
    });
    const totalCount = currentProjects.length;

    if (selectedField && selectedValue) {
      return `(${filteredProjects.length} found)`;
    }
    if (searchQuery.trim()) {
      return `(${filteredProjects.length} found)`;
    }
    if (stateFilter !== "All") {
      return `(${filteredProjects.length} total)`;
    }
    return totalCount > 0 ? `(${totalCount} total)` : "";
  })();

  const filterByFieldWidth = filterSelectWidth(FILTER_BY_FIELD_LABELS);
  const filterByValueWidth = filterSelectWidth("All values", availableValues);
  const designPhaseActionButtonWidth = filterSelectWidth(DESIGN_PHASE_ACTION_BUTTON_LABELS);

  const filterLabelStyle = {
    display: "block",
    fontSize: "0.9rem",
    color: UI.textMuted,
    marginBottom: "6px",
    marginTop: 0,
    fontWeight: 500,
    lineHeight: 1.35,
    minHeight: "1.215rem",
  };

  const filterControlStyle = {
    height: "48px",
    padding: "0 16px",
    borderRadius: "8px",
    border: outlineBorder,
    fontSize: "1rem",
    boxSizing: "border-box",
    outline: "none",
  };

  const toolbarButtonStyle = {
    ...filterControlStyle,
    width: designPhaseActionButtonWidth,
    minWidth: designPhaseActionButtonWidth,
    maxWidth: designPhaseActionButtonWidth,
    fontSize: "0.9rem",
    fontWeight: 500,
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
  };

  const sortButtonStyle = (mode) => {
    const selected = sortMode === mode;
    const savedStyle = buildSavedButtonStyle(SORT_BUTTON_STYLE_ID, selected);
    const fallback = {
      background: selected ? INDICATOR.orangeLight : WHITE,
      color: MONUMENT,
      border: selected ? `1px solid ${INDICATOR.orangeDark}` : outlineBorder,
    };
    return {
      style: {
        ...toolbarButtonStyle,
        ...(savedStyle ?? fallback),
        transition: "background 0.2s, border-color 0.2s, color 0.2s",
      },
      savedStyle,
      selected,
    };
  };

  const sortButtonHoverHandlers = ({ savedStyle, selected }) =>
    savedStyle
      ? {}
      : {
          onMouseEnter: (e) => {
            if (!selected) e.currentTarget.style.background = UI.inputBg;
          },
          onMouseLeave: (e) => {
            if (!selected) e.currentTarget.style.background = WHITE;
          },
        };

  if (isMobile) {
    return <MobileProjectsHome />;
  }

  return (
    <div
      className="page-container project-list-page sgf-desktop-only"
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
            Design Phase{designPhaseHeadingCount ? ` ${designPhaseHeadingCount}` : ""}
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
          <div className="project-list-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", marginBottom: "20px" }}>
          {/* Search Bar and Filter Dropdowns - All on one line */}
          <div style={{ display: "flex", gap: "8px", flex: "1 1 auto", flexWrap: "nowrap", alignItems: "stretch", marginTop: 0, position: "relative", minWidth: 0 }}>
            {/* Search Bar */}
            <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column" }}>
              <label style={filterLabelStyle}>
                Search
              </label>
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  ...filterControlStyle,
                  width: "360px",
                  color: MONUMENT,
                  background: WHITE,
                }}
              />
            </div>

            {/* Filter by Field */}
            <div style={{ flex: "0 0 auto", marginLeft: "10px", display: "flex", flexDirection: "column" }}>
              <label style={filterLabelStyle}>
                Filter by Field
              </label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                style={{
                  ...filterControlStyle,
                  width: filterByFieldWidth,
                  minWidth: filterByFieldWidth,
                  maxWidth: filterByFieldWidth,
                  color: MONUMENT,
                  background: WHITE,
                  cursor: "pointer",
                }}
              >
                <option value="">All fields</option>
                {Object.entries(FIELD_DEFINITIONS).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Value - Always visible */}
            <div style={{ flex: "0 0 auto", marginLeft: "10px", display: "flex", flexDirection: "column" }}>
              <label style={filterLabelStyle}>
                Filter by Value
              </label>
              <select
                value={selectedValue}
                onChange={(e) => setSelectedValue(e.target.value)}
                disabled={!selectedField}
                style={{
                  ...filterControlStyle,
                  width: filterByValueWidth,
                  minWidth: filterByValueWidth,
                  maxWidth: filterByValueWidth,
                  color: selectedField ? MONUMENT : "#999",
                  background: selectedField ? WHITE : UI.inputBg,
                  cursor: selectedField ? "pointer" : "not-allowed",
                }}
              >
                <option value="">All values</option>
                {selectedField && availableValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters Button */}
            {(selectedField || searchQuery.trim()) && (
              <div style={{ flex: "0 0 auto", marginLeft: "10px", display: "flex", flexDirection: "column" }}>
                <label style={{ ...filterLabelStyle, visibility: "hidden" }} aria-hidden="true">
                  Clear
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedField("");
                    setSelectedValue("");
                    setSearchQuery("");
                  }}
                  style={{
                    ...filterControlStyle,
                    background: MENU.purpleLight,
                    color: PAGE_TEXT,
                    border: outlineBorder,
                    cursor: "pointer",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "0 0 auto", flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "row", gap: "10px" }}>
                <StateFilterButtons
                  stateFilter={stateFilter}
                  setStateFilter={setStateFilter}
                  buttonWidth={designPhaseActionButtonWidth}
                  buttonStyle={toolbarButtonStyle}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "row", gap: "10px" }}>
                {["suburb", "class", "stream"].map((mode) => {
                  const button = sortButtonStyle(mode);
                  const labels = {
                    suburb: "Sort by Suburb",
                    class: "Sort By Class",
                    stream: "Sort By Stream",
                  };
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSortMode(mode)}
                      style={button.style}
                      {...sortButtonHoverHandlers(button)}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="project-list-scroll">
          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && filteredProjects.length === 0 && (
            <p style={{ color: UI.textMuted }}>
              {selectedField && selectedValue
                ? "No projects match the selected filter."
                : searchQuery.trim()
                ? "No projects match your search."
                : "No current projects found."}
            </p>
          )}
          {!loading && !error && filteredProjects.length > 0 && (() => {
            const displayGroups = buildDuplicateChainGroups(filteredProjects);

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
                {displayGroups.map((group, gi) => {
                  const primary = group.type === "pair" ? group.a : group.project;
                  const prevPrimary =
                    gi > 0
                      ? displayGroups[gi - 1].type === "pair"
                        ? displayGroups[gi - 1].a
                        : displayGroups[gi - 1].project
                      : null;

                  const suburbName = (primary.suburb || "").trim();
                  const prevSuburbName = (prevPrimary?.suburb || "").trim();

                  const classificationName = (primary.classification || "").trim();
                  const prevClassificationName = (prevPrimary?.classification || "").trim();

                  const streamName = (primary.stream || "").trim();
                  const prevStreamName = (prevPrimary?.stream || "").trim();

                  const groupKey =
                    sortMode === "suburb"
                      ? suburbName
                        ? suburbName[0].toUpperCase()
                        : ""
                      : sortMode === "class"
                        ? classificationName
                        : sortMode === "stream"
                          ? streamName
                          : "";

                  const prevGroupKey =
                    sortMode === "suburb"
                      ? prevSuburbName
                        ? prevSuburbName[0].toUpperCase()
                        : ""
                      : sortMode === "class"
                        ? prevClassificationName
                        : sortMode === "stream"
                          ? prevStreamName
                          : "";

                  const showGroupHeader = groupKey && groupKey !== prevGroupKey;
                  const groupLabel = groupKey;

                  return (
                    <React.Fragment
                      key={
                        group.type === "pair"
                          ? "pair-" + group.a.id + "-" + group.b.id
                          : "single-" + group.project.id
                      }
                    >
                      {showGroupHeader && (
                        <div style={{ flexBasis: "100%", width: "100%", marginTop: "18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: MONUMENT, whiteSpace: "nowrap" }}>{groupLabel}</div>
                            <div style={{ height: "2px", background: MONUMENT, flex: 1, opacity: 0.4 }} />
                          </div>
                        </div>
                      )}
                      {group.type === "single" ? (
                        <ProjectRectangleCard project={group.project} />
                      ) : (
                        <div
                          title="Renovation copy linked to original"
                          style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "nowrap",
                            gap: "20px",
                            width: "420px",
                            flexShrink: 0,
                          }}
                        >
                          <ProjectRectangleCard project={group.a} />
                          <ProjectRectangleCard project={group.b} />
                          <div
                            aria-hidden
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: "50%",
                              transform: "translate(-50%, -50%)",
                              zIndex: 15,
                              pointerEvents: "none",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <SaggingDuplicateChainIcon />
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}
          </div>
        </div>
      </div>
    </div>
  );
  }