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

function StageSummaryRow({ label, total, onHold, value, accentRow = false }) {
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
          fontSize: "1.05rem",
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

function SummaryStateColumn({ title, accent, summary }) {
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
          <StageSummaryRow
            key={stage.key}
            label={stage.label}
            total={stage.total}
            onHold={stage.onHold}
            value={stage.value}
          />
        ))}

        <div style={{ background: accent, borderRadius: "8px" }}>
          <StageSummaryRow
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

function ListStateColumn({ title, accent, summary }) {
  return (
    <div
      style={{
        width: "100%",
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
          marginBottom: "16px",
          paddingBottom: "10px",
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

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {summary.stages.map((stage) => (
          <div key={stage.key}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "12px",
                marginBottom: "4px",
                paddingBottom: "4px",
                borderBottom: `1px solid ${UI.outline}`,
              }}
            >
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: MONUMENT }}>
                {stage.label}
              </span>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: UI.textMuted, whiteSpace: "nowrap" }}>
                {formatStageCount(stage.total, stage.onHold)} · {formatOverviewCurrency(stage.value)}
              </span>
            </div>

            {stage.projects.length === 0 ? (
              <div style={{ padding: "2px 0 0", fontSize: "0.82rem", color: UI.textMuted }}>
                No projects
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {stage.projects.map((p) => (
                  <div
                    key={p.id ?? `${p.label}-${p.value}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "10px",
                      padding: "2px 0",
                      lineHeight: 1.35,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 400,
                        color: MONUMENT,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={p.onHold ? `${p.label} (on hold)` : p.label}
                    >
                      {p.label}
                      {p.onHold ? (
                        <span
                          style={{
                            marginLeft: "6px",
                            fontSize: "0.72rem",
                            color: STREAM.vicBlue,
                            fontWeight: 600,
                          }}
                        >
                          on hold
                        </span>
                      ) : null}
                    </span>
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatOverviewCurrency(p.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "12px",
            marginTop: "2px",
            paddingTop: "10px",
            borderTop: `2px solid ${accent}`,
          }}
        >
          <span style={{ fontSize: "0.95rem", fontWeight: 700, color: MONUMENT }}>TOTAL</span>
          <span
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: MONUMENT,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatStageCount(summary.total, summary.onHoldTotal)} ·{" "}
            {formatOverviewCurrency(summary.valueTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * VIC + QLD overview columns.
 * @param {"summary"|"list"} viewMode
 */
export default function ProjectsOverviewColumns({ overview, viewMode = "summary" }) {
  const isList = viewMode === "list";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isList ? "column" : "row",
        gap: "24px",
        alignItems: "stretch",
        flexWrap: isList ? "nowrap" : "wrap",
      }}
    >
      {isList ? (
        <>
          <ListStateColumn title="VIC" accent={STREAM.vicBlue} summary={overview.VIC} />
          <ListStateColumn title="QLD" accent={STREAM.qldRed} summary={overview.QLD} />
        </>
      ) : (
        <>
          <SummaryStateColumn title="VIC" accent={STREAM.vicBlue} summary={overview.VIC} />
          <SummaryStateColumn title="QLD" accent={STREAM.qldRed} summary={overview.QLD} />
        </>
      )}
    </div>
  );
}
