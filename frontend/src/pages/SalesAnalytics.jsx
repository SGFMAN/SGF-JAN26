import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";
import {
  computeMonthlySalesBreakdown,
  computePieValueBreakdown,
  computePreviousPeriodMonthlyBreakdown,
  filterAnalyticsProjectsByPeriod,
} from "../utils/salesAnalyticsCompute";
import {
  formatPreviousPeriodLabel,
  formatSalesTotalsPeriodLabel,
  getAvailableCalendarYears,
  getAvailableFinancialYears,
  getCurrentFinancialYearEnd,
  getCurrentPeriodSlotIndex,
  getEffectivePeriodMonthIndexForSlot,
  getPreviousPeriodKey,
  isCurrentPeriod,
  SALES_YEAR_VIEW,
} from "../utils/salesTotalsCompute";

import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

// Stream color mapping
const STREAM_COLORS = {
  "SGF - VIC": { darker: "#4D93D9", lighter: "#A6C9EC" },
  "SGF - QLD": { darker: "#D54358", lighter: "#F79198" },
  "Green Streams": { darker: "#92D050", lighter: "#CEEAB0" },
};

// Green streams (for total calculation)
const GREEN_STREAMS = [
  "Dual Dwelling",
  "ATA",
  "Pumped On Property",
  "Henderson",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

const SALES_ANALYTICS_MONTHLY_TARGETS_KEY = "sgf_salesAnalytics_monthlyTargets_v1";
const DEFAULT_MONTHLY_SALES_TARGETS = { vic: 10, qld: 10, greenStreams: 6 };

function clampMonthlyTargetInt(value, fallback) {
  const v = typeof value === "number" ? value : parseInt(String(value), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(999, Math.round(v)));
}

function readStoredMonthlyTargets() {
  if (typeof window === "undefined") return { ...DEFAULT_MONTHLY_SALES_TARGETS };
  try {
    const raw = localStorage.getItem(SALES_ANALYTICS_MONTHLY_TARGETS_KEY);
    if (!raw) return { ...DEFAULT_MONTHLY_SALES_TARGETS };
    const p = JSON.parse(raw);
    return {
      vic: clampMonthlyTargetInt(p.vic, DEFAULT_MONTHLY_SALES_TARGETS.vic),
      qld: clampMonthlyTargetInt(p.qld, DEFAULT_MONTHLY_SALES_TARGETS.qld),
      greenStreams: clampMonthlyTargetInt(p.greenStreams, DEFAULT_MONTHLY_SALES_TARGETS.greenStreams),
    };
  } catch {
    return { ...DEFAULT_MONTHLY_SALES_TARGETS };
  }
}
/** Target outlines: darker than bar fills (#4D93D9, #D54358, #92D050) */
const TARGET_OUTLINE_COLORS = {
  vic: "#2A5588",
  qld: "#8B2635",
  greenStreams: "#4A7020",
};

/** Space reserved above each target / adjusted outline for the integer label */
const TARGET_OVERLAY_LABEL_ROW_PX = 17;

/** Previous-year comparison line on Rates chart (matches pie ghost outline) */
const RATES_LAST_YEAR_YELLOW = "#FFD54F";

/**
 * Annual target = basePerMonth × 12.
 * YTD = actual sold from Jan through the effective month (inclusive).
 * Pace = (annual − YTD) ÷ months after the effective month. Can be **below** basePerMonth
 * when ahead on the year, or negative if already past annual — callers clamp for display.
 * December: returns remaining jobs for the month (annual − YTD), not divided.
 */
function adjustedPaceFromYtd(basePerMonth, effectiveMonthIndexZeroBased, ytdActualThroughEffectiveMonth) {
  const yearlyTarget = basePerMonth * 12;
  const remainingNeed = yearlyTarget - ytdActualThroughEffectiveMonth;
  const monthsAfterThis = 12 - (effectiveMonthIndexZeroBased + 1);
  if (monthsAfterThis > 0) {
    return remainingNeed / monthsAfterThis;
  }
  return remainingNeed;
}

/**
 * Planned: straight line (0,0) → (12 mo, combinedAnnualTargetJobs).
 * Actual: straight line from origin with slope = cumulative jobs to date ÷ months elapsed (×12 for year-end read).
 */
function CumulativeRatesLineChart({
  monthlyData,
  selectedYear,
  yearView,
  previousPeriodLabel,
  combinedMonthlyTargetJobs,
  combinedAnnualTargetJobs,
  includeVic = true,
  includeQld = true,
  includeGreen = true,
  chartTitle = "Cumulative jobs (VIC + QLD + Green streams)",
  previousYearMonthlyData,
  showLastYearRates = false,
}) {
  const isPeriodCurrent = isCurrentPeriod(selectedYear, yearView);
  const effectiveMonthIndex = isPeriodCurrent ? getCurrentPeriodSlotIndex(selectedYear, yearView) : 11;

  const monthsElapsed = Math.max(1, effectiveMonthIndex + 1);
  let ytdVic = 0;
  let ytdQld = 0;
  let ytdGreen = 0;
  for (let j = 0; j <= effectiveMonthIndex; j++) {
    const row = monthlyData[j];
    if (!row) continue;
    ytdVic += row.vicSalesCount;
    ytdQld += row.qldSalesCount;
    ytdGreen += row.greenStreamSalesCount;
  }

  const monthJobCount = (m) =>
    (includeVic ? m.vicSalesCount : 0) +
    (includeQld ? m.qldSalesCount : 0) +
    (includeGreen ? m.greenStreamSalesCount : 0);

  let running = 0;
  const cumThroughEachMonth = monthlyData.map((m) => {
    running += monthJobCount(m);
    return running;
  });
  const cumThroughEffective = cumThroughEachMonth[effectiveMonthIndex] ?? 0;
  const projectedYearEndActual = (cumThroughEffective / monthsElapsed) * 12;

  const prevMonthJobCount = (m) =>
    m
      ? (includeVic ? m.vicSalesCount : 0) +
        (includeQld ? m.qldSalesCount : 0) +
        (includeGreen ? m.greenStreamSalesCount : 0)
      : 0;
  let prevRun = 0;
  const prevCumThroughMonth =
    Array.isArray(previousYearMonthlyData) && previousYearMonthlyData.length === 12
      ? previousYearMonthlyData.map((m) => {
          prevRun += prevMonthJobCount(m);
          return prevRun;
        })
      : [];
  const prevYearTotalJobs = prevCumThroughMonth[11] ?? 0;
  const prevYearLabel = previousPeriodLabel;

  const pad = { t: 52, r: 40, b: 58, l: 72 };
  const svgW = 1080;
  const svgH = 560;
  const innerW = svgW - pad.l - pad.r;
  const innerH = svgH - pad.t - pad.b;
  const maxYAxis = Math.max(
    80,
    Math.ceil(
      Math.max(
        combinedAnnualTargetJobs,
        projectedYearEndActual,
        cumThroughEffective,
        showLastYearRates ? prevYearTotalJobs : 0
      ) / 40
    ) * 40
  );
  const yStep = maxYAxis <= 120 ? 20 : maxYAxis <= 240 ? 40 : 60;

  const xAt = (month /* 0..12 */) => pad.l + (month / 12) * innerW;
  const yAt = (jobs) => pad.t + innerH - (Math.min(Math.max(0, jobs), maxYAxis) / maxYAxis) * innerH;

  const baselineY = yAt(0);

  const ratesAreaColors = {
    vic: STREAM_COLORS["SGF - VIC"].darker,
    qld: STREAM_COLORS["SGF - QLD"].darker,
    green: STREAM_COLORS["Green Streams"].darker,
  };

  /** Bottom → top: Green, QLD, VIC (matches bar stack order). Each layer is a solid triangle under that stream's projected slope. */
  const actualShadeLayers = [];
  const stackSpec = [
    includeGreen && { key: "green", color: ratesAreaColors.green, ytd: ytdGreen },
    includeQld && { key: "qld", color: ratesAreaColors.qld, ytd: ytdQld },
    includeVic && { key: "vic", color: ratesAreaColors.vic, ytd: ytdVic },
  ].filter(Boolean);

  let cumLower = 0;
  for (const s of stackSpec) {
    const proj = (s.ytd / monthsElapsed) * 12;
    const cumUpper = cumLower + proj;
    if (cumUpper - cumLower > 0.001) {
      actualShadeLayers.push({
        key: s.key,
        color: s.color,
        cumLower,
        cumUpper,
      });
    }
    cumLower = cumUpper;
  }

  const showActualAreaShade =
    actualShadeLayers.length > 0 &&
    projectedYearEndActual > 0 &&
    yAt(projectedYearEndActual) < baselineY - 0.5;

  const gridLines = [];
  for (let g = 0; g <= maxYAxis; g += yStep) {
    const y = yAt(g);
    gridLines.push(
      <line
        key={g}
        x1={pad.l}
        y1={y}
        x2={svgW - pad.r}
        y2={y}
        stroke="#d0d0d0"
        strokeOpacity={0.65}
        strokeWidth={1}
      />
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: "1200px" }}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        style={{ display: "block", maxHeight: "600px" }}
        role="img"
        aria-label="Cumulative planned versus actual run rate"
      >
        {gridLines}
        <line
          x1={pad.l}
          y1={svgH - pad.b}
          x2={svgW - pad.r}
          y2={svgH - pad.b}
          stroke={MONUMENT}
          strokeOpacity={0.35}
          strokeWidth={1.5}
        />
        {showActualAreaShade &&
          actualShadeLayers.map((layer) => (
            <polygon
              key={layer.key}
              points={`${xAt(0)},${yAt(0)} ${xAt(12)},${yAt(layer.cumLower)} ${xAt(12)},${yAt(layer.cumUpper)}`}
              fill={layer.color}
              fillOpacity={0.42}
              stroke="none"
            />
          ))}
        {showLastYearRates &&
          prevYearTotalJobs > 0.5 &&
          yAt(prevYearTotalJobs) < baselineY - 0.5 && (
            <>
              <line
                x1={xAt(0)}
                y1={yAt(0)}
                x2={xAt(12)}
                y2={yAt(prevYearTotalJobs)}
                stroke={RATES_LAST_YEAR_YELLOW}
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle
                cx={xAt(12)}
                cy={yAt(prevYearTotalJobs)}
                r={5.5}
                fill={RATES_LAST_YEAR_YELLOW}
                stroke={MONUMENT}
                strokeOpacity={0.28}
                strokeWidth={1.25}
              />
            </>
          )}
        <line
          x1={xAt(0)}
          y1={yAt(0)}
          x2={xAt(12)}
          y2={yAt(combinedAnnualTargetJobs)}
          stroke="#7B68A8"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <line
          x1={xAt(0)}
          y1={yAt(0)}
          x2={xAt(12)}
          y2={yAt(projectedYearEndActual)}
          stroke="#4D93D9"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <circle
          cx={xAt(12)}
          cy={yAt(combinedAnnualTargetJobs)}
          r={6}
          fill="#7B68A8"
          stroke={WHITE}
          strokeWidth={1.5}
        />
        <circle
          cx={xAt(12)}
          cy={yAt(projectedYearEndActual)}
          r={6}
          fill="#4D93D9"
          stroke={WHITE}
          strokeWidth={1.5}
        />
        {monthlyData.map((m, i) => (
          <text
            key={`${m.name}-${i}`}
            x={xAt(i + 0.5)}
            y={svgH - pad.b + 34}
            textAnchor="middle"
            fontSize="11"
            fontWeight={700}
            fill={MONUMENT}
          >
            {m.name.substring(0, 3)}
          </text>
        ))}
        {Array.from({ length: Math.floor(maxYAxis / yStep) + 1 }, (_, j) => {
          const g = j * yStep;
          return (
            <text
              key={`yl-${g}`}
              x={pad.l - 10}
              y={yAt(g) + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight={600}
              fill={MONUMENT}
            >
              {g}
            </text>
          );
        })}
        <text x={pad.l + innerW / 2} y={34} textAnchor="middle" fontSize="15" fontWeight={700} fill={MONUMENT}>
          {chartTitle}
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "28px",
          justifyContent: "center",
          marginTop: "14px",
          fontSize: "0.88rem",
          fontWeight: 600,
          color: MONUMENT,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: 36, height: 4, background: "#7B68A8", borderRadius: 2 }} />
          Planned — {combinedAnnualTargetJobs} jobs / yr ({combinedMonthlyTargetJobs}/mo × 12)
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: 36, height: 4, background: "#4D93D9", borderRadius: 2 }} />
          Actual run rate — YTD {cumThroughEffective} jobs over {monthsElapsed} mo → slope to{" "}
          {Math.round(projectedYearEndActual)} projected / yr
        </div>
        {showLastYearRates && prevYearTotalJobs > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ width: 36, height: 4, background: RATES_LAST_YEAR_YELLOW, borderRadius: 2 }} />
            Last year ({prevYearLabel}) — {prevYearTotalJobs} jobs (full year actual, same streams)
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalesAnalytics() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => {
    return new Date().getFullYear().toString();
  });
  const [yearView, setYearView] = useState(SALES_YEAR_VIEW.CALENDAR);
  const [selectedView, setSelectedView] = useState("bar"); // "bar" | "pie" | "rates" | "targets"
  const [showLastYearOutline, setShowLastYearOutline] = useState(true);
  const [showMonthlyTargets, setShowMonthlyTargets] = useState(false);
  const [showAdjustedTargets, setShowAdjustedTargets] = useState(false);
  const [showBarVic, setShowBarVic] = useState(true);
  const [showBarQld, setShowBarQld] = useState(true);
  const [showBarGreen, setShowBarGreen] = useState(true);
  const [monthlySalesTargets, setMonthlySalesTargets] = useState(readStoredMonthlyTargets);
  const [ratesIncludeVic, setRatesIncludeVic] = useState(true);
  const [ratesIncludeQld, setRatesIncludeQld] = useState(true);
  const [ratesIncludeGreen, setRatesIncludeGreen] = useState(true);
  const [ratesShowLastYear, setRatesShowLastYear] = useState(true);

  const combinedMonthlyTargetJobs = React.useMemo(
    () =>
      monthlySalesTargets.vic + monthlySalesTargets.qld + monthlySalesTargets.greenStreams,
    [monthlySalesTargets]
  );
  const combinedAnnualTargetJobs = combinedMonthlyTargetJobs * 12;

  const ratesChartMonthlyTargetJobs = React.useMemo(
    () =>
      (ratesIncludeVic ? monthlySalesTargets.vic : 0) +
      (ratesIncludeQld ? monthlySalesTargets.qld : 0) +
      (ratesIncludeGreen ? monthlySalesTargets.greenStreams : 0),
    [monthlySalesTargets, ratesIncludeVic, ratesIncludeQld, ratesIncludeGreen]
  );
  const ratesChartAnnualTargetJobs = ratesChartMonthlyTargetJobs * 12;

  const ratesChartTitle = React.useMemo(() => {
    const parts = [
      ratesIncludeVic && "VIC",
      ratesIncludeQld && "QLD",
      ratesIncludeGreen && "Green streams",
    ].filter(Boolean);
    if (parts.length === 0) return "Cumulative jobs (no region selected)";
    return `Cumulative jobs (${parts.join(" + ")})`;
  }, [ratesIncludeVic, ratesIncludeQld, ratesIncludeGreen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SALES_ANALYTICS_MONTHLY_TARGETS_KEY, JSON.stringify(monthlySalesTargets));
    } catch (e) {
      console.error("Failed to save sales analytics monthly targets:", e);
    }
  }, [monthlySalesTargets]);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      // Exclude Hotlist status projects
      const filteredData = data.filter((project) => project.status !== "Hotlist");
      setProjects(filteredData);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  const availableCalendarYears = React.useMemo(
    () => getAvailableCalendarYears(projects),
    [projects]
  );

  const availableFinancialYears = React.useMemo(
    () => getAvailableFinancialYears(projects),
    [projects]
  );

  const availablePeriods =
    yearView === SALES_YEAR_VIEW.FINANCIAL ? availableFinancialYears : availableCalendarYears;

  const periodLabel = formatSalesTotalsPeriodLabel(selectedYear, yearView);
  const previousPeriodLabel = formatPreviousPeriodLabel(selectedYear, yearView);

  React.useEffect(() => {
    if (availablePeriods.length === 0) return;
    if (!availablePeriods.includes(selectedYear)) {
      setSelectedYear(availablePeriods[0]);
    }
  }, [availablePeriods, selectedYear]);

  const yearFilteredProjects = React.useMemo(
    () => filterAnalyticsProjectsByPeriod(projects, selectedYear, yearView),
    [projects, selectedYear, yearView]
  );

  const pieValueBreakdown = React.useMemo(
    () => computePieValueBreakdown(yearFilteredProjects),
    [yearFilteredProjects]
  );

  const previousYearPieData = React.useMemo(() => {
    const prevProjects = filterAnalyticsProjectsByPeriod(
      projects,
      getPreviousPeriodKey(selectedYear, yearView),
      yearView
    );
    return computePieValueBreakdown(prevProjects);
  }, [projects, selectedYear, yearView]);

  const monthlyData = React.useMemo(
    () => computeMonthlySalesBreakdown(yearFilteredProjects, selectedYear, yearView),
    [yearFilteredProjects, selectedYear, yearView]
  );

  const previousYearData = React.useMemo(
    () => computePreviousPeriodMonthlyBreakdown(projects, selectedYear, yearView),
    [projects, selectedYear, yearView]
  );

  const pieData = React.useMemo(() => {
    const { vic, qld, green, total } = pieValueBreakdown;
    return [
      {
        name: "SGF - VIC",
        value: vic,
        percentage: total > 0 ? (vic / total) * 100 : 0,
        color: STREAM_COLORS["SGF - VIC"].darker,
      },
      {
        name: "SGF - QLD",
        value: qld,
        percentage: total > 0 ? (qld / total) * 100 : 0,
        color: STREAM_COLORS["SGF - QLD"].darker,
      },
      {
        name: "Green Streams",
        value: green,
        percentage: total > 0 ? (green / total) * 100 : 0,
        color: STREAM_COLORS["Green Streams"].darker,
      },
    ];
  }, [pieValueBreakdown]);

  // Format number with commas
  function formatCurrency(amount) {
    if (!amount || amount === 0) return "$0";
    return `$${amount.toLocaleString()}`;
  }

  // Calculate pie chart path
  function getPieSlicePath(data, index) {
    const centerX = 200;
    const centerY = 200;
    const radius = 150;
    
    let startAngle = 0;
    for (let i = 0; i < index; i++) {
      startAngle += (data[i].percentage / 100) * 360;
    }
    
    const sliceAngle = (data[index].percentage / 100) * 360;
    const endAngle = startAngle + sliceAngle;
    
    const startAngleRad = (startAngle - 90) * (Math.PI / 180);
    const endAngleRad = (endAngle - 90) * (Math.PI / 180);
    
    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);
    
    const largeArcFlag = sliceAngle > 180 ? 1 : 0;
    
    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  }

  function handleYearViewToggle() {
    setYearView((prev) => {
      const next =
        prev === SALES_YEAR_VIEW.CALENDAR ? SALES_YEAR_VIEW.FINANCIAL : SALES_YEAR_VIEW.CALENDAR;
      if (next === SALES_YEAR_VIEW.FINANCIAL) {
        const fyEnd = getCurrentFinancialYearEnd();
        if (fyEnd) setSelectedYear(String(fyEnd));
      } else {
        setSelectedYear(String(new Date().getFullYear()));
      }
      return next;
    });
  }

  const yearViewToggleLabel =
    yearView === SALES_YEAR_VIEW.CALENDAR ? "Calendar Year" : "Financial Year";

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      {/* Section 1: Heading */}
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img
            src={logo}
            alt="SGF Logo"
            style={{
              width: "120px",
              height: "auto",
            }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Sales Analytics
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={handleYearViewToggle}
              title="Toggle between calendar year (Jan–Dec) and financial year (Jul–Jun)"
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "2px solid #fff",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
                outline: "none",
                whiteSpace: "nowrap",
              }}
            >
              {yearViewToggleLabel}
            </button>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                fontWeight: 500,
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
                outline: "none",
              }}
            >
              {availablePeriods.map((year) => (
                <option key={year} value={year}>
                  {yearView === SALES_YEAR_VIEW.FINANCIAL
                    ? formatSalesTotalsPeriodLabel(year, SALES_YEAR_VIEW.FINANCIAL)
                    : year}
                </option>
              ))}
            </select>
            {selectedView !== "rates" && selectedView !== "targets" && (
              <>
            <button
              type="button"
              aria-pressed={showLastYearOutline}
              onClick={() => setShowLastYearOutline((v) => !v)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: showLastYearOutline ? "2px solid #FFD54F" : "2px solid transparent",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
                outline: "none",
                whiteSpace: "nowrap",
                boxShadow: showLastYearOutline ? "inset 0 0 0 1px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Show Last Year
            </button>
            <button
              type="button"
              aria-pressed={showMonthlyTargets}
              title="Monthly job-count targets per region (set under Targets; bar chart overlay)"
              onClick={() => setShowMonthlyTargets((v) => !v)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: showMonthlyTargets ? "2px solid #7B68A8" : "2px solid transparent",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
                outline: "none",
                whiteSpace: "nowrap",
                boxShadow: showMonthlyTargets ? "inset 0 0 0 1px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Show Targets
            </button>
            <button
              type="button"
              aria-pressed={showAdjustedTargets}
              title="Avg jobs/mo for the rest of the year: (annual 12× monthly target − YTD) ÷ months left. Lower than the usual monthly target when ahead, higher when behind. If already past the annual total, the chart shows 0. For the current year, future month columns use the same effective month as today."
              onClick={() => setShowAdjustedTargets((v) => !v)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: showAdjustedTargets ? "2px solid #C45C26" : "2px solid transparent",
                fontSize: "0.95rem",
                fontWeight: 600,
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
                outline: "none",
                whiteSpace: "nowrap",
                boxShadow: showAdjustedTargets ? "inset 0 0 0 1px rgba(0,0,0,0.06)" : "none",
              }}
            >
              Show Adjusted Targets
            </button>
            <button
              type="button"
              aria-pressed={showBarVic}
              onClick={() => setShowBarVic((v) => !v)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: showBarVic ? "2px solid #2A5588" : "2px solid rgba(50,50,51,0.25)",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: showBarVic ? WHITE : MONUMENT,
                background: showBarVic ? STREAM_COLORS["SGF - VIC"].darker : "rgba(255,255,255,0.75)",
                cursor: "pointer",
                outline: "none",
                minWidth: "44px",
              }}
            >
              VIC
            </button>
            <button
              type="button"
              aria-pressed={showBarQld}
              onClick={() => setShowBarQld((v) => !v)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: showBarQld ? "2px solid #6B1F2A" : "2px solid rgba(50,50,51,0.25)",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: showBarQld ? WHITE : MONUMENT,
                background: showBarQld ? STREAM_COLORS["SGF - QLD"].darker : "rgba(255,255,255,0.75)",
                cursor: "pointer",
                outline: "none",
                minWidth: "44px",
              }}
            >
              QLD
            </button>
            <button
              type="button"
              aria-pressed={showBarGreen}
              onClick={() => setShowBarGreen((v) => !v)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: showBarGreen ? "2px solid #4A7020" : "2px solid rgba(50,50,51,0.25)",
                fontSize: "0.9rem",
                fontWeight: 700,
                color: showBarGreen ? WHITE : MONUMENT,
                background: showBarGreen ? STREAM_COLORS["Green Streams"].darker : "rgba(255,255,255,0.75)",
                cursor: "pointer",
                outline: "none",
                minWidth: "44px",
              }}
            >
              GREEN
            </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        {/* Section 2: Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
          }}
        >
          {/* Bar Graph - Light Blue */}
          <div style={{ background: MENU.blue, borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
            <button
              onClick={() => setSelectedView("bar")}
              style={{
                background: selectedView === "bar" ? MENU.blueActive : "transparent",
                color: selectedView === "bar" ? MENU.activeText : UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
                width: "100%",
              }}
            >
              Bar Graph
            </button>
          </div>
          
          {/* Pie Chart - Light Green */}
          <div style={{ background: MENU.green, borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
            <button
              onClick={() => setSelectedView("pie")}
              style={{
                background: selectedView === "pie" ? MENU.greenActive : "transparent",
                color: selectedView === "pie" ? MENU.activeText : UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
                width: "100%",
              }}
            >
              Pie Chart
            </button>
          </div>

          {/* Rates — cumulative planned vs actual */}
          <div style={{ background: "#E8D4F5", borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
            <button
              onClick={() => setSelectedView("rates")}
              style={{
                background: selectedView === "rates" ? "#8E44AD" : "transparent",
                color: selectedView === "rates" ? MENU.activeText : UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
                width: "100%",
              }}
            >
              Rates
            </button>
          </div>

          {/* Targets — monthly job counts (VIC / QLD / Green) */}
          <div style={{ background: "#FFF3E0", borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
            <button
              onClick={() => setSelectedView("targets")}
              style={{
                background: selectedView === "targets" ? "#E65100" : "transparent",
                color: selectedView === "targets" ? MENU.activeText : UI.textSecondary,
                border: "none",
                borderRadius: "10px",
                padding: "8px 8px",
                fontSize: "0.95rem",
                fontWeight: 500,
                textAlign: "center",
                textDecoration: "none",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
                width: "100%",
              }}
            >
              Targets
            </button>
          </div>
          
          <div style={{ flex: 1 }} />
          
          {/* Back to Sales - Light Red */}
          <div style={{ background: MENU.red, borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
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
                transition: "background 0.18s, color 0.15s",
                marginBottom: "0px",
                lineHeight: "1.4",
                display: "block",
              }}
            >
              ← Back to Sales
            </Link>
          </div>
        </div>

        {/* Section 3: Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            overflowX: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
          }}
        >
          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {selectedView === "pie" ? (
                <>
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "32px" }}>
                    Total Value Breakdown for {periodLabel}
                  </h2>
                  
                  {/* Pie Chart */}
                  <div style={{ display: "flex", alignItems: "center", gap: "48px", flexWrap: "wrap", justifyContent: "center", position: "relative" }}>
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <svg width="400" height="400" viewBox="0 0 400 400" style={{ position: "relative", zIndex: 2 }}>
                        {pieData.map((slice, index) => (
                          <path
                            key={slice.name}
                            d={getPieSlicePath(pieData, index)}
                            fill={slice.color}
                            stroke={WHITE}
                            strokeWidth="2"
                          />
                        ))}
                      </svg>
                      
                      {/* Previous year pie chart overlay (ghost) */}
                      {showLastYearOutline && previousYearPieData && previousYearPieData.total > 0 && (() => {
                        const prevTotal = previousYearPieData.total;
                        const prevPieData = [
                          {
                            name: "SGF - VIC",
                            value: previousYearPieData.vic,
                            percentage: prevTotal > 0 ? (previousYearPieData.vic / prevTotal) * 100 : 0,
                          },
                          {
                            name: "SGF - QLD",
                            value: previousYearPieData.qld,
                            percentage: prevTotal > 0 ? (previousYearPieData.qld / prevTotal) * 100 : 0,
                          },
                          {
                            name: "Green Streams",
                            value: previousYearPieData.green,
                            percentage: prevTotal > 0 ? (previousYearPieData.green / prevTotal) * 100 : 0,
                          },
                        ];
                        
                        return (
                          <svg width="400" height="400" viewBox="0 0 400 400" style={{ position: "absolute", top: 0, left: 0, zIndex: 3, pointerEvents: "none" }}>
                            {prevPieData.map((slice, index) => (
                              <path
                                key={slice.name}
                                d={getPieSlicePath(prevPieData, index)}
                                fill="transparent"
                                stroke="#FFD54F"
                                strokeWidth="3"
                              />
                            ))}
                          </svg>
                        );
                      })()}
                    </div>
                    
                    {/* Legend */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: "200px" }}>
                      {pieData.map((slice) => (
                        <div key={slice.name} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div
                            style={{
                              width: "24px",
                              height: "24px",
                              backgroundColor: slice.color,
                              borderRadius: "4px",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: MONUMENT }}>
                              {slice.name}
                            </div>
                            <div style={{ fontSize: "0.8rem", color: UI.textMuted }}>
                              {formatCurrency(slice.value)} ({slice.percentage.toFixed(1)}%)
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : selectedView === "rates" ? (
                <>
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "16px" }}>
                    Planned vs actual cumulative jobs — {periodLabel}
                  </h2>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "20px",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: MONUMENT, marginRight: "4px" }}>
                      Include in lines:
                    </span>
                    <button
                      type="button"
                      aria-pressed={ratesIncludeVic}
                      onClick={() => setRatesIncludeVic((v) => !v)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: ratesIncludeVic ? "2px solid #2A5588" : "2px solid rgba(50,50,51,0.25)",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: ratesIncludeVic ? WHITE : MONUMENT,
                        background: ratesIncludeVic ? STREAM_COLORS["SGF - VIC"].darker : "rgba(255,255,255,0.75)",
                        cursor: "pointer",
                        outline: "none",
                        minWidth: "44px",
                      }}
                    >
                      VIC
                    </button>
                    <button
                      type="button"
                      aria-pressed={ratesIncludeQld}
                      onClick={() => setRatesIncludeQld((v) => !v)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: ratesIncludeQld ? "2px solid #6B1F2A" : "2px solid rgba(50,50,51,0.25)",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: ratesIncludeQld ? WHITE : MONUMENT,
                        background: ratesIncludeQld ? STREAM_COLORS["SGF - QLD"].darker : "rgba(255,255,255,0.75)",
                        cursor: "pointer",
                        outline: "none",
                        minWidth: "44px",
                      }}
                    >
                      QLD
                    </button>
                    <button
                      type="button"
                      aria-pressed={ratesIncludeGreen}
                      onClick={() => setRatesIncludeGreen((v) => !v)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: ratesIncludeGreen ? "2px solid #4A7020" : "2px solid rgba(50,50,51,0.25)",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        color: ratesIncludeGreen ? WHITE : MONUMENT,
                        background: ratesIncludeGreen ? STREAM_COLORS["Green Streams"].darker : "rgba(255,255,255,0.75)",
                        cursor: "pointer",
                        outline: "none",
                        minWidth: "44px",
                      }}
                    >
                      GREEN
                    </button>
                    <button
                      type="button"
                      aria-pressed={ratesShowLastYear}
                      onClick={() => setRatesShowLastYear((v) => !v)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: ratesShowLastYear ? "2px solid #FFD54F" : "2px solid rgba(50,50,51,0.25)",
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        background: ratesShowLastYear ? "rgba(255, 213, 79, 0.35)" : "rgba(255,255,255,0.75)",
                        cursor: "pointer",
                        outline: "none",
                        whiteSpace: "nowrap",
                        boxShadow: ratesShowLastYear ? "inset 0 0 0 1px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      Show Last Year
                    </button>
                  </div>
                  <CumulativeRatesLineChart
                    monthlyData={monthlyData}
                    selectedYear={selectedYear}
                    yearView={yearView}
                    previousPeriodLabel={previousPeriodLabel}
                    combinedMonthlyTargetJobs={ratesChartMonthlyTargetJobs}
                    combinedAnnualTargetJobs={ratesChartAnnualTargetJobs}
                    includeVic={ratesIncludeVic}
                    includeQld={ratesIncludeQld}
                    includeGreen={ratesIncludeGreen}
                    chartTitle={ratesChartTitle}
                    previousYearMonthlyData={previousYearData}
                    showLastYearRates={ratesShowLastYear}
                  />
                </>
              ) : selectedView === "targets" ? (
                <>
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "24px" }}>
                    Monthly job targets
                  </h2>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "720px",
                      padding: "20px 24px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.72)",
                      border: "1px solid rgba(50,50,51,0.14)",
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: MONUMENT, marginBottom: "6px" }}>
                      Jobs per month (by region)
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#323233aa", marginBottom: "18px", lineHeight: 1.45 }}>
                      These values feed the Rates planned line, bar-chart target outlines, and adjusted targets. They
                      save automatically in this browser.
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 28px", alignItems: "flex-end" }}>
                      {[
                        { key: "vic", label: "VIC", accent: STREAM_COLORS["SGF - VIC"].darker },
                        { key: "qld", label: "QLD", accent: STREAM_COLORS["SGF - QLD"].darker },
                        { key: "greenStreams", label: "Green", accent: STREAM_COLORS["Green Streams"].darker },
                      ].map(({ key, label, accent }) => (
                        <label
                          key={key}
                          style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "100px" }}
                        >
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: accent }}>{label}</span>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            step={1}
                            value={monthlySalesTargets[key]}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setMonthlySalesTargets((prev) => {
                                if (raw === "") return { ...prev, [key]: 0 };
                                const n = parseInt(raw, 10);
                                if (!Number.isFinite(n)) return prev;
                                return { ...prev, [key]: clampMonthlyTargetInt(n, prev[key]) };
                              });
                            }}
                            style={{
                              width: "100px",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              border: `2px solid ${accent}`,
                              fontSize: "1rem",
                              fontWeight: 600,
                              color: MONUMENT,
                              boxSizing: "border-box",
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <div
                      style={{
                        marginTop: "20px",
                        paddingTop: "16px",
                        borderTop: "1px solid rgba(50,50,51,0.12)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: MONUMENT,
                        lineHeight: 1.5,
                      }}
                    >
                      Combined plan: {combinedMonthlyTargetJobs} jobs/mo × 12 = {combinedAnnualTargetJobs} jobs/year
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "32px" }}>
                    Monthly Sales for {periodLabel}
                  </h2>
                  <div style={{ width: "100%", maxWidth: "1240px", position: "relative", display: "flex" }}>
                    {/* Y-axis scale */}
                    <div style={{ width: "60px", flexShrink: 0, position: "relative", height: "600px", marginRight: "8px" }}>
                      {(() => {
                        const maxJobsRounded = 50; // Fixed scale: always 0-50 jobs
                        // Number of increments (0, 5, 10, ..., 50)
                        const numIncrements = maxJobsRounded / 5;
                        // Calculate the usable height (550px for bars, same as bar scaling)
                        const barAreaHeight = 550;
                        const chartHeight = 600;
                        const bottomOffset = (chartHeight - barAreaHeight) / 2; // Center the bar area
                        
                        return (
                          <>
                            {Array.from({ length: numIncrements + 1 }, (_, i) => {
                              const jobCount = i * 5;
                              // Position based on bar area, not full chart height
                              const positionFromBottom = (jobCount / maxJobsRounded) * barAreaHeight;
                              const bottomPosition = bottomOffset + positionFromBottom;
                              
                              return (
                                <div
                                  key={i}
                                  style={{
                                    position: "absolute",
                                    bottom: `${bottomPosition}px`,
                                    right: "0",
                                    display: "flex",
                                    alignItems: "flex-end",
                                    transform: "translateY(50%)",
                                  }}
                                >
                                  <div style={{ fontSize: "0.75rem", color: MONUMENT, fontWeight: 600 }}>
                                    {jobCount}
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                    
                    {/* Chart area */}
                    <div style={{ flex: 1, position: "relative" }}>
                      {/* Grid lines */}
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "600px", pointerEvents: "none", padding: "0 10px" }}>
                        {(() => {
                          const maxJobsRounded = 50; // Fixed scale: always 0-50 jobs
                          const numIncrements = maxJobsRounded / 5; // 11 lines (0, 5, 10, ..., 50)
                          // Calculate the usable height (550px for bars, same as bar scaling)
                          const barAreaHeight = 550;
                          const chartHeight = 600;
                          const bottomOffset = (chartHeight - barAreaHeight) / 2; // Center the bar area
                          
                          return Array.from({ length: numIncrements + 1 }, (_, i) => {
                            const jobCount = i * 5;
                            // Position based on bar area, not full chart height
                            const positionFromBottom = (jobCount / maxJobsRounded) * barAreaHeight;
                            const bottomPosition = bottomOffset + positionFromBottom;
                            
                            return (
                              <div
                                key={i}
                                style={{
                                  position: "absolute",
                                  bottom: `${bottomPosition}px`,
                                  left: "10px",
                                  right: "10px",
                                  height: "1px",
                                  backgroundColor: "#d0d0d0",
                                  opacity: 0.5,
                                }}
                              />
                            );
                          });
                        })()}
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "4px", height: "600px", padding: "0 10px", position: "relative" }}>
                      {monthlyData.map((month, index) => {
                        const maxJobsRounded = 50; // Fixed scale: always 0-50 jobs
                        
                        // Scale bars based on job count (0-50 jobs scale)
                        const vicBarHeight = (month.vicSalesCount / maxJobsRounded) * 550;
                        const qldBarHeight = (month.qldSalesCount / maxJobsRounded) * 550;
                        const greenStreamBarHeight = (month.greenStreamSalesCount / maxJobsRounded) * 550;

                        const barSegments = [];
                        if (showBarGreen && greenStreamBarHeight > 0) {
                          barSegments.push({
                            key: "green",
                            height: greenStreamBarHeight,
                            count: month.greenStreamSalesCount,
                            value: month.greenStreamTotalValue,
                            bg: "#92D050",
                            title: `Green streams: ${month.greenStreamSalesCount} - ${formatCurrency(month.greenStreamTotalValue)}`,
                          });
                        }
                        if (showBarQld && qldBarHeight > 0) {
                          barSegments.push({
                            key: "qld",
                            height: qldBarHeight,
                            count: month.qldSalesCount,
                            value: month.qldTotalValue,
                            bg: "#D54358",
                            title: `QLD: ${month.qldSalesCount} - ${formatCurrency(month.qldTotalValue)}`,
                          });
                        }
                        if (showBarVic && vicBarHeight > 0) {
                          barSegments.push({
                            key: "vic",
                            height: vicBarHeight,
                            count: month.vicSalesCount,
                            value: month.vicTotalValue,
                            bg: "#4D93D9",
                            title: `VIC: ${month.vicSalesCount} - ${formatCurrency(month.vicTotalValue)}`,
                          });
                        }
                        const totalBarHeight = barSegments.reduce((sum, s) => sum + s.height, 0);

                        let visibleSalesCount = 0;
                        let visibleTotalValue = 0;
                        if (showBarVic) {
                          visibleSalesCount += month.vicSalesCount;
                          visibleTotalValue += month.vicTotalValue;
                        }
                        if (showBarQld) {
                          visibleSalesCount += month.qldSalesCount;
                          visibleTotalValue += month.qldTotalValue;
                        }
                        if (showBarGreen) {
                          visibleSalesCount += month.greenStreamSalesCount;
                          visibleTotalValue += month.greenStreamTotalValue;
                        }

                        // Previous year: same streams as visible on chart
                        const prevMonth = previousYearData[index];
                        let prevVisibleCount = 0;
                        if (prevMonth) {
                          if (showBarVic) prevVisibleCount += prevMonth.vicSalesCount;
                          if (showBarQld) prevVisibleCount += prevMonth.qldSalesCount;
                          if (showBarGreen) prevVisibleCount += prevMonth.greenStreamSalesCount;
                        }
                        const prevTotalBarHeight =
                          prevVisibleCount > 0 ? (prevVisibleCount / maxJobsRounded) * 550 : 0;

                        const tgtVicH = (monthlySalesTargets.vic / maxJobsRounded) * 550;
                        const tgtQldH = (monthlySalesTargets.qld / maxJobsRounded) * 550;
                        const tgtGreenH = (monthlySalesTargets.greenStreams / maxJobsRounded) * 550;
                        const dashVic = `2px dashed ${TARGET_OUTLINE_COLORS.vic}`;
                        const dashQld = `2px dashed ${TARGET_OUTLINE_COLORS.qld}`;
                        const dashGreen = `2px dashed ${TARGET_OUTLINE_COLORS.greenStreams}`;

                        const targetSegments = [];
                        if (showBarGreen) {
                          targetSegments.push({
                            key: "green",
                            h: tgtGreenH,
                            dash: dashGreen,
                            labelValue: monthlySalesTargets.greenStreams,
                            title: `Target Green Streams: ${monthlySalesTargets.greenStreams}/mo`,
                          });
                        }
                        if (showBarQld) {
                          targetSegments.push({
                            key: "qld",
                            h: tgtQldH,
                            dash: dashQld,
                            labelValue: monthlySalesTargets.qld,
                            title: `Target QLD: ${monthlySalesTargets.qld}/mo`,
                          });
                        }
                        if (showBarVic) {
                          targetSegments.push({
                            key: "vic",
                            h: tgtVicH,
                            dash: dashVic,
                            labelValue: monthlySalesTargets.vic,
                            title: `Target VIC: ${monthlySalesTargets.vic}/mo`,
                          });
                        }

                        const effectiveMonthIndex = getEffectivePeriodMonthIndexForSlot(
                          selectedYear,
                          yearView,
                          index
                        );
                        const monthsAfterThis = 12 - (effectiveMonthIndex + 1);
                        const paceNote =
                          effectiveMonthIndex < index
                            ? ` (through ${monthlyData[effectiveMonthIndex]?.name ?? MONTHS[effectiveMonthIndex]}; same for months not yet reached this period)`
                            : "";

                        let ytdVic = 0;
                        let ytdQld = 0;
                        let ytdGreen = 0;
                        for (let j = 0; j <= effectiveMonthIndex; j++) {
                          ytdVic += monthlyData[j].vicSalesCount;
                          ytdQld += monthlyData[j].qldSalesCount;
                          ytdGreen += monthlyData[j].greenStreamSalesCount;
                        }

                        const adjustedTargetSegments = [];
                        if (showBarGreen) {
                          const yearlyG = monthlySalesTargets.greenStreams * 12;
                          const adjG = adjustedPaceFromYtd(
                            monthlySalesTargets.greenStreams,
                            effectiveMonthIndex,
                            ytdGreen
                          );
                          const adjIntG = Math.max(0, Math.round(adjG));
                          if (adjIntG > 0) {
                            const displayG = Math.min(adjIntG, maxJobsRounded);
                            const remG = yearlyG - ytdGreen;
                            const paceTailG =
                              monthsAfterThis > 0
                                ? `${remG} left ÷ ${monthsAfterThis} mo after this`
                                : `${Math.max(0, remG)} left to hit annual (Dec)`;
                            adjustedTargetSegments.push({
                              key: "green",
                              h: (displayG / maxJobsRounded) * 550,
                              dash: `2px dotted ${TARGET_OUTLINE_COLORS.greenStreams}`,
                              labelValue: adjIntG,
                              title:
                                adjIntG > maxJobsRounded
                                  ? `Adjusted Green Streams: ${adjIntG}/mo (outline height capped at ${maxJobsRounded}; annual ${yearlyG}, YTD ${ytdGreen}; ${paceTailG})${paceNote}`
                                  : `Adjusted Green Streams: ${adjIntG}/mo (annual ${yearlyG}, YTD ${ytdGreen}; ${paceTailG})${paceNote}`,
                            });
                          }
                        }
                        if (showBarQld) {
                          const yearlyQ = monthlySalesTargets.qld * 12;
                          const adjQ = adjustedPaceFromYtd(
                            monthlySalesTargets.qld,
                            effectiveMonthIndex,
                            ytdQld
                          );
                          const adjIntQ = Math.max(0, Math.round(adjQ));
                          if (adjIntQ > 0) {
                            const displayQ = Math.min(adjIntQ, maxJobsRounded);
                            const remQ = yearlyQ - ytdQld;
                            const paceTailQ =
                              monthsAfterThis > 0
                                ? `${remQ} left ÷ ${monthsAfterThis} mo after this`
                                : `${Math.max(0, remQ)} left to hit annual (Dec)`;
                            adjustedTargetSegments.push({
                              key: "qld",
                              h: (displayQ / maxJobsRounded) * 550,
                              dash: `2px dotted ${TARGET_OUTLINE_COLORS.qld}`,
                              labelValue: adjIntQ,
                              title:
                                adjIntQ > maxJobsRounded
                                  ? `Adjusted QLD: ${adjIntQ}/mo (outline height capped at ${maxJobsRounded}; annual ${yearlyQ}, YTD ${ytdQld}; ${paceTailQ})${paceNote}`
                                  : `Adjusted QLD: ${adjIntQ}/mo (annual ${yearlyQ}, YTD ${ytdQld}; ${paceTailQ})${paceNote}`,
                            });
                          }
                        }
                        if (showBarVic) {
                          const yearlyV = monthlySalesTargets.vic * 12;
                          const adjV = adjustedPaceFromYtd(
                            monthlySalesTargets.vic,
                            effectiveMonthIndex,
                            ytdVic
                          );
                          const adjIntV = Math.max(0, Math.round(adjV));
                          if (adjIntV > 0) {
                            const displayV = Math.min(adjIntV, maxJobsRounded);
                            const remV = yearlyV - ytdVic;
                            const paceTailV =
                              monthsAfterThis > 0
                                ? `${remV} left ÷ ${monthsAfterThis} mo after this`
                                : `${Math.max(0, remV)} left to hit annual (Dec)`;
                            adjustedTargetSegments.push({
                              key: "vic",
                              h: (displayV / maxJobsRounded) * 550,
                              dash: `2px dotted ${TARGET_OUTLINE_COLORS.vic}`,
                              labelValue: adjIntV,
                              title:
                                adjIntV > maxJobsRounded
                                  ? `Adjusted VIC: ${adjIntV}/mo (outline height capped at ${maxJobsRounded}; annual ${yearlyV}, YTD ${ytdVic}; ${paceTailV})${paceNote}`
                                  : `Adjusted VIC: ${adjIntV}/mo (annual ${yearlyV}, YTD ${ytdVic}; ${paceTailV})${paceNote}`,
                            });
                          }
                        }

                        const showTargetOverlay =
                          (showAdjustedTargets && adjustedTargetSegments.length > 0) ||
                          (showMonthlyTargets && !showAdjustedTargets && targetSegments.length > 0);
                        const overlaySegments = showAdjustedTargets ? adjustedTargetSegments : targetSegments;
                        const overlayStackHeight = overlaySegments.reduce(
                          (s, t) => s + t.h + TARGET_OVERLAY_LABEL_ROW_PX,
                          0
                        );
                        
                        return (
                          <div
                            key={month.name}
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              height: "100%",
                              justifyContent: "flex-end",
                              position: "relative",
                            }}
                          >
                            {totalBarHeight > 0 && (
                                <div
                                  style={{
                                    width: "100%",
                                    marginBottom: "16px",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    color: MONUMENT,
                                    textAlign: "center",
                                    lineHeight: "1.15",
                                    flexShrink: 0,
                                    position: "relative",
                                    zIndex: 5,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {visibleSalesCount} - {formatCurrency(visibleTotalValue)}
                                </div>
                            )}
                            <div
                              style={{
                                position: "relative",
                                width: "100%",
                                flexShrink: 0,
                                alignSelf: "stretch",
                              }}
                            >
                              {showLastYearOutline && prevTotalBarHeight > 0 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    height: `${prevTotalBarHeight}px`,
                                    boxSizing: "border-box",
                                    border: "2px solid #FFD54F",
                                    borderRadius: "4px 4px 0 0",
                                    backgroundColor: "transparent",
                                    pointerEvents: "none",
                                    zIndex: 4,
                                  }}
                                />
                              )}
                              {showTargetOverlay && (
                                <div
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    height: `${overlayStackHeight}px`,
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "flex-end",
                                    alignItems: "stretch",
                                    pointerEvents: "none",
                                    zIndex: 3,
                                  }}
                                >
                                  {overlaySegments.map((ts, ti) => {
                                    const n = overlaySegments.length;
                                    const isTop = ti === 0;
                                    const isBottom = ti === n - 1;
                                    return (
                                      <div
                                        key={ts.key}
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          alignItems: "center",
                                          flexShrink: 0,
                                        }}
                                      >
                                        <div
                                          title={ts.title}
                                          style={{
                                            fontSize: "0.65rem",
                                            fontWeight: 800,
                                            color: MONUMENT,
                                            lineHeight: 1.05,
                                            marginBottom: "3px",
                                            flexShrink: 0,
                                            userSelect: "none",
                                          }}
                                        >
                                          {ts.labelValue}
                                        </div>
                                        <div
                                          title={ts.title}
                                          style={{
                                            width: "100%",
                                            height: `${ts.h}px`,
                                            boxSizing: "border-box",
                                            borderLeft: ts.dash,
                                            borderRight: ts.dash,
                                            borderTop: isTop ? ts.dash : "none",
                                            borderBottom: isBottom ? ts.dash : "none",
                                            borderRadius:
                                              n === 1 ? "4px 4px 0 0" : isTop ? "4px 4px 0 0" : isBottom ? "0 0 4px 4px" : "0",
                                            flexShrink: 0,
                                          }}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            {/* Stacked bars — green (top) → QLD → VIC (bottom); hidden streams omitted with no gap */}
                            <div
                              style={{
                                width: "100%",
                                height: `${totalBarHeight}px`,
                                maxHeight: `${totalBarHeight}px`,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                position: "relative",
                                zIndex: 2,
                                flexShrink: 0,
                                boxSizing: "border-box",
                                overflow: "hidden",
                              }}
                            >
                              {barSegments.map((seg, si) => {
                                const n = barSegments.length;
                                const isTop = si === 0;
                                const isBottom = si === n - 1;
                                let barBorderRadius = "0";
                                if (n === 1) barBorderRadius = "4px 4px 0 0";
                                else if (isTop) barBorderRadius = "4px 4px 0 0";
                                else if (isBottom) barBorderRadius = "0 0 4px 4px";
                                return (
                                  <div
                                    key={seg.key}
                                    title={seg.title}
                                    style={{
                                      width: "100%",
                                      height: `${seg.height}px`,
                                      maxHeight: `${seg.height}px`,
                                      flex: "0 0 auto",
                                      backgroundColor: seg.bg,
                                      borderRadius: barBorderRadius,
                                      display: "flex",
                                      flexDirection: "column",
                                      justifyContent: "center",
                                      alignItems: "center",
                                      padding: "1px 3px",
                                      boxSizing: "border-box",
                                      overflow: "hidden",
                                      minHeight: 0,
                                    }}
                                  >
                                    {seg.height >= 18 && (
                                      <div
                                        style={{
                                          fontSize: "0.58rem",
                                          fontWeight: 700,
                                          color: WHITE,
                                          lineHeight: 1.1,
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          maxWidth: "100%",
                                          textAlign: "center",
                                        }}
                                      >
                                        {seg.count} - {formatCurrency(seg.value)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            </div>

                            {/* Month label */}
                            <div
                              style={{
                                fontSize: "0.7rem",
                                color: MONUMENT,
                                marginTop: "8px",
                                textAlign: "center",
                                fontWeight: 500,
                                transform: "rotate(-45deg)",
                                transformOrigin: "center",
                                whiteSpace: "nowrap",
                                width: "80px",
                                marginLeft: "-40px",
                              }}
                            >
                              {month.name.substring(0, 3)}
                            </div>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
