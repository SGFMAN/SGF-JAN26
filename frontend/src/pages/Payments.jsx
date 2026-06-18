import React, { useEffect, useMemo, useRef, useState } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const DEPOSIT_STAGE = { key: "deposit", label: "Deposit", percent: 5 };

const CHECKBOX_STAGES = [
  { key: "base", label: "Base", percent: 10 },
  { key: "frame", label: "Frame", percent: 15 },
  { key: "lock_up", label: "Lock Up", percent: 35 },
  { key: "fix", label: "Fix", percent: 25 },
  { key: "final", label: "Final", percent: 10 },
];

const DEFAULT_PAID_STATE = Object.fromEntries(CHECKBOX_STAGES.map((s) => [s.key, false]));

function parseProjectCost(projectCost) {
  if (projectCost == null || projectCost === "") return 0;
  const cleaned = String(projectCost).replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(amount) {
  return amount.toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatProjectCostDisplay(projectCost) {
  const n = parseProjectCost(projectCost);
  if (!n) return "—";
  return `$${formatCurrency(n)}`;
}

function parsePaidState(raw) {
  if (!raw) return { ...DEFAULT_PAID_STATE };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PAID_STATE };
    return {
      ...DEFAULT_PAID_STATE,
      ...Object.fromEntries(
        CHECKBOX_STAGES.map((s) => [s.key, Boolean(parsed[s.key])])
      ),
    };
  } catch {
    return { ...DEFAULT_PAID_STATE };
  }
}

export default function Payments({ project, onUpdate }) {
  const [paidState, setPaidState] = useState(() =>
    parsePaidState(project?.construction_payments_paid)
  );
  const paidStateRef = useRef(paidState);
  const savingRef = useRef(false);

  useEffect(() => {
    paidStateRef.current = paidState;
  }, [paidState]);

  useEffect(() => {
    setPaidState(parsePaidState(project?.construction_payments_paid));
  }, [project?.construction_payments_paid]);

  const projectCost = parseProjectCost(project?.project_cost);

  const depositAmount =
    projectCost > 0 ? Math.round((projectCost * DEPOSIT_STAGE.percent) / 100) : 0;

  const stageAmounts = useMemo(() => {
    return CHECKBOX_STAGES.map((stage) => ({
      ...stage,
      amount: projectCost > 0 ? Math.round((projectCost * stage.percent) / 100) : 0,
    }));
  }, [projectCost]);

  async function savePaidState(nextState) {
    if (!project?.id || savingRef.current) return;
    savingRef.current = true;
    try {
      const response = await fetch(
        `${API_URL}/api/projects/${project.id}/construction-payments`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ construction_payments_paid: nextState }),
        }
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving payment stages:", response.status, errorText);
        setPaidState(parsePaidState(project?.construction_payments_paid));
        return;
      }
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving payment stages:", error);
      setPaidState(parsePaidState(project?.construction_payments_paid));
    } finally {
      savingRef.current = false;
    }
  }

  function handleToggle(key) {
    const nextState = {
      ...paidStateRef.current,
      [key]: !paidStateRef.current[key],
    };
    setPaidState(nextState);
    void savePaidState(nextState);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, flexShrink: 0 }}>
        Payments
      </h2>

      <div
        style={{
          marginTop: "12px",
          maxWidth: "520px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px" }}>
            Project Cost
          </div>
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: WHITE,
              color: MONUMENT,
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            {formatProjectCostDisplay(project?.project_cost)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: "12px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#e8f5e9",
            }}
          >
            <span
              style={{
                fontSize: "0.95rem",
                color: MONUMENT,
                fontWeight: 600,
              }}
            >
              {DEPOSIT_STAGE.label} {DEPOSIT_STAGE.percent}%
            </span>
            <span
              style={{
                fontSize: "0.95rem",
                color: MONUMENT,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {projectCost > 0 ? `$${formatCurrency(depositAmount)}` : "—"}
            </span>
          </div>

          {stageAmounts.map((stage) => (
            <label
              key={stage.key}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr auto",
                alignItems: "center",
                gap: "12px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: paidState[stage.key] ? "#e8f5e9" : SECTION_GREY,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(paidState[stage.key])}
                onChange={() => handleToggle(stage.key)}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                  margin: 0,
                }}
              />
              <span
                style={{
                  fontSize: "0.95rem",
                  color: MONUMENT,
                  fontWeight: paidState[stage.key] ? 600 : 500,
                }}
              >
                {stage.label} {stage.percent}%
              </span>
              <span
                style={{
                  fontSize: "0.95rem",
                  color: MONUMENT,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {projectCost > 0 ? `$${formatCurrency(stage.amount)}` : "—"}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
