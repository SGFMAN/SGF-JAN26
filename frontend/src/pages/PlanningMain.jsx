import React, { useEffect, useState } from "react";
import { UI } from "../utils/uiThemeTokens.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
import {
  PLANNING_STATUS_OPTIONS,
  SPECS_ADDED_OPTIONS,
  normalizePlanningStatus,
  normalizeSpecsAdded,
  showPlanningStampControls,
} from "../constants/planningStatusFields.js";

const REQUESTED_BUTTON_STYLE_ID = 1;
const RECEIVED_BUTTON_STYLE_ID = 5;
const CLEAR_BUTTON_STYLE_ID = 6;

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const FIELD_OUTLINE = `1px solid ${UI.outline || "#000"}`;
const API_URL = "";

const STAMP_BUTTON_LABELS = ["Requested", "Received"];

/** Fit width from longest label (ch) + padding for select chevron / button padding. */
function fitWidthCh(labels, extraCh = 3.5) {
  const maxLen = Math.max(1, ...labels.map((s) => String(s).length));
  return `calc(${maxLen}ch + ${extraCh}ch)`;
}

const SHARED_SELECT_WIDTH = fitWidthCh([...PLANNING_STATUS_OPTIONS, ...SPECS_ADDED_OPTIONS], 3.75);
const SHARED_BUTTON_WIDTH = fitWidthCh(STAMP_BUTTON_LABELS, 3.25);

function formatDateTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const t = iso.trim();
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function mergeStampButtonStyle(styleId, disabled) {
  const fallback = {
    border: "none",
    background: MONUMENT,
    color: PAGE_TEXT,
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "0.95rem",
    fontWeight: 500,
  };
  const saved = buildSavedButtonStyle(styleId, true);
  return {
    ...(saved || fallback),
    width: SHARED_BUTTON_WIDTH,
    boxSizing: "border-box",
    flexShrink: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
  };
}

