import React, { useEffect, useState } from "react";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const FIELD_OUTLINE = `1px solid ${UI.outline || "#000"}`;
const API_URL = "";

const PLANNING_STATUS_OPTIONS = ["Not Selected", "Not Required", "Required", "Completed"];
const BUILDING_PERMIT_OPTIONS = ["Not Submitted", "Submitted", "Completed"];
const STAMP_BUTTON_LABELS = ["Requested", "Received"];

/** Fit width from longest label (ch) + padding for select chevron / button padding. */
function fitWidthCh(labels, extraCh = 3.5) {
  const maxLen = Math.max(1, ...labels.map((s) => String(s).length));
  return `calc(${maxLen}ch + ${extraCh}ch)`;
}

const SHARED_SELECT_WIDTH = fitWidthCh(
  [...PLANNING_STATUS_OPTIONS, ...BUILDING_PERMIT_OPTIONS],
  3.75
);
const SHARED_BUTTON_WIDTH = fitWidthCh(STAMP_BUTTON_LABELS, 3.25);

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
    width: SHARED_BUTTON_WIDTH,
    boxSizing: "border-box",
    flexShrink: 0,
  };
  const dateStyle = {
    fontSize: "0.82rem",
    color: "var(--sgf-text-primary)",
    lineHeight: 1.35,
    minWidth: 0,
    wordBreak: "break-word",
  };
  const rowStyle = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "10px",
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      <div style={rowStyle}>
        <button type="button" onClick={onRequested} disabled={disabled} style={buttonStyle}>
          Requested
        </button>
        <div style={dateStyle}>{requestedAt ? formatDateTime(requestedAt) : ""}</div>
      </div>
      <div style={rowStyle}>
        <button type="button" onClick={onReceived} disabled={disabled} style={buttonStyle}>
          Received
        </button>
        <div style={dateStyle}>{receivedAt ? formatDateTime(receivedAt) : ""}</div>
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

const columnStyle = {
  minWidth: 0,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  background: WHITE,
  border: FIELD_OUTLINE,
  borderRadius: "8px",
  padding: "16px",
  boxSizing: "border-box",
};

function normalizePlanningStatus(value) {
  const t = value != null ? String(value).trim() : "";
  if (PLANNING_STATUS_OPTIONS.includes(t)) return t;
  if (t === "N/A") return "Not Required";
  if (t === "Complete" || t === "Permit Complete") return "Completed";
  return "Not Selected";
}

function normalizeBuildingPermit(value) {
  const t = value != null ? String(value).trim() : "";
  if (BUILDING_PERMIT_OPTIONS.includes(t)) return t;
  if (t === "Sent") return "Submitted";
  if (t === "Complete") return "Completed";
  return "Not Submitted";
}

function showStampControls(status) {
  return status === "Required" || status === "Completed";
}

/**
 * Main Planning page: Town Planning, BAL, Septic, Building Permit.
 */
export default function PlanningMain({ project, onUpdate }) {
  const [isSaving, setIsSaving] = useState(false);
  const [buildingPermitStatus, setBuildingPermitStatus] = useState(
    normalizeBuildingPermit(project?.building_permit_status)
  );
  const [townPlanningStatus, setTownPlanningStatus] = useState(
    normalizePlanningStatus(project?.planning_town_planning)
  );
  const [balStatus, setBalStatus] = useState(normalizePlanningStatus(project?.planning_bal));
  const [septicStatus, setSepticStatus] = useState(normalizePlanningStatus(project?.planning_septic));

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

  async function handleStatusChange(field, requestedAtKey, receivedAtKey, next, setLocal) {
    const status = normalizePlanningStatus(next);
    setLocal(status);
    if (status === "Not Selected" || status === "Not Required") {
      await saveFields({
        [field]: status,
        [requestedAtKey]: null,
        [receivedAtKey]: null,
      });
    } else {
      await saveField(field, status);
    }
  }

  function handleBuildingPermitChange(e) {
    const newValue = normalizeBuildingPermit(e.target.value);
    setBuildingPermitStatus(newValue);
    void saveField("building_permit_status", newValue);
  }

  useEffect(() => {
    setBuildingPermitStatus(normalizeBuildingPermit(project?.building_permit_status));
    setTownPlanningStatus(normalizePlanningStatus(project?.planning_town_planning));
    setBalStatus(normalizePlanningStatus(project?.planning_bal));
    setSepticStatus(normalizePlanningStatus(project?.planning_septic));
  }, [
    project?.id,
    project?.building_permit_status,
    project?.planning_town_planning,
    project?.planning_bal,
    project?.planning_septic,
  ]);

  const disabled = !project?.id || isSaving;

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
        <section aria-labelledby="town-planning-title" style={columnStyle}>
          <h3 id="town-planning-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
            Town planning
          </h3>
          <div>
            <label htmlFor="town-planning-select" style={labelStyle}>
              Status
            </label>
            <select
              id="town-planning-select"
              value={townPlanningStatus}
              onChange={(e) =>
                void handleStatusChange(
                  "planning_town_planning",
                  "planning_town_planning_requested_at",
                  "planning_town_planning_received_at",
                  e.target.value,
                  setTownPlanningStatus
                )
              }
              disabled={disabled}
              style={selectStyle}
            >
              {PLANNING_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {showStampControls(townPlanningStatus) ? (
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
              Status
            </label>
            <select
              id="bal-select"
              value={balStatus}
              onChange={(e) =>
                void handleStatusChange(
                  "planning_bal",
                  "planning_bal_requested_at",
                  "planning_bal_received_at",
                  e.target.value,
                  setBalStatus
                )
              }
              disabled={disabled}
              style={selectStyle}
            >
              {PLANNING_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {showStampControls(balStatus) ? (
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
              onChange={(e) =>
                void handleStatusChange(
                  "planning_septic",
                  "planning_septic_requested_at",
                  "planning_septic_received_at",
                  e.target.value,
                  setSepticStatus
                )
              }
              disabled={disabled}
              style={selectStyle}
            >
              {PLANNING_STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          {showStampControls(septicStatus) ? (
            <RequestedReceivedControls
              requestedAt={project?.planning_septic_requested_at}
              receivedAt={project?.planning_septic_received_at}
              onRequested={() => void saveField("planning_septic_requested_at", new Date().toISOString())}
              onReceived={() => void saveField("planning_septic_received_at", new Date().toISOString())}
              disabled={disabled}
            />
          ) : null}
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
