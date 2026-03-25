import React, { useEffect, useState } from "react";

const MONUMENT = "#323233";
const TILE_BLUE = "#63a7e8";
const WHITE = "#fff";
const TILE_RED = "#d9534f";
const TILE_GREEN = "#43a047";
const TILE_ORANGE = "#f0ad4e";
const SECTION_GREY = "#a1a1a3";
const SURVEY_STATUS_OPTIONS = ["Not Booked", "Booked", "Complete"];
const SOIL_STATUS_OPTIONS = ["Not Booked", "Booked", "Complete"];
const API_URL = "";

const PLANNING_CATEGORIES = [
  "Job File Documents",
  "Job File Complete",
  "JCA Land Survey",
  "Soil Test",
  "Concept Drawings",
  "Working Drawings",
  "Site Visit",
  "Written Planning Advice",
  "Town Planning",
  "Land Subject to Flooding",
  "BAL",
  "Footing Certification",
  "Energy Report",
  "Energy Specs Added to Plans",
  "Windows",
  "Sewer PIC",
  "Septic Approval",
  "Warranty Insurance",
  "Building Permit",
  "Asset Protection",
  "Truss Computations",
  "Trade Certificates",
  "Occupancy Certificate",
  "Handover Email",
  "Asset Protection Bond Refund",
];

function getDrawingTileStates(drawingsStatus) {
  const normalized = (drawingsStatus || "").toString().trim().toLowerCase();

  // "Not Asigned" is intentionally tolerated due to legacy typo in status text.
  if (
    normalized === "" ||
    normalized === "not asigned" ||
    normalized === "not assigned" ||
    normalized === "concept stage"
  ) {
    return {
      concept: { label: "Not Completed", color: TILE_RED },
      working: { label: "Not Completed", color: TILE_RED },
    };
  }

  if (normalized === "working drawing stage") {
    return {
      concept: { label: "Completed", color: TILE_GREEN },
      working: { label: "Not Completed", color: TILE_RED },
    };
  }

  if (normalized === "drawings complete") {
    return {
      concept: { label: "Completed", color: TILE_GREEN },
      working: { label: "Completed", color: TILE_GREEN },
    };
  }

  return {
    concept: { label: "Not Completed", color: TILE_RED },
    working: { label: "Not Completed", color: TILE_RED },
  };
}

function getSurveySoilTileState(statusValue) {
  const normalized = (statusValue || "").toString().trim().toLowerCase();
  if (normalized === "complete") {
    return { color: TILE_GREEN, label: "Complete" };
  }
  if (normalized === "booked") {
    return { color: TILE_ORANGE, label: "Booked" };
  }
  return { color: TILE_RED, label: "Not Booked" };
}

function getDepositStatusLabel(depositValue, projectCostValue) {
  const depositNumeric = parseInt((depositValue || "").toString().replace(/[^0-9]/g, ""), 10) || 0;
  const projectCostNumeric = parseInt((projectCostValue || "").toString().replace(/[^0-9]/g, ""), 10) || 0;
  const fullDepositAmount = Math.round(projectCostNumeric * 0.05);
  return depositNumeric > 0 && fullDepositAmount > 0 && depositNumeric === fullDepositAmount
    ? "Full Deposit Paid"
    : "Partial Deposit Paid";
}

