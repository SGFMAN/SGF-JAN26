import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const PLANNING_STATUS_OPTIONS = ["Not Selected", "No Planning Required", "Planning Required", "Planning Permit Issued"];
const STATUS_OPTIONS = ["Not Submitted", "Sent", "Complete"];

export default function Planning({ project, onUpdate }) {
  const [planningStatus, setPlanningStatus] = useState(project?.planning_status || "Not Selected");
  const [energyReportStatus, setEnergyReportStatus] = useState(project?.energy_report_status || "Not Submitted");
  const [footingCertificationStatus, setFootingCertificationStatus] = useState(project?.footing_certification_status || "Not Submitted");
  const [buildingPermitStatus, setBuildingPermitStatus] = useState(project?.building_permit_status || "Not Submitted");
  
  const valuesRef = useRef({ planningStatus, energyReportStatus, footingCertificationStatus, buildingPermitStatus });
  
  useEffect(() => {
    valuesRef.current = { planningStatus, energyReportStatus, footingCertificationStatus, buildingPermitStatus };
  }, [planningStatus, energyReportStatus, footingCertificationStatus, buildingPermitStatus]);

  useEffect(() => {
    if (project) {
      setPlanningStatus(project.planning_status || "Not Selected");
      setEnergyReportStatus(project.energy_report_status || "Not Submitted");
      setFootingCertificationStatus(project.footing_certification_status || "Not Submitted");
      setBuildingPermitStatus(project.building_permit_status || "Not Submitted");
    }
  }, [project]);

  async function saveField(fieldName, value) {
    if (!project?.id) return;
    const currentValues = valuesRef.current;
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";
    try {
      // Build update data with the current values, but use the new value for the field being changed
      const updateData = {
        name: projectName,
        status: project?.status || null,
        stream: project?.stream || null,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: project?.deposit || null,
        project_cost: project?.project_cost || null,
        planning_status: fieldName === "planning_status" ? (value === "" ? null : value) : currentValues.planningStatus,
        energy_report_status: fieldName === "energy_report_status" ? (value === "" ? null : value) : currentValues.energyReportStatus,
        footing_certification_status: fieldName === "footing_certification_status" ? (value === "" ? null : value) : currentValues.footingCertificationStatus,
        building_permit_status: fieldName === "building_permit_status" ? (value === "" ? null : value) : currentValues.buildingPermitStatus,
      };

      // Add all other fields to maintain them
      const otherFields = [
        'client_name', 'email', 'phone', 'salesperson', 'proposal_pdf_location',
        'client1_name', 'client1_email', 'client1_phone', 'client1_active',
        'client2_name', 'client2_email', 'client2_phone', 'client2_active',
        'client3_name', 'client3_email', 'client3_phone', 'client3_active',
        'site_visit_status', 'site_visit_date', 'site_visit_time',
        'contract_status', 'contract_sent_date', 'contract_complete_date',
        'supporting_documents_status', 'supporting_documents_sent_date', 'supporting_documents_complete_date',
        'water_declaration_status', 'water_declaration_sent_date', 'water_declaration_complete_date',
        'notes',
        'window_status', 'window_colour', 'window_reveal', 'window_reveal_other', 
        'window_glazing', 'window_bal_rating', 'window_date_required', 'window_ordered_date', 
        'window_order_pdf_location', 'window_order_number',
        'drawings_status', 'colours_status'
      ];

      for (const field of otherFields) {
        updateData[field] = project?.[field] || null;
      }

      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error(`Error saving ${fieldName}:`, error);
      alert(`Error saving ${fieldName}: ${error.message}`);
    }
  }

  function handlePlanningStatusChange(e) {
    const newValue = e.target.value;
    setPlanningStatus(newValue);
    saveField("planning_status", newValue);
  }

  function handleEnergyReportStatusChange(e) {
    const newValue = e.target.value;
    setEnergyReportStatus(newValue);
    saveField("energy_report_status", newValue);
  }

  function handleFootingCertificationStatusChange(e) {
    const newValue = e.target.value;
    setFootingCertificationStatus(newValue);
    saveField("footing_certification_status", newValue);
  }

  function handleBuildingPermitStatusChange(e) {
    const newValue = e.target.value;
    setBuildingPermitStatus(newValue);
    saveField("building_permit_status", newValue);
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Planning
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "16px", flexWrap: "nowrap" }}>
          {/* Column 1 - Planning Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Planning Status
              </label>
              <select
                value={planningStatus}
                onChange={handlePlanningStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {PLANNING_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 2 - Energy Report */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Energy Report
              </label>
              <select
                value={energyReportStatus}
                onChange={handleEnergyReportStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 3 - Footing Certification */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Footing Certification
              </label>
              <select
                value={footingCertificationStatus}
                onChange={handleFootingCertificationStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 4 - Building Permit */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Building Permit
              </label>
              <select
                value={buildingPermitStatus}
                onChange={handleBuildingPermitStatusChange}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 5 - Empty */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
          </div>

          {/* Column 6 - Empty */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
          </div>
        </div>
      )}
    </div>
  );
}