function RequestedReceivedControls({
  requestedAt,
  receivedAt,
  onRequested,
  onReceived,
  onClearRequested,
  onClearReceived,
  disabled,
}) {
  const requestedStyle = mergeStampButtonStyle(REQUESTED_BUTTON_STYLE_ID, disabled);
  const receivedStyle = mergeStampButtonStyle(RECEIVED_BUTTON_STYLE_ID, disabled);
  const clearFallback = {
    border: FIELD_OUTLINE,
    background: WHITE,
    color: MONUMENT,
    borderRadius: "6px",
    padding: "4px 8px",
    fontSize: "0.75rem",
    fontWeight: 500,
  };
  const clearSaved = buildSavedButtonStyle(CLEAR_BUTTON_STYLE_ID, true);
  const clearStyle = {
    ...(clearSaved || clearFallback),
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.65 : 1,
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
        <button type="button" onClick={onRequested} disabled={disabled} style={requestedStyle}>
          Requested
        </button>
        <div style={dateStyle}>{requestedAt ? formatDateTime(requestedAt) : ""}</div>
        {requestedAt ? (
          <button type="button" onClick={onClearRequested} disabled={disabled} style={clearStyle} title="Clear date">
            Clear
          </button>
        ) : null}
      </div>
      <div style={rowStyle}>
        <button type="button" onClick={onReceived} disabled={disabled} style={receivedStyle}>
          Received
        </button>
        <div style={dateStyle}>{receivedAt ? formatDateTime(receivedAt) : ""}</div>
        {receivedAt ? (
          <button type="button" onClick={onClearReceived} disabled={disabled} style={clearStyle} title="Clear date">
            Clear
          </button>
        ) : null}
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
 * Shared fields with underconstruction except Septic (temporary only).
 */
export default function PlanningMain({ project, onUpdate }) {
  const [isSaving, setIsSaving] = useState(false);
  const [townPlanningStatus, setTownPlanningStatus] = useState(
    normalizePlanningStatus(project?.planning_town_planning)
  );
  const [balStatus, setBalStatus] = useState(normalizePlanningStatus(project?.planning_bal));
  const [septicStatus, setSepticStatus] = useState(normalizePlanningStatus(project?.planning_septic));
  const [energySpecsAddedToPlans, setEnergySpecsAddedToPlans] = useState(
    normalizeSpecsAdded(project?.planning_energy_specs_added_to_plans)
  );
  const [balSpecsAddedToPlans, setBalSpecsAddedToPlans] = useState(
    normalizeSpecsAdded(project?.planning_bal_specs_added_to_plans)
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

  async function saveField(fieldName, value) {
    return saveFields({ [fieldName]: value });
  }

  function stampHandlers(requestedKey, receivedKey) {
    return {
      onRequested: () => void saveField(requestedKey, new Date().toISOString()),
      onReceived: () => void saveField(receivedKey, new Date().toISOString()),
      onClearRequested: () => void saveField(requestedKey, null),
      onClearReceived: () => void saveField(receivedKey, null),
    };
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

  useEffect(() => {
    setTownPlanningStatus(normalizePlanningStatus(project?.planning_town_planning));
    setBalStatus(normalizePlanningStatus(project?.planning_bal));
    setSepticStatus(normalizePlanningStatus(project?.planning_septic));
    setEnergySpecsAddedToPlans(normalizeSpecsAdded(project?.planning_energy_specs_added_to_plans));
    setBalSpecsAddedToPlans(normalizeSpecsAdded(project?.planning_bal_specs_added_to_plans));
  }, [
    project?.id,
    project?.planning_town_planning,
    project?.planning_bal,
    project?.planning_septic,
    project?.planning_energy_specs_added_to_plans,
    project?.planning_bal_specs_added_to_plans,
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
        {/* Column 1: Town Planning / Energy Report */}
        <div style={stackColumnStyle}>
          <section aria-labelledby="town-planning-title" style={panelStyle}>
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
            {showPlanningStampControls(townPlanningStatus) ? (
              <RequestedReceivedControls
                requestedAt={project?.planning_town_planning_requested_at}
                receivedAt={project?.planning_town_planning_received_at}
                disabled={disabled}
                {...stampHandlers("planning_town_planning_requested_at", "planning_town_planning_received_at")}
              />
            ) : null}
          </section>

          <section aria-labelledby="energy-report-title" style={panelStyle}>
            <h3 id="energy-report-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Energy report
            </h3>
            <RequestedReceivedControls
              requestedAt={project?.planning_energy_report_requested_at}
              receivedAt={project?.planning_energy_report_received_at}
              disabled={disabled}
              {...stampHandlers("planning_energy_report_requested_at", "planning_energy_report_received_at")}
            />
            <div>
              <label htmlFor="energy-specs-added-select" style={labelStyle}>
                Energy Specs Added to Plans
              </label>
              <select
                id="energy-specs-added-select"
                value={energySpecsAddedToPlans}
                onChange={(e) => {
                  const next = normalizeSpecsAdded(e.target.value);
                  setEnergySpecsAddedToPlans(next);
                  void saveField("planning_energy_specs_added_to_plans", next);
                }}
                disabled={disabled}
                style={selectStyle}
              >
                {SPECS_ADDED_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </section>
        </div>

        {/* Column 2: BAL / Footing Certification */}
        <div style={stackColumnStyle}>
          <section aria-labelledby="bal-title" style={panelStyle}>
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
            {showPlanningStampControls(balStatus) ? (
              <RequestedReceivedControls
                requestedAt={project?.planning_bal_requested_at}
                receivedAt={project?.planning_bal_received_at}
                disabled={disabled}
                {...stampHandlers("planning_bal_requested_at", "planning_bal_received_at")}
              />
            ) : null}
            {showPlanningStampControls(balStatus) ? (
              <div>
                <label htmlFor="bal-specs-added-select" style={labelStyle}>
                  BAL Specs Added to Plans
                </label>
                <select
                  id="bal-specs-added-select"
                  value={balSpecsAddedToPlans}
                  onChange={(e) => {
                    const next = normalizeSpecsAdded(e.target.value);
                    setBalSpecsAddedToPlans(next);
                    void saveField("planning_bal_specs_added_to_plans", next);
                  }}
                  disabled={disabled}
                  style={selectStyle}
                >
                  {SPECS_ADDED_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="footing-certification-title" style={panelStyle}>
            <h3 id="footing-certification-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Footing certification
            </h3>
            <RequestedReceivedControls
              requestedAt={project?.planning_footing_certification_requested_at}
              receivedAt={project?.planning_footing_certification_received_at}
              disabled={disabled}
              {...stampHandlers(
                "planning_footing_certification_requested_at",
                "planning_footing_certification_received_at"
              )}
            />
          </section>
        </div>

        {/* Column 3: Septic / Building Permit */}
        <div style={stackColumnStyle}>
          <section aria-labelledby="septic-title" style={panelStyle}>
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
            {showPlanningStampControls(septicStatus) ? (
              <RequestedReceivedControls
                requestedAt={project?.planning_septic_requested_at}
                receivedAt={project?.planning_septic_received_at}
                disabled={disabled}
                {...stampHandlers("planning_septic_requested_at", "planning_septic_received_at")}
              />
            ) : null}
          </section>

          <section aria-labelledby="building-permit-title" style={panelStyle}>
            <h3 id="building-permit-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              Building Permit
            </h3>
            <RequestedReceivedControls
              requestedAt={project?.planning_building_permit_requested_at}
              receivedAt={project?.planning_building_permit_received_at}
              disabled={disabled}
              {...stampHandlers("planning_building_permit_requested_at", "planning_building_permit_received_at")}
            />
          </section>
        </div>

        {/* Column 4: reserved / PIC */}
        <div style={stackColumnStyle}>
          <section aria-label="Reserved" style={panelStyle} />

          <section aria-labelledby="pic-title" style={panelStyle}>
            <h3 id="pic-title" style={{ margin: 0, color: MONUMENT, fontSize: "1.1rem" }}>
              PIC
            </h3>
            <RequestedReceivedControls
              requestedAt={project?.planning_pic_requested_at}
              receivedAt={project?.planning_pic_received_at}
              disabled={disabled}
              {...stampHandlers("planning_pic_requested_at", "planning_pic_received_at")}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
