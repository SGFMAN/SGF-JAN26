import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";
import {
  filterProjectsByPeriod,
  formatSalesTotalsPeriodLabel,
  getAvailableCalendarYears,
  getAvailableFinancialYears,
  getCurrentFinancialYearEnd,
  SALES_YEAR_VIEW,
} from "../utils/salesTotalsCompute";
import {
  computeSalesPersonFigures,
  filterSalesTeamUsers,
} from "../utils/salesPersonFiguresCompute";

import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

export default function SalesPersonFigures() {
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [yearView, setYearView] = useState(SALES_YEAR_VIEW.CALENDAR);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [projectsRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`),
        fetch(`${API_URL}/api/users`),
      ]);
      if (!projectsRes.ok) {
        throw new Error(`Failed to fetch projects: ${projectsRes.statusText}`);
      }
      if (!usersRes.ok) {
        throw new Error(`Failed to fetch users: ${usersRes.statusText}`);
      }
      const [projectsData, usersData] = await Promise.all([projectsRes.json(), usersRes.json()]);
      setProjects(projectsData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
      console.error("Error loading sales person figures:", err);
    } finally {
      setLoading(false);
    }
  }

  const availableCalendarYears = useMemo(() => getAvailableCalendarYears(projects), [projects]);
  const availableFinancialYears = useMemo(() => getAvailableFinancialYears(projects), [projects]);
  const availablePeriods =
    yearView === SALES_YEAR_VIEW.FINANCIAL ? availableFinancialYears : availableCalendarYears;

  const periodLabel = formatSalesTotalsPeriodLabel(selectedYear, yearView);

  useEffect(() => {
    if (availablePeriods.length === 0) return;
    if (!availablePeriods.includes(selectedYear)) {
      setSelectedYear(availablePeriods[0]);
    }
  }, [availablePeriods, selectedYear]);

  const yearFilteredProjects = useMemo(
    () => filterProjectsByPeriod(projects, selectedYear, yearView),
    [projects, selectedYear, yearView]
  );

  const salesTeamUsers = useMemo(() => filterSalesTeamUsers(users), [users]);

  const figures = useMemo(
    () => computeSalesPersonFigures(yearFilteredProjects, salesTeamUsers),
    [yearFilteredProjects, salesTeamUsers]
  );

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
            Sales Person Figures
          </h1>
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
        </div>
      </div>

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
          <div style={{ flex: 1 }} />

          <div style={{ background: MENU.red, borderRadius: "10px", padding: "4px", border: `1px solid ${UI.outline}` }}>
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
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            overflowX: "hidden",
            color: MONUMENT,
            minWidth: 0,
          }}
        >
          {loading && <p style={{ color: UI.textMuted }}>Loading…</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}

          {!loading && !error && (
            <>
              <h2 style={{ margin: "0 0 8px 0", fontSize: "1.35rem", fontWeight: 600, color: MONUMENT }}>
                {periodLabel}
              </h2>
              <p style={{ margin: "0 0 24px 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.45 }}>
                Sales team members and how many sales they are assigned for this period. Hotlist and Home Office /
                Studio jobs are excluded.
              </p>

              {figures.rows.length === 0 ? (
                <p style={{ color: UI.textMuted }}>No users with the Sales Team position were found.</p>
              ) : (
                <div
                  style={{
                    background: WHITE,
                    borderRadius: "12px",
                    border: `1px solid ${UI.outline}`,
                    overflow: "hidden",
                    maxWidth: "520px",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "1rem" }}>
                    <thead>
                      <tr style={{ background: LIGHT_MONUMENT, borderBottom: `1px solid ${UI.outline}` }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "12px 16px",
                            fontWeight: 600,
                            color: MONUMENT,
                          }}
                        >
                          Sales person
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "12px 16px",
                            fontWeight: 600,
                            color: MONUMENT,
                            width: "100px",
                          }}
                        >
                          Sales
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {figures.rows.map((row) => (
                        <tr key={row.userId} style={{ borderBottom: `1px solid ${UI.border}` }}>
                          <td style={{ padding: "12px 16px", color: MONUMENT }}>{row.name}</td>
                          <td
                            style={{
                              padding: "12px 16px",
                              textAlign: "right",
                              fontWeight: 600,
                              color: MONUMENT,
                            }}
                          >
                            {row.salesCount}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: LIGHT_MONUMENT }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: MONUMENT }}>
                          Unaccounted for
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            fontWeight: 700,
                            color: figures.unaccounted > 0 ? "#c62828" : MONUMENT,
                          }}
                        >
                          {figures.unaccounted}
                        </td>
                      </tr>
                      <tr style={{ borderTop: `2px solid ${UI.outline}` }}>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: MONUMENT }}>Total</td>
                        <td
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
                            fontWeight: 700,
                            color: MONUMENT,
                          }}
                        >
                          {figures.totalSales}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
