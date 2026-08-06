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

function ListStateColumn({
  title,
  accent,
  summary,
  showTotal = true,
  continuation = false,
  compact = false,
}) {
  const cardPadding = compact ? "14px 16px" : "22px 24px";
  const stageGap = compact ? "10px" : "16px";
  const titleSize = compact ? "1.15rem" : "1.35rem";
  const projectSize = compact ? "0.78rem" : "0.82rem";
  const projectPad = compact ? "1px 0" : "2px 0";

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        background: WHITE,
        borderRadius: compact ? "10px" : "14px",
        border: `1px solid ${UI.outline}`,
        boxShadow: compact ? "none" : "0 2px 12px rgba(0,0,0,0.06)",
        padding: cardPadding,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          marginBottom: compact ? "10px" : "16px",
          paddingBottom: compact ? "6px" : "10px",
          borderBottom: `2px solid ${accent}`,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: titleSize,
            fontWeight: 700,
            color: MONUMENT,
            letterSpacing: "0.5px",
          }}
        >
          {title}
          {continuation ? (
            <span style={{ fontWeight: 500, fontSize: "0.9rem", marginLeft: "8px", color: UI.textMuted }}>
              (continued)
            </span>
          ) : null}
        </h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: stageGap }}>
        {(summary?.stages || []).map((stage) => (
          <div key={stage.key}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "12px",
                marginBottom: compact ? "2px" : "4px",
                paddingBottom: compact ? "2px" : "4px",
                borderBottom: `1px solid ${UI.outline}`,
              }}
            >
              <span style={{ fontSize: compact ? "0.85rem" : "0.9rem", fontWeight: 700, color: MONUMENT }}>
                {stage.label}
              </span>
              <span
                style={{
                  fontSize: compact ? "0.75rem" : "0.8rem",
                  fontWeight: 600,
                  color: UI.textMuted,
                  whiteSpace: "nowrap",
                }}
              >
                {formatStageCount(stage.total, stage.onHold)} · {formatOverviewCurrency(stage.value)}
              </span>
            </div>

            {stage.projects.length === 0 ? (
              <div style={{ padding: "2px 0 0", fontSize: projectSize, color: UI.textMuted }}>
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
                      padding: projectPad,
                      lineHeight: compact ? 1.25 : 1.35,
                    }}
                  >
                    <span
                      style={{
                        fontSize: projectSize,
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
                            fontSize: "0.7rem",
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
                        fontSize: projectSize,
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

        {showTotal ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "12px",
              marginTop: "2px",
              paddingTop: compact ? "8px" : "10px",
              borderTop: `2px solid ${accent}`,
            }}
          >
            <span style={{ fontSize: compact ? "0.9rem" : "0.95rem", fontWeight: 700, color: MONUMENT }}>
              TOTAL
            </span>
            <span
              style={{
                fontSize: compact ? "0.9rem" : "0.95rem",
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
        ) : null}
      </div>
    </div>
  );
}

/** Single state list card for PDF page assembly. */
export function ProjectsOverviewListStatePage({
  title,
  accent,
  summary,
  showTotal = true,
  continuation = false,
  compact = true,
}) {
  return (
    <ListStateColumn
      title={title}
      accent={accent}
      summary={summary}
      showTotal={showTotal}
      continuation={continuation}
      compact={compact}
    />
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
