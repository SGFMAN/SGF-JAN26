import React from "react";
import { Link } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import {
  formatSalesTotalsPeriodLabel,
  SALES_ALL_YEARS,
  SALES_YEAR_VIEW,
} from "../utils/salesTotalsCompute";
import { UI, MENU } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

export default function SalesFiguresPage({
  title,
  backTo,
  backLabel,
  selectedYear,
  onYearChange,
  yearView,
  onYearViewToggle,
  yearViewToggleLabel,
  availablePeriods,
  children,
}) {
  const logo = useAppLogo();

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          margin: "24px auto 16px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            {title}
          </h1>
          <button
            type="button"
            onClick={onYearViewToggle}
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
            onChange={(e) => onYearChange(e.target.value)}
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
            <option value={SALES_ALL_YEARS}>All Years</option>
            {availablePeriods.map((year) => (
              <option key={year} value={year}>
                {yearView === SALES_YEAR_VIEW.FINANCIAL
                  ? formatSalesTotalsPeriodLabel(year, SALES_YEAR_VIEW.FINANCIAL)
                  : year}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto 24px auto",
          gap: "32px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "100%",
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
          <div style={{ flex: 1 }} />
          <div style={{ background: MENU.red, borderRadius: "10px", padding: "4px", border: `1px solid ${UI.outline}` }}>
            <Link
              to={backTo}
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
                lineHeight: "1.4",
                display: "block",
              }}
            >
              {backLabel}
            </Link>
          </div>
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: 0,
            height: "100%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "hidden",
            color: MONUMENT,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
