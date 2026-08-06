import React from "react";
import {
  formatOverviewCurrency,
  formatStageCount,
} from "../utils/projectsOverviewCompute";
import { UI, STREAM } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

function StageRow({ label, total, onHold, value, accentRow = false }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(7.5rem, auto) minmax(6.5rem, auto)",
        gap: "12px",
        alignItems: "baseline",
        padding: accentRow ? "12px 12px" : "10px 12px",
        borderRadius: "8px",
        background: accentRow ? undefined : SECTION_GREY,
        color: accentRow ? PAGE_TEXT : MONUMENT,
      }}
    >
      <span style={{ fontSize: accentRow ? "1.05rem" : "1rem", fontWeight: accentRow ? 700 : 500 }}>
        {label}
      </span>
      <span
        style={{
          fontSize: accentRow ? "1.05rem" : "1.05rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {formatStageCount(total, onHold)}
      </span>
      <span
        style={{
          fontSize: accentRow ? "1.15rem" : "1.05rem",
          fontWeight: 700,
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {formatOverviewCurrency(value)}
      </span>
    </div>
  );
}

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(7.5rem, auto) minmax(6.5rem, auto)",
          gap: "12px",
          padding: "0 12px 8px",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: UI.textMuted,
          letterSpacing: "0.3px",
        }}
      >
        <span>Stage</span>
        <span style={{ textAlign: "right" }}>Jobs</span>
        <span style={{ textAlign: "right" }}>Value</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {summary.stages.map((stage) => (
          <StageRow
            key={stage.key}
            label={stage.label}
            total={stage.total}
            onHold={stage.onHold}
            value={stage.value}
          />
        ))}

        <div style={{ background: accent, borderRadius: "8px" }}>
          <StageRow
            label="TOTAL"
            total={summary.total}
            onHold={summary.onHoldTotal}
            value={summary.valueTotal}
            accentRow
          />
        </div>
      </div>
    </div>
  );
}

/** VIC + QLD stage count + value columns (page + PDF). */
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
