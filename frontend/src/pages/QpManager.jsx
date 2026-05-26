import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";
import logo from "../images/logo.png";
import { projectPath } from "../utils/projectUrl";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

const YEAR_OPTIONS = [2024, 2025, 2026];
const QP_AUTOSAVE_MS = 900;

/** Empty QP values sort last when ascending (sentinel sorts after any real text). */
function qpSortKey(project) {
  const v = (project.qp_number ?? "").toString().trim().toLowerCase();
  return v === "" ? "\uffff" : v;
}

function compareProjects(a, b, column) {
  if (column === "suburb") {
    const va = displaySuburb(a).toLowerCase();
    const vb = displaySuburb(b).toLowerCase();
    return va.localeCompare(vb, undefined, { sensitivity: "base" });
  }
  if (column === "street") {
    const va = displayStreet(a).toLowerCase();
    const vb = displayStreet(b).toLowerCase();
    return va.localeCompare(vb, undefined, { sensitivity: "base" });
  }
  const va = qpSortKey(a);
  const vb = qpSortKey(b);
  return va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
}

const linkInactive = {
  background: "transparent",
  color: "#404049",
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
};

const linkActive = {
  ...linkInactive,
  background: WHITE,
  color: MONUMENT,
  outline: `2px solid ${MONUMENT}`,
  boxShadow: "0 2px 4px rgba(50,50,51,.04)",
};

function normalizeState(projectState) {
  return (projectState || "").toString().trim().toUpperCase();
}

function deriveStateFromStream(projectStream) {
  const s = (projectStream || "").toString().trim().toUpperCase();
  if (s.includes("VIC")) return "VIC";
  if (s.includes("QLD") || s.includes("QUEENSLAND")) return "QLD";
  return "";
}

function isQLDProject(project) {
  const state = normalizeState(project.state || project.state_code);
  if (state === "QLD" || state === "QUEENSLAND") return true;
  if (!state) return deriveStateFromStream(project.stream) === "QLD";
  return false;
}

/** Calendar year from project.year (YYYY-MM-DD or YYYY). */
function projectCalendarYear(project) {
  if (project.year == null || project.year === "") return null;
  const y = project.year.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(y)) return parseInt(y.slice(0, 4), 10);
  if (/^\d{4}$/.test(y)) return parseInt(y, 10);
  return null;
}

function displaySuburb(project) {
  return (project.suburb || "").trim();
}

function displayStreet(project) {
  return (project.street || "").trim();
}

function rowAriaLabel(project) {
  const s = displayStreet(project);
  const u = displaySuburb(project);
  if (s && u) return `${s}, ${u}`;
  if (project.name) return project.name.trim();
  return `Project #${project.id}`;
}

