import React, { useEffect, useState } from "react";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const PLANNING_NA_REQUIRED_OPTIONS = ["N/A", "Required"];
const SEPTIC_OPTIONS = ["Not Required", "Required", "Complete"];
const BUILDING_PERMIT_OPTIONS = ["Not Submitted", "Sent", "Complete"];

function formatDateTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function RequestedReceivedControls({ requestedAt, receivedAt, onRequested, onReceived, disabled }) {
  const buttonStyle = {
    border: "none",
    background: MONUMENT,
    color: PAGE_TEXT,
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
    width: "100%",
  };
  const textStyle = {
    fontSize: "0.82rem",
    color: "var(--sgf-text-primary)",
    lineHeight: 1.35,
    maxWidth: "100%",
    wordBreak: "break-word",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: "12px",
        alignItems: "start",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
        <button type="button" onClick={onRequested} disabled={disabled} style={buttonStyle}>
          Requested
        </button>
        {requestedAt ? <div style={textStyle}>{formatDateTime(requestedAt)}</div> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
        <button type="button" onClick={onReceived} disabled={disabled} style={buttonStyle}>
          Received
        </button>
        {receivedAt ? <div style={textStyle}>{formatDateTime(receivedAt)}</div> : null}
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: "0.9rem",
  color: UI.textMuted,
  marginBottom: "6px",
  fontWeight: 500,
};

const selectStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #ddd",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

const columnStyle = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

function normalizeSeptic(value) {
  const t = value != null ? String(value).trim() : "";
  if (SEPTIC_OPTIONS.includes(t)) return t;
  if (t === "Permit Complete") return "Complete";
  return "Not Required";
}

/**
 * Main Planning page: Town Planning, BAL, Septic, Building Permit.
 */
export default function PlanningMain({ project, onUpdate }) {
  const [isSaving, setIsSaving] = useState(false);
  const [buildingPermitStatus, setBuildingPermitStatus] = useState(
    project?.building_permit_status || "Not Submitted"
  );
  const [septicStatus, setSepticStatus] = useState(normalizeSeptic(project?.planning_septic));

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

  async function saveField(fieldName, value) {
    return saveFields({ [fieldName]: value });
  }

  const townPlanningRequirement =
    project?.planning_town_planning != null && String(project.planning_town_planning).trim() === "Required"
      ? "Required"
      : "N/A";

  const balRequirement =
    project?.planning_bal != null && String(project.planning_bal).trim() === "Required" ? "Required" : "N/A";

  async function handleTownPlanningRequirementChange(e) {
    const next = e.target.value === "Required" ? "Required" : "N/A";
    if (next === "N/A") {
      await saveFields({
        planning_town_planning: "N/A",
        planning_town_planning_requested_at: null,
        planning_town_planning_received_at: null,
      });
    } else {
      await saveField("planning_town_planning", "Required");
    }
  }

  async function handleBalRequirementChange(e) {
    const next = e.target.value === "Required" ? "Required" : "N/A";
    if (next === "N/A") {
      await saveFields({
        planning_bal: "N/A",
        planning_bal_requested_at: null,
        planning_bal_received_at: null,
      });
    } else {
      await saveField("planning_bal", "Required");
    }
  }

  async function handleSepticChange(e) {
    const next = normalizeSeptic(e.target.value);
    setSepticStatus(next);
    if (next === "Not Required") {
      await saveFields({
        planning_septic: "Not Required",
        planning_septic_requested_at: null,
        planning_septic_received_at: null,
      });
    } else {
      await saveField("planning_septic", next);
    }
  }

  function handleBuildingPermitChange(e) {
    const newValue = e.target.value;
    setBuildingPermitStatus(newValue);
    void saveField("building_permit_status", newValue);
  }

  useEffect(() => {
    setBuildingPermitStatus(project?.building_permit_status || "Not Submitted");
    setSepticStatus(normalizeSeptic(project?.planning_septic));
  }, [project?.id, project?.building_permit_status, project?.planning_septic]);

  const disabled = !project?.id || isSaving;

  return (
    <div style={{ padding: "8px 4px" }}>
      <h2 style={{ margin: "0 0 24px", fontSize: "1.35rem", color: MONUMENT }}>Planning</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "24px",
          alignItems: "start",
        }}
      >
        <section aria-labelledby="town-planning-title" style={columnStyle}>
          <h3 id="town-planning-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
            Town planning
          </h3>
          <div>
            <label htmlFor="town-planning-select" style={labelStyle}>
              Requirement
            </label>
            <select
              id="town-planning-select"
              value={townPlanningRequirement}
              onChange={handleTownPlanningRequirementChange}
              disabled={disabled}
              style={selectStyle}
            >
              {PLANNING_NA_REQUIRED_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {townPlanningRequirement === "Required" ? (
            <RequestedReceivedControls
              requestedAt={project?.planning_town_planning_requested_at}
              receivedAt={project?.planning_town_planning_received_at}
              onRequested={() => void saveField("planning_town_planning_requested_at", new Date().toISOString())}
              onReceived={() => void saveField("planning_town_planning_received_at", new Date().toISOString())}
              disabled={disabled}
            />
          ) : null}
        </section>

        <section aria-labelledby="bal-title" style={columnStyle}>
          <h3 id="bal-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
            BAL
          </h3>
          <div>
            <label htmlFor="bal-select" style={labelStyle}>
              Requirement
            </label>
            <select
              id="bal-select"
              value={balRequirement}
              onChange={handleBalRequirementChange}
              disabled={disabled}
              style={selectStyle}
            >
              {PLANNING_NA_REQUIRED_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {balRequirement === "Required" ? (
            <RequestedReceivedControls
              requestedAt={project?.planning_bal_requested_at}
              receivedAt={project?.planning_bal_received_at}
              onRequested={() => void saveField("planning_bal_requested_at", new Date().toISOString())}
              onReceived={() => void saveField("planning_bal_received_at", new Date().toISOString())}
              disabled={disabled}
            />
          ) : null}
        </section>

        <section aria-labelledby="septic-title" style={columnStyle}>
          <h3 id="septic-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
            Septic
          </h3>
          <div>
            <label htmlFor="septic-select" style={labelStyle}>
              Status
            </label>
            <select
              id="septic-select"
              value={septicStatus}
              onChange={handleSepticChange}
              disabled={disabled}
              style={selectStyle}
            >
              {SEPTIC_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <RequestedReceivedControls
            requestedAt={project?.planning_septic_requested_at}
            receivedAt={project?.planning_septic_received_at}
            onRequested={() => void saveField("planning_septic_requested_at", new Date().toISOString())}
            onReceived={() => void saveField("planning_septic_received_at", new Date().toISOString())}
            disabled={disabled}
          />
        </section>

        <section aria-labelledby="building-permit-title" style={columnStyle}>
          <h3 id="building-permit-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
            Building Permit
          </h3>
          <div>
            <label htmlFor="building-permit-select" style={labelStyle}>
              Status
            </label>
            <select
              id="building-permit-select"
              value={buildingPermitStatus}
              onChange={handleBuildingPermitChange}
              disabled={disabled}
              style={selectStyle}
            >
              {BUILDING_PERMIT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>
    </div>
  );
}
