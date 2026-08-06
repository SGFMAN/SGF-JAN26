import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";
import ProjectsOverviewColumns from "../components/ProjectsOverviewColumns";
import { computeProjectsOverview } from "../utils/projectsOverviewCompute";
import { captureElementToPaginatedPdfBlob } from "../utils/captureElementPdf";
import {
  buildProjectsOverviewWorkbookArrayBuffer,
  ensurePdfExtension,
  ensureXlsxExtension,
  saveProjectsOverviewExcelFile,
  saveProjectsOverviewPdfFile,
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
  const pdfCaptureRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("summary"); // "summary" | "list"
  const [exportKind, setExportKind] = useState(null); // "excel" | "pdf" | null
  const [exportFileName, setExportFileName] = useState(() => defaultExportFileName());
  const [exporting, setExporting] = useState(false);
  const [pdfCaptureReady, setPdfCaptureReady] = useState(false);

  const exportModalOpen = exportKind != null;

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
  const isPdfExport = exportKind === "pdf";

  function openExportModal(kind) {
    setExportFileName(defaultExportFileName());
    setExportKind(kind);
  }

  function closeExportModal() {
    if (exporting) return;
    setExportKind(null);
  }

  async function handleConfirmExport() {
    const name = sanitizeExcelFileName(exportFileName);
    if (!name) {
      alert("Please enter a file name.");
      return;
    }

    setExporting(true);
    try {
      if (exportKind === "pdf") {
        setPdfCaptureReady(true);
        let el = null;
        for (let i = 0; i < 40; i++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          el = pdfCaptureRef.current;
          if (el) break;
        }
        if (!el) {
          throw new Error("Could not render PDF content.");
        }
        const pdfBlob = await captureElementToPaginatedPdfBlob(el, {
          orientation: "portrait",
          marginMm: 12,
        });
        const result = await saveProjectsOverviewPdfFile(pdfBlob, name);
        if (result === "cancelled") return;
        setExportKind(null);
        return;
      }

      const buffer = buildProjectsOverviewWorkbookArrayBuffer(overview);
      const result = await saveProjectsOverviewExcelFile(buffer, name);
      if (result === "cancelled") return;
      setExportKind(null);
    } catch (err) {
      console.error(
        exportKind === "pdf"
          ? "Projects overview PDF save failed:"
          : "Projects overview Excel export failed:",
        err
      );
      alert(err.message || (exportKind === "pdf" ? "Failed to save PDF." : "Failed to export Excel file."));
    } finally {
      setPdfCaptureReady(false);
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
                onClick={() => openExportModal("excel")}
                disabled={loading || Boolean(error)}
                style={{
                  ...menuButtonStyle,
                  cursor: loading || error ? "not-allowed" : "pointer",
                  opacity: loading || error ? 0.65 : 1,
                }}
              >
                Export as Excel
              </button>
              <button
                type="button"
                onClick={() => openExportModal("pdf")}
                disabled={loading || Boolean(error)}
                style={{
                  ...menuButtonStyle,
                  cursor: loading || error ? "not-allowed" : "pointer",
                  opacity: loading || error ? 0.65 : 1,
                }}
              >
                Save as PDF
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

      {pdfCaptureReady ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-12000px",
            top: 0,
            width: "794px",
            zIndex: -1,
            pointerEvents: "none",
          }}
        >
          <div
            ref={pdfCaptureRef}
            style={{
              background: SECTION_GREY,
              padding: "28px 32px",
              width: "794px",
              boxSizing: "border-box",
            }}
          >
            <h2
              style={{
                margin: "0 0 16px 0",
                fontSize: "1.6rem",
                fontWeight: 700,
                color: MONUMENT,
                letterSpacing: "0.5px",
              }}
            >
              PROJECTS OVERVIEW
            </h2>
            <ProjectsOverviewColumns overview={overview} viewMode="list" />
          </div>
        </div>
      ) : null}

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
            aria-labelledby="export-file-title"
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
              id="export-file-title"
              style={{ margin: "0 0 8px 0", fontSize: "1.35rem", color: MONUMENT }}
            >
              {isPdfExport ? "Save as PDF" : "Export as Excel"}
            </h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: UI.textMuted, lineHeight: 1.45 }}>
              {isPdfExport
                ? "Enter a file name, then choose where to save the project list PDF."
                : "Enter a file name, then choose where to save the VIC and QLD project lists."}
            </p>

            <label
              htmlFor="export-file-filename"
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
                id="export-file-filename"
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
              <span style={{ fontSize: "0.95rem", color: UI.textMuted, flexShrink: 0 }}>
                {isPdfExport ? ".pdf" : ".xlsx"}
              </span>
            </div>

            <p style={{ margin: "0 0 18px 0", fontSize: "0.82rem", color: UI.textMuted }}>
              Will save as:{" "}
              <strong>
                {isPdfExport
                  ? ensurePdfExtension(exportFileName)
                  : ensureXlsxExtension(exportFileName)}
              </strong>
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
