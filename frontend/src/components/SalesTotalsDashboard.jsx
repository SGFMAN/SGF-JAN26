import React from "react";
import {
  SALES_TOTALS_GREEN_STREAMS,
  formatSalesTotalsCurrency,
  formatStreamName,
} from "../utils/salesTotalsCompute";

const MONUMENT = "#323233";
const WHITE = "#fff";

const TOTALS_CARD = {
  shell: {
    background: MONUMENT,
    borderRadius: "12px",
    padding: "20px",
    border: `2px solid ${MONUMENT}`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  headerBar: {
    padding: "10px 12px",
    borderRadius: "8px",
    marginBottom: "16px",
    textAlign: "center",
    fontWeight: 600,
    fontSize: "0.85rem",
    letterSpacing: "0.5px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    columnGap: "16px",
    rowGap: "12px",
    alignItems: "start",
  },
  label: { fontSize: "0.8rem", color: "#a1a1a3", marginBottom: "4px" },
  valueLg: { fontSize: "1.5rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 },
  valueMd: { fontSize: "1.15rem", fontWeight: 600, color: WHITE, lineHeight: 1.35 },
  valueProj: { fontSize: "1.35rem", fontWeight: 700, color: WHITE, lineHeight: 1.2 },
  colRight: { borderLeft: "1px solid #4a4d55", paddingLeft: "14px", minWidth: 0 },
  progressHint: {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 500,
    color: "#a1a1a3",
    marginTop: "3px",
    lineHeight: 1.35,
  },
  grandGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
    columnGap: "16px",
    alignItems: "start",
  },
  grandCol: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minWidth: 0,
  },
  grandColBorder: {
    borderLeft: "1px solid #4a4d55",
    paddingLeft: "14px",
  },
};

