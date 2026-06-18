import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import NewProject from "./NewProject_1_Address";
import NewProject2 from "./NewProject_2_ClientDetails";
import NewProject_5_PDFUpload from "./NewProject_5_PDFUpload";
import NewProject_3_ProjectCost from "./NewProject_3_ProjectCost";
import NewProject_4_FoldersOption from "./NewProject_4_FoldersOption";
import NewProject_6_EmailInternal from "./NewProject_6_EmailInternal";
import NewProject_7_EmailClient from "./NewProject_7_EmailClient";
import SalesSidebarLink from "../components/SalesSidebarLink";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import {
  PROJECT_STATUS_OPTIONS,
  isDesignPhaseStatus,
  isHotlistStatus,
  isCancelledStatus,
} from "../utils/projectStatus";
import { CLASSIFICATION_OPTIONS } from "../utils/classifications";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import logo from "../images/logo.png";
import useIsMobile from "../hooks/useIsMobile";
import MobileProjectsHome from "../mobile/MobileProjectsHome";

// COLORBOND® Classic Monument (very dark, almost black-grey)
import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
// A bit lighter version for sections
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const API_URL = "";

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
    values: ["Not Submitted", "Sent", "Complete"],
    defaultValue: "Not Submitted",
  },
  deposit: {
    label: "Deposit Paid",
    values: ["Full Deposit", "Partial Deposit"],
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

/** Pair renovation source + single copy for Design Phase grid (chain layout). */
function buildDuplicateChainGroups(items) {
  const byId = new Map(items.map((p) => [p.id, p]));
  const used = new Set();
  const groups = [];
  for (const p of items) {
    if (used.has(p.id)) continue;
    const raw = p.duplicate_source_project_id;
    if (raw != null && String(raw).trim() !== "") {
      const srcId = Number(raw);
      const src = Number.isFinite(srcId) ? byId.get(srcId) : null;
      if (src && !used.has(src.id)) {
        groups.push({ type: "pair", a: src, b: p });
        used.add(src.id);
        used.add(p.id);
        continue;
      }
    }
    const copy = items.find(
      (c) => !used.has(c.id) && Number(c.duplicate_source_project_id) === p.id
    );
    if (copy) {
      groups.push({ type: "pair", a: p, b: copy });
      used.add(p.id);
      used.add(copy.id);
      continue;
    }
    groups.push({ type: "single", project: p });
    used.add(p.id);
  }
  return groups;
}

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
  const location = useLocation();
  const isMobile = useIsMobile();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedField, setSelectedField] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [sortMode, setSortMode] = useState("suburb"); // default view
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectStep, setNewProjectStep] = useState(1);
  const [createdProjectForEmail, setCreatedProjectForEmail] = useState(null);
  const [newProjectFormData, setNewProjectFormData] = useState({
    suburb: "",
    street: "",
    state: "",
    stream: "",
    deposit: "",
    customDeposit: "",
    projectCost: "",
    salesperson: "",
    specs: "",
    classification: "",
    clientName: "",
    email: "",
    phone: "",
    createFolders: true,
   });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
    fetchProjects();

    let isMounted = true;

    const handleFocus = () => {
      if (isMounted && location.pathname === "/projects") {
        fetchProjects();
      }
    };

    const handleVisibilityChange = () => {
      if (isMounted && !document.hidden && location.pathname === "/projects") {
        fetchProjects();
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

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  useEffect(() => {
    // Reset value dropdown when field changes
    setSelectedValue("");
  }, [selectedField]);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const url = `${API_URL}/api/projects`;
      let response = await fetch(url);
      // Retry while backend finishes migrations (listen-first startup)
      let attempts = 0;
      while (response.status === 503 && attempts < 60) {
        await new Promise((r) => setTimeout(r, 1000));
        attempts += 1;
        response = await fetch(url);
      }
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText} ${errorText}`);
      }
      const data = await response.json();
      setProjects(data || []);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(formData) {
    // Combine street and suburb into project name
    const projectName = `${formData.street}, ${formData.suburb}`.trim() || "New Project";
    
    const response = await fetch(`${API_URL}/api/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        status: "Design Phase",
        suburb: formData.suburb || null,
        street: formData.street || null,
        state: formData.state || null,
        stream: formData.stream || null,
        deposit: formData.deposit || null, // Deposit amount (formatted with commas)
        project_cost: formData.projectCost || null, // Project cost (formatted with commas)
        salesperson: formData.salesperson || null,
        specs: formData.specs || null,
        classification: formData.classification || null,
        client_name: formData.clientName || null,
        email: formData.email || null,
        phone: formData.phone || null,
        // Also populate Contact 1 with the same values
        client1_name: formData.clientName || null,
        client1_email: formData.email || null,
        client1_phone: formData.phone || null,
        // Store current date in YYYY-MM-DD format
        year: new Date().toISOString().split('T')[0],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || "Failed to create project");
    }

    const newProject = await response.json();
    // Refresh projects list
    await fetchProjects();
    // Don't close modal here - let NewProject4 handle it after email is sent
    // Reset form data (but keep modal open for email preview)
    setNewProjectFormData({
      suburb: "",
      street: "",
      state: "",
      stream: "",
      deposit: "",
      customDeposit: "",
      projectCost: "",
      salesperson: "",
      specs: "",
      classification: "",
      clientName: "",
      email: "",
      phone: "",
    });
    return newProject;
  }

  // Create project and show email modal (used when "No" is clicked - no folders, no PDF)
  async function handleCreateProjectAndEmail() {
    try {
      // Create the project
      const newProject = await handleCreateProject(newProjectFormData);
      
      // Store project and show email modal (step 6)
      setCreatedProjectForEmail(newProject);
      setNewProjectStep(6); // Go to email modal
    } catch (error) {
      console.error("Error creating project:", error);
      alert(error.message || "Failed to create project");
    }
  }

  // Get the effective value for a field (handles NULL by using default)
  function getEffectiveValue(project, fieldName) {
    const fieldDef = FIELD_DEFINITIONS[fieldName];
    if (!fieldDef) return project[fieldName] || "";
    
    let value = project[fieldName];
    
    // Special handling for deposit field: convert to Full Deposit/Partial Deposit based on whether it equals 5% of project cost
    if (fieldName === "deposit") {
      const depositValue = value;
      if (!depositValue || depositValue === null || depositValue === undefined || depositValue === "") {
        return null; // No deposit - don't show in filter
      }
      
      // Get project cost
      const projectCost = project.project_cost;
      if (!projectCost || projectCost === null || projectCost === undefined || projectCost === "") {
        return "Partial Deposit"; // If no project cost, can't determine if full, so treat as partial
      }
      
      // Extract numeric values (remove $ and commas)
      const depositNumeric = parseInt(depositValue.toString().replace(/[^0-9]/g, "")) || 0;
      const costNumeric = parseInt(projectCost.toString().replace(/[^0-9]/g, "")) || 0;
      
      if (costNumeric === 0) {
        return "Partial Deposit"; // Can't calculate if no cost
      }
      
      // Calculate 5% of project cost
      const fullDepositAmount = Math.floor(costNumeric / 20); // 5% = divide by 20
      
      // Match Admin / Planning: full when paid >= canonical 5% (floor(cost/20))
      if (fullDepositAmount > 0 && depositNumeric >= fullDepositAmount) {
        return "Full Deposit";
      } else if (depositNumeric > 0) {
        return "Partial Deposit";
      }
      
      return null; // No deposit
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

    // For deposit field, only show predefined values (Full Deposit, Partial Deposit)
    // Don't include project values since we calculate them dynamically
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
      filtered = filtered.filter(project => {
        const effectiveValue = getEffectiveValue(project, selectedField);
        return effectiveValue === selectedValue;
      });
    }

    // Finally filter by search query if specified
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(project => {
        const suburb = (project.suburb || "").toLowerCase();
        const street = (project.street || "").toLowerCase();
        const name = (project.name || "").toLowerCase();
        return suburb.includes(query) || street.includes(query) || name.includes(query);
      });
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

  if (isMobile) {
    return <MobileProjectsHome />;
  }

  return (
    <div
      className="page-container sgf-desktop-only"
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
            Design Phase
          </h1>
        </div>
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "68px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {/* State Filter Buttons */}
          <button
            onClick={() => {
              const newFilter = "VIC";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "VIC" ? "#4D93D9" : WHITE,
              color: stateFilter === "VIC" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "VIC" ? "#4D93D9" : UI.outline}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = UI.inputBg;
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            VIC Only
          </button>
          <button
            onClick={() => {
              const newFilter = "QLD";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "QLD" ? "#D54358" : WHITE,
              color: stateFilter === "QLD" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "QLD" ? "#D54358" : UI.outline}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = UI.inputBg;
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            QLD Only
          </button>
          <button
            onClick={() => {
              const newFilter = "All";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "All" ? MONUMENT : WHITE,
              color: stateFilter === "All" ? WHITE : MONUMENT,
              border: `2px solid ${UI.outline}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = UI.inputBg;
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            All Projects
          </button>
          {isAdmin && (
            <button
              onClick={() => setIsNewProjectOpen(true)}
              style={{
                background: "#33cc33",
                color: WHITE,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
            >
              + New Project
            </button>
          )}
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
          {/* Hot List - Light Blue */}
          <div style={{ background: MENU.blue, borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
            <Link
              to="/hotlist"
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
              Hot List
            </Link>
          </div>
          
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
              On Hold
            </Link>
          </div>
          
          {/* Managers and Sales - Light Red */}
          <div style={{ background: MENU.red, borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: `2px solid ${UI.outline}` }}>
            <Link
              to="/managers"
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
              Managers
            </Link>
            <SalesSidebarLink />
            <Link
              to="/time-sheet"
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
              Time Sheet
            </Link>
          </div>

          {/* Email Generator, Maps — Purple (Admin Only) */}
          {isAdmin && (
            <div
              style={{
                background: MENU.purple,
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
              Design Phase {(() => {
                const currentProjects = projects.filter((project) => {
                  if (isHotlistStatus(project.status) || isCancelledStatus(project.status)) return false;
                  return isDesignPhaseStatus(project.status);
                });
                const totalCount = currentProjects.length;
                
                if (selectedField && selectedValue) {
                  return `(${filteredProjects.length} found)`;
                } else if (searchQuery.trim()) {
                  return `(${filteredProjects.length} found)`;
                } else if (stateFilter !== "All") {
                  return `(${filteredProjects.length} total)`;
                }
                return totalCount > 0 ? `(${totalCount} total)` : "";
              })()}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setSortMode("suburb")}
                style={{
                  background: sortMode === "suburb" ? MONUMENT : WHITE,
                  color: sortMode === "suburb" ? WHITE : MONUMENT,
                  border: `2px solid ${UI.outline}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Sort by Suburb
              </button>
              <button
                type="button"
                onClick={() => setSortMode("class")}
                style={{
                  background: sortMode === "class" ? MONUMENT : WHITE,
                  color: sortMode === "class" ? WHITE : MONUMENT,
                  border: `2px solid ${UI.outline}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Sort By Class
              </button>
              <button
                type="button"
                onClick={() => setSortMode("stream")}
                style={{
                  background: sortMode === "stream" ? MONUMENT : WHITE,
                  color: sortMode === "stream" ? WHITE : MONUMENT,
                  border: `2px solid ${UI.outline}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Sort By Stream
              </button>
              <button
                onClick={() => {
                  // Generate email list from filtered projects
                  const projectList = filteredProjects
                    .map((project, index) => {
                      const suburb = project.suburb || "";
                      const street = project.street || "";
                      const projectName =
                        suburb && street
                          ? `${suburb} - ${street}`
                          : suburb || street || project.name || "Unknown Project";
                      return `${index + 1}. ${projectName}`;
                    })
                    .join("\n");

                  const emailBody = `Design Phase Projects List:\n\n${projectList}\n\nTotal: ${filteredProjects.length} projects`;
                  const mailtoLink = `mailto:?subject=Design Phase Projects List&body=${encodeURIComponent(emailBody)}`;
                  window.location.href = mailtoLink;
                }}
                style={{
                  padding: "10px 20px",
                  background: "#4D93D9",
                  color: WHITE,
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#3d7bc9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#4D93D9";
                }}
              >
                Email List
              </button>
            </div>
          </div>
          
          {/* Search Bar and Filter Dropdowns - All on one line */}
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

            {/* Filter by Field */}
            <div style={{ flex: "0 0 auto", marginLeft: "10px" }}>
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
                Filter by Field
              </label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                style={{
                  width: "420px",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `2px solid ${UI.outline}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  outline: "none",
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
            <div style={{ flex: "0 0 auto", marginLeft: "880px", position: "absolute" }}>
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
                Filter by Value
              </label>
              <select
                value={selectedValue}
                onChange={(e) => setSelectedValue(e.target.value)}
                disabled={!selectedField}
                style={{
                  width: "420px",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `2px solid ${UI.outline}`,
                  fontSize: "1rem",
                  color: selectedField ? MONUMENT : "#999",
                  background: selectedField ? WHITE : UI.inputBg,
                  boxSizing: "border-box",
                  cursor: selectedField ? "pointer" : "not-allowed",
                  outline: "none",
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
              <div style={{ flex: "0 0 auto", marginLeft: "1320px", position: "absolute", marginTop: "28px" }}>
                <button
                  onClick={() => {
                    setSelectedField("");
                    setSelectedValue("");
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
      <NewProject
        isOpen={isNewProjectOpen && newProjectStep === 1}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onNext={() => setNewProjectStep(2)}
      />
      <NewProject2
        isOpen={isNewProjectOpen && newProjectStep === 2}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(1)}
        onNext={() => setNewProjectStep(3)}
      />
      <NewProject_3_ProjectCost
        isOpen={isNewProjectOpen && newProjectStep === 3}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => {
          setNewProjectStep(2);
        }}
        onNext={() => {
          // Go to folders option modal (step 4)
          setNewProjectStep(4);
        }}
        onCreate={handleCreateProject}
      />
      <NewProject_4_FoldersOption
        isOpen={isNewProjectOpen && newProjectStep === 4}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => {
          setNewProjectStep(3); // Go back to Project Cost
        }}
        onYes={() => {
          // Yes - set flag and go to proposal upload step (step 5)
          setNewProjectStep(5);
        }}
        onNo={async () => {
          // No - just create project without folders and show email
          setNewProjectStep(0); // Close modal
          await new Promise(resolve => setTimeout(resolve, 50));
          await handleCreateProjectAndEmail();
        }}
      />
      <NewProject_5_PDFUpload
        isOpen={isNewProjectOpen && newProjectStep === 5}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setCreatedProjectForEmail(null);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => {
          // Go back to folders option modal
          setNewProjectStep(4);
        }}
        onNext={async (project) => {
          // Project was already created and PDF uploaded in handleFileUpload
          // Use the project passed as parameter, or fall back to formData
          const projectToUse = project || newProjectFormData.createdProject;
          if (projectToUse) {
            setCreatedProjectForEmail(projectToUse);
            setNewProjectStep(6); // Go to email modal
          } else {
            // Fallback: if project wasn't created yet, create it now
            // This shouldn't happen, but just in case
            await handleCreateProjectAndEmail();
          }
        }}
        onCreate={handleCreateProject}
      />
      <NewProject_6_EmailInternal
        isOpen={isNewProjectOpen && newProjectStep === 6}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setCreatedProjectForEmail(null);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        createdProjectForEmail={createdProjectForEmail}
        onSendSuccess={() => setNewProjectStep(7)}
      />
      <NewProject_7_EmailClient
        isOpen={isNewProjectOpen && newProjectStep === 7}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setCreatedProjectForEmail(null);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        createdProjectForEmail={createdProjectForEmail}
      />
    </div>
  );
  }