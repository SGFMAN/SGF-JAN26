import React, { useEffect, useState } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import {
  PLANNING_REQUIREMENT_SELECT_OPTIONS,
  MANDATORY_PLANNING_SELECT_OPTIONS,
  normalizePlanningStatus,
  normalizeMandatoryPlanningStatus,
} from "../constants/planningStatusFields.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const FIELD_OUTLINE = `1px solid ${UI.outline || "#000"}`;
const API_URL = "";

/** Fit width from longest label (ch) + padding for select chevron. */
function fitWidthCh(labels, extraCh = 3.5) {
  const maxLen = Math.max(1, ...labels.map((s) => String(s).length));
  return `calc(${maxLen}ch + ${extraCh}ch)`;
}

const SHARED_SELECT_WIDTH = fitWidthCh(
  [...PLANNING_REQUIREMENT_SELECT_OPTIONS, ...MANDATORY_PLANNING_SELECT_OPTIONS],
  3.75
);

const labelStyle = {
  display: "block",
  fontSize: "0.9rem",
  color: UI.textMuted,
  marginBottom: "6px",
  fontWeight: 500,
};

const selectStyle = {
  width: SHARED_SELECT_WIDTH,
  maxWidth: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

const panelStyle = {
  minWidth: 0,
  minHeight: 0,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  background: WHITE,
  border: FIELD_OUTLINE,
  borderRadius: "8px",
  padding: "16px",
  boxSizing: "border-box",
  overflow: "auto",
};

const stackColumnStyle = {
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
};

/**
 * Temporary Planning page — 4 columns × 2 panels.
 */
export default function PlanningMain({ project, onUpdate }) {
  const [isSaving, setIsSaving] = useState(false);
  const [townPlanningStatus, setTownPlanningStatus] = useState(
    normalizePlanningStatus(project?.planning_town_planning)
  );
  const [balStatus, setBalStatus] = useState(normalizePlanningStatus(project?.planning_bal));
  const [sewerConnection, setSewerConnection] = useState(
    normalizePlanningStatus(project?.planning_sewer_connection)
  );
  const [energyStatus, setEnergyStatus] = useState(
    normalizeMandatoryPlanningStatus(null, project?.planning_energy_report_received_at)
  );
  const [footingStatus, setFootingStatus] = useState(
    normalizeMandatoryPlanningStatus(null, project?.planning_footing_certification_received_at)
  );
  const [buildingPermitStatus, setBuildingPermitStatus] = useState(
    normalizeMandatoryPlanningStatus(null, project?.planning_building_permit_received_at)
  );

  async function saveFields(fields) {
    if (!project?.id) return false;
    const body = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      body[k] = v === "" ? null : v;
    }
    if (Object.keys(body).length === 0) return true;

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }
      if (onUpdate) onUpdate();
      return true;
    } catch (error) {
      console.error("Error saving planning fields:", error);
      alert(`Error saving: ${error.message}`);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRequirementChange(field, next, setLocal, stampKeys = null) {
    const status = normalizePlanningStatus(next);
    setLocal(status);
    if (
      stampKeys &&
      (status === "Not Selected" || status === "Not Required")
    ) {
      await saveFields({
        [field]: status,
        [stampKeys.requested]: null,
        [stampKeys.received]: null,
      });
    } else {
      await saveFields({ [field]: status });
    }
  }

  async function handleMandatoryChange(requestedKey, receivedKey, next, setLocal) {
    const status = normalizeMandatoryPlanningStatus(next);
    setLocal(status);
    if (status === "Complete") {
      const now = new Date().toISOString();
      await saveFields({
        [requestedKey]: now,
        [receivedKey]: now,
      });
    } else {
      await saveFields({
        [requestedKey]: null,
        [receivedKey]: null,
      });
    }
  }

  useEffect(() => {
    setTownPlanningStatus(normalizePlanningStatus(project?.planning_town_planning));
    setBalStatus(normalizePlanningStatus(project?.planning_bal));
    setSewerConnection(normalizePlanningStatus(project?.planning_sewer_connection));
    setEnergyStatus(
      normalizeMandatoryPlanningStatus(null, project?.planning_energy_report_received_at)
    );
    setFootingStatus(
      normalizeMandatoryPlanningStatus(null, project?.planning_footing_certification_received_at)
    );
    setBuildingPermitStatus(
      normalizeMandatoryPlanningStatus(null, project?.planning_building_permit_received_at)
    );
  }, [
    project?.id,
    project?.planning_town_planning,
    project?.planning_bal,
    project?.planning_sewer_connection,
    project?.planning_energy_report_received_at,
    project?.planning_footing_certification_received_at,
    project?.planning_building_permit_received_at,
  ]);

  const disabled = !project?.id || isSaving;

  function renderRequirementSelect(id, value, onChange) {
    return (
      <div>
        <label htmlFor={id} style={labelStyle}>
          Status
        </label>
        <select id={id} value={value} onChange={onChange} disabled={disabled} style={selectStyle}>
          {PLANNING_REQUIREMENT_SELECT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function renderMandatorySelect(id, value, onChange) {
    return (
      <div>
        <label htmlFor={id} style={labelStyle}>
          Status
        </label>
        <select id={id} value={value} onChange={onChange} disabled={disabled} style={selectStyle}>
          {MANDATORY_PLANNING_SELECT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "8px 4px",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ margin: "0 0 24px", fontSize: "1.35rem", color: MONUMENT, flexShrink: 0 }}>
        Planning
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "20px",
          alignItems: "stretch",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={stackColumnStyle}>
          <section aria-labelledby="town-planning-title" style={panelStyle}>
            <h3 id="town-planning-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Town planning
            </h3>
            {renderRequirementSelect("town-planning-select", townPlanningStatus, (e) =>
              void handleRequirementChange(
                "planning_town_planning",
                e.target.value,
                setTownPlanningStatus,
                {
                  requested: "planning_town_planning_requested_at",
                  received: "planning_town_planning_received_at",
                }
              )
            )}
          </section>

          <section aria-labelledby="energy-report-title" style={panelStyle}>
            <h3 id="energy-report-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Energy report
            </h3>
            {renderMandatorySelect("energy-report-select", energyStatus, (e) =>
              void handleMandatoryChange(
                "planning_energy_report_requested_at",
                "planning_energy_report_received_at",
                e.target.value,
                setEnergyStatus
              )
            )}
          </section>
        </div>

        <div style={stackColumnStyle}>
          <section aria-labelledby="bal-title" style={panelStyle}>
            <h3 id="bal-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              BAL
            </h3>
            {renderRequirementSelect("bal-select", balStatus, (e) =>
              void handleRequirementChange("planning_bal", e.target.value, setBalStatus, {
                requested: "planning_bal_requested_at",
                received: "planning_bal_received_at",
              })
            )}
          </section>

          <section aria-labelledby="footing-certification-title" style={panelStyle}>
            <h3 id="footing-certification-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Footing certification
            </h3>
            {renderMandatorySelect("footing-select", footingStatus, (e) =>
              void handleMandatoryChange(
                "planning_footing_certification_requested_at",
                "planning_footing_certification_received_at",
                e.target.value,
                setFootingStatus
              )
            )}
          </section>
        </div>

        <div style={stackColumnStyle}>
          <section aria-labelledby="sewer-connection-title" style={panelStyle}>
            <h3 id="sewer-connection-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Sewer Connection
            </h3>
            {renderRequirementSelect("sewer-connection-select", sewerConnection, (e) =>
              void handleRequirementChange(
                "planning_sewer_connection",
                e.target.value,
                setSewerConnection
              )
            )}
          </section>

          <section aria-labelledby="building-permit-title" style={panelStyle}>
            <h3 id="building-permit-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Building Permit
            </h3>
            {renderMandatorySelect("building-permit-select", buildingPermitStatus, (e) =>
              void handleMandatoryChange(
                "planning_building_permit_requested_at",
                "planning_building_permit_received_at",
                e.target.value,
                setBuildingPermitStatus
              )
            )}
          </section>
        </div>

        <div style={stackColumnStyle}>
          <section aria-label="Reserved" style={panelStyle} />
          <section aria-label="Reserved" style={panelStyle} />
        </div>
      </div>
    </div>
  );
}
