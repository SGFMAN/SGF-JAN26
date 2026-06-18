import React, { useState, useEffect, Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import NewProject from "./NewProject_1_Address";
import NewProject2 from "./NewProject_2_ClientDetails";
import NewProject_5_PDFUpload from "./NewProject_5_PDFUpload";
import NewProject_3_ProjectCost from "./NewProject_3_ProjectCost";
import { isUserAdmin } from "../utils/auth";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import { CLASSIFICATION_OPTIONS as CLASSIFICATION_SORT_ORDER } from "../utils/classifications";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
import { UI, MENU } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
// A bit lighter version for sections
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

const API_URL = "";

const STREAM_SORT_ORDER = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Pumped On Property",
  "Henderson",
  "Creat Cash Flow",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

export default function FinishedProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [sortMode, setSortMode] = useState("suburb");
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectStep, setNewProjectStep] = useState(1);
  const [newProjectFormData, setNewProjectFormData] = useState({
    suburb: "",
    street: "",
    state: "",
    stream: "",
    deposit: "",
    customDeposit: "",
    projectCost: "",
    salesperson: "",
    clientName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    // Check admin status first so buttons show up quickly
    checkAdminStatus();
    fetchProjects();
  }, []);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Projects from API:", data);
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  const finishedFilteredProjects = useMemo(() => {
    let list = projects.filter(
      (project) =>
        (project.status === "Complete" || project.status === "Cancelled") && project.status !== "Hotlist"
    );
    if (stateFilter !== "All") {
      list = list.filter((project) => {
        const projectState = (project.state || "").toUpperCase();
        return projectState === stateFilter.toUpperCase();
      });
    }
    let filtered = searchQuery.trim()
      ? list.filter((project) => {
          const query = searchQuery.toLowerCase();
          const suburb = (project.suburb || "").toLowerCase();
          const street = (project.street || "").toLowerCase();
          const name = (project.name || "").toLowerCase();
          return suburb.includes(query) || street.includes(query) || name.includes(query);
        })
      : list;
    filtered = filtered.slice();
    filtered.sort((a, b) => {
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();

      if (sortMode === "class") {
        const classA = a.classification || "";
        const classB = b.classification || "";
        const idxA = CLASSIFICATION_SORT_ORDER.indexOf(classA);
        const idxB = CLASSIFICATION_SORT_ORDER.indexOf(classB);
        const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
        const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
        if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
        return streetA.localeCompare(streetB);
      }

      if (sortMode === "stream") {
        const streamA = a.stream || "";
        const streamB = b.stream || "";
        const idxA = STREAM_SORT_ORDER.indexOf(streamA);
        const idxB = STREAM_SORT_ORDER.indexOf(streamB);
        const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
        const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
        if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
        return streetA.localeCompare(streetB);
      }

      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      return streetA.localeCompare(streetB);
    });
    return filtered;
  }, [projects, stateFilter, searchQuery, sortMode]);

  const hasFinishedProjects = useMemo(
    () =>
      projects.some(
        (p) =>
          (p.status === "Complete" || p.status === "Cancelled") && p.status !== "Hotlist"
      ),
    [projects]
  );

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
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Finished Projects
          </h1>
        </div>
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {/* State Filter Buttons */}
          <button
            onClick={() => {
              const newFilter = "VIC";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "VIC" ? "#4D93D9" : WHITE,
              color: stateFilter === "VIC" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "VIC" ? "#4D93D9" : UI.outline}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = UI.inputBg;
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            VIC Only
          </button>
          <button
            onClick={() => {
              const newFilter = "QLD";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "QLD" ? "#D54358" : WHITE,
              color: stateFilter === "QLD" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "QLD" ? "#D54358" : UI.outline}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = UI.inputBg;
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            QLD Only
          </button>
          <button
            onClick={() => {
              const newFilter = "All";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "All" ? MONUMENT : WHITE,
              color: stateFilter === "All" ? WHITE : MONUMENT,
              border: `2px solid ${UI.outline}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = UI.inputBg;
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            All Projects
          </button>
          {isAdmin && (
            <button
              onClick={() => setIsNewProjectOpen(true)}
              style={{
                background: "#33cc33",
                color: WHITE,
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
          >
            + New Project
          </button>
          )}
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
          {/* Menu Buttons */}
          {/* Hot List - Light Blue */}
          <div style={{ background: MENU.blue, borderRadius: "10px", padding: "4px", border: `2px solid ${UI.outline}` }}>
            <Link
              to="/hotlist"
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
              Hot List
            </Link>
          </div>
          
          {/* All Projects, Design Phase, Construction Phase, Finished Projects, Cancelled, On Hold - Light Green */}
          <div style={{ background: MENU.green, borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: `2px solid ${UI.outline}` }}>
            <Link
              to="/all-projects"
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
              All Projects
            </Link>
            <Link
              to="/projects"
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
              Design Phase
            </Link>
            <Link
              to="/construction-phase"
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
              Construction Phase
            </Link>
            <Link
              to="/finished-projects"
              style={{
                background: MENU.greenActive,
                color: MENU.activeText,
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
              Finished Projects
            </Link>
            <Link
              to="/cancelled"
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
              Cancelled
            </Link>
            <Link
              to="/on-hold"
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
              On Hold
            </Link>
          </div>
          
          {/* Managers and Sales - Light Red */}
          <div style={{ background: MENU.red, borderRadius: "10px", padding: "4px", display: "flex", flexDirection: "column", gap: "4px", border: `2px solid ${UI.outline}` }}>
            <Link
              to="/managers"
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
              Managers
            </Link>
            <Link
              to="/sales"
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
              Sales
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <Link
              to="/settings"
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
              Settings
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/apply-fields"
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
              Apply Fields
            </Link>
          )}
        </div>
        {/* Section 3: Projects */}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
              Finished Projects {(() => {
                const currentProjects = projects.filter(
                  (p) =>
                    (p.status === "Complete" || p.status === "Cancelled") && p.status !== "Hotlist"
                );
                const totalCount = currentProjects.length;
                if (searchQuery.trim()) {
                  return finishedFilteredProjects.length > 0
                    ? `(${finishedFilteredProjects.length} found)`
                    : "";
                }
                if (stateFilter !== "All") {
                  return finishedFilteredProjects.length > 0
                    ? `(${finishedFilteredProjects.length} total)`
                    : "";
                }
                return totalCount > 0 ? `(${totalCount} total)` : "";
              })()}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSortMode("suburb")}
                style={{
                  background: sortMode === "suburb" ? MONUMENT : WHITE,
                  color: sortMode === "suburb" ? WHITE : MONUMENT,
                  border: `2px solid ${UI.outline}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Sort by Suburb
              </button>
              <button
                type="button"
                onClick={() => setSortMode("class")}
                style={{
                  background: sortMode === "class" ? MONUMENT : WHITE,
                  color: sortMode === "class" ? WHITE : MONUMENT,
                  border: `2px solid ${UI.outline}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Sort By Class
              </button>
              <button
                type="button"
                onClick={() => setSortMode("stream")}
                style={{
                  background: sortMode === "stream" ? MONUMENT : WHITE,
                  color: sortMode === "stream" ? WHITE : MONUMENT,
                  border: `2px solid ${UI.outline}`,
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                Sort By Stream
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div style={{ marginBottom: "20px", marginTop: 0 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: UI.textMuted,
                marginBottom: "6px",
                marginTop: 0,
                fontWeight: 500,
              }}
            >
              Search
            </label>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "420px",
                padding: "12px 16px",
                borderRadius: "8px",
                border: `2px solid ${UI.outline}`,
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {loading && <p style={{ color: UI.textMuted }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (() => {
            const finishedProjects = projects.filter((project) => (project.status === "Complete" || project.status === "Cancelled") && project.status !== "Hotlist");
            if (finishedProjects.length === 0) {
              return <p style={{ color: UI.textMuted }}>No finished projects found.</p>;
            }
            return null;
          })()}
          {!loading && !error && hasFinishedProjects && (() => {
            const filteredProjects = finishedFilteredProjects;

            if (filteredProjects.length === 0) {
              return <p style={{ color: UI.textMuted }}>No projects match your search.</p>;
            }

            return (
              <div
                className="projects-grid"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "20px",
                  alignItems: "flex-start",
                }}
              >
                {filteredProjects.map((project, index) => {
                  const suburbName = (project.suburb || "").trim();
                  const prevSuburbName = index > 0 ? (filteredProjects[index - 1]?.suburb || "").trim() : "";
                  const classificationName = (project.classification || "").trim();
                  const prevClassificationName =
                    index > 0 ? (filteredProjects[index - 1]?.classification || "").trim() : "";
                  const streamName = (project.stream || "").trim();
                  const prevStreamName = index > 0 ? (filteredProjects[index - 1]?.stream || "").trim() : "";

                  const groupKey =
                    sortMode === "suburb"
                      ? suburbName
                        ? suburbName[0].toUpperCase()
                        : ""
                      : sortMode === "class"
                      ? classificationName
                      : sortMode === "stream"
                      ? streamName
                      : "";

                  const prevGroupKey =
                    sortMode === "suburb"
                      ? prevSuburbName
                        ? prevSuburbName[0].toUpperCase()
                        : ""
                      : sortMode === "class"
                      ? prevClassificationName
                      : sortMode === "stream"
                      ? prevStreamName
                      : "";

                  const showGroupHeader = groupKey && groupKey !== prevGroupKey;
                  const groupLabel = groupKey;

                  return (
                    <Fragment key={project.id}>
                      {showGroupHeader && (
                        <div style={{ flexBasis: "100%", width: "100%", marginTop: index === 0 ? 0 : "18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              style={{
                                fontSize: "1.3rem",
                                fontWeight: 800,
                                color: MONUMENT,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {groupLabel}
                            </div>
                            <div style={{ height: "2px", background: MONUMENT, flex: 1, opacity: 0.4 }} />
                          </div>
                        </div>
                      )}
                      <ProjectRectangleCard project={project} />
                    </Fragment>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* New Project Modals */}
      <NewProject
        isOpen={isNewProjectOpen && newProjectStep === 1}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onNext={() => setNewProjectStep(2)}
      />
      <NewProject2
        isOpen={isNewProjectOpen && newProjectStep === 2}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(1)}
        onNext={() => setNewProjectStep(3)}
      />
      <NewProject_5_PDFUpload
        isOpen={isNewProjectOpen && newProjectStep === 3}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(2)}
        onNext={() => setNewProjectStep(4)}
      />
      <NewProject_3_ProjectCost
        isOpen={isNewProjectOpen && newProjectStep === 4}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
          // Refresh the projects list after creating a new project
          fetchProjects();
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(3)}
      />
    </div>
  );
}
