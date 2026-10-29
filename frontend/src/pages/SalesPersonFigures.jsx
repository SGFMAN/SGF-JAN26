import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import {
  filterProjectsByPeriod,
  formatSalesTotalsPeriodLabel,
  getAvailableCalendarYears,
  getAvailableFinancialYears,
  getCurrentFinancialYearEnd,
  SALES_ALL_YEARS,
  SALES_YEAR_VIEW,
} from "../utils/salesTotalsCompute";
import {
  computeSalesPersonFigures,
  filterSalesTeamUsers,
  isIllegalSaleName,
} from "../utils/salesPersonFiguresCompute";

import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

export default function SalesPersonFigures() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [yearView, setYearView] = useState(SALES_YEAR_VIEW.CALENDAR);
  const [savingProjectId, setSavingProjectId] = useState(null);
  const [assignError, setAssignError] = useState(null);
  const [illegalSaleOpen, setIllegalSaleOpen] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!illegalSaleOpen) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") setIllegalSaleOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [illegalSaleOpen]);

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
    if (selectedYear === SALES_ALL_YEARS) return;
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
      if (selectedYear === SALES_ALL_YEARS) return next;
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

  const salespersonOptions = useMemo(
    () =>
      [...salesTeamUsers].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      ),
    [salesTeamUsers]
  );

  async function saveSalesperson(projectId, salespersonName) {
    const previousSalesperson =
      projects.find((project) => project.id === projectId)?.salesperson ?? null;
    setSavingProjectId(projectId);
    setAssignError(null);
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, salesperson: salespersonName } : project
      )
    );
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ salesperson: salespersonName }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText || "Failed to save salesperson");
      }
    } catch (err) {
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, salesperson: previousSalesperson } : project
        )
      );
      setAssignError(err.message || "Could not save salesperson");
    } finally {
      setSavingProjectId(null);
    }
  }

  async function handleAssignSalesperson(projectId, salespersonName) {
    const name = String(salespersonName || "").trim();
    if (!name) return;
    if (isIllegalSaleName(name)) setIllegalSaleOpen(true);
    await saveSalesperson(projectId, name);
  }

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
          {loading && <p style={{ color: UI.textMuted }}>Loading…</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}

          {!loading && !error && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              <h2 style={{ margin: "0 0 8px 0", fontSize: "1.35rem", fontWeight: 600, color: MONUMENT }}>
                {periodLabel}
              </h2>
              <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.45 }}>
                Sales team members and how many sales they are assigned for this period. Hotlist and Home Office /
                Studio jobs are excluded. Assign a salesperson to any unaccounted project from the list.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  flex: 1,
                  minHeight: 0,
                  alignItems: "stretch",
                }}
              >
              {figures.rows.length === 0 ? (
                <p style={{ color: UI.textMuted, margin: 0, flexShrink: 0 }}>
                  No users with the Sales Team position were found.
                </p>
              ) : (
                <div
                  style={{
                    background: WHITE,
                    borderRadius: "12px",
                    border: `1px solid ${UI.outline}`,
                    overflow: "auto",
                    maxWidth: "520px",
                    flexShrink: 0,
                    alignSelf: "flex-start",
                    maxHeight: "100%",
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
                        <tr key={row.userId} style={{ borderBottom: `1px solid ${UI.outline}` }}>
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

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <h3 style={{ margin: "0 0 8px 0", fontSize: "1.05rem", fontWeight: 600, color: MONUMENT }}>
                  Unaccounted projects ({figures.unaccounted})
                </h3>
                {assignError && (
                  <p style={{ margin: "0 0 8px 0", color: "#cc3333", fontSize: "0.9rem" }}>{assignError}</p>
                )}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    background: WHITE,
                    borderRadius: "12px",
                    border: `1px solid ${UI.outline}`,
                  }}
                >
                  {figures.unaccountedProjects.length === 0 ? (
                    <p style={{ margin: 0, padding: "14px 16px", color: UI.textMuted }}>
                      Every project in this period is assigned to a sales person.
                    </p>
                  ) : (
                    figures.unaccountedProjects.map((project) => (
                      <div
                        key={project.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px 14px",
                          borderBottom: `1px solid ${UI.outline}`,
                        }}
                      >
                        <div
                          title={project.address}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            color: MONUMENT,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {project.address}
                        </div>
                        <select
                          aria-label={`Salesperson for ${project.address}`}
                          value=""
                          disabled={savingProjectId === project.id || salespersonOptions.length === 0}
                          onChange={(e) => handleAssignSalesperson(project.id, e.target.value)}
                          style={{
                            width: "220px",
                            flexShrink: 0,
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: `1px solid ${UI.outline}`,
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            color: MONUMENT,
                            background: WHITE,
                            cursor: savingProjectId === project.id ? "wait" : "pointer",
                            outline: "none",
                          }}
                        >
                          <option value="">
                            {savingProjectId === project.id ? "Saving…" : "Select salesperson"}
                          </option>
                          {salespersonOptions.map((user) => (
                            <option key={user.id} value={user.name}>
                              {user.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {illegalSaleOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="illegal-sale-title"
          onClick={() => setIllegalSaleOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background:
              "repeating-linear-gradient(45deg, rgba(180,0,0,0.88) 0 18px, rgba(40,0,0,0.92) 18px 36px)",
            animation: "sgfIllegalSaleFlash 0.35s steps(2, end) infinite",
          }}
        >
          <style>
            {`
              @keyframes sgfIllegalSaleFlash {
                0%, 49% { filter: brightness(1); }
                50%, 100% { filter: brightness(1.45); }
              }
              @keyframes sgfIllegalSaleShake {
                0%, 100% { transform: translateX(0) rotate(-1deg); }
                25% { transform: translateX(-8px) rotate(1deg); }
                75% { transform: translateX(8px) rotate(-1.5deg); }
              }
              @keyframes sgfIllegalSaleTextPulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.72; transform: scale(1.06); }
              }
            `}
          </style>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 96%)",
              background: "#8b0000",
              color: "#fff",
              border: "8px solid #ffeb3b",
              boxShadow: "0 0 0 6px #c62828, 0 18px 50px rgba(0,0,0,0.55)",
              borderRadius: "6px",
              padding: "28px 24px 22px",
              textAlign: "center",
              animation: "sgfIllegalSaleShake 0.22s linear infinite",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                fontSize: "0.95rem",
                fontWeight: 800,
                letterSpacing: "0.28em",
                color: "#ffeb3b",
                marginBottom: "10px",
              }}
            >
              ⚠ WARNING ⚠ WARNING ⚠ WARNING ⚠
            </div>
            <h2
              id="illegal-sale-title"
              style={{
                margin: "0 0 10px 0",
                fontSize: "2.4rem",
                fontWeight: 900,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#fff",
                textShadow: "0 0 18px #ffeb3b, 2px 2px 0 #000",
                animation: "sgfIllegalSaleTextPulse 0.45s ease-in-out infinite",
              }}
            >
              Illegal Sale
            </h2>
            <p
              style={{
                margin: "0 0 22px 0",
                fontSize: "1.7rem",
                fontWeight: 800,
                color: "#ffeb3b",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Don&apos;t Count
            </p>
            <button
              type="button"
              onClick={() => setIllegalSaleOpen(false)}
              style={{
                padding: "10px 22px",
                borderRadius: "8px",
                border: "3px solid #ffeb3b",
                background: "#111",
                color: "#ffeb3b",
                fontSize: "1rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Pick someone else
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
