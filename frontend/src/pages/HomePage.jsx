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

  // Filter projects based on status, field/value, and search query
  function getFilteredProjects() {
    // First filter out "Complete", "Cancelled", "Construction Phase", and "Hotlist" status projects
    let filtered = projects.filter((project) => project.status !== "Complete" && project.status !== "Cancelled" && project.status !== "Construction Phase" && project.status !== "Hotlist");

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
        {isAdmin && (
          <button
            onClick={() => setIsNewProjectOpen(true)}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
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
              const currentProjects = projects.filter((project) => project.status !== "Complete" && project.status !== "Cancelled" && project.status !== "Construction Phase");
              if (selectedField && selectedValue) {
                return `(${filteredProjects.length} found)`;
              } else if (searchQuery.trim()) {
                return `(${filteredProjects.length} found)`;
              }
              return currentProjects.length > 0 ? `(${currentProjects.length} total)` : "";
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
                  // Classification mapping
                  const classificationMap = {
                    "Small Second Dwelling": { acronym: "SSD", color: "#0066cc" }, // Blue
                    "Dependant Persons Unit": { acronym: "DPU", color: "#33cc33" }, // Green
                    "Detached Extension": { acronym: "DEX", color: "#ff9900" }, // Orange
                    "Dwelling": { acronym: "DWE", color: "#9966cc" }, // Purple
                    "Home Office / Studio": { acronym: "STU", color: "#ffcc00" }, // Yellow
                    "Dwelling & DPU": { acronym: "D&DPU", color: "#6699cc" }, // Blue-Purple mix
                    "Dwelling & SSD": { acronym: "D&SSD", color: "#8066cc" }, // Purple-Blue mix
                    "SSD & DPU": { acronym: "SSD&DPU", color: "#0099cc" }, // Blue-Green mix
                    "Dual Occ": { acronym: "DOC", color: "#cc6600" }, // Brown-Orange
                  };
                  const classificationInfo = project.classification ? classificationMap[project.classification] : null;

                  // Stream mapping
                  const streamMap = {
                    "SGF - VIC": { acronym: "VIC SALE", color: SECTION_GREY }, // Grey
                    "SGF - QLD": { acronym: "QLD SALE", color: SECTION_GREY }, // Grey
                    "Dual Dwelling": { acronym: "DDI SALE", color: SECTION_GREY }, // Grey
                    "ATA": { acronym: "ATA SALE", color: SECTION_GREY }, // Grey
                    "Pumped on Property": { acronym: "POP SALE", color: SECTION_GREY }, // Grey
                    "Pumped On Property": { acronym: "POP SALE", color: SECTION_GREY }, // Grey (handle both variations)
                    "Henderson": { acronym: "HEN SALE", color: SECTION_GREY }, // Grey
                    "Creat Cash Flow": { acronym: "CCF SALE", color: SECTION_GREY }, // Grey
                    "Create Cash Flow": { acronym: "CCF SALE", color: SECTION_GREY }, // Grey (handle both variations)
                    "Maple Group": { acronym: "MAP SALE", color: SECTION_GREY }, // Grey
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
        onNext={() => setNewProjectStep(3)}
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
        onBack={() => setNewProjectStep(3)}
        onCreate={handleCreateProject}
      />
    </div>
  );
  }