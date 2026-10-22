import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import {
  combineSpecCounts,
  computeSalesBreakdowns,
  sumBreakdownRows,
} from "../utils/salesBreakdownsCompute";
import { formatSalesTotalsCurrency, getAvailableCalendarYears } from "../utils/salesTotalsCompute";
import { UI, MENU, STREAM } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const STATE_STYLE = {
  VIC: { color: STREAM.vicBlue, bg: STREAM.vicBlueLight },
  QLD: { color: STREAM.qldRed, bg: STREAM.qldRedLight },
};

const COUNT_GROUPS = [
  { key: "VIC", label: "VIC" },
  { key: "QLD", label: "QLD" },
  { key: "total", label: "Totals" },
];

function countForGroup(rowOrTotals, key) {
  if (key === "total") return combineSpecCounts(rowOrTotals.VIC, rowOrTotals.QLD);
  return rowOrTotals[key];
}

function percentOf(part, whole) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function withPercent(part, whole) {
  return `${part} (${percentOf(part, whole)})`;
}

function money(amount) {
  return formatSalesTotalsCurrency(amount);
}

function CountBlock({ counts, columnTotal }) {
  const whole = counts.total;
  const lineStyle = { lineHeight: 1.15 };
  return (
    <div style={lineStyle}>
      <div style={{ fontWeight: 700 }}>
        {withPercent(counts.total, columnTotal)} {money(counts.totalValue)}
      </div>
      <div>affordable: {withPercent(counts.affordable, whole)} {money(counts.affordableValue)}</div>
      <div>superior: {withPercent(counts.superior, whole)} {money(counts.superiorValue)}</div>
      <div>unspecified: {withPercent(counts.unspecified, whole)} {money(counts.unspecifiedValue)}</div>
    </div>
  );
}

export default function SalesBreakdowns() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [disabledLabels, setDisabledLabels] = useState(() => new Set());

  useEffect(() => {
    void loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      console.error("Error loading sales breakdowns:", err);
    } finally {
      setLoading(false);
    }
  }

  const availableYears = useMemo(() => {
    const years = new Set(getAvailableCalendarYears(projects));
    years.add(new Date().getFullYear().toString());
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const breakdown = useMemo(
    () => (selectedYear ? computeSalesBreakdowns(projects, selectedYear) : null),
    [projects, selectedYear]
  );

  const tableRows = useMemo(
    () => (breakdown ? [...breakdown.rows, ...breakdown.extraRows] : []),
    [breakdown]
  );

  const includedRows = useMemo(
    () => tableRows.filter((row) => !disabledLabels.has(row.label)),
    [tableRows, disabledLabels]
  );

  const totals = useMemo(() => sumBreakdownRows(includedRows), [includedRows]);

  function toggleLabel(label) {
    setDisabledLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const cellPad = "2px 6px";

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          margin: "6px auto 4px auto",
          width: "calc(100vw - 48px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 24px",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "24px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "72px", height: "auto" }} />
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: "1.35rem",
            fontWeight: 700,
            color: PAGE_TEXT,
            letterSpacing: "1px",
          }}
        >
          Breakdowns
        </h1>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 48px)",
          maxWidth: "100%",
          margin: "0 auto 8px auto",
          gap: "20px",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "20px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1 }} />
          <div
            style={{
              background: MENU.red,
              borderRadius: "10px",
              padding: "4px",
              border: `1px solid ${UI.outline}`,
            }}
          >
            <Link
              to="/sales-totals"
              style={{
                background: "transparent",
                color: UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              ← Back to Totals
            </Link>
          </div>
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "8px 10px",
            boxSizing: "border-box",
            overflow: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexShrink: 0 }}>
            <label htmlFor="breakdown-year" style={{ fontSize: "0.95rem", fontWeight: 600, color: MONUMENT }}>
              Year
            </label>
            <select
              id="breakdown-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.95rem",
                fontWeight: 500,
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {loading && <p style={{ color: MONUMENT, margin: 0 }}>Loading…</p>}
          {error && <p style={{ color: "#cc3333", margin: 0 }}>Error: {error}</p>}

          {!loading && !error && breakdown && (
            <div
              style={{
                width: "100%",
                background: WHITE,
                borderRadius: "12px",
                border: `1px solid ${UI.outline}`,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: cellPad,
                        fontWeight: 600,
                        fontSize: "0.78rem",
                        color: MONUMENT,
                        background: WHITE,
                        borderBottom: `1px solid ${UI.outline}`,
                        width: "22%",
                      }}
                    >
                      Classification
                    </th>
                    {COUNT_GROUPS.map((group) => {
                      const tone = STATE_STYLE[group.key];
                      return (
                        <th
                          key={group.key}
                          style={{
                            textAlign: "left",
                            padding: cellPad,
                            fontWeight: 700,
                            fontSize: "0.78rem",
                            color: tone ? tone.color : MONUMENT,
                            background: tone ? tone.bg : WHITE,
                            borderBottom: `1px solid ${UI.outline}`,
                            borderLeft: `1px solid ${UI.outline}`,
                          }}
                        >
                          {group.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => {
                    const included = !disabledLabels.has(row.label);
                    return (
                      <tr
                        key={row.label}
                        style={{
                          borderBottom: `1px solid ${UI.outline}`,
                          opacity: included ? 1 : 0.4,
                        }}
                      >
                        <td style={{ padding: cellPad, color: MONUMENT }}>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              cursor: "pointer",
                              margin: 0,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => toggleLabel(row.label)}
                              style={{ width: "15px", height: "15px", margin: 0, cursor: "pointer" }}
                            />
                            <span>{row.label}</span>
                          </label>
                        </td>
                        {COUNT_GROUPS.map((group) => {
                          const counts = countForGroup(row, group.key);
                          const columnTotal = countForGroup(totals, group.key).total;
                          const tone = STATE_STYLE[group.key];
                          return (
                            <td
                              key={`${row.label}-${group.key}`}
                              style={{
                                padding: cellPad,
                                textAlign: "left",
                                fontVariantNumeric: "tabular-nums",
                                color: tone ? tone.color : MONUMENT,
                                borderLeft: `1px solid ${UI.outline}`,
                              }}
                            >
                              <CountBlock counts={counts} columnTotal={columnTotal} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr style={{ background: WHITE, borderTop: `2px solid ${UI.outline}` }}>
                    <td style={{ padding: cellPad, fontWeight: 700, color: MONUMENT }}>Total</td>
                    {COUNT_GROUPS.map((group) => {
                      const counts = countForGroup(totals, group.key);
                      const tone = STATE_STYLE[group.key];
                      return (
                        <td
                          key={`total-${group.key}`}
                          style={{
                            padding: cellPad,
                            textAlign: "left",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: 700,
                            color: tone ? tone.color : MONUMENT,
                            borderLeft: `1px solid ${UI.outline}`,
                          }}
                        >
                          <CountBlock counts={counts} columnTotal={counts.total} />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
