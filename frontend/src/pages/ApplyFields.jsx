import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

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
  specs: {
    label: "Specs",
    values: ["Affordable", "Superior"],
    defaultValue: "",
  },
  classification: {
    label: "Classification",
    values: ["Small Second Dwelling", "Dependant Persons Unit", "Detached Extension", "Dwelling", "Home Office / Studio"],
    defaultValue: "",
  },
};

export default function ApplyFields() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedField, setSelectedField] = useState("");
  const [selectedValue, setSelectedValue] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set());

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    // Reset value dropdowns when field changes
    setSelectedValue("");
    setNewValue("");
    // Clear selection when field changes
    setSelectedProjectIds(new Set());
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
      setProjects(data);
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
      const effectiveValue = getEffectiveValue(project, selectedField);
      if (effectiveValue) {
        projectValues.add(effectiveValue);
      }
    });

    // Combine predefined values with actual project values
    const allValues = new Set([...fieldDef.values, ...Array.from(projectValues)]);
    return Array.from(allValues).sort();
  }

  // Filter projects based on selected field, value, and search query
  function getFilteredProjects() {
    let filtered = projects;

    // First filter by field/value if specified
    if (selectedField && selectedValue) {
      filtered = filtered.filter(project => {
        const effectiveValue = getEffectiveValue(project, selectedField);
        return effectiveValue === selectedValue;
      });
    }

    // Then filter by search query if specified
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(project => {
        const suburb = (project.suburb || "").toLowerCase();
        const street = (project.street || "").toLowerCase();
        const name = (project.name || "").toLowerCase();
        return suburb.includes(query) || street.includes(query) || name.includes(query);
      });
    }

    return filtered;
  }

  function handleToggleProject(projectId) {
    setSelectedProjectIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  }

  function handleSelectAll() {
    const filtered = getFilteredProjects();
    setSelectedProjectIds(new Set(filtered.map(p => p.id)));
  }

  function handleClearSelection() {
    setSelectedProjectIds(new Set());
  }

  async function handleApply() {
    if (!selectedField || !newValue) {
      alert("Please select a field and new value");
      return;
    }

    // Only update selected projects
    const projectsToUpdate = getFilteredProjects().filter(p => selectedProjectIds.has(p.id));

    if (projectsToUpdate.length === 0) {
      alert("Please select at least one project to update");
      return;
    }

    const filterText = selectedValue ? ` (filtered from "${selectedValue}")` : "";
    if (!confirm(`Update ${projectsToUpdate.length} selected project(s)${filterText} to "${newValue}"?`)) {
      return;
    }

    setIsApplying(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Update each project
      await Promise.all(
        projectsToUpdate.map(async (project) => {
          try {
            const projectName = project?.street && project?.suburb 
              ? `${project.street}, ${project.suburb}`.trim() 
              : project?.name || "";

            // Build update data - include all existing fields and update the selected field
            const updateData = {
              name: projectName,
              status: project?.status || null,
              stream: project?.stream || null,
              suburb: project?.suburb || null,
              street: project?.street || null,
              state: project?.state || null,
              deposit: project?.deposit || null,
              project_cost: project?.project_cost || null,
              client_name: project?.client_name || null,
              email: project?.email || null,
              phone: project?.phone || null,
              client1_name: project?.client1_name || null,
              client1_email: project?.client1_email || null,
              client1_phone: project?.client1_phone || null,
              client1_active: project?.client1_active || null,
              client2_name: project?.client2_name || null,
              client2_email: project?.client2_email || null,
              client2_phone: project?.client2_phone || null,
              client2_active: project?.client2_active || null,
              client3_name: project?.client3_name || null,
              client3_email: project?.client3_email || null,
              client3_phone: project?.client3_phone || null,
              client3_active: project?.client3_active || null,
              site_visit_status: project?.site_visit_status || null,
              site_visit_date: project?.site_visit_date || null,
              site_visit_time: project?.site_visit_time || null,
              contract_status: project?.contract_status || null,
              contract_sent_date: project?.contract_sent_date || null,
              contract_complete_date: project?.contract_complete_date || null,
              supporting_documents_status: project?.supporting_documents_status || null,
              supporting_documents_sent_date: project?.supporting_documents_sent_date || null,
              supporting_documents_complete_date: project?.supporting_documents_complete_date || null,
              water_declaration_status: project?.water_declaration_status || null,
              water_declaration_sent_date: project?.water_declaration_sent_date || null,
              water_declaration_complete_date: project?.water_declaration_complete_date || null,
              notes: project?.notes || null,
              window_status: project?.window_status || null,
              window_colour: project?.window_colour || null,
              window_reveal: project?.window_reveal || null,
              window_reveal_other: project?.window_reveal_other || null,
              window_glazing: project?.window_glazing || null,
              window_bal_rating: project?.window_bal_rating || null,
              window_date_required: project?.window_date_required || null,
              window_ordered_date: project?.window_ordered_date || null,
              window_order_pdf_location: project?.window_order_pdf_location || null,
              window_order_number: project?.window_order_number || null,
              drawings_status: project?.drawings_status || null,
              drawings_pdf_location: project?.drawings_pdf_location || null,
              drawings_history: project?.drawings_history || null,
              colours_status: project?.colours_status || null,
              planning_status: project?.planning_status || null,
              energy_report_status: project?.energy_report_status || null,
              footing_certification_status: project?.footing_certification_status || null,
              building_permit_status: project?.building_permit_status || null,
              specs: project?.specs || null,
              classification: project?.classification || null,
              // Update the selected field with the new value
              [selectedField]: newValue === "" ? null : newValue,
            };

            const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateData),
            });

            if (!response.ok) {
              throw new Error(`Failed to update project ${project.id}`);
            }

            successCount++;
          } catch (err) {
            console.error(`Error updating project ${project.id}:`, err);
            errorCount++;
          }
        })
      );

      // Refresh projects list
      await fetchProjects();

      // Show result
      if (errorCount === 0) {
        alert(`Successfully updated ${successCount} project(s)`);
        // Clear selection after successful update
        setSelectedProjectIds(new Set());
      } else {
        alert(`Updated ${successCount} project(s), ${errorCount} error(s)`);
      }
    } catch (err) {
      console.error("Error applying updates:", err);
      alert(`Error: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  }

  const filteredProjects = getFilteredProjects();
  const availableValues = getAvailableValues();

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
          Apply Fields
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
          {/* Back to Main */}
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
            ← Main
          </Link>
        </div>

        {/* Section 3: Main Content */}
        <div
          className="main-content"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            flex: 1,
            minHeight: "700px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "24px 32px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            color: MONUMENT,
          }}
        >
          {/* Filter Dropdowns */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: "200px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Field
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
                <option value="">Select field...</option>
                {Object.entries(FIELD_DEFINITIONS).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: "1 1 200px", minWidth: "200px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Filter Value
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
                <option value="">All projects</option>
                {selectedField && availableValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: "1 1 200px", minWidth: "200px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                New Value
              </label>
              <select
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
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
                <option value="">Select new value...</option>
                {selectedField && availableValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {selectedField && newValue && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: WHITE,
                    background: isApplying ? "#999" : MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor: isApplying ? "not-allowed" : "pointer",
                    height: "42px",
                  }}
                >
                  {isApplying ? "Applying..." : "Apply"}
                </button>
                <button
                  onClick={() => {
                    setSelectedField("");
                    setSelectedValue("");
                    setNewValue("");
                    setSelectedProjectIds(new Set());
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
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Projects List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Search Bar */}
            <div style={{ marginBottom: "16px" }}>
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: "400px",
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

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT }}>
                Projects {(() => {
                  const filtered = getFilteredProjects();
                  if (selectedField && selectedValue) {
                    return `(${filtered.length} found)`;
                  } else if (searchQuery.trim()) {
                    return `(${filtered.length} found)`;
                  }
                  return `(${projects.length} total)`;
                })()}
                {selectedProjectIds.size > 0 && ` - ${selectedProjectIds.size} selected`}
              </h2>
              {filteredProjects.length > 0 && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleSelectAll}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      background: WHITE,
                      border: `1px solid ${MONUMENT}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleClearSelection}
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      color: MONUMENT,
                      background: WHITE,
                      border: `1px solid ${MONUMENT}`,
                      borderRadius: "6px",
                      cursor: "pointer",
                    }}
                  >
                    Clear Selection
                  </button>
                </div>
              )}
            </div>
            {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
            {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}
            {!loading && !error && filteredProjects.length === 0 && (
              <p style={{ color: "#32323399" }}>
                {selectedField && selectedValue
                  ? "No projects match the selected filter."
                  : searchQuery.trim()
                  ? "No projects match your search."
                  : "No projects found."}
              </p>
            )}
            {!loading && !error && filteredProjects.length > 0 && (
              <div
                className="projects-grid"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "20px",
                  alignItems: "flex-start",
                }}
              >
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    style={{
                      position: "relative",
                      width: "200px",
                      height: "100px",
                    }}
                  >
                    <Link
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
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                      >
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
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                            {project.suburb || "Unknown Suburb"}
                          </div>
                          <div style={{ fontSize: "0.95rem", color: "#a1a1a3", fontWeight: 400 }}>
                            {project.street || "No address"}
                          </div>
                        </div>
                      </div>
                    </Link>
                    {/* Checkbox in top right */}
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.has(project.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleProject(project.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        width: "20px",
                        height: "20px",
                        cursor: "pointer",
                        zIndex: 10,
                        accentColor: MONUMENT,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