export default function PlanningNew({ project, onUpdate }) {
  const drawingStates = getDrawingTileStates(project?.drawings_status);
  const surveyTileState = getSurveySoilTileState(project?.survey_status);
  const soilTileState = getSurveySoilTileState(project?.soil_status);
  const depositStatusLabel = getDepositStatusLabel(project?.deposit, project?.project_cost);
  const [activeModal, setActiveModal] = useState(null); // "survey" | "soil" | null
  const [surveyStatusDraft, setSurveyStatusDraft] = useState(project?.survey_status || "Not Booked");
  const [soilStatusDraft, setSoilStatusDraft] = useState(project?.soil_status || "Not Booked");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSurveyStatusDraft(project?.survey_status || "Not Booked");
    setSoilStatusDraft(project?.soil_status || "Not Booked");
  }, [project?.survey_status, project?.soil_status]);

  useEffect(() => {
    if (!activeModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeModal]);

  async function saveField(fieldName, value) {
    if (!project?.id) return;
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: value === "" ? null : value }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }

      if (onUpdate) onUpdate();
      setActiveModal(null);
    } catch (error) {
      console.error(`Error saving ${fieldName}:`, error);
      alert(`Error saving ${fieldName}: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Planning
      </h2>

      <div
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gridTemplateRows: "repeat(5, minmax(88px, auto))",
          gap: "16px",
        }}
      >
        {PLANNING_CATEGORIES.map((category, index) => (
          (() => {
            let background = TILE_BLUE;
            let statusLabel = "";

            if (category === "Concept Drawings") {
              background = drawingStates.concept.color;
              statusLabel = drawingStates.concept.label;
            } else if (category === "Working Drawings") {
              background = drawingStates.working.color;
              statusLabel = drawingStates.working.label;
            } else if (category === "JCA Land Survey") {
              background = surveyTileState.color;
              statusLabel = surveyTileState.label;
            } else if (category === "Soil Test") {
              background = soilTileState.color;
              statusLabel = soilTileState.label;
            }

            const isSurveyTile = category === "JCA Land Survey";
            const isSoilTile = category === "Soil Test";
            const isClickableTile = isSurveyTile || isSoilTile;

            return (
          <div
            key={`${category || "empty"}-${index}`}
            onClick={() => {
              if (isSurveyTile) setActiveModal("survey");
              if (isSoilTile) setActiveModal("soil");
            }}
            onKeyDown={(e) => {
              if (!isClickableTile) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (isSurveyTile) setActiveModal("survey");
                if (isSoilTile) setActiveModal("soil");
              }
            }}
            role={isClickableTile ? "button" : undefined}
            tabIndex={isClickableTile ? 0 : -1}
            style={{
              background,
              color: WHITE,
              border: "1.5px solid #000",
              borderRadius: "10px",
              minHeight: "88px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "10px 12px",
              fontSize: "0.95rem",
              fontWeight: 600,
              lineHeight: 1.3,
              flexDirection: "column",
              gap: "6px",
              cursor: isClickableTile ? "pointer" : "default",
            }}
          >
            <div>{category}</div>
            {statusLabel ? (
              <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                {statusLabel}
              </div>
            ) : null}
          </div>
            );
          })()
        ))}
      </div>

      {activeModal === "survey" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              width: "420px",
              maxWidth: "92vw",
              padding: "22px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ margin: "0 0 14px 0", color: MONUMENT }}>Site Feature Survey</h3>
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  color: MONUMENT,
                  marginBottom: "6px",
                }}
              >
                Deposit Status
              </div>
              <div
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "0.95rem",
                  color: MONUMENT,
                  background: "#f8f8f8",
                  boxSizing: "border-box",
                }}
              >
                {depositStatusLabel}
              </div>
            </div>
            <select
              value={surveyStatusDraft}
              onChange={(e) => setSurveyStatusDraft(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
              }}
            >
              {SURVEY_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={isSaving}
                style={{
                  border: "1px solid #c0c0c0",
                  background: WHITE,
                  color: MONUMENT,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveField("survey_status", surveyStatusDraft)}
                disabled={isSaving}
                style={{
                  border: "none",
                  background: MONUMENT,
                  color: WHITE,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? "Saving..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === "soil" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              width: "420px",
              maxWidth: "92vw",
              padding: "22px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ margin: "0 0 14px 0", color: MONUMENT }}>Soil Test</h3>
            <select
              value={soilStatusDraft}
              onChange={(e) => setSoilStatusDraft(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
              }}
            >
              {SOIL_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                disabled={isSaving}
                style={{
                  border: "1px solid #c0c0c0",
                  background: WHITE,
                  color: MONUMENT,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveField("soil_status", soilStatusDraft)}
                disabled={isSaving}
                style={{
                  border: "none",
                  background: MONUMENT,
                  color: WHITE,
                  borderRadius: "8px",
                  padding: "8px 14px",
                  cursor: isSaving ? "not-allowed" : "pointer",
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? "Saving..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
