import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getApiHeaders } from "../utils/auth";
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
} from "../utils/salesPersonFiguresCompute";

const API_URL = "";

function readYearView(value) {
  return value === SALES_YEAR_VIEW.FINANCIAL ? SALES_YEAR_VIEW.FINANCIAL : SALES_YEAR_VIEW.CALENDAR;
}

export function useSalesPersonFiguresData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingProjectId, setSavingProjectId] = useState(null);
  const [assignError, setAssignError] = useState(null);

  const yearView = readYearView(searchParams.get("view"));
  const selectedYear = searchParams.get("year") || String(new Date().getFullYear());

  const writePeriod = useCallback(
    (year, view) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (next.get("year") === String(year) && next.get("view") === view) return prev;
          next.set("year", String(year));
          next.set("view", view);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    let cancelled = false;
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
        if (cancelled) return;
        setProjects(projectsData);
        setUsers(usersData);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          console.error("Error loading sales person figures:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableCalendarYears = useMemo(() => getAvailableCalendarYears(projects), [projects]);
  const availableFinancialYears = useMemo(() => getAvailableFinancialYears(projects), [projects]);
  const availablePeriods =
    yearView === SALES_YEAR_VIEW.FINANCIAL ? availableFinancialYears : availableCalendarYears;

  const periodLabel = formatSalesTotalsPeriodLabel(selectedYear, yearView);

  useEffect(() => {
    if (selectedYear === SALES_ALL_YEARS) return;
    if (availablePeriods.length === 0) return;
    if (!availablePeriods.includes(selectedYear)) {
      writePeriod(availablePeriods[0], yearView);
    }
  }, [availablePeriods, selectedYear, yearView, writePeriod]);

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
    const next =
      yearView === SALES_YEAR_VIEW.CALENDAR ? SALES_YEAR_VIEW.FINANCIAL : SALES_YEAR_VIEW.CALENDAR;
    let year = selectedYear;
    if (selectedYear !== SALES_ALL_YEARS) {
      if (next === SALES_YEAR_VIEW.FINANCIAL) {
        const fyEnd = getCurrentFinancialYearEnd();
        if (fyEnd) year = String(fyEnd);
      } else {
        year = String(new Date().getFullYear());
      }
    }
    writePeriod(year, next);
  }

  const yearViewToggleLabel =
    yearView === SALES_YEAR_VIEW.CALENDAR ? "Calendar Year" : "Financial Year";

  const salespersonOptions = useMemo(() => {
    const counts = new Map(figures.rows.map((row) => [row.userId, row.salesCount]));
    return [...salesTeamUsers]
      .sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      )
      .map((user) => ({
        id: user.id,
        name: user.name,
        salesCount: counts.get(user.id) || 0,
      }));
  }, [salesTeamUsers, figures.rows]);

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
        headers: getApiHeaders(),
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
    await saveSalesperson(projectId, name);
  }

  const periodQuery = `year=${encodeURIComponent(selectedYear)}&view=${encodeURIComponent(yearView)}`;

  return {
    loading,
    error,
    figures,
    periodLabel,
    selectedYear,
    setSelectedYear: (year) => writePeriod(year, yearView),
    yearView,
    handleYearViewToggle,
    yearViewToggleLabel,
    availablePeriods,
    salespersonOptions,
    savingProjectId,
    assignError,
    handleAssignSalesperson,
    periodQuery,
  };
}
