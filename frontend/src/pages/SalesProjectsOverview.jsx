import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import ProjectsOverviewColumns from "../components/ProjectsOverviewColumns";
import { computeProjectsOverview } from "../utils/projectsOverviewCompute";
import {
  buildProjectsOverviewWorkbookArrayBuffer,
  ensureXlsxExtension,
  saveProjectsOverviewExcelFile,
  sanitizeExcelFileName,
} from "../utils/projectsOverviewExcelExport";
import { UI, MENU } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

function defaultExportFileName() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `Projects-Overview-${yyyy}-${mm}-${dd}`;
}

export default function SalesProjectsOverview() {
  const logo = useAppLogo();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("summary"); // "summary" | "list"
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState(() => defaultExportFileName());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!exportModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [exportModalOpen]);

  async function loadProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error loading projects overview:", err);
    } finally {
      setLoading(false);
    }
  }

  const overview = useMemo(() => computeProjectsOverview(projects), [projects]);
  const isListView = viewMode === "list";

  function openExportModal() {
    setExportFileName(defaultExportFileName());
    setExportModalOpen(true);
  }

  function closeExportModal() {
    if (exporting) return;
    setExportModalOpen(false);
  }

  async function handleConfirmExport() {
    const name = sanitizeExcelFileName(exportFileName);
    if (!name) {
      alert("Please enter a file name.");
      return;
    }

    setExporting(true);
    try {
      const buffer = buildProjectsOverviewWorkbookArrayBuffer(overview);
      const result = await saveProjectsOverviewExcelFile(buffer, name);
      if (result === "cancelled") return;
      setExportModalOpen(false);
    } catch (err) {
      console.error("Projects overview Excel export failed:", err);
      alert(err.message || "Failed to export Excel file.");
    } finally {
      setExporting(false);
    }
  }

  const menuButtonStyle = {
    width: "100%",
    background: "transparent",
    color: UI.textSecondary,
    border: "none",
    borderRadius: "10px",
    padding: "8px 8px",
    fontSize: "0.95rem",
    fontWeight: 500,
    textAlign: "center",
    letterSpacing: "0.5px",
    cursor: "pointer",
    transition: "background 0.18s, color 0.15s",
    lineHeight: "1.4",
    display: "block",
  };

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
        <h1
          style={{
            margin: 0,
            fontSize: "2.4rem",
            fontWeight: 700,
            color: PAGE_TEXT,
            letterSpacing: "1px",
          }}
        >
          Projects Overview
        </h1>
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
          <div style={{ background: "#e8e8ea", borderRadius: "10px", padding: "4px", border: `1px solid ${UI.outline}` }}>
            <button
              type="button"
              onClick={() => setViewMode((prev) => (prev === "summary" ? "list" : "summary"))}
              aria-pressed={isListView}
              title={isListView ? "Switch to stage totals" : "Switch to project list"}
              style={menuButtonStyle}
            >
              {isListView ? "Summary" : "Project list"}
            </button>
          </div>

          {isListView ? (
            <div style={{ background: "#e8e8ea", borderRadius: "10px", padding: "4px", border: `1px solid ${UI.outline}` }}>
              <button
                type="button"
                onClick={openExportModal}
                disabled={loading || Boolean(error)}
                style={{
                  ...menuButtonStyle,
                  cursor: loading || error ? "not-allowed" : "pointer",
                  opacity: loading || error ? 0.65 : 1,
                }}
              >
                Export as Excel
              </button>
            </div>
          ) : null}

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
                ...menuButtonStyle,
                textDecoration: "none",
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
            <ProjectsOverviewColumns overview={overview} viewMode={viewMode} />
          )}
        </div>
      </div>

      {exportModalOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={closeExportModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-excel-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: WHITE,
              padding: "24px",
              borderRadius: "10px",
              width: "min(440px, 95%)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              boxSizing: "border-box",
            }}
          >
            <h2
              id="export-excel-title"
              style={{ margin: "0 0 8px 0", fontSize: "1.35rem", color: MONUMENT }}
            >
              Export as Excel
            </h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.45 }}>
              Enter a file name, then choose where to save the VIC and QLD project lists.
            </p>

            <label
              htmlFor="export-excel-filename"
              style={{
                display: "block",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: UI.textMuted,
                marginBottom: "6px",
              }}
            >
              File name
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <input
                id="export-excel-filename"
                type="text"
                value={exportFileName}
                onChange={(e) => setExportFileName(e.target.value)}
                disabled={exporting}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeExportModal();
                  if (e.key === "Enter") void handleConfirmExport();
                }}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${UI.outline}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
              <span style={{ fontSize: "0.95rem", color: UI.textMuted, flexShrink: 0 }}>.xlsx</span>
            </div>

            <p style={{ margin: "0 0 18px 0", fontSize: "0.82rem", color: UI.textMuted }}>
              Will save as: <strong>{ensureXlsxExtension(exportFileName)}</strong>
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={closeExportModal}
                disabled={exporting}
                style={{
                  padding: "10px 18px",
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: `1px solid ${UI.outline}`,
                  borderRadius: "8px",
                  cursor: exporting ? "not-allowed" : "pointer",
                  opacity: exporting ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmExport()}
                disabled={exporting}
                style={{
                  padding: "10px 18px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: PAGE_TEXT,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: exporting ? "wait" : "pointer",
                  opacity: exporting ? 0.85 : 1,
                }}
              >
                {exporting ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
