import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

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
  "Maple Group",
];

const CLASSIFICATION_MAP = {
  "Small Second Dwelling": { acronym: "SSD", color: "#a1a1a3" },
  "Dependant Persons Unit": { acronym: "DPU", color: "#a1a1a3" },
  "Detached Extension": { acronym: "DEX", color: "#a1a1a3" },
  "Dwelling": { acronym: "DWE", color: "#a1a1a3" },
  "Home Office / Studio": { acronym: "OFFICE", color: "#a1a1a3" },
  "Dwelling & DPU": { acronym: "D&DPU", color: "#a1a1a3" },
  "Dwelling & SSD": { acronym: "D&SSD", color: "#a1a1a3" },
  "SSD & DPU": { acronym: "SSD&DPU", color: "#a1a1a3" },
  "Dual Occ": { acronym: "DOC", color: "#a1a1a3" },
};

const STREAM_MAP = {
  "SGF - VIC": { acronym: "VIC", color: "#4D93D9" },
  "SGF - QLD": { acronym: "QLD", color: "#D54358" },
  "Dual Dwelling": { acronym: "DD", color: "#92D050" },
  "ATA": { acronym: "ATA", color: "#92D050" },
  "Pumped on Property": { acronym: "POP", color: "#92D050" },
  "Pumped On Property": { acronym: "POP", color: "#92D050" },
  "Henderson": { acronym: "HEN", color: "#92D050" },
  "Creat Cash Flow": { acronym: "CCF", color: "#92D050" },
  "Create Cash Flow": { acronym: "CCF", color: "#92D050" },
  "Maple Group": { acronym: "MAP", color: "#92D050" },
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

function isVICProject(project) {
  const state = normalizeState(project.state || project.state_code);
  if (state === "VIC" || state === "VICTORIA") return true;
  if (!state) return deriveStateFromStream(project.stream) === "VIC";
  return false;
}

function isQLDProject(project) {
  const state = normalizeState(project.state || project.state_code);
  if (state === "QLD" || state === "QUEENSLAND") return true;
  if (!state) return deriveStateFromStream(project.stream) === "QLD";
  return false;
}

function getProjectCostSafeText(project) {
  // Portal doesn't currently expose project_cost; keep hook for future parity.
  void project;
  return "";
}

export default function PortalProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stateFilter, setStateFilter] = useState(getStateFilter()); // "All" | "VIC" | "QLD"
  const [sortMode, setSortMode] = useState("suburb"); // suburb | class | stream
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchPortalProjects() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API_URL}/api/portal/projects`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch portal projects");
        }

        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Portal projects fetch error:", e);
        setError(e.message || "Failed to load portal projects");
      } finally {
        setLoading(false);
      }
    }

    fetchPortalProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    let list = Array.isArray(projects) ? projects.slice() : [];

    // State filter (VIC / QLD / All)
    if (stateFilter === "VIC") {
      list = list.filter((p) => isVICProject(p));
    } else if (stateFilter === "QLD") {
      list = list.filter((p) => isQLDProject(p));
    }

    // Search filter (suburb / street / client name)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((p) => {
        const suburb = (p.suburb || "").toLowerCase();
        const street = (p.street || "").toLowerCase();
        const clientName = (p.clientName || "").toLowerCase();
        return suburb.includes(query) || street.includes(query) || clientName.includes(query);
      });
    }

    // Sorting
    list.sort((a, b) => {
      const suburbA = (a.suburb || "").toString().toLowerCase();
      const suburbB = (b.suburb || "").toString().toLowerCase();
      const streetA = (a.street || "").toString().toLowerCase();
      const streetB = (b.street || "").toString().toLowerCase();

      if (sortMode === "class") {
        const classA = (a.classification || "").toString().toLowerCase();
        const classB = (b.classification || "").toString().toLowerCase();
        if (classA !== classB) return classA.localeCompare(classB);
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
        return streetA.localeCompare(streetB);
      }

      if (sortMode === "stream") {
        const streamA = (a.stream || "").toString();
        const streamB = (b.stream || "").toString();
        const idxA = STREAM_SORT_ORDER.indexOf(streamA);
        const idxB = STREAM_SORT_ORDER.indexOf(streamB);
        const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
        const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
        if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
        return streetA.localeCompare(streetB);
      }

      // Default: suburb
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      return streetA.localeCompare(streetB);
    });

    return list;
  }, [projects, searchQuery, stateFilter, sortMode]);

  const countText = `${filteredProjects.length} project${filteredProjects.length === 1 ? "" : "s"}`;

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
          margin: "32px auto 14px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          boxSizing: "border-box",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", left: "40px" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: WHITE,
            letterSpacing: "1px",
          }}
        >
          In Design
        </h1>

        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={() => {
              const newFilter = "VIC";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "VIC" ? "#4D93D9" : WHITE,
              color: stateFilter === "VIC" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "VIC" ? "#4D93D9" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
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
              border: `2px solid ${stateFilter === "QLD" ? "#D54358" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
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
              border: `2px solid ${MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
          >
            All Projects
          </button>
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
          padding: "0 32px",
          boxSizing: "border-box",
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
          {/* Keep sidebar shell, but only show the allowed portal navigation */}
          <div
            style={{
              background: "#CEEAB0",
              borderRadius: "10px",
              padding: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              border: "2px solid #000",
            }}
          >
            <Link
              to="/portal"
              style={{
                background: "#92D050",
                color: WHITE,
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
              In Design
            </Link>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ fontSize: "0.9rem", color: "#404049cc", fontWeight: 600, textAlign: "center" }}>
            Read-only
          </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: 0 }}>
              In Design <span style={{ color: SECTION_GREY, fontWeight: 600 }}>({countText})</span>
            </h2>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => setSortMode("suburb")}
                style={{
                  background: sortMode === "suburb" ? MONUMENT : WHITE,
                  color: sortMode === "suburb" ? WHITE : MONUMENT,
                  border: `2px solid ${MONUMENT}`,
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
                  border: `2px solid ${MONUMENT}`,
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
                  border: `2px solid ${MONUMENT}`,
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

          {/* Search */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
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
                  width: "420px",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: `2px solid ${MONUMENT}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {searchQuery.trim() && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `2px solid ${MONUMENT}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                  height: "42px",
                  width: "200px",
                  boxSizing: "border-box",
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && <p style={{ color: "#cc3333" }}>Error: {error}</p>}

          {!loading && !error && filteredProjects.length === 0 && (
            <p style={{ color: "#32323399" }}>No Design Phase projects available.</p>
          )}

          {!loading && !error && filteredProjects.length > 0 && (
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
                const suburb = (project.suburb || "").trim();
                const street = (project.street || "").trim();
                const classificationName = (project.classification || "").trim();
                const streamName = (project.stream || "").trim();

                const classificationInfo = classificationName ? CLASSIFICATION_MAP[classificationName] : null;
                const streamInfo = streamName ? STREAM_MAP[streamName] : null;

                const groupKey =
                  sortMode === "suburb"
                    ? (suburb ? suburb[0].toUpperCase() : "")
                    : sortMode === "class"
                      ? classificationName
                      : sortMode === "stream"
                        ? streamName
                        : "";

                const prevProject = filteredProjects[index - 1];
                const prevSuburb = prevProject?.suburb ? prevProject.suburb.trim() : "";
                const prevClassification = prevProject?.classification ? prevProject.classification.trim() : "";
                const prevStream = prevProject?.stream ? prevProject.stream.trim() : "";

                const prevGroupKey =
                  sortMode === "suburb"
                    ? (prevSuburb ? prevSuburb[0].toUpperCase() : "")
                    : sortMode === "class"
                      ? prevClassification
                      : sortMode === "stream"
                        ? prevStream
                        : "";

                const showGroupHeader = groupKey && groupKey !== prevGroupKey;

                return (
                  <React.Fragment key={project.id}>
                    {showGroupHeader && (
                      <div style={{ flexBasis: "100%", width: "100%", marginTop: "18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div
                            style={{
                              fontSize: "1.3rem",
                              fontWeight: 800,
                              color: MONUMENT,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {groupKey}
                          </div>
                          <div style={{ height: "2px", background: MONUMENT, flex: 1, opacity: 0.4 }} />
                        </div>
                      </div>
                    )}

                    <Link
                      to={`/portal/projects/${project.id}`}
                      style={{
                        textDecoration: "none",
                        display: "block",
                      }}
                    >
                      <div
                        style={{
                          background: MONUMENT,
                          borderRadius: "8px",
                          width: "200px",
                          height: "100px",
                          color: SECTION_GREY,
                          cursor: "pointer",
                          transition: "opacity 0.2s",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          overflow: "hidden",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        {/* Stream Acronym - Left Bottom */}
                        {streamInfo && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              left: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              color: streamInfo.color,
                              zIndex: 5,
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            {streamInfo.acronym}
                          </div>
                        )}

                        {/* Classification Acronym - Right Bottom */}
                        {classificationInfo && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: "8px",
                              right: "8px",
                              fontSize: "0.85rem",
                              fontWeight: 700,
                              color: classificationInfo.color,
                              zIndex: 5,
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            {classificationInfo.acronym}
                          </div>
                        )}

                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "1.1rem",
                            textAlign: "center",
                            marginBottom: "4px",
                            width: "100%",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            flex: 1,
                            flexDirection: "column",
                            gap: "4px",
                            position: "relative",
                            zIndex: "auto",
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: "1.1rem", color: WHITE }}>
                            {(suburb || "UNKNOWN SUBURB").toUpperCase()}
                          </div>
                          <div style={{ fontSize: "0.95rem", color: WHITE, fontWeight: 400 }}>
                            {street || "No address"}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: "0.9rem",
                            color: "#323233cc",
                            textAlign: "center",
                            position: "relative",
                          }}
                        >
                          Status: Design Phase
                          {getProjectCostSafeText(project)}
                        </div>
                      </div>
                    </Link>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

