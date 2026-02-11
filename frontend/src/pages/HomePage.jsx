import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import NewProject from "./NewProject";
import NewProject2 from "./NewProject2";
import NewProject3 from "./NewProject3";
import NewProject4 from "./NewProject4";
import { isUserAdmin } from "../utils/auth";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";

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
    values: ["In Progress", "Concept Approved", "Working Drawings Approved"],
    defaultValue: "In Progress",
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
    values: ["Design Phase", "Construction Phase", "On Hold", "Cancelled", "Complete"],
    defaultValue: "Design Phase",
  },
  year: {
    label: "Year",
    values: [], // Will be populated dynamically from projects
    defaultValue: new Date().getFullYear().toString(),
  },
};

export default function HomePage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedField, setSelectedField] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectStep, setNewProjectStep] = useState(1);
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
   });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check admin status first so buttons show up quickly
    checkAdminStatus();
    fetchProjects();
  }, []);

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
      console.log("Fetching projects from:", url);
      const response = await fetch(url);
      console.log("Projects response status:", response.status, response.statusText);
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Projects API error:", errorText);
        throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Projects from API:", data);
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
    // Reset form and close modal
    setNewProjectStep(1);
    setIsNewProjectOpen(false);
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
      
      // Check if deposit equals full deposit amount
      if (depositNumeric === fullDepositAmount && fullDepositAmount > 0) {
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

    // Get unique values from projects (using effective values)
    const projectValues = new Set();
    projects.forEach(project => {
      // Only include design phase projects (not Complete, Cancelled, Construction Phase, or Hotlist)
      if (project.status !== "Complete" && project.status !== "Cancelled" && project.status !== "Construction Phase" && project.status !== "Hotlist") {
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
    // First filter out "Complete", "Cancelled", "Construction Phase", and "Hotlist" status projects
    let filtered = projects.filter((project) => project.status !== "Complete" && project.status !== "Cancelled" && project.status !== "Construction Phase" && project.status !== "Hotlist");

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

  const availableValues = getAvailableValues();
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
        <img
          src={logo}
          alt="SGF Logo"
          style={{
            width: "120px",
            height: "auto",
            position: "absolute",
            left: "40px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            In Design
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
          {/* State Filter Buttons */}
          <button
            onClick={() => setStateFilter("VIC")}
            style={{
              background: stateFilter === "VIC" ? "#4D93D9" : WHITE,
              color: stateFilter === "VIC" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "VIC" ? "#4D93D9" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = "#f0f0f0";
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
            onClick={() => setStateFilter("QLD")}
            style={{
              background: stateFilter === "QLD" ? "#D54358" : WHITE,
              color: stateFilter === "QLD" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "QLD" ? "#D54358" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = "#f0f0f0";
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
            onClick={() => setStateFilter("All")}
            style={{
              background: stateFilter === "All" ? MONUMENT : WHITE,
              color: stateFilter === "All" ? WHITE : MONUMENT,
              border: `2px solid ${MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = "#f0f0f0";
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
          <Link
            to="/hotlist"
            style={{
              background: "transparent",
              color: "#404049",
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
          <Link
            to="/projects"
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
              outline: `2px solid ${MONUMENT}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            In Design
          </Link>
          <Link
            to="/in-construction"
            style={{
              background: "transparent",
              color: "#404049",
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
            In Construction
          </Link>
          <Link
            to="/finished-projects"
            style={{
              background: "transparent",
              color: "#404049",
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
            to="/managers"
            style={{
              background: "transparent",
              color: "#404049",
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
          <Link
            to="/sales"
            style={{
              background: "transparent",
              color: "#404049",
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
            Sales
          </Link>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Link
              to="/settings"
              style={{
                background: "transparent",
                color: "#404049",
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
                color: "#404049",
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
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "16px" }}>
            In Design {(() => {
              const currentProjects = projects.filter((project) => project.status !== "Complete" && project.status !== "Cancelled" && project.status !== "Construction Phase" && project.status !== "Hotlist");
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
          
          {/* Search Bar and Filter Dropdowns - All on one line */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "nowrap", alignItems: "flex-start", marginTop: 0, position: "relative" }}>
            {/* Search Bar */}
            <div style={{ flex: "0 0 auto" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
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
                  border: `2px solid ${MONUMENT}`,
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
                  color: "#32323399",
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
                  border: `2px solid ${MONUMENT}`,
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
                  color: "#32323399",
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
                  border: `2px solid ${MONUMENT}`,
                  fontSize: "1rem",
                  color: selectedField ? MONUMENT : "#999",
                  background: selectedField ? WHITE : "#f5f5f5",
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
                    border: `2px solid ${MONUMENT}`,
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

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && filteredProjects.length === 0 && (
            <p style={{ color: "#32323399" }}>
              {selectedField && selectedValue
                ? "No projects match the selected filter."
                : searchQuery.trim()
                ? "No projects match your search."
                : "No current projects found."}
            </p>
          )}
          {!loading && !error && filteredProjects.length > 0 && (() => {

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
                {filteredProjects.map((project) => {
                  // Classification mapping - all grey
                  const classificationMap = {
                    "Small Second Dwelling": { acronym: "SSD", color: "#a1a1a3" }, // Grey
                    "Dependant Persons Unit": { acronym: "DPU", color: "#a1a1a3" }, // Grey
                    "Detached Extension": { acronym: "DEX", color: "#a1a1a3" }, // Grey
                    "Dwelling": { acronym: "DWE", color: "#a1a1a3" }, // Grey
                    "Home Office / Studio": { acronym: "STU", color: "#a1a1a3" }, // Grey
                    "Dwelling & DPU": { acronym: "D&DPU", color: "#a1a1a3" }, // Grey
                    "Dwelling & SSD": { acronym: "D&SSD", color: "#a1a1a3" }, // Grey
                    "SSD & DPU": { acronym: "SSD&DPU", color: "#a1a1a3" }, // Grey
                    "Dual Occ": { acronym: "DOC", color: "#a1a1a3" }, // Grey
                  };
                  const classificationInfo = project.classification ? classificationMap[project.classification] : null;

                  // Stream mapping - colored by stream type
                  const streamMap = {
                    "SGF - VIC": { acronym: "VIC", color: "#4D93D9" }, // Blue
                    "SGF - QLD": { acronym: "QLD", color: "#D54358" }, // Red
                    "Dual Dwelling": { acronym: "DD", color: "#92D050" }, // Green
                    "ATA": { acronym: "ATA", color: "#92D050" }, // Green
                    "Pumped on Property": { acronym: "POP", color: "#92D050" }, // Green
                    "Pumped On Property": { acronym: "POP", color: "#92D050" }, // Green (handle both variations)
                    "Henderson": { acronym: "HEN", color: "#92D050" }, // Green
                    "Creat Cash Flow": { acronym: "CCF", color: "#92D050" }, // Green
                    "Create Cash Flow": { acronym: "CCF", color: "#92D050" }, // Green (handle both variations)
                    "Maple Group": { acronym: "MAP", color: "#92D050" }, // Green
                  };
                  const streamInfo = project.stream ? streamMap[project.stream] : null;

                  return (
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
                          position: "relative",
                          overflow: "hidden",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        {/* On Hold Diagonal Band */}
                        {project.status === "On Hold" && (
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%) rotate(-45deg)",
                              width: "280px",
                              height: "40px",
                              background: "#0066cc",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 10,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            }}
                          >
                            <span
                              style={{
                                color: WHITE,
                                fontWeight: 700,
                                fontSize: "1.1rem",
                                letterSpacing: "2px",
                                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                              }}
                            >
                              ON HOLD
                            </span>
                          </div>
                        )}
                        {/* Cancelled Diagonal Band */}
                        {project.status === "Cancelled" && (
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%) rotate(-45deg)",
                              width: "280px",
                              height: "40px",
                              background: "#cc0000",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 10,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            }}
                          >
                            <span
                              style={{
                                color: WHITE,
                                fontWeight: 700,
                                fontSize: "1.1rem",
                                letterSpacing: "2px",
                                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                              }}
                            >
                              CANCELLED
                            </span>
                          </div>
                        )}
                        {/* Stream Acronym - Left Bottom */}
                        {streamInfo && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              left: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              color: streamInfo.color,
                              zIndex: (project.status === "On Hold" || project.status === "Cancelled") ? 11 : 5,
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            {streamInfo.acronym}
                          </div>
                        )}
                        {/* Classification Acronym - Right Bottom */}
                        {classificationInfo && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              right: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              color: classificationInfo.color,
                              zIndex: (project.status === "On Hold" || project.status === "Cancelled") ? 11 : 5,
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            {classificationInfo.acronym}
                          </div>
                        )}
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
                            position: "relative",
                            zIndex: project.status === "On Hold" ? 1 : "auto",
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: WHITE }}>
                            {(project.suburb || "Unknown Suburb").toUpperCase()}
                          </div>
                          <div style={{ fontSize: "0.95rem", color: WHITE, fontWeight: 400 }}>
                            {project.street || "No address"}
                          </div>
                        </div>
                        <div 
                          style={{ 
                            fontSize: "0.9rem", 
                            color: "#323233cc", 
                            textAlign: "center",
                            position: "relative",
                            zIndex: project.status === "On Hold" ? 1 : "auto",
                          }}
                        >
                          Status: {project.status}
                        </div>
                      </div>
                    </Link>
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
        onNext={async () => {
          // Check settings to determine if we should skip the proposal upload step
          try {
            const settingsResponse = await fetch(`${API_URL}/api/settings`);
            if (settingsResponse.ok) {
              const settings = await settingsResponse.json();
              const state = (newProjectFormData.state || "").toUpperCase();
              
              // Check if "Create folders" is enabled for the selected state
              let createFolders = false;
              if (state === "VIC") {
                createFolders = settings.create_folders === 'true' || settings.create_folders === true;
              } else if (state === "QLD") {
                createFolders = settings.create_folders_qld === 'true' || settings.create_folders_qld === true;
              }
              
              // If createFolders is false, skip step 3 (proposal upload) and go directly to step 4
              if (!createFolders) {
                setNewProjectStep(4);
              } else {
                setNewProjectStep(3);
              }
            } else {
              // If settings fetch fails, default to showing step 3
              setNewProjectStep(3);
            }
          } catch (error) {
            console.error("Error checking settings:", error);
            // If error, default to showing step 3
            setNewProjectStep(3);
          }
        }}
      />
      <NewProject3
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
        onBack={() => setNewProjectStep(2)}
        onNext={() => setNewProjectStep(4)}
      />
      <NewProject4
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
        onBack={async () => {
          // Check settings to determine which step to go back to
          try {
            const settingsResponse = await fetch(`${API_URL}/api/settings`);
            if (settingsResponse.ok) {
              const settings = await settingsResponse.json();
              const state = (newProjectFormData.state || "").toUpperCase();
              
              // Check if "Create folders" is enabled for the selected state
              let createFolders = false;
              if (state === "VIC") {
                createFolders = settings.create_folders === 'true' || settings.create_folders === true;
              } else if (state === "QLD") {
                createFolders = settings.create_folders_qld === 'true' || settings.create_folders_qld === true;
              }
              
              // If createFolders is false, we skipped step 3, so go back to step 2
              if (!createFolders) {
                setNewProjectStep(2);
              } else {
                setNewProjectStep(3);
              }
            } else {
              // If settings fetch fails, default to step 3
              setNewProjectStep(3);
            }
          } catch (error) {
            console.error("Error checking settings:", error);
            // If error, default to step 3
            setNewProjectStep(3);
          }
        }}
        onCreate={handleCreateProject}
      />
    </div>
  );
  }