export default function SalesTotalsDashboard({
  data,
  selectedYear,
  periodLabel,
  streamColors,
  onStateClick,
}) {
  const {
    streamTotals,
    greenStreamsTotal,
    greenStreamsStateBreakdown,
    homeOfficeStudioTotal,
    stateTotals,
    grandTotal,
    calendarYearMeta,
    projectedSgfVicValue,
    projectedSgfQldValue,
    projectedGreenStreamsValue,
    projectedVicStateValue,
    projectedQldStateValue,
    projectedYearEndValue,
    projectedYearEndSales,
  } = data;

  const formatCurrency = formatSalesTotalsCurrency;
  const progressPeriodTotal = calendarYearMeta?.daysInMonth ?? calendarYearMeta?.daysInYear;
  const yearDisplay = periodLabel ?? selectedYear;

  const stateCardProps = (state) =>
    onStateClick
      ? {
          role: "button",
          tabIndex: 0,
          onClick: () => onStateClick(state),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") onStateClick(state);
          },
          style: { ...TOTALS_CARD.shell, cursor: "pointer" },
        }
      : { style: TOTALS_CARD.shell };

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: "16px",
        }}
      >
        {["SGF - VIC", "SGF - QLD"].map((stream) => {
          const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
          const colors = streamColors[stream];
          const projected =
            stream === "SGF - VIC" ? projectedSgfVicValue : projectedSgfQldValue;
          const names = formatStreamName(stream);
          return (
            <div
              key={stream}
              style={{
                background: colors.lighter,
                borderRadius: "12px",
                padding: "16px",
                border: `2px solid ${colors.darker}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  background: colors.darker,
                  color: WHITE,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  marginBottom: "12px",
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: "1.5rem",
                  letterSpacing: "0.5px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  minHeight: "40px",
                  lineHeight: "1.2",
                }}
              >
                <div>{names.line1}</div>
                <div>{names.line2}</div>
              </div>
              <div style={{ flex: 1, marginBottom: "12px" }}>
                <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Sales Count</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>{totals.salesCount}</div>
              </div>
              <div style={{ marginTop: "auto", borderTop: `1px solid ${colors.darker}`, paddingTop: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Total Value</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                      {formatCurrency(totals.totalCost)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Projected</div>
                    <div style={{ fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}>
                      {projected != null ? formatCurrency(projected) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div
          style={{
            background: "#CEEAB0",
            borderRadius: "12px",
            padding: "16px",
            border: "2px solid #92D050",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "#92D050",
              color: WHITE,
              padding: "10px 12px",
              borderRadius: "8px",
              marginBottom: "12px",
              textAlign: "center",
              fontWeight: 600,
              fontSize: "1.5rem",
              minHeight: "40px",
              lineHeight: "1.2",
            }}
          >
            GREEN STREAMS
          </div>
          <div style={{ flex: 1, marginBottom: "12px" }}>
            <div
              style={{
                fontSize: "0.8rem",
                color: "#32323399",
                marginBottom: "4px",
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span>Sales Count</span>
              <span>VIC / QLD</span>
            </div>
            <div
              style={{
                fontSize: "1.3rem",
                fontWeight: 700,
                color: MONUMENT,
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span>{greenStreamsTotal.salesCount}</span>
              <span style={{ fontSize: "1rem" }}>
                {greenStreamsStateBreakdown.vic} / {greenStreamsStateBreakdown.qld}
              </span>
            </div>
            {SALES_TOTALS_GREEN_STREAMS.map((stream) => {
              const totals = streamTotals[stream] || { salesCount: 0, totalCost: 0 };
              return (
                <div
                  key={stream}
                  style={{
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    padding: "3px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8px",
                  }}
                >
                  <span style={{ minWidth: 0 }}>{stream}</span>
                  <span>{totals.salesCount}</span>
                  <span>{formatCurrency(totals.totalCost)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: "auto", borderTop: "1px solid #92D050", paddingTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Total Value</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
                  {formatCurrency(greenStreamsTotal.totalCost)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Projected</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: MONUMENT }}>
                  {projectedGreenStreamsValue != null ? formatCurrency(projectedGreenStreamsValue) : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#FFD4B3",
            borderRadius: "12px",
            padding: "16px",
            border: "2px solid #FF8C42",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: "#FF8C42",
              color: WHITE,
              padding: "10px 12px",
              borderRadius: "8px",
              marginBottom: "12px",
              textAlign: "center",
              fontWeight: 600,
              fontSize: "1.5rem",
              minHeight: "40px",
            }}
          >
            HOME OFFICE
          </div>
          <div style={{ flex: 1, marginBottom: "12px" }}>
            <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Sales Count</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
              {homeOfficeStudioTotal.salesCount}
            </div>
          </div>
          <div style={{ marginTop: "auto", borderTop: "1px solid #FF8C42", paddingTop: "12px" }}>
            <div style={{ fontSize: "0.8rem", color: "#32323399", marginBottom: "4px" }}>Total Value</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: MONUMENT }}>
              {formatCurrency(homeOfficeStudioTotal.totalCost)}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          minWidth: 0,
          alignItems: "stretch",
          marginTop: "16px",
        }}
      >
        <div {...stateCardProps("VIC")}>
          <div style={{ ...TOTALS_CARD.headerBar, background: "#4D93D9", color: WHITE }}>VIC TOTAL</div>
          <div style={TOTALS_CARD.grid}>
            <div>
              <div style={TOTALS_CARD.label}>Total Sales</div>
              <div style={TOTALS_CARD.valueLg}>{stateTotals.VIC.salesCount}</div>
            </div>
            <div style={TOTALS_CARD.colRight}>
              <div style={TOTALS_CARD.label}>Average price</div>
              <div style={TOTALS_CARD.valueMd}>{formatCurrency(stateTotals.VIC.averagePrice)}</div>
            </div>
            <div>
              <div style={TOTALS_CARD.label}>Total Value</div>
              <div style={TOTALS_CARD.valueLg}>{formatCurrency(stateTotals.VIC.totalCost)}</div>
            </div>
            <div style={TOTALS_CARD.colRight}>
              <div style={TOTALS_CARD.label}>Projected year-end value</div>
              {!calendarYearMeta || calendarYearMeta.mode === "future" ? (
                <div style={TOTALS_CARD.valueProj}>—</div>
              ) : (
                <div style={TOTALS_CARD.valueProj}>
                  {projectedVicStateValue != null ? formatCurrency(projectedVicStateValue) : "—"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div {...stateCardProps("QLD")}>
          <div style={{ ...TOTALS_CARD.headerBar, background: "#D54358", color: WHITE }}>QLD TOTAL</div>
          <div style={TOTALS_CARD.grid}>
            <div>
              <div style={TOTALS_CARD.label}>Total Sales</div>
              <div style={TOTALS_CARD.valueLg}>{stateTotals.QLD.salesCount}</div>
            </div>
            <div style={TOTALS_CARD.colRight}>
              <div style={TOTALS_CARD.label}>Average price</div>
              <div style={TOTALS_CARD.valueMd}>{formatCurrency(stateTotals.QLD.averagePrice)}</div>
            </div>
            <div>
              <div style={TOTALS_CARD.label}>Total Value</div>
              <div style={TOTALS_CARD.valueLg}>{formatCurrency(stateTotals.QLD.totalCost)}</div>
            </div>
            <div style={TOTALS_CARD.colRight}>
              <div style={TOTALS_CARD.label}>Projected year-end value</div>
              {!calendarYearMeta || calendarYearMeta.mode === "future" ? (
                <div style={TOTALS_CARD.valueProj}>—</div>
              ) : (
                <div style={TOTALS_CARD.valueProj}>
                  {projectedQldStateValue != null ? formatCurrency(projectedQldStateValue) : "—"}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={TOTALS_CARD.shell}>
          <div
            style={{
              ...TOTALS_CARD.headerBar,
              background: "linear-gradient(90deg, #4D93D9 0%, #2ca84a 28%, #e6c619 56%, #e85d04 100%)",
              color: WHITE,
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            }}
          >
            GRAND TOTAL
          </div>
          <div style={TOTALS_CARD.grandGrid}>
            <div style={TOTALS_CARD.grandCol}>
              <div>
                <div style={TOTALS_CARD.label}>Year</div>
                <div style={TOTALS_CARD.valueMd}>{yearDisplay}</div>
              </div>
              <div>
                <div style={TOTALS_CARD.label}>Progress</div>
                {!calendarYearMeta ? (
                  <div style={{ ...TOTALS_CARD.valueMd, opacity: 0.85 }}>—</div>
                ) : calendarYearMeta.mode === "future" ? (
                  <div style={{ ...TOTALS_CARD.valueMd, opacity: 0.85 }}>Not started</div>
                ) : (
                  <div style={TOTALS_CARD.valueMd}>
                    {calendarYearMeta.percentThrough}%
                    <span style={TOTALS_CARD.progressHint}>
                      Day {calendarYearMeta.daysElapsed} of {progressPeriodTotal}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ ...TOTALS_CARD.grandCol, ...TOTALS_CARD.grandColBorder }}>
              <div>
                <div style={TOTALS_CARD.label}>Total Sales</div>
                <div style={TOTALS_CARD.valueLg}>{grandTotal.totalSales}</div>
              </div>
              <div>
                <div style={TOTALS_CARD.label}>Total Value</div>
                <div style={TOTALS_CARD.valueLg}>{formatCurrency(grandTotal.totalCost)}</div>
              </div>
            </div>
            <div style={{ ...TOTALS_CARD.grandCol, ...TOTALS_CARD.grandColBorder }}>
              <div>
                <div style={TOTALS_CARD.label}>Projected Sales</div>
                {!calendarYearMeta || calendarYearMeta.mode === "future" ? (
                  <div style={{ ...TOTALS_CARD.valueProj, opacity: 0.85 }}>—</div>
                ) : (
                  <div style={TOTALS_CARD.valueProj}>
                    {projectedYearEndSales != null ? projectedYearEndSales : "—"}
                  </div>
                )}
              </div>
              <div>
                <div style={TOTALS_CARD.label}>Projected Value</div>
                {!calendarYearMeta || calendarYearMeta.mode === "future" ? (
                  <div style={{ ...TOTALS_CARD.valueProj, opacity: 0.85 }}>—</div>
                ) : (
                  <div style={TOTALS_CARD.valueProj}>
                    {projectedYearEndValue != null ? formatCurrency(projectedYearEndValue) : "—"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
