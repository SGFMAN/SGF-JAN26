import React, { useState, useEffect, useRef } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const SURVEY_STATUS_OPTIONS = ["Not Booked", "Booked", "Complete"];
const SOIL_STATUS_OPTIONS = ["Not Booked", "Booked", "Complete"];

export default function SurveySoil({ project, onUpdate }) {
  const [surveyStatus, setSurveyStatus] = useState(project?.survey_status || "Not Booked");
  const [soilStatus, setSoilStatus] = useState(project?.soil_status || "Not Booked");
  
  const valuesRef = useRef({ surveyStatus, soilStatus });
  
  useEffect(() => {
    valuesRef.current = { surveyStatus, soilStatus };
  }, [surveyStatus, soilStatus]);

  useEffect(() => {
    if (project) {
      setSurveyStatus(project.survey_status || "Not Booked");
      setSoilStatus(project.soil_status || "Not Booked");
    }
  }, [project]);

  async function saveField(fieldName, value) {
    if (!project?.id) {
      console.error("Cannot save: no project ID");
      return;
    }
    const currentValues = valuesRef.current;
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";
    try {
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
        supporting_documents_status: project?.supporting_documents_status || null,
        water_declaration_status: project?.water_declaration_status || null,
        notes: project?.notes || null,
        window_status: project?.window_status || null,
        drawings_status: project?.drawings_status || null,
        colours_status: project?.colours_status || null,
        planning_status: project?.planning_status || null,
        energy_report_status: project?.energy_report_status || null,
        footing_certification_status: project?.footing_certification_status || null,
        building_permit_status: project?.building_permit_status || null,
        survey_status: fieldName === "survey_status" ? (value === "" ? null : value) : currentValues.surveyStatus,
        soil_status: fieldName === "soil_status" ? (value === "" ? null : value) : currentValues.soilStatus,
      };
      
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved:", savedData);
        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  async function handleSurveyStatusChange(e) {
    const newStatus = e.target.value;
    setSurveyStatus(newStatus);
    valuesRef.current.surveyStatus = newStatus;
    await saveField("survey_status", newStatus);
  }

  async function handleSoilStatusChange(e) {
    const newStatus = e.target.value;
    setSoilStatus(newStatus);
    valuesRef.current.soilStatus = newStatus;
    await saveField("soil_status", newStatus);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 4 Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "24px", flex: 1 }}>
        {/* Column 1: Site Feature Survey */}
        <div>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 600,
              color: MONUMENT,
              marginTop: 0,
              marginBottom: "20px",
            }}
          >
            Site Feature Survey
          </h3>
          <select
            value={surveyStatus}
            onChange={handleSurveyStatusChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${SECTION_GREY}`,
              fontSize: "1rem",
              fontFamily: "inherit",
              color: MONUMENT,
              background: WHITE,
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {SURVEY_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Column 2: Empty */}
        <div></div>

        {/* Column 3: Soil Test */}
        <div>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 600,
              color: MONUMENT,
              marginTop: 0,
              marginBottom: "20px",
            }}
          >
            Soil Test
          </h3>
          <select
            value={soilStatus}
            onChange={handleSoilStatusChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${SECTION_GREY}`,
              fontSize: "1rem",
              fontFamily: "inherit",
              color: MONUMENT,
              background: WHITE,
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {SOIL_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Column 4: Empty */}
        <div></div>
      </div>
    </div>
  );
}
