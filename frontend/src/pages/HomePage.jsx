import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import NewProject from "./NewProject";
import NewProject2 from "./NewProject2";
import NewProject3 from "./NewProject3";
import NewProject4 from "./NewProject4";
import { isUserAdmin } from "../utils/auth";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
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
    values: ["Design Phase", "On Hold", "Construction Phase", "Complete"],
    defaultValue: "Design Phase",
  },
  year: {
    label: "Year",
    values: ["2023", "2024", "2025", "2026"],
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
    clientName: "",
    email: "",
    phone: "",
   });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchProjects();
    checkAdminStatus();
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
        status: "New",
        suburb: formData.suburb || null,
        street: formData.street || null,
        state: formData.state || null,
        stream: formData.stream || null,
        deposit: formData.deposit || null, // Deposit amount (formatted with commas)
        project_cost: formData.projectCost || null, // Project cost (formatted with commas)
        salesperson: formData.salesperson || null,
        client_name: formData.clientName || null,
        email: formData.email || null,
        phone: formData.phone || null,
        // Also populate Contact 1 with the same values
        client1_name: formData.clientName || null,
        client1_email: formData.email || null,
        client1_phone: formData.phone || null,
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
    
    const value = project[fieldName];
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
      // Only include current projects (not Complete)
      if (project.status !== "Complete") {
        const effectiveValue = getEffectiveValue(project, selectedField);
        if (effectiveValue) {
          projectValues.add(effectiveValue);
        }
      }
    });

    // Combine predefined values with actual project values
    const allValues = new Set([...fieldDef.values, ...Array.from(projectValues)]);
    return Array.from(allValues).sort();
  }

  // Filter projects based on status, field/value, and search query
  function getFilteredProjects() {
    // First filter out "Complete" status projects
    let filtered = projects.filter((project) => project.status !== "Complete");

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
        background: MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      {/* Section 1: Heading */}
      <div
        style={{
          background: SECTION_GREY,
          borderRadius: "18px",
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          height: "100px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            textAlign: "center",
            width: "100%",
            color: MONUMENT,
            letterSpacing: "1px",
          }}
        >
          SGF Central
        </h1>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto",
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
            height: "700px",
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
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "2px",
              outline: `2px solid ${MONUMENT}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            Current Projects
          </Link>
          <button
            onClick={() => setIsNewProjectOpen(true)}
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.17s",
              display: "block",
              width: "100%",
            }}
          >
            + New Project
          </button>
          <Link
            to="/finished-projects"
            style={{
              background: "transparent",
              color: "#404049",
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "2px",
              display: "block",
            }}
          >
            Finished Projects
          </Link>
          <Link
            to="/site-visit-manager"
            style={{
              background: "transparent",
              color: "#404049",
              border: "none",
              borderRadius: "10px",
              padding: "12px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.18s, color 0.15s",
              marginBottom: "2px",
              display: "block",
            }}
          >
            Site Visit Manager
          </Link>
          {isAdmin && (
            <Link
              to="/settings"
              style={{
                background: "transparent",
                color: "#404049",
                border: "none",
                borderRadius: "10px",
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "2px",
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
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "2px",
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
            minHeight: "700px",
            height: "700px",
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
            Current Projects {(() => {
              const currentProjects = projects.filter((project) => project.status !== "Complete");
              if (selectedField && selectedValue) {
                return `(${filteredProjects.length} found)`;
              } else if (searchQuery.trim()) {
                return `(${filteredProjects.length} found)`;
              }
              return currentProjects.length > 0 ? `(${currentProjects.length} total)` : "";
            })()}
          </h2>
          
          {/* Search Bar and Filter Dropdowns - All on one line */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "nowrap", alignItems: "flex-end" }}>
            {/* Search Bar */}
            <div style={{ flex: "1 1 300px", minWidth: "200px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
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
                  width: "100%",
                  padding: "10px 12px",
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
            <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Filter by Field
              </label>
              <select
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
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
            <div style={{ flex: "1 1 200px", minWidth: "150px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
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
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: selectedField ? MONUMENT : "#999",
                  background: selectedField ? WHITE : "#f5f5f5",
                  boxSizing: "border-box",
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
              <div style={{ display: "flex", alignItems: "flex-end" }}>
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
                    border: `1px solid ${MONUMENT}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                    height: "42px",
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
                  };
                  const classificationInfo = project.classification ? classificationMap[project.classification] : null;

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
                        {/* Classification Acronym */}
                        {classificationInfo && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              right: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              color: classificationInfo.color,
                              zIndex: project.status === "On Hold" ? 11 : 5,
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
                          <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                            {project.suburb || "Unknown Suburb"}
                          </div>
                          <div style={{ fontSize: "0.95rem", color: "#a1a1a3", fontWeight: 400 }}>
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