export default function QpManager() {
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [sortColumn, setSortColumn] = useState("suburb");
  const [sortDir, setSortDir] = useState("asc");
  const qpTimeoutsRef = useRef({});
  const qpLatestRef = useRef({});
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    return () => {
      Object.values(qpTimeoutsRef.current).forEach((tid) => clearTimeout(tid));
      qpTimeoutsRef.current = {};
    };
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
      setAllProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  const filteredProjects = useMemo(() => {
    if (selectedYear === "") return [];
    const y = Number(selectedYear);
    if (!Number.isFinite(y)) return [];
    const list = allProjects.filter((p) => isQLDProject(p) && projectCalendarYear(p) === y);
    const mult = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => mult * compareProjects(a, b, sortColumn));
  }, [allProjects, selectedYear, sortColumn, sortDir]);

  function handleSortHeader(column) {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir("asc");
    }
  }

  const sortableThButtonStyle = {
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    font: "inherit",
    fontWeight: 600,
    color: MONUMENT,
    textAlign: "left",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
  };

  async function saveQpToServer(projectId, rawValue) {
    const trimmed = (rawValue || "").trim();
    const body = { qp_number: trimmed === "" ? null : trimmed };
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("QP save failed:", response.status, errorText);
        await fetchProjects();
        return;
      }
    } catch (e) {
      console.error("QP save error:", e);
      await fetchProjects();
    }
  }

  function scheduleQpSave(projectId) {
    if (qpTimeoutsRef.current[projectId]) {
      clearTimeout(qpTimeoutsRef.current[projectId]);
    }
    qpTimeoutsRef.current[projectId] = setTimeout(() => {
      delete qpTimeoutsRef.current[projectId];
      saveQpToServer(projectId, qpLatestRef.current[projectId]);
    }, QP_AUTOSAVE_MS);
  }

  function handleQpChange(projectId, value) {
    qpLatestRef.current[projectId] = value;
    setAllProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, qp_number: value } : p))
    );
    scheduleQpSave(projectId);
  }

  function handleQpBlur(projectId, value) {
    if (qpTimeoutsRef.current[projectId]) {
      clearTimeout(qpTimeoutsRef.current[projectId]);
      delete qpTimeoutsRef.current[projectId];
    }
    qpLatestRef.current[projectId] = value;
    saveQpToServer(projectId, value);
  }

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
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            QP Manager
          </h1>
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
            overflowY: "auto",
          }}
        >
          <Link to="/managers/site-visit-manager" style={linkInactive}>
            Site Visit Manager
          </Link>
          <Link to="/managers/contract-manager" style={linkInactive}>
            Contract Manager
          </Link>
          <Link to="/managers/colour-manager" style={linkInactive}>
            Colour Manager
          </Link>
          <Link to="/managers/status-manager" style={linkInactive}>
            Status Manager
          </Link>
          {isAdmin && (
            <Link to="/managers/drawing-manager" style={linkInactive}>
              Drawing Manager
            </Link>
          )}
          <Link to="/managers/qp-manager" style={linkActive}>
            QP Manager
          </Link>
          <Link to="/managers/project-claim" style={linkInactive}>
            Project Claim!
          </Link>
          <div style={{ flex: 1 }} />
          <Link to="/projects" style={linkInactive}>
            ← Back to Main
          </Link>
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
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "8px" }}>
            Queensland (QLD) jobs — QP numbers
          </h2>
          <p style={{ margin: "0 0 20px 0", fontSize: "0.9rem", color: "#32323399", maxWidth: "640px" }}>
            Choose a year to list QLD projects that start in that year (from the project date field). Edit QP
            numbers inline; they save automatically after you pause typing or when you leave the field.
          </p>

          <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <label htmlFor="qp-year" style={{ fontSize: "0.95rem", color: MONUMENT, fontWeight: 500 }}>
              Year
            </label>
            <select
              id="qp-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                minWidth: "160px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                cursor: "pointer",
              }}
            >
              <option value="">Select year…</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => fetchProjects()}
              style={{
                padding: "10px 16px",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: WHITE,
                background: MONUMENT,
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Refresh list
            </button>
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects…</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}

          {!loading && !error && selectedYear === "" && (
            <p style={{ color: "#32323399" }}>Select a year to see QLD jobs.</p>
          )}

          {!loading && !error && selectedYear !== "" && (
            <>
              <p style={{ margin: "0 0 12px 0", fontSize: "0.9rem", color: "#32323399" }}>
                {filteredProjects.length} job{filteredProjects.length === 1 ? "" : "s"} for {selectedYear}
              </p>
              {filteredProjects.length === 0 ? (
                <p style={{ color: "#32323399" }}>No QLD jobs found for that year.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "0.95rem",
                      background: WHITE,
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#e8e8ea", textAlign: "left" }}>
                        <th
                          style={{ padding: "12px 14px", color: MONUMENT, fontWeight: 600 }}
                          aria-sort={
                            sortColumn === "suburb"
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            style={sortableThButtonStyle}
                            onClick={() => handleSortHeader("suburb")}
                          >
                            Suburb
                            {sortColumn === "suburb" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th
                          style={{ padding: "12px 14px", color: MONUMENT, fontWeight: 600 }}
                          aria-sort={
                            sortColumn === "street"
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            style={sortableThButtonStyle}
                            onClick={() => handleSortHeader("street")}
                          >
                            Street
                            {sortColumn === "street" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th
                          style={{ padding: "12px 14px", color: MONUMENT, fontWeight: 600, minWidth: "220px" }}
                          aria-sort={
                            sortColumn === "qp_number"
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                        >
                          <button
                            type="button"
                            style={sortableThButtonStyle}
                            onClick={() => handleSortHeader("qp_number")}
                          >
                            QP Number
                            {sortColumn === "qp_number" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th style={{ padding: "12px 14px", color: MONUMENT, fontWeight: 600, width: "100px" }}>
                          Open
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project) => (
                        <tr key={project.id} style={{ borderTop: `1px solid ${SECTION_GREY}` }}>
                          <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                            <span style={{ color: MONUMENT }}>{displaySuburb(project) || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                            <span style={{ color: MONUMENT }}>{displayStreet(project) || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                            <input
                              type="text"
                              aria-label={`QP number for ${rowAriaLabel(project)}`}
                              value={project.qp_number ?? ""}
                              placeholder="—"
                              onChange={(e) => handleQpChange(project.id, e.target.value)}
                              onBlur={(e) => handleQpBlur(project.id, e.target.value)}
                              style={{
                                width: "100%",
                                maxWidth: "280px",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "none",
                                fontSize: "1rem",
                                color: MONUMENT,
                                background: "#f7f7f8",
                                boxSizing: "border-box",
                              }}
                            />
                          </td>
                          <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                            <Link
                              to={projectPath(project, { view: "project-info" })}
                              style={{ color: "#2a6ebb", fontWeight: 500, textDecoration: "none" }}
                            >
                              Project
                            </Link>
                          </td>
                        </tr>
                      ))}
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
