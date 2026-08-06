import React from "react";
import { formatStageCount } from "../utils/projectsOverviewCompute";
import { UI, STREAM } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

function StateColumn({ title, accent, summary }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: WHITE,
        borderRadius: "14px",
        border: `1px solid ${UI.outline}`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        padding: "22px 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "18px",
          paddingBottom: "12px",
          borderBottom: `2px solid ${accent}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "1.35rem",
            fontWeight: 700,
            color: MONUMENT,
            letterSpacing: "0.5px",
          }}
        >
          {title}
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {summary.stages.map((stage) => (
          <div
            key={stage.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "16px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: SECTION_GREY,
            }}
          >
            <span style={{ fontSize: "1rem", fontWeight: 500, color: MONUMENT }}>
              {stage.label}
            </span>
            <span
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: MONUMENT,
                whiteSpace: "nowrap",
              }}
            >
              {formatStageCount(stage.total, stage.onHold)}
            </span>
          </div>
        ))}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "16px",
            marginTop: "6px",
            padding: "12px 12px",
            borderRadius: "8px",
            background: accent,
            color: PAGE_TEXT,
          }}
        >
          <span style={{ fontSize: "1.05rem", fontWeight: 700 }}>TOTAL</span>
          <span style={{ fontSize: "1.15rem", fontWeight: 700, whiteSpace: "nowrap" }}>
            {formatStageCount(summary.total, summary.onHoldTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** VIC + QLD stage count columns (page + PDF). */
export default function ProjectsOverviewColumns({ overview }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "24px",
        alignItems: "stretch",
        flexWrap: "wrap",
      }}
    >
      <StateColumn title="VIC" accent={STREAM.vicBlue} summary={overview.VIC} />
      <StateColumn title="QLD" accent={STREAM.qldRed} summary={overview.QLD} />
    </div>
  );
}
